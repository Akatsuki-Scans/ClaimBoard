import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { BarChart3, AlertTriangle, Clock, Zap, RotateCcw, ChevronDown, CheckCircle2 } from 'lucide-react';
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

export function AdminAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'production' | 'team' | 'bottlenecks'>('overview');
  const [dateRange, setDateRange] = useState('Last 30 days');

  const { data: bottlenecks } = useQuery({
    queryKey: ['analytics', 'bottlenecks'],
    queryFn: () => apiRequest<any>('/analytics/bottlenecks'),
  });

  // Donut chart distribution data
  const distributionData = [
    { name: 'Translation', value: 24, color: '#0284c7' },
    { name: 'Cleaning', value: 18, color: '#d97706' },
    { name: 'Redrawing', value: 16, color: '#e11d48' },
    { name: 'Typesetting', value: 22, color: '#7c3aed' },
    { name: 'QC', value: 12, color: '#059669' },
    { name: 'Upload', value: 8, color: '#64748b' },
  ];

  // Completion trend line chart data
  const trendData = [
    { date: 'Sep 26', completions: 12 },
    { date: 'Sep 27', completions: 19 },
    { date: 'Sep 28', completions: 15 },
    { date: 'Sep 29', completions: 26 },
    { date: 'Sep 30', completions: 34 },
    { date: 'Oct 1', completions: 29 },
    { date: 'Oct 2', completions: 42 },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Analytics
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production telemetry, stage distribution, and completion velocity
          </p>
        </div>

        {/* Date Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-8 px-3 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="Last 7 days">Last 7 days</option>
            <option value="Last 30 days">Last 30 days</option>
            <option value="This Quarter">This Quarter</option>
            <option value="All Time">All Time</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg text-xs w-fit">
        {(['Overview', 'Production', 'Team', 'Bottlenecks'] as const).map((tab) => {
          const val = tab.toLowerCase() as typeof activeTab;
          const isActive = activeTab === val;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(val)}
              className={`px-3 py-1 rounded-md transition-colors ${
                isActive ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Top 4 Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-medium">Completed Chapters</div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">28</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">+12% vs last month</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-medium">Avg Completion Time</div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">18.4h</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">-2.1h velocity improvement</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-medium">Overdue Tasks</div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">5</div>
            <div className="text-[11px] text-emerald-400 mt-0.5">-1 since last week</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-4 flex flex-col justify-between">
          <div className="text-xs text-zinc-400 font-medium">Revision Rate</div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-white tracking-tight">12%</div>
            <div className="text-[11px] text-amber-400 mt-0.5">+3% review requests</div>
          </div>
        </div>
      </div>

      {/* Two Charts Grid (Work Type Distribution & Completion Trend) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left Chart: Work Type Distribution (Donut Chart) */}
        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-200">Work Type Distribution</h2>
          </div>

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
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#121215" strokeWidth={2} />
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
                <span className="text-lg font-bold text-white tracking-tight">342</span>
                <span className="text-[10px] text-zinc-400 uppercase font-mono">Tasks</span>
              </div>
            </div>

            {/* Legend Breakdown */}
            <div className="space-y-2 text-xs w-full sm:w-48">
              {distributionData.map((d) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-zinc-300">{d.name}</span>
                  </div>
                  <span className="font-mono text-zinc-400">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Chart: Completion Trend */}
        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-zinc-200">Completion Trend</h2>
            <span className="text-[11px] text-zinc-500 font-mono">Daily volume</span>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="date" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
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
                  stroke="#818cf8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorTrend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottlenecks Detailed Table if clicked or toggled */}
      {activeTab === 'bottlenecks' && (
        <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-200">Stage Delay & Bottleneck Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="pb-3 font-semibold">Stage</th>
                  <th className="pb-3 font-semibold">Avg Waiting Time</th>
                  <th className="pb-3 font-semibold">Avg Active Time</th>
                  <th className="pb-3 font-semibold">Overdue Rate</th>
                  <th className="pb-3 font-semibold">Revision Rate</th>
                  <th className="pb-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {bottlenecks?.stages?.map((stage: any) => (
                  <tr key={stage.workTypeId} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="py-3 font-medium text-zinc-200 flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span>{stage.workTypeName} ({stage.workTypeCode})</span>
                    </td>
                    <td className="py-3 font-mono text-zinc-300">{stage.averageWaitingHours} hrs</td>
                    <td className="py-3 font-mono text-zinc-400">{stage.averageActiveHours} hrs</td>
                    <td className="py-3 font-mono text-zinc-300">
                      <span className={stage.overdueRatePercent > 15 ? 'text-rose-400 font-bold' : 'text-zinc-300'}>
                        {stage.overdueRatePercent}%
                      </span>
                    </td>
                    <td className="py-3 font-mono text-zinc-300">{stage.revisionRatePercent}%</td>
                    <td className="py-3">
                      <Badge variant={stage.overdueRatePercent > 15 ? 'danger' : 'success'}>
                        {stage.overdueRatePercent > 15 ? 'Bottleneck' : 'Healthy'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
