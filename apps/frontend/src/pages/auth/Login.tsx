import { useCallback, useState } from 'react';

import { LoginForm } from '@/feat/auth/components/LoginForm';
import { authService } from '@/services/authService';

export const Login = () => {
  const [loggingProvider, setLoggingProvider] = useState<'google' | 'github' | null>(null);
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

  return (
    <LoginForm
      onGoogleLogin={handleGoogleLogin}
      onGitHubLogin={handleGitHubLogin}
      isLoggingIn={isLoggingIn}
      loggingProvider={loggingProvider}
    />
  );
};
