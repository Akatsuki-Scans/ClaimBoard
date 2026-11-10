import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDate,
  ZonedDateTime,
  endOfMonth,
  endOfWeek,
  fromDate,
  getLocalTimeZone,
  isSameDay,
  isSameMonth,
  now,
  startOfMonth,
  startOfWeek,
  today,
} from '@internationalized/date';
import { useDateFormatter, useLocale } from 'react-aria';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CalendarEvent, CalendarEventColor, CalendarView } from './types';
import { CalendarIcon } from '../../ui/icon';

export interface CalendarProps {
  events: CalendarEvent[];
  view?: CalendarView;
  onViewChange?: (view: CalendarView) => void;
  timeZone?: string;
  selectedDate?: CalendarDate;
  onSelectDate?: (date: CalendarDate) => void;
  anchorDate?: CalendarDate;
  onAnchorDateChange?: (date: CalendarDate) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onSlotAdd?: (date: CalendarDate) => void;
  canAdd?: boolean;
  isLoading?: boolean;
  agendaContent?: React.ReactNode;
}

const EVENT_COLOR_TOKENS: Record<
  CalendarEventColor,
  { chip: string; block: string; dot: string; text: string }
> = {
  gray: {
    chip: 'bg-zinc-800/80 text-zinc-200 border-zinc-700/70 hover:border-zinc-500',
    block: 'bg-zinc-900/90 text-zinc-200 border-zinc-700/80 hover:border-zinc-500',
    dot: 'bg-zinc-400',
    text: 'text-zinc-300',
  },
  brand: {
    chip: 'bg-indigo-500/12 text-indigo-200 border-indigo-500/30 hover:border-indigo-400/60',
    block: 'bg-indigo-950/50 text-indigo-200 border-indigo-500/40 hover:border-indigo-400',
    dot: 'bg-indigo-400',
    text: 'text-indigo-300',
  },
  green: {
    chip: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:border-emerald-400/50',
    block: 'bg-emerald-950/40 text-emerald-200 border-emerald-500/35 hover:border-emerald-400',
    dot: 'bg-emerald-400',
    text: 'text-emerald-300',
  },
  blue: {
    chip: 'bg-sky-500/10 text-sky-200 border-sky-500/25 hover:border-sky-400/50',
    block: 'bg-sky-950/40 text-sky-200 border-sky-500/35 hover:border-sky-400',
    dot: 'bg-sky-400',
    text: 'text-sky-300',
  },
  indigo: {
    chip: 'bg-indigo-500/12 text-indigo-200 border-indigo-500/30 hover:border-indigo-400/60',
    block: 'bg-indigo-950/50 text-indigo-200 border-indigo-500/40 hover:border-indigo-400',
    dot: 'bg-indigo-400',
    text: 'text-indigo-300',
  },
  purple: {
    chip: 'bg-violet-500/12 text-violet-200 border-violet-500/30 hover:border-violet-400/60',
    block: 'bg-violet-950/50 text-violet-200 border-violet-500/40 hover:border-violet-400',
    dot: 'bg-violet-400',
    text: 'text-violet-300',
  },
  pink: {
    chip: 'bg-rose-500/12 text-rose-300 border-rose-500/30 hover:border-rose-400/60',
    block: 'bg-rose-950/50 text-rose-200 border-rose-500/40 hover:border-rose-400',
    dot: 'bg-rose-400',
    text: 'text-rose-300',
  },
  orange: {
    chip: 'bg-amber-500/12 text-amber-200 border-amber-500/30 hover:border-amber-400/60',
    block: 'bg-amber-950/45 text-amber-200 border-amber-500/40 hover:border-amber-400',
    dot: 'bg-amber-400',
    text: 'text-amber-300',
  },
  yellow: {
    chip: 'bg-yellow-500/12 text-yellow-200 border-yellow-500/30 hover:border-yellow-400/60',
    block: 'bg-yellow-950/40 text-yellow-200 border-yellow-500/35 hover:border-yellow-400',
    dot: 'bg-yellow-400',
    text: 'text-yellow-300',
  },
};

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toCalendarDateFromZoned(zdt: ZonedDateTime): CalendarDate {
  return new CalendarDate(zdt.year, zdt.month, zdt.day);
}

