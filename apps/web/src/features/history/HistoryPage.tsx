import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { History, CheckCircle2, Clock } from 'lucide-react';

export function HistoryPage() {
  const { data: claims, isLoading } = useQuery({
    queryKey: ['claims', 'history'],
    queryFn: () => apiRequest<any[]>('/claims/my?filter=Completed'),
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <History className="h-5 w-5 text-indigo-400" />
          Production History & Archive
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Archive of completed deliverables, past releases, and verified production slots.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading history...</div>
      ) : claims?.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <History className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-200">No completed tasks yet</h3>
          <p className="text-xs text-zinc-500 mt-1">Completed production assignments will appear here.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden">
          {claims?.map((claim) => (
            <div key={claim.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold text-sm text-zinc-100">{claim.mangaTitle}</span>
                  <span className="text-xs text-zinc-400 font-mono">Ch. {claim.chapterNumber}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[11px] font-mono"
                    style={{ backgroundColor: `${claim.workTypeColor}20`, color: claim.workTypeColor }}
                  >
                    {claim.workTypeName}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Worker: {claim.workerName} • Completed on {new Date(claim.claimedAt).toLocaleDateString()}
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
