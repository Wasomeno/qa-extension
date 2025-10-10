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

    // Ensure default tokens are set inline on host so page variables cannot override them via inheritance
    const setDefaultDesignTokens = () => {
      const defaults: Record<string, string> = {
        // shadcn/ui tokens (HSL triplets)
        '--background': '0 0% 100%',
        '--foreground': '222.2 84% 4.9%',
        '--card': '0 0% 100%',
        '--card-foreground': '222.2 84% 4.9%',
        '--popover': '0 0% 100%',
        '--popover-foreground': '222.2 84% 4.9%',
        '--primary': '221.2 83.2% 53.3%',
        '--primary-foreground': '210 40% 98%',
        '--secondary': '210 40% 96%',
        '--secondary-foreground': '222.2 84% 4.9%',
        '--muted': '210 40% 96%',
        '--muted-foreground': '215.4 16.3% 46.9%',
        '--accent': '210 40% 96%',
        '--accent-foreground': '222.2 84% 4.9%',
        '--destructive': '0 84.2% 60.2%',
        '--destructive-foreground': '210 40% 98%',
        '--border': '214.3 31.8% 91.4%',
        '--input': '214.3 31.8% 91.4%',
        '--ring': '221.2 83.2% 53.3%',
        '--radius': '0.5rem',
        '--sidebar-background': '0 0% 98%',
        '--sidebar-foreground': '240 5.3% 26.1%',
        '--sidebar-primary': '240 5.9% 10%',
        '--sidebar-primary-foreground': '0 0% 98%',
        '--sidebar-accent': '240 4.8% 95.9%',
        '--sidebar-accent-foreground': '240 5.9% 10%',
        '--sidebar-border': '220 13% 91%',
        '--sidebar-ring': '217.2 91.2% 59.8%',
        // QA-specific tokens
        '--qa-fg': '#0b1220',
        '--qa-fg-muted': 'rgba(11, 18, 32, 0.65)',
        '--qa-border': 'rgba(11, 18, 32, 0.12)',
        '--qa-glass': 'rgba(255, 255, 255, 0.15)',
        '--qa-glass-hover': 'rgba(255, 255, 255, 0.25)',
        '--qa-shadow': '0 8px 32px rgba(0, 0, 0, 0.12)'
      };
      for (const [k, v] of Object.entries(defaults)) {
        try { host.style.setProperty(k, v); } catch {}
      }
      // Establish base inherited typography inline so it cannot be overridden from page
      try {
        host.style.setProperty('font-family', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
        host.style.setProperty('font-size', '14px');
        host.style.setProperty('line-height', '1.4');
        host.style.setProperty('color', 'var(--qa-fg)');
      } catch {}
    };
    setDefaultDesignTokens();

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
