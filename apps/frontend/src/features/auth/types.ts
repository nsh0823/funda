export interface AuthUser {
  id: number;
  displayName: string;
  email?: string | null;
  profileImageUrl?: string | null;
  role: 'user' | 'admin';
  isEmailSubscribed: boolean;
  heartCount: number;
  maxHeartCount: number;
  experience: number;
  diamondCount: number;
  currentStreak: number;
  provider: 'github' | 'google' | 'guest';
}
