import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  BookOpen,
  ListTodo,
  AlertTriangle,
  CheckCircle,
  Clock,
  SlidersHorizontal,
  ArrowRight,
  MoreVertical,
  GitFork,
  Activity,
  Users,
} from 'lucide-react';
import { OpenWorkIcon, MyClaimsIcon } from '../../components/ui/icon';

export function MiniSparkline({ color = 'rgba(255,255,255,0.4)', trend = 'up' }: { color?: string; trend?: 'up' | 'down' | 'neutral' }) {
  const points =
    trend === 'up'
      ? '0,14 10,12 20,15 30,10 40,8 50,4'
      : trend === 'down'
      ? '0,4 10,6 20,8 30,12 40,11 50,15'
      : '0,10 10,11 20,9 30,10 40,9 50,10';

  return (
    <svg className="w-14 h-4 overflow-visible shrink-0" viewBox="0 0 50 16">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return 'GOOD MORNING,';
  } else if (hour >= 12 && hour < 17) {
    return 'GOOD AFTERNOON,';
  } else if (hour >= 17 && hour < 22) {
    return 'GOOD EVENING,';
  } else {
    return 'GOOD NIGHT,';
  }
}

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

function formatDeadlineLeft(deadline?: string | Date): string {
  if (!deadline) return 'No deadline';
  const now = new Date();
  const target = new Date(deadline);
  const diffInMs = target.getTime() - now.getTime();
  if (diffInMs <= 0) return 'Overdue';
  const hours = Math.floor(diffInMs / (1000 * 60 * 60));
  const mins = Math.floor((diffInMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d left`;
  }
  return `${hours}h ${mins}m left`;
}

function ActivityAvatar({ src, name }: { src?: string; name?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || 'U').slice(0, 1).toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || 'User'}
        onError={() => setFailed(true)}
        className="h-7 w-7 rounded-full object-cover shrink-0 border border-[#2a2e36]"
      />
    );
  }

  return (
    <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-zinc-300">
      {initial}
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

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
    : 'No Active Chapter';
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
      if (!claim.deadline) return false;
      const hours = (new Date(claim.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
      return hours > 0 && hours <= 24;
    }
    if (claimsFilter === 'Overdue') {
      return claim.isOverdue || (claim.deadline && new Date(claim.deadline) < new Date() && status !== 'COMPLETED');
    }
    if (claimsFilter === 'Completed') {
      return status === 'COMPLETED';
    }
    return true;
  });

  const claimsCounts = {
    active: liveClaims.filter((c: any) => ['ACTIVE', 'IN_PROGRESS', 'CLAIMED', 'CHANGES_REQUESTED'].includes(c.status)).length,
    dueSoon: liveClaims.filter((c: any) => {
      if (!c.deadline) return false;
      const hours = (new Date(c.deadline).getTime() - Date.now()) / (1000 * 60 * 60);
      return hours > 0 && hours <= 24;
    }).length,
    overdue: liveClaims.filter((c: any) => c.isOverdue || (c.deadline && new Date(c.deadline) < new Date() && c.status !== 'COMPLETED')).length,
    completed: liveClaims.filter((c: any) => c.status === 'COMPLETED').length,
  };

  return (
    <div className="space-y-6 max-w-[1520px] mx-auto text-zinc-100 select-none pb-12">
      {/* 1. HERO GREETING WITH FULL AKATSUKI MANGA ART OVERLAY */}
      <div className="relative overflow-hidden rounded-2xl bg-[#0c0d0e] border border-[#1e2229] p-7 shadow-xl min-h-[140px] flex items-center">
        {/* Full Akatsuki Panorama Background */}
        <div
          className="absolute inset-0 w-full h-full bg-cover bg-center pointer-events-none opacity-45 sm:opacity-55 filter contrast-125"
          style={{ backgroundImage: "url('/akatsuki.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0c0d0e] via-[#0c0d0e]/70 to-transparent pointer-events-none" />

        {/* Vertical Japanese Kanji */}
        <div className="absolute right-8 top-5 text-[11px] text-zinc-400/60 font-serif tracking-[0.4em] select-none pointer-events-none leading-loose hidden sm:block">
          翻<br />訳<br />ス<br />キ<br />ャ<br />ン<br />レ<br />｜<br />シ<br />ョ<br />ン
        </div>

        <div className="relative z-10 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            {getTimeGreeting()}
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            {user?.displayName || 'NapaExtra'}
          </h1>
          <p className="text-xs text-zinc-300 font-normal pt-0.5">
            Here's what's happening with your team today.
          </p>
        </div>
      </div>

      {/* 2. TOP 4 METRICS CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Manga */}
        <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-4.5 flex items-center justify-between shadow-sm hover:border-[#2a2f38] transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#181b22] border border-[#262b35] flex items-center justify-center text-zinc-300">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Total Manga</div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {analyticsLoading ? '...' : analytics?.totalMangaCount ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 font-medium">
                → {analytics?.activeMangaCount ?? 0} active
              </div>
            </div>
          </div>
          <MiniSparkline color="rgba(255,255,255,0.4)" trend="up" />
        </div>

        {/* Card 2: Active Tasks */}
        <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-4.5 flex items-center justify-between shadow-sm hover:border-[#2a2f38] transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#181b22] border border-[#262b35] flex items-center justify-center text-zinc-300">
              <ListTodo className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Active Tasks</div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {analyticsLoading ? '...' : analytics?.openAssignmentsCount ?? liveOpenTasks.length}
              </div>
              <div className="text-[10px] text-zinc-500 font-medium">
                → {analytics?.activeClaimsCount ?? 0} in progress
              </div>
            </div>
          </div>
          <MiniSparkline color="rgba(255,255,255,0.4)" trend="up" />
        </div>

        {/* Card 3: Overdue */}
        <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-4.5 flex items-center justify-between shadow-sm hover:border-[#2a2f38] transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#181b22] border border-[#262b35] flex items-center justify-center text-zinc-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Overdue</div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {analyticsLoading ? '...' : analytics?.overdueTasksCount ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 font-medium">
                {(analytics?.overdueTasksCount ?? 0) > 0 ? '→ needs attention' : '→ all on track'}
              </div>
            </div>
          </div>
          <MiniSparkline
            color="rgba(255,255,255,0.4)"
            trend={(analytics?.overdueTasksCount ?? 0) > 0 ? 'down' : 'up'}
          />
        </div>

        {/* Card 4: Completed Today */}
        <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-4.5 flex items-center justify-between shadow-sm hover:border-[#2a2f38] transition-colors">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-[#181b22] border border-[#262b35] flex items-center justify-center text-zinc-300">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-medium text-zinc-400">Completed Today</div>
              <div className="text-2xl font-bold text-white tracking-tight">
                {analyticsLoading ? '...' : analytics?.completedToday ?? 0}
              </div>
              <div className="text-[10px] text-zinc-500 font-medium">
                → {analytics?.completedThisWeek ?? 0} this week
              </div>
            </div>
          </div>
          <MiniSparkline color="rgba(255,255,255,0.4)" trend="up" />
        </div>
      </div>

      {/* 3. MAIN WORKSPACE GRID: LEFT COLUMNS + RIGHT SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT / CENTER CONTENT AREA (Col 1 to 8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Middle Row: Open Work + Production Pipeline */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Open Work Card (md:col-span-7) */}
            <div className="md:col-span-7 rounded-xl border border-[#1e2229] bg-[#111317] p-5 flex flex-col justify-between shadow-sm min-h-[380px]">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <OpenWorkIcon className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-sm font-bold text-white">Open Work</h2>
                  </div>
                  <Link to="/open-work" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Available tasks across all manga. Claim and get started.
                </p>

                {/* Filters & Sort Row */}
                <div className="flex items-center justify-between pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    {[
                      { key: 'All', label: `All ${openWorkCounts.all}` },
                      { key: 'High', label: `High ${openWorkCounts.high}` },
                      { key: 'Normal', label: `Normal ${openWorkCounts.normal}` },
                      { key: 'Low', label: `Low ${openWorkCounts.low}` },
                    ].map((tab) => {
                      const isActive = openWorkFilter === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setOpenWorkFilter(tab.key as any)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            isActive
                              ? 'bg-[#1e2229] text-white border border-[#2a2f38]'
                              : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>

                  <Link
                    to="/open-work"
                    className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 bg-[#16191f] border border-[#262a32] px-2.5 py-1 rounded-md"
                  >
                    <span>Sort</span>
                    <SlidersHorizontal className="h-3 w-3" />
                  </Link>
                </div>

                {/* Open Tasks List */}
                {openTasksLoading ? (
                  <div className="py-12 text-center text-xs text-zinc-500">Loading open tasks...</div>
                ) : filteredOpenTasks.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-[#1e2229] rounded-lg my-2">
                    No open tasks available.
                  </div>
                ) : (
                  <div className="divide-y divide-[#1a1d24]">
                    {filteredOpenTasks.slice(0, 5).map((t: any) => (
                      <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={t.manga?.coverUrl || '/akatsuki.jpg'}
                            alt={t.manga?.title || 'Manga'}
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/akatsuki.jpg';
                            }}
                            className="h-9 w-9 rounded-lg object-cover shrink-0 border border-[#242830]"
                          />
                          <div className="truncate">
                            <div className="text-xs font-semibold text-white truncate">
                              {t.manga?.title || t.mangaTitle || 'Unknown Manga'}
                            </div>
                            <div className="text-[10px] text-zinc-400">
                              {t.chapter ? `Ch. ${t.chapter.chapterNumber}` : 'General Task'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-zinc-300 font-medium hidden sm:inline">
                            {t.workType?.name || 'Task'}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                              (t.priority || '').toLowerCase() === 'high'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : (t.priority || '').toLowerCase() === 'low'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}
                          >
                            <span className="h-1 w-1 rounded-full bg-current" />
                            {t.priority || 'Normal'}
                          </span>

                          <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {formatDeadlineLeft(t.deadline)}
                          </span>

                          <button
                            onClick={() => claimMutation.mutate(t.id)}
                            disabled={claimMutation.isPending && (claimMutation.variables as string) === t.id}
                            className="h-7 px-3 rounded-md bg-[#1d2128] hover:bg-[#282e38] text-white text-xs font-medium border border-[#2a303c] transition-colors disabled:opacity-50"
                          >
                            {claimMutation.isPending && (claimMutation.variables as string) === t.id
                              ? 'Claiming...'
                              : 'Claim'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Production Pipeline Card (md:col-span-5) */}
            <div className="md:col-span-5 rounded-xl border border-[#1e2229] bg-[#111317] p-5 flex flex-col justify-between shadow-sm min-h-[380px]">
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitFork className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-sm font-bold text-white">Production Pipeline</h2>
                  </div>
                  <Link to="/pipeline" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>

                {pipelineLoading ? (
                  <div className="py-12 text-center text-xs text-zinc-500">Loading pipeline...</div>
                ) : !activePipelineChapter ? (
                  <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-[#1e2229] rounded-lg mt-4">
                    No active production chapters in pipeline.
                  </div>
                ) : (
                  <>
                    <Link
                      to={`/pipeline/${activePipelineChapter.mangaId}/${activePipelineChapter.chapterId}`}
                      className="text-xs font-bold text-zinc-200 mt-2 hover:text-white hover:underline flex items-center gap-1.5"
                    >
                      <span>{pipelineChapterTitle}</span>
                      <ArrowRight className="h-3 w-3 text-zinc-500" />
                    </Link>

                    {/* Progress bar */}
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1 h-1.5 rounded-full bg-[#1e222a] overflow-hidden flex">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-300"
                          style={{ width: `${pipelineProgress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400">
                        {completedStagesCount}/{totalStagesCount}
                      </span>
                    </div>

                    {/* Vertical Pipeline Steps from real stages */}
                    {pipelineStages.length === 0 ? (
                      <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-[#1e2229] rounded-lg mt-3">
                        No stages configured for this chapter yet.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
                        {pipelineStages.map((step: any) => {
                          const isDone = step.status === 'COMPLETED';
                          const isActive = step.status === 'IN_PROGRESS' || step.status === 'CLAIMED';
                          const isBlocked = step.isBlocked || step.status === 'BLOCKED';

                          return (
                            <div key={step.assignmentId || step.workTypeName} className="flex items-center justify-between text-xs py-0.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isDone ? (
                                  <div className="h-4 w-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                                    ✓
                                  </div>
                                ) : isActive ? (
                                  <div className="h-4 w-4 rounded-full border-2 border-white flex items-center justify-center shrink-0">
                                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                                  </div>
                                ) : isBlocked ? (
                                  <div className="h-4 w-4 rounded-full border border-amber-500/80 shrink-0" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border border-zinc-700 shrink-0" />
                                )}

                                <span className="font-medium text-white truncate">
                                  {step.workTypeName || step.name}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 shrink-0">
                                <span
                                  className={`text-[10px] font-medium flex items-center gap-1 ${
                                    isDone
                                      ? 'text-emerald-400'
                                      : isActive
                                      ? 'text-sky-400'
                                      : isBlocked
                                      ? 'text-rose-400'
                                      : 'text-zinc-500'
                                  }`}
                                >
                                  {!isDone && !isBlocked && <span className="h-1 w-1 rounded-full bg-current" />}
                                  {step.status || 'Waiting'}
                                </span>

                                <span className="text-[10px] font-mono text-zinc-500 w-16 text-right truncate">
                                  {step.assignedWorkerName || '—'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Left Card: My Claims */}
          <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MyClaimsIcon className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold text-white">My Claims</h2>
              </div>
              <Link to="/my-claims" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Your active and pending tasks.</p>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 pt-4 pb-3">
              {[
                { key: 'Active', label: `Active ${claimsCounts.active}` },
                { key: 'Due Soon', label: `Due Soon ${claimsCounts.dueSoon}` },
                { key: 'Overdue', label: `Overdue ${claimsCounts.overdue}` },
                { key: 'Completed', label: `Completed ${claimsCounts.completed}` },
              ].map((tab) => {
                const isActive = claimsFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setClaimsFilter(tab.key as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      isActive
                        ? 'bg-[#1e2229] text-white border border-[#2a2f38]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Claims Table / List */}
            {claimsLoading ? (
              <div className="py-12 text-center text-xs text-zinc-500">Loading claims...</div>
            ) : filteredClaims.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500 border border-dashed border-[#1e2229] rounded-lg my-2">
                You have no claims in this category.
              </div>
            ) : (
              <div className="divide-y divide-[#1a1d24]">
                {filteredClaims.map((c: any) => {
                  const isSubmitted =
                    c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW' || (c.revisionsCount > 0);

                  return (
                    <div key={c.id} className="py-2.5 flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={c.mangaCoverUrl || '/akatsuki.jpg'}
                          alt={c.mangaTitle || 'Manga'}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/akatsuki.jpg';
                          }}
                          className="h-9 w-9 rounded-lg object-cover shrink-0 border border-[#242830]"
                        />
                        <div className="truncate">
                          <div className="text-xs font-semibold text-white truncate">
                            {c.mangaTitle || 'Manga'}
                          </div>
                          <div className="text-[10px] text-zinc-400">
                            {c.chapterNumber ? `Ch. ${c.chapterNumber}` : 'General'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Role Tag Pill with icon */}
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1"
                          style={{
                            backgroundColor: `${c.workTypeColor || '#6366f1'}15`,
                            borderColor: `${c.workTypeColor || '#6366f1'}35`,
                            color: c.workTypeColor || '#6366f1',
                          }}
                        >
                          <span>{c.workTypeName || 'Task'}</span>
                        </span>

                        <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">
                          {formatDeadlineLeft(c.deadline)}
                        </span>

                        {c.status === 'COMPLETED' ? (
                          <span className="text-[11px] text-emerald-400 font-medium px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                            Done ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setSubmittingClaim(c);
                              setDeliverableUrl(c.lastDeliverableUrl || '');
                              setDeliverableLabel(
                                c.lastDeliverableLabel ||
                                `${c.workTypeName || 'Task'} - ${c.mangaTitle || 'Chapter'} Submission`
                              );
                              setDeliverableNotes('');
                            }}
                            className="h-7 px-3 rounded-md bg-[#1d2128] hover:bg-[#282e38] text-white text-xs font-medium border border-[#2a303c] transition-colors"
                          >
                            {isSubmitted ? 'Edit' : 'Open'}
                          </button>
                        )}

                        <button className="text-zinc-500 hover:text-white p-1">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDEBAR COLUMN (Col 9 to 12) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Recent Activity */}
          <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#1a1d24]">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold text-white">Recent Activity</h2>
              </div>
              <Link to="/history" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {activityLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500">Loading activity...</div>
            ) : liveActivityFeed.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500">No recent activity recorded yet.</div>
            ) : (
              <div className="mt-3.5 space-y-3.5">
                {liveActivityFeed.map((act: any) => {
                  const isMe =
                    act.actorId === user?.id ||
                    (act.actorName && user?.displayName && act.actorName.toLowerCase() === user.displayName.toLowerCase());
                  const avatarSrc = isMe ? (user?.avatarUrl || act.actorAvatarUrl) : act.actorAvatarUrl;

                  return (
                    <div key={act.id} className="flex items-start gap-3 text-xs">
                      <ActivityAvatar
                        src={avatarSrc}
                        name={isMe ? (user?.displayName || act.actorName) : act.actorName}
                      />

                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-zinc-300">
                          <strong className="text-white font-semibold">{isMe ? (user?.displayName || act.actorName) : (act.actorName || 'Team Member')}</strong>{' '}
                          {act.action}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                          {act.entityName || act.entityType || 'Production'}
                        </p>
                      </div>
                      <span className="text-[10px] text-zinc-500 shrink-0 font-mono">
                        {formatTimeAgo(act.createdAt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 2: Team Stats */}
          <div className="rounded-xl border border-[#1e2229] bg-[#111317] p-5 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#1a1d24]">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-zinc-400" />
                <h2 className="text-sm font-bold text-white">Team Stats</h2>
              </div>
              <Link to="/team" className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Period Filter Tabs */}
            <div className="flex items-center gap-1.5 pt-3.5 pb-2">
              {(['Today', 'Week', 'Month'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTeamPeriod(period)}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    teamPeriod === period
                      ? 'bg-[#1e2229] text-white border border-[#2a2f38]'
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
              <div className="py-8 text-center text-xs text-zinc-500">No team members registered yet.</div>
            ) : (
              <div className="mt-2 space-y-3">
                {liveTeamMembers.slice(0, 4).map((m: any) => {
                  const isAvailable = m.availability === 'Available';
                  const isWorking = m.availability === 'Working' || m.workload === 'High' || m.workload === 'Overloaded';
                  const isAway = m.availability === 'Away';

                  return (
                    <div key={m.id || m.username} className="flex items-center justify-between gap-2 text-xs py-1">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={m.avatarUrl || '/akatsuki.jpg'}
                          alt={m.displayName || m.username}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/akatsuki.jpg';
                          }}
                          className="h-7 w-7 rounded-full object-cover shrink-0 border border-[#2a2e36]"
                        />
                        <div className="truncate">
                          <div className="font-semibold text-white leading-none truncate">
                            {m.displayName || m.username}
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-1">
                            {m.activeClaimsCount || 0} tasks
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <MiniSparkline
                          color={isAvailable || isWorking ? '#10b981' : '#71717a'}
                          trend={isWorking ? 'up' : 'neutral'}
                        />

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1 ${
                            isAvailable
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isWorking
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: Inspirational Quote Card */}
          <div className="relative overflow-hidden rounded-xl border border-[#1e2229] bg-[#111317] p-5 shadow-sm">
            <div className="relative z-10">
              <p className="text-xs italic text-zinc-400 font-serif leading-relaxed">
                “Small steps every day lead to great chapters.”
              </p>
            </div>
            {/* Subtle background graphic line art */}
            <div className="absolute right-0 bottom-0 opacity-15 pointer-events-none">
              <svg width="100" height="60" viewBox="0 0 100 60" fill="none">
                <path d="M0 60L40 20L70 40L100 0" stroke="white" strokeWidth="2" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* DELIVERABLE SUBMISSION / EDIT SUBMISSION MODAL */}
      {submittingClaim && (
        <Modal
          isOpen={true}
          onClose={() => setSubmittingClaim(null)}
          title={
            submittingClaim.status === 'SUBMITTED' ||
            submittingClaim.status === 'UNDER_REVIEW' ||
            submittingClaim.revisionsCount > 0
              ? `Edit Submission: ${submittingClaim.mangaTitle || 'Manga'}`
              : `Submit Work: ${submittingClaim.mangaTitle || 'Manga'}`
          }
        >
          <div className="space-y-4">
            {submittingClaim.revisionsCount > 0 && (
              <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                You have already submitted <strong>{submittingClaim.revisionsCount} revision(s)</strong>. Submitting again will update your submission to Revision #{submittingClaim.revisionsCount + 1}.
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
