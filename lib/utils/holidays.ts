export interface HolidayItem {
  date: string; // YYYY-MM-DD
  name: string;
  dayName: string;
}

export const INDIA_HOLIDAYS_2026: HolidayItem[] = [
  { date: "2026-01-26", name: "Republic Day", dayName: "Monday" },
  { date: "2026-02-15", name: "Maha Shivratri", dayName: "Sunday" },
  { date: "2026-03-04", name: "Holi", dayName: "Wednesday" },
  { date: "2026-03-21", name: "Eid-ul-Fitr", dayName: "Saturday" },
  { date: "2026-04-03", name: "Good Friday", dayName: "Friday" },
  { date: "2026-04-14", name: "Dr. Ambedkar Jayanti", dayName: "Tuesday" },
  { date: "2026-05-01", name: "May Day / Labour Day", dayName: "Friday" },
  { date: "2026-05-31", name: "Bakrid / Eid ul-Adha", dayName: "Sunday" },
  { date: "2026-08-15", name: "Independence Day", dayName: "Saturday" },
  { date: "2026-08-27", name: "Raksha Bandhan", dayName: "Thursday" },
  { date: "2026-09-04", name: "Janmashtami", dayName: "Friday" },
  { date: "2026-10-02", name: "Mahatma Gandhi Jayanti", dayName: "Friday" },
  { date: "2026-10-20", name: "Dussehra (Vijayadashami)", dayName: "Tuesday" },
  { date: "2026-11-08", name: "Diwali (Deepavali)", dayName: "Sunday" },
  { date: "2026-11-10", name: "Govardhan Puja", dayName: "Tuesday" },
  { date: "2026-11-24", name: "Guru Nanak Jayanti", dayName: "Tuesday" },
  { date: "2026-12-25", name: "Christmas", dayName: "Friday" },
];

export function getUpcomingHolidays(fromDateStr?: string, daysRange: number = 45): HolidayItem[] {
  const base = fromDateStr ? new Date(fromDateStr) : new Date();
  base.setHours(0, 0, 0, 0);

  const future = new Date(base.getTime() + daysRange * 24 * 60 * 60 * 1000);

  return INDIA_HOLIDAYS_2026.filter((h) => {
    const hDate = new Date(h.date);
    hDate.setHours(0, 0, 0, 0);
    return hDate >= base && hDate <= future;
  });
}

export function getHolidayForDate(dateStr: string): HolidayItem | undefined {
  return INDIA_HOLIDAYS_2026.find((h) => h.date === dateStr);
}
