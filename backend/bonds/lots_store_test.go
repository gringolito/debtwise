package bonds_test

import (
	"fmt"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/gringolito/debtwise/backend/bonds"
	"github.com/gringolito/debtwise/backend/db"
)

// A fresh database holds the regressive income tax and IOF tables and B3's custody fee as the law
// and the exchange set them: Lei 11.033/2004, Decreto 6.306/2007 and B3's price list.
func TestTaxesAreSeededWithTheRatesInForce(t *testing.T) {
	t.Parallel()

	conn, err := db.Open(t.Context(), filepath.Join(t.TempDir(), "debtwise.db"))
	require.NoError(t, err)

	t.Cleanup(func() { _ = conn.Close() })

	_, err = db.Migrate(t.Context(), conn)
	require.NoError(t, err)

	taxes, err := bonds.NewStore(conn).Taxes(t.Context())
	require.NoError(t, err)

	incomeTax := make([]string, 0, len(taxes.IncomeTax))
	iof := make([]string, 0, len(taxes.IOF))
	custodyFee := make([]string, 0, len(taxes.CustodyFee))

	for _, r := range taxes.IncomeTax {
		incomeTax = append(incomeTax, fmt.Sprintf("%s %d %s", r.EffectiveFrom.Format("2006-01-02"), r.MinDays, r.Rate))
	}

	for _, r := range taxes.IOF {
		iof = append(iof, fmt.Sprintf("%s %d %s", r.EffectiveFrom.Format("2006-01-02"), r.Days, r.Rate))
	}

	for _, r := range taxes.CustodyFee {
		custodyFee = append(custodyFee, fmt.Sprintf("%s %s", r.EffectiveFrom.Format("2006-01-02"), r.Rate))
	}

	assert.Equal(t, []string{
		"2005-01-01 0 0.225",
		"2005-01-01 181 0.20",
		"2005-01-01 361 0.175",
		"2005-01-01 721 0.15",
	}, incomeTax)
	assert.Equal(t, []string{
		"2008-01-01 1 0.96", "2008-01-01 2 0.93", "2008-01-01 3 0.90", "2008-01-01 4 0.86",
		"2008-01-01 5 0.83", "2008-01-01 6 0.80", "2008-01-01 7 0.76", "2008-01-01 8 0.73",
		"2008-01-01 9 0.70", "2008-01-01 10 0.66", "2008-01-01 11 0.63", "2008-01-01 12 0.60",
		"2008-01-01 13 0.56", "2008-01-01 14 0.53", "2008-01-01 15 0.50", "2008-01-01 16 0.46",
		"2008-01-01 17 0.43", "2008-01-01 18 0.40", "2008-01-01 19 0.36", "2008-01-01 20 0.33",
		"2008-01-01 21 0.30", "2008-01-01 22 0.26", "2008-01-01 23 0.23", "2008-01-01 24 0.20",
		"2008-01-01 25 0.16", "2008-01-01 26 0.13", "2008-01-01 27 0.10", "2008-01-01 28 0.06",
		"2008-01-01 29 0.03",
	}, iof)
	assert.Equal(t, []string{"2020-01-01 0.0025", "2022-01-01 0.0020"}, custodyFee)
}
