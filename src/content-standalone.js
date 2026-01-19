/**
 * Standalone Content Script - No external dependencies
 */

class StandaloneContentScript {
  constructor() {
    this.isInitialized = false;
    this.floatingTriggerContainer = null;
    // Drag functionality properties
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.currentPosition = {
      x: window.innerWidth - 80,
      y: window.innerHeight / 2,
    };

    this.initialize();
  }

  async initialize() {
    if (this.isInitialized) return;

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
      return;
    }

    try {
      this.isInitialized = true;
      this.injectStyles();
      this.injectFloatingTrigger();
    } catch (error) {
      console.error('Failed to initialize standalone content script:', error);
    }
  }

  /**
   * Inject floating trigger into the page
   */
  injectFloatingTrigger() {
    // Don't inject on extension pages or special browser pages
    if (
      window.location.href.startsWith('chrome://') ||
      window.location.href.startsWith('chrome-extension://') ||
      window.location.href.startsWith('edge://') ||
      window.location.href.startsWith('moz-extension://')
    ) {
      return;
    }

    // Check if already injected
    if (this.floatingTriggerContainer) {
      return;
    }

    try {
      // Create container
      this.floatingTriggerContainer = document.createElement('div');
      this.floatingTriggerContainer.id = 'qa-floating-trigger-root';

      // Create the trigger button
      const trigger = document.createElement('div');
      trigger.className = 'qa-floating-trigger-btn';
      trigger.textContent = 'QA';

      // Apply modern glassmorphism styles
      Object.assign(trigger.style, {
        position: 'fixed',
        left: this.currentPosition.x + 'px',
        top: this.currentPosition.y + 'px',
        transform: 'translate(-50%, -50%)',
        width: '60px',
        height: '60px',
        // Modern glassmorphism background
        background: 'rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        // Enhanced border with transparency
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: '2147483647',
        // Apple-inspired liquid glass shadow
        boxShadow: `
          0 8px 32px rgba(31, 38, 135, 0.2), 
          inset 0 4px 20px rgba(255, 255, 255, 0.3),
          0 0 0 1px rgba(255, 255, 255, 0.2)
        `,
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: '20px',
        fontWeight: '600',
        pointerEvents: 'auto',
        transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        // Additional glass effect
        filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))',
      });

      // Add click handler (only if not dragging)
      let mouseDownTime = 0;
      trigger.addEventListener('mousedown', () => {
        mouseDownTime = Date.now();
      });

      trigger.addEventListener('click', e => {
        // Only show menu if it was a quick click (not a drag)
        if (Date.now() - mouseDownTime > 200 || this.isDragging) return;

        e.stopPropagation();

        this.showFloatingMenu(trigger);
      });

      // Add drag functionality
      this.setupDragHandlers(trigger);

      // Add enhanced glassmorphism hover effects
      trigger.addEventListener('mouseenter', () => {
        if (!this.isDragging) {
          trigger.style.transform = 'translate(-50%, -50%) scale(1.08)';
          trigger.style.background = 'rgba(255, 255, 255, 0.25)';
          trigger.style.backdropFilter = 'blur(40px) saturate(200%)';
          trigger.style.WebkitBackdropFilter = 'blur(40px) saturate(200%)';
          trigger.style.border = '1px solid rgba(255, 255, 255, 0.9)';
          trigger.style.boxShadow = `
            0 16px 48px rgba(31, 38, 135, 0.3), 
            inset 0 6px 24px rgba(255, 255, 255, 0.4),
            0 0 0 2px rgba(255, 255, 255, 0.3),
            0 8px 32px rgba(255, 255, 255, 0.2)
          `;
          trigger.style.filter =
            'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15)) brightness(110%)';
          trigger.style.color = 'rgba(255, 255, 255, 1)';
        }
      });

      trigger.addEventListener('mouseleave', () => {
        if (!this.isDragging) {
          trigger.style.transform = 'translate(-50%, -50%) scale(1)';
          trigger.style.background = 'rgba(255, 255, 255, 0.15)';
          trigger.style.backdropFilter = 'blur(30px) saturate(180%)';
          trigger.style.WebkitBackdropFilter = 'blur(30px) saturate(180%)';
          trigger.style.border = '1px solid rgba(255, 255, 255, 0.8)';
          trigger.style.boxShadow = `
            0 8px 32px rgba(31, 38, 135, 0.2), 
            inset 0 4px 20px rgba(255, 255, 255, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.2)
          `;
          trigger.style.filter = 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))';
          trigger.style.color = 'rgba(255, 255, 255, 0.9)';
        }
      });

      // Add to page
      this.floatingTriggerContainer.appendChild(trigger);
      document.body.appendChild(this.floatingTriggerContainer);
    } catch (error) {
      console.error('❌ Failed to inject floating trigger:', error);
    }
  }

  /**
   * Setup drag handlers for the floating trigger
   */
  setupDragHandlers(trigger) {
    // Mouse down - start potential drag
    trigger.addEventListener('mousedown', e => {
      if (e.button === 0) {
        // Left mouse button only
        this.isDragging = false; // Will be set to true on first mousemove
        trigger.style.cursor = 'grabbing';
        trigger.style.transition = 'none';
        trigger.style.transform = 'translate(-50%, -50%) scale(0.95)';

        this.dragOffset.x = e.clientX - this.currentPosition.x;
        this.dragOffset.y = e.clientY - this.currentPosition.y;

        e.preventDefault();
      }
    });

    // Mouse move - handle dragging
    document.addEventListener('mousemove', e => {
      if (this.dragOffset.x !== 0 || this.dragOffset.y !== 0) {
        this.isDragging = true;

        const newX = Math.max(
          30,
          Math.min(e.clientX - this.dragOffset.x, window.innerWidth - 30)
        );
        const newY = Math.max(
          30,
          Math.min(e.clientY - this.dragOffset.y, window.innerHeight - 30)
        );

        this.currentPosition.x = newX;
        this.currentPosition.y = newY;

        trigger.style.left = newX + 'px';
        trigger.style.top = newY + 'px';
      }
    });

    // Mouse up - end drag
    document.addEventListener('mouseup', () => {
      if (this.dragOffset.x !== 0 || this.dragOffset.y !== 0) {
        this.dragOffset.x = 0;
        this.dragOffset.y = 0;

        trigger.style.cursor = 'pointer';
        trigger.style.transition =
          'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        trigger.style.transform = 'translate(-50%, -50%) scale(1)';

        // Snap to edges if close
        this.snapToEdges(trigger);

        // Reset dragging state after a short delay
        setTimeout(() => {
          this.isDragging = false;
        }, 100);
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      const newX = Math.max(
        30,
        Math.min(this.currentPosition.x, window.innerWidth - 30)
      );
      const newY = Math.max(
        30,
        Math.min(this.currentPosition.y, window.innerHeight - 30)
      );

      if (newX !== this.currentPosition.x || newY !== this.currentPosition.y) {
        this.currentPosition.x = newX;
        this.currentPosition.y = newY;
        trigger.style.left = newX + 'px';
        trigger.style.top = newY + 'px';
      }
    });
  }

  /**
   * Snap to edges if close enough
   */
  snapToEdges(trigger) {
    const snapDistance = 50;
    let snapped = false;

    // Snap to left edge
    if (this.currentPosition.x < snapDistance) {
      this.currentPosition.x = 30;
      snapped = true;
    }
    // Snap to right edge
    else if (this.currentPosition.x > window.innerWidth - snapDistance) {
      this.currentPosition.x = window.innerWidth - 30;
      snapped = true;
    }

    // Snap to top edge
    if (this.currentPosition.y < snapDistance) {
      this.currentPosition.y = 30;
      snapped = true;
    }
    // Snap to bottom edge
    else if (this.currentPosition.y > window.innerHeight - snapDistance) {
      this.currentPosition.y = window.innerHeight - 30;
      snapped = true;
    }

    if (snapped) {
      trigger.style.left = this.currentPosition.x + 'px';
      trigger.style.top = this.currentPosition.y + 'px';
    }
  }

  showFloatingMenu(trigger) {
    // Remove existing menu
    const existingMenu = document.querySelector('#qa-floating-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    // Create menu
    const menu = document.createElement('div');
    menu.id = 'qa-floating-menu';
    menu.innerHTML = `
      <div class="qa-menu-item" data-action="record">📹 Start Recording</div>
      
      <div class="qa-menu-item" data-action="issue">➕ Create Issue</div>
      <div class="qa-menu-item" data-action="dashboard">📊 Open Dashboard</div>
    `;

    // Calculate menu position relative to trigger
    const menuWidth = 220;
    const menuHeight = 200; // Approximate height
    const triggerRect = trigger.getBoundingClientRect();

    // Default position: to the left of trigger
    let menuX = this.currentPosition.x - menuWidth - 20;
    let menuY = this.currentPosition.y;

    // Adjust if menu goes off screen
    if (menuX < 10) {
      // Show on right side if left side doesn't fit
      menuX = this.currentPosition.x + 50;
    }
    if (menuY - menuHeight / 2 < 10) {
      // Align to top if menu goes above screen
      menuY = menuHeight / 2 + 10;
    }
    if (menuY + menuHeight / 2 > window.innerHeight - 10) {
      // Align to bottom if menu goes below screen
      menuY = window.innerHeight - menuHeight / 2 - 10;
    }
    if (menuX + menuWidth > window.innerWidth - 10) {
      // Force to left side with margin if right side doesn't fit
      menuX = window.innerWidth - menuWidth - 10;
    }

    // Style menu with enhanced glassmorphism
    Object.assign(menu.style, {
      position: 'fixed',
      left: menuX + 'px',
      top: menuY + 'px',
      transform: 'translateY(-50%)',
      background: 'rgba(255, 255, 255, 0.15)',
      backdropFilter: 'blur(30px) saturate(180%)',
      WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      border: '1px solid rgba(255, 255, 255, 0.8)',
      boxShadow: `
        0 20px 60px rgba(31, 38, 135, 0.25),
        inset 0 4px 20px rgba(255, 255, 255, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.2)
      `,
      borderRadius: '20px',
      padding: '16px',
      width: menuWidth + 'px',
      zIndex: '2147483646',
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.1))',
      // Initial animation state
      opacity: '0',
      transform: 'translateY(-50%) scale(0.8)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    });

    // Style menu items with enhanced glassmorphism
    const items = menu.querySelectorAll('.qa-menu-item');
    items.forEach(item => {
      Object.assign(item.style, {
        padding: '14px 16px',
        margin: '6px 0',
        borderRadius: '12px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.9)',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(20px) saturate(150%)',
        WebkitBackdropFilter: 'blur(20px) saturate(150%)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        transition: 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        boxShadow: 'inset 0 2px 8px rgba(255, 255, 255, 0.2)',
        textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
      });

      item.addEventListener('mouseenter', () => {
        Object.assign(item.style, {
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(25px) saturate(180%)',
          WebkitBackdropFilter: 'blur(25px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.5)',
          transform: 'translateY(-2px) scale(1.02)',
          boxShadow: `
            inset 0 3px 12px rgba(255, 255, 255, 0.3),
            0 4px 16px rgba(31, 38, 135, 0.2)
          `,
          color: 'rgba(255, 255, 255, 1)',
        });
      });

      item.addEventListener('mouseleave', () => {
        Object.assign(item.style, {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px) saturate(150%)',
          WebkitBackdropFilter: 'blur(20px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          transform: 'translateY(0) scale(1)',
          boxShadow: 'inset 0 2px 8px rgba(255, 255, 255, 0.2)',
          color: 'rgba(255, 255, 255, 0.9)',
        });
      });

      item.addEventListener('click', e => {
        const action = e.target.getAttribute('data-action');

        alert(`${action} clicked!`);

        // Animate out before removing
        menu.style.opacity = '0';
        menu.style.transform = 'translateY(-50%) scale(0.8)';
        setTimeout(() => {
          if (menu.parentNode) {
            menu.remove();
          }
        }, 200);
      });
    });

    document.body.appendChild(menu);

    // Animate menu in
    requestAnimationFrame(() => {
      menu.style.opacity = '1';
      menu.style.transform = 'translateY(-50%) scale(1)';
    });

    // Close menu when clicking outside
    setTimeout(() => {
      document.addEventListener(
        'click',
        e => {
          if (!menu.contains(e.target) && !trigger.contains(e.target)) {
            // Animate out before removing
            menu.style.opacity = '0';
            menu.style.transform = 'translateY(-50%) scale(0.8)';
            setTimeout(() => {
              if (menu.parentNode) {
                menu.remove();
              }
            }, 200);
          }
        },
        { once: true }
      );
    }, 100);
  }

  /**
   * Inject necessary styles
   */
  injectStyles() {
    if (document.querySelector('#qa-extension-styles')) return;

    const style = document.createElement('style');
    style.id = 'qa-extension-styles';
    style.textContent = `
      @keyframes qa-pulse {
        0% { opacity: 0.6; transform: scale(1); }
        100% { opacity: 0.9; transform: scale(1.02); }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.floatingTriggerContainer) {
      this.floatingTriggerContainer.remove();
      this.floatingTriggerContainer = null;
    }

    const styles = document.querySelector('#qa-extension-styles');
    if (styles) {
      styles.remove();
    }
  }
}

// Initialize content script
const contentScript = new StandaloneContentScript();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  contentScript.destroy();
});
