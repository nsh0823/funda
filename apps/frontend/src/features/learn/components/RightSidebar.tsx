import { css, useTheme } from '@emotion/react';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/comp/Button';
import { Dropdown } from '@/comp/Dropdown';
import SVGIcon from '@/comp/SVGIcon';
import { Loading } from '@/components/Loading';
import { Modal } from '@/components/Modal';
import { UserSearchModal } from '@/feat/user/profile/components/UserSearchModal';
import type { ProfileSearchUser } from '@/feat/user/profile/types';
import { useFieldsQuery } from '@/hooks/queries/fieldQueries';
import { useReviewQueueQuery, useTodayGoalsQuery } from '@/hooks/queries/progressQueries';
import {
  useFollowUserMutation,
  useProfileSearchUsers,
  userKeys,
  useUnfollowUserMutation,
} from '@/hooks/queries/userQueries';
import { useStorage } from '@/hooks/useStorage';
import { useAuthUser, useIsAuthReady, useIsLoggedIn } from '@/store/authStore';
import { useToast } from '@/store/toastStore';
import type { Theme } from '@/styles/theme';

export const LearnRightSidebar = ({
  fieldSlug,
  setFieldSlug,
}: {
  fieldSlug: string;
  setFieldSlug: (slug: string) => void;
}) => {
  const reviewBatchSize = 10;
  const theme = useTheme();
  const queryClient = useQueryClient();
  const user = useAuthUser();
  const { progress, updateUIState } = useStorage();
  const navigate = useNavigate();

  const isLoggedIn = useIsLoggedIn();
  const isAuthReady = useIsAuthReady();

  const heartCount = user ? user.heartCount : progress.heart;

  const { data: fieldsData } = useFieldsQuery();
  const fields = fieldsData.fields;

  const { data: reviewQueueData = [], refetch: refetchReviewQueue } = useReviewQueueQuery(
    { fieldSlug, limit: reviewBatchSize },
    {
      enabled: isLoggedIn && isAuthReady,
    },
  );

  const { data: todayGoalsData } = useTodayGoalsQuery({ enabled: isLoggedIn && isAuthReady });
  const TODAY_GOALS = todayGoalsData ? [todayGoalsData.totalXP, todayGoalsData.perfectScore] : [];

  const diamondCount = user?.diamondCount ?? 0;

  const { showToast } = useToast();
  const [isNavigatingReview, setIsNavigatingReview] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [followOverrides, setFollowOverrides] = useState<Record<number, boolean>>({});
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const followMutation = useFollowUserMutation();
  const unfollowMutation = useUnfollowUserMutation();

  const selectedField = useMemo(
    () => fields.find(field => field.slug.toLowerCase() === fieldSlug.toLowerCase()),
    [fields, fieldSlug],
  );

  const dropdownOptions = useMemo(
    () =>
      fields.map(field => ({
        value: field.slug,
        label: field.name,
        icon: field.icon,
      })),
    [fields],
  );

  const handleChange = (option: string) => {
    const lastSolvedUnitId =
      progress.last_solved_unit_id.find(item => item.field_slug === option)?.unit_id ?? 0;

    updateUIState({
      last_viewed: {
        field_slug: option,
        unit_id: lastSolvedUnitId,
      },
    });

    setFieldSlug(option);
  };

  const handleReviewClick = useCallback(async () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    let quizzes = reviewQueueData;
    if (quizzes.length === 0) {
      const result = await refetchReviewQueue();

      if (result.isError || !result.data) {
        showToast('복습 문제를 불러오지 못했습니다.');
        return;
      }
      quizzes = result.data;
    }

    if (quizzes.length === 0) {
      showToast('복습할 문제가 없습니다.');
      return;
    }

    setIsNavigatingReview(true);
    navigate('/quiz?mode=review', {
      state: {
        reviewQuizzes: quizzes,
        reviewFieldSlug: fieldSlug,
      },
    });
  }, [fieldSlug, isLoggedIn, navigate, refetchReviewQueue, reviewQueueData, showToast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedKeyword(searchKeyword.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    setFollowOverrides({});
  }, [debouncedKeyword]);

  useEffect(() => {
    if (!todayGoalsData?.rewardGranted) {
      return;
    }

    // 오늘의 목표 달성했을 때, 다이아 바로 반영하기 위해 currentUser refetch
    queryClient.refetchQueries({ queryKey: ['current-user'], type: 'active' });
  }, [queryClient, todayGoalsData?.rewardGranted]);

  const shouldSearch = isSearchModalOpen && isLoggedIn && debouncedKeyword.length >= 1;
  const { data: searchUsers = [], isLoading: isSearchLoading } = useProfileSearchUsers(
    debouncedKeyword,
    shouldSearch,
  );

  const resolvedSearchUsers = useMemo(
    () =>
      searchUsers.map(userData => ({
        ...userData,
        isFollowing: followOverrides[userData.userId] ?? userData.isFollowing,
      })),
    [searchUsers, followOverrides],
  );

  const handleOpenSearchModal = () => {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }

    setIsSearchModalOpen(true);
  };

  const handleCloseSearchModal = () => {
    setIsSearchModalOpen(false);
    setSearchKeyword('');
    setDebouncedKeyword('');
    setFollowOverrides({});
    setPendingUserId(null);
  };

  const handleSearchUserClick = (targetUserId: number) => {
    handleCloseSearchModal();
    navigate(`/profile/${targetUserId}`, { state: { refetch: true } });
  };

  const handleFollowToggle = async (targetUserId: number, isFollowing: boolean) => {
    if (pendingUserId !== null) {
      return;
    }

    if (!user?.id) {
      return;
    }

    setPendingUserId(targetUserId);
    setFollowOverrides(prev => ({ ...prev, [targetUserId]: !isFollowing }));

    try {
      let nextIsFollowing = !isFollowing;
      if (isFollowing) {
        const result = await unfollowMutation.mutateAsync({
          targetUserId,
          myId: user.id,
        });
        nextIsFollowing = result.isFollowing;
      } else {
        const result = await followMutation.mutateAsync(targetUserId);
        nextIsFollowing = result.isFollowing;
      }

      setFollowOverrides(prev => ({ ...prev, [targetUserId]: nextIsFollowing }));
      queryClient.setQueryData<ProfileSearchUser[]>(
        userKeys.search(debouncedKeyword),
        previousData => {
          if (!previousData) {
            return previousData;
          }

          return previousData.map(userData =>
            userData.userId === targetUserId
              ? { ...userData, isFollowing: nextIsFollowing }
              : userData,
          );
        },
      );

      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: userKeys.following(user.id) });
        queryClient.invalidateQueries({ queryKey: userKeys.summary(user.id) });
      }
    } catch (followError) {
      setFollowOverrides(prev => ({ ...prev, [targetUserId]: isFollowing }));
      showToast((followError as Error).message);
    } finally {
      setPendingUserId(null);
    }
  };

  if (!isAuthReady) return null;
  if (isNavigatingReview) return <Loading text="복습 문제를 불러오는 중입니다" />;

  return (
    <aside css={rightSectionStyle}>
      <div css={rightSectionInnerStyle}>
        <div css={statsContainerStyle(isLoggedIn)}>
          <Dropdown
            options={dropdownOptions}
            onChange={handleChange}
            value={fieldSlug}
            variant="plain"
            triggerCss={statContainerStyle(theme)}
            renderTrigger={() => (
              <>
                <span css={statIconStyle}>
                  <SVGIcon icon={selectedField?.icon ?? 'Frontend'} size="md" />
                </span>
                <span css={statValueStyle(theme)}>
                  {selectedField?.slug?.toUpperCase() ?? fieldSlug.toUpperCase()}
                </span>
              </>
            )}
            renderOption={option => (
              <>
                <span css={statIconStyle}>
                  <SVGIcon icon={option.icon ?? 'Frontend'} size="sm" />
                </span>
                <span css={statValueStyle(theme)}>{option.label}</span>
              </>
            )}
          />
          {isLoggedIn && user && (
            <>
              <div css={statContainerStyle(theme)}>
                <span css={statIconStyle}>
                  <SVGIcon icon="Diamond" size="md" />
                </span>
                <output css={statValueStyle(theme)}>{diamondCount}</output>
              </div>
              <div css={statContainerStyle(theme)}>
                <span css={statIconStyle}>
                  <SVGIcon icon="Streak" size="md" />
                </span>
                <output css={statValueStyle(theme)}>{user.currentStreak}</output>
              </div>
            </>
          )}

          <div css={statContainerStyle(theme)}>
            <span css={statIconStyle}>
              <SVGIcon icon="Heart" size="lg" />
            </span>
            <output css={statValueStyle(theme)}>{heartCount}</output>
          </div>
        </div>

        <div css={cardContainerStyle}>
          <div css={cardStyle(theme)}>
            <div css={cardHeaderStyle}>
              <span css={cardIconStyle}>
                <SVGIcon icon="Book" size="md" />
              </span>
              <span css={cardTitleStyle(theme)}>복습 노트</span>
            </div>
            <Button
              variant="primary"
              fullWidth={true}
              onClick={handleReviewClick}
              css={rightSidebarBtnStyle(theme)}
              disabled={!isLoggedIn}
            >
              복습 시작하기
            </Button>
          </div>

          <div css={cardStyle(theme)}>
            <div css={cardHeaderStyle}>
              <span css={cardIconStyle}>
                <SVGIcon icon="Fire" size="md" />
              </span>
              <span css={cardTitleStyle(theme)}>오늘의 목표</span>
            </div>
            <ul css={goalsListStyle}>
              {TODAY_GOALS.map(goal => (
                <li key={goal.id} css={goalItemStyle}>
                  <div css={goalLabelContainerStyle}>
                    <span css={goalLabelStyle(theme)}>{goal.label}</span>
                    <output css={goalLabelStyle(theme)}>
                      {goal.current}/{goal.target}
                    </output>
                  </div>
                  <div css={progressBarContainerStyle(theme)}>
                    <div
                      css={progressBarStyle(theme, (goal.current / goal.target) * 100)}
                      role="progressbar"
                      aria-valuenow={Math.round(
                        Math.min(100, Math.max(0, (goal.current / goal.target) * 100)),
                      )}
                      aria-label="오늘의 목표 진행률"
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div css={cardStyle(theme)}>
            <div css={cardHeaderStyle}>
              <span css={cardIconStyle}>
                <SVGIcon icon="Search" size="md" />
              </span>
              <span css={cardTitleStyle(theme)}>친구 추가</span>
            </div>
            <Button
              variant="primary"
              fullWidth={true}
              onClick={handleOpenSearchModal}
              css={rightSidebarBtnStyle(theme)}
              disabled={!isLoggedIn}
            >
              친구 추가하기
            </Button>
          </div>

          {!isLoggedIn && !user && (
            <div css={overlayStyle(theme)}>
              <div css={overlayHeaderStyle}>
                <span css={overlayTitleStyle(theme)}>
                  로그인하여 학습 기록을 저장하고 친구 추가를 해보세요!
                </span>
              </div>

              <Link to="/login" css={rightSidebarLinkStyle}>
                <Button variant="primary" fullWidth={true} css={rightSidebarBtnStyle(theme)}>
                  로그인
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* {!import.meta.env.DEV && (
          <div data-boostad-zone css={[cardStyle(theme), boostadZoneOverride]}></div>
        )} */}

        {isSearchModalOpen && (
          <Modal
            title="친구 추가"
            content={
              <UserSearchModal
                keyword={searchKeyword}
                users={shouldSearch ? resolvedSearchUsers : []}
                isLoading={shouldSearch && isSearchLoading}
                pendingUserId={pendingUserId}
                onKeywordChange={setSearchKeyword}
                onUserClick={handleSearchUserClick}
                onFollowToggle={handleFollowToggle}
              />
            }
            onClose={handleCloseSearchModal}
            maxWidth={560}
          />
        )}
      </div>
    </aside>
  );
};

const rightSectionStyle = css`
  position: sticky;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-self: flex-end;
  width: 360px;
  min-width: 360px;
  padding-right: 8px;
  padding-top: 24px;

  @media (max-width: 1024px) {
    width: 100%;
    padding: 0;
    align-items: center;
  }
`;

const rightSectionInnerStyle = css`
  position: sticky;
  top: 24px;
  min-height: calc(100dvh - 48px);

  @media (max-width: 1024px) {
    width: 100%;
    max-width: 40rem;
    min-height: auto;
    padding: 0 24px;
    position: fixed;
    top: 0;
  }

  @media (min-width: 768px) and (max-width: 1024px) {
    left: calc(50% + 18px);
    transform: translateX(-50%);
  }

  @media (max-width: 768px) {
    left: 50%;
    transform: translateX(-50%);
  }
`;

const statsContainerStyle = (isLoggedIn: boolean) => css`
  width: ${isLoggedIn ? '100%' : '40%'};
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;

  @media (max-width: 1024px) {
    margin: 0;
  }
`;

const statContainerStyle = (theme: Theme) => css`
  font-size: ${theme.typography['20Bold'].fontSize};
  line-height: ${theme.typography['20Bold'].lineHeight};
  font-weight: ${theme.typography['20Bold'].fontWeight};
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: ${theme.colors.text.default};
  padding: 8px;
  border-radius: ${theme.borderRadius.small};

  &:hover {
    background: ${theme.colors.surface.bold};
  }

  @media (max-width: 768px) {
    & + div[aria-label='dropdown options'] {
      transform: translateX(-25%);
    }
  }
`;

const statIconStyle = css`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const rightSidebarLinkStyle = css`
  text-decoration: none;
  color: inherit;

  &:visited,
  &:active {
    color: inherit;
  }
`;

const rightSidebarBtnStyle = (theme: Theme) => css`
  margin-bottom: 0.5rem;

  &:disabled {
    background: ${theme.colors.grayscale[300]};
    color: ${theme.colors.text.light};
    box-shadow: 0 8px 0 ${theme.colors.grayscale[400]};
    opacity: 0.3;
  }
`;

const statValueStyle = (theme: Theme) => css`
  font-size: ${theme.typography['12Medium'].fontSize};
  font-weight: ${theme.typography['12Medium'].fontWeight};
`;

const cardContainerStyle = css`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 24px;

  @media (max-width: 1024px) {
    display: none;
  }
`;

const cardStyle = (theme: Theme) => css`
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: ${theme.colors.surface.strong};
  border-radius: ${theme.borderRadius.medium};
  border: 1px solid ${theme.colors.border.default};
`;

const cardHeaderStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`;

const cardIconStyle = css`
  display: flex;
  align-items: center;
`;

const cardTitleStyle = (theme: Theme) => css`
  flex: 1;
  font-size: ${theme.typography['18Bold'].fontSize};
  line-height: ${theme.typography['18Bold'].lineHeight};
  font-weight: ${theme.typography['18Bold'].fontWeight};
  color: ${theme.colors.text.strong};
`;

const overlayStyle = (theme: Theme) => css`
  position: absolute;
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 32px;
  gap: 24px;
  background: linear-gradient(
    to bottom,
    ${theme.colors.surface.strong},
    ${theme.colors.surface.strong}F2,
    ${theme.colors.surface.strong}F2,
    ${theme.colors.surface.strong}F2,
    ${theme.colors.surface.strong}E6,
    ${theme.colors.surface.strong}E6,
    ${theme.colors.surface.strong}E6,
    ${theme.colors.surface.strong}B3,
    ${theme.colors.surface.strong}80
  );

  border-radius: ${theme.borderRadius.medium};
  word-break: keep-all;
`;

const overlayHeaderStyle = css`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const overlayTitleStyle = (theme: Theme) => css`
  text-align: center;
  flex: 1;
  font-size: ${theme.typography['20Medium'].fontSize};
  line-height: ${theme.typography['20Medium'].lineHeight};
  font-weight: ${theme.typography['20Medium'].fontWeight};
  color: ${theme.colors.text.strong};
`;

const goalsListStyle = css`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

const goalItemStyle = css`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const goalLabelContainerStyle = css`
  display: flex;
  justify-content: space-between;
`;

const goalLabelStyle = (theme: Theme) => css`
  font-size: ${theme.typography['16Medium'].fontSize};
  line-height: ${theme.typography['16Medium'].lineHeight};
  font-weight: ${theme.typography['16Medium'].fontWeight};
  color: ${theme.colors.text.default};
`;

const progressBarContainerStyle = (theme: Theme) => css`
  width: 100%;
  height: 8px;
  background: ${theme.colors.surface.default};
  border-radius: ${theme.borderRadius.small};
  overflow: hidden;
`;

const progressBarStyle = (theme: Theme, percentage: number) => css`
  width: ${percentage}%;
  height: 100%;
  background: ${theme.colors.primary.main};
  border-radius: ${theme.borderRadius.small};
  transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
`;

// const boostadZoneOverride = css`
//   &[data-boostad-zone] {
//     margin: 24px 0 0 !important;
//   }

//   min-height: 107px;

//   @media (max-width: 1024px) {
//     display: none;
//   }
// `;
