import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { MyClaimsIcon, UserCheckIcon } from '../../components/ui/icon';

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
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <MyClaimsIcon className="h-4 w-4 text-zinc-400" />
            Claims Oversight
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Inspect active claims, reallocate workers with audit logging, and oversee slot releases
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading claims...</div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] divide-y divide-zinc-800/80 overflow-hidden shadow-sm">
          {assignments?.length === 0 ? (
            <div className="p-12 text-center text-xs text-zinc-500">
              No task assignments created yet
            </div>
          ) : (
            assignments?.map((a: any) => (
              <div key={a.id} className="p-3.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-medium text-xs text-zinc-100">{a.mangaId?.title || 'Series'}</span>
                    <span className="text-xs text-zinc-400 font-mono">Ch. {a.chapterId?.chapterNumber}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                      {a.workType?.name}
                    </span>
                    <Badge variant={a.status === 'COMPLETED' ? 'success' : a.status === 'OPEN' ? 'default' : 'info'}>
                      {a.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono">
                    Assigned staff: <strong className="text-zinc-300 font-normal">{a.assignedWorkerName || 'Open for claim'}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setReassigningTask(a)}>
                    <UserCheckIcon className="h-3.5 w-3.5 mr-1 text-zinc-400" />
                    Reassign
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Reassign Worker Modal */}
      <Modal
        isOpen={!!reassigningTask}
        onClose={() => setReassigningTask(null)}
        title="Reassign Production Slot"
        description="Reassigning overrides current claim status and logs an immutable audit entry."
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
                className="w-full bg-[#121317] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
                required
              >
                <option value="">Select worker</option>
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
