# Chrome Web Store Permission Justifications - Flowg

This document provides the required justifications for the permissions requested by the Flowg extension in its `manifest.json`.

| Permission | Justification |
| :--- | :--- |
| **`debugger`** | Required to simulate high-fidelity user interactions (clicks, typing, scrolling) during automated test playback via the Chrome DevTools Protocol. |
| **`tabCapture`** | Necessary to capture the visual stream of the active tab for creating QA session recordings and bug reports. |
| **`offscreen`** | Used to process resource-intensive tasks in the background, such as video encoding and thumbnail generation, without interrupting the user's flow. |
| **`activeTab`** | Allows the extension to interact with the page the user is currently viewing to initiate recordings or extract context for issue creation. |
| **`storage`** | Required to persist user configurations, GitLab authentication state, and metadata for recorded test sessions. |
| **`tabs`** | Necessary to manage the lifecycle of tabs during test playback, including creating new tabs for tests and identifying the target tab for recording. |
| **`contextMenus`** | Used to provide quick-access actions (e.g., "Create Issue", "Start Recording") directly from the browser's right-click menu. |
| **`notifications`** | Required to provide immediate feedback to the user upon completion of background tasks like test generation or upload status. |
| **`scripting`** | Used to dynamically inject interaction listeners and playback controllers into the target web page to facilitate recording and automated testing. |
| **`webNavigation`** | Necessary to accurately track and handle page transitions during the recording and playback of complex user journeys. |
| **`cookies`** | Required to capture and maintain session state when performing QA workflows that involve cross-domain authentication or session-specific data. |
| **`desktopCapture`** | Used as a fallback or alternative to `tabCapture` to allow users to record the entire browser window or multiple screens for comprehensive bug reporting. |
| **`<all_urls>`** | As a general-purpose QA tool, the extension must be able to record interactions and run tests on any URL specified by the user. |
