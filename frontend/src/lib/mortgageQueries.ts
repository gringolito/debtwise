import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMortgage, fetchMortgageSchedule, putMortgage, removeMortgage } from "@/lib/api";

export const mortgageKey = ["mortgage"] as const;
export const scheduleKey = ["mortgage", "schedule"] as const;

/** useMortgage reads the mortgage; its data is null while none is registered. */
export function useMortgage() {
  return useQuery({ queryKey: mortgageKey, queryFn: fetchMortgage });
}

export function useMortgageSchedule() {
  return useQuery({ queryKey: scheduleKey, queryFn: fetchMortgageSchedule });
}

// Both mutations settle the cache by hand first, so the next screen never shows the old mortgage
// or its old schedule while the refetch runs.
export function useSaveMortgage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: putMortgage,
    onSuccess: (saved) => {
      queryClient.removeQueries({ queryKey: scheduleKey });
      queryClient.setQueryData(mortgageKey, saved);
      return queryClient.invalidateQueries({ queryKey: mortgageKey, exact: true });
    },
  });
}

export function useDeleteMortgage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeMortgage,
    onSuccess: () => {
      queryClient.setQueryData(mortgageKey, null);
      queryClient.removeQueries({ queryKey: scheduleKey });
      return queryClient.invalidateQueries({ queryKey: mortgageKey, exact: true });
    },
  });
}
