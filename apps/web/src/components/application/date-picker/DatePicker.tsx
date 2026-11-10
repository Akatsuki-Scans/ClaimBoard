import React, { useMemo, useState } from 'react';
import {
  CalendarDate,
  CalendarDateTime,
  DateValue,
  fromDate,
  parseDateTime,
  toCalendarDate,
  toCalendarDateTime,
  today,
} from '@internationalized/date';
import {
  Button as AriaButton,
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker as AriaDatePicker,
  DateSegment,
  Dialog,
  Group,
  I18nProvider,
  Popover,
  TimeField,
  TimeValue,
} from 'react-aria-components';
import { ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '@claimboard/ui';
import { CalendarIcon } from '../../ui/icon';
import {
  getBrowserTimeZone,
  getPresetDateTimeLocal,
  getTimeZoneShortLabel,
  isValidTimeZone,
} from '../../../lib/deadlines';

export interface DeadlineDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  timeZone?: string;
  compact?: boolean;
  className?: string;
  placeholder?: string;
  isDisabled?: boolean;
  highlightedDates?: CalendarDate[];
  showPresets?: boolean;
  'aria-label'?: string;
}

const MONTH_NAMES = [
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

const pad2 = (n: number) => String(n).padStart(2, '0');
const pad4 = (n: number) => String(n).padStart(4, '0');

function safeParseCalendarDateTime(raw: string, tz: string): CalendarDateTime | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    try {
      return parseDateTime(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`);
    } catch {
      return null;
    }
  }
  const isoDate = new Date(trimmed);
  if (!isNaN(isoDate.getTime())) {
    try {
      return toCalendarDateTime(fromDate(isoDate, tz));
    } catch {
      return null;
    }
  }
  return null;
}

function toLocalDateTimeString(dt: DateValue | null): string {
  if (!dt) return '';
  const hour = 'hour' in dt ? dt.hour : 23;
  const minute = 'minute' in dt ? dt.minute : 59;
  return `${pad4(dt.year)}-${pad2(dt.month)}-${pad2(dt.day)}T${pad2(hour)}:${pad2(minute)}`;
}

/**
 * Accessible dark Obsidian Date & Time Picker powered by React Aria and @internationalized/date.
 */
export function DeadlineDatePicker({
  value,
  onChange,
  timeZone,
  compact = false,
  className,
  isDisabled = false,
  highlightedDates,
  showPresets = true,
  'aria-label': ariaLabel = 'Deadline date and time',
}: DeadlineDatePickerProps) {
  const activeTimeZone = isValidTimeZone(timeZone) ? timeZone : getBrowserTimeZone();
  const tzShort = getTimeZoneShortLabel(activeTimeZone);

  const parsedValue = useMemo(
    () => safeParseCalendarDateTime(value, activeTimeZone),
    [value, activeTimeZone]
  );

  const todayInZone = useMemo(() => {
    try {
      return today(activeTimeZone);
    } catch {
      return today('UTC');
    }
  }, [activeTimeZone]);

  const [isOpen, setIsOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState<CalendarDate>(
    () => (parsedValue ? toCalendarDate(parsedValue) : todayInZone)
  );

  const highlightSet = useMemo(() => {
    const s = new Set<string>();
    s.add(todayInZone.toString());
    if (highlightedDates) {
      for (const d of highlightedDates) {
        s.add(d.toString());
      }
    }
    return s;
  }, [highlightedDates, todayInZone]);

  const yearOptions = useMemo(() => {
    const baseYear = todayInZone.year;
    const years: number[] = [];
    for (let y = baseYear - 3; y <= baseYear + 5; y++) {
      years.push(y);
    }
    if (focusedDate.year && !years.includes(focusedDate.year)) {
      years.push(focusedDate.year);
      years.sort((a, b) => a - b);
    }
    return years;
  }, [todayInZone.year, focusedDate.year]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setFocusedDate(parsedValue ? toCalendarDate(parsedValue) : todayInZone);
    }
  };

  const handleCalendarSelect = (date: DateValue) => {
    const hr = parsedValue ? parsedValue.hour : 23;
    const min = parsedValue ? parsedValue.minute : 59;
    const next = new CalendarDateTime(date.year, date.month, date.day, hr, min);
    onChange(toLocalDateTimeString(next));
  };

  const handleTimeChange = (time: TimeValue | null) => {
    if (!time) return;
    const base = parsedValue ? toCalendarDate(parsedValue) : todayInZone;
    const next = new CalendarDateTime(base.year, base.month, base.day, time.hour, time.minute);
    onChange(toLocalDateTimeString(next));
  };

  const handleAriaValueChange = (val: CalendarDateTime | null) => {
    if (!val) {
      onChange('');
      return;
    }
    onChange(toLocalDateTimeString(val));
  };

  return (
    <I18nProvider locale="en-US">
      <AriaDatePicker
        aria-label={ariaLabel}
        granularity="minute"
        hourCycle={12}
        value={parsedValue}
        onChange={handleAriaValueChange}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        isDisabled={isDisabled}
        className={cn('group relative flex flex-col w-full', className)}
      >
        <Group
          className={cn(
            'flex items-center justify-between w-full rounded-lg border border-zinc-800 bg-[#121317] font-mono text-zinc-100 shadow-sm transition-colors focus-within:border-zinc-600 focus-within:ring-1 focus-within:ring-zinc-500/40',
            compact ? 'h-7 pl-2 pr-1 text-[11px] bg-zinc-950 border-zinc-700' : 'h-9 pl-2.5 pr-1 text-xs',
            isDisabled && 'opacity-40 cursor-not-allowed'
          )}
        >
          <DateInput className="flex items-center flex-1 min-w-0 overflow-hidden whitespace-nowrap select-none">
            {(segment) => (
              <DateSegment
                segment={segment}
                className={cn(
                  'px-0.5 rounded outline-none tabular-nums focus:bg-zinc-200 focus:text-zinc-950',
                  segment.isPlaceholder ? 'text-zinc-500' : 'text-zinc-100',
                  segment.type === 'literal' && 'px-0 text-zinc-500'
                )}
              />
            )}
          </DateInput>

          <div className="flex items-center gap-0.5 shrink-0">
            {value && !compact && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange('');
                }}
                aria-label="Clear date"
                title="Clear deadline"
                className="h-6 w-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <AriaButton
              aria-label="Open calendar picker"
              className={cn(
                'flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 outline-none transition-colors',
                compact ? 'h-5 w-5' : 'h-7 w-7'
              )}
            >
              <CalendarIcon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            </AriaButton>
          </div>
        </Group>

        <Popover
          placement="bottom start"
          offset={6}
          data-rac-popover="true"
          className="z-[120] outline-none"
        >
          <Dialog className="w-[300px] rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-2xl text-zinc-100 outline-none space-y-3">
            <AriaCalendar
              aria-label="Choose date"
              value={parsedValue ? toCalendarDate(parsedValue) : null}
              focusedValue={focusedDate}
              onFocusChange={setFocusedDate}
              onChange={handleCalendarSelect}
              className="space-y-2.5"
            >
              {/* Month & Year Controls */}
              <div className="flex items-center justify-between gap-1.5">
                <AriaButton
                  slot="previous"
                  aria-label="Previous month"
                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:text-white hover:bg-zinc-800 outline-none transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </AriaButton>

                <div className="flex items-center gap-1">
                  <select
                    aria-label="Month"
                    value={focusedDate.month}
                    onChange={(e) => setFocusedDate(focusedDate.set({ month: Number(e.target.value) }))}
                    className="h-7 px-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-[11px] font-medium text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx + 1} className="bg-zinc-900 text-zinc-200">
                        {name}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Year"
                    value={focusedDate.year}
                    onChange={(e) => setFocusedDate(focusedDate.set({ year: Number(e.target.value) }))}
                    className="h-7 px-1.5 rounded-md border border-zinc-800 bg-zinc-950 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-600 cursor-pointer"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y} className="bg-zinc-900 text-zinc-200">
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <AriaButton
                  slot="next"
                  aria-label="Next month"
                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:text-white hover:bg-zinc-800 outline-none transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </AriaButton>
              </div>

              <CalendarGrid weekdayStyle="short" className="w-full border-collapse">
                <CalendarGridHeader>
                  {(day) => (
                    <CalendarHeaderCell className="pb-1.5 text-[10px] font-mono uppercase text-zinc-500 font-normal text-center">
                      {day}
                    </CalendarHeaderCell>
                  )}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => {
                    const hasDot = highlightSet.has(date.toString());
                    return (
                      <CalendarCell
                        date={date}
                        className="relative h-8 w-8 mx-auto flex flex-col items-center justify-center rounded-lg text-[11px] font-mono tabular-nums cursor-pointer outline-none transition-colors text-zinc-200 hover:bg-zinc-800 data-[outside-month]:text-zinc-600 data-[outside-month]:opacity-50 data-[selected]:bg-zinc-100 data-[selected]:text-zinc-950 data-[selected]:font-semibold data-[focus-visible]:ring-1 data-[focus-visible]:ring-zinc-400"
                      >
                        {({ formattedDate, isSelected }) => (
                          <>
                            <span>{formattedDate}</span>
                            {hasDot && (
                              <span
                                className={cn(
                                  'h-1 w-1 rounded-full -mt-0.5',
                                  isSelected ? 'bg-zinc-950' : 'bg-indigo-400'
                                )}
                              />
                            )}
                          </>
                        )}
                      </CalendarCell>
                    );
                  }}
                </CalendarGridBody>
              </CalendarGrid>
            </AriaCalendar>

            {/* Time Field in Active User Timezone */}
            <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between gap-2">
              <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 shrink-0">
                <Clock className="h-3 w-3 text-zinc-500" />
                Time ({tzShort})
              </span>
              <TimeField
                aria-label="Time"
                granularity="minute"
                hourCycle={12}
                value={parsedValue}
                onChange={handleTimeChange}
              >
                <DateInput className="flex items-center px-2 h-7 rounded-md border border-zinc-800 bg-zinc-950 text-[11px] font-mono text-zinc-200 focus-within:border-zinc-600">
                  {(segment) => (
                    <DateSegment
                      segment={segment}
                      className={cn(
                        'px-0.5 rounded outline-none tabular-nums focus:bg-zinc-200 focus:text-zinc-950',
                        segment.isPlaceholder ? 'text-zinc-500' : 'text-zinc-100',
                        segment.type === 'literal' && 'px-0 text-zinc-500'
                      )}
                    />
                  )}
                </DateInput>
              </TimeField>
            </div>

            {/* Quick Presets */}
            {showPresets && (
              <div className="flex flex-wrap gap-1 pt-1">
                {[
                  { label: '+24h', hours: 24 },
                  { label: '+48h', hours: 48 },
                  { label: '+3d', hours: 72 },
                  { label: '+1w', hours: 168 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onChange(getPresetDateTimeLocal(preset.hours, activeTimeZone))}
                    className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}

            {/* Footer Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold transition-colors"
              >
                Apply
              </button>
            </div>
          </Dialog>
        </Popover>
      </AriaDatePicker>
    </I18nProvider>
  );
}

