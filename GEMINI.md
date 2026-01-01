# QA Command Center - Project Context

## Project Overview
**QA Command Center** is a browser extension (Chrome & Firefox) designed to revolutionize quality assurance workflows. It enables users to record interactions, generate AI-powered bug reports, and seamlessly integrate with GitLab and Slack.

**Key Features:**
*   **Smart Issue Creation:** AI-analyzed bug reports from user context.
*   **GitLab Integration:** Direct issue creation and management (OAuth/Token).
*   **Floating Trigger:** A non-intrusive overlay on webpages for quick access to QA tools.
*   **Privacy-Focused:** "No Backend" architecture in this version; communicates directly with third-party APIs.

## Architecture & Tech Stack
*   **Type:** Browser Extension (Manifest V3 for Chrome, MV2/MV3 for Firefox).
*   **Framework:** React 18, TypeScript.
*   **Build Tool:** Webpack 5.
*   **Styling:** Tailwind CSS, Shadcn UI (Radix Primitives).
*   **State Management:** React Query (TanStack Query), Context API.
*   **Storage:** `chrome.storage.local` abstraction via `storageService`.

### Directory Structure
The project is structured as a monorepo-style setup, but the core logic resides in the `extension` workspace.

*   `extension/` - Main extension source code.
    *   `src/background/` - Service worker (auth, API proxying).
    *   `src/content/` - Content scripts (in-page floating trigger, DOM analysis).
    *   `src/popup/` - Extension popup UI (login, dashboard).
    *   `src/options/` - Settings page.
    *   `src/components/` - Shared React components (UI library, feature components).
        *   `floating-trigger/` - The modern in-page UI implementation.
    *   `src/services/` - Core services (`api.ts`, `storage.ts`, `auth.ts`).
    *   `src/utils/` - Helpers (DOM, shadow DOM, message passing).

## Development Workflow

### Prerequisites
*   Node.js >= 18.0.0
*   npm >= 9.0.0

### Setup
1.  **Install Dependencies:**
    ```bash
    npm install
    ```
    (This installs dependencies for the root and the `extension` workspace).

### Common Commands (Run from Root)
*   **Start Development (Watch Mode):**
    ```bash
    npm run dev
    ```
    This runs webpack in watch mode for Chrome. Load the `extension/dist/chrome` folder in `chrome://extensions`.

*   **Build for Production:**
    ```bash
    npm run build
    ```
    Generates builds for both Chrome (`dist/chrome`) and Firefox (`dist/firefox`).

*   **Run Tests:**
    ```bash
    npm test
    ```
    Runs Jest unit tests.

*   **Linting:**
    ```bash
    npm run lint
    ```

## Key Conventions & Patterns

*   **"No Backend" Philosophy:** The extension currently operates without a dedicated backend. All API calls to GitLab or Slack are made directly from the client (background or popup) using personal access tokens or OAuth tokens stored in `chrome.storage`.
*   **Shadow DOM:** The in-page floating trigger (`src/content/simple-trigger.ts`) uses Shadow DOM to isolate styles and prevent conflicts with the host page.
*   **Message Passing:** Communication between content scripts, popup, and background script handles strictly via typed messages (see `src/types/messages.ts`).
*   **Styling:** Utility-first CSS with Tailwind. Shadcn UI components are customized in `src/styles/globals.css` and individual component files.
*   **React Components:** Functional components with Hooks. Prefer `useQuery` for async data fetching.

## Configuration
*   **Environment:** The extension relies on `process.env` injection via Webpack (e.g., `TARGET_BROWSER`).
*   **Manifest:** `manifest.json` is dynamically transformed during build for different browsers (Chrome vs Firefox).
