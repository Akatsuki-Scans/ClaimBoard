import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  SearchIcon,
  CheckIcon,
  MangaIcon,
  FilterIcon,
  CalendarIcon,
} from '../../components/ui/icon';
import {
  Lock,
  List as ListIcon,
  LayoutGrid,
  Layers,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  formatDeadlineCountdown,
  formatInUserTimeZone,
  getBrowserTimeZone,
  getDeadlineUrgency,
  getUrgencyStyles,
} from '../../lib/deadlines';

type ViewMode = 'list' | 'series' | 'grid';
type StatusFilter = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'BLOCKED';

export function OpenWorkPage() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManga, setSelectedManga] = useState('All');
  const [selectedWorkType, setSelectedWorkType] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Claim modal state
  const [claimingAssignment, setClaimingAssignment] = useState<any | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Queries from API
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', 'all'],
    queryFn: () => apiRequest<any[]>('/assignments').catch(() => []),
  });

  const { data: mangas } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga').catch(() => []),
  });

  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types').catch(() => []),
  });

  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  // Robust field extractors ensuring title, chapter, work type and covers are always visible
  const getMangaTitle = (task: any): string => {
    if (!task) return 'Unknown series';
    if (task.manga?.title) return task.manga.title;
    if (task.mangaTitle) return task.mangaTitle;
    if (typeof task.mangaId === 'object' && task.mangaId?.title) return task.mangaId.title;
    const mId = typeof task.mangaId === 'object' ? (task.mangaId?._id || task.mangaId?.id) : task.mangaId;
    if (mId && mangas) {
      const found = mangas.find((m: any) => String(m.id || m._id) === String(mId));
      if (found?.title) return found.title;
    }
    return 'Unknown series';
  };

  const getMangaCover = (task: any): string => {
    if (task.manga?.coverUrl) return task.manga.coverUrl;
    if (task.coverUrl) return task.coverUrl;
    if (typeof task.mangaId === 'object' && task.mangaId?.coverUrl) return task.mangaId.coverUrl;
    const mId = typeof task.mangaId === 'object' ? (task.mangaId?._id || task.mangaId?.id) : task.mangaId;
    if (mId && mangas) {
      const found = mangas.find((m: any) => String(m.id || m._id) === String(mId));
      if (found?.coverUrl) return found.coverUrl;
    }
    return '/akatsuki.jpg';
  };

  const getMangaId = (task: any): string => {
    if (typeof task.mangaId === 'object') return String(task.mangaId?._id || task.mangaId?.id || '');
    return String(task.mangaId || task.manga?.id || '');
  };

  const getChapterNumber = (task: any): string | number => {
    if (!task) return '—';
    if (task.chapter?.chapterNumber !== undefined) return task.chapter.chapterNumber;
    if (task.chapterNumber !== undefined) return task.chapterNumber;
    if (typeof task.chapterId === 'object' && task.chapterId?.chapterNumber !== undefined) {
      return task.chapterId.chapterNumber;
    }
    return '1';
  };

  const getWorkTypeName = (task: any): string => {
    if (!task) return 'Task';
    if (task.workType?.name) return task.workType.name;
    if (task.workTypeName) return task.workTypeName;
    if (typeof task.workTypeId === 'object' && task.workTypeId?.name) return task.workTypeId.name;
    const found = workTypes?.find((w: any) => String(w.id || w._id) === String(task.workTypeId));
    if (found?.name) return found.name;
    return 'Task';
  };

  const getWorkTypeColor = (task: any): string => {
    if (task.workType?.color) return task.workType.color;
    if (typeof task.workTypeId === 'object' && task.workTypeId?.color) return task.workTypeId.color;
    const found = workTypes?.find((w: any) => String(w.id || w._id) === String(task.workTypeId));
    return found?.color || '#818cf8';
  };

  // Claim Mutation
  const claimMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      setClaimError(null);
      return apiRequest('/claims', {
        method: 'POST',
        body: JSON.stringify({ assignmentId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      setClaimingAssignment(null);
    },
    onError: (err: ApiError) => {
      setClaimError(err.message || 'Failed to claim work.');
    },
  });

  const handleOpenClaimModal = (assignment: any) => {
    setClaimError(null);
    setClaimingAssignment(assignment);
  };

  // Filter tasks based on search & filters and ensure unique (chapterId, workTypeId) slots
  const allDeduplicatedTasks = (() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const task of assignments || []) {
      const rawMangaId = typeof task.mangaId === 'object' ? (task.mangaId?._id || task.mangaId?.id) : task.mangaId;
      const rawChapterId = typeof task.chapterId === 'object' ? (task.chapterId?._id || task.chapterId?.id) : task.chapterId;
      const rawWorkTypeId = typeof task.workTypeId === 'object' ? (task.workTypeId?._id || task.workTypeId?.id) : task.workTypeId;

      const slotKey = rawChapterId && rawWorkTypeId ? `${rawChapterId}:${rawWorkTypeId}` : task.id;
      if (seen.has(slotKey)) continue;
      seen.add(slotKey);

      if (selectedManga !== 'All' && String(rawMangaId) !== String(selectedManga)) continue;
      if (selectedWorkType !== 'All' && String(rawWorkTypeId) !== String(selectedWorkType)) continue;
      if (selectedPriority !== 'All' && task.priority !== selectedPriority) continue;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const title = getMangaTitle(task).toLowerCase();
        const ch = String(getChapterNumber(task));
        const wt = getWorkTypeName(task).toLowerCase();
        if (!title.includes(q) && !ch.includes(q) && !wt.includes(q)) continue;
      }
      out.push(task);
    }
    return out;
  })();

  // Filter groups
  const openTasks = allDeduplicatedTasks.filter((t) => t.status === 'OPEN' && !t.isBlocked);
  const claimedTasks = allDeduplicatedTasks.filter((t) => !t.isBlocked && (t.status === 'CLAIMED' || t.status === 'ACTIVE'));
  const inProgressTasks = allDeduplicatedTasks.filter((t) => !t.isBlocked && (t.status === 'IN_PROGRESS' || t.status === 'SUBMITTED'));
  const blockedTasks = allDeduplicatedTasks.filter((t) => t.isBlocked);
  const dueSoonTasks = allDeduplicatedTasks.filter((t) => {
    const urgency = getDeadlineUrgency(t.deadline, t.status);
    return urgency === 'overdue' || urgency === 'due_soon';
  });

  // Active tasks for current tab filter
  const displayedTasks = (() => {
    switch (statusFilter) {
      case 'OPEN':
        return openTasks;
      case 'IN_PROGRESS':
        return [...claimedTasks, ...inProgressTasks];
      case 'BLOCKED':
        return blockedTasks;
      case 'ALL':
      default:
        return allDeduplicatedTasks;
    }
  })();

  const statusOptions: Array<{
    id: StatusFilter;
    label: string;
    count: number;
    dotColor: string;
  }> = [
    {
      id: 'OPEN',
      label: 'Ready to Claim',
      count: openTasks.length,
      dotColor: 'bg-emerald-400',
    },
    {
      id: 'IN_PROGRESS',
      label: 'In Production',
      count: claimedTasks.length + inProgressTasks.length,
      dotColor: 'bg-indigo-400',
    },
    {
      id: 'BLOCKED',
      label: 'Dependencies Blocked',
      count: blockedTasks.length,
      dotColor: 'bg-amber-400',
    },
    {
      id: 'ALL',
      label: 'All Work Slots',
      count: allDeduplicatedTasks.length,
      dotColor: 'bg-zinc-400',
    },
  ];

  const currentStatusOption = statusOptions.find((opt) => opt.id === statusFilter) || statusOptions[0];

  // Group tasks by manga series for the 'series' view mode
  const tasksByManga = (() => {
    const map = new Map<string, { mangaTitle: string; coverUrl: string; mangaId: string; tasks: any[] }>();
    for (const t of displayedTasks) {
      const mId = getMangaId(t) || 'unknown';
      if (!map.has(mId)) {
        map.set(mId, {
          mangaId: mId,
          mangaTitle: getMangaTitle(t),
          coverUrl: getMangaCover(t),
          tasks: [],
        });
      }
      map.get(mId)!.tasks.push(t);
    }
    return Array.from(map.values());
  })();

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-zinc-100 select-none pb-12">
      {/* Header & Metrics Deck */}
      <div className="space-y-4 border-b border-zinc-800 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-zinc-100 tracking-tight font-sans">
                Open Production Board
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-zinc-800 border border-zinc-700/80 text-zinc-300">
                {openTasks.length} available
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Live scanlation command deck • Browse, claim, and monitor chapters in production
            </p>
          </div>

          {/* Quick View Mode Switcher */}
          <div className="flex items-center rounded-lg border border-zinc-800 bg-[#111215] p-0.5 relative shrink-0">
            <button
              onClick={() => setViewMode('list')}
              className={`relative z-10 px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === 'list' ? 'text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Horizontal Queue Table"
            >
              {viewMode === 'list' && (
                <motion.div
                  layoutId="openWorkViewPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/80 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <ListIcon className="h-3.5 w-3.5" />
              <span className="text-[11px]">Deck Queue</span>
            </button>

            <button
              onClick={() => setViewMode('series')}
              className={`relative z-10 px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === 'series' ? 'text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Series Production Lanes"
            >
              {viewMode === 'series' && (
                <motion.div
                  layoutId="openWorkViewPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/80 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <Layers className="h-3.5 w-3.5" />
              <span className="text-[11px]">Series Lanes</span>
            </button>

            <button
              onClick={() => setViewMode('grid')}
              className={`relative z-10 px-3 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid' ? 'text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Wide Cards Grid"
            >
              {viewMode === 'grid' && (
                <motion.div
                  layoutId="openWorkViewPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/80 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="text-[11px]">Cards</span>
            </button>
          </div>
        </div>

        {/* Telemetry Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div
            onClick={() => setStatusFilter('OPEN')}
            role="button"
            tabIndex={0}
            className={`p-3 rounded-lg border bg-[#111215] flex items-center justify-between cursor-pointer transition-colors ${
              statusFilter === 'OPEN'
                ? 'border-emerald-500/50 bg-emerald-500/[0.04]'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 font-mono">
                Open to Claim
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                {openTasks.length}
              </div>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          </div>

          <div
            onClick={() => setStatusFilter('IN_PROGRESS')}
            role="button"
            tabIndex={0}
            className={`p-3 rounded-lg border bg-[#111215] flex items-center justify-between cursor-pointer transition-colors ${
              statusFilter === 'IN_PROGRESS'
                ? 'border-indigo-500/50 bg-indigo-500/[0.04]'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 font-mono">
                In Production
              </div>
              <div className="text-xl font-bold font-mono text-indigo-400 mt-0.5">
                {claimedTasks.length + inProgressTasks.length}
              </div>
            </div>
            <Clock className="h-4 w-4 text-indigo-400/80" />
          </div>

          <div
            onClick={() => setStatusFilter('BLOCKED')}
            role="button"
            tabIndex={0}
            className={`p-3 rounded-lg border bg-[#111215] flex items-center justify-between cursor-pointer transition-colors ${
              statusFilter === 'BLOCKED'
                ? 'border-amber-500/50 bg-amber-500/[0.04]'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 font-mono">
                Dependencies Blocked
              </div>
              <div className="text-xl font-bold font-mono text-amber-400 mt-0.5">
                {blockedTasks.length}
              </div>
            </div>
            <Lock className="h-4 w-4 text-amber-400/80" />
          </div>

          <div
            onClick={() => setStatusFilter('ALL')}
            role="button"
            tabIndex={0}
            className={`p-3 rounded-lg border bg-[#111215] flex items-center justify-between cursor-pointer transition-colors ${
              statusFilter === 'ALL'
                ? 'border-zinc-700 bg-zinc-800/40'
                : 'border-zinc-800 hover:border-zinc-700'
            }`}
          >
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 font-mono">
                All Work Slots
              </div>
              <div className="text-xl font-bold font-mono text-zinc-200 mt-0.5">
                {allDeduplicatedTasks.length}
              </div>
            </div>
            <MangaIcon className="h-4 w-4 text-zinc-400" />
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Status Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111215] p-3 rounded-xl border border-zinc-800">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Dropdown */}
          <div className="relative" ref={statusDropdownRef}>
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors flex items-center gap-2 border bg-zinc-900/90 shadow-sm ${
                statusFilter === 'OPEN'
                  ? 'border-emerald-500/40 text-emerald-300 hover:border-emerald-500/60'
                  : statusFilter === 'IN_PROGRESS'
                  ? 'border-indigo-500/40 text-indigo-300 hover:border-indigo-500/60'
                  : statusFilter === 'BLOCKED'
                  ? 'border-amber-500/40 text-amber-300 hover:border-amber-500/60'
                  : 'border-zinc-700/80 text-zinc-200 hover:border-zinc-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${currentStatusOption.dotColor}`} />
              <span className="font-semibold">{currentStatusOption.label}</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300 ml-0.5">
                {currentStatusOption.count}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-zinc-400 transition-transform duration-150 ml-1 ${
                  isStatusDropdownOpen ? 'rotate-180 text-zinc-200' : ''
                }`}
              />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-60 bg-[#16171b] border border-zinc-700/80 rounded-lg shadow-2xl py-1 z-30 divide-y divide-zinc-800/80 backdrop-blur-md">
                <div className="py-1">
                  {statusOptions.map((opt) => {
                    const isSelected = opt.id === statusFilter;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt.id);
                          setIsStatusDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-zinc-800 text-zinc-100 font-medium'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${opt.dotColor}`} />
                          <span>{opt.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                            {opt.count}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-zinc-200 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Search input */}
          <div className="relative min-w-[190px] flex-1 sm:flex-none">
            <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search series, ch, role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 w-full rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>

        {/* Filter Dropdowns & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={selectedManga}
              onChange={(e) => setSelectedManga(e.target.value)}
              className="h-8 pl-2.5 pr-7 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 appearance-none cursor-pointer"
            >
              <option value="All">All series</option>
              {mangas?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedWorkType}
              onChange={(e) => setSelectedWorkType(e.target.value)}
              className="h-8 pl-2.5 pr-7 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 appearance-none cursor-pointer"
            >
              <option value="All">All work types</option>
              {workTypes?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <ChevronDown className="h-3 w-3 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="h-8 pl-2.5 pr-7 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 appearance-none cursor-pointer"
            >
              <option value="All">All priorities</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Normal">Normal</option>
              <option value="Low">Low</option>
            </select>
            <ChevronDown className="h-3 w-3 text-zinc-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {(searchQuery || selectedManga !== 'All' || selectedWorkType !== 'All' || selectedPriority !== 'All' || statusFilter !== 'OPEN') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedManga('All');
                setSelectedWorkType('All');
                setSelectedPriority('All');
                setStatusFilter('OPEN');
              }}
              className="h-8 px-2.5 rounded-lg border border-dashed border-zinc-700 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      {isLoading ? (
        <div className="p-16 text-center text-xs text-zinc-500 font-mono">Loading production board...</div>
      ) : displayedTasks.length === 0 ? (
        <div className="p-16 rounded-xl border border-dashed border-zinc-800 text-center space-y-2 bg-[#111215]/50">
          <div className="text-zinc-300 text-sm font-semibold">No work slots match your criteria</div>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            Try adjusting your search query, series filter, or status tab above to see other open tasks.
          </p>
        </div>
      ) : viewMode === 'list' ? (
        /* HORIZONTAL QUEUE TABLE (Primary Unslop Mode) */
        <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden shadow-xl">
          <div className="divide-y divide-zinc-800/80">
            {displayedTasks.map((task) => {
              const urgency = getDeadlineUrgency(task.deadline, task.status);
              const styles = getUrgencyStyles(urgency);
              const wtColor = getWorkTypeColor(task);
              const isClaimable = task.status === 'OPEN' && !task.isBlocked;

              return (
                <div
                  key={task.id}
                  className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-zinc-800/25 transition-colors group"
                >
                  {/* Left: Manga Cover + Series & Chapter */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <img
                      src={getMangaCover(task)}
                      alt={getMangaTitle(task)}
                      className="h-14 w-10 sm:h-16 sm:w-11 rounded-md object-cover border border-zinc-800 shrink-0 shadow-md group-hover:border-zinc-700 transition-colors"
                    />

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/manga/${getMangaId(task)}`}
                          className="font-bold text-sm text-zinc-100 hover:text-indigo-400 transition-colors truncate"
                        >
                          {getMangaTitle(task)}
                        </Link>
                        <span className="font-mono text-xs text-zinc-300 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 font-semibold shrink-0">
                          Ch. {getChapterNumber(task)}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-mono font-medium border shrink-0 flex items-center gap-1.5"
                          style={{
                            backgroundColor: `${wtColor}15`,
                            borderColor: `${wtColor}35`,
                            color: wtColor,
                          }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: wtColor }} />
                          {getWorkTypeName(task)}
                        </span>
                        <Badge
                          variant={
                            task.priority === 'Urgent'
                              ? 'danger'
                              : task.priority === 'High'
                              ? 'warning'
                              : 'outline'
                          }
                          className="text-[10px]"
                        >
                          {task.priority || 'Normal'}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-zinc-400 flex-wrap">
                        {task.isBlocked ? (
                          <span className="text-[11px] text-amber-400 font-mono flex items-center gap-1.5">
                            <Lock className="h-3 w-3 shrink-0" />
                            {task.blockedReason || 'Waiting on preceding production step'}
                          </span>
                        ) : task.assignedWorkerName ? (
                          <span className="text-zinc-400 flex items-center gap-1.5">
                            Worker: <strong className="text-zinc-200">{task.assignedWorkerName}</strong>
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-medium flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Open for claim
                          </span>
                        )}

                        <span className="text-zinc-600">•</span>
                        <span className="font-mono text-[11px] text-zinc-500 uppercase">
                          Status: <strong className="text-zinc-300 font-medium">{task.status}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Deadline & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
                    {task.deadline ? (
                      <div className="flex flex-col items-start sm:items-end gap-1">
                        <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-200">
                          <CalendarIcon className="h-3 w-3 text-zinc-400 shrink-0" />
                          <span>{formatInUserTimeZone(task.deadline, activeTimeZone, 'shortDateTime')}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono tabular-nums flex items-center gap-1.5 ${styles.badge}`}
                          title={formatInUserTimeZone(task.deadline, activeTimeZone, 'full')}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                          {formatDeadlineCountdown(task.deadline, task.status, activeTimeZone)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3 opacity-60" />
                        No deadline
                      </span>
                    )}

                    {isClaimable ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenClaimModal(task)}
                        className="h-8 px-4 text-xs font-medium gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Claim Task
                      </Button>
                    ) : task.isBlocked ? (
                      <Button size="sm" variant="secondary" disabled className="h-8 text-xs opacity-60 gap-1.5">
                        <Lock className="h-3 w-3" />
                        Blocked
                      </Button>
                    ) : (
                      <span className="text-xs font-mono text-zinc-500 px-3 py-1 rounded bg-zinc-900 border border-zinc-800">
                        {task.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : viewMode === 'series' ? (
        /* SERIES PRODUCTION LANES (Grouped Horizontal Flow) */
        <div className="space-y-4">
          {tasksByManga.map((group) => (
            <div
              key={group.mangaId}
              className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4 shadow-lg hover:border-zinc-700/80 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={group.coverUrl}
                    alt={group.mangaTitle}
                    className="h-12 w-9 rounded-md object-cover border border-zinc-800 shrink-0 shadow"
                  />
                  <div>
                    <Link
                      to={`/manga/${group.mangaId}`}
                      className="font-bold text-base text-zinc-100 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
                    >
                      {group.mangaTitle}
                      <ExternalLink className="h-3.5 w-3.5 text-zinc-500" />
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {group.tasks.length} active production {group.tasks.length === 1 ? 'slot' : 'slots'}
                    </span>
                  </div>
                </div>

                <Link to={`/pipeline?mangaId=${group.mangaId}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                    Pipeline view
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {/* Horizontal Task Stage Chips */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {group.tasks.map((task) => {
                  const wtColor = getWorkTypeColor(task);
                  const isClaimable = task.status === 'OPEN' && !task.isBlocked;
                  const urgency = getDeadlineUrgency(task.deadline, task.status);
                  const styles = getUrgencyStyles(urgency);

                  return (
                    <div
                      key={task.id}
                      className="p-3 rounded-lg border border-zinc-800/90 bg-zinc-950/60 flex items-center justify-between gap-3 hover:border-zinc-700/60 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-200">
                            Ch. {getChapterNumber(task)}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border"
                            style={{
                              backgroundColor: `${wtColor}15`,
                              borderColor: `${wtColor}35`,
                              color: wtColor,
                            }}
                          >
                            {getWorkTypeName(task)}
                          </span>
                        </div>

                        <div className="text-[11px] text-zinc-400 font-mono truncate">
                          {task.isBlocked ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Blocked
                            </span>
                          ) : task.assignedWorkerName ? (
                            <span>Worker: {task.assignedWorkerName}</span>
                          ) : (
                            <span className="text-emerald-400">Ready to claim</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {task.deadline && (
                          <span
                            className={`text-[10px] font-mono tabular-nums ${styles.text}`}
                            title={formatInUserTimeZone(task.deadline, activeTimeZone, 'full')}
                          >
                            {formatDeadlineCountdown(task.deadline, task.status, activeTimeZone)}
                          </span>
                        )}

                        {isClaimable ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenClaimModal(task)}
                            className="h-7 text-xs px-2.5"
                          >
                            Claim
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* WIDE RESPONSIVE CARDS GRID (Breathable 2-Column Grid) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayedTasks.map((task) => {
            const urgency = getDeadlineUrgency(task.deadline, task.status);
            const styles = getUrgencyStyles(urgency);
            const wtColor = getWorkTypeColor(task);
            const isClaimable = task.status === 'OPEN' && !task.isBlocked;

            return (
              <div
                key={task.id}
                className="p-4 rounded-xl border border-zinc-800 bg-[#111215] flex gap-4 hover:border-zinc-700/80 transition-colors shadow-md"
              >
                <img
                  src={getMangaCover(task)}
                  alt={getMangaTitle(task)}
                  className="h-24 w-16 rounded-lg object-cover border border-zinc-800 shrink-0 shadow"
                />

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/manga/${getMangaId(task)}`}
                        className="font-bold text-sm text-zinc-100 hover:text-indigo-400 transition-colors truncate"
                      >
                        {getMangaTitle(task)}
                      </Link>
                      <Badge
                        variant={
                          task.priority === 'Urgent'
                            ? 'danger'
                            : task.priority === 'High'
                            ? 'warning'
                            : 'outline'
                        }
                        className="text-[10px] shrink-0"
                      >
                        {task.priority || 'Normal'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-mono text-zinc-300 font-semibold px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                        Ch. {getChapterNumber(task)}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[11px] font-mono font-medium border"
                        style={{
                          backgroundColor: `${wtColor}15`,
                          borderColor: `${wtColor}35`,
                          color: wtColor,
                        }}
                      >
                        {getWorkTypeName(task)}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400">
                      {task.isBlocked ? (
                        <span className="text-amber-400 text-[11px] font-mono flex items-center gap-1">
                          <Lock className="h-3 w-3" /> {task.blockedReason || 'Blocked by dependencies'}
                        </span>
                      ) : task.assignedWorkerName ? (
                        <span>Assigned to: <strong className="text-zinc-200">{task.assignedWorkerName}</strong></span>
                      ) : (
                        <span className="text-emerald-400 font-medium">Available for claiming</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-zinc-800/80 mt-2">
                    {task.deadline ? (
                      <span
                        className={`text-[10px] font-mono tabular-nums flex items-center gap-1 ${styles.text}`}
                        title={formatInUserTimeZone(task.deadline, activeTimeZone, 'full')}
                      >
                        <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />
                        {formatDeadlineCountdown(task.deadline, task.status, activeTimeZone)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">No deadline</span>
                    )}

                    {isClaimable ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenClaimModal(task)}
                        className="h-7 text-xs px-3"
                      >
                        Claim Slot
                      </Button>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-500">{task.status}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Claim Confirmation Modal */}
      {claimingAssignment && (
        <Modal
          isOpen={true}
          onClose={() => setClaimingAssignment(null)}
          title="Confirm Task Claim"
          description="You are about to assign this production slot to yourself."
        >
          <div className="space-y-4 text-xs">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Series:</span>
                <span className="font-bold text-zinc-100">
                  {getMangaTitle(claimingAssignment)}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-zinc-400">Chapter:</span>
                <span className="text-zinc-200 font-semibold">
                  Ch. {getChapterNumber(claimingAssignment)}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-zinc-400">Work Stage:</span>
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-semibold border"
                  style={{
                    backgroundColor: `${getWorkTypeColor(claimingAssignment)}20`,
                    borderColor: `${getWorkTypeColor(claimingAssignment)}40`,
                    color: getWorkTypeColor(claimingAssignment),
                  }}
                >
                  {getWorkTypeName(claimingAssignment)}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-zinc-400">Priority:</span>
                <span className="text-zinc-200">{claimingAssignment.priority || 'Normal'}</span>
              </div>
              {claimingAssignment.deadline && (
                <div className="flex items-center justify-between font-mono">
                  <span className="text-zinc-400">Deadline:</span>
                  <span className="text-zinc-200">
                    {formatInUserTimeZone(claimingAssignment.deadline, activeTimeZone, 'shortDateTime')}
                  </span>
                </div>
              )}
            </div>

            {claimError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {claimError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button variant="secondary" size="sm" onClick={() => setClaimingAssignment(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (claimingAssignment) {
                    claimMutation.mutate(claimingAssignment.id);
                  }
                }}
                isLoading={claimMutation.isPending}
              >
                Confirm Claim
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
