import path from 'node:path';

import { ConfigService } from '@nestjs/config';
import { type DataSourceOptions } from 'typeorm';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
};

const toBool = (value: string | undefined, fallback = false): boolean => {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const entityPaths = [path.join(__dirname, '..', '**', '*.entity.{ts,js}')];

export const createTypeOrmOptions = (config: ConfigService): DataSourceOptions => ({
  type: 'mysql',
  host: config.get<string>('DB_HOST', 'localhost'),
  port: toInt(config.get<string>('DB_PORT'), 3306),
  username: config.get<string>('DB_USER', 'root'),
  password: config.get<string>('DB_PASSWORD', ''),
  database: config.get<string>('DB_NAME', 'app'),
  // 엔티티 추가 시마다 목록을 수정하지 않도록 글롭 패턴으로 자동 로드한다.
  entities: entityPaths,
  synchronize: false,
  logging: config.get<string>('NODE_ENV') !== 'production',
  ssl: toBool(config.get<string>('DB_SSL'))
    ? {
        rejectUnauthorized: toBool(config.get<string>('DB_SSL_REJECT_UNAUTHORIZED'), true),
      }
    : undefined,
});
