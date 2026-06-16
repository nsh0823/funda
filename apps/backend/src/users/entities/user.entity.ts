import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ProfileCharacter } from '../../profile/entities/profile-character.entity';
import { RankingTier } from '../../ranking/entities/ranking-tier.entity';

import { UserRefreshToken } from './user-refresh-token.entity';

export enum AuthProvider {
  GITHUB = 'github',
  GOOGLE = 'google',
  GUEST = 'guest',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Entity({ name: 'users' })
@Index('IDX_users_provider_account_unique', ['provider', 'providerUserId'], { unique: true })
@Index('IDX_users_email_unique', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'enum', enum: AuthProvider })
  provider!: AuthProvider;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 200 })
  providerUserId!: string;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email?: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ name: 'current_tier_id', type: 'int', nullable: true })
  currentTierId?: number | null;

  @ManyToOne(() => RankingTier, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'current_tier_id' })
  currentTier?: RankingTier | null;

  @Column({ name: 'profile_image_url', type: 'varchar', length: 500, nullable: true })
  profileImageUrl?: string | null;

  @Column({ name: 'profile_character_id', type: 'int', nullable: true })
  profileCharacterId?: number | null;

  @ManyToOne(() => ProfileCharacter, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'profile_character_id' })
  profileCharacter?: ProfileCharacter | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  // 불일치 문제 방지를 위해 레벨은 따로 저장하지 않고 경험치만 저장해서 계산 후 사용하도록.
  @Column({ type: 'int', default: 0 })
  experience!: number;

  @Column({ name: 'heart_count', type: 'int', default: 5 })
  heartCount!: number;

  // 아이템/보상/레벨업으로 증가 가능한 구조. 기본값은 5
  @Column({ name: 'max_heart_count', type: 'int', default: 5 })
  maxHeartCount!: number;

  @Column({ name: 'diamond_count', type: 'int', default: 0 })
  diamondCount!: number;

  // 하트는 일단 lazy 방식으로 하트 주기 계산을 위해 마지막 싱크 시각을 저장하도록.. 근데 나중에 수정될 수 있음
  @Column({
    name: 'last_heart_synced_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastHeartSyncedAt!: Date;

  @Column({ name: 'current_streak', type: 'int', default: 0 })
  currentStreak!: number;

  // streak 리셋 여부를 계산하기 위한 최근 기준 시각을 저장한다.
  @Column({ name: 'last_streak_updated_at', type: 'datetime', nullable: true })
  lastStreakUpdatedAt?: Date | null;

  // 일일 목표 보상 지급 여부를 확인하기 위한 최근 지급 시각
  @Column({ name: 'last_daily_goal_rewarded_at', type: 'datetime', nullable: true })
  lastDailyGoalRewardedAt?: Date | null;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date | null;

  @OneToMany(() => UserRefreshToken, token => token.user)
  refreshTokens?: UserRefreshToken[];

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  @Column({ name: 'is_email_subscribed', type: 'boolean', default: true })
  isEmailSubscribed!: boolean;

  @Column({ name: 'last_remind_email_sent_at', type: 'datetime', nullable: true })
  lastRemindEmailSentAt?: Date | null;
}
