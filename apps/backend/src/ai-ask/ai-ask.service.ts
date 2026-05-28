import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindManyOptions, Not, Repository } from 'typeorm';

import { Quiz } from '../roadmap/entities/quiz.entity';

import { AiQuestionListQueryDto } from './dto/ai-question-list-query.dto';
import { CreateAiQuestionDto } from './dto/create-ai-question.dto';
import {
  AiAnswerStatus,
  AiProviderType,
  AiQuestionAnswer,
} from './entities/ai-question-answer.entity';
import { AiAskProviderService } from './ai-ask-provider.service';

export interface AiQuestionAnswerView {
  id: number;
  quizId: number;
  question: string;
  answer: string | null;
  status: AiAnswerStatus;
  createdAt: Date;
  isMine: boolean;
}

export interface AiQuestionStreamContext {
  initial: AiQuestionAnswerView;
  streamPromise: Promise<AiQuestionAnswerView>;
}

@Injectable()
export class AiAskService {
  private readonly logger = new Logger(AiAskService.name);

  constructor(
    @InjectRepository(AiQuestionAnswer)
    private readonly aiQuestionAnswerRepository: Repository<AiQuestionAnswer>,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    private readonly aiAskProviderService: AiAskProviderService,
  ) {}

  /**
   * 퀴즈별 AI 질문 목록을 최신순으로 조회한다.
   *
   * @param quizId - 조회할 퀴즈 ID
   * @param userId - 요청 사용자 ID (선택)
   * @param query - 조회 옵션
   * @returns AI 질문/답변 목록
   */
  async getAiQuestions(
    quizId: number,
    userId: number | null,
    query: AiQuestionListQueryDto,
  ): Promise<AiQuestionAnswerView[]> {
    await this.ensureQuizExists(quizId);

    const limit = query.limit;

    const findOptions: FindManyOptions<AiQuestionAnswer> = {
      where: { quiz: { id: quizId }, status: Not(AiAnswerStatus.FAILED) },
      order: { createdAt: 'DESC' },
      relations: ['quiz'],
    };

    if (limit) {
      findOptions.take = limit;
    }

    const entities = await this.aiQuestionAnswerRepository.find(findOptions);

    return entities.map(entity => this.toView(entity, userId));
  }

  /**
   * AI 질문을 생성하고 PENDING 상태로 저장한다.
   *
   * @param quizId - 질문을 남길 퀴즈 ID
   * @param userId - 질문 작성자 ID
   * @param dto - 질문 내용 DTO
   * @returns 저장된 질문 정보
   */
  async createAiQuestion(
    quizId: number,
    userId: number,
    dto: CreateAiQuestionDto,
  ): Promise<AiQuestionAnswerView> {
    const quiz = await this.ensureQuizExists(quizId);

    const trimmedQuestion = dto.question.trim();
    if (trimmedQuestion.length === 0) {
      throw new BadRequestException('질문 내용이 비어 있습니다.');
    }

    const provider = this.resolveProviderType();
    const entity = this.aiQuestionAnswerRepository.create({
      quiz,
      userId,
      userQuestion: trimmedQuestion,
      aiAnswer: null,
      provider,
      status: AiAnswerStatus.PENDING,
    });

    const saved = await this.aiQuestionAnswerRepository.save(entity);

    try {
      const aiAnswer = await this.aiAskProviderService.requestAnswer(quiz, trimmedQuestion);
      saved.aiAnswer = aiAnswer;
      saved.status = AiAnswerStatus.COMPLETED;
    } catch (error) {
      this.logger.error('AI 응답 생성 실패', error instanceof Error ? error.stack : undefined);
      saved.status = AiAnswerStatus.FAILED;
    }

    const updated = await this.aiQuestionAnswerRepository.save(saved);
    return this.toView(updated, userId);
  }

  /**
   * AI 질문을 생성하고 스트리밍 응답을 이어서 저장한다.
   *
   * @param quizId - 질문을 남길 퀴즈 ID
   * @param userId - 질문 작성자 ID
   * @param dto - 질문 내용 DTO
   * @param onChunk - 스트리밍 조각 콜백
   * @returns 초기 질문 정보와 스트리밍 완료 Promise
   */
  async createAiQuestionStream(
    quizId: number,
    userId: number,
    dto: CreateAiQuestionDto,
    onChunk: (chunk: string) => void,
  ): Promise<AiQuestionStreamContext> {
    const quiz = await this.ensureQuizExists(quizId);

    const trimmedQuestion = dto.question.trim();
    if (trimmedQuestion.length === 0) {
      throw new BadRequestException('질문 내용이 비어 있습니다.');
    }

    const provider = this.resolveProviderType();
    const entity = this.aiQuestionAnswerRepository.create({
      quiz,
      userId,
      userQuestion: trimmedQuestion,
      aiAnswer: null,
      provider,
      status: AiAnswerStatus.PENDING,
    });

    const saved = await this.aiQuestionAnswerRepository.save(entity);
    const initial = this.toView(saved, userId);

    const streamPromise = this.consumeAiStream(saved, quiz, trimmedQuestion, onChunk, userId);
    return { initial, streamPromise };
  }

  private toView(entity: AiQuestionAnswer, userId: number | null): AiQuestionAnswerView {
    const isMine = userId !== null && entity.userId === userId;
    const quizId = entity.quizId ?? entity.quiz?.id;
    if (quizId === undefined) {
      throw new Error('퀴즈 정보를 확인할 수 없습니다.');
    }

    return {
      id: entity.id,
      quizId,
      question: entity.userQuestion,
      answer: entity.aiAnswer ?? null,
      status: entity.status,
      createdAt: entity.createdAt,
      isMine,
    };
  }

  private async ensureQuizExists(quizId: number): Promise<Quiz> {
    const quiz = await this.quizRepository.findOne({ where: { id: quizId } });
    if (!quiz) {
      throw new NotFoundException('퀴즈 정보를 찾을 수 없습니다.');
    }

    return quiz;
  }

  private async consumeAiStream(
    entity: AiQuestionAnswer,
    quiz: Quiz,
    userQuestion: string,
    onChunk: (chunk: string) => void,
    userId: number,
  ): Promise<AiQuestionAnswerView> {
    try {
      const aiAnswer = await this.aiAskProviderService.requestAnswerStream(
        quiz,
        userQuestion,
        onChunk,
      );
      entity.aiAnswer = aiAnswer;
      entity.status = AiAnswerStatus.COMPLETED;
    } catch (error) {
      this.logger.error(
        'AI 스트리밍 응답 생성 실패',
        error instanceof Error ? error.stack : undefined,
      );
      entity.status = AiAnswerStatus.FAILED;
    }

    const updated = await this.aiQuestionAnswerRepository.save(entity);
    return this.toView(updated, userId);
  }

  private resolveProviderType(): AiProviderType {
    const provider = this.aiAskProviderService.getProviderType();
    if (provider === 'gemini') {
      return AiProviderType.GEMINI;
    }
    if (provider === 'huggingface') {
      return AiProviderType.HUGGINGFACE;
    }
    return AiProviderType.CLOVA;
  }
}
