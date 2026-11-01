import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLots, importLots, type LotInput, postLot, putLot, removeLot } from "@/lib/api";

export const lotsKey = ["lots"] as const;

export function useLots() {
  return useQuery({ queryKey: lotsKey, queryFn: fetchLots });
}

// Every change to a lot changes its values and the order of the list, so the list is read again.
function useRefreshLots() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: lotsKey, exact: true });
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
