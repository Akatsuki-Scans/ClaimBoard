import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { ShieldCheck, Filter, Calendar } from 'lucide-react';

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
            Audit Log Viewer
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Immutable system trace of all administrative, assignment, claim, and configuration operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-zinc-400" />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-indigo-500"
          >
            <option value="All">All Entities</option>
            <option value="WorkAssignment">WorkAssignment</option>
            <option value="Manga">Manga</option>
            <option value="Chapter">Chapter</option>
            <option value="User">User</option>
            <option value="DiscordChannel">DiscordChannel</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading audit records...</div>
      ) : logs?.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-12 text-center text-xs text-zinc-500">
          No audit records found.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden text-xs">
          {logs?.map((log: any) => (
            <div key={log.id} className="p-4 space-y-1.5 hover:bg-zinc-800/20 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-zinc-200">{log.actorName}</span>
                  <Badge variant="outline">{log.action}</Badge>
                  <span className="font-mono text-zinc-400 text-[11px]">{log.entity}</span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </div>
              </div>

              {log.after && (
                <div className="rounded bg-zinc-950/80 p-2 font-mono text-[10px] text-zinc-400 overflow-x-auto border border-zinc-800/60">
                  {JSON.stringify(log.after)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
