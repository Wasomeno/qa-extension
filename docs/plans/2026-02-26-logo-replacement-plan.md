# Logo Replacement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all occurrences of the "LogLoom" logo with the new "FlowG" logo across the extension UI and build configuration.

**Architecture:** Update build assets mapping in Rspack, update manifest for web access, and update UI components to reference the new asset and use correct alt text.

**Tech Stack:** React, Rspack, Chrome Extension API.

---

### Task 1: Update Build Configuration

**Files:**
- Modify: `rspack.config.js`

**Step 1: Update CopyRspackPlugin patterns**
Update the plugin to copy `flowg-logo.png` instead of `log-loom-logo.png`.

```javascript
// rspack.config.js
// Find CopyRspackPlugin patterns and replace:
{
  from: './public/flowg-logo.png',
  to: 'assets/flowg-logo.png',
},
// Instead of log-loom-logo.png
```

**Step 2: Verify mapping**
Ensure no other references to `log-loom-logo.png` remain in the config.

**Step 3: Commit**

```bash
git add rspack.config.js
git commit -m "build: update logo asset mapping to FlowG"
```

### Task 2: Update Extension Manifest

**Files:**
- Modify: `src/manifest.json`

**Step 1: Update web_accessible_resources**
Replace `assets/log-loom-logo.png` with `assets/flowg-logo.png`.

```json
"web_accessible_resources": [
  {
    "resources": [
      "assets/flowg-logo.png",
      "assets/*",
      ...
    ]
  }
]
```

**Step 2: Commit**

```bash
git add src/manifest.json
git commit -m "chore: update manifest web_accessible_resources for new logo"
```

### Task 3: Update Login Popup Component

**Files:**
- Modify: `src/components/floating-trigger/components/login-popup.tsx`

**Step 1: Update logo URL and alt text**
Change the logo path and alt text.

```tsx
// src/components/floating-trigger/components/login-popup.tsx
const logoUrl =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('assets/flowg-logo.png')
    : '/assets/flowg-logo.png';

// In JSX
<img
  src={logoUrl}
  alt="FlowG"
  className="relative h-16 w-auto object-contain"
/>
```

**Step 2: Commit**

```bash
git add src/components/floating-trigger/components/login-popup.tsx
git commit -m "feat(ui): update logo and alt text in login popup"
```

### Task 4: Update Main Menu Modal Component

**Files:**
- Modify: `src/components/floating-trigger/components/main-menu-modal.tsx`

**Step 1: Update logo URL and alt text**
Change the logo path and alt text in the sidebar header.

```tsx
// src/components/floating-trigger/components/main-menu-modal.tsx
<img
  src={
    typeof chrome !== 'undefined' &&
    chrome.runtime?.getURL
      ? chrome.runtime.getURL('assets/flowg-logo.png')
      : ''
  }
  alt="FlowG"
  className="h-16 w-auto object-cover"
/>
```

**Step 2: Commit**

```bash
git add src/components/floating-trigger/components/main-menu-modal.tsx
git commit -m "feat(ui): update logo and alt text in main menu modal"
```

### Task 5: Verification

**Step 1: Run build**
Run: `npm run build:chrome` (or equivalent build script)
Expected: Build completes successfully.

**Step 2: Check assets in dist**
Run: `ls dist/chrome/assets/flowg-logo.png`
Expected: File exists.

**Step 3: Cleanup (Optional)**
If `dist/chrome/assets/log-loom-logo.png` still exists from previous builds, ensure it's not being used.

**Step 4: Commit**
```bash
git commit --allow-empty -m "chore: verify logo replacement completion"
```
