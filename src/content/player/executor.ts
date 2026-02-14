import { TestStep } from '@/types/recording';
import { 
  waitForElement, 
  simulateClick, 
  simulateInput, 
  highlightElement,
  scrollToElement
} from '@/utils/dom';

export class Executor {
  private static readonly DEFAULT_TIMEOUT = 10000;

  public static async executeStep(step: TestStep): Promise<void> {
    console.log(`[Player] Executing step: ${step.description}`, step);

    switch (step.action) {
      case 'navigate':
        await this.handleNavigate(step);
        break;
      case 'click':
        await this.handleClick(step);
        break;
      case 'type':
        await this.handleType(step);
        break;
      case 'select':
        await this.handleSelect(step);
        break;
      case 'assert':
        await this.handleAssert(step);
        break;
      default:
        throw new Error(`Unsupported action: ${step.action}`);
    }
  }

  private static async handleClick(step: TestStep): Promise<void> {
    const element = await waitForElement(step.selector, this.DEFAULT_TIMEOUT);
    if (!element) {
      throw new Error(`Click failed: Element not found for selector "${step.selector}" after ${this.DEFAULT_TIMEOUT}ms`);
    }

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' }); // Blue for playback
    
    // Brief delay to allow the user to see what's being clicked
    await new Promise(resolve => setTimeout(resolve, 500));
    
    simulateClick(element);
  }

  private static async handleType(step: TestStep): Promise<void> {
    const element = await waitForElement(step.selector, this.DEFAULT_TIMEOUT);
    if (!element) {
      throw new Error(`Type failed: Element not found for selector "${step.selector}" after ${this.DEFAULT_TIMEOUT}ms`);
    }

    if (step.value === undefined) {
      throw new Error(`Type failed: Missing value for 'type' action in step: ${step.description}`);
    }

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    simulateInput(element, step.value);
  }

  private static async handleNavigate(step: TestStep): Promise<void> {
    if (!step.value) {
      throw new Error(`Missing URL for 'navigate' action`);
    }

    console.log(`[Player] Navigating to: ${step.value}`);
    window.location.href = step.value;
  }

  private static async handleSelect(step: TestStep): Promise<void> {
    const element = await waitForElement(step.selector, this.DEFAULT_TIMEOUT);
    if (!element) {
      throw new Error(`Select failed: Element not found for selector "${step.selector}" after ${this.DEFAULT_TIMEOUT}ms`);
    }

    if (!(element instanceof HTMLSelectElement)) {
      throw new Error(`Select failed: Element is not a select dropdown: ${step.selector}`);
    }

    if (step.value === undefined) {
      throw new Error(`Select failed: Missing value for 'select' action`);
    }

    scrollToElement(element);
    highlightElement(element, { color: '#4dabf7' });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    element.value = step.value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private static async handleAssert(step: TestStep): Promise<void> {
    // Simple assertion: check if element exists and is visible
    const element = await waitForElement(step.selector, this.DEFAULT_TIMEOUT);
    if (!element) {
      throw new Error(`Assertion failed: Element not found for selector "${step.selector}" after ${this.DEFAULT_TIMEOUT}ms`);
    }

    scrollToElement(element);
    highlightElement(element, { color: '#51cf66', duration: 1000 }); // Green for success
    
    console.log(`[Player] Assertion passed for: ${step.selector}`);
  }
}
