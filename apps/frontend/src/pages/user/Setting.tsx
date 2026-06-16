import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Loading } from '@/comp/Loading';
import { SettingContainer } from '@/feat/user/setting/SettingContainer';
import { useDeleteAccountMutation, useLogoutMutation } from '@/hooks/queries/authQueries';
import { useUpdateEmailSubscriptionMutation } from '@/hooks/queries/userQueries';
import { useStorage } from '@/hooks/useStorage';
import { useAuthUser } from '@/store/authStore';
import { useModal } from '@/store/modalStore';
import { useThemeStore } from '@/store/themeStore';
import { useToast } from '@/store/toastStore';

export const Setting = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useThemeStore();
  const { soundVolume, setSoundVolume } = useStorage();
  const { confirm } = useModal();
  const user = useAuthUser();

  const logoutMutation = useLogoutMutation();
  const deleteAccountMutation = useDeleteAccountMutation();
  const updateEmailSubscriptionMutation = useUpdateEmailSubscriptionMutation();

  /**
   * 다크 모드 토글 핸들러
   * @param checked 다크 모드 체크 상태
   */
  const handleDarkModeToggle = useCallback(() => {
    toggleDarkMode();
  }, [toggleDarkMode]);

  /**
   * 효과음 볼륨 변경 핸들러
   *
   * @param volume 0.0~1.0 범위의 볼륨 값
   */
  const handleSoundVolumeChange = useCallback(
    (volume: number) => {
      setSoundVolume(volume);
    },
    [setSoundVolume],
  );

  /**
   * 로그아웃 핸들러
   */
  const handleLogout = useCallback(async () => {
    const isConfirmed = await confirm({
      title: '로그아웃',
      content: '정말 로그아웃 하시겠습니까?',
      confirmText: '로그아웃',
    });
    if (!isConfirmed) return;

    try {
      navigate('/learn', { replace: true });
      await logoutMutation.mutateAsync();
    } catch {
      showToast('로그아웃 중 오류가 발생했습니다.');
    }
  }, [navigate, showToast, confirm, logoutMutation]);

  /**
   * 회원 탈퇴 핸들러
   */
  const handleDeleteAccount = useCallback(async () => {
    const isConfirmed = await confirm({
      title: '탈퇴하기',
      content: '계정과 학습 기록이 삭제됩니다. 정말 탈퇴하시겠습니까?',
      confirmText: '탈퇴하기',
      cancelText: '취소',
    });
    if (!isConfirmed) return;

    try {
      navigate('/learn', { replace: true });
      await deleteAccountMutation.mutateAsync();
      showToast('탈퇴 처리되었습니다.');
    } catch {
      showToast('탈퇴 처리 중 오류가 발생했습니다.');
    }
  }, [confirm, deleteAccountMutation, navigate, showToast]);

  /**
   * 이메일 알림 설정 변경 핸들러
   *
   * @param checked 이메일 알림 수신 여부
   */
  const handleEmailToggle = useCallback(
    async (checked: boolean) => {
      if (!user) {
        showToast('로그인이 필요합니다.');
        return;
      }
      if (!user.email) {
        showToast('연결된 이메일이 없습니다.');
        return;
      }

      try {
        await updateEmailSubscriptionMutation.mutateAsync({ isEmailSubscribed: checked });
        showToast(checked ? '이메일 알림을 켰습니다.' : '이메일 알림을 껐습니다.');
      } catch {
        showToast('이메일 알림 설정 변경에 실패했습니다.');
      }
    },
    [showToast, updateEmailSubscriptionMutation, user],
  );

  const isEmailToggleDisabled = !user?.email || updateEmailSubscriptionMutation.isPending || !user;

  return (
    <>
      {(logoutMutation.isPending || deleteAccountMutation.isPending) && <Loading />}
      <SettingContainer
        isDarkMode={isDarkMode}
        onDarkModeToggle={handleDarkModeToggle}
        soundVolume={soundVolume}
        onSoundVolumeChange={handleSoundVolumeChange}
        onLogout={handleLogout}
        onDeleteAccount={handleDeleteAccount}
        isEmailSubscribed={user?.isEmailSubscribed ?? false}
        email={user?.email ?? null}
        isEmailToggleDisabled={isEmailToggleDisabled}
        onEmailToggle={handleEmailToggle}
      />
    </>
  );
};
