import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, ApiError } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import {
  SearchIcon,
  ClockIcon,
  CheckIcon,
  MangaIcon,
  FilterIcon,
} from '../../components/ui/icon';
import {
  Lock,
  List as ListIcon,
  Kanban as KanbanIcon,
} from 'lucide-react';

export function OpenWorkPage() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedManga, setSelectedManga] = useState('All');
  const [selectedWorkType, setSelectedWorkType] = useState('All');
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Claim modal state
  const [claimingAssignment, setClaimingAssignment] = useState<any | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Queries from API
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

  // Robust field extractors ensuring title, chapter and work type are always visible
  const getMangaTitle = (task: any): string => {
    if (!task) return 'Unknown series';
    if (task.manga?.title) return task.manga.title;
    if (task.mangaTitle) return task.mangaTitle;
    if (typeof task.mangaId === 'object' && task.mangaId?.title) return task.mangaId.title;
    const mId = typeof task.mangaId === 'object' ? (task.mangaId?._id || task.mangaId?.id) : task.mangaId;
    if (mId && mangas) {
      const found = mangas.find((m: any) => String(m.id || m._id) === String(mId));
      if (found?.title) return found.title;
    }
    return 'Unknown series';
  };

  const getChapterNumber = (task: any): string | number => {
    if (!task) return '—';
    if (task.chapter?.chapterNumber !== undefined) return task.chapter.chapterNumber;
    if (task.chapterNumber !== undefined) return task.chapterNumber;
    if (typeof task.chapterId === 'object' && task.chapterId?.chapterNumber !== undefined) {
      return task.chapterId.chapterNumber;
    }
    return '1';
  };

  const getWorkTypeName = (task: any): string => {
    if (!task) return 'Task';
    if (task.workType?.name) return task.workType.name;
    if (task.workTypeName) return task.workTypeName;
    if (typeof task.workTypeId === 'object' && task.workTypeId?.name) return task.workTypeId.name;
    const found = workTypes?.find((w: any) => w.id === task.workTypeId || w._id === task.workTypeId);
    if (found?.name) return found.name;
    return 'Task';
  };

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
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
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
    const rawMangaId = typeof task.mangaId === 'object' ? (task.mangaId?._id || task.mangaId?.id) : task.mangaId;
    const rawWorkTypeId = typeof task.workTypeId === 'object' ? (task.workTypeId?._id || task.workTypeId?.id) : task.workTypeId;

    if (selectedManga !== 'All' && String(rawMangaId) !== String(selectedManga)) return false;
    if (selectedWorkType !== 'All' && String(rawWorkTypeId) !== String(selectedWorkType)) return false;
    if (selectedPriority !== 'All' && task.priority !== selectedPriority) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = getMangaTitle(task).toLowerCase();
      const ch = String(getChapterNumber(task));
      if (!title.includes(q) && !ch.includes(q)) return false;
    }
    return true;
  });

  // Group tasks into 4 Kanban columns
  const openTasks = filteredTasks.filter((t) => t.status === 'OPEN' && !t.isBlocked);
  const claimedTasks = filteredTasks.filter((t) => t.status === 'CLAIMED' || t.status === 'ACTIVE');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'SUBMITTED');
  const blockedTasks = filteredTasks.filter((t) => t.isBlocked);

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Open Work Board
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Browse and claim available chapter production slots across all series
          </p>
        </div>

        {/* Filter bar and view switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SearchIcon className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 w-40"
            />
          </div>

          <select
            value={selectedManga}
            onChange={(e) => setSelectedManga(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="All">All series</option>
            {mangas?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          <select
            value={selectedWorkType}
            onChange={(e) => setSelectedWorkType(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="All">All work types</option>
            {workTypes?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>

          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="h-8 px-2.5 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
          >
            <option value="All">All priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
          </select>

          <div className="flex items-center rounded-lg border border-zinc-800 bg-[#111215] p-0.5 ml-1 relative">
            <button
              onClick={() => setViewMode('kanban')}
              className={`relative z-10 px-2 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === 'kanban' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Kanban Board"
            >
              {viewMode === 'kanban' && (
                <motion.div
                  layoutId="openWorkViewPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <KanbanIcon className="h-3.5 w-3.5" />
              <span className="text-[11px] hidden sm:inline">Board</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`relative z-10 px-2 py-1 rounded-md text-xs flex items-center gap-1.5 transition-colors ${
                viewMode === 'list' ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Table List"
            >
              {viewMode === 'list' && (
                <motion.div
                  layoutId="openWorkViewPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <ListIcon className="h-3.5 w-3.5" />
              <span className="text-[11px] hidden sm:inline">List</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4-COLUMN KANBAN BOARD */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {/* Column 1: Open */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-200 pb-2.5 border-b border-zinc-800/80">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Available to Claim
              </span>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                {openTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {openTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
                  No open slots
                </div>
              ) : (
                openTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700/80 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-100 truncate">
                          {getMangaTitle(card)}
                        </div>
                        <div className="text-[10px] text-zinc-400 font-mono">
                          Ch. {getChapterNumber(card)}
                        </div>
                      </div>
                      <Badge variant={card.priority === 'High' ? 'danger' : 'outline'}>
                        {card.priority || 'Normal'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="font-mono text-zinc-300 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                        {getWorkTypeName(card)}
                      </span>
                      <span className="text-zinc-500 text-[10px] font-mono flex items-center gap-1">
                        <ClockIcon className="h-3 w-3" />
                        {card.deadline ? new Date(card.deadline).toLocaleDateString() : 'No deadline'}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      className="w-full text-xs h-7 mt-1"
                      onClick={() => handleOpenClaimModal(card)}
                    >
                      Claim Slot
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 2: Claimed */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-200 pb-2.5 border-b border-zinc-800/80">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                Claimed
              </span>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                {claimedTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {claimedTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
                  No claimed tasks
                </div>
              ) : (
                claimedTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700/80 transition-colors space-y-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {getMangaTitle(card)}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Ch. {getChapterNumber(card)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="font-mono text-zinc-300 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                        {getWorkTypeName(card)}
                      </span>
                      <span className="text-zinc-400 text-[10px] font-mono truncate">
                        {card.assignedWorkerName || 'Claimed'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 3: In Progress */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-200 pb-2.5 border-b border-zinc-800/80">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-indigo-400" />
                In Production
              </span>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                {inProgressTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {inProgressTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
                  No tasks in production
                </div>
              ) : (
                inProgressTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700/80 transition-colors space-y-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-100 truncate">
                        {getMangaTitle(card)}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Ch. {getChapterNumber(card)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px]">
                      <span className="font-mono text-zinc-300 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                        {getWorkTypeName(card)}
                      </span>
                      <span className="text-zinc-300 text-[10px] font-mono">
                        {card.assignedWorkerName || 'Assigned'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Column 4: Blocked */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-3.5 space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-zinc-200 pb-2.5 border-b border-zinc-800/80">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-zinc-500" />
                Dependencies Blocked
              </span>
              <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                {blockedTasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {blockedTasks.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800/80 rounded-lg">
                  No blocked dependencies
                </div>
              ) : (
                blockedTasks.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 space-y-2 opacity-75"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-zinc-300 truncate">
                        {getMangaTitle(card)}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Ch. {getChapterNumber(card)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                      <Lock className="h-3 w-3 text-zinc-500 shrink-0" />
                      <span className="truncate">{card.blockedReason || 'Waiting on preceding stages'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        /* TABLE LIST VIEW */
        <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden divide-y divide-zinc-800/80">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">No tasks found matching filter criteria</div>
          ) : (
            filteredTasks.map((card) => (
              <div
                key={card.id}
                className="p-3 flex items-center justify-between hover:bg-zinc-800/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-zinc-100 truncate">
                    {getMangaTitle(card)}{' '}
                    <span className="text-zinc-500 font-mono">
                      #{getChapterNumber(card)}
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-2 mt-0.5">
                    <span>{getWorkTypeName(card)}</span>
                    <span>•</span>
                    <span className="capitalize">{card.status?.toLowerCase() || 'open'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant={card.priority === 'High' ? 'danger' : 'outline'}>
                    {card.priority || 'Normal'}
                  </Badge>
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
          title="Confirm Work Claim"
          description="You are about to assign this production slot to yourself."
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-400">Series:</span>
                <span className="font-semibold text-zinc-100">
                  {getMangaTitle(claimingAssignment)}
                </span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-zinc-400">Chapter:</span>
                <span className="text-zinc-200">
                  Ch. {getChapterNumber(claimingAssignment)}
                </span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-zinc-400">Work Slot:</span>
                <span className="text-zinc-200">
                  {getWorkTypeName(claimingAssignment)}
                </span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-zinc-400">Priority:</span>
                <span className="text-zinc-200">{claimingAssignment.priority || 'Normal'}</span>
              </div>
            </div>

            {claimError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
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
