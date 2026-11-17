import React, { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  User as UserIcon,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Calendar,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Copy,
  Check,
  ExternalLink,
  BookOpen,
  Layers,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  Activity,
  MessageSquare,
  FileCheck,
  Flame,
  Search,
  Filter,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { UserAvatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { BigFrownLottie, AlienMonsterLottie, CollisionLottie } from '../../components/ui/LottieEmoji';
import { formatDistanceToNow, format, isPast } from 'date-fns';

interface TaskTelemetryItem {
  id: string;
  assignmentId: string;
  mangaId: string;
  mangaTitle: string;
  mangaCoverUrl?: string;
  chapterId: string;
  chapterNumber: string | number;
  chapterTitle?: string;
  workTypeId?: string;
  workTypeName: string;
  workTypeCode: string;
  color: string;
  status: string;
  priority: string;
  deadline?: string;
  claimedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  isBlocked?: boolean;
  blockedReason?: string;
  pipelineUrl: string;
  deliverableUrl?: string;
  deliverableLabel?: string;
  notes?: string;
  revision?: number;
  latestReview?: {
    reviewerName?: string;
    status: string;
    comment?: string;
    createdAt: string;
  } | null;
}

interface UserProfileData {
  user: {
    id: string;
    username: string;
    displayName: string;
    discordId?: string;
    discordUsername?: string;
    avatarUrl?: string;
    role: string;
    isApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    availability: string;
    workload: string;
    timezone?: string;
    createdAt?: string;
  };
  stats: {
    totalCompletedTasks: number;
    totalActiveTasks: number;
    totalUnderReview: number;
    totalReviewsReceived: number;
    totalApprovedReviews: number;
    totalChangesRequested: number;
    approvalRate: number;
    totalSeriesCount: number;
    totalChaptersCount: number;
  };
  currentWork: TaskTelemetryItem[];
  completedWork: TaskTelemetryItem[];
  rolesBreakdown: { code: string; name: string; color: string; count: number }[];
  seriesBreakdown: { id: string; title: string; coverUrl?: string; completedCount: number }[];
  recentActivity: { id: string; action: string; entityType: string; createdAt: string; metadata?: any }[];
}

function getUrgencyBadge(deadlineStr?: string) {
  if (!deadlineStr) return null;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (diffHours < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
        <AlertTriangle className="h-3 w-3" />
        Overdue {formatDistanceToNow(deadline, { addSuffix: true })}
      </span>
    );
  }
  if (diffHours <= 24) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
        <Clock className="h-3 w-3" />
        Due in {Math.round(diffHours)}h
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-400 border border-zinc-800 bg-zinc-900/60">
      <Calendar className="h-3 w-3 text-zinc-500" />
      Due {format(deadline, 'MMM d')}
    </span>
  );
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'COMPLETED':
    case 'APPROVED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          COMPLETED
        </span>
      );
    case 'IN_REVIEW':
    case 'SUBMITTED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">
          IN REVIEW
        </span>
      );
    case 'IN_PROGRESS':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
          IN PROGRESS
        </span>
      );
    case 'CHANGES_REQUESTED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          REVISIONS NEEDED
        </span>
      );
    case 'CLAIMED':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
          CLAIMED
        </span>
      );
    default:
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono text-zinc-400 border border-zinc-800">
          {status}
        </span>
      );
  }
}

