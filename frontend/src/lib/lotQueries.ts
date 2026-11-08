import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  earlySaleChecksKeys,
  fetchLots,
  importLots,
  type LotInput,
  postLot,
  previewLot,
  putLot,
  removeLot,
} from "@/lib/api";

export const lotsKey = ["lots"] as const;

export function useLots() {
  return useQuery({ queryKey: lotsKey, queryFn: fetchLots });
}

// A preview sits under the list's key, which the lot mutations refresh only exactly, so recording a
// lot does not read the previews again. It keeps showing the last answer while the next one loads,
// and a rejected one is not retried. Each answer carries the input it previewed, so a sheet can
// tell when it no longer matches what the owner has since typed.

/** useLotPreview previews input; it stays idle while input is undefined. */
export function useLotPreview(input: LotInput | undefined) {
  return useQuery({
    queryKey: [...lotsKey, "preview", input],
    queryFn: async () => {
      const previewed = input as LotInput;
      return { input: previewed, preview: await previewLot(previewed) };
    },
    enabled: input !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

// Every change to a lot changes its values, the order of the list and the early sale checks, so
// they are read again. Only the list is awaited: the checks take longer and nothing waits on them.
function useRefreshLots() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: earlySaleChecksKeys });
    return queryClient.invalidateQueries({ queryKey: lotsKey, exact: true });
  };
}

export function useAddLot() {
  return useMutation({ mutationFn: postLot, onSuccess: useRefreshLots() });
}

export function useImportLots() {
  return useMutation({ mutationFn: importLots, onSuccess: useRefreshLots() });
}

export function useEditLot() {
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: LotInput }) => putLot(id, input),
    onSuccess: useRefreshLots(),
  });
}

export function useDeleteLot() {
  return useMutation({ mutationFn: removeLot, onSuccess: useRefreshLots() });
}
