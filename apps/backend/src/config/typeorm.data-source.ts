import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { DataSource, type DataSourceOptions } from 'typeorm';

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

const loadEnvironment = (): void => {
  const environment = process.env.NODE_ENV ?? 'development';
  loadEnv({ path: `.env.${environment}` });
  loadEnv({ path: '.env' });
};

loadEnvironment();

const createDataSourceOptions = (): DataSourceOptions => {
  const isProduction = process.env.NODE_ENV === 'production';
  const migrationExtension = isProduction ? 'js' : 'ts';
  const entityPaths = [path.join(__dirname, '..', '**', '*.entity.{ts,js}')];

  return {
    type: 'mysql',
    host: process.env.DB_HOST ?? 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'app',
    // 엔티티를 추가할 때마다 목록을 수정하지 않도록 글롭 패턴으로 자동 로드한다.
    entities: entityPaths,
    migrations: [path.join(__dirname, '..', 'migrations', `*.${migrationExtension}`)],
    synchronize: false,
    logging: process.env.NODE_ENV !== 'production',
    ssl: toBool(process.env.DB_SSL)
      ? {
          rejectUnauthorized: toBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, true),
        }
      : undefined,
  };
};

export const AppDataSource = new DataSource(createDataSourceOptions());
