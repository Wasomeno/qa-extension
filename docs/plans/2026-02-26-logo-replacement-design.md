# Design Doc: Logo Replacement (FlowG)

## Status
Approved

## Context
The project is undergoing a rebranding from "LogLoom" to "FlowG". As part of this, the logos in the extension UI need to be updated.

## Goals
- Replace all "LogLoom" logo assets with the new "FlowG" logo.
- Update alt text for accessibility.
- Ensure the build process correctly handles the new assets.

## Proposed Changes

### Build Configuration (`rspack.config.js`)
- Update `CopyRspackPlugin` to map `./public/flowg-logo.png` to `assets/flowg-logo.png`.
- Remove mapping for `./public/log-loom-logo.png`.

### Manifest (`src/manifest.json`)
- Update `web_accessible_resources` to include `assets/flowg-logo.png` instead of `assets/log-loom-logo.png`.

### UI Components

#### `src/components/floating-trigger/components/login-popup.tsx`
- Update `logoUrl` to use `assets/flowg-logo.png`.
- Update `alt` text to `"FlowG"`.

#### `src/components/floating-trigger/components/main-menu-modal.tsx`
- Update `src` logic to use `assets/flowg-logo.png`.
- Update `alt` text to `"FlowG"`.

## Verification Plan
1. Run `npm run build` or `npm run build:chrome` to verify asset copying.
2. Check the generated `dist` folder for `assets/flowg-logo.png`.
3. Inspect the UI in the browser to confirm the new logo and alt text.
