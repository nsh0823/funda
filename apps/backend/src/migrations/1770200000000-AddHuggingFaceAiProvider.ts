import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHuggingFaceAiProvider1770200000000 implements MigrationInterface {
  name = 'AddHuggingFaceAiProvider1770200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`ai_question_answers\` MODIFY \`provider\` enum ('clova', 'gemini', 'huggingface') NOT NULL DEFAULT 'clova'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`ai_question_answers\` SET \`provider\` = 'clova' WHERE \`provider\` = 'huggingface'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`ai_question_answers\` MODIFY \`provider\` enum ('clova', 'gemini') NOT NULL DEFAULT 'clova'`,
    );
  }
}
