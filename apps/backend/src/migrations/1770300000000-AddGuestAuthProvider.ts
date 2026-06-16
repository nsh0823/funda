import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestAuthProvider1770300000000 implements MigrationInterface {
  name = 'AddGuestAuthProvider1770300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`provider\` enum ('github', 'google', 'guest') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM \`users\` WHERE \`provider\` = 'guest'`);
    await queryRunner.query(
      `ALTER TABLE \`users\` MODIFY \`provider\` enum ('github', 'google') NOT NULL`,
    );
  }
}
