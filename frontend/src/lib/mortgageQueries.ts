import {
  keepPreviousData,
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchMortgage,
  fetchMortgageSchedule,
  fetchPrepayments,
  fetchStatements,
  type PrepaymentInput,
  type PrepaymentPreviewInput,
  postPrepayment,
  postStatement,
  previewSchedule,
  previewPrepayment,
  previewStatement,
  putMortgage,
  putPrepayment,
  putStatement,
  removeMortgage,
  removePrepayment,
  removeStatement,
  type StatementInput,
  type StatementPreviewInput,
} from "@/lib/api";

export const mortgageKey = ["mortgage"] as const;
export const scheduleKey = ["mortgage", "schedule"] as const;
export const prepaymentsKey = ["mortgage", "prepayments"] as const;
export const statementsKey = ["mortgage", "statements"] as const;

/** useMortgage reads the mortgage; its data is null while none is registered. */
export function useMortgage() {
  return useQuery({ queryKey: mortgageKey, queryFn: fetchMortgage });
}

export function useMortgageSchedule() {
  return useQuery({ queryKey: scheduleKey, queryFn: fetchMortgageSchedule });
}

export function usePrepayments() {
  return useQuery({ queryKey: prepaymentsKey, queryFn: fetchPrepayments });
}

export function useStatements() {
  return useQuery({ queryKey: statementsKey, queryFn: fetchStatements });
}

// A preview sits under its list's key, so dropping the list when the mortgage changes drops it too.
// It keeps showing the last answer while the next one loads, and a rejected one is not retried.
// Each answer carries the input it previewed, so a sheet can tell when it no longer matches what
// the owner has since typed.

/** usePrepaymentPreview previews input; it stays idle while input is undefined. */
export function usePrepaymentPreview(input: PrepaymentPreviewInput | undefined) {
  return useQuery({
    queryKey: [...prepaymentsKey, "preview", input],
    queryFn: async () => {
      const previewed = input as PrepaymentPreviewInput;
      return { input: previewed, preview: await previewPrepayment(previewed) };
    },
    enabled: input !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useStatementPreview(input: StatementPreviewInput | undefined) {
  return useQuery({
    queryKey: [...statementsKey, "preview", input],
    queryFn: async () => {
      const previewed = input as StatementPreviewInput;
      return { input: previewed, preview: await previewStatement(previewed) };
    },
    enabled: input !== undefined,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

// The mortgage's own mutations settle the cache by hand first, so the next screen never shows the
// old mortgage, its old schedule, or the prepayments and statements recorded on it while the refetch
// runs.
function dropRecordedEvents(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: scheduleKey });
  queryClient.removeQueries({ queryKey: prepaymentsKey });
  queryClient.removeQueries({ queryKey: statementsKey });
}

export function useSaveMortgage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: putMortgage,
    onSuccess: (saved) => {
      dropRecordedEvents(queryClient);
      queryClient.setQueryData(mortgageKey, saved);
      return queryClient.invalidateQueries({ queryKey: mortgageKey, exact: true });
    },
  });
}

/** usePreviewSchedule computes the schedule of terms that are not registered yet. */
export function usePreviewSchedule() {
  return useMutation({ mutationFn: previewSchedule });
}

export function useDeleteMortgage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeMortgage,
    onSuccess: () => {
      queryClient.setQueryData(mortgageKey, null);
      dropRecordedEvents(queryClient);
      return queryClient.invalidateQueries({ queryKey: mortgageKey, exact: true });
    },
  });
}

// A prepayment changes the schedule and, through the balance it leaves, every statement's drift.
function useRefreshAfterPrepayment() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [scheduleKey, prepaymentsKey, statementsKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey, exact: true }),
      ),
    );
}

function useRefreshAfterStatement() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [scheduleKey, statementsKey].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey, exact: true }),
      ),
    );
}

export function useAddPrepayment() {
  return useMutation({ mutationFn: postPrepayment, onSuccess: useRefreshAfterPrepayment() });
}

export function useEditPrepayment() {
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PrepaymentInput }) => putPrepayment(id, input),
    onSuccess: useRefreshAfterPrepayment(),
  });
}

export function useDeletePrepayment() {
  return useMutation({ mutationFn: removePrepayment, onSuccess: useRefreshAfterPrepayment() });
}

export function useAddStatement() {
  return useMutation({ mutationFn: postStatement, onSuccess: useRefreshAfterStatement() });
}

export function useEditStatement() {
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: StatementInput }) => putStatement(id, input),
    onSuccess: useRefreshAfterStatement(),
  });
}

export function useDeleteStatement() {
  return useMutation({ mutationFn: removeStatement, onSuccess: useRefreshAfterStatement() });
}
