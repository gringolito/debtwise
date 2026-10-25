package mortgage

import (
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// Violation is a rule that terms break. Field names the term it concerns in the snake_case the API
// uses, such as "fees" or "fees[1].effective_from".
type Violation struct {
	Field  string
	Reason string
}

// Validate returns every rule the terms break, in field order, or none for terms a schedule can be
// built from. It checks how the terms relate to each other and leaves each value's own range to
// the caller: amounts and rates not negative, and a term of at least one month.
func (t Terms) Validate() []Violation {
	var violations []Violation

	if t.OriginalAmount.Cmp(decimal.Decimal{}) <= 0 {
		violations = append(violations, Violation{"original_amount", "must be greater than zero"})
	}

	if t.FirstInstallmentDate.Before(t.ContractDate) {
		violations = append(violations, Violation{"first_installment_date", "must not be before the contract date"})
	}

	violations = append(violations, validateRows("contract_rates", t.ContractRates, t.FirstInstallmentDate)...)
	violations = append(violations, validateRows("mip_rates", t.MIPRates, t.FirstInstallmentDate)...)
	violations = append(violations, validateRows("dfi_rates", t.DFIRates, t.FirstInstallmentDate)...)
	violations = append(violations, validateRows("fees", t.Fees, t.FirstInstallmentDate)...)

	return violations
}

// validateRows checks that a row is in effect from the first installment on, and that no two rows
// share a date.
func validateRows[T dated](field string, rows []T, firstInstallment time.Time) []Violation {
	var violations []Violation

	covered := false
	seen := make(map[time.Time]bool, len(rows))

	for _, row := range rows {
		from := row.effectiveFrom()
		covered = covered || !from.After(firstInstallment)
	}

	if !covered {
		violations = append(violations, Violation{field, "needs a row effective on or before the first installment date"})
	}

	for i, row := range rows {
		from := row.effectiveFrom()
		if seen[from] {
			violations = append(violations, Violation{fmt.Sprintf("%s[%d].effective_from", field, i), "repeats the date of another row"})
		}

		seen[from] = true
	}

	return violations
}
