// MINIMAL TEST CONTENT SCRIPT

// Wait for DOM to be ready
function injectTestButton() {
  // Skip on extension pages
  if (
    window.location.href.startsWith('chrome://') ||
    window.location.href.startsWith('chrome-extension://') ||
    window.location.href.startsWith('edge://') ||
    window.location.href.startsWith('moz-extension://')
  ) {
    return;
  }

  // Create a simple test button
  const testButton = document.createElement('div');
  testButton.id = 'qa-test-button';
  testButton.textContent = 'QA TEST';
  testButton.style.cssText = `
        position: fixed !important;
        top: 20px !important;
        right: 20px !important;
        width: 100px !important;
        height: 50px !important;
        background: red !important;
        color: white !important;
        border: 2px solid white !important;
        border-radius: 8px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-weight: bold !important;
        font-size: 14px !important;
        z-index: 2147483647 !important;
        cursor: pointer !important;
        font-family: Arial, sans-serif !important;
    `;

  testButton.addEventListener('click', () => {
    alert('QA Test Button Clicked!');
  });

  // Ensure document.body exists
  if (document.body) {
    document.body.appendChild(testButton);
  }
}

// Try multiple injection strategies
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectTestButton);
} else {
  injectTestButton();
}

// Also try after a delay
setTimeout(injectTestButton, 1000);
setTimeout(injectTestButton, 3000);
