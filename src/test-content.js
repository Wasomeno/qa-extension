// QA EXTENSION CIRCULAR TRIGGER
console.log('🎯 QA Extension Content Script Loading...');

(function() {
    // Skip on browser internal pages
    if (window.location.href.startsWith('chrome://') || 
        window.location.href.startsWith('chrome-extension://') ||
        window.location.href.startsWith('edge://') ||
        window.location.href.startsWith('moz-extension://')) {
        console.log('🚫 Skipping injection on browser internal page');
        return;
    }

    let isDragging = false;
    let isExpanded = false;
    let dragOffset = { x: 0, y: 0 };
    let currentPosition = { 
        x: window.innerWidth - 80, 
        y: window.innerHeight / 2 
    };

    // Create the circular trigger
    const trigger = document.createElement('div');
    trigger.id = 'qa-floating-trigger';
    trigger.textContent = 'QA';
    
    // Apply base styles
    Object.assign(trigger.style, {
        position: 'fixed',
        left: currentPosition.x + 'px',
        top: currentPosition.y + 'px',
        transform: 'translate(-50%, -50%)',
        width: '60px',
        height: '60px',
        background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        zIndex: '2147483647',
        boxShadow: '0 8px 25px rgba(59, 130, 246, 0.4)',
        color: 'white',
        fontSize: '22px',
        fontWeight: 'bold',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        border: '2px solid rgba(255, 255, 255, 0.2)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        userSelect: 'none',
        backdropFilter: 'blur(10px)'
    });

    // Enhanced hover effects
    trigger.addEventListener('mouseenter', () => {
        if (!isDragging) {
            trigger.style.transform = 'translate(-50%, -50%) scale(1.1) rotate(5deg)';
            trigger.style.boxShadow = '0 12px 35px rgba(59, 130, 246, 0.6)';
            trigger.style.background = 'linear-gradient(135deg, #1d4ed8, #1e40af)';
        }
    });

    trigger.addEventListener('mouseleave', () => {
        if (!isDragging) {
            trigger.style.transform = 'translate(-50%, -50%) scale(1) rotate(0deg)';
            trigger.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.4)';
            trigger.style.background = 'linear-gradient(135deg, #3b82f6, #1d4ed8)';
        }
    });

    // Drag functionality
    trigger.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left mouse button
            isDragging = true;
            trigger.style.cursor = 'grabbing';
            trigger.style.transition = 'none';
            trigger.style.transform = 'translate(-50%, -50%) scale(0.95)';
            
            dragOffset.x = e.clientX - currentPosition.x;
            dragOffset.y = e.clientY - currentPosition.y;
            
            e.preventDefault();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const newX = Math.max(30, Math.min(e.clientX - dragOffset.x, window.innerWidth - 30));
        const newY = Math.max(30, Math.min(e.clientY - dragOffset.y, window.innerHeight - 30));
        
        currentPosition.x = newX;
        currentPosition.y = newY;
        
        trigger.style.left = newX + 'px';
        trigger.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            trigger.style.cursor = 'grab';
            trigger.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
            trigger.style.transform = 'translate(-50%, -50%) scale(1)';
            
            // Snap to edges if close
            const snapDistance = 50;
            if (currentPosition.x < snapDistance) {
                currentPosition.x = 30;
                trigger.style.left = '30px';
            } else if (currentPosition.x > window.innerWidth - snapDistance) {
                currentPosition.x = window.innerWidth - 30;
                trigger.style.left = (window.innerWidth - 30) + 'px';
            }
        }
    });

    // Click handler (only trigger if not dragging)
    let mouseDownTime = 0;
    trigger.addEventListener('mousedown', () => {
        mouseDownTime = Date.now();
    });

    trigger.addEventListener('click', (e) => {
        // Only show menu if it was a quick click (not a drag)
        if (Date.now() - mouseDownTime > 200) return;
        
        e.stopPropagation();
        console.log('🎯 QA Trigger clicked!');
        
        const existingMenu = document.getElementById('qa-trigger-menu');
        if (existingMenu) {
            hideMenu();
            return;
        }

        showMenu();
    });

    function showMenu() {
        isExpanded = true;
        
        const menu = document.createElement('div');
        menu.id = 'qa-trigger-menu';
        
        // Calculate menu position relative to trigger
        const triggerRect = trigger.getBoundingClientRect();
        const menuWidth = 220;
        const menuHeight = 200;
        
        let menuX = triggerRect.left - menuWidth - 20;
        let menuY = triggerRect.top - menuHeight / 2;
        
        // Adjust if menu goes off screen
        if (menuX < 10) {
            menuX = triggerRect.right + 20;
        }
        if (menuY < 10) {
            menuY = 10;
        }
        if (menuY + menuHeight > window.innerHeight - 10) {
            menuY = window.innerHeight - menuHeight - 10;
        }
        
        menu.innerHTML = `
            <div class="menu-item" data-action="record">
                <div class="menu-icon">🎥</div>
                <div class="menu-text">Start Recording</div>
            </div>
            <div class="menu-item" data-action="capture">
                <div class="menu-icon">📸</div>
                
            </div>
            <div class="menu-item" data-action="issue">
                <div class="menu-icon">➕</div>
                <div class="menu-text">Create Issue</div>
            </div>
            <div class="menu-item" data-action="dashboard">
                <div class="menu-icon">📊</div>
                <div class="menu-text">Open Dashboard</div>
            </div>
        `;
        
        Object.assign(menu.style, {
            position: 'fixed',
            left: menuX + 'px',
            top: menuY + 'px',
            width: menuWidth + 'px',
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '16px',
            padding: '12px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 32px rgba(0, 0, 0, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            backdropFilter: 'blur(20px)',
            zIndex: '2147483646',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            opacity: '0',
            transform: 'scale(0.8) translateY(10px)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: 'auto'
        });

        // Add menu item styles
        const menuItemStyle = `
            .menu-item {
                display: flex;
                align-items: center;
                padding: 14px 16px;
                margin: 4px 0;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                background: rgba(255, 255, 255, 0.7);
                border: 1px solid rgba(0, 0, 0, 0.05);
            }
            .menu-item:hover {
                background: rgba(59, 130, 246, 0.1);
                transform: translateX(4px);
                box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
            }
            .menu-icon {
                font-size: 18px;
                margin-right: 12px;
                width: 24px;
                text-align: center;
            }
            .menu-text {
                font-size: 14px;
                font-weight: 500;
                color: #374151;
            }
        `;
        
        // Add styles to document if not already added
        if (!document.getElementById('qa-menu-styles')) {
            const styleElement = document.createElement('style');
            styleElement.id = 'qa-menu-styles';
            styleElement.textContent = menuItemStyle;
            document.head.appendChild(styleElement);
        }

        document.documentElement.appendChild(menu);
        
        // Animate menu in
        requestAnimationFrame(() => {
            menu.style.opacity = '1';
            menu.style.transform = 'scale(1) translateY(0)';
        });

        // Add click handlers for menu items
        menu.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.menu-item');
            if (menuItem) {
                const action = menuItem.getAttribute('data-action');
                handleMenuAction(action);
                hideMenu();
            }
        });

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeMenuHandler);
        }, 100);
    }

    function hideMenu() {
        const menu = document.getElementById('qa-trigger-menu');
        if (menu) {
            menu.style.opacity = '0';
            menu.style.transform = 'scale(0.8) translateY(10px)';
            setTimeout(() => {
                menu.remove();
                isExpanded = false;
                document.removeEventListener('click', closeMenuHandler);
            }, 200);
        }
    }

    function closeMenuHandler(e) {
        const menu = document.getElementById('qa-trigger-menu');
        if (menu && !menu.contains(e.target) && e.target !== trigger) {
            hideMenu();
        }
    }

    function handleMenuAction(action) {
        switch (action) {
            case 'record':
                alert('🎥 Start Recording clicked!');
                break;
            case 'capture':
                
                break;
            case 'issue':
                alert('➕ Create Issue clicked!');
                break;
            case 'dashboard':
                alert('📊 Open Dashboard clicked!');
                break;
        }
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        const newX = Math.max(30, Math.min(currentPosition.x, window.innerWidth - 30));
        const newY = Math.max(30, Math.min(currentPosition.y, window.innerHeight - 30));
        
        if (newX !== currentPosition.x || newY !== currentPosition.y) {
            currentPosition.x = newX;
            currentPosition.y = newY;
            trigger.style.left = newX + 'px';
            trigger.style.top = newY + 'px';
        }
    });

    // Append to document
    document.documentElement.appendChild(trigger);
    console.log('✅ QA circular trigger injected successfully!');
})();
