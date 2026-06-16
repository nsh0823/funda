import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { authService } from '@/services/authService';
import { useAuthActions } from '@/store/authStore';

export const useCurrentUserQuery = () =>
  useQuery({
    queryKey: ['current-user'],
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const user = await authService.getCurrentUser();
      if (user) return user;

      const refreshResult = await authService.refreshToken();
      if (!refreshResult) return null;

      return authService.getCurrentUser();
    },
  });

export const useLogoutMutation = () => {
  const queryClient = useQueryClient();
  const { clearAuth } = useAuthActions();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });
};

export const useDeleteAccountMutation = () => {
  const queryClient = useQueryClient();
  const { clearAuth } = useAuthActions();

  return useMutation({
    mutationFn: () => authService.deleteAccount(),
    onSuccess: () => {
      clearAuth();
      queryClient.clear();
    },
  });
};
