import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  MangaIcon,
  OpenWorkIcon,
  MyClaimsIcon,
  PipelineIcon,
  ArrowRightIcon,
  CheckIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ActivityIcon,
  TeamIcon,
  MoreHorizontalIcon,
  CalendarIcon,
} from '../../components/ui/icon';
import { Briefcase } from 'lucide-react';
import { UserAvatar, MangaCover } from '../../components/ui/Avatar';
import {
  formatDeadlineCountdown,
  formatInUserTimeZone,
  getBrowserTimeZone,
  getDeadlineUrgency,
  getUrgencyStyles,
} from '../../lib/deadlines';

function formatTimeAgo(dateString?: string | Date): string {
  if (!dateString) return 'Just now';
  const now = new Date();
  const date = new Date(dateString);
  const diffInSecs = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffInSecs < 60) return `${diffInSecs || 1}s ago`;
  const diffInMins = Math.floor(diffInSecs / 60);
  if (diffInMins < 60) return `${diffInMins}m ago`;
  const diffInHours = Math.floor(diffInMins / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  return `${diffInDays}d ago`;
}

function ActivityAvatar({ src, name }: { src?: string; name?: string }) {
  return <UserAvatar src={src} name={name} size="sm" />;
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  const [openWorkFilter, setOpenWorkFilter] = useState<'All' | 'High' | 'Normal' | 'Low'>('All');
  const [claimsFilter, setClaimsFilter] = useState<'Active' | 'Due Soon' | 'Overdue' | 'Completed'>('Active');
  const [teamPeriod, setTeamPeriod] = useState<'Today' | 'Week' | 'Month'>('Today');

  // Submit / Edit Submission Modal State
  const [submittingClaim, setSubmittingClaim] = useState<any | null>(null);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableLabel, setDeliverableLabel] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');

  // 1. Live Overview Analytics
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<any>('/analytics/overview').catch(() => null),
  });

  // 2. Live Open Work
  const { data: liveOpenTasks = [], isLoading: openTasksLoading } = useQuery({
    queryKey: ['assignments', 'open'],
    queryFn: () => apiRequest<any[]>('/assignments/open?status=OPEN').catch(() => []),
  });

  // 3. Live Production Pipeline
  const { data: livePipelineData = [], isLoading: pipelineLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => apiRequest<any[]>('/pipeline').catch(() => []),
  });

  // 4. Live My Claims
  const { data: liveClaims = [], isLoading: claimsLoading } = useQuery({
    queryKey: ['claims', 'my'],
    queryFn: () => apiRequest<any[]>('/claims/my').catch(() => []),
  });

  // 5. Live Recent Activity
  const { data: liveActivityFeed = [], isLoading: activityLoading } = useQuery({
    queryKey: ['audit', 'activity'],
    queryFn: () => apiRequest<any[]>('/audit/activity?limit=6').catch(() => []),
  });

  // 6. Live Team Workload
  const { data: liveTeamMembers = [], isLoading: teamLoading } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload').catch(() => []),
  });

  // Live Claim Mutation
  const claimMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      return apiRequest('/claims', {
        method: 'POST',
        body: JSON.stringify({ assignmentId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });

  // Submit / Edit Deliverable Mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/deliverables/submit', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: submittingClaim?.assignmentId || submittingClaim?.id,
          deliverableUrl,
          label: deliverableLabel,
          notes: deliverableNotes,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setSubmittingClaim(null);
      setDeliverableUrl('');
      setDeliverableLabel('');
      setDeliverableNotes('');
    },
  });

  // Open Tasks Filtering & Counts
  const filteredOpenTasks = (liveOpenTasks || []).filter((task: any) => {
    if (openWorkFilter === 'All') return true;
    return (task.priority || '').toLowerCase() === openWorkFilter.toLowerCase();
  });

  const openWorkCounts = {
    all: liveOpenTasks.length,
    high: liveOpenTasks.filter((t: any) => (t.priority || '').toLowerCase() === 'high').length,
    normal: liveOpenTasks.filter((t: any) => (t.priority || '').toLowerCase() === 'normal').length,
    low: liveOpenTasks.filter((t: any) => (t.priority || '').toLowerCase() === 'low').length,
  };

  // Pipeline
  const activePipelineChapter = livePipelineData && livePipelineData.length > 0 ? livePipelineData[0] : null;
  const pipelineChapterTitle = activePipelineChapter
    ? `${activePipelineChapter.mangaTitle} • Ch. ${activePipelineChapter.chapterNumber}`
    : 'No active release';
  const pipelineStages = activePipelineChapter?.stages || [];
  const completedStagesCount = pipelineStages.filter((s: any) => s.status === 'COMPLETED').length;
  const totalStagesCount = pipelineStages.length;
  const pipelineProgress = totalStagesCount > 0 ? Math.round((completedStagesCount / totalStagesCount) * 100) : 0;

  // My Claims Filtering & Counts
  const filteredClaims = (liveClaims || []).filter((claim: any) => {
    const status = claim.status || 'ACTIVE';
    if (claimsFilter === 'Active') {
      return status === 'ACTIVE' || status === 'IN_PROGRESS' || status === 'CLAIMED' || status === 'CHANGES_REQUESTED';
    }
    if (claimsFilter === 'Due Soon') {
      return getDeadlineUrgency(claim.deadline, claim.status) === 'due_soon';
    }
    if (claimsFilter === 'Overdue') {
      return claim.isOverdue || getDeadlineUrgency(claim.deadline, claim.status) === 'overdue';
    }
    if (claimsFilter === 'Completed') {
      return status === 'COMPLETED';
    }
    return true;
  });

  const claimsCounts = {
    active: liveClaims.filter((c: any) => ['ACTIVE', 'IN_PROGRESS', 'CLAIMED', 'CHANGES_REQUESTED'].includes(c.status)).length,
    dueSoon: liveClaims.filter((c: any) => getDeadlineUrgency(c.deadline, c.status) === 'due_soon').length,
    overdue: liveClaims.filter((c: any) => c.isOverdue || getDeadlineUrgency(c.deadline, c.status) === 'overdue').length,
    completed: liveClaims.filter((c: any) => c.status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* 1. Contextual Header: Calm, deliberate, specific */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Production Overview
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Scanlation workflow dispatcher and chapter release tracker
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/open-work">
            <Button variant="secondary" size="sm">
              <OpenWorkIcon className="h-3.5 w-3.5" />
              <span>Browse Open Work</span>
            </Button>
          </Link>
          <Link to="/pipeline">
            <Button variant="primary" size="sm">
              <PipelineIcon className="h-3.5 w-3.5" />
              <span>Release Pipeline</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* 2. Stat Cards Row: Clean numbers with tabular figures and clear comparative context */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Manga */}
        <motion.div
          whileHover={{ y: -3, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total Series</span>
            <MangaIcon className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold font-mono tabular-nums text-zinc-100">
              {analyticsLoading ? '—' : analytics?.totalMangaCount ?? 0}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">
              {analytics?.activeMangaCount ?? 0} active in production
            </div>
          </div>
        </motion.div>

        {/* Active Tasks */}
        <motion.div
          whileHover={{ y: -3, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Open Slots</span>
            <OpenWorkIcon className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold font-mono tabular-nums text-zinc-100">
              {analyticsLoading ? '—' : analytics?.openAssignmentsCount ?? liveOpenTasks.length}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">
              {analytics?.activeClaimsCount ?? 0} currently claimed
            </div>
          </div>
        </motion.div>

        {/* Overdue */}
        <motion.div
          whileHover={{ y: -3, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Overdue Deliverables</span>
            <AlertTriangleIcon className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold font-mono tabular-nums text-zinc-100">
              {analyticsLoading ? '—' : analytics?.overdueTasksCount ?? 0}
            </div>
            <div className="text-[11px] mt-1 font-mono">
              {(analytics?.overdueTasksCount ?? 0) > 0 ? (
                <span className="text-rose-400">Requires attention</span>
              ) : (
                <span className="text-emerald-400">All releases on schedule</span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Completed Today */}
        <motion.div
          whileHover={{ y: -3, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Completed Deliverables</span>
            <CheckCircleIcon className="h-4 w-4 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold font-mono tabular-nums text-zinc-100">
              {analyticsLoading ? '—' : analytics?.completedToday ?? 0}
            </div>
            <div className="text-[11px] text-zinc-400 mt-1 font-mono">
              {analytics?.completedThisWeek ?? 0} completed this week
            </div>
          </div>
        </motion.div>
      </div>

      {/* 3. Main Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Columns (Col 1-8): Open Work & Pipeline */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Open Work (md:col-span-7) */}
            <div className="md:col-span-7 rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between shadow-sm min-h-[380px]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <OpenWorkIcon className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-xs font-semibold text-zinc-100">Open Work</h2>
                  </div>
                  <Link to="/open-work" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                    View all <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 pt-3 pb-2 text-xs">
                  {[
                    { key: 'All', label: 'All', count: openWorkCounts.all },
                    { key: 'High', label: 'High', count: openWorkCounts.high },
                    { key: 'Normal', label: 'Normal', count: openWorkCounts.normal },
                    { key: 'Low', label: 'Low', count: openWorkCounts.low },
                  ].map((tab) => {
                    const isActive = openWorkFilter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setOpenWorkFilter(tab.key as any)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium font-mono tabular-nums transition-colors ${
                          isActive
                            ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                        }`}
                      >
                        {tab.label} {tab.count}
                      </button>
                    );
                  })}
                </div>

                {/* Tasks List */}
                {openTasksLoading ? (
                  <div className="py-12 text-center text-xs text-zinc-500">Loading open tasks...</div>
                ) : filteredOpenTasks.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg my-2">
                    No open tasks available
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/60 mt-1">
                    {filteredOpenTasks.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 group">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MangaCover src={t.manga?.coverUrl} title={t.manga?.title || t.mangaTitle} size="sm" />
                          <div className="truncate">
                            <div className="text-xs font-medium text-zinc-200 truncate">
                              {t.manga?.title || t.mangaTitle || 'Unknown series'}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono">
                              {t.chapter ? `Ch. ${t.chapter.chapterNumber}` : 'General task'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[11px] font-mono text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-800/60 border border-zinc-700/60">
                            {t.workType?.name || 'Task'}
                          </span>

                          <span
                            className={`text-[10px] font-mono tabular-nums flex items-center gap-1 ${
                              t.deadline
                                ? getUrgencyStyles(getDeadlineUrgency(t.deadline, t.status)).text
                                : 'text-zinc-500'
                            }`}
                            title={t.deadline ? formatInUserTimeZone(t.deadline, activeTimeZone, 'full') : undefined}
                          >
                            <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />
                            {formatDeadlineCountdown(t.deadline, t.status, activeTimeZone)}
                          </span>

                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => claimMutation.mutate(t.id)}
                            isLoading={claimMutation.isPending && (claimMutation.variables as string) === t.id}
                          >
                            Claim
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Production Pipeline Overview (md:col-span-5) */}
            <div className="md:col-span-5 rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between shadow-sm min-h-[380px]">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2">
                    <PipelineIcon className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-xs font-semibold text-zinc-100">Active Pipeline</h2>
                  </div>
                  <Link to="/pipeline" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                    Details <ArrowRightIcon className="h-3 w-3" />
                  </Link>
                </div>

                {pipelineLoading ? (
                  <div className="py-12 text-center text-xs text-zinc-500">Loading pipeline...</div>
                ) : !activePipelineChapter ? (
                  <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg mt-4">
                    No active chapters currently in release pipeline
                  </div>
                ) : (
                  <>
                    <div className="mt-3">
                      <Link
                        to={`/pipeline/${activePipelineChapter.mangaId}/${activePipelineChapter.chapterId}`}
                        className="text-xs font-medium text-zinc-200 hover:text-white transition-colors flex items-center gap-1.5"
                      >
                        <span>{pipelineChapterTitle}</span>
                        <ArrowRightIcon className="h-3 w-3 text-zinc-500" />
                      </Link>

                      {/* Progress Bar */}
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
                          <div
                            className="h-full bg-zinc-100 rounded-full transition-all duration-300"
                            style={{ width: `${pipelineProgress}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-mono tabular-nums text-zinc-400">
                          {completedStagesCount}/{totalStagesCount} stages
                        </span>
                      </div>
                    </div>

                    {/* Stage Steps */}
                    <div className="mt-4 space-y-2 max-h-[240px] overflow-y-auto pr-1">
                      {pipelineStages.map((step: any) => {
                        const isDone = step.status === 'COMPLETED';
                        const isActive = step.status === 'IN_PROGRESS' || step.status === 'CLAIMED';
                        const isBlocked = step.isBlocked || step.status === 'BLOCKED';

                        return (
                          <div
                            key={step.assignmentId || step.workTypeName}
                            className="flex items-center justify-between text-xs py-1 border-b border-zinc-850"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {isDone ? (
                                <div className="h-3.5 w-3.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-[9px] shrink-0">
                                  <CheckIcon className="h-2.5 w-2.5 stroke-[3]" />
                                </div>
                              ) : isActive ? (
                                <div className="h-3.5 w-3.5 rounded-full border border-zinc-300 flex items-center justify-center shrink-0">
                                  <div className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                                </div>
                              ) : isBlocked ? (
                                <div className="h-3.5 w-3.5 rounded-full border border-amber-500/60 shrink-0" />
                              ) : (
                                <div className="h-3.5 w-3.5 rounded-full border border-zinc-700 shrink-0" />
                              )}

                              <span className="font-medium text-zinc-200 truncate">
                                {step.workTypeName || step.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-mono ${
                                  isDone
                                    ? 'text-emerald-400'
                                    : isActive
                                    ? 'text-sky-400'
                                    : isBlocked
                                    ? 'text-amber-400'
                                    : 'text-zinc-500'
                                }`}
                              >
                                {step.status || 'Pending'}
                              </span>

                              <span className="text-[10px] font-mono text-zinc-500 w-16 text-right truncate">
                                {step.assignedWorkerName || '—'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Left Card: My Claims */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <MyClaimsIcon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-xs font-semibold text-zinc-100">My Production Claims</h2>
              </div>
              <Link to="/my-claims" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 pt-3 pb-2 text-xs">
              {[
                { key: 'Active', label: 'Active', count: claimsCounts.active },
                { key: 'Due Soon', label: 'Due soon', count: claimsCounts.dueSoon },
                { key: 'Overdue', label: 'Overdue', count: claimsCounts.overdue },
                { key: 'Completed', label: 'Completed', count: claimsCounts.completed },
              ].map((tab) => {
                const isActive = claimsFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setClaimsFilter(tab.key as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium font-mono tabular-nums transition-colors ${
                      isActive
                        ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                    }`}
                  >
                    {tab.label} {tab.count}
                  </button>
                );
              })}
            </div>

            {/* Claims List */}
            {claimsLoading ? (
              <div className="py-12 text-center text-xs text-zinc-500">Loading claims...</div>
            ) : filteredClaims.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg my-2">
                No active claims in this category
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60 mt-1">
                {filteredClaims.map((c: any) => {
                  const isSubmitted =
                    c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW' || c.revisionsCount > 0;

                  return (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <MangaCover src={c.mangaCoverUrl} title={c.mangaTitle} size="sm" />
                        <div className="truncate">
                          <div className="text-xs font-medium text-zinc-200 truncate">
                            {c.mangaTitle || 'Manga'}
                          </div>
                          <div className="text-[10px] text-zinc-400 font-mono">
                            {c.chapterNumber ? `Ch. ${c.chapterNumber}` : 'General'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                          {c.workTypeName || 'Task'}
                        </span>

                        <span
                          className={`text-[10px] font-mono tabular-nums hidden sm:inline-flex items-center gap-1 ${
                            c.deadline
                              ? getUrgencyStyles(getDeadlineUrgency(c.deadline, c.status)).text
                              : 'text-zinc-500'
                          }`}
                          title={c.deadline ? formatInUserTimeZone(c.deadline, activeTimeZone, 'full') : undefined}
                        >
                          {c.deadline && <CalendarIcon className="h-3 w-3 shrink-0 opacity-85" />}
                          {formatDeadlineCountdown(c.deadline, c.status, activeTimeZone)}
                        </span>

                        {c.status === 'COMPLETED' ? (
                          <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                            Completed
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSubmittingClaim(c);
                              setDeliverableUrl(c.lastDeliverableUrl || '');
                              setDeliverableLabel(
                                c.lastDeliverableLabel ||
                                  `${c.workTypeName || 'Task'} - ${c.mangaTitle || 'Chapter'} Submission`
                              );
                              setDeliverableNotes('');
                            }}
                          >
                            {isSubmitted ? 'Edit Deliverable' : 'Submit Deliverable'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Columns (Col 9-12): Recent Activity & Team Workload */}
        <div className="lg:col-span-4 space-y-6">
          {/* Recent Activity Feed */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <ActivityIcon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-xs font-semibold text-zinc-100">Recent Activity</h2>
              </div>
              <Link to="/history" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>

            {activityLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500">Loading activity...</div>
            ) : liveActivityFeed.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">No activity recorded yet</div>
            ) : (
              <div className="mt-3 space-y-3">
                {liveActivityFeed.map((act: any) => {
                  const isMe =
                    act.actorId === user?.id ||
                    (act.actorName &&
                      user?.displayName &&
                      act.actorName.toLowerCase() === user.displayName.toLowerCase());
                  const avatarSrc = isMe ? user?.avatarUrl || act.actorAvatarUrl : act.actorAvatarUrl;

                  return (
                    <div key={act.id} className="flex items-start gap-2.5 text-xs">
                      <ActivityAvatar
                        src={avatarSrc}
                        name={isMe ? user?.displayName || act.actorName : act.actorName}
                      />

                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-zinc-300">
                          <strong className="text-zinc-100 font-medium">
                            {isMe ? user?.displayName || act.actorName : act.actorName || 'Staff'}
                          </strong>{' '}
                          {act.action}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                          {act.entityName || act.entityType || 'Production'}
                        </p>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                        {formatTimeAgo(act.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Team Workload */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <TeamIcon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-xs font-semibold text-zinc-100">Team Workload</h2>
              </div>
              <Link to="/team" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRightIcon className="h-3 w-3" />
              </Link>
            </div>

            {/* Period Filter Tabs */}
            <div className="flex items-center gap-1 pt-3 pb-2">
              {(['Today', 'Week', 'Month'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTeamPeriod(period)}
                  className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    teamPeriod === period
                      ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* Team Members List */}
            {teamLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500">Loading team...</div>
            ) : liveTeamMembers.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">No staff registered yet</div>
            ) : (
              <div className="mt-2 space-y-2.5">
                {liveTeamMembers.slice(0, 5).map((m: any) => {
                  const isAvailable = m.availability === 'Available';
                  const isWorking =
                    m.availability === 'Working' || m.workload === 'High' || m.workload === 'Overloaded';
                  const isAway = m.availability === 'Away';

                  return (
                    <div
                      key={m.id || m.username}
                      className="flex items-center justify-between gap-2 text-xs py-0.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar src={m.avatarUrl} name={m.displayName || m.username} size="sm" />
                        <div className="truncate">
                          <div className="font-medium text-zinc-200 leading-none truncate">
                            {m.displayName || m.username}
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            {m.activeClaimsCount || 0} active slots
                          </div>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 ${
                          isAvailable || isWorking
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isAway
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                        }`}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" />
                        {m.availability || 'Available'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Keycap Shortcuts Guide */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 text-xs shadow-sm">
            <span className="text-[11px] font-medium text-zinc-400 block mb-2">Workspace Shortcuts</span>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Dashboard</span>
                <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-300">G</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Open Work</span>
                <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-300">O</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>My Claims</span>
                <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-300">M</kbd>
              </div>
              <div className="flex items-center justify-between">
                <span>Pipeline</span>
                <kbd className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 font-mono text-[10px] text-zinc-300">P</kbd>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DELIVERABLE SUBMISSION / EDIT MODAL */}
      {submittingClaim && (
        <Modal
          isOpen={true}
          onClose={() => setSubmittingClaim(null)}
          title={
            submittingClaim.status === 'SUBMITTED' ||
            submittingClaim.status === 'UNDER_REVIEW' ||
            submittingClaim.revisionsCount > 0
              ? `Edit Submission: ${submittingClaim.mangaTitle || 'Manga'}`
              : `Submit Deliverable: ${submittingClaim.mangaTitle || 'Manga'}`
          }
          description="Provide the deliverable URL and notes for QC verification."
        >
          <div className="space-y-4">
            {submittingClaim.revisionsCount > 0 && (
              <div className="p-2.5 rounded-lg bg-zinc-800/80 border border-zinc-700/60 text-xs text-zinc-300">
                You have submitted <strong>{submittingClaim.revisionsCount} revision(s)</strong>. Submitting again will increment this to Revision #{submittingClaim.revisionsCount + 1}.
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Deliverable Link (URL) <span className="text-rose-400">*</span>
              </label>
              <Input
                value={deliverableUrl}
                onChange={(e) => setDeliverableUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">
                Release Label <span className="text-rose-400">*</span>
              </label>
              <Input
                value={deliverableLabel}
                onChange={(e) => setDeliverableLabel(e.target.value)}
                placeholder="e.g. Chapter Redraw V1 (PSD / PNG)"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1">Notes for Reviewer</label>
              <Textarea
                value={deliverableNotes}
                onChange={(e) => setDeliverableNotes(e.target.value)}
                placeholder="Notes on double spreads, redraw layers, or corrections..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSubmittingClaim(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => submitMutation.mutate()}
                isLoading={submitMutation.isPending}
                disabled={!deliverableUrl.trim()}
              >
                {submittingClaim.status === 'SUBMITTED' ||
                submittingClaim.status === 'UNDER_REVIEW' ||
                submittingClaim.revisionsCount > 0
                  ? 'Update Submission'
                  : 'Submit Deliverable'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
