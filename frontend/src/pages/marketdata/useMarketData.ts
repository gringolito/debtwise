import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  bondsKey,
  earlySaleChecksKeys,
  fetchMarketDataStatus,
  indexHistoriesKey,
  indexProjectionsKey,
  startMarketDataRefresh,
} from "@/lib/api";
import { lotsKey } from "@/lib/lotQueries";
import { scheduleKey } from "@/lib/mortgageQueries";

const STATUS_KEY = ["market-data", "status"];
const POLL_MS = 2000;

/**
 * useMarketData returns the status of the market data and a way to refresh it. While a refresh
 * runs it polls the status, and when the refresh ends it reloads what reads the market data: the
 * index histories and projections, the bond catalogue, the mortgage schedule, the lots' values and
 * the early sale checks.
 */
export function useMarketData() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchMarketDataStatus,
    refetchInterval: (query) => (query.state.data?.refreshing ? POLL_MS : false),
  });
  const refresh = useMutation({
    mutationFn: startMarketDataRefresh,
    onSuccess: (started) => queryClient.setQueryData(STATUS_KEY, started),
  });

  const refreshing = status.data?.refreshing ?? false;
  const wasRefreshing = useRef(false);
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) {
      for (const queryKey of [
        indexHistoriesKey,
        bondsKey,
        indexProjectionsKey,
        scheduleKey,
        lotsKey,
        earlySaleChecksKeys,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, queryClient]);

  return { status, refresh, refreshing };
}
