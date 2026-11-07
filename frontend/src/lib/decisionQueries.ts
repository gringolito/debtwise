import { useMutation, useQuery } from "@tanstack/react-query";
import { type DecisionInput, decide } from "@/lib/api";

/** decisionsKey prefixes the query key of every decision read as a query, to invalidate them all. */
export const decisionsKey = ["decision"] as const;

/** useDecide compares an amount; nothing is stored, so there is no cache to settle after it. */
export function useDecide() {
  return useMutation({ mutationFn: decide });
}

/** useDecision reads the decision for an input the screen fixes rather than one the owner types. */
export function useDecision(input: DecisionInput) {
  return useQuery({ queryKey: [...decisionsKey, input], queryFn: () => decide(input) });
}
