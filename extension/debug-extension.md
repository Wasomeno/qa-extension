# QA Extension Debug Guide

## Current Status: Testing Content Script Injection

The extension has been updated with a minimal test script to verify content script loading.

### Steps to Test:

1. **Reload Extension:**
   - Go to `chrome://extensions/`
   - Find "QA Command Center"
   - Click the reload button (🔄)

2. **Test on a Website:**
   - Go to any website (e.g., `https://google.com`)
   - Open DevTools (F12)
   - Check the Console tab

3. **Expected Results:**
   - You should see console logs:
     ```
     🚀 MINIMAL TEST: Content script loaded!
     🚀 MINIMAL TEST: URL: [current page URL]
     🚀 MINIMAL TEST: Document ready state: [loading/interactive/complete]
     🚀 MINIMAL TEST: Injecting test button...
     ✅ MINIMAL TEST: Test button injected successfully
     ```
   - You should see a **red button** in the top-right corner labeled "QA TEST"
   - Clicking the button should show an alert "QA Test Button Clicked!"

### If Not Working:

1. **Check Extension Status:**
   - Ensure extension is enabled in `chrome://extensions/`
   - Check for any error badges on the extension

2. **Check Console for Errors:**
   - Look for any JavaScript errors in the console
   - Check if there are CSP (Content Security Policy) errors

3. **Try Different Websites:**
   - Some sites have strict CSP that might block content scripts
   - Try on simple sites like `https://httpbin.org/` or `https://example.com`

4. **Check Extension Permissions:**
   - The extension should have access to "All sites"

### Files Currently in Use:
- **Content Script:** `test-minimal.js` (simplified test version)
- **Manifest:** Updated to load test script
- **Build:** All files compiled to `dist/` folder

Once the test button appears, we'll know content scripts are working and can proceed to debug the actual floating trigger implementation.