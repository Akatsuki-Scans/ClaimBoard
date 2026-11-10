export type DeadlineUrgency = 'completed' | 'overdue' | 'due_soon' | 'upcoming' | 'none';

export const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Jakarta',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function isValidTimeZone(tz?: string | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function getBrowserTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidTimeZone(tz)) return tz;
  } catch {
    // ignore
  }
  return 'UTC';
}

export function getZonedParts(dateInput: Date | string, timeZone: string) {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const tz = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  const year = get('year');
  const month = get('month'); // 1-12
  const day = get('day');
  const hour = get('hour') % 24;
  const minute = get('minute');
  const second = get('second');
  return { year, month, monthIdx: month - 1, day, hour, minute, second };
}

export function getZonedDayKey(dateInput: Date | string, timeZone: string): string {
  const p = getZonedParts(dateInput, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function zonedWallClockToUtc(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  const tz = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();
  const guessUtcMs = Date.UTC(year, month1to12 - 1, day, hour, minute, second, 0);

  const calcOffsetMs = (utcMs: number) => {
    const p = getZonedParts(new Date(utcMs), tz);
    const asUtcMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    return asUtcMs - utcMs;
  };

  const firstPassMs = guessUtcMs - calcOffsetMs(guessUtcMs);
  const secondPassMs = guessUtcMs - calcOffsetMs(firstPassMs);
  return new Date(secondPassMs);
}

export function getZonedDayBoundsIso(date: Date, timeZone: string) {
  const p = getZonedParts(date, timeZone);
  const start = zonedWallClockToUtc(p.year, p.month, p.day, 0, 0, 0, timeZone);
  const end = zonedWallClockToUtc(p.year, p.month, p.day, 23, 59, 59, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function getTimeZoneShortLabel(timeZone: string, date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

export function formatInUserTimeZone(
  dateInput: string | Date,
  timeZone: string,
  style: 'time' | 'shortDateTime' | 'full' | 'dateOnly' = 'shortDateTime'
): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const tz = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();

  if (style === 'time') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
  }
  if (style === 'dateOnly') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
    }).format(d);
  }
  if (style === 'full') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

/**
 * Compute consistent urgency status for an assignment or chapter deadline.
 */
export function getDeadlineUrgency(deadline?: string | Date | null, status?: string): DeadlineUrgency {
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'APPROVED' || s === 'PUBLISHED') return 'completed';
  if (!deadline) return 'none';

  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs < 0) return 'overdue';
  if (diffMs <= 24 * 60 * 60 * 1000) return 'due_soon';
  return 'upcoming';
}

/**
 * Format compact tabular countdown string (e.g. "3h overdue", "14h left", "3d left").
 */
export function formatDeadlineCountdown(
  deadline?: string | Date | null,
  status?: string,
  timeZone?: string
): string {
  if (!deadline) return 'No deadline';
  const s = (status || '').toUpperCase();
  if (s === 'COMPLETED' || s === 'APPROVED' || s === 'PUBLISHED') {
    return formatInUserTimeZone(deadline, timeZone || getBrowserTimeZone(), 'dateOnly');
  }

  const diffMs = new Date(deadline).getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const totalHours = Math.floor(absMs / 3600000);
  const totalDays = Math.floor(totalHours / 24);

  let span: string;
  if (totalDays >= 1) {
    span = `${totalDays}d`;
  } else if (totalHours >= 1) {
    const remMins = totalMinutes % 60;
    span = remMins > 0 && totalHours < 6 ? `${totalHours}h ${remMins}m` : `${totalHours}h`;
  } else {
    span = `${Math.max(1, totalMinutes)}m`;
  }

  return diffMs < 0 ? `${span} overdue` : `${span} left`;
}

/**
 * Convert a UTC Date/ISO string into a YYYY-MM-DDTHH:mm string in the target user timezone.
 */
export function toDateTimeLocalValue(date?: string | Date | null, timeZone?: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const tz = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();
  const p = getZonedParts(d, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Convert a datetime-local string (YYYY-MM-DDTHH:mm) interpreted in timeZone -> UTC ISO string.
 */
export function zonedDateTimeLocalToIso(localVal: string, timeZone?: string): string | null {
  if (!localVal) return null;
  const match = localVal.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    const fallback = new Date(localVal);
    return isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  const tz = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();
  const utc = zonedWallClockToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    tz
  );
  return utc.toISOString();
}

/**
 * Produce a datetime-local string offset by N hours from now in the target user timezone.
 */
export function getPresetDateTimeLocal(hoursFromNow: number, timeZone?: string): string {
  const target = new Date(Date.now() + hoursFromNow * 3600 * 1000);
  return toDateTimeLocalValue(target, timeZone);
}

/**
 * Return muted semantic styling tokens aligned with Obsidian unslop palette.
 */
export function getUrgencyStyles(urgency: DeadlineUrgency) {
  switch (urgency) {
    case 'overdue':
      return {
        dot: 'bg-rose-400',
        badge: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
        chip: 'bg-rose-500/10 text-rose-300 border-rose-500/25 hover:border-rose-400/50',
        text: 'text-rose-400',
        label: 'Overdue',
      };
    case 'due_soon':
      return {
        dot: 'bg-amber-400',
        badge: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
        chip: 'bg-amber-500/10 text-amber-200 border-amber-500/25 hover:border-amber-400/50',
        text: 'text-amber-300',
        label: 'Due ≤24h',
      };
    case 'completed':
      return {
        dot: 'bg-emerald-400',
        badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
        chip: 'bg-emerald-500/8 text-emerald-300/90 border-emerald-500/20 hover:border-emerald-400/40',
        text: 'text-emerald-400',
        label: 'Completed',
      };
    case 'upcoming':
    default:
      return {
        dot: 'bg-sky-400',
        badge: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/60',
        chip: 'bg-[#16181e] text-zinc-200 border-zinc-800 hover:border-zinc-600',
        text: 'text-zinc-300',
        label: 'Scheduled',
      };
  }
}
