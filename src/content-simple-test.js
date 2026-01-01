// Ultra simple content script test - no TypeScript, no complex imports
console.log('🔥🔥🔥 SIMPLE TEST: Content script loaded!');
console.log('🔥🔥🔥 SIMPLE TEST: URL:', window.location.href);

// Add a simple test element immediately
function addTestElement() {
  console.log('🔧 SIMPLE TEST: Adding test element...');
  
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
  testElement.onclick = function() {
    console.log('🎯 SIMPLE TEST: Element clicked!');
    alert('Simple test works!');
  };
  
  document.body.appendChild(testElement);
  console.log('✅ SIMPLE TEST: Element added to DOM');
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addTestElement);
} else {
  addTestElement();
}

console.log('🔥🔥🔥 SIMPLE TEST: Script execution completed');