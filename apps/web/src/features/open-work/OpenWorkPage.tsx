import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  Briefcase,
  Lock,
  Clock,
  Search,
  List as ListIcon,
  Kanban as KanbanIcon,
} from 'lucide-react';

export function OpenWorkPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManga, setSelectedManga] = useState('All');
  const [selectedWorkType, setSelectedWorkType] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Claim modal state
  const [claimingAssignment, setClaimingAssignment] = useState<any | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Queries from MongoDB API
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', 'all'],
    queryFn: () => apiRequest<any[]>('/assignments').catch(() => []),
  });

  const { data: mangas } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga').catch(() => []),
  });

  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types').catch(() => []),
  });

  // Claim Mutation
  const claimMutation = useMutation({
    mutationFn: async (assignmentId: string) => {
      setClaimError(null);
      return apiRequest('/claims', {
        method: 'POST',
        body: JSON.stringify({ assignmentId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      setClaimingAssignment(null);
    },
    onError: (err: ApiError) => {
      setClaimError(err.message || 'Failed to claim work.');
    },
  });

  const handleOpenClaimModal = (assignment: any) => {
    setClaimError(null);
    setClaimingAssignment(assignment);
  };

  // Filter tasks based on search and filters
  const filteredTasks = (assignments || []).filter((task) => {
    if (selectedManga !== 'All' && task.mangaId !== selectedManga) return false;
    if (selectedWorkType !== 'All' && task.workTypeId !== selectedWorkType) return false;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = (task.manga?.title || task.mangaTitle || '').toLowerCase();
      const ch = (task.chapter?.chapterNumber || task.chapterNumber || '').toString();
      if (!title.includes(q) && !ch.includes(q)) return false;
    }
    return true;
  });

  // Group real tasks into 4 Kanban columns
  const openTasks = filteredTasks.filter((t) => t.status === 'OPEN' && !t.isBlocked);
  const claimedTasks = filteredTasks.filter((t) => t.status === 'CLAIMED' || t.status === 'ACTIVE');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'SUBMITTED');
  const blockedTasks = filteredTasks.filter((t) => t.isBlocked);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            Open Work Board
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Browse and claim available tasks
          </p>
        </div>

        {/* Filter bar and view switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 w-44"
            />
          </div>

          <select
            value={selectedManga}
            onChange={(e) => setSelectedManga(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="All">All Manga</option>
            {mangas?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          <select
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="All">All Types</option>
            {workTypes?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-200 focus:outline-none"
          >
            <option value="All">Priority</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
          </select>

          <div className="flex items-center rounded-lg border border-zinc-700/80 bg-zinc-900 p-0.5 ml-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="List View"
            >
              <ListIcon className="h-3.5 w-3.5" />
              <span className="text-[11px] hidden sm:inline">List</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                viewMode === 'kanban' ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Kanban View"
            >
              <KanbanIcon className="h-3.5 w-3.5" />
              <span className="text-[11px] hidden sm:inline">Kanban</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-COLUMN KANBAN BOARD */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {/* Column 1: Open */}
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Open
              </span>
              <span className="text-[11px] font-mono text-zinc-500">{openTasks.length}</span>
            </div>

            <div className="space-y-2.5">
              {openTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">No open tasks</div>
              ) : (
                openTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 transition-all space-y-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {card.manga?.title || card.mangaTitle} #{card.chapter?.chapterNumber || card.chapterNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{card.workType?.name || card.workTypeName}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <Badge variant={card.priority === 'Urgent' ? 'danger' : 'warning'}>{card.priority}</Badge>
                      <span className="text-zinc-400 text-[10px]">
                        {card.deadline ? new Date(card.deadline).toLocaleDateString() : 'No deadline'}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full text-xs h-7"
                      onClick={() => handleOpenClaimModal(card)}
                    >
                      Claim
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Claimed */}
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-500" />
                Claimed
              </span>
              <span className="text-[11px] font-mono text-zinc-500">{claimedTasks.length}</span>
            </div>

            <div className="space-y-2.5">
              {claimedTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">No claimed tasks</div>
              ) : (
                claimedTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 transition-all space-y-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {card.manga?.title || card.mangaTitle} #{card.chapter?.chapterNumber || card.chapterNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{card.workType?.name || card.workTypeName}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-zinc-400 text-[11px]">{card.assignedWorkerName || 'Claimed'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: In Progress */}
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                In Progress
              </span>
              <span className="text-[11px] font-mono text-zinc-500">{inProgressTasks.length}</span>
            </div>

            <div className="space-y-2.5">
              {inProgressTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">No tasks in progress</div>
              ) : (
                inProgressTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/70 hover:border-zinc-700 transition-all space-y-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {card.manga?.title || card.mangaTitle} #{card.chapter?.chapterNumber || card.chapterNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{card.workType?.name || card.workTypeName}</div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="text-indigo-400 font-medium text-[11px]">{card.assignedWorkerName}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 4: Blocked */}
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-zinc-300 pb-2 border-b border-zinc-800">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                Blocked
              </span>
              <span className="text-[11px] font-mono text-zinc-500">{blockedTasks.length}</span>
            </div>

            <div className="space-y-2.5">
              {blockedTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">No blocked tasks</div>
              ) : (
                blockedTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-900/40 space-y-2.5 opacity-80"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-300 truncate">
                        {card.manga?.title || card.mangaTitle} #{card.chapter?.chapterNumber || card.chapterNumber}
                      </div>
                      <div className="text-[11px] text-zinc-400">{card.workType?.name || card.workTypeName}</div>
                    </div>

                    <div className="text-[10px] text-rose-400 flex items-center gap-1">
                      <Lock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{card.blockedReason || 'Blocked by previous stage'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden divide-y divide-zinc-800">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">No tasks found.</div>
          ) : (
            filteredTasks.map((card) => (
              <div
                key={card.id}
                className="p-3.5 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-white">
                    {card.manga?.title || card.mangaTitle} #{card.chapter?.chapterNumber || card.chapterNumber}
                  </div>
                  <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                    <span className="text-indigo-400">{card.workType?.name || card.workTypeName}</span>
                    <span>•</span>
                    <span>{card.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={card.priority === 'Urgent' ? 'danger' : 'outline'}>{card.priority}</Badge>
                  {card.status === 'OPEN' && !card.isBlocked ? (
                    <Button
                      size="sm"
                      variant="primary"
                      className="h-7 text-xs"
                      onClick={() => handleOpenClaimModal(card)}
                    >
                      Claim
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Claim Confirmation Modal */}
      {claimingAssignment && (
        <Modal
          isOpen={true}
          onClose={() => setClaimingAssignment(null)}
          title="Claim Task Confirmation"
        >
          <div className="space-y-4">
            <p className="text-xs text-zinc-300">
              Are you ready to claim this task?
            </p>

            {claimError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-800/60 text-rose-300 text-xs">
                {claimError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setClaimingAssignment(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  if (claimingAssignment) {
                    claimMutation.mutate(claimingAssignment.id);
                  }
                }}
                isLoading={claimMutation.isPending}
              >
                Confirm Claim
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
