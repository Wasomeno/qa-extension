# Main Menu Dual-Mode Implementation

## Overview

The main menu now supports two display modes:
- **Modal Mode**: Traditional popup overlay with backdrop blur (default)
- **Page Mode**: Full-page view opened in a new browser tab

## Usage

### Modal Mode (Default)
- **Trigger**: Left-click the menu icon in the floating trigger capsule
- **Behavior**: Opens as a centered modal with backdrop
- **Close**: Click backdrop, press ESC, or navigate away

### Page Mode
- **Trigger**: Middle-click (scroll wheel click) the menu icon
- **Behavior**: Opens in a new browser tab as a full-page application
- **Close**: Close the browser tab or click the close button in the top bar
- **Tooltip Hint**: "Middle-click for full page" appears on hover

## Architecture

### Component Structure

```
MainMenuModal (wrapper)
  └─ MainMenuContent (reusable component)
      ├─ Modal Mode Rendering
      └─ Page Mode Rendering
```

### Key Files

#### New Files
- `src/components/floating-trigger/components/main-menu-content.tsx`
  - Reusable component supporting both display modes
  - Contains all menu logic, sidebar, and page content
  - `displayMode` prop controls rendering ('modal' | 'page')

- `src/pages/main-menu/standalone.tsx`
  - Entry point for the standalone page
  - Parses URL params for initial state
  - Wraps MainMenuContent with NavigationProvider

- `src/pages/main-menu/standalone.html`
  - HTML template for the standalone page
  - Minimal styling, full viewport height

#### Modified Files
- `src/components/floating-trigger/components/main-menu-modal.tsx`
  - Simplified to wrapper around MainMenuContent
  - Only handles modal mode

- `src/components/floating-trigger/components/floating-trigger-button.tsx`
  - Detects middle-click on menu button
  - Shows tooltip hint for page mode

- `src/components/floating-trigger/index.tsx`
  - Handles 'menu-page' action
  - Sends OPEN_MAIN_MENU_PAGE message to background

- `src/background/index.ts`
  - Handles OPEN_MAIN_MENU_PAGE message
  - Opens main-menu.html with URL params

- `src/types/messages.ts`
  - Added OPEN_MAIN_MENU_PAGE message type

- `rspack.config.js`
  - Added 'main-menu' entry point
  - Added HTML plugin for main-menu.html

- `src/manifest.json`
  - Added main-menu.html/js to web_accessible_resources

## State Management

### User Session
- Stored in `chrome.storage.session`
- Automatically shared across all extension contexts
- No additional sync needed

### Navigation State
- Currently independent per instance (modal and page don't sync)
- Each has its own NavigationProvider context
- Can be enhanced with chrome.storage sync if needed

### Query State
- Managed by TanStack Query (React Query)
- Cached queries are shared via the query client
- Refresh button invalidates queries in both instances

## Page Mode Features

The full-page mode includes:
- **Top Bar**: Logo, app title, refresh button, close button
- **Full Viewport**: Uses 100% width and height
- **Sidebar**: Collapsible navigation sidebar (same as modal)
- **Content Area**: All pages render in full width

## Build & Deployment

### Build Commands
```bash
# Chrome
npm run build:chrome

# Firefox
npm run build:firefox
```

### Output Files
- `dist/chrome/main-menu.html`
- `dist/chrome/main-menu.js`
- `dist/firefox/main-menu.html`
- `dist/firefox/main-menu.js`

### Manifest Updates
main-menu.html and main-menu.js are automatically added to `web_accessible_resources` in the manifest.

## Future Enhancements

### Potential Improvements
1. **Navigation State Sync**: Use chrome.storage to sync navigation state between modal and page
2. **Keyboard Shortcut**: Add a command to open page mode directly
3. **Settings Option**: Allow users to set default mode in options
4. **Tab Detection**: Detect if page mode is already open and focus it instead of opening new tab
5. **URL Params**: Support more URL params for deep linking (e.g., specific issue, board, etc.)

### Implementation Notes
- The MainMenuContent component is designed to be easily extended
- Display mode switching is clean and maintainable
- Cross-tab communication pattern is established for future features

## Testing Checklist

- [ ] Modal mode opens on left-click
- [ ] Page mode opens on middle-click
- [ ] Tooltip shows "Middle-click for full page" hint
- [ ] User session is shared between modes
- [ ] Navigation works in both modes
- [ ] Refresh button works in both modes
- [ ] Close button works in page mode
- [ ] All pages render correctly in both modes
- [ ] Build succeeds for both Chrome and Firefox
