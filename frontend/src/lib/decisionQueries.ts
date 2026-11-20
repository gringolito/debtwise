import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DashboardQuestion,
  type DecisionInput,
  dashboardQuestionKey,
  decide,
  fetchDashboardQuestion,
  saveDashboardQuestion,
} from "@/lib/api";

/** decisionsKey prefixes the query key of every decision read as a query, to invalidate them all. */
export const decisionsKey = ["decision"] as const;

/** useDecide compares an amount; nothing is stored, so there is no cache to settle after it. */
export function useDecide() {
  return useMutation({ mutationFn: decide });
}

/**
 * useDecision reads the decision for an input the screen fixes rather than one the owner types. It
 * waits while the input is undefined.
 */
export function useDecision(input: DecisionInput | undefined) {
  return useQuery({
    queryKey: [...decisionsKey, input],
    queryFn: input ? () => decide(input) : skipToken,
  });
}

/** useDashboardQuestion reads the amount and effect Início compares. */
export function useDashboardQuestion() {
  return useQuery({ queryKey: dashboardQuestionKey, queryFn: fetchDashboardQuestion });
}

/**
 * useSaveDashboardQuestion changes the amount and effect Início compares. A read still in flight
 * is cancelled first, so it can't put back the question it read.
 */
export function useSaveDashboardQuestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDashboardQuestion,
    onSuccess: async (saved) => {
      await queryClient.cancelQueries({ queryKey: dashboardQuestionKey });
      queryClient.setQueryData<DashboardQuestion>(dashboardQuestionKey, saved);
    },
  });
}
