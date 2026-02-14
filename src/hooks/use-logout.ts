import { logout } from '@/api/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSessionUser } from './use-session-user';
import { MessageType } from '@/types/messages';

export function useLogout() {
  const queryClient = useQueryClient();
  const { clearUser } = useSessionUser();

  return useMutation({
    mutationFn: () => logout(),
    onSuccess: async () => {
      // Notify background and other contexts FIRST
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ type: MessageType.AUTH_LOGOUT });
      }

      // Clear local session state
      await clearUser();

      // Clear all queries in cache
      queryClient.clear();
    },
    onError: (error) => {
      console.error('Logout mutation failed:', error);
    },
  });
}
