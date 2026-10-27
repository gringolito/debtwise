package indexes

import "time"

// copomDecisions returns the days the ordinary Copom meetings of each year announced their
// decisions, their second day, in meeting order. Through September 2026 they come from BCB's history
// of the Selic target (https://www.bcb.gov.br/api/servico/sitebcb/historicotaxasjuros), and after it
// from the calendars BCB publishes a year ahead: Comunicado 43.383 for 2026 and Comunicado 45.452
// for 2027.
func copomDecisions() map[int][]time.Time {
	days := func(year int, monthDays ...[2]int) []time.Time {
		out := make([]time.Time, 0, len(monthDays))
		for _, md := range monthDays {
			out = append(out, time.Date(year, time.Month(md[0]), md[1], 0, 0, 0, 0, time.UTC))
		}

		return out
	}

	return map[int][]time.Time{
		2017: days(2017, [2]int{1, 11}, [2]int{2, 22}, [2]int{4, 12}, [2]int{5, 31}, [2]int{7, 26}, [2]int{9, 6}, [2]int{10, 25}, [2]int{12, 6}),
		2018: days(2018, [2]int{2, 7}, [2]int{3, 21}, [2]int{5, 16}, [2]int{6, 20}, [2]int{8, 1}, [2]int{9, 19}, [2]int{10, 31}, [2]int{12, 12}),
		2019: days(2019, [2]int{2, 6}, [2]int{3, 20}, [2]int{5, 8}, [2]int{6, 19}, [2]int{7, 31}, [2]int{9, 18}, [2]int{10, 30}, [2]int{12, 11}),
		2020: days(2020, [2]int{2, 5}, [2]int{3, 18}, [2]int{5, 6}, [2]int{6, 17}, [2]int{8, 5}, [2]int{9, 16}, [2]int{10, 28}, [2]int{12, 9}),
		2021: days(2021, [2]int{1, 20}, [2]int{3, 17}, [2]int{5, 5}, [2]int{6, 16}, [2]int{8, 4}, [2]int{9, 22}, [2]int{10, 27}, [2]int{12, 8}),
		2022: days(2022, [2]int{2, 2}, [2]int{3, 16}, [2]int{5, 4}, [2]int{6, 15}, [2]int{8, 3}, [2]int{9, 21}, [2]int{10, 26}, [2]int{12, 7}),
		2023: days(2023, [2]int{2, 1}, [2]int{3, 22}, [2]int{5, 3}, [2]int{6, 21}, [2]int{8, 2}, [2]int{9, 20}, [2]int{11, 1}, [2]int{12, 13}),
		2024: days(2024, [2]int{1, 31}, [2]int{3, 20}, [2]int{5, 8}, [2]int{6, 19}, [2]int{7, 31}, [2]int{9, 18}, [2]int{11, 6}, [2]int{12, 11}),
		2025: days(2025, [2]int{1, 29}, [2]int{3, 19}, [2]int{5, 7}, [2]int{6, 18}, [2]int{7, 30}, [2]int{9, 17}, [2]int{11, 5}, [2]int{12, 10}),
		2026: days(2026, [2]int{1, 28}, [2]int{3, 18}, [2]int{4, 29}, [2]int{6, 17}, [2]int{8, 5}, [2]int{9, 16}, [2]int{11, 4}, [2]int{12, 9}),
		2027: days(2027, [2]int{1, 27}, [2]int{3, 17}, [2]int{4, 28}, [2]int{6, 16}, [2]int{8, 4}, [2]int{9, 22}, [2]int{10, 27}, [2]int{12, 8}),
	}
}
