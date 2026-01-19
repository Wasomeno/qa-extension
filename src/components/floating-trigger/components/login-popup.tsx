import React from 'react';
import { Button } from '@/components/ui/button';
import { gitlabLogin } from '@/api/auth';
import { useSessionUser } from '@/hooks/use-session-user';

interface LoginPopupProps {
  onClose: () => void;
  onLoginSuccess: () => void;
}

const LoginPopup: React.FC<LoginPopupProps> = ({ onClose, onLoginSuccess }) => {
  const { syncUser } = useSessionUser();

  const handleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('Login button clicked');

    try {
      console.log('Calling gitlabLogin...');
      const response = await gitlabLogin();
      console.log('gitlabLogin response:', response);

      // If we got a URL (like for OAuth or Options), open it
      if (response.data?.url) {
        console.log('Opening URL:', response.data.url);
        window.open(response.data.url, '_blank');
      }

      // If the login was successful (simulated or real), notify parent
      if (response.success) {
        console.log('Login successful, syncing user...');
        // Fetch current user and store in global state
        await syncUser();

        onLoginSuccess();
        onClose();
      }
    } catch (error) {
      console.error('Login error', error);
    }
  };

  return (
    <div
      className="p-6 flex flex-col items-center justify-center space-y-4"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="text-center">
        <h3 className="text-lg font-semibold text-gray-900">Welcome Back</h3>
        <p className="text-sm text-gray-500 mt-1">Please login to continue</p>
      </div>

      <Button
        onClick={handleLogin}
        className="w-full bg-[#FC6D26] hover:bg-[#E24329] text-white flex items-center justify-center gap-2"
      >
        {/* GitLab Brand Color is roughly #FC6D26 */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-gitlab"
        >
          <path d="m22 13.29-3.33-10a.42.42 0 0 0-.8 0L15 10.94h-6L6.13 3.29a.42.42 0 0 0-.8 0L2 13.29a.91.91 0 0 0 .2.85L12 22l9.8-7.86a.91.91 0 0 0 .2-.85Z" />
        </svg>
        Login with GitLab
      </Button>
    </div>
  );
};

export default LoginPopup;
