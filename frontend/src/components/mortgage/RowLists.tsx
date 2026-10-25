import { ListSection, Row, SelectField, TextField } from "@/components/mortgage/FormControls";
import {
  type Basis,
  blankContractRate,
  blankFee,
  blankMonthlyRate,
  type ContractRateRow,
  type FeeRow,
  type MonthlyRateRow,
  rowLocation,
} from "@/lib/mortgageForm";

interface RowsProps<T> {
  rows: T[];
  onChange: (rows: T[]) => void;
  /** Whether the API rejected this location, as "mip_rates[1].rate" or "mip_rates". */
  isInvalid: (location: string) => boolean;
}

const basisOptions = [
  { value: "nominal", label: "Nominal" },
  { value: "effective", label: "Efetiva" },
] as const satisfies readonly { value: Basis; label: string }[];

// Replaces the row with the same id, so editing one row leaves the others as they are.
function patched<T extends { id: number }>(rows: T[], id: number, patch: Partial<T>): T[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

function without<T extends { id: number }>(rows: T[], id: number): T[] {
  return rows.filter((row) => row.id !== id);
}

export function ContractRateRows({ rows, onChange, isInvalid }: RowsProps<ContractRateRow>) {
  return (
    <ListSection
      title="Taxa de juros"
      invalid={isInvalid("contract_rates")}
      onAdd={() => onChange([...rows, blankContractRate()])}
    >
      {rows.map((row, index) => {
        const n = index + 1;
        const invalid = (field: string) => isInvalid(rowLocation("contract_rates", index, field));
        return (
          <Row
            key={row.id}
            name={`Taxa de juros ${n}`}
            onRemove={() => onChange(without(rows, row.id))}
          >
            <TextField
              label="Vigência"
              accessibleName={`Vigência da taxa de juros ${n}`}
              type="date"
              value={row.effectiveFrom}
              onChange={(value) => onChange(patched(rows, row.id, { effectiveFrom: value }))}
              invalid={invalid("effective_from")}
            />
            <TextField
              label="Taxa (% a.a.)"
              accessibleName={`Taxa de juros ${n} (% a.a.)`}
              inputMode="decimal"
              value={row.rate}
              onChange={(value) => onChange(patched(rows, row.id, { rate: value }))}
              invalid={invalid("rate")}
            />
            <SelectField
              label="Base"
              accessibleName={`Base da taxa de juros ${n}`}
              options={basisOptions}
              value={row.basis}
              onChange={(value) => onChange(patched(rows, row.id, { basis: value }))}
              invalid={invalid("basis")}
            />
          </Row>
        );
      })}
    </ListSection>
  );
}

interface MonthlyRateRowsProps extends RowsProps<MonthlyRateRow> {
  /** What the rate is called: "MIP" or "DFI". */
  insurance: "MIP" | "DFI";
}

export function MonthlyRateRows({ insurance, rows, onChange, isInvalid }: MonthlyRateRowsProps) {
  const list = `${insurance.toLowerCase()}_rates`;
  return (
    <ListSection
      title={insurance}
      invalid={isInvalid(list)}
      onAdd={() => onChange([...rows, blankMonthlyRate()])}
    >
      {rows.map((row, index) => {
        const n = index + 1;
        const invalid = (field: string) => isInvalid(rowLocation(list, index, field));
        return (
          <Row
            key={row.id}
            name={`${insurance} ${n}`}
            onRemove={() => onChange(without(rows, row.id))}
          >
            <TextField
              label="Vigência"
              accessibleName={`Vigência do ${insurance} ${n}`}
              type="date"
              value={row.effectiveFrom}
              onChange={(value) => onChange(patched(rows, row.id, { effectiveFrom: value }))}
              invalid={invalid("effective_from")}
            />
            <TextField
              label="Taxa (% a.m.)"
              accessibleName={`Taxa do ${insurance} ${n} (% a.m.)`}
              inputMode="decimal"
              value={row.rate}
              onChange={(value) => onChange(patched(rows, row.id, { rate: value }))}
              invalid={invalid("rate")}
            />
          </Row>
        );
      })}
    </ListSection>
  );
}

export function FeeRows({ rows, onChange, isInvalid }: RowsProps<FeeRow>) {
  return (
    <ListSection
      title="Tarifa de administração"
      invalid={isInvalid("fees")}
      onAdd={() => onChange([...rows, blankFee()])}
    >
      {rows.map((row, index) => {
        const n = index + 1;
        const invalid = (field: string) => isInvalid(rowLocation("fees", index, field));
        return (
          <Row
            key={row.id}
            name={`Tarifa de administração ${n}`}
            onRemove={() => onChange(without(rows, row.id))}
          >
            <TextField
              label="Vigência"
              accessibleName={`Vigência da tarifa ${n}`}
              type="date"
              value={row.effectiveFrom}
              onChange={(value) => onChange(patched(rows, row.id, { effectiveFrom: value }))}
              invalid={invalid("effective_from")}
            />
            <TextField
              label="Valor (R$)"
              accessibleName={`Valor da tarifa ${n} (R$)`}
              inputMode="decimal"
              value={row.amount}
              onChange={(value) => onChange(patched(rows, row.id, { amount: value }))}
              invalid={invalid("amount")}
            />
          </Row>
        );
      })}
    </ListSection>
  );
}
