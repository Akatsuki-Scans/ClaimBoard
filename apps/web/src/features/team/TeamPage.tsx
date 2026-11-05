import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { UserAvatar } from '../../components/ui/Avatar';

export function TeamPage() {
  const [subTab, setSubTab] = useState<'members' | 'workload'>('members');

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload').catch(() => []),
  });

  const members = teamData || [];

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Team & Staff</h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Scanlation staff directory, active production workload, and availability
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-[#111215] border border-zinc-800 p-0.5 rounded-lg text-xs relative">
          <button
            onClick={() => setSubTab('members')}
            className={`relative px-3 py-1 rounded-md transition-colors z-10 ${
              subTab === 'members' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {subTab === 'members' && (
              <motion.div
                layoutId="teamSubTabPill"
                className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            Directory
          </button>
          <button
            onClick={() => setSubTab('workload')}
            className={`relative px-3 py-1 rounded-md transition-colors z-10 ${
              subTab === 'workload' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {subTab === 'workload' && (
              <motion.div
                layoutId="teamSubTabPill"
                className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              />
            )}
            Workload
          </button>
        </div>
      </div>

      {/* Members Table */}
      {subTab === 'members' ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Staff member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Active slots</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs text-zinc-500">
                      Loading staff directory...
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs text-zinc-500">
                      No staff registered in the workspace yet
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar src={m.avatarUrl} name={m.displayName} size="md" />
                          <span className="font-medium text-zinc-100">{m.displayName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-300 capitalize">{m.role}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-zinc-300">
                        {m.activeClaimsCount || 0} active
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${
                            m.availability === 'Working' || m.availability === 'Available'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : m.availability === 'Away'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                          }`}
                        >
                          <span className="h-1 w-1 rounded-full bg-current mr-1.5" />
                          {m.availability || 'Available'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Workload Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.length === 0 ? (
            <div className="col-span-full p-12 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
              No staff members registered yet
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-zinc-800 bg-[#111215] p-4 space-y-3 transition-colors hover:border-zinc-700/80 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <UserAvatar src={m.avatarUrl} name={m.displayName} size="lg" />
                  <div className="min-w-0">
                    <div className="font-medium text-xs text-zinc-100 truncate">{m.displayName}</div>
                    <div className="text-[10px] text-zinc-400 capitalize">{m.role}</div>
                  </div>
                </div>

                <div className="text-xs text-zinc-400 font-mono">
                  Active assignments: <span className="text-zinc-200 tabular-nums">{m.activeClaimsCount || 0}</span>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-500">Turnaround: {m.averageCompletionHours || 24}h avg</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      m.availability === 'Working' || m.availability === 'Available'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : m.availability === 'Away'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                    }`}
                  >
                    {m.availability || 'Available'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
