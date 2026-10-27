import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  bondsKey,
  fetchMarketDataStatus,
  indexHistoriesKey,
  indexProjectionsKey,
  startMarketDataRefresh,
} from "@/lib/api";

const STATUS_KEY = ["market-data", "status"];
const POLL_MS = 2000;

/**
 * useMarketData returns the status of the market data and a way to refresh it. While a refresh
 * runs it polls the status, and when the refresh ends it reloads the index histories and
 * projections and the bond catalogue.
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
      void queryClient.invalidateQueries({ queryKey: indexHistoriesKey });
      void queryClient.invalidateQueries({ queryKey: bondsKey });
      void queryClient.invalidateQueries({ queryKey: indexProjectionsKey });
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, queryClient]);

  return { status, refresh, refreshing };
}
