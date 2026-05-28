import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { getKstNextDayStart, getKstNow } from '../common/utils/kst-date';
import { QuizContentService } from '../common/utils/quiz-content.service';
import { DEFAULT_SCORE_WEIGHTS } from '../common/utils/score-weights';
import { DEFAULT_TODAY_GOALS, TodayGoalsParams } from '../common/utils/today-goals';
import type { QuizResponse } from '../roadmap/dto/quiz-list.dto';
import { CheckpointQuizPool, Quiz, Step } from '../roadmap/entities';
import { User } from '../users/entities';

import { SolveLog } from './entities/solve-log.entity';
import { UserQuizStatus } from './entities/user-quiz-status.entity';
import { StepAttemptStatus, UserStepAttempt } from './entities/user-step-attempt.entity';
import { UserStepStatus } from './entities/user-step-status.entity';

const DEFAULT_REVIEW_QUEUE_LIMIT = 10;
const DAILY_GOAL_DIAMOND_REWARD = 1;

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(SolveLog)
    private readonly solveLogRepository: Repository<SolveLog>,
    @InjectRepository(UserStepAttempt)
    private readonly stepAttemptRepository: Repository<UserStepAttempt>,
    @InjectRepository(UserStepStatus)
    private readonly stepStatusRepository: Repository<UserStepStatus>,
    @InjectRepository(Step)
    private readonly stepRepository: Repository<Step>,
    @InjectRepository(CheckpointQuizPool)
    private readonly checkpointQuizPoolRepository: Repository<CheckpointQuizPool>,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserQuizStatus)
    private readonly userQuizStatusRepository: Repository<UserQuizStatus>,
    private readonly quizContentService: QuizContentService,
  ) {}

  /**
   * 스텝 풀이를 시작하며 시도 정보를 생성한다.
   * FE는 stepId, userId, startedAt(옵션)만 넘기면 되며, attemptNo/총 퀴즈 수는 서버에서 관리한다.
   */
  async startStepAttempt(params: StartStepAttemptParams): Promise<UserStepAttempt> {
    const { userId, stepId } = params;

    const step = await this.stepRepository.findOne({ where: { id: stepId } });
    if (!step) {
      throw new NotFoundException('스텝 정보를 찾을 수 없습니다.');
    }

    const lastAttempt = await this.stepAttemptRepository.findOne({
      where: { userId, step: { id: stepId } },
      order: { attemptNo: 'DESC' },
    });
    const nextAttemptNo = (lastAttempt?.attemptNo ?? 0) + 1;
    const totalQuizzes = await this.getTotalQuizzesForStep(step);

    const attempt = this.stepAttemptRepository.create({
      userId,
      step,
      attemptNo: nextAttemptNo,
      totalQuizzes,
      answeredCount: 0,
      correctCount: 0,
      status: StepAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
    });

    return this.stepAttemptRepository.save(attempt);
  }

  /**
   * 스텝 풀이 완료 처리
   * - 최근 진행 중(in_progress) 시도를 기준으로 점수를 계산하고 상태를 완료로 업데이트한다.
   * - 응답에는 획득 점수=경험치, 정답 수, 풀이 수, 성공률, 소요 시간을 포함한다.
   */
  async completeStepAttempt(params: CompleteStepAttemptParams): Promise<CompleteStepAttemptResult> {
    const { userId, stepId, stepAttemptId } = params;

    const step = await this.stepRepository.findOne({ where: { id: stepId } });
    if (!step) throw new NotFoundException('스텝 정보를 찾을 수 없습니다.');

    const attempt = await this.findTargetStepAttempt({ userId, stepId, stepAttemptId });
    if (!attempt) throw new BadRequestException('진행 중인 스텝 시도를 찾을 수 없습니다.');

    const targetStepAttemptId = attempt.id;
    const solveLogs = await this.solveLogRepository.find({
      where: { stepAttempt: { id: targetStepAttemptId } },
    });

    const scoreResult = await this.calculateStepAttemptScore(targetStepAttemptId);
    const finishedAtDate = new Date();
    const durationSeconds = Math.max(
      0,
      Math.floor((finishedAtDate.getTime() - attempt.startedAt.getTime()) / 1000),
    );

    const totalQuizzes = this.resolveTotalQuizzesForResult(attempt.totalQuizzes, scoreResult);
    const successRate = totalQuizzes === 0 ? 0 : (scoreResult.correctCount / totalQuizzes) * 100;

    attempt.answeredCount = solveLogs.length;
    attempt.correctCount = scoreResult.correctCount;
    attempt.successRate = successRate;
    attempt.status = StepAttemptStatus.COMPLETED;
    attempt.finishedAt = finishedAtDate;
    attempt.totalQuizzes = totalQuizzes;

    await this.stepAttemptRepository.save(attempt);

    const stepStatus = await this.stepStatusRepository.findOne({
      where: { userId, step: { id: stepId } },
    });

    if (stepStatus) {
      stepStatus.isCompleted = true;
      stepStatus.bestScore =
        stepStatus.bestScore === null || stepStatus.bestScore === undefined
          ? scoreResult.score
          : Math.max(stepStatus.bestScore, scoreResult.score);
      stepStatus.successRate = successRate;
      await this.stepStatusRepository.save(stepStatus);
    } else {
      const newStatus = this.stepStatusRepository.create({
        userId,
        step,
        isCompleted: true,
        bestScore: scoreResult.score,
        successRate,
      });
      await this.stepStatusRepository.save(newStatus);
    }

    const gainedExperience = scoreResult.score;
    if (gainedExperience > 0) {
      // 스텝 완료 시 획득한 점수를 경험치로 누적한다.
      await this.userRepository.increment({ id: userId }, 'experience', gainedExperience);
    }

    const { isFirstSolveToday, currentStreak } = await this.handleUserStreak(params.userId);

    return {
      score: scoreResult.score,
      experience: scoreResult.score,
      correctCount: scoreResult.correctCount,
      totalQuizzes: attempt.totalQuizzes,
      answeredQuizzes: solveLogs.length,
      successRate,
      durationSeconds,
      isFirstSolveToday,
      currentStreak,
    };
  }

  /**
   * 복습 노트 대상 퀴즈를 조회한다.
   * - 복습 부담을 줄이기 위해 시간 단위 대신 날짜 기준으로 오늘까지 포함해 조회한다.
   *
   * @param userId 사용자 ID
   * @returns 복습 큐 응답
   */
  async getReviewQueue(
    userId: number,
    options?: {
      fieldSlug?: string;
      limit?: number;
    },
  ): Promise<QuizResponse[]> {
    const now = getKstNow();
    const reviewCutoff = getKstNextDayStart(now);

    const queryBuilder = this.userQuizStatusRepository
      .createQueryBuilder('status')
      .innerJoinAndSelect('status.quiz', 'quiz')
      .innerJoin('quiz.step', 'step')
      .innerJoin('step.unit', 'unit')
      .innerJoin('unit.field', 'field')
      .where('status.userId = :userId', { userId })
      .andWhere('status.nextReviewAt IS NOT NULL')
      .andWhere('status.nextReviewAt < :reviewCutoff', { reviewCutoff })
      .orderBy('status.isDontKnow', 'DESC')
      .addOrderBy('status.nextReviewAt', 'ASC');

    if (options?.fieldSlug) {
      queryBuilder.andWhere('LOWER(field.slug) = LOWER(:fieldSlug)', {
        fieldSlug: options.fieldSlug,
      });
    }

    const reviewLimit = options?.limit ?? DEFAULT_REVIEW_QUEUE_LIMIT;
    queryBuilder.take(reviewLimit);

    const reviewStatuses = await queryBuilder.getMany();

    const reviews: QuizResponse[] = [];

    for (const status of reviewStatuses) {
      const quiz = status.quiz;
      if (!quiz) {
        continue;
      }

      // 퀴즈 조회 API와 동일한 응답을 유지하기 위해 공용 변환기를 사용한다.
      const quizResponse = await this.quizContentService.toQuizResponse(quiz);
      reviews.push(quizResponse);
    }

    return reviews;
  }

  /**
   * 완료 처리 대상 스텝 시도를 찾는다.
   * - 클라이언트가 명시한 stepAttemptId를 우선 사용한다.
   * - 없으면 최신 진행 중(in_progress) 시도를 반환한다.
   */
  private async findTargetStepAttempt(params: {
    userId: number;
    stepId: number;
    stepAttemptId?: number;
  }): Promise<UserStepAttempt | null> {
    const { userId, stepId, stepAttemptId } = params;

    if (stepAttemptId) {
      return this.stepAttemptRepository.findOne({
        where: {
          id: stepAttemptId,
          userId,
          step: { id: stepId },
          status: StepAttemptStatus.IN_PROGRESS,
        },
      });
    }

    return this.stepAttemptRepository.findOne({
      where: { userId, step: { id: stepId }, status: StepAttemptStatus.IN_PROGRESS },
      order: { attemptNo: 'DESC' },
    });
  }

  /**
   * 체크포인트 여부를 고려해 스텝의 총 퀴즈 수를 계산한다.
   *
   * @param step 스텝 엔티티
   * @returns 총 퀴즈 수
   */
  private async getTotalQuizzesForStep(step: Step): Promise<number> {
    const maxQuizCount = 10;

    if (step.isCheckpoint) {
      const totalInPool = await this.checkpointQuizPoolRepository.count({
        where: { checkpointStep: { id: step.id } },
      });

      return Math.min(totalInPool, maxQuizCount);
    }

    const totalInStep = await this.quizRepository.count({ where: { step: { id: step.id } } });

    return Math.min(totalInStep, maxQuizCount);
  }

  /**
   * 결과 계산 시 사용할 총 퀴즈 수를 정한다.
   *
   * @param attemptTotal 시도에 저장된 총 퀴즈 수
   * @param scoreResult 점수 계산 결과
   * @returns 총 퀴즈 수
   */
  private resolveTotalQuizzesForResult(
    attemptTotal: number,
    scoreResult: StepAttemptScore,
  ): number {
    if (attemptTotal > 0) {
      return attemptTotal;
    }

    return scoreResult.totalQuizzes;
  }

  /**
   * 스텝 시도에 해당하는 퀴즈 풀이 로그를 기반으로 점수를 계산한다.
   * @param stepAttemptId 계산 대상 스텝 시도 ID
   */
  async calculateStepAttemptScore(
    stepAttemptId: number,
    options?: Partial<ScoreCalculationOptions>,
  ): Promise<StepAttemptScore> {
    const logs = await this.solveLogRepository.find({
      where: { stepAttempt: { id: stepAttemptId } },
    });

    if (logs.length === 0) {
      return {
        score: 0,
        correctCount: 0,
        totalQuizzes: 0,
        successRate: 0,
      };
    }

    const totalQuizzes = logs.length;
    const correctCount = logs.filter(log => log.isCorrect).length;

    // 기본 3점 + 정답 보너스(기본 1점) + 기타 보너스(확장 시)
    const score = this.calculateScore(logs, options);

    const successRate = totalQuizzes === 0 ? 0 : (correctCount / totalQuizzes) * 100;

    return {
      score,
      correctCount,
      totalQuizzes,
      successRate,
    };
  }

  /**
   * 풀이 로그 배열로부터 점수를 계산한다.
   *
   * @param logs 점수 계산 대상 풀이 로그 목록
   * @param options 점수 가중치 옵션(기본값은 DEFAULT_SCORE_WEIGHTS)
   * @returns 계산된 총 점수
   */
  calculateScore(logs: SolveLog[], options?: Partial<ScoreCalculationOptions>) {
    const weights = this.mergeScoreWeights(options);

    return logs.reduce((accumulator, log) => {
      const baseScore = weights.baseScorePerQuiz;
      // TODO: 추후 난이도/시간 가중치 반영 시 아래 보너스 값을 채운다.
      const correctnessBonus = log.isCorrect ? weights.correctBonus : weights.wrongBonus;
      const difficultyBonus = 0; // weights.difficultyMultiplier * (log.quiz?.difficulty ?? 0);
      const speedBonus = 0; // 시간 기반 보너스/페널티

      return accumulator + baseScore + correctnessBonus + difficultyBonus + speedBonus;
    }, 0);
  }

  private mergeScoreWeights(options?: Partial<ScoreCalculationOptions>): ScoreCalculationOptions {
    return {
      ...DEFAULT_SCORE_WEIGHTS,
      ...(options ?? {}),
    };
  }

  /**
   * 비로그인 상태에서 푼 step들을 로그인 후 동기화한다.
   * 이미 존재하는 stepId는 건너뛴다.
   */
  async syncStepStatuses(userId: number, stepIds: number[]): Promise<{ syncedCount: number }> {
    let syncedCount = 0;

    for (const stepId of stepIds) {
      const existing = await this.stepStatusRepository.findOne({
        where: { userId, step: { id: stepId } },
      });

      if (existing) {
        continue;
      }

      const step = await this.stepRepository.findOne({ where: { id: stepId } });
      if (!step) {
        continue;
      }

      const newStatus = this.stepStatusRepository.create({
        userId,
        step,
        isCompleted: true,
        bestScore: null,
        successRate: null,
      });
      await this.stepStatusRepository.save(newStatus);
      syncedCount++;
    }

    // 동기화된 step 수만큼 experience 추가 (step당 30 경험치)
    if (syncedCount > 0) {
      await this.userRepository.increment({ id: userId }, 'experience', syncedCount * 30);
    }

    return { syncedCount };
  }

  /**
   * 유저의 스트릭을 관리하고 오늘의 첫 풀이 여부를 확인한다.
   */
  private async handleUserStreak(
    userId: number,
  ): Promise<{ isFirstSolveToday: boolean; currentStreak: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');

    const now = new Date();

    // 날짜 비교를 위한 헬퍼 (서버 타임존 기준 YYYY-MM-DD)
    const formatDate = (d: Date): string => d.toISOString().split('T')[0]!;

    const todayStr: string = formatDate(now);
    const lastUpdateStr: string | null = user.lastStreakUpdatedAt
      ? formatDate(user.lastStreakUpdatedAt)
      : null;

    // 오늘 이미 풀었다면 스트릭 갱신 없이 종료
    if (lastUpdateStr === todayStr)
      return { isFirstSolveToday: false, currentStreak: user.currentStreak };

    // 날짜 차이 계산
    let nextStreak = 1;
    if (lastUpdateStr) {
      const lastDate = new Date(lastUpdateStr);
      const todayDate = new Date(todayStr);

      // 밀리세컨드 차이를 일 단위로 변환
      const diffTime = todayDate.getTime() - lastDate.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) nextStreak = user.currentStreak + 1;
      else nextStreak = 1;
    }

    user.currentStreak = nextStreak;
    user.lastStreakUpdatedAt = now;
    await this.userRepository.save(user);

    return { isFirstSolveToday: true, currentStreak: nextStreak };
  }

  /**
   * 오늘 달성한 목표 지표(만점 스텝 수, 획득 경험치)를 조회한다. (만점 스텝 수는 반복해도 증가 안하는 상태)
   * 만약 목표를 달성했다면, 다이아몬드 1개 지급
   *
   * @param userId 사용자 ID
   * @returns 오늘의 목표 달성 데이터
   */
  async getTodayGoals(userId: number): Promise<TodayGoalsParams> {
    const now = getKstNow();

    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    const perfectScoreSteps = await this.stepStatusRepository.count({
      where: { userId, successRate: 100, createdAt: Between(start, end) },
    });

    const logs = await this.solveLogRepository.find({
      where: { userId, solvedAt: Between(start, end) },
    });

    const totalEarnedXP = this.calculateScore(logs);

    const hasReachedGoals =
      perfectScoreSteps >= DEFAULT_TODAY_GOALS.perfectScore.target &&
      totalEarnedXP >= DEFAULT_TODAY_GOALS.totalXP.target;

    const result: TodayGoalsParams = {
      perfectScore: {
        ...DEFAULT_TODAY_GOALS.perfectScore,
        current: perfectScoreSteps,
      },
      totalXP: {
        ...DEFAULT_TODAY_GOALS.totalXP,
        current: totalEarnedXP,
      },
      rewardGranted: false,
    };

    if (hasReachedGoals) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      if (user) {
        const lastRewardedAt = user.lastDailyGoalRewardedAt;
        const isRewardedToday =
          lastRewardedAt !== null &&
          lastRewardedAt !== undefined &&
          lastRewardedAt >= start &&
          lastRewardedAt <= end;

        if (!isRewardedToday) {
          await this.userRepository.increment(
            { id: userId },
            'diamondCount',
            DAILY_GOAL_DIAMOND_REWARD,
          );
          await this.userRepository.update({ id: userId }, { lastDailyGoalRewardedAt: now });
          result.rewardGranted = true;
        }
      }
    }

    return result;
  }
}

export interface ScoreCalculationOptions {
  baseScorePerQuiz: number;
  correctBonus: number;
  wrongBonus: number;
  difficultyMultiplier: number;
  speedBonus: number;
}

export interface StepAttemptScore {
  score: number;
  correctCount: number;
  totalQuizzes: number;
  successRate: number;
}

export interface StartStepAttemptParams {
  userId: number;
  stepId: number;
}

export interface CompleteStepAttemptParams {
  userId: number;
  stepId: number;
  stepAttemptId?: number;
}

export interface CompleteStepAttemptResult {
  score: number;
  experience: number;
  correctCount: number;
  totalQuizzes: number | null | undefined;
  answeredQuizzes: number;
  successRate: number;
  durationSeconds: number;
  isFirstSolveToday: boolean;
  currentStreak: number;
}
