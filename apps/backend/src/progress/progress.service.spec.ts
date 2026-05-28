import { Repository } from 'typeorm';

import type { QuizContentService } from '../common/utils/quiz-content.service';
import { DEFAULT_TODAY_GOALS } from '../common/utils/today-goals';
import type { QuizResponse } from '../roadmap/dto/quiz-list.dto';
import { CheckpointQuizPool, Quiz, Step } from '../roadmap/entities';
import { User } from '../users/entities';

import { SolveLog } from './entities/solve-log.entity';
import type { UserQuizStatus } from './entities/user-quiz-status.entity';
import { QuizLearningStatus } from './entities/user-quiz-status.entity';
import { StepAttemptStatus, UserStepAttempt } from './entities/user-step-attempt.entity';
import { UserStepStatus } from './entities/user-step-status.entity';
import { ProgressService } from './progress.service';

describe('ProgressService', () => {
  let service: ProgressService;
  let solveLogRepository: Partial<Repository<SolveLog>>;
  let stepAttemptRepository: Partial<Repository<UserStepAttempt>>;
  let stepStatusRepository: Partial<Repository<UserStepStatus>>;
  let stepRepository: Partial<Repository<Step>>;
  let checkpointQuizPoolRepository: Partial<Repository<CheckpointQuizPool>>;
  let quizRepository: Partial<Repository<Quiz>>;
  let userRepository: Partial<Repository<User>>;
  let userQuizStatusRepository: Partial<Repository<UserQuizStatus>>;
  let quizContentService: Partial<QuizContentService>;
  let solveLogFindMock: jest.Mock;
  let stepAttemptFindOneMock: jest.Mock;
  let stepAttemptSaveMock: jest.Mock;
  let stepAttemptCreateMock: jest.Mock;
  let stepStatusFindOneMock: jest.Mock;
  let stepStatusSaveMock: jest.Mock;
  let stepStatusCreateMock: jest.Mock;
  let stepStatusCountMock: jest.Mock;
  let stepFindOneMock: jest.Mock;
  let quizCountMock: jest.Mock;
  let checkpointPoolCountMock: jest.Mock;
  let userIncrementMock: jest.Mock;
  let userFindOneMock: jest.Mock;
  let userSaveMock: jest.Mock;
  let userUpdateMock: jest.Mock;
  let userQuizStatusQueryBuilderMock: {
    innerJoinAndSelect: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
  let quizResponseMock: jest.Mock;

  beforeEach(() => {
    solveLogFindMock = jest.fn();
    stepAttemptFindOneMock = jest.fn();
    stepAttemptSaveMock = jest.fn();
    stepAttemptCreateMock = jest.fn(entity => entity);
    stepStatusFindOneMock = jest.fn();
    stepStatusSaveMock = jest.fn();
    stepStatusCreateMock = jest.fn(entity => entity);
    stepStatusCountMock = jest.fn();
    stepFindOneMock = jest.fn().mockResolvedValue({ id: 1 } as Step);
    quizCountMock = jest.fn().mockResolvedValue(0);
    checkpointPoolCountMock = jest.fn().mockResolvedValue(0);
    userIncrementMock = jest.fn().mockResolvedValue({});
    userFindOneMock = jest.fn();
    userSaveMock = jest.fn();
    userUpdateMock = jest.fn().mockResolvedValue({});
    quizResponseMock = jest.fn();
    userQuizStatusQueryBuilderMock = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    solveLogRepository = {
      find: solveLogFindMock,
    };
    stepAttemptRepository = {
      findOne: stepAttemptFindOneMock,
      save: stepAttemptSaveMock,
      create: stepAttemptCreateMock,
    };
    stepStatusRepository = {
      findOne: stepStatusFindOneMock,
      save: stepStatusSaveMock,
      create: stepStatusCreateMock,
      count: stepStatusCountMock,
    };
    stepRepository = {
      findOne: stepFindOneMock,
    };
    checkpointQuizPoolRepository = {
      count: checkpointPoolCountMock,
    };
    quizRepository = {
      count: quizCountMock,
    };
    userRepository = {
      increment: userIncrementMock,
      findOne: userFindOneMock,
      save: userSaveMock,
      update: userUpdateMock,
    };
    userQuizStatusRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(userQuizStatusQueryBuilderMock),
    };
    quizContentService = {
      toQuizResponse: quizResponseMock,
    };

    service = new ProgressService(
      solveLogRepository as Repository<SolveLog>,
      stepAttemptRepository as Repository<UserStepAttempt>,
      stepStatusRepository as Repository<UserStepStatus>,
      stepRepository as Repository<Step>,
      checkpointQuizPoolRepository as Repository<CheckpointQuizPool>,
      quizRepository as Repository<Quiz>,
      userRepository as Repository<User>,
      userQuizStatusRepository as Repository<UserQuizStatus>,
      quizContentService as QuizContentService,
    );
  });

  it('풀이 로그가 없으면 점수와 통계가 0이다', async () => {
    solveLogFindMock.mockResolvedValue([]);

    const result = await service.calculateStepAttemptScore(1);

    expect(solveLogFindMock).toHaveBeenCalledWith({ where: { stepAttempt: { id: 1 } } });
    expect(result).toEqual({
      score: 0,
      correctCount: 0,
      totalQuizzes: 0,
      successRate: 0,
    });
  });

  it('문제당 기본 점수와 정답/오답 보너스를 합산한다', async () => {
    solveLogFindMock.mockResolvedValue([
      { isCorrect: true },
      { isCorrect: false },
      { isCorrect: true },
    ] as SolveLog[]);

    const result = await service.calculateStepAttemptScore(2);

    // 점수 계산: (3+1) + (3+0) + (3+1) = 11
    expect(result.score).toBe(11);
    expect(result.correctCount).toBe(2);
    expect(result.totalQuizzes).toBe(3);
    expect(result.successRate).toBeCloseTo((2 / 3) * 100);
  });

  it('스텝 시도를 생성한다', async () => {
    stepFindOneMock.mockResolvedValueOnce({ id: 3 } as Step);
    stepAttemptFindOneMock.mockResolvedValue({ attemptNo: 2 } as UserStepAttempt);
    quizCountMock.mockResolvedValue(5);
    stepAttemptSaveMock.mockResolvedValue({ id: 10 });

    const attempt = await service.startStepAttempt({
      userId: 100,
      stepId: 3,
    });

    expect(stepFindOneMock).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(quizCountMock).toHaveBeenCalledWith({ where: { step: { id: 3 } } });
    expect(stepAttemptSaveMock).toHaveBeenCalled();
    expect(stepAttemptSaveMock.mock.calls[0][0]).toMatchObject({
      userId: 100,
      attemptNo: 3,
      totalQuizzes: 5,
      status: StepAttemptStatus.IN_PROGRESS,
    });
    expect(attempt).toEqual({ id: 10 });
  });

  it('스텝 시도를 완료하며 점수/성공률/소요 시간을 반환한다', async () => {
    const startedAt = new Date(Date.now() - 10_000);

    stepFindOneMock.mockResolvedValue({ id: 5 } as Step);
    stepAttemptFindOneMock.mockResolvedValue({
      id: 20,
      userId: 1,
      step: { id: 5 },
      attemptNo: 1,
      totalQuizzes: 4,
      startedAt,
      status: StepAttemptStatus.IN_PROGRESS,
    } as UserStepAttempt);
    solveLogFindMock.mockResolvedValue([
      { isCorrect: true } as SolveLog,
      { isCorrect: false } as SolveLog,
      { isCorrect: true } as SolveLog,
    ]);
    stepStatusFindOneMock.mockResolvedValue({
      userId: 1,
      step: { id: 5 },
      isCompleted: false,
      bestScore: 8,
    } as UserStepStatus);
    userFindOneMock.mockResolvedValue({
      id: 1,
      currentStreak: 3,
      lastStreakUpdatedAt: new Date(),
    } as User);

    const result = await service.completeStepAttempt({
      userId: 1,
      stepId: 5,
    });

    expect(stepAttemptSaveMock).toHaveBeenCalled();
    const savedAttempt = stepAttemptSaveMock.mock.calls[0][0] as UserStepAttempt;
    expect(savedAttempt.status).toBe(StepAttemptStatus.COMPLETED);
    expect(savedAttempt.correctCount).toBe(2);
    expect(savedAttempt.answeredCount).toBe(3);
    expect(savedAttempt.successRate).toBe((2 / 4) * 100);

    expect(stepStatusSaveMock).toHaveBeenCalled();
    const expectedDuration = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    expect(result).toEqual({
      score: 11,
      experience: 11,
      correctCount: 2,
      totalQuizzes: 4,
      answeredQuizzes: 3,
      successRate: (2 / 4) * 100,
      durationSeconds: result.durationSeconds,
      isFirstSolveToday: false,
      currentStreak: 3,
    });
    expect(result.durationSeconds).toBeGreaterThanOrEqual(expectedDuration - 1);
    expect(result.durationSeconds).toBeLessThanOrEqual(expectedDuration + 2);
  });

  it('요청한 stepAttemptId가 있으면 해당 시도를 우선 완료한다', async () => {
    const startedAt = new Date(Date.now() - 5_000);

    stepFindOneMock.mockResolvedValue({ id: 7 } as Step);
    stepAttemptFindOneMock.mockImplementation(({ where }) => {
      if (where?.id === 30) {
        return Promise.resolve({
          id: 30,
          userId: 1,
          step: { id: 7 },
          attemptNo: 2,
          totalQuizzes: 2,
          startedAt,
          status: StepAttemptStatus.IN_PROGRESS,
        } as UserStepAttempt);
      }
      return Promise.resolve(null);
    });
    solveLogFindMock.mockResolvedValue([{ isCorrect: true } as SolveLog]);
    stepStatusFindOneMock.mockResolvedValue(null);
    userFindOneMock.mockResolvedValue({
      id: 1,
      currentStreak: 1,
      lastStreakUpdatedAt: new Date(),
    } as User);

    const result = await service.completeStepAttempt({
      userId: 1,
      stepId: 7,
      stepAttemptId: 30,
    });

    expect(stepAttemptFindOneMock).toHaveBeenCalledWith({
      where: { id: 30, userId: 1, step: { id: 7 }, status: StepAttemptStatus.IN_PROGRESS },
    });
    expect(result).toMatchObject({
      score: 4,
      correctCount: 1,
      totalQuizzes: 2,
    });
    const savedAttempt = stepAttemptSaveMock.mock.calls[0][0] as UserStepAttempt;
    expect(savedAttempt.id).toBe(30);
  });

  it('비로그인 풀이 기록을 동기화하고 경험치를 증가시킨다', async () => {
    stepStatusFindOneMock.mockResolvedValue(null);
    stepFindOneMock.mockResolvedValue({ id: 1 } as Step);
    stepStatusSaveMock.mockResolvedValue({});

    const result = await service.syncStepStatuses(100, [1, 2, 3]);

    expect(result.syncedCount).toBe(3);
    expect(stepStatusSaveMock).toHaveBeenCalledTimes(3);
    expect(userIncrementMock).toHaveBeenCalledWith({ id: 100 }, 'experience', 90);
  });

  it('이미 존재하는 step은 건너뛴다', async () => {
    stepStatusFindOneMock
      .mockResolvedValueOnce({ userId: 100 } as UserStepStatus)
      .mockResolvedValueOnce(null);
    stepFindOneMock.mockResolvedValue({ id: 2 } as Step);
    stepStatusSaveMock.mockResolvedValue({});

    const result = await service.syncStepStatuses(100, [1, 2]);

    expect(result.syncedCount).toBe(1);
    expect(stepStatusSaveMock).toHaveBeenCalledTimes(1);
    expect(userIncrementMock).toHaveBeenCalledWith({ id: 100 }, 'experience', 30);
  });

  it('동기화할 step이 없으면 경험치를 증가시키지 않는다', async () => {
    stepStatusFindOneMock.mockResolvedValue({ userId: 100 } as UserStepStatus);

    const result = await service.syncStepStatuses(100, [1]);

    expect(result.syncedCount).toBe(0);
    expect(userIncrementMock).not.toHaveBeenCalled();
  });

  it('복습 큐 조회는 내일 0시 이전까지를 포함해 조회한다', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T10:15:00.000Z');
    jest.setSystemTime(now);

    userQuizStatusQueryBuilderMock.getMany.mockResolvedValue([]);

    await service.getReviewQueue(10);

    const expectedCutoff = new Date(Date.UTC(2026, 0, 2, 0, 0, 0, 0));
    const andWhereCalls = userQuizStatusQueryBuilderMock.andWhere.mock.calls;
    let cutoffCallArgs: unknown[] | undefined;

    for (const call of andWhereCalls) {
      if (String(call[0]).includes('reviewCutoff')) {
        cutoffCallArgs = call;
        break;
      }
    }

    expect(cutoffCallArgs).toBeDefined();

    const cutoffParams = cutoffCallArgs ? (cutoffCallArgs[1] as { reviewCutoff: Date }) : null;
    expect(cutoffParams?.reviewCutoff).toEqual(expectedCutoff);

    jest.useRealTimers();
  });

  it('복습 큐 조회 시 잘 모르겠어요 우선순위로 정렬한다', async () => {
    userQuizStatusQueryBuilderMock.getMany.mockResolvedValue([]);

    await service.getReviewQueue(10);

    expect(userQuizStatusQueryBuilderMock.orderBy).toHaveBeenCalledWith(
      'status.isDontKnow',
      'DESC',
    );
    expect(userQuizStatusQueryBuilderMock.addOrderBy).toHaveBeenCalledWith(
      'status.nextReviewAt',
      'ASC',
    );
  });

  it('복습 큐 조회 시 퀴즈 응답 형태로 반환한다', async () => {
    const quiz = {
      id: 101,
      type: 'MCQ',
      question: '',
      content: {
        question: '복습 질문',
        options: [{ id: 'c1', text: '보기 1' }],
      },
    } as Quiz;

    userQuizStatusQueryBuilderMock.getMany.mockResolvedValue([
      {
        quiz,
        status: QuizLearningStatus.REVIEW,
        interval: 6,
        nextReviewAt: new Date('2026-01-02T00:00:00.000Z'),
        lastSolvedAt: new Date('2026-01-01T00:00:00.000Z'),
        isWrong: false,
      } as UserQuizStatus,
    ]);

    const expectedResponse: QuizResponse = {
      id: 101,
      type: 'MCQ',
      content: {
        question: '복습 질문',
        options: [{ id: 'c1', text: '보기 1' }],
      },
    };
    quizResponseMock.mockResolvedValue(expectedResponse);

    const result = await service.getReviewQueue(1);

    expect(quizResponseMock).toHaveBeenCalledWith(quiz);
    expect(result).toEqual([expectedResponse]);
  });

  it('복습 큐 조회 시 필드와 제한 개수를 반영한다', async () => {
    userQuizStatusQueryBuilderMock.getMany.mockResolvedValue([]);

    await service.getReviewQueue(3, { fieldSlug: 'frontend', limit: 10 });

    const andWhereCalls = userQuizStatusQueryBuilderMock.andWhere.mock.calls;
    const fieldFilterCall = andWhereCalls.find(call => String(call[0]).includes('field.slug'));

    expect(fieldFilterCall).toBeDefined();
    expect(userQuizStatusQueryBuilderMock.take).toHaveBeenCalledWith(10);
  });

  describe('getTodayGoals', () => {
    it('목표를 모두 달성했으면 오늘 최초 1회 다이아를 지급한다', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-04T00:00:00.000Z'));

      jest.spyOn(service, 'calculateScore').mockReturnValue(DEFAULT_TODAY_GOALS.totalXP.target);

      stepStatusFindOneMock.mockResolvedValue(null);
      stepStatusCountMock.mockResolvedValue(DEFAULT_TODAY_GOALS.perfectScore.target);
      solveLogFindMock.mockResolvedValue(
        Array.from({ length: 13 }, () => ({ isCorrect: true }) as SolveLog),
      );
      userFindOneMock.mockResolvedValue({
        id: 1,
        lastDailyGoalRewardedAt: null,
      } as User);

      await service.getTodayGoals(1);

      const solveLogFindCall = solveLogFindMock.mock.calls.at(-1)?.[0] as
        | { where?: Record<string, unknown> }
        | undefined;
      expect(solveLogFindCall?.where).toHaveProperty('solvedAt');
      expect(solveLogFindCall?.where).not.toHaveProperty('createdAt');
      expect(userIncrementMock).toHaveBeenCalledWith({ id: 1 }, 'diamondCount', 1);
      expect(userUpdateMock).toHaveBeenCalledWith(
        { id: 1 },
        { lastDailyGoalRewardedAt: expect.any(Date) },
      );

      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('이미 오늘 보상을 받았다면 다이아를 추가 지급하지 않는다', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-02-04T00:00:00.000Z'));

      stepStatusCountMock.mockResolvedValue(DEFAULT_TODAY_GOALS.perfectScore.target);
      solveLogFindMock.mockResolvedValue([{ isCorrect: true } as SolveLog]);
      userFindOneMock.mockResolvedValue({
        id: 1,
        lastDailyGoalRewardedAt: new Date('2026-02-04T01:00:00.000Z'),
      } as User);

      await service.getTodayGoals(1);

      expect(userIncrementMock).not.toHaveBeenCalled();
      expect(userUpdateMock).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('목표를 달성하지 못했으면 보상을 지급하지 않는다', async () => {
      stepStatusCountMock.mockResolvedValue(0);
      solveLogFindMock.mockResolvedValue([]);

      await service.getTodayGoals(1);

      expect(userFindOneMock).not.toHaveBeenCalled();
      expect(userIncrementMock).not.toHaveBeenCalled();
      expect(userUpdateMock).not.toHaveBeenCalled();
    });
  });
});
