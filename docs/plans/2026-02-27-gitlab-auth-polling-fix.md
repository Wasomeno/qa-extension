# GitLab Authentication Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure the floating trigger reliably transitions to the authenticated state by adding active polling and UI feedback during the GitLab login flow.

**Architecture:** Add a `isPolling` state to the `LoginPopup` component that triggers a 2-second interval calling `syncUser()`. This acts as a fail-safe for missed focus events or delayed backend session establishment.

**Tech Stack:** React, Framer Motion, Chrome Extension Storage API

---

### Task 1: Add Polling Logic to LoginPopup

**Files:**
- Modify: `src/components/floating-trigger/components/login-popup.tsx`

**Step 1: Add state and effects for polling**

```tsx
  const [isPolling, setIsPolling] = useState(false);
  const { user, syncUser } = useSessionUser();

  // Watch for user session to appear while polling
  useEffect(() => {
    if (user && isPolling) {
      onLoginSuccess();
      onClose();
    }
  }, [user, isPolling, onLoginSuccess, onClose]);

  // Active polling while waiting for authentication
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(() => {
      syncUser();
    }, 2000);

    // Stop polling after 2 minutes (fail-safe)
    const timeout = setTimeout(() => {
      setIsPolling(false);
    }, 120000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isPolling, syncUser]);
```

**Step 2: Update `handleLogin` to trigger polling**

```tsx
  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPolling) return;

    try {
      const response = await gitlabLogin();

      if (response.data?.url) {
        window.open(response.data.url, '_blank');
        setIsPolling(true); // Start polling
      }
      // ... existing direct success logic ...
```

**Step 3: Update UI to show waiting state**

```tsx
          <Button
            onClick={handleLogin}
            disabled={isPolling}
            className="..."
          >
            {isPolling ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>Waiting for authentication...</span>
              </div>
            ) : (
              <>
                <svg ... />
                <span>Continue with GitLab</span>
                <LogIn ... />
              </>
            )}
          </Button>
```

**Step 4: Commit**

```bash
git add src/components/floating-trigger/components/login-popup.tsx
git commit -m "fix(auth): add active polling and UI feedback to GitLab login flow"
```
