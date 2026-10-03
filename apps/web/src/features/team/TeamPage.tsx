import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Users } from 'lucide-react';

export function TeamPage() {
  const [subTab, setSubTab] = useState<'members' | 'workload'>('members');

  const { data: teamData, isLoading } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload').catch(() => []),
  });

  const members = teamData || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white">Team</h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Scanlation team members, active assignments, and real-time status
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setSubTab('members')}
            className={`px-3 py-1 rounded-md transition-colors ${
              subTab === 'members' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Members
          </button>
          <button
            onClick={() => setSubTab('workload')}
            className={`px-3 py-1 rounded-md transition-colors ${
              subTab === 'workload' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Workload
          </button>
        </div>
      </div>

      {/* Members Table */}
      {subTab === 'members' ? (
        <div className="rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Active Tasks</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-xs text-zinc-500">
                      No team members found in database. Sign in with Discord to register new members.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={m.avatarUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96'}
                            alt={m.displayName}
                            className="h-8 w-8 rounded-full object-cover border border-zinc-700 shrink-0"
                          />
                          <span className="font-semibold text-zinc-100">{m.displayName}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">{m.role}</td>
                      <td className="py-3.5 px-4 font-mono text-zinc-300">{m.activeClaimsCount || 0} active</td>
                      <td className="py-3.5 px-4 text-right">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.length === 0 ? (
            <div className="col-span-full p-12 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
              No team members in database yet.
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-3.5"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={m.avatarUrl || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=96'}
                    alt={m.displayName}
                    className="h-10 w-10 rounded-full object-cover border border-zinc-700"
                  />
                  <div>
                    <div className="font-semibold text-sm text-white">{m.displayName}</div>
                    <div className="text-xs text-zinc-400">{m.role}</div>
                  </div>
                </div>

                <div className="text-xs text-zinc-400">
                  Active Claims: <span className="font-mono text-zinc-200 font-medium">{m.activeClaimsCount || 0}</span>
                </div>

                <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Avg: {m.averageCompletionHours || 0}h</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/50">
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
