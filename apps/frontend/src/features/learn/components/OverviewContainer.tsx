import { css, useTheme } from '@emotion/react';

import { MarkdownRenderer } from '@/comp/MarkdownRenderer';
import SVGIcon from '@/comp/SVGIcon';
import { Loading } from '@/components/Loading';
import type { UnitOverviewResponse } from '@/services/unitService';
import type { Theme } from '@/styles/theme';

interface BackButtonProps {
  onBack: () => void;
  className?: string;
  'aria-label': string;
  children?: React.ReactNode;
}

const BackButton = ({ onBack, className, 'aria-label': ariaLabel, children }: BackButtonProps) => (
  <button type="button" className={className} onClick={onBack} aria-label={ariaLabel}>
    {children ?? (
      <>
        <SVGIcon icon="ArrowLeft" size="sm" aria-hidden="true" />
        돌아가기
      </>
    )}
  </button>
);

export interface OverviewContainerProps {
  unitId: number | null;
  data: UnitOverviewResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  onBack: () => void;
}

export const OverviewContainer = ({
  unitId,
  data,
  isLoading,
  error,
  onBack,
}: OverviewContainerProps) => {
  const theme = useTheme();
  const overviewText = data?.unit.overview ?? '';
  const hasOverview = overviewText.trim().length > 0;

  if (unitId === null) {
    return (
      <section css={mainStyle} aria-label="학습 개요">
        <BackButton
          onBack={onBack}
          css={backButtonStyle(theme)}
          aria-label="이전 페이지로 돌아가기"
        />
        <div css={messageStyle(theme)} role="alert">
          유닛 정보를 찾지 못했습니다.
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section css={mainStyle} aria-label="학습 개요" aria-busy="true">
        <BackButton
          onBack={onBack}
          css={backButtonStyle(theme)}
          aria-label="이전 페이지로 돌아가기"
        />
        <div css={loadingStyle} role="status" aria-live="polite">
          <Loading text="학습 개요를 불러오는 중입니다." />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section css={mainStyle} aria-label="학습 개요">
        <BackButton
          onBack={onBack}
          css={backButtonStyle(theme)}
          aria-label="이전 페이지로 돌아가기"
        />
        <div css={messageStyle(theme)} role="alert">
          학습 개요를 불러오지 못했습니다.
          <span css={errorDetailStyle(theme)}>{error.message}</span>
        </div>
      </section>
    );
  }

  return (
    <section css={mainStyle} aria-label="학습 개요">
      <header css={headerStyle}>
        <BackButton
          onBack={onBack}
          css={backButtonStyle(theme)}
          aria-label="이전 페이지로 돌아가기"
        />
        <h1 css={titleStyle(theme)} id="overview-title">
          {data?.unit.title ?? '학습 개요'}
        </h1>
      </header>
      <section css={contentStyle(theme)} aria-labelledby="overview-title">
        {hasOverview ? (
          <MarkdownRenderer text={overviewText} />
        ) : (
          <div css={messageStyle(theme)} role="status">
            아직 작성된 학습 개요가 없습니다.
          </div>
        )}
      </section>
    </section>
  );
};

const mainStyle = css`
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 768px) {
    padding: 16px 12px 0;
  }
`;

const headerStyle = css`
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: flex-start;
`;

const backButtonStyle = (theme: Theme) => css`
  background: transparent;
  border: none;
  color: ${theme.colors.text.light};
  font-size: ${theme.typography['14Medium'].fontSize};
  line-height: ${theme.typography['14Medium'].lineHeight};
  font-weight: ${theme.typography['14Medium'].fontWeight};
  padding: 0;
  width: fit-content;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    filter: brightness(150%);
  }

  &:focus-visible {
    outline: 2px solid ${theme.colors.primary.main};
    outline-offset: 2px;
  }
`;

const titleStyle = (theme: Theme) => css`
  font-size: ${theme.typography['20Medium'].fontSize};
  line-height: ${theme.typography['20Medium'].lineHeight};
  font-weight: ${theme.typography['20Medium'].fontWeight};
  color: ${theme.colors.text.light};
  margin: 0;
`;

const contentStyle = (theme: Theme) => css`
  background: ${theme.colors.surface.strong};
  border-radius: 16px;
  padding: 32px;
  min-height: 320px;
  max-height: calc(100vh - 14rem);
  overflow-y: auto;
  word-break: keep-all;
`;

const loadingStyle = css`
  display: flex;
  justify-content: center;
  padding: 32px 0;
`;

const messageStyle = (theme: Theme) => css`
  color: ${theme.colors.text.light};
  font-size: ${theme.typography['16Medium'].fontSize};
  line-height: ${theme.typography['16Medium'].lineHeight};
  font-weight: ${theme.typography['16Medium'].fontWeight};
`;

const errorDetailStyle = (theme: Theme) => css`
  display: block;
  margin-top: 6px;
  color: ${theme.colors.text.light};
  font-size: ${theme.typography['12Medium'].fontSize};
  line-height: ${theme.typography['12Medium'].lineHeight};
`;
