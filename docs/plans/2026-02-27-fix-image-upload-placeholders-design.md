# Design Doc: Fix Image Upload Loading Placeholders

## Problem
The image upload loading placeholders were invisible because the extension components are rendered within a Shadow DOM. This isolated context prevented global Tailwind utility classes and animations from applying to the dynamically injected Prosemirror decorations and Markdown-it rendered HTML.

## Solution

### 1. DescriptionEditor (Tiptap/Prosemirror)
- **Plugin Stability:** Wrapped the Prosemirror `Plugin` in a Tiptap `Extension` to ensure the plugin key remains stable across re-renders.
- **Metadata Fix:** Corrected `handlePaste` to use the stabilized plugin key for adding/removing decorations.
- **Shadow DOM Polyfills:** Injected necessary CSS into the component's internal `<style>` tag to provide Tailwind-like utility classes (`animate-spin`, `animate-pulse`, `bg-white/90`, etc.) and keyframe animations directly within the Shadow DOM.

### 2. CompactIssueCreator (Markdown)
- **Inline Styles:** Updated the custom `MarkdownIt` image renderer to use inline CSS for the upload placeholder, removing dependency on external Tailwind classes.
- **UI Simplification:** Removed the non-functional `pastingImage` state and the blocking overlay in favor of the inline placeholder.

### 3. Cursor Height Fix
- Changed upload placeholders from `display: inline-block` to `display: block`.
- This prevents the browser from stretching the text caret to the height of the placeholder when the cursor is adjacent to it, ensuring the cursor height matches the text size.

## Verification Results
- Ran `npm run typecheck`: Verified `description-editor.tsx` is type-safe.
- Verified that `ChildIssueFormFields` (which uses `DescriptionEditor`) also benefits from these fixes.
