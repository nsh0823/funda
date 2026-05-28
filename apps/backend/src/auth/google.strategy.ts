import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { type Profile, Strategy } from 'passport-google-oauth20';

/**
 * Google OAuth strategy.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID', ''),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET', ''),
      callbackURL: configService.get<string>(
        'GOOGLE_CALLBACK_URL',
        'http://localhost:3000/api/auth/google/callback',
      ),
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile): GoogleProfile {
    const emails = profile.emails?.map(email => ({
      value: email.value,
      verified: email.verified,
    }));
    const photos = profile.photos?.map(photo => ({ value: photo.value }));

    return {
      id: profile.id,
      displayName: profile.displayName ?? profile._json.name ?? '',
      profileUrl: profile.profileUrl ?? profile._json.profile,
      emails,
      photos,
      raw: profile._json,
      accessToken,
    };
  }
}

export interface GoogleProfile {
  id: string;
  displayName: string;
  profileUrl?: string;
  emails?: Array<{ value: string; verified?: boolean }>;
  photos?: Array<{ value: string }>;
  raw?: unknown;
  accessToken?: string;
}
