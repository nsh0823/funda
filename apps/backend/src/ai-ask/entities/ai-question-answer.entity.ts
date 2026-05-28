import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  RelationId,
  UpdateDateColumn,
} from 'typeorm';

import { Quiz } from '../../roadmap/entities/quiz.entity';

export enum AiAnswerStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum AiProviderType {
  CLOVA = 'clova',
  GEMINI = 'gemini',
  HUGGINGFACE = 'huggingface',
}

@Entity({ name: 'ai_question_answers' })
@Index('IDX_ai_question_answers_quiz', ['quiz'])
@Index('IDX_ai_question_answers_quiz_created', ['quiz', 'createdAt'])
@Index('IDX_ai_question_answers_user', ['userId'])
export class AiQuestionAnswer {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Quiz, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;

  @RelationId((entry: AiQuestionAnswer) => entry.quiz)
  quizId!: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: number;

  @Column({ name: 'user_question', type: 'text' })
  userQuestion!: string;

  @Column({ name: 'ai_answer', type: 'text', nullable: true })
  aiAnswer?: string | null;

  @Column({ type: 'enum', enum: AiProviderType, default: AiProviderType.CLOVA })
  provider!: AiProviderType;

  @Column({ type: 'enum', enum: AiAnswerStatus, default: AiAnswerStatus.COMPLETED })
  status!: AiAnswerStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;
}
