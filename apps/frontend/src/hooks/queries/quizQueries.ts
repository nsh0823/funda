import type { UseQueryOptions } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { QuizQuestion } from '@/feat/quiz/types';
import { leaderboardKeys } from '@/hooks/queries/leaderboardQueries';
import type { QuizSubmissionRequest, StepCompletionPayload } from '@/services/quizService';
import { quizService } from '@/services/quizService';

export const useQuizzesByStepQuery = (
  stepId: number,
  options?: Omit<
    UseQueryOptions<QuizQuestion[], Error, QuizQuestion[], ['quizzes-by-step', number]>,
    'queryKey' | 'queryFn'
  >,
) =>
  useQuery({
    queryKey: ['quizzes-by-step', stepId],
    queryFn: () => quizService.getQuizzesByStep(stepId),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
    ...options,
  });

export const usePrefetchQuizzesByStep = () => {
  const queryClient = useQueryClient();
  return (stepId: number) =>
    queryClient.prefetchQuery({
      queryKey: ['quizzes-by-step', stepId],
      queryFn: () => quizService.getQuizzesByStep(stepId),
      staleTime: 1000 * 60 * 5,
    });
};

export const useSubmitQuizMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ quizId, payload }: { quizId: number; payload: QuizSubmissionRequest }) =>
      quizService.submitQuiz(quizId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['today-goals'] });
    },
  });
};

export const useCompleteStepMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ stepId, payload }: { stepId: number; payload: StepCompletionPayload }) =>
      quizService.completeStep(stepId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: leaderboardKeys.weekly() });
      queryClient.invalidateQueries({ queryKey: ['today-goals'] });
    },
  });
};

export const useStartStepMutation = () =>
  useMutation({
    mutationFn: (stepId: number) => quizService.startStep(stepId),
  });
