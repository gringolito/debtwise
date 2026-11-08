package mortgage

import (
	"fmt"
	"time"

	"github.com/gringolito/debtwise/backend/decimal"
)

// Violation is a rule that terms break. Field names the term it concerns in the snake_case the API
// uses, such as "fees" or "fees[1].effective_from".
type Violation struct {
	Field string
	Rule  Rule
}

// Rule is a rule of the mortgage that a value can break, named by a code a client can match.
type Rule string

// The rules of the mortgage, its prepayments and its statements.
const (
	RuleNotPositive               Rule = "not_positive"
	RuleBeforeContract            Rule = "before_contract"
	RuleBeforeToday               Rule = "before_today"
	RuleNoRowFromFirstInstallment Rule = "no_row_from_first_installment"
	RuleRepeatedDate              Rule = "repeated_date"
)

// Rules returns every rule, in the order the API documents them.
func Rules() []Rule {
	return []Rule{
		RuleNotPositive, RuleBeforeContract, RuleBeforeToday, RuleNoRowFromFirstInstallment, RuleRepeatedDate,
	}
}

// Reason says what the rule asks, in English, for API consumers.
func (r Rule) Reason() string {
	switch r {
	case RuleNotPositive:
		return "must be greater than zero"
	case RuleBeforeContract:
		return "must not be before the contract date"
	case RuleBeforeToday:
		return "must not be before today"
	case RuleNoRowFromFirstInstallment:
		return "needs a row effective on or before the first installment date"
	case RuleRepeatedDate:
		return "repeats the date of another row"
	default:
		return ""
	}
}

// Validate returns every rule the terms break across their fields, in field order. Each value's own
// range is the caller's to check: amounts and rates not negative, a term of 1 to 600 months, and a
// known amortization system, indexer and rate basis. Terms that pass both build a schedule.
func (t Terms) Validate() []Violation {
	var violations []Violation

	if t.OriginalAmount.Cmp(decimal.Decimal{}) <= 0 {
		violations = append(violations, Violation{"original_amount", RuleNotPositive})
	}

	if t.FirstInstallmentDate.Before(t.ContractDate) {
		violations = append(violations, Violation{"first_installment_date", RuleBeforeContract})
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
		violations = append(violations, Violation{field, RuleNoRowFromFirstInstallment})
	}

	for i, row := range rows {
		from := row.effectiveFrom()
		if seen[from] {
			violations = append(violations, Violation{fmt.Sprintf("%s[%d].effective_from", field, i), RuleRepeatedDate})
		}

		seen[from] = true
	}

	return violations
}
