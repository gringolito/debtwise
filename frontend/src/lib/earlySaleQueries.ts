import { useQuery } from "@tanstack/react-query";
import { earlySaleChecksKey, fetchEarlySaleChecks } from "@/lib/api";
import type { PrepaymentEffect } from "@/lib/mortgageEvents";

export function useEarlySaleChecks(effect: PrepaymentEffect) {
  return useQuery({
    queryKey: earlySaleChecksKey(effect),
    queryFn: () => fetchEarlySaleChecks(effect),
  });
}
