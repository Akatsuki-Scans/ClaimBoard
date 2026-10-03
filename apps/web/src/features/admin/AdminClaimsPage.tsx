import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Bookmark, UserCheck, XCircle, ExternalLink, ShieldCheck, Clock } from 'lucide-react';

export function AdminClaimsPage() {
  const queryClient = useQueryClient();
  const [reassigningTask, setReassigningTask] = useState<any | null>(null);
  const [newWorkerId, setNewWorkerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', 'claims-management'],
    queryFn: () => apiRequest<any[]>('/assignments'),
  });

  const { data: workers } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload'),
  });

  // Reassign mutation (creates audit log)
  const reassignMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/claims/reassign', {
        method: 'POST',
        body: JSON.stringify({
          assignmentId: reassigningTask.id,
          newWorkerId,
          reason: reassignReason || 'Reassigned by Administrator',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      setReassigningTask(null);
      setNewWorkerId('');
      setReassignReason('');
    },
  });

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Bookmark className="h-5 w-5 text-indigo-400" />
          Claims & Deliverables Inspection
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Inspect deliverables, reallocate workers with audit logging, and oversee submissions.
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading claims...</div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden">
          {assignments?.map((a: any) => (
            <div key={a.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-sm text-zinc-100">{a.mangaId?.title}</span>
                  <span className="text-xs text-zinc-400 font-mono">Ch. {a.chapterId?.chapterNumber}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium"
                    style={{ backgroundColor: `${a.workType?.color}20`, color: a.workType?.color }}
                  >
                    {a.workType?.name}
                  </span>
                  <Badge variant={a.status === 'COMPLETED' ? 'success' : a.status === 'OPEN' ? 'default' : 'info'}>
                    {a.status}
                  </Badge>
                </div>
                <div className="text-[11px] text-zinc-500">
                  Worker: <strong className="text-zinc-300">{a.assignedWorkerName || 'Open Slot'}</strong>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setReassigningTask(a)}>
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  Reassign
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reassign Worker Modal */}
      <Modal
        isOpen={!!reassigningTask}
        onClose={() => setReassigningTask(null)}
        title="Reassign Production Slot"
        description="Reassigning overrides current claims and logs a permanent audit entry."
      >
        {reassigningTask && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              reassignMutation.mutate();
            }}
            className="space-y-3.5 text-xs"
          >
            <div>
              <label className="block text-zinc-300 font-medium mb-1">New Worker</label>
              <select
                value={newWorkerId}
                onChange={(e) => setNewWorkerId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                required
              >
                <option value="">Select Worker</option>
                {workers?.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.displayName} ({w.role} • {w.activeClaimsCount} active)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Reason for Reassignment</label>
              <Input
                type="text"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="e.g. Inactive worker, deadline acceleration"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setReassigningTask(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={reassignMutation.isPending}>
                Execute Reassignment
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
