import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bondsKey,
  fetchBonds,
  fetchIndexHistory,
  fetchIndexProjection,
  fetchProjectionMethods,
  type IndexName,
  indexHistoryKey,
  indexProjectionKey,
  indexProjectionsKey,
  type ProjectionMethodName,
  type ProjectionMethods,
  projectionMethodsKey,
  saveProjectionMethod,
} from "@/lib/api";
import { marketIndexes } from "@/lib/marketIndexes";
import { scheduleKey } from "@/lib/mortgageQueries";

export function useBonds() {
  return useQuery({ queryKey: bondsKey, queryFn: fetchBonds });
}

export function useIndexHistory(index: IndexName) {
  return useQuery({ queryKey: indexHistoryKey(index), queryFn: () => fetchIndexHistory(index) });
}

/** useIndexProjection reads the projected path of an index; it stays idle for one not projected. */
export function useIndexProjection(index: IndexName) {
  return useQuery({
    queryKey: indexProjectionKey(index),
    queryFn: () => fetchIndexProjection(index),
    enabled: marketIndexes[index].projected,
  });
}

/** useIndexSeries reads the history and the projection of each index, in the order given. */
export function useIndexSeries(indexes: IndexName[]) {
  const histories = useQueries({
    queries: indexes.map((index) => ({
      queryKey: indexHistoryKey(index),
      queryFn: () => fetchIndexHistory(index),
    })),
  });
  const projections = useQueries({
    queries: indexes.map((index) => ({
      queryKey: indexProjectionKey(index),
      queryFn: () => fetchIndexProjection(index),
      enabled: marketIndexes[index].projected,
    })),
  });
  return { histories, projections };
}

/** useProjectionMethods reads the projection method of every index that has a choice of them. */
export function useProjectionMethods() {
  return useQuery({ queryKey: projectionMethodsKey, queryFn: fetchProjectionMethods });
}

/**
 * useSaveProjectionMethod chooses the method an index is projected by. The poupança yield derives
 * from the TR and Selic projections and the mortgage schedule uses all of them, so on success
 * every projection and the schedule reload. The mutation stays pending until the projections
 * shown have reloaded.
 */
export function useSaveProjectionMethod(index: IndexName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (method: ProjectionMethodName) => saveProjectionMethod(index, method),
    onSuccess: (saved) => {
      queryClient.setQueryData<ProjectionMethods>(
        projectionMethodsKey,
        (old) => old && { methods: old.methods.map((m) => (m.index === saved.index ? saved : m)) },
      );
      return Promise.all(
        [indexProjectionsKey, scheduleKey].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}
