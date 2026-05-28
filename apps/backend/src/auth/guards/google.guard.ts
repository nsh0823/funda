import { ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Google OAuth flow guard with clearer failure logging.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ): TUser {
    if (err) {
      this.logger.error(`Google OAuth processing failed: ${String(err)}`);
      throw err;
    }

    if (!user) {
      const request = context.switchToHttp().getRequest();
      const code = request.query?.code as string | undefined;
      this.logger.error(
        `Google OAuth authentication failed. code=${code ?? 'none'}, info=${JSON.stringify(info)}`,
      );
      throw new UnauthorizedException('Google 인증에 실패했습니다.');
    }

    return user;
  }
}
