import type { QueryRunner } from 'typeorm';

import 'reflect-metadata';

import { getKstNow, getKstWeekInfo } from '../common/utils/kst-date';
import { AppDataSource } from '../config/typeorm.data-source';

interface DemoRankingUser {
  providerUserId: string;
  email: string;
  displayName: string;
  tierName: string;
  xp: number;
  solvedCount: number;
  experience: number;
  diamondCount: number;
  currentStreak: number;
  avatarSeed: string;
}

interface IdRow {
  id: number | string;
}

const demoUsers: DemoRankingUser[] = [
  {
    providerUserId: 'demo-ranking-algo-master',
    email: 'demo.algo.master@funda.local',
    displayName: '알고마스터',
    tierName: 'MASTER',
    xp: 980,
    solvedCount: 39,
    experience: 12400,
    diamondCount: 620,
    currentStreak: 21,
    avatarSeed: 'algo-master',
  },
  {
    providerUserId: 'demo-ranking-cloud-runner',
    email: 'demo.cloud.runner@funda.local',
    displayName: '클라우드러너',
    tierName: 'RUBY',
    xp: 760,
    solvedCount: 31,
    experience: 9800,
    diamondCount: 470,
    currentStreak: 16,
    avatarSeed: 'cloud-runner',
  },
  {
    providerUserId: 'demo-ranking-react-nova',
    email: 'demo.react.nova@funda.local',
    displayName: '리액트노바',
    tierName: 'SAPPHIRE',
    xp: 620,
    solvedCount: 26,
    experience: 8100,
    diamondCount: 390,
    currentStreak: 14,
    avatarSeed: 'react-nova',
  },
  {
    providerUserId: 'demo-ranking-api-smith',
    email: 'demo.api.smith@funda.local',
    displayName: 'API장인',
    tierName: 'GOLD',
    xp: 510,
    solvedCount: 22,
    experience: 6800,
    diamondCount: 310,
    currentStreak: 11,
    avatarSeed: 'api-smith',
  },
  {
    providerUserId: 'demo-ranking-ts-keeper',
    email: 'demo.ts.keeper@funda.local',
    displayName: '타입지킴이',
    tierName: 'GOLD',
    xp: 450,
    solvedCount: 19,
    experience: 6100,
    diamondCount: 290,
    currentStreak: 9,
    avatarSeed: 'ts-keeper',
  },
  {
    providerUserId: 'demo-ranking-data-scout',
    email: 'demo.data.scout@funda.local',
    displayName: '데이터스카웃',
    tierName: 'SILVER',
    xp: 310,
    solvedCount: 14,
    experience: 4200,
    diamondCount: 180,
    currentStreak: 7,
    avatarSeed: 'data-scout',
  },
  {
    providerUserId: 'demo-ranking-mobile-maker',
    email: 'demo.mobile.maker@funda.local',
    displayName: '모바일메이커',
    tierName: 'SILVER',
    xp: 280,
    solvedCount: 12,
    experience: 3900,
    diamondCount: 160,
    currentStreak: 6,
    avatarSeed: 'mobile-maker',
  },
  {
    providerUserId: 'demo-ranking-security-lee',
    email: 'demo.security.lee@funda.local',
    displayName: '보안이',
    tierName: 'SILVER',
    xp: 240,
    solvedCount: 10,
    experience: 3400,
    diamondCount: 140,
    currentStreak: 5,
    avatarSeed: 'security-lee',
  },
  {
    providerUserId: 'demo-ranking-css-garden',
    email: 'demo.css.garden@funda.local',
    displayName: 'CSS가든',
    tierName: 'BRONZE',
    xp: 190,
    solvedCount: 8,
    experience: 2600,
    diamondCount: 95,
    currentStreak: 4,
    avatarSeed: 'css-garden',
  },
  {
    providerUserId: 'demo-ranking-node-park',
    email: 'demo.node.park@funda.local',
    displayName: '노드박',
    tierName: 'BRONZE',
    xp: 150,
    solvedCount: 7,
    experience: 2100,
    diamondCount: 80,
    currentStreak: 3,
    avatarSeed: 'node-park',
  },
  {
    providerUserId: 'demo-ranking-cs-lee',
    email: 'demo.cs.lee@funda.local',
    displayName: 'CS이해왕',
    tierName: 'BRONZE',
    xp: 95,
    solvedCount: 5,
    experience: 1500,
    diamondCount: 55,
    currentStreak: 2,
    avatarSeed: 'cs-lee',
  },
  {
    providerUserId: 'demo-ranking-game-jang',
    email: 'demo.game.jang@funda.local',
    displayName: '게임장',
    tierName: 'BRONZE',
    xp: 40,
    solvedCount: 2,
    experience: 700,
    diamondCount: 25,
    currentStreak: 1,
    avatarSeed: 'game-jang',
  },
];

