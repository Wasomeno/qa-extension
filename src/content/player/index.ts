import { MessageType, ExtensionMessage } from '@/types/messages';
import { TestBlueprint, TestStep } from '@/types/recording';
import { Executor } from './executor';

interface PlaybackState {
  isActive: boolean;
  blueprint: TestBlueprint | null;
  currentStepIndex: number;
  status: 'idle' | 'playing' | 'paused' | 'completed' | 'failed';
  error?: string;
  variables?: Record<string, string>;
  playbackTabId?: number;
}

class PlayerEngine {
  private state: PlaybackState = {
    isActive: false,
    blueprint: null,
    currentStepIndex: 0,
    status: 'idle'
  };

  constructor() {
    this.setupListeners();
    this.checkAutoResume();
  }

  private setupListeners() {
    chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
      switch (message.type) {
        case MessageType.START_PLAYBACK:
          this.startPlayback(
            message.data.blueprint,
            message.data.stepIndex || 0,
            message.data.variables,
            message.data.playbackTabId
          );
          sendResponse({ success: true });
          break;
        case MessageType.STOP_PLAYBACK:
          this.stopPlayback();
          sendResponse({ success: true });
          break;
        case MessageType.PING:
          sendResponse({ success: true, data: 'PONG_PLAYER' });
          break;
      }
      return true;
    });
  }

  private async checkAutoResume() {
    try {
      const result = await chrome.storage.local.get(['activePlayback']);
      if (result.activePlayback && result.activePlayback.isActive) {
        // Validate that this is the correct playback tab
        const playbackTabId = result.activePlayback.playbackTabId;
        if (playbackTabId) {
          // Ask background for current tab ID
          const response = await new Promise<{ success: boolean; data?: { tabId?: number } }>(resolve => {
            chrome.runtime.sendMessage({ type: MessageType.GET_TAB_ID }, resolve);
          });
          const currentTabId = response?.data?.tabId;
          if (currentTabId !== playbackTabId) {
            // This is not the playback tab - skip auto-resume
            return;
          }
        }
        
        this.state = result.activePlayback;
        
        // If the page was just reloaded (e.g. after navigate), continue from current index
        if (this.state.status === 'playing') {
          this.runNextStep();
        }
      }
    } catch (error) {
    }
  }

  private async startPlayback(
    blueprint: TestBlueprint,
    stepIndex: number = 0,
    variables: Record<string, string> = {},
    playbackTabId?: number
  ) {
    if (this.state.isActive && 
        this.state.status === 'playing' && 
        this.state.blueprint?.id === blueprint.id &&
        this.state.currentStepIndex === stepIndex) {
      console.log('[Player] Playback already active at this step, skipping re-start');
      return;
    }

    this.state = {
      isActive: true,
      blueprint,
      currentStepIndex: stepIndex,
      status: 'playing',
      variables,
      playbackTabId
    };
    await this.saveState();
    this.runNextStep();
  }

  private async stopPlayback(status: PlaybackState['status'] = 'idle', error?: string) {
    this.state.isActive = false;
    this.state.status = status;
    this.state.error = error;
    await this.saveState();
    
    // Notify background
    chrome.runtime.sendMessage({
      type: MessageType.PLAYBACK_STATUS_UPDATE,
      data: { ...this.state }
    });
  }

  private async saveState() {
    await chrome.storage.local.set({ activePlayback: this.state });
  }

  private resolveParameters(text: string | undefined): string | undefined {
    if (!text || !this.state.variables) return text;
    
    let resolved = text;
    for (const [key, value] of Object.entries(this.state.variables)) {
      resolved = resolved.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }
    return resolved;
  }

  private async runNextStep(retryCount = 0) {
    if (!this.state.isActive || !this.state.blueprint) return;

    if (this.state.currentStepIndex >= this.state.blueprint.steps.length) {
      this.stopPlayback('completed');
      return;
    }

    const originalStep = this.state.blueprint.steps[this.state.currentStepIndex];
    // Resolve parameters in a clone to avoid mutating the original blueprint in state
    const step = { 
      ...originalStep, 
      value: this.resolveParameters(originalStep.value),
      expectedValue: this.resolveParameters(originalStep.expectedValue)
    };
    
    try {
      console.log(`[Player] Executing step ${this.state.currentStepIndex + 1}/${this.state.blueprint.steps.length}: ${step.action} - ${step.description}`);
      
      // Notify background about current step starting
      chrome.runtime.sendMessage({
        type: MessageType.PLAYBACK_STATUS_UPDATE,
        data: { 
          ...this.state,
          stepStatus: 'started',
          stepDescription: step.description,
          expectedValue: step.expectedValue || step.value
        }
      });

      // Special handling for navigation: save state BEFORE navigating
      if (step.action === 'navigate') {
        console.log(`[Player] Navigating to: ${step.value}`);
        this.state.currentStepIndex++;
        await this.saveState();
        const actualUrl = await Executor.executeStep(step);
        
        // Notify background about current step completion
        chrome.runtime.sendMessage({
          type: MessageType.PLAYBACK_STATUS_UPDATE,
          data: { 
            ...this.state,
            stepStatus: 'completed',
            stepDescription: step.description,
            actualValue: actualUrl,
            expectedValue: step.expectedValue || step.value
          }
        });
        
        // If navigation was skipped (already on page), continue immediately
        // Otherwise, wait for page reload and checkAutoResume will continue
        if (actualUrl === window.location.href || actualUrl === undefined) {
          console.log(`[Player] Navigation skipped, continuing to next step...`);
          setTimeout(() => this.runNextStep(), 500);
        }
        return;
      }

      console.log(`[Player] Waiting for page to settle...`);
      await Executor.waitForPageSettled();

      console.log(`[Player] Resolving and executing step...`);
      const actualValue = await Executor.executeStep(step);
      console.log(`[Player] Step successful. Actual value: ${actualValue}`);

      this.state.currentStepIndex++;
      await this.saveState();
      
      // Notify background about current step completion
      chrome.runtime.sendMessage({
        type: MessageType.PLAYBACK_STATUS_UPDATE,
        data: { 
          ...this.state,
          stepStatus: 'completed',
          stepDescription: step.description,
          actualValue,
          expectedValue: step.expectedValue || step.value
        }
      });
      
      // Wait for any UI updates or network requests triggered by the action
      await Executor.waitForPageSettled(5000, 300);

      // Brief delay between steps to allow for visual confirmation and animations
      setTimeout(() => this.runNextStep(), 1000);
      
    } catch (error: any) {
      console.error(`[Player] Step failed: ${error.message}`);
      
      if (retryCount < 2) {
        console.log(`[Player] Retrying step ${this.state.currentStepIndex + 1} (Attempt ${retryCount + 2})...`);
        setTimeout(() => this.runNextStep(retryCount + 1), 2000);
      } else {
        this.stopPlayback('failed', error.message);
      }
    }
  }
}

// Initialize the engine
if (!(window as any).__QA_PLAYER_INITIALIZED__) {
  new PlayerEngine();
  (window as any).__QA_PLAYER_INITIALIZED__ = true;
}
