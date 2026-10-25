// Package calendar counts business days on the Brazilian market calendar: weekdays that are not
// ANBIMA national holidays. Holidays that fall on a weekend take no extra day, and December 31,
// which ANBIMA leaves off its list, is a business day.
package calendar

import (
	_ "embed"
	"encoding/csv"
	"fmt"
	"slices"
	"strings"
	"time"
)

// anbimaHolidays is ANBIMA's national holiday list, kept as data because ANBIMA's terms forbid
// scraping it. Its header says where it comes from and how to refresh it.
//
//go:embed anbima_holidays.csv
var anbimaHolidays string

// Calendar counts business days. Its zero value has no holidays and counts weekdays only.
type Calendar struct {
	holidays []time.Time // weekday holidays at midnight UTC, ascending
}

// New returns the calendar of the ANBIMA national holidays from 2001 to 2099.
func New() (*Calendar, error) {
	return parseHolidays(anbimaHolidays)
}

// parseHolidays reads a holiday list laid out like anbima_holidays.csv.
func parseHolidays(data string) (*Calendar, error) {
	r := csv.NewReader(strings.NewReader(data))
	r.Comment = '#'
	r.FieldsPerRecord = 2

	if _, err := r.Read(); err != nil {
		return nil, fmt.Errorf("calendar: read holiday list header: %w", err)
	}

	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("calendar: read holiday list: %w", err)
	}

	holidays := make([]time.Time, 0, len(records))

	for _, record := range records {
		day, err := time.Parse(time.DateOnly, record[0])
		if err != nil {
			return nil, fmt.Errorf("calendar: parse holiday %q: %w", record[0], err)
		}

		if !isWeekend(day) {
			holidays = append(holidays, day)
		}
	}

	slices.SortFunc(holidays, time.Time.Compare)

	return &Calendar{holidays: slices.CompactFunc(holidays, time.Time.Equal)}, nil
}

// BusinessDays counts the business days from the date of from, inclusive, to the date of to,
// exclusive, as Tesouro counts them from settlement to a bond's flow. Each date is the calendar
// date in its time's own location. The count is negative when to comes before from.
func (c *Calendar) BusinessDays(from, to time.Time) int {
	start, end := civilDate(from), civilDate(to)
	if end.Before(start) {
		return -c.BusinessDays(to, from)
	}

	return weekdays(start, end) - c.holidaysBefore(end) + c.holidaysBefore(start)
}

func (c *Calendar) holidaysBefore(day time.Time) int {
	n, _ := slices.BinarySearchFunc(c.holidays, day, time.Time.Compare)

	return n
}

// weekdays counts the weekdays from start, inclusive, to end, exclusive.
func weekdays(start, end time.Time) int {
	days := int(end.Sub(start) / (24 * time.Hour))
	count := days / 7 * 5

	for i := range days % 7 {
		if !isWeekend(start.AddDate(0, 0, i)) {
			count++
		}
	}

	return count
}

func civilDate(t time.Time) time.Time {
	year, month, day := t.Date()

	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func isWeekend(day time.Time) bool {
	return day.Weekday() == time.Saturday || day.Weekday() == time.Sunday
}
