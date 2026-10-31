import type { ReactNode } from "react";
import { ListSection, Row, SelectField, TextField } from "@/components/mortgage/FormControls";
import {
  type Basis,
  blankContractRate,
  blankFee,
  blankMonthlyRate,
  type ContractRateRow,
  type EffectiveRow,
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

interface RowContext<T> {
  /** The row's number in its list, counting from 1. */
  n: number;
  /** Whether the API rejected this field of the row. */
  invalid: (field: string) => boolean;
  update: (patch: Partial<T>) => void;
}

interface RowListProps<T extends EffectiveRow> extends RowsProps<T> {
  /** Names the list and, with the row's number, each of its rows: "MIP" and "MIP 1". */
  title: string;
  /** The list's name in the API, such as "mip_rates". */
  location: string;
  /** Finishes "Vigência" for the date input's name: "do MIP" gives "Vigência do MIP 1". */
  validityOf: string;
  blank: () => T;
  /** Renders the inputs a row has besides its effective date. */
  children: (row: T, context: RowContext<T>) => ReactNode;
}

// Every list is rows keyed by an effective date, so the date input, the row numbering, the
// removal and the wiring of API errors to a row live here once.
function RowList<T extends EffectiveRow>({
  title,
  location,
  validityOf,
  rows,
  onChange,
  isInvalid,
  blank,
  children,
}: RowListProps<T>) {
  return (
    <ListSection
      title={title}
      invalid={isInvalid(location)}
      onAdd={() => onChange([...rows, blank()])}
    >
      {rows.map((row, index) => {
        const context: RowContext<T> = {
          n: index + 1,
          invalid: (field) => isInvalid(rowLocation(location, index, field)),
          update: (patch) => onChange(rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r))),
        };
        return (
          <Row
            key={row.id}
            aria-label={`${title} ${context.n}`}
            onRemove={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <TextField
              label="Vigência"
              accessibleName={`Vigência ${validityOf} ${context.n}`}
              type="date"
              value={row.effectiveFrom}
              onChange={(effectiveFrom) => context.update({ effectiveFrom } as Partial<T>)}
              invalid={context.invalid("effective_from")}
            />
            {children(row, context)}
          </Row>
        );
      })}
    </ListSection>
  );
}

const basisOptions = [
  { value: "nominal", label: "Nominal" },
  { value: "effective", label: "Efetiva" },
] as const satisfies readonly { value: Basis; label: string }[];

type VariablePart = "none" | "poupanca_additional";

const variablePartOptions = [
  { value: "none", label: "Nenhuma" },
  { value: "poupanca_additional", label: "Adicional da poupança" },
] as const satisfies readonly { value: VariablePart; label: string }[];

export function ContractRateRows(props: RowsProps<ContractRateRow>) {
  return (
    <RowList
      {...props}
      title="Taxa de juros"
      location="contract_rates"
      validityOf="da taxa de juros"
      blank={blankContractRate}
    >
      {(row, { n, invalid, update }) => (
        <>
          <TextField
            label="Taxa (% a.a.)"
            accessibleName={`Taxa de juros ${n} (% a.a.)`}
            inputMode="decimal"
            value={row.rate}
            onChange={(rate) => update({ rate })}
            invalid={invalid("rate")}
          />
          <SelectField
            label="Base"
            accessibleName={`Base da taxa de juros ${n}`}
            options={basisOptions}
            value={row.basis}
            onChange={(basis) => update({ basis })}
            invalid={invalid("basis")}
          />
          <SelectField
            label="Parte variável"
            accessibleName={`Parte variável da taxa de juros ${n}`}
            options={variablePartOptions}
            value={row.poupancaAdditional ? "poupanca_additional" : "none"}
            onChange={(part) => update({ poupancaAdditional: part === "poupanca_additional" })}
            invalid={invalid("poupanca_additional")}
          />
        </>
      )}
    </RowList>
  );
}

interface MonthlyRateRowsProps extends RowsProps<MonthlyRateRow> {
  insurance: "MIP" | "DFI";
}

export function MonthlyRateRows({ insurance, ...props }: MonthlyRateRowsProps) {
  return (
    <RowList
      {...props}
      title={insurance}
      location={`${insurance.toLowerCase()}_rates`}
      validityOf={`do ${insurance}`}
      blank={blankMonthlyRate}
    >
      {(row, { n, invalid, update }) => (
        <TextField
          label="Taxa (% a.m.)"
          accessibleName={`Taxa do ${insurance} ${n} (% a.m.)`}
          inputMode="decimal"
          value={row.rate}
          onChange={(rate) => update({ rate })}
          invalid={invalid("rate")}
        />
      )}
    </RowList>
  );
}

export function FeeRows(props: RowsProps<FeeRow>) {
  return (
    <RowList
      {...props}
      title="Taxa de administração"
      location="fees"
      validityOf="da taxa de administração"
      blank={blankFee}
    >
      {(row, { n, invalid, update }) => (
        <TextField
          label="Valor (R$)"
          accessibleName={`Valor da taxa de administração ${n} (R$)`}
          inputMode="decimal"
          value={row.amount}
          onChange={(amount) => update({ amount })}
          invalid={invalid("amount")}
        />
      )}
    </RowList>
  );
}
