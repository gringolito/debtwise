import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  comparePurchase,
  earlySaleChecksKeys,
  fetchLots,
  importLots,
  type Lot,
  type LotInput,
  postLot,
  previewLot,
  putLot,
  removeLot,
} from "@/lib/api";
import { inputOfLot } from "@/lib/lots";

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

/**
 * lotComparisonQuery compares a lot with prepaying what it cost on its purchase date with
 * shorten_term, the effect the dashboard's summaries compare against.
 */
export function lotComparisonQuery(lot: Lot) {
  const input = inputOfLot(lot);
  return queryOptions({
    queryKey: [...lotsKey, "comparison", input],
    queryFn: () => comparePurchase(input, "shorten_term"),
  });
}

/** useLotComparison reads the comparison the lot's save fetched, without reading it again. */
export function useLotComparison(lot: Lot) {
  return useQuery({ ...lotComparisonQuery(lot), refetchOnMount: false });
}

// Every change to a lot changes its values, the order of the list and the early sale checks, so
// they are read again. Only the list is awaited: the checks take longer and nothing waits on them.
// The comparisons the feedback on a change shows are awaited too, so it opens with them as the
// sheet closes.
function useRefreshLots() {
  const queryClient = useQueryClient();
  return (...compared: Lot[]) => {
    void queryClient.invalidateQueries({ queryKey: earlySaleChecksKeys });
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: lotsKey, exact: true }),
      ...compared.map((lot) => queryClient.prefetchQuery(lotComparisonQuery(lot))),
    ]);
  };
}

export function useAddLot() {
  const refresh = useRefreshLots();
  return useMutation({ mutationFn: postLot, onSuccess: (lot) => refresh(lot) });
}

export function useImportLots() {
  const refresh = useRefreshLots();
  return useMutation({ mutationFn: importLots, onSuccess: () => refresh() });
}

/** useEditLot replaces a lot; replaced is the lot as it was, which the feedback compares with. */
export function useEditLot() {
  const refresh = useRefreshLots();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: LotInput; replaced: Lot }) =>
      putLot(id, input),
    onSuccess: (lot, { replaced }) => refresh(lot, replaced),
  });
}

export function useDeleteLot() {
  const refresh = useRefreshLots();
  return useMutation({ mutationFn: removeLot, onSuccess: () => refresh() });
}
