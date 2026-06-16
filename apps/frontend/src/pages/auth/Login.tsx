import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { LoginForm } from '@/feat/auth/components/LoginForm';
import { authService } from '@/services/authService';
import { useAuthActions } from '@/store/authStore';

export const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuthActions();
  const [loggingProvider, setLoggingProvider] = useState<'google' | 'github' | 'guest' | null>(
    null,
  );
  const isLoggingIn = loggingProvider !== null;

  const handleGitHubLogin = useCallback(() => {
    setLoggingProvider('github');

    setTimeout(() => {
      authService.loginWithGitHub();
    }, 0);
  }, []);

  const handleGoogleLogin = useCallback(() => {
    setLoggingProvider('google');

    setTimeout(() => {
      authService.loginWithGoogle();
    }, 0);
  }, []);

  const handleGuestLogin = useCallback(async () => {
    setLoggingProvider('guest');

    try {
      const user = await authService.loginAsGuest();
      setUser(user);

      const redirectTo = sessionStorage.getItem('loginRedirectPath');
      if (redirectTo) {
        sessionStorage.removeItem('loginRedirectPath');
      }

      navigate(redirectTo || '/learn', { replace: true });
    } catch {
      setLoggingProvider(null);
    }
  }, [navigate, setUser]);

  return (
    <LoginForm
      onGoogleLogin={handleGoogleLogin}
      onGitHubLogin={handleGitHubLogin}
      onGuestLogin={handleGuestLogin}
      isLoggingIn={isLoggingIn}
      loggingProvider={loggingProvider}
    />
  );
};
