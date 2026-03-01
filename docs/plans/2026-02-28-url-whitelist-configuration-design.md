# Design: URL Whitelist Configuration for Floating Trigger

Manage where the QA Floating Trigger appears by maintaining a domain-level whitelist in the extension popup.

## Architecture

### 1. Data Storage
- Use `chrome.storage.local` to persist a `whitelist` array of strings (domains).
- Key: `url_whitelist`.
- Default state: If the whitelist is empty, the trigger will not show anywhere.

### 2. UI Components (Popup)
- **WhitelistedDomainsSection**: A new section in `src/popup/index.tsx`.
  - **Domain List**: Renders the current list of whitelisted domains with a "Remove" button for each.
  - **Input Field**: Allows users to type a new domain (e.g., `gitlab.com`).
  - **Add Button**: Validates and adds the domain to the list.
- **Visual Style**: Glass-morphism to match existing popup design (`glass-panel`, `glass-button`, etc.).

### 3. Logic (Content Script)
- **src/content/simple-trigger.ts**:
  - Update `isUrlAllowedByWhitelist()` to:
    1. Retrieve `whitelist` from `chrome.storage.local`.
    2. Extract the current hostname using `window.location.hostname`.
    3. Check if the current hostname (or its parent domain) matches any entry in the whitelist.
    4. Return `true` if matched, `false` otherwise.

## Approaches Considered

- **Option A: Storage-driven (Chosen)** - Simple, persistent, and low complexity.
- **Option B: Background Broadcast** - Overkill for this stage; manual refresh or tab switch is acceptable for extension configuration changes.

## Proposed Changes

### `src/popup/index.tsx`
- Add state for `whitelistedDomains`.
- Implement `handleAddDomain` and `handleRemoveDomain`.
- Add the UI section below the user profile.

### `src/content/simple-trigger.ts`
- Implement `isUrlAllowedByWhitelist` using `chrome.storage.local.get('url_whitelist')`.

### `src/utils/domain-matcher.ts`
- Ensure `isValidDomain` and `normalizeDomainInput` are used for validation in the popup.
