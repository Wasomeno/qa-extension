// Ultra simple content script test - no TypeScript, no complex imports

// Add a simple test element immediately
function addTestElement() {
  const testElement = document.createElement('div');
  testElement.id = 'qa-simple-test';
  testElement.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    width: 120px;
    height: 60px;
    background: lime;
    color: black;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    font-weight: bold;
    border-radius: 8px;
    cursor: pointer;
    font-family: Arial, sans-serif;
  `;
  testElement.textContent = 'SIMPLE TEST';
  testElement.onclick = function () {
    alert('Simple test works!');
  };

  document.body.appendChild(testElement);
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addTestElement);
} else {
  addTestElement();
}
