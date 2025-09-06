// ULTRA SIMPLE CONTENT SCRIPT TEST
console.log('🚀🚀🚀 SIMPLE CONTENT SCRIPT LOADED!');
console.log('🚀🚀🚀 URL:', window.location.href);
console.log('🚀🚀🚀 DOCUMENT STATE:', document.readyState);

// Simple button injection that should work everywhere
function createSimpleButton() {
    console.log('🚀🚀🚀 Creating simple button...');
    
    // Remove any existing button first
    const existing = document.getElementById('qa-simple-test');
    if (existing) {
        existing.remove();
    }
    
    const button = document.createElement('div');
    button.id = 'qa-simple-test';
    button.innerHTML = 'QA';
    
    // Use the most basic styling possible
    button.style.position = 'fixed';
    button.style.top = '50px';
    button.style.right = '50px';
    button.style.width = '60px';
    button.style.height = '60px';
    button.style.backgroundColor = '#ff0000';
    button.style.color = '#ffffff';
    button.style.borderRadius = '50%';
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.justifyContent = 'center';
    button.style.fontWeight = 'bold';
    button.style.fontSize = '18px';
    button.style.cursor = 'pointer';
    button.style.zIndex = '999999';
    button.style.fontFamily = 'Arial, sans-serif';
    button.style.border = 'none';
    
    button.onclick = function() {
        console.log('🚀🚀🚀 Button clicked!');
        alert('Simple QA Button Clicked!');
    };
    
    if (document.body) {
        document.body.appendChild(button);
        console.log('🚀🚀🚀 Button injected successfully!');
    } else {
        console.log('🚀🚀🚀 No document.body found!');
    }
}

// Try multiple approaches
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createSimpleButton);
} else {
    createSimpleButton();
}

// Also try after delays
setTimeout(createSimpleButton, 500);
setTimeout(createSimpleButton, 1000);
setTimeout(createSimpleButton, 2000);

console.log('🚀🚀🚀 Content script setup complete!');