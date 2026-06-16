import { css, useTheme } from '@emotion/react';
import { memo } from 'react';

import { Button } from '@/comp/Button';
import SVGIcon from '@/comp/SVGIcon';
import { useAuthUser, useIsAuthReady, useIsLoggedIn } from '@/store/authStore';
import type { Theme } from '@/styles/theme';

import { AppearanceSection } from './AppearanceSection';
import { EmailNotificationSection } from './EmailNotificationSection';
import { SoundSection } from './SoundSection';

interface SettingProps {
  isDarkMode: boolean;
  onDarkModeToggle: (checked: boolean) => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  soundVolume: number;
  onSoundVolumeChange: (volume: number) => void;
  isEmailSubscribed: boolean;
  email: string | null;
  isEmailToggleDisabled: boolean;
  onEmailToggle: (checked: boolean) => void;
}

export const SettingContainer = memo(
  ({
    isDarkMode,
    onDarkModeToggle,
    onLogout,
    onDeleteAccount,
    soundVolume,
    onSoundVolumeChange,
    isEmailSubscribed,
    email,
    isEmailToggleDisabled,
    onEmailToggle,
  }: SettingProps) => {
    const theme = useTheme();
    const isLoggedIn = useIsLoggedIn();
    const isAuthReady = useIsAuthReady();
    const user = useAuthUser();
    const canDeleteAccount = user?.provider === 'github' || user?.provider === 'google';

    return (
      <div css={containerStyle}>
        <header css={headerStyle}>
          <h1 css={pageTitleStyle(theme)}>SETTING</h1>
        </header>
        <AppearanceSection isDarkMode={isDarkMode} onDarkModeToggle={onDarkModeToggle} />
        <SoundSection soundVolume={soundVolume} onSoundVolumeChange={onSoundVolumeChange} />
        {isAuthReady && isLoggedIn && (
          <EmailNotificationSection
            isEmailSubscribed={isEmailSubscribed}
            email={email}
            isDisabled={isEmailToggleDisabled}
            onToggle={onEmailToggle}
          />
        )}

        {isAuthReady && isLoggedIn && (
          <div css={accountActionGroupStyle}>
            <Button variant="primary" fullWidth onClick={onLogout} css={logoutButtonStyle}>
              <SVGIcon icon="Logout" size="md" />
              <span>로그아웃</span>
            </Button>
            {canDeleteAccount && (
              <Button
                variant="secondary"
                fullWidth
                onClick={onDeleteAccount}
                css={deleteAccountButtonStyle(theme)}
              >
                탈퇴하기
              </Button>
            )}
          </div>
        )}
      </div>
    );
  },
);

const containerStyle = css`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 24px;
  max-width: 45rem;
  margin: 0 auto;
`;

const headerStyle = css`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
`;

const pageTitleStyle = (theme: Theme) => css`
  font-size: ${theme.typography['16Medium'].fontSize};
  line-height: ${theme.typography['16Medium'].lineHeight};
  font-weight: ${theme.typography['16Medium'].fontWeight};
  color: ${theme.colors.primary.main};
  letter-spacing: 0.12em;
  padding-left: 0.5rem;
`;

const logoutButtonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const accountActionGroupStyle = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const deleteAccountButtonStyle = (theme: Theme) => css`
  color: ${theme.colors.error.main};
  border-color: ${theme.colors.error.surface};
  box-shadow: 0 0.3rem 0 ${theme.colors.error.surface};

  &:not(:disabled):hover {
    filter: brightness(0.98);
    box-shadow: 0 0.425rem 0 ${theme.colors.error.surface};
  }

  &:not(:disabled):active {
    box-shadow: 0 0.125rem 0 ${theme.colors.error.surface};
  }
`;
