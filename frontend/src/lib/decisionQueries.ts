import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type DecisionInput,
  type DefaultComparison,
  decide,
  defaultComparisonKey,
  fetchDefaultComparison,
  saveDefaultComparison,
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

/** useDefaultComparison reads the amount and effect Início compares. */
export function useDefaultComparison() {
  return useQuery({ queryKey: defaultComparisonKey, queryFn: fetchDefaultComparison });
}

/**
 * useSaveDefaultComparison changes the amount and effect Início compares. A read still in flight
 * is cancelled first, so it can't put back the comparison it read.
 */
export function useSaveDefaultComparison() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveDefaultComparison,
    onSuccess: async (saved) => {
      await queryClient.cancelQueries({ queryKey: defaultComparisonKey });
      queryClient.setQueryData<DefaultComparison>(defaultComparisonKey, saved);
    },
  });
}
