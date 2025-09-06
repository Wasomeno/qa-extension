export interface ShadowDOMConfig {
  hostId: string;
  shadowMode: 'open' | 'closed';
  css?: string;
  isolateEvents?: boolean;
  applyTokensFromDocument?: boolean;
}

export interface ShadowDOMInstance {
  host: HTMLElement;
  root: ShadowRoot;
  container: HTMLElement;
  destroy: () => void;
}

export class ShadowDOMManager {
  private instances = new Map<string, ShadowDOMInstance>();

  /**
   * Creates a Shadow DOM instance with CSS injection
   */
  create(config: ShadowDOMConfig): ShadowDOMInstance {
    const {
      hostId,
      shadowMode,
      css,
      isolateEvents = true,
      applyTokensFromDocument = true,
    } = config;

    // Check if instance already exists
    if (this.instances.has(hostId)) {
      throw new Error(`Shadow DOM instance with id "${hostId}" already exists`);
    }

    // Create shadow host
    const host = document.createElement('div');
    host.id = hostId;
    host.style.cssText = 'position: fixed; z-index: 999999; pointer-events: none;';

    // Attach shadow root
    const root = host.attachShadow({ mode: shadowMode });

    // Optionally copy design token CSS variables from the document root to the host
    if (applyTokensFromDocument) {
      try {
        const tokenNames = [
          '--background',
          '--foreground',
          '--card',
          '--card-foreground',
          '--popover',
          '--popover-foreground',
          '--primary',
          '--primary-foreground',
          '--secondary',
          '--secondary-foreground',
          '--muted',
          '--muted-foreground',
          '--accent',
          '--accent-foreground',
          '--destructive',
          '--destructive-foreground',
          '--border',
          '--input',
          '--ring',
          '--radius',
          '--sidebar-background',
          '--sidebar-foreground',
          '--sidebar-primary',
          '--sidebar-primary-foreground',
          '--sidebar-accent',
          '--sidebar-accent-foreground',
          '--sidebar-border',
          '--sidebar-ring',
        ];
        const docStyle = getComputedStyle(document.documentElement);
        for (const name of tokenNames) {
          const value = docStyle.getPropertyValue(name).trim();
          if (value) host.style.setProperty(name, value);
        }
      } catch {
        // no-op; fallback to defaults in CSS
      }
    }

    // Inject CSS if provided
    if (css) {
      this.injectCSS(root, css);
    }

    // Create container for React
    const container = document.createElement('div');
    container.style.cssText = 'pointer-events: auto;';
    root.appendChild(container);

    // Create instance
    const instance: ShadowDOMInstance = {
      host,
      root,
      container,
      destroy: () => this.destroy(hostId)
    };

    // Store instance
    this.instances.set(hostId, instance);

    // Append to DOM
    document.body.appendChild(host);

    return instance;
  }

  /**
   * Injects CSS into shadow root
   */
  private injectCSS(shadowRoot: ShadowRoot, css: string): void {
    const style = document.createElement('style');
    style.textContent = css;
    shadowRoot.appendChild(style);
  }

  /**
   * Destroys a Shadow DOM instance
   */
  destroy(hostId: string): void {
    const instance = this.instances.get(hostId);
    if (instance) {
      instance.host.remove();
      this.instances.delete(hostId);
    }
  }

  /**
   * Gets an existing Shadow DOM instance
   */
  getInstance(hostId: string): ShadowDOMInstance | undefined {
    return this.instances.get(hostId);
  }

  /**
   * Destroys all Shadow DOM instances
   */
  destroyAll(): void {
    for (const [hostId] of this.instances) {
      this.destroy(hostId);
    }
  }
}

// Singleton instance
export const shadowDOMManager = new ShadowDOMManager();
