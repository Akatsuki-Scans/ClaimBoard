import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Link } from 'react-router-dom';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import {
  UserCheckIcon,
  ClockIcon,
  ArrowRightIcon,
  PlusIcon,
  AnalyticsIcon,
  CheckIcon,
  CloseIcon,
  AlertTriangleIcon,
} from '../../components/ui/icon';
import {
  AlertOctagon,
  ShieldAlert,
} from 'lucide-react';
import { SYSTEM_ROLES, SystemRole } from '@claimboard/shared';
import { UserAvatar } from '../../components/ui/Avatar';

export function AdminOverviewPage() {
  const queryClient = useQueryClient();
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<SystemRole>('Worker');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiRequest<any>('/analytics/overview'),
  });

  const { data: bottlenecks } = useQuery({
    queryKey: ['analytics', 'bottlenecks'],
    queryFn: () => apiRequest<any>('/analytics/bottlenecks'),
  });

  const { data: teamData } = useQuery<any>({
    queryKey: ['team', 'users'],
    queryFn: () => apiRequest<any>('/team/users'),
  });

  // 1-Click Approve Mutation directly on Overview page
  const approveMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role?: string }) => {
      return apiRequest(`/team/users/${userId}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
  });

  // Reject / Delete user mutation directly on Overview page
  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/team/users/${userId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
    },
  });

  // Create User Mutation directly on Overview page
  const createUserMutation = useMutation({
    mutationFn: async () => {
      setFormError(null);
      return apiRequest('/team/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername,
          displayName: newDisplayName,
          email: newEmail,
          role: newRole,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setIsAddUserOpen(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewEmail('');
      setNewRole('Worker');
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create member');
    },
  });

  const pendingUsers = teamData?.users?.filter((u: any) => !u.isApproved) || [];
  const approvedUsers = teamData?.users?.filter((u: any) => u.isApproved) || [];
  const stats = teamData?.stats || { total: 0, pending: 0, approved: 0 };

  if (isLoading) return <div className="p-12 text-center text-xs text-zinc-500">Loading operations center...</div>;

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <AnalyticsIcon className="h-4 w-4 text-zinc-400" />
            Operations center
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            User approvals, throughput velocity, stage delays, and team status
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsAddUserOpen(true)}
            className="h-8 gap-1.5"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add member
          </Button>
          <Link to="/admin/users">
            <Button size="sm" variant="secondary" className="h-8 gap-1.5">
              <UserCheckIcon className="h-3.5 w-3.5" />
              Manage users
            </Button>
          </Link>
        </div>
      </div>

      {/* User Approvals & Access Alert / Queue Card */}
      <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
        <div className="p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300">
              <UserCheckIcon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-zinc-100">User account approvals & team access</h2>
              <p className="text-[11px] text-zinc-400">
                Review pending applicant registrations and manage workspace roles
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-zinc-400">Total staff: <strong className="text-zinc-200">{stats.total}</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Approved: <strong className="text-emerald-400">{stats.approved}</strong></span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400">Pending: <strong className={stats.pending > 0 ? 'text-amber-400 font-bold' : 'text-zinc-400'}>{stats.pending}</strong></span>
            </div>

            <Link
              to="/admin/users"
              className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <span>Directory</span>
              <ArrowRightIcon className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Pending Users Queue Table */}
        {pendingUsers.length > 0 ? (
          <div className="divide-y divide-zinc-800/80">
            <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <ClockIcon className="h-3.5 w-3.5 text-amber-400" />
                {pendingUsers.length} applicant{pendingUsers.length > 1 ? 's' : ''} awaiting administrator approval
              </span>
              <Link to="/admin/users" className="text-[11px] underline hover:text-amber-200">
                View all in user manager
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[11px] font-medium text-zinc-400 bg-zinc-900/40 border-b border-zinc-800/80">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Applicant</th>
                    <th className="py-2.5 px-4 font-semibold">Discord username</th>
                    <th className="py-2.5 px-4 font-semibold">Role</th>
                    <th className="py-2.5 px-4 font-semibold">Applied</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Quick action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {pendingUsers.slice(0, 5).map((applicant: any) => (
                    <tr key={applicant.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-zinc-200">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={applicant.avatarUrl} name={applicant.displayName} size="md" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-100 truncate">{applicant.displayName}</div>
                            <div className="text-[10px] text-zinc-500 font-mono truncate">@{applicant.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-300">
                        {applicant.discordUsername ? (
                          <span className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 text-[11px]">
                            {applicant.discordUsername}
                          </span>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <Badge variant="outline">{applicant.role}</Badge>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-400 text-[11px]">
                        {applicant.createdAt ? new Date(applicant.createdAt).toLocaleDateString() : 'Recent'}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="primary"
                            className="h-7 text-xs px-2.5 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                            isLoading={approveMutation.isPending}
                            onClick={() => approveMutation.mutate({ userId: applicant.id, role: applicant.role })}
                          >
                            <CheckIcon className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-zinc-800"
                            onClick={() => deleteMutation.mutate(applicant.id)}
                            title="Reject applicant"
                          >
                            <CloseIcon className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-4 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-emerald-400" />
              <span>All team registrations approved. No pending authorization requests.</span>
            </div>
            <Link
              to="/admin/users"
              className="text-xs text-zinc-300 hover:text-white font-medium underline transition-colors"
            >
              Open user directory & permissions →
            </Link>
          </div>
        )}
      </div>

      {/* Primary Bottleneck Notice */}
      {bottlenecks?.primaryBottleneck && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-start gap-3.5">
          <AlertOctagon className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-amber-300">
              Production bottleneck: {bottlenecks.primaryBottleneck.workTypeName} ({bottlenecks.primaryBottleneck.workTypeCode})
            </div>
            <div className="text-zinc-300 leading-relaxed">
              Tasks in this stage experience an average waiting time of{' '}
              <strong className="text-white font-mono">{bottlenecks.primaryBottleneck.averageWaitingHours}h</strong> with an overdue rate of{' '}
              <strong className="text-white font-mono">{bottlenecks.primaryBottleneck.overdueRatePercent}%</strong>.
            </div>
          </div>
        </div>
      )}

      {/* Metric Cards: Clean numbers with tabular figures and spring hover feedback */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">Active series</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.activeMangaCount || 0}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">Open slots</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.openAssignmentsCount || 0}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">Active claims</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.activeClaimsCount || 0}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">Overdue tasks</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.overdueTasksCount || 0}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">In QC review</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.pendingReviewsCount || 0}
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -2, borderColor: '#3f3f46' }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 shadow-sm transition-colors"
        >
          <div className="text-[11px] text-zinc-400 font-medium">Done this week</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-zinc-100 mt-1">
            {analytics?.completedThisWeek || 0}
          </div>
        </motion.div>
      </div>

      {/* Throughput Chart and Workload Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Production Throughput Chart */}
        <div className="lg:col-span-2 rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <h3 className="text-xs font-semibold text-zinc-100">Daily production throughput</h3>
            <span className="text-[11px] text-zinc-500 font-mono">Last 7 days (completed vs target)</span>
          </div>

          {!analytics?.throughput || analytics.throughput.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
              No daily production throughput logged yet
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.throughput}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2229" vertical={false} />
                  <XAxis dataKey="name" stroke="#71717a" fontSize={11} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={11} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111215',
                      borderColor: '#27272a',
                      fontSize: '11px',
                      borderRadius: '8px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Bar dataKey="completed" fill="#d4d4d8" radius={[4, 4, 0, 0]} name="Completed" />
                  <Bar dataKey="target" fill="#27272a" radius={[4, 4, 0, 0]} name="Target" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Work Type Distribution */}
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4 shadow-sm">
          <div className="pb-3 border-b border-zinc-800/80">
            <h3 className="text-xs font-semibold text-zinc-100">Work type task breakdown</h3>
          </div>

          {!analytics?.workTypeDistribution || analytics.workTypeDistribution.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
              No task distributions recorded yet
            </div>
          ) : (
            <div className="space-y-3">
              {analytics.workTypeDistribution.map((wt: any) => (
                <div key={wt.code} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium">{wt.name}</span>
                    <span className="text-zinc-500 font-mono tabular-nums">{wt.count} tasks</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-zinc-300"
                      style={{
                        width: `${Math.min(100, (wt.count || 1) * 15)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="Add team member"
        description="Directly create an approved team account with role privileges"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUserMutation.mutate();
          }}
          className="space-y-3.5 text-xs"
        >
          {formError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Display name</label>
            <Input
              value={newDisplayName}
              onChange={(e) => {
                setNewDisplayName(e.target.value);
                if (!newUsername) {
                  setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                }
              }}
              placeholder="e.g. Kenji Sato"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Username handle</label>
            <Input
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              placeholder="e.g. kenji_sato"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Email address</label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="kenji@scanlation.dev"
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">System role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as SystemRole)}
              className="w-full bg-[#111215] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
            >
              {SYSTEM_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddUserOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createUserMutation.isPending}>
              Create member
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
