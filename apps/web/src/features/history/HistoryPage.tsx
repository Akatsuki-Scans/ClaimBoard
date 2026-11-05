import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { HistoryIcon, CheckCircleIcon } from '../../components/ui/icon';

export function HistoryPage() {
  const { data: claims, isLoading } = useQuery({
    queryKey: ['claims', 'history'],
    queryFn: () => apiRequest<any[]>('/claims/my?filter=Completed'),
  });

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-zinc-400" />
            Production Archive
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Log of completed deliverables, past releases, and verified production slots
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading history...</div>
      ) : claims?.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-12 text-center">
          <HistoryIcon className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-zinc-200">No completed tasks yet</h3>
          <p className="text-xs text-zinc-500 mt-1">Completed production assignments will appear here once verified.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] divide-y divide-zinc-800/80 overflow-hidden">
          {claims?.map((claim) => (
            <div key={claim.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium text-xs text-zinc-100">{claim.mangaTitle}</span>
                  <span className="text-xs text-zinc-400 font-mono">Ch. {claim.chapterNumber}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                    {claim.workTypeName}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">
                  Worker: {claim.workerName} • Completed {claim.claimedAt ? new Date(claim.claimedAt).toLocaleDateString() : 'recently'}
                </div>
              </div>
              <Badge variant="success">Completed</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
