# QA Extension Debug Steps

## Step 1: Check Extension Status
1. Go to `chrome://extensions/`
2. Find "QA Command Center"
3. Verify:
   - ✅ Extension is **enabled** (toggle switch is ON)
   - ✅ Extension has **no error badge** (red error icon)
   - ✅ Extension shows version 1.0.0

## Step 2: Check Extension Permissions
1. Click **Details** on the QA Command Center extension
2. Verify permissions:
   - ✅ "Read and change all your data on all websites" should be enabled
   - ✅ Site access should be "On all sites"

## Step 3: Check Extension Errors
1. On `chrome://extensions/` page
2. Click **Details** on QA Command Center
3. Look for any **Errors** section
4. If there are errors, note them down

## Step 4: Test Content Script Loading
1. Go to a simple website: `https://example.com`
2. Open DevTools (F12)
3. Go to **Console** tab
4. Clear console and refresh the page
5. Look for ANY logs starting with:
   - `🔥 QA EXTENSION:`
   - `🚀 QA Extension`
   - `📋 Initializing`

## Step 5: Check Background Script
1. On `chrome://extensions/` page
2. Click **Details** on QA Command Center  
3. Look for **Inspect views: background page** (or service worker)
4. Click it to open background script console
5. Check for any errors there

## Step 6: Manual Content Script Test
If nothing works, try injecting manually:
1. Go to any website
2. Open DevTools Console
3. Paste this code and press Enter:
```javascript
// Manual content script test
console.log('Manual test: Creating floating button...');
const testBtn = document.createElement('div');
testBtn.textContent = 'MANUAL QA';
testBtn.style.cssText = `
  position: fixed !important;
  top: 50% !important;
  right: 20px !important;
  width: 80px !important;
  height: 80px !important;
  background: red !important;
  color: white !important;
  border-radius: 50% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  z-index: 999999 !important;
  font-weight: bold !important;
  cursor: pointer !important;
`;
document.body.appendChild(testBtn);
console.log('Manual test: Button should be visible now');
```

## Expected Results:
- **Step 4**: Should see console logs from content script
- **Step 6**: Should see a red "MANUAL QA" button appear

## Common Issues:
- **No logs at all**: Content script not injecting (permission/manifest issue)
- **CSP errors**: Some sites block content scripts
- **Extension disabled**: Check if extension is actually enabled
- **Wrong extension**: Make sure you're testing the right extension