export function UserProfilePage() {
  const { identifier } = useParams<{ identifier?: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'current' | 'completed' | 'series' | 'activity'>('current');
  const [completedFilterRole, setCompletedFilterRole] = useState('All');
  const [completedSearch, setCompletedSearch] = useState('');

  // Target identifier: defaults to route param, or falls back to authenticated user
  const target = identifier || authUser?.displayName || authUser?.username || 'me';

  const { data, isLoading, error, refetch } = useQuery<UserProfileData>({
    queryKey: ['user-profile', target],
    queryFn: () => apiRequest<UserProfileData>(`/user/${encodeURIComponent(target)}`),
    enabled: Boolean(target),
    refetchInterval: 10000,
  });

  const isSelf = useMemo(() => {
    if (!data?.user || !authUser) return false;
    return (
      data.user.id === authUser.id ||
      data.user.username?.toLowerCase() === authUser.username?.toLowerCase() ||
      data.user.displayName?.toLowerCase() === authUser.displayName?.toLowerCase()
    );
  }, [data?.user, authUser]);

  // Filter completed work
  const filteredCompletedWork = useMemo(() => {
    if (!data?.completedWork) return [];
    return data.completedWork.filter((item) => {
      const matchRole =
        completedFilterRole === 'All' ||
        item.workTypeCode.toLowerCase() === completedFilterRole.toLowerCase() ||
        item.workTypeName.toLowerCase() === completedFilterRole.toLowerCase();

      const searchLower = completedSearch.toLowerCase().trim();
      const matchSearch =
        !searchLower ||
        item.mangaTitle.toLowerCase().includes(searchLower) ||
        String(item.chapterNumber).includes(searchLower) ||
        (item.notes && item.notes.toLowerCase().includes(searchLower));

      return matchRole && matchSearch;
    });
  }, [data?.completedWork, completedFilterRole, completedSearch]);

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-zinc-700 border-t-zinc-200 animate-spin" />
        <span className="text-xs font-mono text-zinc-500">Resolving staff profile & telemetry...</span>
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Button
          onClick={() => navigate('/users')}
          variant="secondary"
          size="sm"
          className="gap-1.5 text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Users</span>
        </Button>

        <div className="p-8 rounded-xl border border-dashed border-zinc-800 bg-[#111215] text-center space-y-3">
          <div className="inline-flex p-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400">
            <UserIcon className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold text-zinc-200">User Profile Not Found</h2>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            No active or verified staff member was found matching <code className="text-zinc-300 font-mono">"{target}"</code>.
            If the display name changed recently, ensure the name or username is spelled correctly.
          </p>
          <div className="pt-2">
            <Button onClick={() => refetch()} variant="secondary" size="sm">
              Retry Search
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const { user, stats, currentWork, rolesBreakdown, seriesBreakdown, recentActivity } = data;

  const isAdminUser =
    user.role === 'Administrator' ||
    Boolean(user.role && user.role.toLowerCase().includes('admin'));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb / Top Bar */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Link
            to="/users"
            className="hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            <Users className="h-3.5 w-3.5 text-zinc-500" />
            <span>Users</span>
          </Link>
          <ChevronRight className="h-3 w-3 text-zinc-600" />
          <span className="text-zinc-100 font-medium flex items-center gap-1.5">
            <span>{user.displayName || user.username}</span>
            {isAdminUser ? (
              <span title="Administrator">
                <AlienMonsterLottie className="h-4 w-4" />
              </span>
            ) : (
              <span title="Worker">
                <CollisionLottie className="h-4 w-4" />
              </span>
            )}
          </span>
          {isSelf && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60">
              You
            </span>
          )}
        </div>
      </div>

      {/* Hero Card */}
      <div className="rounded-xl border border-zinc-800/80 bg-[#111215] p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          {/* Avatar & Core Identity */}
          <div className="flex items-center gap-4 min-w-0">
            <UserAvatar
              src={user.avatarUrl}
              name={user.displayName || user.username}
              size="lg"
              className="h-16 w-16 text-lg border border-zinc-800 shadow-md shrink-0"
            />

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-zinc-100 tracking-tight truncate">
                  {user.displayName || user.username}
                </h1>
                {isAdminUser ? (
                  <span title="Administrator">
                    <AlienMonsterLottie className="h-6 w-6" />
                  </span>
                ) : (
                  <span title="Worker">
                    <CollisionLottie className="h-6 w-6" />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono flex-wrap">
                <span className="text-zinc-500">@{user.username}</span>
                {user.createdAt && (
                  <>
                    <span className="text-zinc-700">•</span>
                    <span className="text-zinc-500">
                      Joined {format(new Date(user.createdAt), 'MMM yyyy')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Workload Metric */}
          <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto justify-between sm:justify-start pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
            <div className="text-xs font-mono text-zinc-400 flex items-center gap-1.5">
              <span className="text-zinc-500">Workload:</span>
              <span
                className={`font-medium ${
                  stats.totalActiveTasks >= 4
                    ? 'text-rose-400'
                    : stats.totalActiveTasks >= 2
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {stats.totalActiveTasks} active task{stats.totalActiveTasks === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Metrics Grid (Obsidian High Information Density) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-[#111215] border border-zinc-800/80 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Completed</span>
            <FileCheck className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
            {stats.totalCompletedTasks}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            across {stats.totalChaptersCount} chapter{stats.totalChaptersCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#111215] border border-zinc-800/80 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>In Progress</span>
            <Clock className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-300 tabular-nums">
            {stats.totalActiveTasks}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            {stats.totalUnderReview > 0
              ? `${stats.totalUnderReview} pending review`
              : 'currently underway'}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#111215] border border-zinc-800/80 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Approval Rate</span>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {stats.approvalRate}%
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            {stats.totalApprovedReviews} / {stats.totalReviewsReceived} verified
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#111215] border border-zinc-800/80 space-y-1">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center justify-between">
            <span>Series Portfolio</span>
            <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-100 tabular-nums">
            {stats.totalSeriesCount}
          </div>
          <div className="text-[11px] font-mono text-zinc-500">
            distinct titles worked
          </div>
        </div>
      </div>

      {/* Role Breakdown Bar (if tasks completed) */}
      {rolesBreakdown.length > 0 && (
        <div className="p-4 rounded-xl bg-[#111215] border border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-zinc-400" />
              Role Expertise & Task Breakdown
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              {stats.totalCompletedTasks} total deliveries
            </span>
          </div>

          {/* Multi-segment Progress Bar */}
          <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden flex border border-zinc-800/60">
            {rolesBreakdown.map((r) => {
              const pct = (r.count / Math.max(1, stats.totalCompletedTasks)) * 100;
              return (
                <div
                  key={r.code}
                  style={{ width: `${pct}%`, backgroundColor: r.color || '#6366f1' }}
                  className="h-full transition-all"
                  title={`${r.name} (${r.code}): ${r.count} tasks (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {rolesBreakdown.map((r) => (
              <div
                key={r.code}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-300"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: r.color || '#6366f1' }}
                />
                <span className="font-semibold">{r.code}</span>
                <span className="text-zinc-500">({r.name})</span>
                <span className="text-zinc-400 font-bold ml-1">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('current')}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'current'
              ? 'text-zinc-100 bg-zinc-800 border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Current Work</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
            {currentWork.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'completed'
              ? 'text-zinc-100 bg-zinc-800 border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          <span>Completed Work</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
            {data.completedWork.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('series')}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'series'
              ? 'text-zinc-100 bg-zinc-800 border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          <span>Series Portfolio</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-zinc-900 text-zinc-300 border border-zinc-800">
            {seriesBreakdown.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'activity'
              ? 'text-zinc-100 bg-zinc-800 border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>Recent Activity</span>
        </button>
      </div>

      {/* Tab 1: Current Work (In Progress) */}
      {activeTab === 'current' && (
        <div className="space-y-3">
          {currentWork.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 select-none">
              <BigFrownLottie className="h-28 w-28" />
              <div className="text-sm font-semibold text-zinc-300">
                No active tasks in progress
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {currentWork.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-zinc-800/80 bg-[#111215] p-4 flex flex-col justify-between gap-3 hover:border-zinc-700/80 transition-all shadow-sm"
                >
                  <div className="space-y-2.5">
                    {/* Header: Title + Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          to={`/manga/${task.mangaId}`}
                          className="font-semibold text-sm text-zinc-100 hover:text-indigo-400 transition-colors line-clamp-1"
                        >
                          {task.mangaTitle}
                        </Link>
                        <div className="text-xs text-zinc-400 font-mono">
                          Chapter {task.chapterNumber}
                          {task.chapterTitle ? ` — ${task.chapterTitle}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border"
                          style={{
                            borderColor: `${task.color || '#6366f1'}40`,
                            backgroundColor: `${task.color || '#6366f1'}15`,
                            color: task.color || '#a5b4fc',
                          }}
                        >
                          {task.workTypeCode}
                        </span>
                        {getStatusBadge(task.status)}
                      </div>
                    </div>

                    {/* Deadline urgency */}
                    <div className="flex items-center gap-2 pt-0.5">
                      {getUrgencyBadge(task.deadline)}
                      {task.claimedAt && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          Claimed {formatDistanceToNow(new Date(task.claimedAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>

                    {/* Deliverable link / revision if submitted */}
                    {task.deliverableUrl && (
                      <div className="p-2 rounded bg-zinc-900/80 border border-zinc-800/80 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-zinc-300 truncate">
                          <ExternalLink className="h-3 w-3 text-zinc-500 shrink-0" />
                          <span className="truncate">{task.deliverableLabel || task.deliverableUrl}</span>
                        </div>
                        <a
                          href={task.deliverableUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-indigo-400 hover:underline shrink-0"
                        >
                          Open Link
                        </a>
                      </div>
                    )}

                    {/* Review Feedback note if available */}
                    {task.latestReview?.comment && (
                      <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20 text-xs text-amber-200/90 space-y-0.5">
                        <div className="text-[10px] font-mono text-amber-400/80 flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          <span>Reviewer Feedback ({task.latestReview.reviewerName || 'Admin'}):</span>
                        </div>
                        <p className="text-[11px] text-zinc-300 italic">{task.latestReview.comment}</p>
                      </div>
                    )}
                  </div>

                  {/* Footer Action */}
                  <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-500">
                      Task ID: {task.id.slice(-6)}
                    </span>
                    <Link
                      to={task.pipelineUrl}
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:underline transition-colors"
                    >
                      <span>Open in Pipeline</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Completed Work Archive */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {data.completedWork.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 select-none">
              <BigFrownLottie className="h-28 w-28" />
              <div className="text-sm font-semibold text-zinc-300">
                No tasks completed yet
              </div>
            </div>
          ) : (
            <>
              {/* Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111215] border border-zinc-800/80 p-3 rounded-xl">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                  <Input
                    value={completedSearch}
                    onChange={(e) => setCompletedSearch(e.target.value)}
                    placeholder="Search series or chapter..."
                    className="pl-9 h-8 text-xs bg-zinc-900 border-zinc-800 focus:border-zinc-700"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <Filter className="h-3 w-3 text-zinc-500" />
                    Role:
                  </span>
                  <select
                    value={completedFilterRole}
                    onChange={(e) => setCompletedFilterRole(e.target.value)}
                    aria-label="Filter completed tasks by role"
                    className="h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 focus:outline-none focus:border-zinc-700"
                  >
                    <option value="All">All Roles</option>
                    {rolesBreakdown.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.code} ({r.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Completed Table */}
              <div className="rounded-xl border border-zinc-800/80 bg-[#111215] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
                      <tr>
                        <th className="py-3 px-4">Series & Chapter</th>
                        <th className="py-3 px-4">Task Role</th>
                        <th className="py-3 px-4">Completed Date</th>
                        <th className="py-3 px-4">Deliverable</th>
                        <th className="py-3 px-4">Review Sign-off</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                      {filteredCompletedWork.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                            No completed tasks match your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredCompletedWork.map((item) => (
                          <tr key={item.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-3 px-4">
                              <div>
                                <Link
                                  to={`/manga/${item.mangaId}`}
                                  className="font-medium text-zinc-100 hover:text-indigo-400 transition-colors"
                                >
                                  {item.mangaTitle}
                                </Link>
                                <div className="text-[11px] text-zinc-500 font-mono">
                                  Ch. {item.chapterNumber}
                                  {item.chapterTitle ? ` — ${item.chapterTitle}` : ''}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold border"
                                style={{
                                  borderColor: `${item.color || '#6366f1'}40`,
                                  backgroundColor: `${item.color || '#6366f1'}15`,
                                  color: item.color || '#a5b4fc',
                                }}
                              >
                                {item.workTypeCode}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono text-[11px] text-zinc-400">
                              {item.completedAt
                                ? format(new Date(item.completedAt), 'MMM d, yyyy')
                                : 'Verified'}
                            </td>

                            <td className="py-3 px-4">
                              {item.deliverableUrl ? (
                                <a
                                  href={item.deliverableUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  <span className="max-w-[140px] truncate">
                                    {item.deliverableLabel || 'View File'}
                                  </span>
                                </a>
                              ) : (
                                <span className="text-zinc-600 font-mono text-[11px]">—</span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {item.latestReview ? (
                                <div className="text-[11px] space-y-0.5">
                                  <span className="text-emerald-400 font-mono flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {item.latestReview.reviewerName || 'Admin'}
                                  </span>
                                  {item.latestReview.comment && (
                                    <p className="text-zinc-500 truncate max-w-xs text-[10px]">
                                      "{item.latestReview.comment}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-emerald-400/80 font-mono text-[11px] flex items-center gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Direct Pass
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <Link
                                to={item.pipelineUrl}
                                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors inline-flex items-center"
                                title="Inspect in Pipeline"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 3: Series Portfolio */}
      {activeTab === 'series' && (
        <div className="space-y-3">
          {seriesBreakdown.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 select-none">
              <BigFrownLottie className="h-28 w-28" />
              <div className="text-sm font-semibold text-zinc-300">
                No series portfolio yet
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {seriesBreakdown.map((s) => (
                <Link
                  key={s.id}
                  to={`/manga/${s.id}`}
                  className="rounded-xl border border-zinc-800/80 bg-[#111215] p-3.5 flex items-center gap-3.5 hover:border-zinc-700/80 transition-all group"
                >
                  {s.coverUrl ? (
                    <img
                      src={s.coverUrl}
                      alt={s.title}
                      className="h-14 w-10 object-cover rounded border border-zinc-800 shrink-0 shadow-sm"
                    />
                  ) : (
                    <div className="h-14 w-10 rounded bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 shrink-0">
                      <BookOpen className="h-4 w-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-400 transition-colors truncate">
                      {s.title}
                    </h3>
                    <div className="text-[11px] font-mono text-zinc-500">
                      <span className="text-zinc-300 font-bold">{s.completedCount}</span> completed chapter task{s.completedCount === 1 ? '' : 's'}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Recent Activity */}
      {activeTab === 'activity' && (
        <div className="rounded-xl border border-zinc-800/80 bg-[#111215] p-4 space-y-3">
          <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-zinc-400" />
            Verified Staff Activity Log
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No recent logged audit events for this user.
            </div>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span className="font-mono text-zinc-300 truncate">
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-zinc-500 font-mono">
                      ({log.entityType})
                    </span>
                  </div>

                  <span className="text-[11px] font-mono text-zinc-500 shrink-0">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
