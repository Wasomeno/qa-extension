# Development Guide

This guide will help you develop the extension efficiently without needing to rebuild every time you make changes.

## 🚀 Quick Start Development Workflow

### Option 1: Basic Watch Mode (Recommended for beginners)

1. **Start the development build with watch mode:**
   ```bash
   cd extension
   npm run dev
   ```

2. **Load the extension in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked" and select the `extension/dist` folder
   - The extension will appear in your extensions list

3. **Make changes and see them instantly:**
   - Edit any file in `src/`
   - Webpack will automatically rebuild
   - Click the refresh button on your extension in `chrome://extensions/` to reload

### Option 2: Hot Reload (Advanced - Automatic reloading)

1. **Start hot reload development:**
   ```bash
   npm run dev:hot
   ```
   This will automatically install missing dependencies if needed, then start both the webpack watcher AND the hot reload server.

3. **Load the extension in Chrome** (same as above, but it will auto-reload!)

## 🔧 Development Features

### Webpack Optimizations
- **Source Maps**: Enabled in development for easier debugging
- **Fast Rebuild**: Filesystem caching speeds up subsequent builds
- **Watch Mode**: Automatically rebuilds when files change

### Hot Reload Features
- **Automatic Extension Reload**: Extension reloads automatically when files change
- **WebSocket Connection**: Real-time communication between dev server and extension
- **Debounced Reloads**: Prevents rapid reloads when saving multiple files

## 🎯 Development Best Practices

### 1. Use the Browser DevTools
- **Popup Debugging**: Right-click extension popup → "Inspect"
- **Background Script**: Go to `chrome://extensions/` → Click "background page" link
- **Content Script**: Use regular page DevTools, filter console by extension ID

### 2. Component Development
- Use the `TailwindExample.tsx` as reference for styling patterns
- All shadcn/ui components are available in `src/src/components/ui/ui/`
- Tailwind classes are configured and ready to use

### 3. Testing Changes
- **Popup**: Click the extension icon to test popup changes
- **Options**: Right-click extension → "Options" to test options page
- **Content Scripts**: Visit any webpage to test content script changes

## 📁 Project Structure

```
extension/
├── src/
│   ├── components/          # React components
│   │   ├── IssueCreator.tsx # ✅ Updated with shadcn/ui
│   │   ├── RecordingController.tsx # ✅ Updated with shadcn/ui
│   │   └── TailwindExample.tsx # Reference component
│   ├── src/components/ui/ui/ # shadcn/ui components
│   ├── styles/
│   │   └── globals.css      # ✅ Tailwind + custom styles
│   ├── popup/              # Extension popup
│   ├── options/            # Extension options page
│   ├── background/         # Background service worker
│   └── content/            # Content scripts
├── dist/                   # Built extension (load this in Chrome)
├── scripts/
│   └── dev-reload.js       # Hot reload server
└── webpack.config.js       # ✅ Enhanced with dev optimizations
```

## 🐛 Debugging Tips

### Common Issues
1. **Extension not loading**: Check `dist/manifest.json` exists
2. **Styles not applying**: Verify Tailwind classes in DevTools
3. **Hot reload not working**: Check WebSocket connection in background script console
4. **TypeScript errors**: Run `npm run typecheck` to see all errors

### Debug Console Locations
- **Background Script**: `chrome://extensions/` → Extension details → "background page"
- **Popup**: Right-click popup → "Inspect"
- **Content Script**: Browser DevTools → Console (filter by extension ID)
- **Options Page**: Right-click extension → "Options" → F12

## 🔄 Available Commands

```bash
# Development (basic watch mode)
npm run dev

# Development with hot reload
npm run dev:hot

# Production build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:watch
npm run test:coverage

# Clean build artifacts
npm run clean
```

## 💡 Pro Tips

1. **Use Chrome Extension DevTools**: Install the "Chrome Extension DevTools" extension for better debugging

2. **Live Editing**: With hot reload, you can edit React components and see changes instantly without losing extension state

3. **Console Debugging**: Use `console.log()` liberally during development - each script context has its own console

4. **Network Monitoring**: Use Chrome DevTools Network tab to debug API calls from content/background scripts

5. **Storage Inspection**: Go to DevTools → Application → Storage to inspect extension storage

## 🎨 UI Development

### shadcn/ui Components Available
- ✅ Button, Card, Input, Select, Badge, Alert
- ✅ Dialog, Switch, Label, Textarea, Separator
- ✅ All Radix primitives are installed and configured

### Tailwind Configuration
- ✅ Full Tailwind CSS with custom design tokens
- ✅ Custom components in `globals.css`
- ✅ Responsive design utilities
- ✅ Dark mode support (configurable)

### Styling Best Practices
- Use Tailwind utility classes instead of custom CSS
- Reference `TailwindExample.tsx` for common patterns
- Use shadcn/ui components for consistent design
- Test in both light and dark modes if applicable

Happy coding! 🚀