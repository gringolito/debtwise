// Package calendar counts business days on the Brazilian market calendar: weekdays that are not
// national holidays. It derives the holidays from the rules that set them, which reproduce
// ANBIMA's national holiday list for every year that list covers, 2001 to 2099. Holidays that fall
// on a weekend take no extra day, and December 31, which is not a national holiday, is a business
// day.
package calendar

import (
	"slices"
	"time"
)

// NationalHolidays returns the national holidays of year in date order, at midnight UTC, once each
// when two of them fall on the same date. November 20 is a holiday from 2024 on (Lei 14.759/2023).
func NationalHolidays(year int) []time.Time {
	easter := easterSunday(year)

	holidays := []time.Time{
		date(year, time.January, 1),
		easter.AddDate(0, 0, -48), // Carnaval Monday
		easter.AddDate(0, 0, -47), // Carnaval Tuesday
		easter.AddDate(0, 0, -2),  // Good Friday
		date(year, time.April, 21),
		date(year, time.May, 1),
		easter.AddDate(0, 0, 60), // Corpus Christi
		date(year, time.September, 7),
		date(year, time.October, 12),
		date(year, time.November, 2),
		date(year, time.November, 15),
		date(year, time.December, 25),
	}
	if year >= 2024 {
		holidays = append(holidays, date(year, time.November, 20))
	}

	slices.SortFunc(holidays, time.Time.Compare)

	return slices.CompactFunc(holidays, time.Time.Equal)
}

// BusinessDays counts the business days from the date of from, inclusive, to the date of to,
// exclusive, as Tesouro counts them from settlement to a bond's flow. Each date is the calendar
// date in its time's own location. The count is negative when to comes before from.
func BusinessDays(from, to time.Time) int {
	start, end := civilDate(from), civilDate(to)
	if end.Before(start) {
		return -BusinessDays(to, from)
	}

	count := weekdays(start, end)

	for year := start.Year(); year <= end.Year(); year++ {
		for _, holiday := range NationalHolidays(year) {
			if !isWeekend(holiday) && !holiday.Before(start) && holiday.Before(end) {
				count--
			}
		}
	}

	return count
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

// easterSunday returns the Gregorian Easter Sunday of year, at midnight UTC, by the anonymous
// Gregorian algorithm (Meeus/Jones/Butcher).
func easterSunday(year int) time.Time {
	a := year % 19
	b, c := year/100, year%100
	d, e := b/4, b%4
	f := (b + 8) / 25
	g := (b - f + 1) / 3
	h := (19*a + b - d - g + 15) % 30
	i, k := c/4, c%4
	l := (32 + 2*e + 2*i - h - k) % 7
	m := (a + 11*h + 22*l) / 451
	month := (h + l - 7*m + 114) / 31
	day := (h+l-7*m+114)%31 + 1

	return date(year, time.Month(month), day)
}

func date(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func civilDate(t time.Time) time.Time {
	year, month, day := t.Date()

	return date(year, month, day)
}

func isWeekend(day time.Time) bool {
	return day.Weekday() == time.Saturday || day.Weekday() == time.Sunday
}
