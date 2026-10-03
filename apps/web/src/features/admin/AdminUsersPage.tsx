import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Users, Shield, KeyRound, Check, X } from 'lucide-react';
import { PERMISSIONS, SYSTEM_ROLES } from '@claimboard/shared';

export function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [selectedRole, setSelectedRole] = useState('');

  const { data: users, isLoading } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload'),
  });

  const { data: roles } = useQuery({
    queryKey: ['team', 'roles'],
    queryFn: () => apiRequest<any[]>('/team/roles'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async () => {
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

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-400" />
          User Accounts & Granular RBAC Permissions
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Manage team member roles, permissions, and security policies.
        </p>
      </div>

      {/* Users Table */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200">Active Team Members</h3>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-zinc-500">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Role</th>
                  <th className="pb-3 font-semibold">Availability</th>
                  <th className="pb-3 font-semibold">Workload</th>
                  <th className="pb-3 font-semibold">Completed</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {users?.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-800/20 transition-colors">
                    <td className="py-3 font-medium text-zinc-200 flex items-center gap-2.5">
                      <img
                        src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=96'}
                        alt={u.displayName}
                        className="h-7 w-7 rounded-full object-cover border border-zinc-700"
                      />
                      <div>
                        <div>{u.displayName}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{u.email}</div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge variant="outline">{u.role}</Badge>
                    </td>
                    <td className="py-3 text-zinc-300">{u.availability}</td>
                    <td className="py-3">
                      <Badge variant={u.workload === 'Overloaded' ? 'danger' : 'default'}>{u.workload}</Badge>
                    </td>
                    <td className="py-3 font-mono text-zinc-300">{u.completedTasksCount}</td>
                    <td className="py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedRole(u.role);
                          setEditingUser(u);
                        }}
                      >
                        Change Role
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Granular Permission Matrix Reference (Specification #4) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-400" />
          System Permission Matrix
        </h3>
        <p className="text-xs text-zinc-400">
          Enforced strictly server-side on Fastify API routes. Never trusted from frontend client state.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono">
          {PERMISSIONS.map((perm) => (
            <div key={perm} className="p-2 rounded bg-zinc-950/60 border border-zinc-800 flex items-center gap-1.5 text-zinc-300">
              <Check className="h-3 w-3 text-emerald-400 shrink-0" />
              <span className="truncate">{perm}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Change Role Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="Change Member Role"
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
              <label className="block text-zinc-300 font-medium mb-1">Select System Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
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
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
