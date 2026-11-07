import { useState } from "react";
import {
  type FormValues,
  firstChargeOf,
  type Insurance,
  insuranceFields,
  rowLocation,
  withFirstChargeRates,
} from "@/lib/mortgageForm";
import type { ChangeSheetProps, FirstChargeInput } from "@/pages/contract/ChangeSheet";
import {
  apiNames,
  blankChange,
  type Change,
  type ChangeList,
  type InsuranceList,
  insuranceOf,
  isInsuranceList,
  type ListRow,
} from "@/pages/contract/changes";

/** The change open in the sheet, over a copy of the whole form that "Cancelar" drops. */
interface Editing {
  list: ChangeList;
  rowId: number;
  isNew: boolean;
  draft: FormValues;
}

const needsBaseHints: Record<Insurance, string> = {
  MIP: "Preencha o valor financiado para calcular a taxa.",
  DFI: "Preencha o valor de avaliação para calcular a taxa.",
};

const rowsOf = (values: FormValues, list: ChangeList) => values[list] as ListRow[];

function withRows(values: FormValues, list: ChangeList, rows: ListRow[]): FormValues {
  return withFirstChargeRates(values, { ...values, [list]: rows });
}

interface ChangeEditorOptions {
  values: FormValues;
  setValues: (values: FormValues) => void;
  /** The message for what the API rejected at a location of the body, as "fees[1].amount". */
  messageAt: (location: string) => string | undefined;
  /** Called once a change is added or removed, which moves the rows the API named by position. */
  onRowsMoved: () => void;
}

/**
 * useChangeEditor opens one dated change at a time in a sheet, over a draft of the whole form, and
 * keeps it on the form on "Concluir" or drops it on "Cancelar".
 */
export function useChangeEditor({
  values,
  setValues,
  messageAt,
  onRowsMoved,
}: ChangeEditorOptions) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const open = (list: ChangeList, rowId: number) =>
    setEditing({ list, rowId, isNew: false, draft: values });

  const add = (list: ChangeList) => {
    const row = blankChange(values, list);
    setEditing({
      list,
      rowId: row.id,
      isNew: true,
      draft: withRows(values, list, [...rowsOf(values, list), row]),
    });
  };

  function sheetProps(current: Editing): ChangeSheetProps | null {
    const { list, rowId, isNew, draft } = current;
    const row = rowsOf(draft, list).find((r) => r.id === rowId);
    if (!row) return null;
    const editDraft = (next: FormValues) =>
      setEditing({ ...current, draft: withFirstChargeRates(draft, next) });
    const index = rowsOf(values, list).findIndex((r) => r.id === rowId);

    const switchInsurance = (to: InsuranceList) => {
      const moved = withRows(
        draft,
        list,
        rowsOf(draft, list).filter((r) => r.id !== rowId),
      );
      setEditing({ ...current, list: to, draft: withRows(moved, to, [...rowsOf(moved, to), row]) });
    };

    return {
      change: { list, row } as Change,
      isNew,
      update: (patch) =>
        editDraft({
          ...draft,
          [list]: rowsOf(draft, list).map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
        }),
      messageOf: (field) =>
        isNew ? undefined : messageAt(rowLocation(apiNames[list], index, field)),
      insurance:
        isNew && isInsuranceList(list) ? { value: list, onChange: switchInsurance } : undefined,
      firstCharge: isInsuranceList(list) ? firstCharge(current, list, editDraft) : undefined,
      onDone: () => {
        setValues(draft);
        if (isNew) onRowsMoved();
        setEditing(null);
      },
      onRemove: () => {
        setValues(
          withRows(
            values,
            list,
            rowsOf(values, list).filter((r) => r.id !== rowId),
          ),
        );
        onRowsMoved();
        setEditing(null);
      },
      onCancel: () => setEditing(null),
    };
  }

  return { open, add, sheet: editing && sheetProps(editing) };
}

/** The charge input of an insurance change, offered only on the one in force at the first installment. */
function firstCharge(
  { rowId, draft }: Editing,
  list: InsuranceList,
  editDraft: (next: FormValues) => void,
): FirstChargeInput | undefined {
  const insurance = insuranceOf[list];
  const { charge } = insuranceFields[insurance];
  const derived = firstChargeOf(draft, insurance);
  if (derived.row?.id !== rowId) return undefined;
  return {
    value: draft[charge],
    onChange: (value) => editDraft({ ...draft, [charge]: value }),
    hint: derived.needsBase ? needsBaseHints[insurance] : undefined,
    invalid: !derived.needsBase && draft[charge].trim() !== "" && derived.rate === undefined,
  };
}
