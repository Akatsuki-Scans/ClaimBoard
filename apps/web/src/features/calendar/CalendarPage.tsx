import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDate, today } from '@internationalized/date';
import { useDateFormatter, useLocale } from 'react-aria';
import {
  Check,
  ChevronDown,
  ExternalLink,
  Layers,
  Trash2,
  Plus,
  Globe,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { UserAvatar, MangaCover } from '../../components/ui/Avatar';
import { CalendarIcon, ClockIcon } from '../../components/ui/icon';
import { Calendar, getCalendarRangeDates } from '../../components/application/calendar/Calendar';
import { CalendarEvent, CalendarEventColor, CalendarView } from '../../components/application/calendar/types';
import { DeadlineDatePicker } from '../../components/application/date-picker/DatePicker';
import {
  COMMON_TIMEZONES,
  DeadlineUrgency,
  formatDeadlineCountdown,
  formatInUserTimeZone,
  getBrowserTimeZone,
  getPresetDateTimeLocal,
  getTimeZoneShortLabel,
  getUrgencyStyles,
  getZonedDayBoundsIso,
  getZonedDayKey,
  toDateTimeLocalValue,
  zonedDateTimeLocalToIso,
  zonedWallClockToUtc,
} from '../../lib/deadlines';

interface DeadlineItem {
  id: string;
  kind: 'assignment' | 'chapter';
  eventType?: 'deadline' | 'completed_work' | 'submission';
  eventDate?: string | null;
  title: string;
  mangaId?: string;
  mangaTitle: string;
  mangaCoverUrl?: string;
  chapterId?: string;
  chapterNumber: string | number;
  chapterTitle?: string;
  workTypeId?: string;
  workTypeName: string;
  workTypeCode: string;
  workTypeColor?: string;
  assignedWorkerId?: string | null;
  assignedWorkerName?: string | null;
  assignedWorkerAvatarUrl?: string | null;
  status: string;
  priority: string;
  deadline?: string | null;
  submittedAt?: string | null;
  completedAt?: string | null;
  urgency: DeadlineUrgency;
}

function getEventTimestamp(item: DeadlineItem): string | null {
  return item.eventDate || item.deadline || item.completedAt || item.submittedAt || null;
}

function mapItemToCalendarColor(item: DeadlineItem): CalendarEventColor {
  if (item.eventType === 'completed_work' || item.urgency === 'completed') {
    return item.kind === 'chapter' ? 'purple' : 'green';
  }
  if (item.eventType === 'submission') return 'indigo';
  if (item.urgency === 'overdue') return 'pink';
  if (item.urgency === 'due_soon') return 'orange';
  return item.kind === 'chapter' ? 'brand' : 'blue';
}

interface DeadlinesResponse {
  items: DeadlineItem[];
  summary: {
    total: number;
    overdue: number;
    dueToday: number;
    dueSoon: number;
    dueThisWeek: number;
    completed: number;
  };
}

export function CalendarPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { locale } = useLocale();
  const browserTimeZone = useMemo(() => getBrowserTimeZone(), []);

  const canEditDeadlines =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    user?.role === 'Moderator' ||
    Boolean(user?.permissions?.includes('assignments.edit'));

  // View & filter controls
  const [viewMode, setViewMode] = useState<CalendarView>('month');
  const [scope, setScope] = useState<'all' | 'mine'>('all');
  const [selectedMangaId, setSelectedMangaId] = useState<string>('All');
  const [selectedWorkTypeIds, setSelectedWorkTypeIds] = useState<string[]>([]);
  const [isRoleFilterOpen, setIsRoleFilterOpen] = useState(false);
  const roleFilterRef = useRef<HTMLDivElement | null>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (roleFilterRef.current && !roleFilterRef.current.contains(e.target as Node)) {
        setIsRoleFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Persisted User Timezone Preference
  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });

  const activeTimeZone = tzData?.timezone || browserTimeZone;

  const updateTimeZoneMutation = useMutation({
    mutationFn: async (timezone: string) => {
      return apiRequest<{ timezone: string }>('/deadlines/timezone', {
        method: 'PATCH',
        body: JSON.stringify({ timezone }),
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['deadlines', 'timezone'], { timezone: res.timezone });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
    },
  });

  const timezoneOptions = useMemo(() => {
    const set = new Set([browserTimeZone, activeTimeZone, ...COMMON_TIMEZONES]);
    return Array.from(set);
  }, [browserTimeZone, activeTimeZone]);

  // @internationalized/date CalendarDate anchors strictly in activeTimeZone
  const [anchorDate, setAnchorDate] = useState<CalendarDate>(() => {
    try {
      return today(browserTimeZone);
    } catch {
      return today('UTC');
    }
  });
  const [selectedCalDate, setSelectedCalDate] = useState<CalendarDate>(() => {
    try {
      return today(browserTimeZone);
    } catch {
      return today('UTC');
    }
  });

  // Inspector / Reschedule modal state
  const [activeItem, setActiveItem] = useState<DeadlineItem | null>(null);
  const [editDeadlineValue, setEditDeadlineValue] = useState<string>('');

  // Create/Assign deadline modal state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleKind, setScheduleKind] = useState<'assignment' | 'chapter'>('assignment');
  const [scheduleMangaId, setScheduleMangaId] = useState('');
  const [scheduleChapterId, setScheduleChapterId] = useState('');
  const [scheduleTargetId, setScheduleTargetId] = useState('');
  const [scheduleTargetIds, setScheduleTargetIds] = useState<string[]>([]);
  const [scheduleDateValue, setScheduleDateValue] = useState(() => getPresetDateTimeLocal(48, browserTimeZone));

  // Query bounds computed from @internationalized/date visible range in activeTimeZone
  const { rangeStart, rangeEnd } = useMemo(
    () => getCalendarRangeDates(anchorDate, viewMode, locale),
    [anchorDate, viewMode, locale]
  );

  const queryUtcRange = useMemo(() => {
    const startUtc = zonedWallClockToUtc(
      rangeStart.year,
      rangeStart.month,
      rangeStart.day,
      0,
      0,
      0,
      activeTimeZone
    );
    const endUtc = zonedWallClockToUtc(
      rangeEnd.year,
      rangeEnd.month,
      rangeEnd.day,
      23,
      59,
      59,
      activeTimeZone
    );
    return { start: startUtc, end: endUtc };
  }, [rangeStart, rangeEnd, activeTimeZone]);

  const todayBounds = useMemo(() => getZonedDayBoundsIso(new Date(), activeTimeZone), [activeTimeZone]);
  const todayDayKey = useMemo(() => getZonedDayKey(new Date(), activeTimeZone), [activeTimeZone]);
  const tomorrowDayKey = useMemo(
    () => getZonedDayKey(new Date(Date.now() + 24 * 3600 * 1000), activeTimeZone),
    [activeTimeZone]
  );

  const { data: mangaList = [] } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga').catch(() => []),
  });

  const { data: workTypes = [] } = useQuery<any[]>({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types').catch(() => []),
  });

  // Fetch deadlines + completed works + submissions
  const { data: deadlineData, isLoading } = useQuery<DeadlinesResponse>({
    queryKey: [
      'deadlines',
      'activity',
      viewMode === 'agenda' ? 'agenda' : queryUtcRange.start.toISOString(),
      viewMode === 'agenda' ? 'all' : queryUtcRange.end.toISOString(),
      todayBounds.startIso,
      selectedMangaId,
      selectedWorkTypeIds.join(','),
      urgencyFilter,
      scope,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('includeActivity', 'true');
      if (viewMode !== 'agenda') {
        params.set('from', queryUtcRange.start.toISOString());
        params.set('to', queryUtcRange.end.toISOString());
      }
      params.set('todayStart', todayBounds.startIso);
      params.set('todayEnd', todayBounds.endIso);
      if (selectedMangaId !== 'All') params.set('mangaId', selectedMangaId);
      if (selectedWorkTypeIds.length > 0) params.set('workTypeIds', selectedWorkTypeIds.join(','));
      if (urgencyFilter !== 'all') params.set('urgency', urgencyFilter);
      params.set('scope', scope);
      return apiRequest<DeadlinesResponse>(`/deadlines?${params.toString()}`).catch(() => ({
        items: [],
        summary: { total: 0, overdue: 0, dueToday: 0, dueSoon: 0, dueThisWeek: 0, completed: 0 },
      }));
    },
  });

  // Supporting queries for "+ Schedule Deadline" modal
  const { data: scheduleChapters = [] } = useQuery({
    queryKey: ['chapters', 'schedule', scheduleMangaId],
    queryFn: () =>
      scheduleMangaId
        ? apiRequest<any[]>(`/chapters?mangaId=${scheduleMangaId}`).catch(() => [])
        : Promise.resolve([]),
    enabled: isScheduleModalOpen && !!scheduleMangaId,
  });

  const { data: scheduleAssignments = [] } = useQuery({
    queryKey: ['assignments', 'schedule', scheduleMangaId],
    queryFn: () =>
      scheduleMangaId
        ? apiRequest<any[]>(`/assignments?mangaId=${scheduleMangaId}`).catch(() => [])
        : Promise.resolve([]),
    enabled: isScheduleModalOpen && scheduleKind === 'assignment' && !!scheduleMangaId,
  });

  const updateDeadlineMutation = useMutation({
    mutationFn: async ({
      kind,
      id,
      deadline,
    }: {
      kind: 'assignment' | 'chapter';
      id: string;
      deadline: string | null;
    }) => {
      return apiRequest(`/deadlines/${kind}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          deadline: deadline ? zonedDateTimeLocalToIso(deadline, activeTimeZone) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      setActiveItem(null);
      setIsScheduleModalOpen(false);
    },
  });

  const items = deadlineData?.items || [];
  const summary = deadlineData?.summary || {
    total: 0,
    overdue: 0,
    dueToday: 0,
    dueSoon: 0,
    dueThisWeek: 0,
    completed: 0,
  };

  // Map day string (YYYY-MM-DD) strictly in activeTimeZone -> sorted items
  const itemsByDayKey = useMemo(() => {
    const map = new Map<string, DeadlineItem[]>();
    for (const item of items) {
      const ts = getEventTimestamp(item);
      if (!ts) continue;
      const key = getZonedDayKey(ts, activeTimeZone);
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
    }
    return map;
  }, [items, activeTimeZone]);

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const out: CalendarEvent[] = [];
    for (const item of items) {
      const ts = getEventTimestamp(item);
      if (!ts) continue;
      const start = new Date(ts);
      if (isNaN(start.getTime())) continue;
      const prefix =
        item.eventType === 'completed_work'
          ? '✓ '
          : item.eventType === 'submission'
          ? '📤 '
          : '';
      out.push({
        id: `${item.kind}-${item.eventType || 'deadline'}-${item.id}`,
        title: `${prefix}${item.workTypeCode} • ${item.mangaTitle} #${item.chapterNumber}`,
        start,
        end: new Date(start.getTime() + 60 * 60 * 1000),
        color: mapItemToCalendarColor(item),
        dot: true,
        meta: {
          item,
          workTypeCode: item.workTypeCode,
          subtitle:
            item.eventType === 'completed_work'
              ? `Done${item.assignedWorkerName ? ` • ${item.assignedWorkerName}` : ''}`
              : item.assignedWorkerName || (item.kind === 'chapter' ? 'Target' : 'Open'),
        },
      });
    }
    return out;
  }, [items]);

  const selectedDayKey = selectedCalDate.toString();
  const selectedDayItems = itemsByDayKey.get(selectedDayKey) || [];

  const urgentQueue = useMemo(() => {
    return items
      .filter((i) => i.urgency === 'overdue' || i.urgency === 'due_soon')
      .slice(0, 8);
  }, [items]);

  // Agenda groupings strictly in activeTimeZone
  const agendaGroups = useMemo(() => {
    const groups: { key: string; title: string; items: DeadlineItem[] }[] = [
      { key: 'overdue', title: 'Overdue', items: [] },
      { key: 'today', title: 'Today', items: [] },
      { key: 'tomorrow', title: 'Tomorrow', items: [] },
      { key: 'upcoming', title: 'Upcoming', items: [] },
      { key: 'completed', title: 'Completed Works', items: [] },
    ];

    for (const item of items) {
      if (item.urgency === 'completed' || item.eventType === 'completed_work') {
        groups[4].items.push(item);
      } else if (item.urgency === 'overdue') {
        groups[0].items.push(item);
      } else {
        const ts = getEventTimestamp(item);
        const key = ts ? getZonedDayKey(ts, activeTimeZone) : '';
        if (key === todayDayKey) groups[1].items.push(item);
        else if (key === tomorrowDayKey) groups[2].items.push(item);
        else groups[3].items.push(item);
      }
    }

    return groups.filter((g) => g.items.length > 0);
  }, [items, activeTimeZone, todayDayKey, tomorrowDayKey]);

  const openItemInspector = (item: DeadlineItem) => {
    setActiveItem(item);
    setEditDeadlineValue(
      item.deadline ? toDateTimeLocalValue(item.deadline, activeTimeZone) : getPresetDateTimeLocal(48, activeTimeZone)
    );
  };

  const batchUpdateDeadlinesMutation = useMutation({
    mutationFn: async ({
      kind,
      ids,
      deadline,
    }: {
      kind: 'assignment' | 'chapter';
      ids: string[];
      deadline: string | null;
    }) => {
      return apiRequest('/deadlines/batch', {
        method: 'PATCH',
        body: JSON.stringify({
          kind,
          ids,
          deadline: deadline ? zonedDateTimeLocalToIso(deadline, activeTimeZone) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      setActiveItem(null);
      setIsScheduleModalOpen(false);
    },
  });

  const openScheduleForDate = (targetDate?: CalendarDate) => {
    if (targetDate) {
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduleDateValue(
        `${targetDate.year}-${pad(targetDate.month)}-${pad(targetDate.day)}T23:59`
      );
    } else {
      setScheduleDateValue(getPresetDateTimeLocal(48, activeTimeZone));
    }
    setScheduleChapterId('');
    setScheduleTargetId('');
    setScheduleTargetIds([]);
    if (!scheduleMangaId && mangaList.length > 0) {
      setScheduleMangaId(mangaList[0].id);
    }
    setIsScheduleModalOpen(true);
  };

  const tzShort = getTimeZoneShortLabel(activeTimeZone);
  const fullDayFmt = useDateFormatter({ weekday: 'long', month: 'short', day: 'numeric', timeZone: activeTimeZone });
  const shortDayFmt = useDateFormatter({ month: 'short', day: 'numeric', timeZone: activeTimeZone });
  const selectedDateFullLabel = fullDayFmt.format(selectedCalDate.toDate(activeTimeZone));
  const selectedDateShortLabel = shortDayFmt.format(selectedCalDate.toDate(activeTimeZone));

  return (
    <div className="space-y-5 max-w-[1440px] mx-auto text-zinc-100 select-none pb-14">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-zinc-400" />
            Calendar
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Deadlines, completed works, and chapter schedule in your local timezone ({activeTimeZone} • {tzShort})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timezone Perspective Selector */}
          <div
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-300"
            title="Select calendar & deadline timezone perspective"
          >
            <Globe className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <select
              value={activeTimeZone}
              onChange={(e) => updateTimeZoneMutation.mutate(e.target.value)}
              className="bg-transparent text-xs font-mono text-zinc-200 focus:outline-none cursor-pointer max-w-[165px] truncate"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz} className="bg-zinc-900 text-zinc-200">
                  {tz === browserTimeZone ? `Auto (${tz})` : tz} • {getTimeZoneShortLabel(tz)}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Segmented Control */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-[#111215] p-0.5">
            {(['month', 'week', 'day', 'agenda'] as const).map((mode) => {
              const active = viewMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={`relative z-10 px-2.5 py-1 rounded-md text-xs capitalize transition-colors ${
                    active ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="calendarViewModePill"
                      className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    />
                  )}
                  {mode}
                </button>
              );
            })}
          </div>

          {/* Scope Switcher */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-[#111215] p-0.5">
            {(
              [
                { key: 'all', label: 'Team' },
                { key: 'mine', label: 'Mine' },
              ] as const
            ).map((opt) => {
              const active = scope === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setScope(opt.key)}
                  className={`relative z-10 px-2.5 py-1 rounded-md text-xs transition-colors ${
                    active ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="calendarScopePill"
                      className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    />
                  )}
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Series Filter */}
          <select
            value={selectedMangaId}
            onChange={(e) => setSelectedMangaId(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="All">All Series</option>
            {mangaList.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          {/* Multiple / All Roles & Work Types Selector */}
          <div className="relative" ref={roleFilterRef}>
            <button
              type="button"
              onClick={() => setIsRoleFilterOpen((prev) => !prev)}
              className={`h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                selectedWorkTypeIds.length > 0
                  ? 'bg-zinc-800/90 border-zinc-600 text-zinc-100 font-medium'
                  : 'bg-[#111215] border-zinc-800 text-zinc-200 hover:border-zinc-700'
              }`}
              title="Filter by one, multiple, or all roles / work types"
            >
              <Layers className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="truncate max-w-[120px]">
                {selectedWorkTypeIds.length === 0
                  ? 'All Roles'
                  : selectedWorkTypeIds.length === 1
                  ? selectedWorkTypeIds[0] === 'CHAPTER'
                    ? 'Chapter Target'
                    : workTypes.find((w: any) => w.id === selectedWorkTypeIds[0])?.code || '1 Role'
                  : `${selectedWorkTypeIds.length} Roles`}
              </span>
              <ChevronDown className="h-3 w-3 text-zinc-500 shrink-0" />
            </button>

            {isRoleFilterOpen && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-xl border border-zinc-800 bg-[#111215] shadow-2xl p-2 z-50 space-y-1">
                <div className="flex items-center justify-between px-2 py-1 border-b border-zinc-800/80 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Roles / Work Types
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedWorkTypeIds([])}
                    className="text-[10px] font-mono text-zinc-400 hover:text-zinc-100"
                  >
                    Reset
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedWorkTypeIds([])}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    selectedWorkTypeIds.length === 0
                      ? 'bg-zinc-800 text-zinc-100 font-medium'
                      : 'text-zinc-300 hover:bg-zinc-900'
                  }`}
                >
                  <span>All Roles & Targets</span>
                  {selectedWorkTypeIds.length === 0 && <Check className="h-3.5 w-3.5 text-zinc-100" />}
                </button>

                {workTypes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedWorkTypeIds(workTypes.map((wt: any) => wt.id))}
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedWorkTypeIds.length === workTypes.length &&
                      !selectedWorkTypeIds.includes('CHAPTER')
                        ? 'bg-zinc-800 text-zinc-100 font-medium'
                        : 'text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <span>All Task Roles Only ({workTypes.length})</span>
                    {selectedWorkTypeIds.length === workTypes.length &&
                      !selectedWorkTypeIds.includes('CHAPTER') && <Check className="h-3.5 w-3.5 text-zinc-100" />}
                  </button>
                )}

                <div className="border-t border-zinc-800/70 pt-1 space-y-0.5 max-h-56 overflow-y-auto">
                  {workTypes.map((wt: any) => {
                    const checked = selectedWorkTypeIds.includes(wt.id);
                    return (
                      <button
                        key={wt.id}
                        type="button"
                        onClick={() =>
                          setSelectedWorkTypeIds((prev) =>
                            prev.includes(wt.id) ? prev.filter((id) => id !== wt.id) : [...prev, wt.id]
                          )
                        }
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                          checked ? 'bg-zinc-800/80 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900/80'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: wt.color || '#6366f1' }}
                          />
                          <span className="truncate">{wt.name}</span>
                          <span className="text-[10px] font-mono text-zinc-500">{wt.code}</span>
                        </span>
                        {checked && <Check className="h-3.5 w-3.5 text-zinc-100 shrink-0" />}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedWorkTypeIds((prev) =>
                        prev.includes('CHAPTER') ? prev.filter((id) => id !== 'CHAPTER') : [...prev, 'CHAPTER']
                      )
                    }
                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      selectedWorkTypeIds.includes('CHAPTER')
                        ? 'bg-zinc-800/80 text-zinc-100'
                        : 'text-zinc-300 hover:bg-zinc-900/80'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="truncate">Chapter Release Target</span>
                      <span className="text-[10px] font-mono text-zinc-500">CH</span>
                    </span>
                    {selectedWorkTypeIds.includes('CHAPTER') && (
                      <Check className="h-3.5 w-3.5 text-zinc-100 shrink-0" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Event Type / Status Filter */}
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="all">All Activity & Deadlines</option>
            <option value="deadline">Deadlines Only</option>
            <option value="completed_work">Completed Works</option>
            <option value="submission">In Review / Submitted</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due ≤24h</option>
            <option value="upcoming">Scheduled</option>
          </select>

          {canEditDeadlines && (
            <Button
              variant="primary"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => openScheduleForDate(selectedCalDate)}
            >
              <Plus className="h-3.5 w-3.5" />
              Set Deadline
            </Button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-800/90 bg-[#111215] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400">Overdue</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {summary.overdue}
            </div>
          </div>
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              summary.overdue > 0 ? 'bg-rose-400 ring-4 ring-rose-500/15' : 'bg-zinc-700'
            }`}
          />
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-[#111215] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400">Due Today ({tzShort})</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {summary.dueToday}
            </div>
          </div>
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              summary.dueToday > 0 ? 'bg-amber-400 ring-4 ring-amber-500/15' : 'bg-zinc-700'
            }`}
          />
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-[#111215] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400">Due Within 7 Days</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {summary.dueThisWeek}
            </div>
          </div>
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400/80" />
        </div>

        <div className="rounded-xl border border-zinc-800/90 bg-[#111215] px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400">Completed</div>
            <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-0.5">
              {summary.completed}
            </div>
          </div>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: @internationalized/date + React Aria Calendar (Month / Week / Day / Agenda) */}
        <div className="lg:col-span-8 xl:col-span-9">
          <Calendar
            events={calendarEvents}
            view={viewMode}
            onViewChange={setViewMode}
            timeZone={activeTimeZone}
            anchorDate={anchorDate}
            onAnchorDateChange={setAnchorDate}
            selectedDate={selectedCalDate}
            onSelectDate={setSelectedCalDate}
            onEventClick={(ev) => {
              const item = ev.meta?.item as DeadlineItem | undefined;
              if (item) openItemInspector(item);
            }}
            onSlotAdd={(day) => openScheduleForDate(day)}
            canAdd={canEditDeadlines}
            isLoading={isLoading}
            agendaContent={
              <div className="divide-y divide-zinc-800/80">
                {agendaGroups.length === 0 ? (
                  <div className="p-16 text-center space-y-2">
                    <CalendarIcon className="h-7 w-7 text-zinc-600 mx-auto" />
                    <div className="text-sm font-medium text-zinc-200">No scheduled activity or deadlines</div>
                    <p className="text-xs text-zinc-500">
                      Deadlines, completed works, and chapter releases will appear here chronologically.
                    </p>
                  </div>
                ) : (
                  agendaGroups.map((group) => (
                    <div key={group.key} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 font-mono">
                          {group.title}
                        </h3>
                        <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                          {group.items.length} item{group.items.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {group.items.map((item) => {
                          const styles = getUrgencyStyles(item.urgency);
                          const ts = getEventTimestamp(item);
                          return (
                            <div
                              key={`${item.kind}-${item.eventType || 'deadline'}-${item.id}`}
                              onClick={() => openItemInspector(item)}
                              className="p-3 rounded-lg border border-zinc-800/80 bg-[#0d0e11] hover:border-zinc-700 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`h-2 w-2 rounded-full shrink-0 ${styles.dot}`} />
                                <MangaCover src={item.mangaCoverUrl} title={item.mangaTitle} size="sm" />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-zinc-100 truncate">
                                      {item.mangaTitle}
                                    </span>
                                    <span className="text-[11px] font-mono text-zinc-400">
                                      Ch. {item.chapterNumber}
                                    </span>
                                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                                      {item.workTypeName}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-2">
                                    <span>
                                      {item.assignedWorkerName
                                        ? `Assigned to ${item.assignedWorkerName}`
                                        : item.kind === 'chapter'
                                        ? 'Chapter Release'
                                        : 'Open for claim'}
                                    </span>
                                    <span>•</span>
                                    <span className="font-mono">{item.status}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 justify-between sm:justify-end">
                                <div className="text-right">
                                  <div className={`text-[11px] font-mono font-medium tabular-nums inline-flex items-center gap-1 ${styles.text}`}>
                                    <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />
                                    {item.deadline
                                      ? formatDeadlineCountdown(item.deadline, item.status, activeTimeZone)
                                      : ts
                                      ? formatInUserTimeZone(ts, activeTimeZone, 'dateOnly')
                                      : 'Completed'}
                                  </div>
                                  {ts && (
                                    <div className="text-[10px] font-mono text-zinc-500 tabular-nums">
                                      {formatInUserTimeZone(ts, activeTimeZone, 'shortDateTime')}
                                    </div>
                                  )}
                                </div>
                                <Link
                                  to={item.mangaId && item.chapterId ? `/pipeline/${item.mangaId}/${item.chapterId}` : '/pipeline'}
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                                  title="Open in Pipeline"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            }
          />
        </div>

        {/* Right Side Inspector Column */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                  Selected Date ({tzShort})
                </div>
                <div className="text-sm font-semibold text-zinc-100 mt-0.5">
                  {selectedDateFullLabel}
                </div>
              </div>

              {canEditDeadlines && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2 text-[11px] gap-1"
                  onClick={() => openScheduleForDate(selectedCalDate)}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              )}
            </div>

            {selectedDayItems.length === 0 ? (
              <div className="py-8 text-center space-y-2 border border-dashed border-zinc-800/80 rounded-lg">
                <p className="text-xs text-zinc-500">No items on {selectedDateShortLabel}</p>
                {canEditDeadlines && (
                  <button
                    type="button"
                    onClick={() => openScheduleForDate(selectedCalDate)}
                    className="text-[11px] text-zinc-300 hover:text-white underline underline-offset-2"
                  >
                    + Schedule a task or chapter
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {selectedDayItems.map((item) => {
                  const styles = getUrgencyStyles(item.urgency);
                  const ts = getEventTimestamp(item);
                  return (
                    <div
                      key={`${item.kind}-${item.eventType || 'deadline'}-${item.id}`}
                      onClick={() => openItemInspector(item)}
                      className="p-2.5 rounded-lg border border-zinc-800/90 bg-[#0d0e11] hover:border-zinc-700 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-200 border border-zinc-700/60">
                          {item.workTypeCode} • {item.workTypeName}
                        </span>
                        {ts && (
                          <span className={`text-[10px] font-mono tabular-nums ${styles.text}`}>
                            {formatInUserTimeZone(ts, activeTimeZone, 'time')}
                          </span>
                        )}
                      </div>

                      <div className="text-xs font-medium text-zinc-100 truncate">
                        {item.mangaTitle} — Ch. {item.chapterNumber}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.assignedWorkerName ? (
                            <>
                              <UserAvatar
                                src={item.assignedWorkerAvatarUrl}
                                name={item.assignedWorkerName}
                                size="xs"
                              />
                              <span className="truncate">{item.assignedWorkerName}</span>
                            </>
                          ) : (
                            <span className="italic">
                              {item.kind === 'chapter' ? 'Chapter target' : 'Unclaimed slot'}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-mono inline-flex items-center gap-1 ${styles.text}`}>
                          <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />
                          {item.deadline
                            ? formatDeadlineCountdown(item.deadline, item.status, activeTimeZone)
                            : item.eventType === 'completed_work'
                            ? 'Completed'
                            : item.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                <ClockIcon className="h-3.5 w-3.5 text-amber-400" />
                Attention Needed
              </div>
              <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
                {urgentQueue.length}
              </span>
            </div>

            {urgentQueue.length === 0 ? (
              <div className="py-5 text-center text-xs text-zinc-500">
                All active deadlines are comfortably ahead of schedule.
              </div>
            ) : (
              <div className="space-y-2">
                {urgentQueue.map((item) => {
                  const styles = getUrgencyStyles(item.urgency);
                  return (
                    <div
                      key={`urgent-${item.kind}-${item.id}`}
                      onClick={() => openItemInspector(item)}
                      className="p-2.5 rounded-lg border border-zinc-800/80 bg-[#0d0e11] hover:border-zinc-700 transition-colors cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />
                          <span className="text-xs font-medium text-zinc-100 truncate">
                            {item.mangaTitle} #{item.chapterNumber}
                          </span>
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                          {item.workTypeCode} • {item.assignedWorkerName || 'Open'}
                        </div>
                      </div>
                      <span className={`text-[10px] font-mono tabular-nums shrink-0 inline-flex items-center gap-1 ${styles.text}`}>
                        <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />
                        {formatDeadlineCountdown(item.deadline, item.status, activeTimeZone)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DEADLINE INSPECTOR & RESCHEDULE MODAL */}
      {activeItem && (
        <Modal
          isOpen={!!activeItem}
          onClose={() => setActiveItem(null)}
          title={activeItem.title}
          description={`${activeItem.workTypeName} • ${
            activeItem.assignedWorkerName
              ? `Assigned to ${activeItem.assignedWorkerName}`
              : activeItem.kind === 'chapter'
              ? 'Chapter Release Target'
              : 'Open Task Slot'
          }`}
        >
          <div className="space-y-4 text-xs">
            {(() => {
              const displayTs = activeItem.deadline || getEventTimestamp(activeItem);
              const labelTitle = activeItem.deadline
                ? `Local Due Time (${tzShort})`
                : activeItem.eventType === 'completed_work'
                ? `Completed At (${tzShort})`
                : `Submitted At (${tzShort})`;
              return (
                <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-mono uppercase text-zinc-500">{labelTitle}</div>
                    <div className="text-xs font-medium font-mono text-zinc-100 mt-0.5">
                      {displayTs ? formatInUserTimeZone(displayTs, activeTimeZone, 'full') : 'No date'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono uppercase text-zinc-500">Status</div>
                    <div className={`text-xs font-mono mt-0.5 ${getUrgencyStyles(activeItem.urgency).text}`}>
                      {activeItem.deadline
                        ? formatDeadlineCountdown(activeItem.deadline, activeItem.status, activeTimeZone)
                        : activeItem.status}
                    </div>
                  </div>
                </div>
              );
            })()}

            {canEditDeadlines ? (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-zinc-300 font-medium mb-1">
                    <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
                    {activeItem.deadline ? `Reschedule Deadline (${activeTimeZone})` : `Set Deadline (${activeTimeZone})`}
                  </label>
                  <DeadlineDatePicker
                    timeZone={activeTimeZone}
                    showPresets={false}
                    value={editDeadlineValue}
                    onChange={setEditDeadlineValue}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 mr-1">Quick set:</span>
                  {[
                    { label: '+24h', hours: 24 },
                    { label: '+48h', hours: 48 },
                    { label: '+3 days', hours: 72 },
                    { label: '+1 week', hours: 168 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setEditDeadlineValue(getPresetDateTimeLocal(preset.hours, activeTimeZone))}
                      className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                  {activeItem.deadline ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        updateDeadlineMutation.mutate({
                          kind: activeItem.kind,
                          id: activeItem.id,
                          deadline: null,
                        })
                      }
                      disabled={updateDeadlineMutation.isPending}
                      className="gap-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  ) : (
                    <div />
                  )}

                  <div className="flex items-center gap-2">
                    <Link
                      to={
                        activeItem.mangaId && activeItem.chapterId
                          ? `/pipeline/${activeItem.mangaId}/${activeItem.chapterId}`
                          : '/pipeline'
                      }
                    >
                      <Button type="button" variant="outline" size="sm" className="gap-1">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Pipeline
                      </Button>
                    </Link>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      isLoading={updateDeadlineMutation.isPending}
                      onClick={() =>
                        updateDeadlineMutation.mutate({
                          kind: activeItem.kind,
                          id: activeItem.id,
                          deadline: editDeadlineValue || null,
                        })
                      }
                    >
                      Save Deadline
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-end pt-3 border-t border-zinc-800">
                <Link
                  to={
                    activeItem.mangaId && activeItem.chapterId
                      ? `/pipeline/${activeItem.mangaId}/${activeItem.chapterId}`
                      : '/pipeline'
                  }
                >
                  <Button type="button" variant="primary" size="sm" className="gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open in Pipeline
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ASSIGN / SCHEDULE DEADLINE MODAL */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Schedule Deadline"
        description={`Set in your timezone (${activeTimeZone} • ${tzShort}). Team members see it converted to theirs.`}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!scheduleDateValue) return;
            if (scheduleKind === 'chapter') {
              if (!scheduleTargetId) return;
              updateDeadlineMutation.mutate({
                kind: 'chapter',
                id: scheduleTargetId,
                deadline: scheduleDateValue,
              });
            } else {
              if (scheduleTargetIds.length === 0) return;
              batchUpdateDeadlinesMutation.mutate({
                kind: 'assignment',
                ids: scheduleTargetIds,
                deadline: scheduleDateValue,
              });
            }
          }}
          className="space-y-3.5 text-xs"
        >
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'assignment', label: 'Task Roles' },
                { key: 'chapter', label: 'Chapter Target' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setScheduleKind(opt.key);
                  setScheduleTargetId('');
                  setScheduleTargetIds([]);
                }}
                className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors ${
                  scheduleKind === opt.key
                    ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Manga Series</label>
            <select
              value={scheduleMangaId}
              onChange={(e) => {
                setScheduleMangaId(e.target.value);
                setScheduleChapterId('');
                setScheduleTargetId('');
                setScheduleTargetIds([]);
              }}
              className="w-full h-9 bg-[#121317] border border-zinc-800 rounded-lg px-2.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
              required
            >
              <option value="">Select series...</option>
              {mangaList.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {scheduleKind === 'chapter' ? (
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Chapter</label>
              <select
                value={scheduleTargetId}
                onChange={(e) => setScheduleTargetId(e.target.value)}
                className="w-full h-9 bg-[#121317] border border-zinc-800 rounded-lg px-2.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
                required
              >
                <option value="">Select chapter...</option>
                {scheduleChapters.map((ch: any) => (
                  <option key={ch.id || ch._id} value={ch.id || ch._id}>
                    Ch. {ch.chapterNumber} {ch.title ? `— ${ch.title}` : ''} ({ch.status})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            (() => {
              const activeAssignments = scheduleAssignments.filter((a: any) => a.status !== 'COMPLETED');
              const chapterFilteredAssignments = scheduleChapterId
                ? activeAssignments.filter(
                    (a: any) => String(a.chapterId || a.chapter?.id || a.chapter?._id) === scheduleChapterId
                  )
                : activeAssignments;
              const selectableIds = chapterFilteredAssignments.map((a: any) => a.id);
              const allChecked =
                selectableIds.length > 0 && selectableIds.every((id: string) => scheduleTargetIds.includes(id));

              return (
                <div className="space-y-3">
                  <div>
                    <label className="block text-zinc-300 font-medium mb-1">Filter by Chapter</label>
                    <select
                      value={scheduleChapterId}
                      onChange={(e) => {
                        setScheduleChapterId(e.target.value);
                        setScheduleTargetIds([]);
                      }}
                      className="w-full h-9 bg-[#121317] border border-zinc-800 rounded-lg px-2.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
                    >
                      <option value="">All active chapters</option>
                      {scheduleChapters.map((ch: any) => (
                        <option key={ch.id || ch._id} value={ch.id || ch._id}>
                          Ch. {ch.chapterNumber} {ch.title ? `— ${ch.title}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-zinc-300 font-medium">
                        Select Roles / Task Slots ({scheduleTargetIds.length})
                      </label>
                      {selectableIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setScheduleTargetIds(allChecked ? [] : selectableIds)}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            allChecked
                              ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                              : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                          }`}
                        >
                          {allChecked ? 'Clear All' : `All Roles (${selectableIds.length})`}
                        </button>
                      )}
                    </div>

                    {chapterFilteredAssignments.length === 0 ? (
                      <div className="p-3 rounded-lg border border-dashed border-zinc-800 text-center text-[11px] text-zinc-500">
                        No active task slots found for this selection.
                      </div>
                    ) : (
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70 p-1.5 space-y-1">
                        {chapterFilteredAssignments.map((a: any) => {
                          const checked = scheduleTargetIds.includes(a.id);
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() =>
                                setScheduleTargetIds((prev) =>
                                  prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                                )
                              }
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                                checked
                                  ? 'border-zinc-600 bg-zinc-800/90 text-zinc-100'
                                  : 'border-zinc-800/80 bg-[#111215] text-zinc-300 hover:border-zinc-700'
                              }`}
                            >
                              <span className="truncate">
                                <span className="font-mono text-zinc-400">
                                  Ch. {a.chapterNumber || a.chapter?.chapterNumber || '?'}
                                </span>{' '}
                                — <span className="font-medium">{a.workTypeName || a.workType?.name}</span>{' '}
                                <span className="text-[10px] text-zinc-500">
                                  ({a.assignedWorkerName || 'Open'})
                                </span>
                              </span>
                              {checked && <Check className="h-3.5 w-3.5 text-zinc-100 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          <div>
            <label className="flex items-center gap-1.5 text-zinc-300 font-medium mb-1">
              <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
              Due Date & Time ({tzShort})
            </label>
            <DeadlineDatePicker
              timeZone={activeTimeZone}
              showPresets={false}
              value={scheduleDateValue}
              onChange={setScheduleDateValue}
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                { label: '+24h', hours: 24 },
                { label: '+48h', hours: 48 },
                { label: '+3 days', hours: 72 },
                { label: '+1 week', hours: 168 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setScheduleDateValue(getPresetDateTimeLocal(preset.hours, activeTimeZone))}
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={updateDeadlineMutation.isPending || batchUpdateDeadlinesMutation.isPending}
              disabled={
                !scheduleDateValue ||
                (scheduleKind === 'chapter' ? !scheduleTargetId : scheduleTargetIds.length === 0)
              }
            >
              {scheduleKind === 'assignment' && scheduleTargetIds.length > 1
                ? `Save ${scheduleTargetIds.length} Deadlines`
                : 'Save Schedule'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