/**
 * Computes all visible CalendarDate cells for Month, Week, or Day views using @internationalized/date.
 */
export function getCalendarRangeDates(
  anchor: CalendarDate,
  view: CalendarView,
  locale: string
): { days: CalendarDate[]; rangeStart: CalendarDate; rangeEnd: CalendarDate } {
  let rangeStart: CalendarDate;
  let rangeEnd: CalendarDate;

  if (view === 'day') {
    rangeStart = anchor;
    rangeEnd = anchor;
  } else if (view === 'week') {
    rangeStart = startOfWeek(anchor, locale);
    rangeEnd = endOfWeek(anchor, locale);
  } else {
    const mStart = startOfMonth(anchor);
    const mEnd = endOfMonth(anchor);
    rangeStart = startOfWeek(mStart, locale);
    rangeEnd = endOfWeek(mEnd, locale);
  }

  const days: CalendarDate[] = [];
  let cur = rangeStart;
  while (cur.compare(rangeEnd) <= 0) {
    days.push(cur);
    cur = cur.add({ days: 1 });
  }
  return { days, rangeStart, rangeEnd };
}

/**
 * Full-featured Calendar built with @internationalized/date & react-aria supporting Day, Week, Month & Agenda views.
 */
export function Calendar({
  events,
  view: controlledView,
  onViewChange,
  timeZone,
  selectedDate: controlledSelectedDate,
  onSelectDate,
  anchorDate: controlledAnchorDate,
  onAnchorDateChange,
  onEventClick,
  onSlotAdd,
  canAdd = false,
  isLoading = false,
  agendaContent,
}: CalendarProps) {
  const { locale } = useLocale();
  const activeTimeZone = timeZone || getLocalTimeZone();

  const [internalView, setInternalView] = useState<CalendarView>(controlledView || 'month');
  const activeView = controlledView || internalView;
  const setView = (v: CalendarView) => {
    setInternalView(v);
    onViewChange?.(v);
  };

  // Current live zoned time updated every 60 seconds (Untitled UI live time marker spec)
  const [liveNow, setLiveNow] = useState<ZonedDateTime>(() => now(activeTimeZone));
  useEffect(() => {
    setLiveNow(now(activeTimeZone));
    const timer = window.setInterval(() => {
      setLiveNow(now(activeTimeZone));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeTimeZone]);

  const zonedToday = useMemo(() => {
    try {
      return today(activeTimeZone);
    } catch {
      return today('UTC');
    }
  }, [activeTimeZone]);

  const [internalAnchor, setInternalAnchor] = useState<CalendarDate>(() => zonedToday);
  const activeAnchor = controlledAnchorDate || internalAnchor;
  const setAnchor = (next: CalendarDate) => {
    setInternalAnchor(next);
    onAnchorDateChange?.(next);
  };

  const [internalSelected, setInternalSelected] = useState<CalendarDate>(() => zonedToday);
  const activeSelected = controlledSelectedDate || internalSelected;
  const setSelected = (next: CalendarDate) => {
    setInternalSelected(next);
    onSelectDate?.(next);
  };

  const { days } = useMemo(
    () => getCalendarRangeDates(activeAnchor, activeView, locale),
    [activeAnchor, activeView, locale]
  );

  // Formatters powered by react-aria
  const weekdayFormatter = useDateFormatter({ weekday: 'short', timeZone: activeTimeZone });
  const timeFormatter = useDateFormatter({ hour: 'numeric', minute: '2-digit', hour12: true, timeZone: activeTimeZone });
  const dayHeaderFormatter = useDateFormatter({
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: activeTimeZone,
  });

  // Convert native JS Date events into activeTimeZone ZonedDateTime buckets
  const zonedEvents = useMemo(() => {
    return events.map((ev) => {
      const zStart = fromDate(ev.start, activeTimeZone);
      const zEnd = fromDate(ev.end, activeTimeZone);
      const dayDate = toCalendarDateFromZoned(zStart);
      return {
        event: ev,
        zStart,
        zEnd,
        dayKey: dayDate.toString(),
      };
    });
  }, [events, activeTimeZone]);

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, typeof zonedEvents>();
    for (const item of zonedEvents) {
      const list = map.get(item.dayKey) || [];
      list.push(item);
      map.set(item.dayKey, list);
    }
    return map;
  }, [zonedEvents]);

  const yearChoices = useMemo(() => {
    const base = zonedToday.year;
    const set = new Set<number>();
    for (let y = base - 3; y <= base + 5; y++) set.add(y);
    set.add(activeAnchor.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [zonedToday.year, activeAnchor.year]);

  const handlePrev = () => {
    if (activeView === 'day') {
      const next = activeAnchor.subtract({ days: 1 });
      setAnchor(next);
      setSelected(next);
    } else if (activeView === 'week') {
      setAnchor(activeAnchor.subtract({ weeks: 1 }));
    } else {
      setAnchor(activeAnchor.subtract({ months: 1 }));
    }
  };

  const handleNext = () => {
    if (activeView === 'day') {
      const next = activeAnchor.add({ days: 1 });
      setAnchor(next);
      setSelected(next);
    } else if (activeView === 'week') {
      setAnchor(activeAnchor.add({ weeks: 1 }));
    } else {
      setAnchor(activeAnchor.add({ months: 1 }));
    }
  };

  const handleJumpToday = () => {
    setAnchor(zonedToday);
    setSelected(zonedToday);
  };

  const weekdayHeaders = useMemo(() => {
    const weekDays = days.slice(0, 7);
    return weekDays.map((d) => weekdayFormatter.format(d.toDate(activeTimeZone)));
  }, [days, weekdayFormatter, activeTimeZone]);

  const liveHourTopPercent = ((liveNow.hour * 60 + liveNow.minute) / (24 * 60)) * 100;
  const hoursList = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);

  const formatHourLabel = (h: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12} ${period}`;
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
      {/* Top Toolbar */}
      <div className="px-4 py-3 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 bg-zinc-950/30">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-800 bg-[#0d0e11]">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-l-lg transition-colors"
              aria-label="Previous period"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleJumpToday}
              className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white border-x border-zinc-800 transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 rounded-r-lg transition-colors"
              aria-label="Next period"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Explicit Month & Year Pickers */}
          {activeView !== 'agenda' && (
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Select month"
                value={activeAnchor.month}
                onChange={(e) => setAnchor(activeAnchor.set({ month: Number(e.target.value) }))}
                className="h-7 px-2 rounded-lg border border-zinc-800 bg-[#0d0e11] text-xs font-semibold text-zinc-100 focus:outline-none focus:border-zinc-600 cursor-pointer"
              >
                {MONTH_LABELS.map((label, idx) => (
                  <option key={label} value={idx + 1} className="bg-zinc-900 text-zinc-200">
                    {label}
                  </option>
                ))}
              </select>

              <select
                aria-label="Select year"
                value={activeAnchor.year}
                onChange={(e) => setAnchor(activeAnchor.set({ year: Number(e.target.value) }))}
                className="h-7 px-2 rounded-lg border border-zinc-800 bg-[#0d0e11] text-xs font-mono font-semibold text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
              >
                {yearChoices.map((yr) => (
                  <option key={yr} value={yr} className="bg-zinc-900 text-zinc-200">
                    {yr}
                  </option>
                ))}
              </select>

              {activeView === 'day' && (
                <span className="text-xs text-zinc-400 font-mono ml-1 hidden sm:inline">
                  • {dayHeaderFormatter.format(activeAnchor.toDate(activeTimeZone))}
                </span>
              )}
            </div>
          )}
        </div>

        {/* View Dropdown + Legend */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden xl:flex items-center gap-3 text-[11px] text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              Overdue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Due ≤24h
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              In Review
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Completed
            </span>
          </div>

          <select
            aria-label="Calendar view mode"
            value={activeView}
            onChange={(e) => setView(e.target.value as CalendarView)}
            className="h-7 px-2 rounded-lg border border-zinc-800 bg-[#0d0e11] text-xs font-medium text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
          >
            <option value="month" className="bg-zinc-900">
              Month view
            </option>
            <option value="week" className="bg-zinc-900">
              Week view
            </option>
            <option value="day" className="bg-zinc-900">
              Day view
            </option>
            <option value="agenda" className="bg-zinc-900">
              Agenda view
            </option>
          </select>
        </div>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-zinc-500 font-mono">Loading calendar schedule...</div>
      ) : activeView === 'agenda' ? (
        <>{agendaContent}</>
      ) : activeView === 'month' ? (
        <div>
          <div className="grid grid-cols-7 border-b border-zinc-800/80 bg-zinc-950/40">
            {weekdayHeaders.map((d) => (
              <div
                key={d}
                className="py-2 px-2.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500 border-r border-zinc-800/60 last:border-r-0"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-zinc-800/60">
            {days.map((day) => {
              const key = day.toString();
              const dayEvents = eventsByDayKey.get(key) || [];
              const inMonth = isSameMonth(day, activeAnchor);
              const isTodayFlag = isSameDay(day, zonedToday);
              const isSelectedFlag = isSameDay(day, activeSelected);
              const visible = dayEvents.slice(0, 3);
              const overflow = Math.max(0, dayEvents.length - 3);

              return (
                <div
                  key={key}
                  onClick={() => setSelected(day)}
                  onDoubleClick={() => canAdd && onSlotAdd?.(day)}
                  className={`min-h-[116px] p-1.5 transition-colors cursor-pointer flex flex-col ${
                    isSelectedFlag
                      ? 'bg-zinc-900/75 ring-1 ring-inset ring-zinc-500/50'
                      : inMonth
                      ? 'bg-[#111215] hover:bg-zinc-900/40'
                      : 'bg-[#0b0c0e] text-zinc-600 hover:bg-zinc-950/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 px-0.5">
                    <span
                      className={`text-[11px] font-mono tabular-nums h-5 min-w-[20px] px-1 rounded flex items-center justify-center ${
                        isTodayFlag
                          ? 'bg-zinc-100 text-zinc-950 font-semibold'
                          : inMonth
                          ? 'text-zinc-300'
                          : 'text-zinc-600'
                      }`}
                    >
                      {day.day}
                    </span>

                    <div className="flex items-center gap-1">
                      {dayEvents.length > 0 && (
                        <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                          {dayEvents.length}
                        </span>
                      )}
                      {canAdd && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSlotAdd?.(day);
                          }}
                          className="p-0.5 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                          title="Add deadline on this day"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 flex-1 overflow-hidden">
                    {visible.map(({ event, zStart }) => {
                      const tokens = EVENT_COLOR_TOKENS[event.color || 'gray'];
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(day);
                            onEventClick?.(event);
                          }}
                          className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] leading-tight flex items-center gap-1.5 transition-colors ${tokens.chip}`}
                          title={`${event.title} (${timeFormatter.format(zStart.toDate())})`}
                        >
                          {event.dot !== false && (
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${tokens.dot}`} />
                          )}
                          <span className="truncate font-medium">{event.title}</span>
                        </button>
                      );
                    })}

                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(day);
                        }}
                        className="w-full text-left px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : activeView === 'week' ? (
        <div className="grid grid-cols-1 md:grid-cols-7 divide-y md:divide-y-0 md:divide-x divide-zinc-800/70 relative">
          {days.map((day) => {
            const key = day.toString();
            const dayEvents = eventsByDayKey.get(key) || [];
            const isTodayFlag = isSameDay(day, zonedToday);
            const isSelectedFlag = isSameDay(day, activeSelected);

            return (
              <div
                key={key}
                onClick={() => setSelected(day)}
                className={`relative min-h-[400px] p-2.5 flex flex-col gap-2 cursor-pointer transition-colors ${
                  isSelectedFlag ? 'bg-zinc-900/50' : 'hover:bg-zinc-900/20'
                }`}
              >
                {/* Live 60s time marker inside today's column */}
                {isTodayFlag && (
                  <div
                    className="hidden md:flex items-center pointer-events-none absolute left-0 right-0 z-10"
                    style={{ top: `${Math.min(96, Math.max(14, liveHourTopPercent))}%` }}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-400 -ml-1 shadow-sm" />
                    <div className="flex-1 border-t border-rose-400/70" />
                  </div>
                )}

                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/70">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-zinc-500">
                      {weekdayFormatter.format(day.toDate(activeTimeZone))}
                    </div>
                    <div
                      className={`text-sm font-mono tabular-nums mt-0.5 inline-flex items-center justify-center px-1.5 rounded ${
                        isTodayFlag ? 'bg-zinc-100 text-zinc-950 font-semibold' : 'text-zinc-200 font-medium'
                      }`}
                    >
                      {day.day}
                    </div>
                  </div>
                  {canAdd && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSlotAdd?.(day);
                      }}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      title="Schedule on this day"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-2 flex-1 relative z-20">
                  {dayEvents.length === 0 ? (
                    <div className="py-8 text-center text-[10px] text-zinc-600 font-mono">Clear</div>
                  ) : (
                    dayEvents.map(({ event, zStart }) => {
                      const tokens = EVENT_COLOR_TOKENS[event.color || 'gray'];
                      return (
                        <div
                          key={event.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(day);
                            onEventClick?.(event);
                          }}
                          className={`p-2 rounded-lg border text-xs space-y-1.5 transition-colors cursor-pointer ${tokens.block}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="flex items-center gap-1.5">
                              {event.dot !== false && (
                                <span className={`h-1.5 w-1.5 rounded-full ${tokens.dot}`} />
                              )}
                              <span className="font-mono text-[10px] font-semibold">
                                {event.meta?.workTypeCode || 'EVT'}
                              </span>
                            </span>
                            <span className="font-mono text-[10px] tabular-nums opacity-80">
                              {timeFormatter.format(zStart.toDate())}
                            </span>
                          </div>
                          <div className="font-medium text-zinc-100 text-[11px] leading-snug line-clamp-2">
                            {event.title}
                          </div>
                          {event.meta?.subtitle && (
                            <div className="text-[10px] text-zinc-400 truncate">{event.meta.subtitle}</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Day View: 24-Hour Timeline with Live Now Line */
        <div className="p-4 space-y-3">
          {(() => {
            const key = activeAnchor.toString();
            const dayEvents = eventsByDayKey.get(key) || [];
            const isTodayFlag = isSameDay(activeAnchor, zonedToday);

            const byHour = new Map<number, typeof dayEvents>();
            for (const ev of dayEvents) {
              const hr = ev.zStart.hour;
              const arr = byHour.get(hr) || [];
              arr.push(ev);
              byHour.set(hr, arr);
            }

            if (dayEvents.length === 0) {
              return (
                <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl space-y-2">
                  <CalendarIcon className="h-6 w-6 text-zinc-600 mx-auto" />
                  <div className="text-xs font-medium text-zinc-300">
                    Nothing scheduled for {dayHeaderFormatter.format(activeAnchor.toDate(activeTimeZone))}
                  </div>
                  {canAdd && (
                    <button
                      type="button"
                      onClick={() => onSlotAdd?.(activeAnchor)}
                      className="text-xs text-zinc-300 hover:text-white underline underline-offset-2"
                    >
                      + Schedule deadline on this day
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden bg-[#0d0e11]">
                {hoursList
                  .filter((h) => byHour.has(h) || (isTodayFlag && h === liveNow.hour) || (h >= 8 && h <= 23))
                  .map((hour) => {
                    const slotEvents = byHour.get(hour) || [];
                    const isCurrentHour = isTodayFlag && liveNow.hour === hour;

                    return (
                      <div key={hour} className="flex items-stretch min-h-[44px] relative">
                        <div className="w-16 px-2.5 py-2 text-[10px] font-mono text-zinc-500 border-r border-zinc-800/60 shrink-0 flex items-start justify-end">
                          {formatHourLabel(hour)}
                        </div>
                        <div className="flex-1 p-1.5 flex flex-col gap-1.5 relative">
                          {isCurrentHour && (
                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400 py-0.5">
                              <span className="h-2 w-2 rounded-full bg-rose-400 shrink-0" />
                              <span>Now • {timeFormatter.format(liveNow.toDate())}</span>
                              <div className="flex-1 border-t border-rose-500/40" />
                            </div>
                          )}

                          {slotEvents.map(({ event, zStart }) => {
                            const tokens = EVENT_COLOR_TOKENS[event.color || 'gray'];
                            return (
                              <div
                                key={event.id}
                                onClick={() => onEventClick?.(event)}
                                className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${tokens.block}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {event.dot !== false && (
                                    <span className={`h-2 w-2 rounded-full shrink-0 ${tokens.dot}`} />
                                  )}
                                  <span className="font-medium text-zinc-100 truncate">{event.title}</span>
                                </div>
                                <span className="text-[10px] font-mono tabular-nums text-zinc-400 shrink-0">
                                  {timeFormatter.format(zStart.toDate())}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

