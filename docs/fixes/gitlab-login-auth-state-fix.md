# GitLab Login Auth State Fix

## Problem

After a successful GitLab login, the floating trigger button doesn't instantly change to the authenticated state. This was caused by a race condition in the `syncUser` function.

## Root Cause

The `useSessionUser` hook's `syncUser` function had the following flow:

```tsx
const syncUser = useCallback(async () => {
  try {
    setLoading(true);  // Step 1: loading = true
    const response = await getCurrentUser();
    if (response.success && response.data) {
      await setUser(response.data);  // Step 2: user is set
      return response.data;
    }
  } finally {
    setLoading(false);  // Step 3: loading = false (in finally block)
  }
}, [setUser, clearUser]);
```

The issue was that `setLoading(false)` was in the `finally` block, which runs AFTER `setUser(response.data)`. This created a race condition where:

1. `setLoading(true)` is called
2. API returns with user data
3. `setUser(response.data)` is called - triggers re-render
4. At this point: `user` is set, but `loading` is still `true`
5. `isSessionExists = !isLoading && !!user` → `!true && !!user` → `false`
6. Button shows loading animation instead of authenticated state
7. `finally` block runs, `setLoading(false)` - triggers another re-render
8. Button finally shows authenticated state

This caused a visible delay/flicker in the UI.

## Solution

### Fix 1: Update `syncUser` to set loading to false BEFORE setting user

Modified `src/hooks/use-session-user.ts`:

```tsx
const syncUser = useCallback(async () => {
  try {
    setLoading(true);
    const response = await getCurrentUser();
    if (response.success && response.data) {
      // Set loading to false BEFORE setting user to avoid race condition
      // where isSessionExists = !isLoading && !!user evaluates to false
      setLoading(false);
      await setUser(response.data);
      return response.data;
    } else if (response.success === false) {
      setLoading(false);
      await clearUser();
    }
  } catch (err) {
    setLoading(false);
  }
  return null;
}, [setUser, clearUser]);
```

This ensures that when React batches the state updates:
- `loading` is `false`
- `user` is set
- `isSessionExists = !isLoading && !!user` → `!false && !!user` → `true`
- Button immediately shows authenticated state

### Fix 2: Stop polling immediately when user is detected

Modified `src/components/floating-trigger/components/login-popup.tsx`:

```tsx
// Watch for user session to appear while polling
useEffect(() => {
  if (user && isPolling) {
    // Stop polling immediately when user is detected
    setIsPolling(false);
    onLoginSuccess();
    onClose();
  }
}, [user, isPolling, onLoginSuccess, onClose]);
```

This ensures the polling interval is cleared as soon as the user session is detected, preventing unnecessary API calls.

## Testing

1. Open the extension while logged out
2. Click the floating trigger button
3. Click "Continue with GitLab"
4. Complete authentication in the new window
5. Verify the button immediately shows the authenticated state (with action icons) without delay or flicker

## Related Files

- `src/hooks/use-session-user.ts` - User session management hook
- `src/components/floating-trigger/components/login-popup.tsx` - Login popup component
- `src/components/floating-trigger/index.tsx` - Floating trigger main component
- `src/components/floating-trigger/components/floating-trigger-button.tsx` - Button component
