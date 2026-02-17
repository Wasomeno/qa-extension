import { MessageType, ExtensionMessage } from '@/types/messages';
import { TestBlueprint, TestStep } from '@/types/recording';
import { Executor } from './executor';

interface PlaybackState {
  isActive: boolean;
  blueprint: TestBlueprint | null;
  currentStepIndex: number;
  status: 'idle' | 'playing' | 'paused' | 'completed' | 'failed';
  error?: string;
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
          this.startPlayback(message.data.blueprint, message.data.stepIndex || 0);
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
        this.state = result.activePlayback;
        
        // If the page was just reloaded (e.g. after navigate), continue from current index
        if (this.state.status === 'playing') {
          this.runNextStep();
        }
      }
    } catch (error) {
    }
  }

  private async startPlayback(blueprint: TestBlueprint, stepIndex: number = 0) {
    this.state = {
      isActive: true,
      blueprint,
      currentStepIndex: stepIndex,
      status: 'playing'
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

  private async runNextStep() {
    if (!this.state.isActive || !this.state.blueprint) return;

    if (this.state.currentStepIndex >= this.state.blueprint.steps.length) {
      this.stopPlayback('completed');
      return;
    }

    const step = this.state.blueprint.steps[this.state.currentStepIndex];
    
    try {
      // Notify background about current step starting
      chrome.runtime.sendMessage({
        type: MessageType.PLAYBACK_STATUS_UPDATE,
        data: { 
          ...this.state,
          stepStatus: 'started',
          stepDescription: step.description
        }
      });

      // Special handling for navigation: save state BEFORE navigating
      if (step.action === 'navigate') {
        this.state.currentStepIndex++;
        await this.saveState();
        await Executor.executeStep(step);
        return;
      }

      await Executor.executeStep(step);

      this.state.currentStepIndex++;
      await this.saveState();
      
      // Notify background about current step completion
      chrome.runtime.sendMessage({
        type: MessageType.PLAYBACK_STATUS_UPDATE,
        data: { 
          ...this.state,
          stepStatus: 'completed',
          stepDescription: step.description
        }
      });
      
      // Brief delay between steps
      setTimeout(() => this.runNextStep(), 1000);
      
    } catch (error: any) {
      this.stopPlayback('failed', error.message);
    }
  }
}

// Initialize the engine
if (!(window as any).__QA_PLAYER_INITIALIZED__) {
  new PlayerEngine();
  (window as any).__QA_PLAYER_INITIALIZED__ = true;
}
