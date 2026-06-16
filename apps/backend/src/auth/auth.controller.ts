import { Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

import { CacheKeys } from '../common/cache/cache-keys';
import { RedisService } from '../common/redis/redis.service';

import { GithubAuthGuard } from './guards/github.guard';
import { GoogleAuthGuard } from './guards/google.guard';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { JwtPayload } from './types/jwt-payload.type';
import type { RequestMeta } from './types/request-meta.type';
import { AuthService, type AuthUserProfile } from './auth.service';
import type { GithubProfile } from './github.strategy';
import type { GoogleProfile } from './google.strategy';
import type { RefreshRequestUser } from './jwt-refresh.strategy';

type GithubRequest = {
  user?: GithubProfile;
  headers?: Record<string, unknown>;
  ip?: string;
  cookies?: Record<string, string>;
};

type GoogleRequest = {
  user?: GoogleProfile;
  headers?: Record<string, unknown>;
  ip?: string;
  cookies?: Record<string, string>;
};

type RefreshRequest = {
  user?: RefreshRequestUser;
  headers?: Record<string, unknown>;
  ip?: string;
};

type LogoutRequest = {
  cookies?: Record<string, string>;
};

type RequestWithMeta = {
  headers?: Record<string, unknown>;
  ip?: string;
};

type AccessRequest = {
  user?: JwtPayload;
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly clientRedirectBase: string;
  private readonly clientRedirectPath: string;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const origin = this.configService.get<string>('CLIENT_ORIGIN');
    if (!origin) {
      throw new Error('CLIENT_ORIGIN 환경변수가 설정되어 있지 않습니다.');
    }

    this.clientRedirectBase = origin;
    this.clientRedirectPath = this.configService.get<string>(
      'CLIENT_LOGIN_REDIRECT_PATH',
      '/login/callback',
    );
  }

  @Get('guest-id')
  @ApiOperation({
    summary: '비로그인 사용자 ID 발급',
    description: '비로그인 사용자에게 고유한 client_id를 발급한다.',
  })
  @ApiOkResponse({
    description: 'client_id 발급 성공',
    schema: {
      example: {
        clientId: 'uuid-string-here',
      },
    },
  })
  getGuestId(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): { clientId: string } {
    // 기존 client_id가 있으면 재사용
    const existingClientId = req.cookies?.client_id;
    const clientId = existingClientId || uuidv4();

    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    res.cookie('client_id', clientId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30일
      path: '/',
    });

    return { clientId };
  }

  @Get('guest-heart')
  @ApiOperation({
    summary: '비로그인 사용자 하트 조회',
    description: 'Redis에서 비로그인 사용자의 하트 값을 조회한다.',
  })
  @ApiOkResponse({
    description: '하트 조회 성공',
    schema: {
      example: {
        heartCount: 5,
      },
    },
  })
  async getGuestHeart(
    @Req() req: Request & { cookies?: Record<string, string> },
  ): Promise<{ heartCount: number }> {
    const clientId = req.cookies?.client_id;
    if (!clientId) {
      return { heartCount: 5 }; // 기본값
    }

    const heartFromRedis = await this.redisService.get(CacheKeys.guestHeart(clientId));
    const heartCount = (heartFromRedis as number) ?? 5;

    return { heartCount };
  }

  @Post('guest')
  @ApiOperation({
    summary: '게스트 로그인',
    description: '채용 담당자 등이 로그인 전용 기능을 확인할 수 있도록 게스트 유저로 로그인한다.',
  })
  @ApiOkResponse({
    description: '게스트 로그인 성공',
    schema: {
      example: {
        success: true,
        code: 200,
        message: '게스트로 로그인했습니다.',
        result: {
          user: {
            id: 1,
            displayName: 'Guest',
            email: null,
            profileImageUrl: null,
            role: 'user',
            isEmailSubscribed: false,
            heartCount: 5,
            maxHeartCount: 5,
            experience: 0,
            diamondCount: 0,
            currentStreak: 0,
            provider: 'guest',
          },
        },
      },
    },
  })
  async guestLogin(
    @Req() req: Request & { cookies?: Record<string, string> },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ result: { user: AuthUserProfile }; message: string }> {
    const clientId = this.ensureClientIdCookie(req, res);
    const meta = this.toRequestMeta(req);
    const { accessToken, refreshToken, user } = await this.authService.handleGuestLogin(
      clientId,
      meta,
    );

    this.authService.attachRefreshTokenCookie(res, refreshToken);
    this.authService.attachAccessTokenCookie(res, accessToken);

    return {
      result: {
        user,
      },
      message: '게스트로 로그인했습니다.',
    };
  }

  @Get('github')
  @ApiOperation({
    summary: 'GitHub OAuth 로그인 시작',
    description: 'GitHub 로그인 페이지로 리다이렉트한다.',
  })
  @ApiOkResponse({ description: 'GitHub로 리다이렉트됩니다.' })
  @UseGuards(GithubAuthGuard)
  githubLogin(): void {
    // GitHub OAuth 로그인 URL로 리다이렉트된다. 로직은 Strategy에서 처리
  }

  @Get('github/callback')
  @ApiOperation({
    summary: 'GitHub OAuth 콜백',
    description:
      'GitHub 인증 코드를 처리하고 리프레시 토큰과 액세스 토큰 쿠키를 설정한 뒤 클라이언트로 리다이렉트한다.',
  })
  @ApiOkResponse({ description: '클라이언트로 리다이렉트됩니다.' })
  @ApiUnauthorizedResponse({ description: 'GitHub 인증 실패' })
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: GithubRequest, @Res({ passthrough: true }) res: Response) {
    if (!req.user) {
      throw new UnauthorizedException('GitHub 프로필 정보를 확인할 수 없습니다.');
    }

    const meta = this.toRequestMeta(req);
    const clientId = req.cookies?.client_id;
    const { accessToken, refreshToken } = await this.authService.handleGithubLogin(
      req.user,
      meta,
      clientId,
    );

    this.authService.attachRefreshTokenCookie(res, refreshToken);
    this.authService.attachAccessTokenCookie(res, accessToken);

    const redirectUrl = this.buildRedirectUrl();
    return res.redirect(redirectUrl);
  }

  @Get('google')
  @ApiOperation({
    summary: 'Google OAuth 로그인 시작',
    description: 'Google 로그인 페이지로 리다이렉트한다.',
  })
  @ApiOkResponse({ description: 'Google로 리다이렉트됩니다.' })
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Google OAuth 로그인 URL로 리다이렉트된다. 로직은 Strategy에서 처리
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth 콜백',
    description:
      'Google 인증 코드를 처리하고 리프레시 토큰과 액세스 토큰 쿠키를 설정한 뒤 클라이언트로 리다이렉트한다.',
  })
  @ApiOkResponse({ description: '클라이언트로 리다이렉트됩니다.' })
  @ApiUnauthorizedResponse({ description: 'Google 인증 실패' })
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req: GoogleRequest, @Res({ passthrough: true }) res: Response) {
    return this.handleGoogleCallback(req, res);
  }

  private async handleGoogleCallback(req: GoogleRequest, res: Response) {
    if (!req.user) {
      throw new UnauthorizedException('Google 프로필 정보를 확인할 수 없습니다.');
    }

    const meta = this.toRequestMeta(req);
    const clientId = req.cookies?.client_id;
    const { accessToken, refreshToken } = await this.authService.handleGoogleLogin(
      req.user,
      meta,
      clientId,
    );

    this.authService.attachRefreshTokenCookie(res, refreshToken);
    this.authService.attachAccessTokenCookie(res, accessToken);

    const redirectUrl = this.buildRedirectUrl();
    return res.redirect(redirectUrl);
  }

  @Post('refresh')
  @ApiOperation({
    summary: '액세스 토큰 재발급',
    description:
      '리프레시 토큰 쿠키를 검증해 새 액세스 토큰과 리프레시 토큰을 발급한다. 액세스 토큰과 리프레시 토큰은 쿠키로 설정되고, 응답 바디에 유저 정보를 반환한다.',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: '액세스 토큰 재발급 성공',
    schema: {
      example: {
        success: true,
        code: 200,
        message: '액세스 토큰을 재발급했습니다.',
        result: {
          user: {
            id: 1,
            displayName: '사용자',
            email: 'user@example.com',
            profileImageUrl: 'https://example.com/avatar.png',
            role: 'user',
            heartCount: 5,
            maxHeartCount: 5,
            experience: 0,
            diamondCount: 0,
            currentStreak: 0,
            provider: 'github',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '리프레시 토큰이 없거나 유효하지 않음' })
  @UseGuards(JwtRefreshGuard)
  async refresh(@Req() req: RefreshRequest, @Res({ passthrough: true }) res: Response) {
    if (!req.user) {
      throw new UnauthorizedException('리프레시 토큰을 확인할 수 없습니다.');
    }

    const meta = this.toRequestMeta(req);
    const { accessToken, refreshToken, user } = await this.authService.rotateRefreshToken(
      req.user.sub,
      req.user.refreshToken,
      meta,
    );

    this.authService.attachRefreshTokenCookie(res, refreshToken);
    this.authService.attachAccessTokenCookie(res, accessToken);

    return {
      result: {
        user,
      },
      message: '액세스 토큰을 재발급했습니다.',
    };
  }

  @Post('logout')
  @ApiOperation({
    summary: '로그아웃',
    description: '리프레시 토큰을 폐기하고 모든 인증 쿠키를 삭제한다.',
  })
  @ApiOkResponse({
    description: '로그아웃 완료',
    schema: {
      example: {
        success: true,
        code: 200,
        message: '로그아웃되었습니다.',
        result: {
          success: true,
        },
      },
    },
  })
  async logout(@Req() req: LogoutRequest, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    this.authService.clearRefreshTokenCookie(res);
    this.authService.clearAccessTokenCookie(res);

    return {
      result: {
        success: true,
      },
      message: '로그아웃되었습니다.',
    };
  }

  @Get('me')
  @ApiOperation({
    summary: '현재 사용자 정보 조회',
    description: '액세스 토큰을 기반으로 현재 로그인한 사용자의 정보를 반환한다.',
  })
  @ApiBearerAuth()
  @ApiOkResponse({
    description: '사용자 정보 조회 성공',
    schema: {
      example: {
        success: true,
        code: 200,
        message: '사용자 정보를 조회했습니다.',
        result: {
          user: {
            id: 1,
            displayName: '사용자',
            email: 'user@example.com',
            profileImageUrl: 'https://example.com/avatar.png',
            role: 'user',
            isEmailSubscribed: true,
            heartCount: 5,
            maxHeartCount: 5,
            experience: 0,
            currentStreak: 0,
            provider: 'github',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: '액세스 토큰이 없거나 유효하지 않음' })
  @UseGuards(JwtAccessGuard)
  async getMe(
    @Req() req: AccessRequest,
  ): Promise<{ result: { user: AuthUserProfile }; message: string }> {
    if (!req.user) {
      throw new UnauthorizedException('액세스 토큰을 확인할 수 없습니다.');
    }

    const user = await this.authService.getUserById(req.user.sub);
    if (!user) {
      throw new UnauthorizedException('유저 정보를 찾을 수 없습니다.');
    }

    // Heart 회복 처리
    await this.authService.recoverHeartPublic(user);

    return {
      result: {
        user: this.authService.toAuthUserProfile(user),
      },
      message: '사용자 정보를 조회했습니다.',
    };
  }

  /**
   * 요청 메타데이터(UA, IP)를 추출한다. 토큰 재사용 감지 시 참고한다.
   */
  private toRequestMeta(request: RequestWithMeta): RequestMeta {
    const userAgentHeader = request.headers?.['user-agent'];
    const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : undefined;
    const ipAddress = typeof request.ip === 'string' ? request.ip : undefined;

    return { userAgent, ipAddress };
  }

  private ensureClientIdCookie(
    req: Request & { cookies?: Record<string, string> },
    res: Response,
  ): string {
    const existingClientId = req.cookies?.client_id;
    const clientId = existingClientId || uuidv4();

    if (!existingClientId) {
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

      res.cookie('client_id', clientId, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }

    return clientId;
  }

  private buildRedirectUrl(): string {
    const trimmedBase = this.clientRedirectBase.replace(/\/+$/, '');
    const normalizedPath = this.clientRedirectPath.startsWith('/')
      ? this.clientRedirectPath
      : `/${this.clientRedirectPath}`;

    return `${trimmedBase}${normalizedPath}`;
  }
}
