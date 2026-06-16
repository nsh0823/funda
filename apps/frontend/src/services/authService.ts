import type { AuthUser } from '@/feat/auth/types';

import { apiFetch, BASE_URL } from './api';

interface RefreshResponse {
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

interface LoginResponse {
  user: AuthUser;
}

export const authService = {
  async loginWithGoogle(): Promise<void> {
    const targetUrl = `${BASE_URL}/auth/google`;
    window.location.href = targetUrl;
  },

  async loginWithGitHub(): Promise<void> {
    const targetUrl = `${BASE_URL}/auth/github`;
    window.location.href = targetUrl;
  },

  async loginAsGuest(): Promise<AuthUser> {
    const response = await apiFetch.post<LoginResponse>('/auth/guest');
    return response.user;
  },

  async logout(): Promise<void> {
    return apiFetch.post('/auth/logout');
  },

  /**
   * 현재 사용자 정보 조회
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    try {
      const response = await apiFetch.get<MeResponse>('/auth/me');
      return response.user;
    } catch {
      return null;
    }
  },

  /**
   * 리프레시 토큰 갱신
   */
  async refreshToken(): Promise<RefreshResponse | null> {
    try {
      const response = await apiFetch.post<RefreshResponse>('/auth/refresh');
      return response;
    } catch {
      return null;
    }
  },
};
