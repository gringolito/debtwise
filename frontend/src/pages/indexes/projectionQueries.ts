import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchIndexProjection,
  fetchProjectionMethods,
  type IndexName,
  indexProjectionKey,
  indexProjectionsKey,
  type ProjectionMethodName,
  type ProjectionMethods,
  projectionMethodsKey,
  saveProjectionMethod,
} from "@/lib/api";
import { scheduleKey } from "@/lib/mortgageQueries";

/** useProjectionMethods reads the projection method of every index that has a choice of them. */
export function useProjectionMethods() {
  return useQuery({ queryKey: projectionMethodsKey, queryFn: fetchProjectionMethods });
}

/**
 * useIndexProjection reads the projected path of an index; `enabled` is false for an index that is
 * not projected.
 */
export function useIndexProjection(index: IndexName, enabled: boolean) {
  return useQuery({
    queryKey: indexProjectionKey(index),
    queryFn: () => fetchIndexProjection(index),
    enabled,
  });
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
