import { css, useTheme } from '@emotion/react';
import { memo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/comp/Button';
import SVGIcon from '@/comp/SVGIcon';
import { FundyPreviewCanvas } from '@/feat/fundy/components/FundyPreviewCanvas';
import type { Theme } from '@/styles/theme';

interface LoginFormProps {
  onGoogleLogin: () => void;
  onGitHubLogin: () => void;
  onGuestLogin: () => void;
  isLoggingIn: boolean;
  loggingProvider?: 'google' | 'github' | 'guest' | null;
}

export const LoginForm = memo(
  ({
    onGoogleLogin,
    onGitHubLogin,
    onGuestLogin,
    isLoggingIn,
    loggingProvider = null,
  }: LoginFormProps) => {
    const theme = useTheme();
    const isGoogleLoggingIn = loggingProvider === 'google';
    const isGitHubLoggingIn = loggingProvider === 'github';
    const isGuestLoggingIn = loggingProvider === 'guest';

    return (
      <main css={containerStyle()}>
        <section css={contentStyle()}>
          <div css={placeholderStyle}>
            <FundyPreviewCanvas
              initialAnimation={{ lookAt: true }}
              idleExpression="smileSoft"
              idleExpressionHold={false}
              idleExpressionDelayMs={300}
              autoHello
            />
          </div>
          <h1 css={titleStyle(theme)}>Funda</h1>
          <p css={taglineStyle(theme)}>재미있게 배우는 개발 지식</p>

          <div css={buttonGroupStyle} role="group" aria-label="로그인">
            <div css={socialButtonGroupStyle}>
              <Button
                variant="secondary"
                onClick={onGoogleLogin}
                fullWidth
                css={loginButtonStyle}
                disabled={isLoggingIn}
                aria-label={isGoogleLoggingIn ? 'Google 로그인 중' : 'Google로 로그인'}
                aria-busy={isGoogleLoggingIn}
              >
                <SVGIcon icon="Google" size="md" aria-hidden="true" />
                <span>Google로 {isGoogleLoggingIn ? '로그인 중..' : '계속하기'}</span>
              </Button>
              <Button
                variant="primary"
                onClick={onGitHubLogin}
                fullWidth
                css={loginButtonStyle}
                disabled={isLoggingIn}
                aria-label={isGitHubLoggingIn ? 'GitHub 로그인 중' : 'GitHub로 로그인'}
                aria-busy={isGitHubLoggingIn}
              >
                <SVGIcon icon="Github" size="md" aria-hidden="true" />
                <span>GitHub로 {isGitHubLoggingIn ? '로그인 중..' : '계속하기'}</span>
              </Button>
            </div>

            <div css={dividerStyle(theme)} aria-hidden="true">
              <span>또는</span>
            </div>

            <Button
              variant="secondary"
              onClick={onGuestLogin}
              fullWidth
              css={loginButtonStyle}
              disabled={isLoggingIn}
              aria-label={isGuestLoggingIn ? '게스트 로그인 중' : '게스트로 로그인'}
              aria-busy={isGuestLoggingIn}
            >
              <SVGIcon icon="Profile" size="md" aria-hidden="true" />
              <span>게스트로 {isGuestLoggingIn ? '로그인 중..' : '둘러보기'}</span>
            </Button>
          </div>

          <p css={policyTextStyle(theme)}>
            계속 진행하면 Funda의{' '}
            <Link to="/terms" css={linkStyle(theme)}>
              이용약관
            </Link>{' '}
            및{' '}
            <Link to="/privacy" css={linkStyle(theme)}>
              개인정보처리방침
            </Link>
            에 동의하며, <br /> 학습 독려를 위한 <strong>이메일 알림 수신</strong>에 동의하는 것으로
            간주됩니다.
          </p>
        </section>
      </main>
    );
  },
);

const containerStyle = () => css`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
`;

const contentStyle = () => css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  max-width: 400px;
  width: 100%;
`;

const placeholderStyle = css`
  width: 100%;
  height: 400px;
  overflow: hidden;
`;

const titleStyle = (theme: Theme) => css`
  font-size: ${theme.typography['32Bold'].fontSize};
  line-height: ${theme.typography['32Bold'].lineHeight};
  font-weight: ${theme.typography['32Bold'].fontWeight};
  color: ${theme.colors.primary.main};
`;

const taglineStyle = (theme: Theme) => css`
  font-size: ${theme.typography['16Medium'].fontSize};
  line-height: ${theme.typography['16Medium'].lineHeight};
  font-weight: ${theme.typography['16Medium'].fontWeight};
  color: ${theme.colors.text.light};
`;

const buttonGroupStyle = css`
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  margin-top: 8px;
`;

const socialButtonGroupStyle = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
`;

const dividerStyle = (theme: Theme) => css`
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  color: ${theme.colors.text.weak};
  font-size: ${theme.typography['14Medium'].fontSize};
  line-height: ${theme.typography['14Medium'].lineHeight};
  font-weight: ${theme.typography['14Medium'].fontWeight};

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${theme.colors.border.default};
  }
`;

const loginButtonStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`;

const linkStyle = (theme: Theme) => css`
  color: ${theme.colors.primary.main};
  text-decoration: none;
  font-weight: 600;

  &:hover {
    text-decoration: underline;
  }
`;

const policyTextStyle = (theme: Theme) => css`
  font-size: ${theme.typography['12Medium'].fontSize};
  color: ${theme.colors.text.weak};
  text-align: center;
  word-break: keep-all;
  margin-top: 16px;
`;
