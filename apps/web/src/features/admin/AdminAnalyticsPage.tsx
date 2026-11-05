import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import {
  AnalyticsIcon,
  AlertTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  LayersIcon,
} from '../../components/ui/icon';
import { RotateCcw } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface AnalyticsOverview {
  totalMangaCount: number;
  activeMangaCount: number;
  openAssignmentsCount: number;
  activeClaimsCount: number;
  overdueTasksCount: number;
  pendingReviewsCount: number;
  totalCompletedTasks: number;
  completedToday: number;
  completedThisWeek: number;
  avgCompletionHours: number;
  revisionRatePercent: number;
  totalAssignedTasks: number;
  workTypeDistribution: Array<{
    name: string;
    code: string;
    count: number;
    color: string;
    percentage: number;
  }>;
  completionTrend: Array<{
    date: string;
    completions: number;
  }>;
}

export function AdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'bottlenecks'>('overview');
  const [dateRange, setDateRange] = useState('Last 30 days');

  const { data: overview, isLoading: isOverviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<AnalyticsOverview>('/analytics/overview'),
  });

  const { data: bottlenecks, isLoading: isBottlenecksLoading } = useQuery({
    queryKey: ['analytics', 'bottlenecks'],
    queryFn: () => apiRequest<any>('/analytics/bottlenecks'),
  });

  const distributionData =
    overview?.workTypeDistribution && overview.workTypeDistribution.length > 0
      ? overview.workTypeDistribution.map((d) => ({
          name: d.name,
          value: d.count,
          percentage: d.percentage,
          color: d.color || '#6366f1',
        }))
      : [];

  const trendData =
    overview?.completionTrend && overview.completionTrend.length > 0
      ? overview.completionTrend
      : [];

  const totalTasksCount = overview?.totalAssignedTasks ?? distributionData.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-zinc-100 select-none pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <AnalyticsIcon className="h-4 w-4 text-zinc-400" />
            Analytics & telemetry
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real production throughput, turnaround velocity, and bottleneck analysis
          </p>
        </div>

        {/* Date Filter & Tab Switcher */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#111215] border border-zinc-800 p-1 rounded-lg text-xs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'overview' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('bottlenecks')}
              className={`px-3 py-1 rounded-md transition-colors ${
                activeTab === 'bottlenecks' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Bottleneck inspection
            </button>
          </div>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-300 focus:outline-none"
          >
            <option value="Last 7 days">Last 7 days</option>
            <option value="Last 30 days">Last 30 days</option>
            <option value="All Time">All time</option>
          </select>
        </div>
      </div>

      {/* Top 4 Metrics Cards with Live Database Telemetry */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Completed tasks</span>
            <CheckCircleIcon className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-zinc-100 font-mono tracking-tight tabular-nums">
              {overview?.totalCompletedTasks ?? 0}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              +{overview?.completedThisWeek ?? 0} this week
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Avg turnaround time</span>
            <ClockIcon className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-zinc-100 font-mono tracking-tight tabular-nums">
              {overview?.avgCompletionHours !== undefined ? `${overview.avgCompletionHours}h` : '0h'}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Production velocity</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Overdue tasks</span>
            <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500/80" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-zinc-100 font-mono tracking-tight tabular-nums">
              {overview?.overdueTasksCount ?? 0}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Needs intervention</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-medium">
            <span>Revision rate</span>
            <RotateCcw className="h-3.5 w-3.5 text-zinc-500" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-zinc-100 font-mono tracking-tight tabular-nums">
              {overview?.revisionRatePercent ?? 0}%
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Review change requests</div>
          </div>
        </div>
      </div>

      {/* Two Charts Grid (Work Type Distribution & Completion Trend) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Chart: Work Type Distribution (Donut Chart) */}
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-200">Work type distribution</h2>
            <span className="text-[11px] text-zinc-500 font-mono">{totalTasksCount} total tasks</span>
          </div>

          {distributionData.length === 0 ? (
            <div className="py-14 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg my-2">
              No tasks assigned yet. Work type metrics will populate as tasks are created.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
              <div className="relative h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {distributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="#111215" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        borderColor: '#27272a',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Central Donut Text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-lg font-bold text-zinc-100 font-mono tabular-nums tracking-tight">
                    {totalTasksCount}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Tasks</span>
                </div>
              </div>

              {/* Legend Breakdown */}
              <div className="space-y-2 text-xs w-full sm:w-48">
                {distributionData.map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="text-zinc-300 truncate">{d.name}</span>
                    </div>
                    <span className="font-mono text-zinc-400 tabular-nums">
                      {d.value} ({d.percentage || Math.round((d.value / (totalTasksCount || 1)) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Chart: Completion Trend */}
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-200">Completion velocity</h2>
            <span className="text-[11px] text-zinc-500 font-mono">Daily completed tasks</span>
          </div>

          {trendData.length === 0 ? (
            <div className="py-14 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg my-2">
              No completions logged yet in this timeframe. Completed tasks will form this trendline.
            </div>
          ) : (
            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#71717a" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#71717a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      borderColor: '#27272a',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completions"
                    stroke="#a1a1aa"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Bottlenecks Detailed Table if clicked or toggled */}
      {activeTab === 'bottlenecks' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Stage delay & bottleneck breakdown</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live waiting durations and revision overhead across pipeline phases
            </p>
          </div>

          {isBottlenecksLoading ? (
            <div className="p-8 text-center text-xs text-zinc-500 font-mono">Loading telemetry...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400">
                  <tr>
                    <th className="pb-3 font-semibold">Stage</th>
                    <th className="pb-3 font-semibold">Avg waiting time</th>
                    <th className="pb-3 font-semibold">Avg active time</th>
                    <th className="pb-3 font-semibold">Overdue rate</th>
                    <th className="pb-3 font-semibold">Revision rate</th>
                    <th className="pb-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {bottlenecks?.stages?.map((stage: any) => (
                    <tr key={stage.workTypeId} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 font-medium text-zinc-200 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                        <span>{stage.workTypeName} ({stage.workTypeCode})</span>
                      </td>
                      <td className="py-3 font-mono text-zinc-300">{stage.averageWaitingHours}h</td>
                      <td className="py-3 font-mono text-zinc-400">{stage.averageActiveHours}h</td>
                      <td className="py-3 font-mono text-zinc-300">
                        <span className={stage.overdueRatePercent > 15 ? 'text-rose-400 font-medium' : 'text-zinc-300'}>
                          {stage.overdueRatePercent}%
                        </span>
                      </td>
                      <td className="py-3 font-mono text-zinc-300">{stage.revisionRatePercent}%</td>
                      <td className="py-3 text-right">
                        <Badge variant={stage.overdueRatePercent > 15 ? 'danger' : 'default'}>
                          {stage.overdueRatePercent > 15 ? 'Bottleneck' : 'Normal'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
