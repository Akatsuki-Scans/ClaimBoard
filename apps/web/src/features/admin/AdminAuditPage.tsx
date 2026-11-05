import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { ShieldIcon, FilterIcon } from '../../components/ui/icon';

export function AdminAuditPage() {
  const [entityFilter, setEntityFilter] = useState('All');

  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit', entityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (entityFilter !== 'All') params.set('entity', entityFilter);
      return apiRequest<any[]>(`/audit?${params.toString()}`);
    },
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <ShieldIcon className="h-4 w-4 text-zinc-400" />
            Audit Log Trace
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Immutable system audit trail of administrative actions, claim reassignments, and state modifications
          </p>
        </div>

        <div className="flex items-center gap-2">
          <FilterIcon className="h-3.5 w-3.5 text-zinc-500" />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="bg-[#111215] border border-zinc-800 text-zinc-200 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-zinc-700"
          >
            <option value="All">All entities</option>
            <option value="WorkAssignment">Work assignments</option>
            <option value="Manga">Manga series</option>
            <option value="Chapter">Chapters</option>
            <option value="User">Users</option>
            <option value="DiscordChannel">Discord channels</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading audit records...</div>
      ) : logs?.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-12 text-center text-xs text-zinc-500">
          No audit records found matching this filter
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] divide-y divide-zinc-800/80 overflow-hidden text-xs shadow-sm">
          {logs?.map((log: any) => (
            <div key={log.id} className="p-3.5 space-y-1.5 hover:bg-zinc-800/20 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-medium text-zinc-200">{log.actorName}</span>
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="font-mono text-zinc-400 text-[11px]">{log.entity}</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>

              {log.after && (
                <div className="rounded-lg bg-[#090a0b] p-2.5 font-mono text-[10px] text-zinc-400 overflow-x-auto border border-zinc-800/60 leading-relaxed">
                  {JSON.stringify(log.after, null, 2)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
