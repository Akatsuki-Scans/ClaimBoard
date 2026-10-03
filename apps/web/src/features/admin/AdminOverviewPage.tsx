import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  BookOpen,
  Briefcase,
  Bookmark,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  AlertOctagon,
} from 'lucide-react';

export function AdminOverviewPage() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<any>('/analytics/overview'),
  });

  const { data: bottlenecks } = useQuery({
    queryKey: ['analytics', 'bottlenecks'],
    queryFn: () => apiRequest<any>('/analytics/bottlenecks'),
  });

  if (isLoading) return <div className="p-12 text-center text-xs text-zinc-500">Loading operations center...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-indigo-400" />
          Operations Center & Production Pulse
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Real-time organizational throughput, active bottlenecks, and work-type distribution.
        </p>
      </div>

      {/* Primary Bottleneck Notice (Specification #35 & #71) */}
      {bottlenecks?.primaryBottleneck && (
        <div className="rounded-lg border border-amber-800/80 bg-amber-950/30 p-4 flex items-start gap-3.5">
          <AlertOctagon className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-amber-200">
              Production Bottleneck Detected: {bottlenecks.primaryBottleneck.workTypeName} ({bottlenecks.primaryBottleneck.workTypeCode})
            </div>
            <div className="text-amber-300/80">
              Tasks in this stage experience an average waiting time of{' '}
              <strong>{bottlenecks.primaryBottleneck.averageWaitingHours} hours</strong> with an overdue rate of{' '}
              <strong>{bottlenecks.primaryBottleneck.overdueRatePercent}%</strong>. Consider reallocating workers or assigning additional typesetters.
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards (Specification #36) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">Active Manga</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{analytics?.activeMangaCount}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">Open Tasks</div>
          <div className="text-xl font-bold text-indigo-400 mt-1">{analytics?.openAssignmentsCount}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">Active Claims</div>
          <div className="text-xl font-bold text-sky-400 mt-1">{analytics?.activeClaimsCount}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">Overdue Tasks</div>
          <div className="text-xl font-bold text-rose-400 mt-1">{analytics?.overdueTasksCount}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">In QC Review</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{analytics?.pendingReviewsCount}</div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5">
          <div className="text-[11px] text-zinc-500 font-medium">Done This Week</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{analytics?.completedThisWeek}</div>
        </div>
      </div>

      {/* Throughput Chart and Workload Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production Throughput Chart */}
        <div className="lg:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">Daily Production Throughput</h3>
            <span className="text-[11px] text-zinc-500 font-mono">Last 7 Days (Completed vs Target)</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics?.throughput}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#18181b',
                    borderColor: '#27272a',
                    fontSize: '12px',
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="completed" fill="#6366f1" radius={[4, 4, 0, 0]} name="Completed" />
                <Bar dataKey="target" fill="#27272a" radius={[4, 4, 0, 0]} name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Work Type Distribution */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Work Type Task Breakdown</h3>

          <div className="space-y-3">
            {analytics?.workTypeDistribution?.map((wt: any) => (
              <div key={wt.code} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 font-medium">{wt.name}</span>
                  <span className="text-zinc-500 font-mono">{wt.count} tasks</span>
                </div>
                <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, wt.count * 15)}%`,
                      backgroundColor: wt.color || '#6366f1',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
