export interface HolidayRef {
  date: Date;
  name: string;
  isHalfDay?: boolean;
}

export interface WorkScheduleRef {
  workingDays: string[]; // e.g. ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
  restDays: string[];    // e.g. ["Saturday", "Sunday"]
  dailyWorkingHours?: number;
}

export interface DayBreakdown {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  isWorkingDay: boolean;
  deduction: number; // 0, 0.5, or 1.0
  reason?: string;   // e.g. "Rest Day", "Public Holiday: Madaraka Day", "Working Day"
}

export interface WorkingDaysCalculation {
  startDate: string;
  endDate: string;
  calendarDays: number;
  restDaysExcluded: number;
  holidaysExcluded: number;
  netWorkingDays: number;
  breakdown: DayBreakdown[];
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toIsoDateOnly(d: Date): string {
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculates working days between startDate and endDate (inclusive).
 * Evaluates each day against:
 * 1. Assigned WorkSchedule (rest days vs working days)
 * 2. Gazetted Public Holidays
 * 3. Half-day flags (0.5 working day)
 *
 * Fully supports leap years, cross-year periods, part-time and 6-day work patterns.
 */
export function calculateWorkingDays(
  startDateInput: Date | string,
  endDateInput: Date | string,
  schedule: WorkScheduleRef,
  holidays: HolidayRef[] = [],
  isHalfDay = false,
  halfDayType: 'MORNING' | 'AFTERNOON' | null = null,
): WorkingDaysCalculation {
  const start = new Date(startDateInput);
  const end = new Date(endDateInput);

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) {
    throw new Error('End date cannot be prior to start date');
  }

  // Build lookup map for holidays by YYYY-MM-DD
  const holidayMap = new Map<string, HolidayRef>();
  for (const h of holidays) {
    const hDate = new Date(h.date);
    holidayMap.set(toIsoDateOnly(hDate), h);
  }

  const breakdown: DayBreakdown[] = [];
  let restDaysExcluded = 0;
  let holidaysExcluded = 0;
  let netWorkingDays = 0;

  // Single half-day on same start/end date
  const isSingleDayHalf = isHalfDay && toIsoDateOnly(start) === toIsoDateOnly(end);

  const current = new Date(start);
  let calendarDays = 0;

  while (current <= end) {
    calendarDays++;
    const isoDateStr = toIsoDateOnly(current);
    const dayOfWeek = DAY_NAMES[current.getDay()];

    const isRestDay = schedule.restDays.some((r) => r.toLowerCase() === dayOfWeek.toLowerCase());
    const holiday = holidayMap.get(isoDateStr);

    if (isRestDay) {
      restDaysExcluded++;
      breakdown.push({
        date: isoDateStr,
        dayOfWeek,
        isWorkingDay: false,
        deduction: 0,
        reason: `Rest Day (${dayOfWeek})`,
      });
    } else if (holiday) {
      holidaysExcluded++;
      breakdown.push({
        date: isoDateStr,
        dayOfWeek,
        isWorkingDay: false,
        deduction: 0,
        reason: `Public Holiday: ${holiday.name}`,
      });
    } else {
      const deduction = isSingleDayHalf ? 0.5 : 1.0;
      netWorkingDays += deduction;
      breakdown.push({
        date: isoDateStr,
        dayOfWeek,
        isWorkingDay: true,
        deduction,
        reason: isSingleDayHalf ? `Half Day (${halfDayType || 'Part'})` : 'Standard Working Day',
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return {
    startDate: toIsoDateOnly(start),
    endDate: toIsoDateOnly(end),
    calendarDays,
    restDaysExcluded,
    holidaysExcluded,
    netWorkingDays,
    breakdown,
  };
}
