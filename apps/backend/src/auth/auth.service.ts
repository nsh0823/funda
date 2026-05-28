import crypto from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';

import { CacheKeys } from '../common/cache/cache-keys';
import { RedisService } from '../common/redis/redis.service';
import { UserStepStatus } from '../progress/entities';
import { Step } from '../roadmap/entities';
import { User, UserRefreshToken } from '../users/entities';
import { AuthProvider, UserRole } from '../users/entities/user.entity';

import type { JwtPayload } from './types/jwt-payload.type';
import type { RequestMeta } from './types/request-meta.type';
import type { GithubProfile } from './github.strategy';
import type { GoogleProfile } from './google.strategy';

interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUserProfile;
}

type TokenPair = Pick<TokenPairResult, 'accessToken' | 'refreshToken'>;

export interface AuthUserProfile {
  id: number;
  displayName: string;
  email?: string | null;
  profileImageUrl?: string | null;
  role: UserRole;
  isEmailSubscribed: boolean;
  heartCount: number;
  maxHeartCount: number;
  experience: number;
  diamondCount: number;
  currentStreak: number;
  provider: AuthProvider;
}

@Injectable()
export class AuthService {
  private readonly refreshCookieName = 'refreshToken';

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserRefreshToken)
    private readonly refreshTokens: Repository<UserRefreshToken>,
    @InjectRepository(UserStepStatus)
    private readonly stepStatusRepository: Repository<UserStepStatus>,
    @InjectRepository(Step)
    private readonly stepRepository: Repository<Step>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * GitHub 프로필 기반으로 유저를 생성하거나 업데이트한 뒤 토큰을 발급한다.
   * Redis에 저장된 비로그인 사용자의 데이터를 동기화한다.
   */
  async handleGithubLogin(
    profile: GithubProfile,
    meta: RequestMeta,
    clientId?: string,
  ): Promise<TokenPairResult> {
    const user = await this.upsertGithubUser(profile);
    return this.completeOAuthLogin(user, meta, clientId);
  }

  /**
   * Google profile based login. Creates or updates a user, then issues tokens.
   * Redis에 저장된 비로그인 사용자의 데이터를 동기화한다.
   */
  async handleGoogleLogin(
    profile: GoogleProfile,
    meta: RequestMeta,
    clientId?: string,
  ): Promise<TokenPairResult> {
    const user = await this.upsertGoogleUser(profile);
    return this.completeOAuthLogin(user, meta, clientId);
  }

  private async completeOAuthLogin(
    user: User,
    meta: RequestMeta,
    clientId?: string,
  ): Promise<TokenPairResult> {
    await this.recoverHeart(user);

    // Redis에서 비로그인 사용자의 데이터 동기화
    if (clientId) {
      // 1. step_ids 동기화
      const stepIdsData = await this.redisService.get(CacheKeys.guestStepIds(clientId));
      if (stepIdsData) {
        const stepIds = stepIdsData as number[];

        for (const stepId of stepIds) {
          const existingStatus = await this.stepStatusRepository.findOne({
            where: { userId: user.id, step: { id: stepId } },
          });

          if (!existingStatus) {
            const step = await this.stepRepository.findOne({ where: { id: stepId } });
            if (step) {
              const stepStatus = this.stepStatusRepository.create({
                userId: user.id,
                step,
                isCompleted: true,
                bestScore: null,
                successRate: null,
              });
              await this.stepStatusRepository.save(stepStatus);
            }
          }
        }

        // Redis step_ids 삭제
        await this.redisService.del(CacheKeys.guestStepIds(clientId));
      }

      // 2. heart 동기화
      const heartFromRedis = await this.redisService.get(CacheKeys.guestHeart(clientId));

      if (heartFromRedis !== null && heartFromRedis !== undefined) {
        const heartValue =
          typeof heartFromRedis === 'number'
            ? heartFromRedis
            : parseInt(heartFromRedis as string, 10);
        user.heartCount = heartValue;
        await this.users.save(user);

        // Redis heart 삭제
        await this.redisService.del(CacheKeys.guestHeart(clientId));
      }
    }

    const { accessToken, refreshToken } = await this.issueTokens(user, meta);

    return {
      accessToken,
      refreshToken,
      user: this.toAuthUserProfile(user),
    };
  }

  /**
   * 리프레시 토큰을 검증하고 재발급한다.
   */
  async rotateRefreshToken(
    userId: number,
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<TokenPairResult> {
    const tokenRecord = await this.findActiveRefreshToken(userId, refreshToken);
    if (!tokenRecord) {
      throw new UnauthorizedException('유효하지 않은 리프레시 토큰입니다.');
    }

    tokenRecord.revokedAt = new Date();
    tokenRecord.lastUsedAt = new Date();
    await this.refreshTokens.save(tokenRecord);

    const user = await this.users.findOne({
      where: { id: userId },
      relations: { profileCharacter: true },
    });
    if (!user) {
      throw new UnauthorizedException('유저 정보를 찾을 수 없습니다.');
    }

    await this.recoverHeart(user);
    const { accessToken, refreshToken: newRefreshToken } = await this.issueTokens(user, meta);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: this.toAuthUserProfile(user),
    };
  }

  /**
   * 주어진 리프레시 토큰을 무효화한다.
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const record = await this.refreshTokens.findOne({
      where: { tokenHash },
    });

    if (!record) {
      return;
    }

    record.revokedAt = new Date();
    record.lastUsedAt = new Date();
    await this.refreshTokens.save(record);
  }

  /**
   * HttpOnly 리프레시 쿠키를 설정한다.
   */
  attachRefreshTokenCookie(response: Response, refreshToken: string): void {
    const refreshTtlSeconds = this.configService.get<number>('JWT_REFRESH_TTL', 60 * 60 * 24 * 30);
    const maxAgeMs = refreshTtlSeconds * 1000;
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie(this.refreshCookieName, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });
  }

  /**
   * HttpOnly Secure 액세스 토큰 쿠키를 설정한다.
   */
  attachAccessTokenCookie(response: Response, accessToken: string): void {
    const accessTtlSeconds = this.configService.get<number>('JWT_ACCESS_TTL', 60 * 15); // 기본 15분
    const maxAgeMs = accessTtlSeconds * 1000;
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: maxAgeMs,
      path: '/',
    });
  }

  /**
   * 리프레시 쿠키를 제거한다.
   */
  clearRefreshTokenCookie(response: Response): void {
    response.clearCookie(this.refreshCookieName, { path: '/' });
  }

  /**
   * 액세스 토큰 쿠키를 제거한다.
   */
  clearAccessTokenCookie(response: Response): void {
    response.clearCookie('accessToken', { path: '/' });
  }

  private async upsertGithubUser(profile: GithubProfile): Promise<User> {
    const existingUser = await this.users.findOne({
      where: {
        provider: AuthProvider.GITHUB,
        providerUserId: profile.id,
      },
    });

    if (existingUser) {
      existingUser.displayName = this.pickDisplayName(profile);
      existingUser.profileImageUrl = this.pickAvatar(profile);
      existingUser.email = this.pickEmail(profile);
      existingUser.lastLoginAt = new Date();

      return this.users.save(existingUser);
    }

    const newUser = this.users.create({
      provider: AuthProvider.GITHUB,
      providerUserId: profile.id,
      displayName: this.pickDisplayName(profile),
      profileImageUrl: this.pickAvatar(profile),
      email: this.pickEmail(profile),
      role: UserRole.USER,
      lastLoginAt: new Date(),
    });

    return this.users.save(newUser);
  }

  private async upsertGoogleUser(profile: GoogleProfile): Promise<User> {
    const existingUser = await this.users.findOne({
      where: {
        provider: AuthProvider.GOOGLE,
        providerUserId: profile.id,
      },
    });

    if (existingUser) {
      existingUser.displayName = this.pickGoogleDisplayName(profile);
      existingUser.profileImageUrl = this.pickAvatar(profile);
      existingUser.email = this.pickEmail(profile);
      existingUser.lastLoginAt = new Date();

      return this.users.save(existingUser);
    }

    const newUser = this.users.create({
      provider: AuthProvider.GOOGLE,
      providerUserId: profile.id,
      displayName: this.pickGoogleDisplayName(profile),
      profileImageUrl: this.pickAvatar(profile),
      email: this.pickEmail(profile),
      role: UserRole.USER,
      lastLoginAt: new Date(),
    });

    return this.users.save(newUser);
  }

  private async issueTokens(user: User, meta: RequestMeta): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      provider: user.provider,
    };

    const accessToken = await this.signAccessToken(payload);
    const refreshToken = await this.signRefreshToken(payload);

    await this.persistRefreshToken(user, refreshToken, meta);

    return { accessToken, refreshToken };
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  private async signRefreshToken(payload: JwtPayload): Promise<string> {
    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'local-refresh-secret',
    );
    const refreshTtlSeconds = this.configService.get<number>('JWT_REFRESH_TTL', 60 * 60 * 24 * 30);

    return this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      expiresIn: `${refreshTtlSeconds}s`,
    });
  }

  private async persistRefreshToken(
    user: User,
    refreshToken: string,
    meta: RequestMeta,
  ): Promise<void> {
    const refreshTtlSeconds = this.configService.get<number>('JWT_REFRESH_TTL', 60 * 60 * 24 * 30);
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);
    const hashed = this.hashToken(refreshToken);

    const record = this.refreshTokens.create({
      user,
      tokenHash: hashed,
      issuedAt: new Date(),
      expiresAt,
      lastUsedAt: new Date(),
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    });

    await this.refreshTokens.save(record);
  }

  private async findActiveRefreshToken(
    userId: number,
    refreshToken: string,
  ): Promise<UserRefreshToken | null> {
    const hashed = this.hashToken(refreshToken);
    const now = new Date();

    const record = await this.refreshTokens.findOne({
      where: {
        userId,
        tokenHash: hashed,
      },
    });

    if (!record) {
      return null;
    }

    if (record.revokedAt) {
      return null;
    }

    if (record.expiresAt.getTime() < now.getTime()) {
      return null;
    }

    return record;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private pickEmail(profile: GithubProfile | GoogleProfile): string | null {
    if (!profile.emails || profile.emails.length === 0) {
      return null;
    }

    const primaryEmail =
      profile.emails.find(email => 'primary' in email && email.primary) ?? profile.emails[0];
    if (!primaryEmail || typeof primaryEmail.value !== 'string') {
      return null;
    }

    return primaryEmail.value;
  }

  private pickAvatar(profile: GithubProfile | GoogleProfile): string | null {
    if (!profile.photos || profile.photos.length === 0) {
      return null;
    }

    const firstPhoto = profile.photos[0];
    if (!firstPhoto || typeof firstPhoto.value !== 'string') {
      return null;
    }

    return firstPhoto.value;
  }

  private pickDisplayName(profile: GithubProfile): string {
    if (profile.displayName && profile.displayName.trim().length > 0) {
      return profile.displayName;
    }

    if (profile.username && profile.username.trim().length > 0) {
      return profile.username;
    }

    return 'GitHub User';
  }

  private pickGoogleDisplayName(profile: GoogleProfile): string {
    if (profile.displayName && profile.displayName.trim().length > 0) {
      return profile.displayName;
    }

    const email = this.pickEmail(profile);
    if (email) {
      return email.split('@')[0] ?? email;
    }

    return 'Google User';
  }

  /**
   * ID로 유저를 조회한다.
   */
  async getUserById(userId: number): Promise<User | null> {
    return this.users.findOne({
      where: { id: userId },
      relations: { profileCharacter: true },
    });
  }

  /**
   * Heart를 회복한다 (10분마다 1개씩, 최대 maxHeartCount까지).
   * @param user 사용자
   */
  async recoverHeartPublic(user: User): Promise<void> {
    return this.recoverHeart(user);
  }

  /**
   * Heart를 회복한다 (10분마다 1개씩, 최대 maxHeartCount까지).
   * @param user 사용자
   */
  private async recoverHeart(user: User): Promise<void> {
    const now = new Date();
    const lastSyncedTime = user.lastHeartSyncedAt.getTime();
    const elapsedMilliseconds = now.getTime() - lastSyncedTime;
    const elapsedSeconds = Math.floor(elapsedMilliseconds / 1000);

    // 10분(600초) 단위로 heart 회복 횟수 계산
    const recoveryIntervalSeconds = 10 * 60; // 10분
    const recoveryCount = Math.floor(elapsedSeconds / recoveryIntervalSeconds);

    if (recoveryCount > 0) {
      // 회복할 heart 수 계산
      const newHeartCount = Math.min(user.heartCount + recoveryCount, user.maxHeartCount);

      // heart 회복 및 lastHeartSyncedAt 업데이트
      user.heartCount = newHeartCount;
      user.lastHeartSyncedAt = now;

      await this.users.save(user);
    }
  }

  /**
   * User 엔티티를 AuthUserProfile로 변환한다.
   */
  toAuthUserProfile(user: User): AuthUserProfile {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email ?? null,
      profileImageUrl: user.profileCharacter?.imageUrl ?? user.profileImageUrl ?? null,
      role: user.role,
      isEmailSubscribed: user.isEmailSubscribed,
      heartCount: user.heartCount,
      maxHeartCount: user.maxHeartCount,
      experience: user.experience,
      diamondCount: user.diamondCount,
      currentStreak: user.currentStreak,
      provider: user.provider,
    };
  }
}
