import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { motion } from 'framer-motion';
import {
  TeamIcon,
  UserCheckIcon,
  ClockIcon,
  ShieldIcon,
  SearchIcon,
  PlusIcon,
  CheckIcon,
  CloseIcon,
} from '../../components/ui/icon';
import {
  Trash2,
  KeyRound,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { UserAvatar } from '../../components/ui/Avatar';
import { PERMISSIONS, SYSTEM_ROLES, SystemRole } from '@claimboard/shared';

interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string;
  discordId: string;
  discordUsername: string;
  role: string;
  availability: string;
  workload: string;
  activeClaimsCount: number;
  completedTasksCount: number;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface UserResponse {
  users: UserRecord[];
  stats: {
    total: number;
    pending: number;
    approved: number;
  };
}

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'approved' | 'pending' | 'permissions'>('approved');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('Worker');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);

  // Form state for adding user
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<SystemRole>('Worker');
  const [newDiscordTag, setNewDiscordTag] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch users with approval status
  const { data, isLoading } = useQuery<UserResponse>({
    queryKey: ['team', 'users', searchQuery],
    queryFn: () =>
      apiRequest<UserResponse>(`/team/users${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`),
  });

  const users = data?.users || [];
  const stats = data?.stats || { total: 0, pending: 0, approved: 0 };

  const approvedUsers = users.filter((u) => u.isApproved);
  const pendingUsers = users.filter((u) => !u.isApproved);

  // 1-Click Approve Mutation
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

  // Change Role Mutation
  const updateRoleMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      return apiRequest(`/team/users/${editingUser.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: selectedRole }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setEditingUser(null);
    },
  });

  // Create User Mutation
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
          discordUsername: newDiscordTag,
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
      setNewDiscordTag('');
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create user');
    },
  });

  // Delete User Mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/team/users/${userId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setUserToDelete(null);
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <TeamIcon className="h-4 w-4 text-zinc-400" />
            Team members & user approvals
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Approve pending worker accounts, manage roles, and review security policies
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsAddUserOpen(true)}
            className="h-8 gap-1.5"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add member
          </Button>
        </div>
      </div>

      {/* Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Segmented Tab Controls */}
        <div className="flex items-center gap-1 bg-[#111215] border border-zinc-800 p-1 rounded-lg text-xs w-fit relative">
          <button
            onClick={() => setActiveTab('approved')}
            className={`relative px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors z-10 ${
              activeTab === 'approved' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {activeTab === 'approved' && (
              <motion.div
                layoutId="adminUsersTabPill"
                className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <UserCheckIcon className="h-3.5 w-3.5" />
            <span>Approved members</span>
            <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded bg-zinc-700/50 text-zinc-300">
              {stats.approved}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('pending')}
            className={`relative px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors z-10 ${
              activeTab === 'pending' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {activeTab === 'pending' && (
              <motion.div
                layoutId="adminUsersTabPill"
                className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <ClockIcon className="h-3.5 w-3.5 text-amber-400" />
            <span>Pending approvals</span>
            {stats.pending > 0 ? (
              <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                {stats.pending}
              </span>
            ) : (
              <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded bg-zinc-700/50 text-zinc-400">
                0
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('permissions')}
            className={`relative px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors z-10 ${
              activeTab === 'permissions' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {activeTab === 'permissions' && (
              <motion.div
                layoutId="adminUsersTabPill"
                className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            <ShieldIcon className="h-3.5 w-3.5" />
            <span>Permissions</span>
          </button>
        </div>

        {/* Search Field (for approved and pending tabs) */}
        {activeTab !== 'permissions' && (
          <div className="relative w-full sm:w-64">
            <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Search member or Discord..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
            />
          </div>
        )}
      </div>

      {/* Tab 1: Approved Members Directory */}
      {activeTab === 'approved' && (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-zinc-500 font-mono">Loading user directory...</div>
          ) : approvedUsers.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              No approved team members match your filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-900/30">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Member</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold">Availability</th>
                    <th className="py-3 px-4 font-semibold">Workload</th>
                    <th className="py-3 px-4 font-semibold">Tasks done</th>
                    <th className="py-3 px-4 font-semibold">Approved by</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {approvedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-200">
                        <Link
                          to={`/user/${encodeURIComponent(u.displayName || u.username)}`}
                          className="flex items-center gap-2.5 group hover:opacity-90 transition-opacity"
                        >
                          <UserAvatar src={u.avatarUrl} name={u.displayName} size="md" />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors truncate">
                              {u.displayName}
                            </div>
                            <div className="text-[10px] text-zinc-500 font-mono truncate">
                              @{u.username} {u.discordUsername ? `• ${u.discordUsername}` : ''}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline">{u.role}</Badge>
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              u.availability === 'Available'
                                ? 'bg-emerald-400'
                                : u.availability === 'Busy'
                                ? 'bg-amber-400'
                                : 'bg-zinc-500'
                            }`}
                          />
                          {u.availability}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={u.workload === 'Overloaded' ? 'danger' : 'default'}>{u.workload}</Badge>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-zinc-300">
                        {u.completedTasksCount}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-[11px]">
                        <div>{u.approvedBy || 'Initial setup'}</div>
                        {u.approvedAt && (
                          <div className="text-[10px] text-zinc-500 font-mono">
                            {new Date(u.approvedAt).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-7 text-xs px-2.5"
                            onClick={() => {
                              setSelectedRole(u.role);
                              setEditingUser(u);
                            }}
                          >
                            Edit role
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                            onClick={() => setUserToDelete(u)}
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pending User Approvals */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200">Pending worker applications</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Users who registered via Discord OAuth or sign-in link awaiting workspace clearance
                </p>
              </div>
              <span className="font-mono text-xs text-zinc-400">
                {pendingUsers.length} awaiting approval
              </span>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-xs text-zinc-500 font-mono">Loading pending list...</div>
            ) : pendingUsers.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <CheckIcon className="h-7 w-7 text-emerald-400 mx-auto" />
                <div className="text-xs font-medium text-zinc-200">All users approved</div>
                <p className="text-[11px] text-zinc-500">
                  There are no pending account approval requests at this moment.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-zinc-800 text-[11px] font-medium text-zinc-400 bg-zinc-900/30">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Applicant</th>
                      <th className="py-3 px-4 font-semibold">Discord account</th>
                      <th className="py-3 px-4 font-semibold">Requested role</th>
                      <th className="py-3 px-4 font-semibold">Applied on</th>
                      <th className="py-3 px-4 font-semibold text-right">Approval action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {pendingUsers.map((applicant) => (
                      <tr key={applicant.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-zinc-200">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar src={applicant.avatarUrl} name={applicant.displayName} size="md" />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-zinc-100 truncate">{applicant.displayName}</div>
                              <div className="text-[10px] text-zinc-500 font-mono truncate">
                                @{applicant.username} {applicant.email ? `• ${applicant.email}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">
                          {applicant.discordUsername ? (
                            <span className="text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 text-[11px]">
                              {applicant.discordUsername}
                            </span>
                          ) : (
                            <span className="text-zinc-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="outline">{applicant.role}</Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-400 text-[11px]">
                          {applicant.createdAt
                            ? new Date(applicant.createdAt).toLocaleDateString()
                            : 'Recent'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="primary"
                              className="h-7 text-xs px-3 gap-1 bg-emerald-600 hover:bg-emerald-500 text-white border-transparent"
                              isLoading={approveMutation.isPending}
                              onClick={() => approveMutation.mutate({ userId: applicant.id, role: applicant.role })}
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-7 text-xs px-2.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-zinc-800"
                              onClick={() => setUserToDelete(applicant)}
                            >
                              <CloseIcon className="h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: System Permission Matrix */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-zinc-400" />
                Granular permission matrix
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Role capabilities are verified server-side on Fastify API routes. Never trusted from frontend client state.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
              {PERMISSIONS.map((perm) => (
                <div
                  key={perm}
                  className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center gap-2 text-zinc-300"
                >
                  <CheckIcon className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="truncate">{perm}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{formError}</span>
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

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Discord tag or ID (optional)</label>
            <Input
              value={newDiscordTag}
              onChange={(e) => setNewDiscordTag(e.target.value)}
              placeholder="e.g. kenji#1234 or 948102948201928"
            />
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

      {/* Change Role Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Change member role"
        description={`Modify role and permission capabilities for ${editingUser?.displayName}`}
      >
        {editingUser && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateRoleMutation.mutate();
            }}
            className="space-y-3.5 text-xs"
          >
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Select system role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
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
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={updateRoleMutation.isPending}>
                Save changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete / Reject Confirmation Modal */}
      <Modal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title={userToDelete?.isApproved ? 'Remove member' : 'Reject registration'}
        description={`Are you sure you want to remove ${userToDelete?.displayName} (@${userToDelete?.username})?`}
      >
        {userToDelete && (
          <div className="space-y-4 text-xs">
            <p className="text-zinc-400">
              {userToDelete.isApproved
                ? 'This user will be permanently removed from the workspace and their active login sessions terminated.'
                : 'This pending application will be rejected and removed.'}
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setUserToDelete(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                isLoading={deleteUserMutation.isPending}
                onClick={() => deleteUserMutation.mutate(userToDelete.id)}
              >
                Confirm removal
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