const getAvatarUrl = (seed: string): string =>
  `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;

const toNumberId = (value: number | string): number => Number(value);

const getSingleId = async (
  queryRunner: QueryRunner,
  query: string,
  params: unknown[],
): Promise<number> => {
  const rows = (await queryRunner.query(query, params)) as IdRow[];
  const id = rows[0]?.id;

  if (id === undefined) {
    throw new Error(`ID 조회에 실패했습니다: ${query}`);
  }

  return toNumberId(id);
};

const ensureRankingTiers = async (queryRunner: QueryRunner): Promise<void> => {
  await queryRunner.query(
    `
    INSERT INTO ranking_tiers (name, order_index, max_group_size)
    VALUES
      ('BRONZE', 1, 10),
      ('SILVER', 2, 10),
      ('GOLD', 3, 10),
      ('SAPPHIRE', 4, 10),
      ('RUBY', 5, 10),
      ('MASTER', 6, 10)
    ON DUPLICATE KEY UPDATE
      order_index = VALUES(order_index),
      max_group_size = VALUES(max_group_size);
    `,
  );

  await queryRunner.query(
    `
    INSERT INTO ranking_tier_rules (
      tier_id,
      promote_min_xp,
      demote_min_xp,
      promote_ratio,
      demote_ratio,
      is_master
    )
    SELECT id, 100, 0, 0.4, 0.0, false FROM ranking_tiers WHERE name = 'BRONZE'
    UNION ALL SELECT id, 150, 80, 0.3, 0.2, false FROM ranking_tiers WHERE name = 'SILVER'
    UNION ALL SELECT id, 300, 90, 0.3, 0.2, false FROM ranking_tiers WHERE name = 'GOLD'
    UNION ALL SELECT id, 450, 100, 0.3, 0.2, false FROM ranking_tiers WHERE name = 'SAPPHIRE'
    UNION ALL SELECT id, 550, 110, 0.3, 0.3, false FROM ranking_tiers WHERE name = 'RUBY'
    UNION ALL SELECT id, 99999999, 300, 0.0, 0.3, true FROM ranking_tiers WHERE name = 'MASTER'
    ON DUPLICATE KEY UPDATE
      promote_min_xp = VALUES(promote_min_xp),
      demote_min_xp = VALUES(demote_min_xp),
      promote_ratio = VALUES(promote_ratio),
      demote_ratio = VALUES(demote_ratio),
      is_master = VALUES(is_master);
    `,
  );
};

const seedDemoRanking = async (): Promise<void> => {
  const dataSource = await AppDataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  const weekInfo = getKstWeekInfo(getKstNow());

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    await ensureRankingTiers(queryRunner);

    await queryRunner.query(
      `
      INSERT INTO ranking_weeks (week_key, starts_at, ends_at, status)
      VALUES (?, ?, ?, 'OPEN')
      ON DUPLICATE KEY UPDATE
        starts_at = VALUES(starts_at),
        ends_at = VALUES(ends_at),
        status = IF(status = 'ARCHIVED', status, 'OPEN');
      `,
      [weekInfo.weekKey, weekInfo.startsAt, weekInfo.endsAt],
    );

    const weekId = await getSingleId(
      queryRunner,
      'SELECT id FROM ranking_weeks WHERE week_key = ?',
      [weekInfo.weekKey],
    );

    const tierIdByName = new Map<string, number>();
    const tierNames = [...new Set(demoUsers.map(user => user.tierName))];

    for (const tierName of tierNames) {
      const tierId = await getSingleId(queryRunner, 'SELECT id FROM ranking_tiers WHERE name = ?', [
        tierName,
      ]);
      tierIdByName.set(tierName, tierId);

      const groupCapacity = Math.max(
        10,
        demoUsers.filter(user => user.tierName === tierName).length,
      );

      await queryRunner.query(
        `
        INSERT INTO ranking_groups (week_id, tier_id, group_index, capacity)
        VALUES (?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE
          capacity = VALUES(capacity);
        `,
        [weekId, tierId, groupCapacity],
      );
    }

    for (const [index, demoUser] of demoUsers.entries()) {
      const tierId = tierIdByName.get(demoUser.tierName);
      if (!tierId) {
        throw new Error(`티어 정보를 찾을 수 없습니다: ${demoUser.tierName}`);
      }

      const solvedAt = new Date(weekInfo.startsAt.getTime() + (index + 1) * 6 * 60 * 60 * 1000);
      const joinedAt = new Date(weekInfo.startsAt.getTime() + index * 35 * 60 * 1000);

      await queryRunner.query(
        `
        INSERT INTO users (
          provider,
          provider_user_id,
          email,
          display_name,
          current_tier_id,
          profile_image_url,
          role,
          experience,
          heart_count,
          max_heart_count,
          diamond_count,
          current_streak,
          last_login_at
        )
        VALUES (
          'google',
          ?,
          ?,
          ?,
          ?,
          ?,
          'user',
          ?,
          5,
          5,
          ?,
          ?,
          ?
        )
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          display_name = VALUES(display_name),
          current_tier_id = VALUES(current_tier_id),
          profile_image_url = VALUES(profile_image_url),
          experience = VALUES(experience),
          diamond_count = VALUES(diamond_count),
          current_streak = VALUES(current_streak),
          last_login_at = VALUES(last_login_at);
        `,
        [
          demoUser.providerUserId,
          demoUser.email,
          demoUser.displayName,
          tierId,
          getAvatarUrl(demoUser.avatarSeed),
          demoUser.experience,
          demoUser.diamondCount,
          demoUser.currentStreak,
          solvedAt,
        ],
      );

      const userId = await getSingleId(
        queryRunner,
        "SELECT id FROM users WHERE provider = 'google' AND provider_user_id = ?",
        [demoUser.providerUserId],
      );
      const groupId = await getSingleId(
        queryRunner,
        'SELECT id FROM ranking_groups WHERE week_id = ? AND tier_id = ? AND group_index = 1',
        [weekId, tierId],
      );

      await queryRunner.query(
        `
        INSERT INTO ranking_group_members (week_id, tier_id, group_id, user_id, joined_at)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          tier_id = VALUES(tier_id),
          group_id = VALUES(group_id),
          joined_at = VALUES(joined_at);
        `,
        [weekId, tierId, groupId, userId, joinedAt],
      );

      await queryRunner.query(
        `
        INSERT INTO ranking_weekly_xp (
          week_id,
          user_id,
          tier_id,
          xp,
          solved_count,
          first_solved_at,
          last_solved_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          tier_id = VALUES(tier_id),
          xp = VALUES(xp),
          solved_count = VALUES(solved_count),
          first_solved_at = VALUES(first_solved_at),
          last_solved_at = VALUES(last_solved_at);
        `,
        [weekId, userId, tierId, demoUser.xp, demoUser.solvedCount, solvedAt, solvedAt],
      );
    }

    await queryRunner.commitTransaction();
    console.info(`[seed-demo-ranking] ${weekInfo.weekKey} 주차 데모 랭킹 데이터 생성 완료`);
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
};

seedDemoRanking().catch(error => {
  console.error('[seed-demo-ranking] 실패:', error);
  process.exit(1);
});
