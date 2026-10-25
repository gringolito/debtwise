package decimal

import "github.com/cockroachdb/apd/v3"

// Rate conversions compound in wide, whose guard digits keep the result correctly rounded to ctx.
var (
	wide       = *ctx.WithPrecision(ctx.Precision + 16)
	one        = *apd.New(1, 0)
	twelve     = *apd.New(12, 0)
	oneTwelfth = func() apd.Decimal {
		var z apd.Decimal
		must(wide.Quo(&z, &one, &twelve))

		return z
	}()
)

// MonthlyToAnnual returns the effective annual rate that compounds from a monthly rate.
func MonthlyToAnnual(monthly Decimal) Decimal {
	return rounded(compound(&monthly.d, &twelve))
}

// AnnualToMonthly returns the monthly rate that compounds to an effective annual rate. It panics
// when the annual rate is below -100%.
func AnnualToMonthly(annual Decimal) Decimal {
	return rounded(compound(&annual.d, &oneTwelfth))
}

// NominalToEffective returns the effective annual rate of a nominal annual rate that a contract
// compounds monthly, a twelfth of it each month.
func NominalToEffective(nominal Decimal) Decimal {
	var monthly apd.Decimal
	must(wide.Quo(&monthly, &nominal.d, &twelve))

	return rounded(compound(&monthly, &twelve))
}

// EffectiveToNominal returns the nominal annual rate, compounded monthly, of an effective annual
// rate. It panics when the effective rate is below -100%.
func EffectiveToNominal(effective Decimal) Decimal {
	nominal := compound(&effective.d, &oneTwelfth)
	must(wide.Mul(nominal, nominal, &twelve))

	return rounded(nominal)
}

// compound returns (1 + rate)^power - 1.
func compound(rate, power *apd.Decimal) *apd.Decimal {
	var z apd.Decimal
	must(wide.Add(&z, rate, &one))
	must(wide.Pow(&z, &z, power))
	must(wide.Sub(&z, &z, &one))

	return &z
}

// rounded rounds x to ctx and drops the trailing zeros rounding leaves.
func rounded(x *apd.Decimal) Decimal {
	var z Decimal
	must(ctx.Round(&z.d, x))

	_, _ = z.d.Reduce(&z.d)

	return z
}
