import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { searchAnilistManga } from '../../lib/anilist';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DeadlineDatePicker } from '../../components/application/date-picker/DatePicker';
import { Modal } from '../../components/ui/Modal';
import {
  OpenWorkIcon,
  PlusIcon,
  ClockIcon,
  AlertTriangleIcon,
  LayersIcon,
  CalendarIcon,
} from '../../components/ui/icon';
import { Check, Lock, Trash2 } from 'lucide-react';
import {
  formatDeadlineCountdown,
  formatInUserTimeZone,
  getBrowserTimeZone,
  getDeadlineUrgency,
  getPresetDateTimeLocal,
  getTimeZoneShortLabel,
  getUrgencyStyles,
  toDateTimeLocalValue,
  zonedDateTimeLocalToIso,
} from '../../lib/deadlines';

export function AdminAssignmentsPage() {
  const queryClient = useQueryClient();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedMangaId, setSelectedMangaId] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [selectedWorkTypeIds, setSelectedWorkTypeIds] = useState<string[]>([]);
  const [selectedPriority, setSelectedPriority] = useState('Normal');
  const [assignmentDeadline, setAssignmentDeadline] = useState(() => getPresetDateTimeLocal(48, getBrowserTimeZone()));
  const [editingDeadlineItem, setEditingDeadlineItem] = useState<any | null>(null);
  const [editDeadlineInput, setEditDeadlineInput] = useState('');
  const [assignmentToDelete, setAssignmentToDelete] = useState<any | null>(null);
  const [anilistLatestChapter, setAnilistLatestChapter] = useState<number | null>(null);
  const [isFetchingAnilist, setIsFetchingAnilist] = useState(false);

  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  // Queries
  const { data: assignments, isLoading } = useQuery({
    queryKey: ['assignments', 'admin'],
    queryFn: () => apiRequest<any[]>('/assignments'),
  });

  const { data: mangas } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga'),
  });

  const { data: chapters } = useQuery({
    queryKey: ['chapters', selectedMangaId],
    queryFn: () => (selectedMangaId ? apiRequest<any[]>(`/chapters?mangaId=${selectedMangaId}`) : Promise.resolve([])),
    enabled: !!selectedMangaId,
  });

  const { data: workTypes } = useQuery({
    queryKey: ['workTypes'],
    queryFn: () => apiRequest<any[]>('/work-types'),
  });

  // Fetch AniList metadata for selected manga
  useEffect(() => {
    if (!selectedMangaId || !mangas) {
      setAnilistLatestChapter(null);
      return;
    }

    const selectedManga = mangas.find((m: any) => m.id === selectedMangaId);
    if (!selectedManga?.title) return;

    let isMounted = true;
    setIsFetchingAnilist(true);

    searchAnilistManga(selectedManga.title)
      .then((results) => {
        if (!isMounted) return;
        const match = results[0];
        if (match?.chapters) {
          setAnilistLatestChapter(match.chapters);
          // Suggest next chapter number if empty
          if (!chapterNumber) {
            setChapterNumber((match.chapters + 1).toString());
          }
        } else {
          setAnilistLatestChapter(null);
        }
      })
      .catch(() => {
        if (isMounted) setAnilistLatestChapter(null);
      })
      .finally(() => {
        if (isMounted) setIsFetchingAnilist(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedMangaId, mangas]);

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
      if (selectedWorkTypeIds.length === 0) {
        throw new Error('Select at least one role / work type');
      }
      let targetChapterId = '';

      // Check if chapter already exists in database
      const existingCh = chapters?.find((c: any) => c.chapterNumber === chapterNumber.trim());
      if (existingCh) {
        targetChapterId = existingCh.id;
      } else {
        // Automatically create the chapter on the fly with this chapter number
        const newCh = await apiRequest('/chapters', {
          method: 'POST',
          body: JSON.stringify({
            mangaId: selectedMangaId,
            chapterNumber: chapterNumber.trim(),
            title: `Chapter ${chapterNumber.trim()}`,
            priority: selectedPriority,
          }),
        });
        targetChapterId = newCh.id;
      }

      return apiRequest('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: selectedMangaId,
          chapterId: targetChapterId,
          workTypeIds: selectedWorkTypeIds,
          priority: selectedPriority,
          deadline: assignmentDeadline ? (zonedDateTimeLocalToIso(assignmentDeadline, activeTimeZone) || undefined) : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      setIsAssignModalOpen(false);
      setChapterNumber('');
      setSelectedWorkTypeIds([]);
      setAssignmentDeadline(getPresetDateTimeLocal(48, activeTimeZone));
    },
  });

  const updateDeadlineMutation = useMutation({
    mutationFn: async ({ assignmentId, deadline }: { assignmentId: string; deadline: string | null }) => {
      return apiRequest(`/assignments/${assignmentId}/deadline`, {
        method: 'PATCH',
        body: JSON.stringify({
          deadline: deadline ? zonedDateTimeLocalToIso(deadline, activeTimeZone) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setEditingDeadlineItem(null);
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/assignments/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      setAssignmentToDelete(null);
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <OpenWorkIcon className="h-4 w-4 text-zinc-400" />
            Task assignments
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Create production slots, specify chapter numbers, and manage assignments
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setAssignmentDeadline(getPresetDateTimeLocal(48, activeTimeZone));
            setIsAssignModalOpen(true);
          }}
          className="h-8 gap-1.5"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Create assignment
        </Button>
      </div>

      {/* Assignments List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading assignments...</div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden">
          {assignments?.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No task assignments created yet. Click "Create Work Assignment" above.
            </div>
          ) : (
            assignments?.map((a: any) => {
              const urgency = getDeadlineUrgency(a.deadline, a.status);
              const styles = getUrgencyStyles(urgency);
              const seriesTitle =
                a.manga?.title ||
                a.mangaTitle ||
                (typeof a.mangaId === 'object' ? a.mangaId?.title : null) ||
                'Unknown Series';
              const chapterNum =
                a.chapter?.chapterNumber ||
                a.chapterNumber ||
                (typeof a.chapterId === 'object' ? a.chapterId?.chapterNumber : null) ||
                (a.chapterId && typeof a.chapterId === 'string' ? a.chapterId : '?');
              return (
              <div key={a.id} className="p-4 flex items-center justify-between gap-4 hover:bg-zinc-800/30 transition-colors">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-zinc-100">{seriesTitle}</span>
                    <span className="text-xs text-zinc-400 font-mono">Ch. {chapterNum}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[11px] font-mono font-medium"
                      style={{ backgroundColor: `${a.workType?.color}20`, color: a.workType?.color }}
                    >
                      {a.workType?.name}
                    </span>
                    <Badge variant={a.status === 'COMPLETED' ? 'success' : a.status === 'OPEN' ? 'default' : 'info'}>
                      {a.status}
                    </Badge>
                    {a.isBlocked && (
                      <span className="text-[10px] text-amber-400 font-mono flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Blocked
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Assigned worker: <strong className="text-zinc-300">{a.assignedWorkerName || 'None (Open for Claim)'}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {a.deadline ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-200">
                        <CalendarIcon className="h-3 w-3 text-zinc-400 shrink-0" />
                        <span>{formatInUserTimeZone(a.deadline, activeTimeZone, 'shortDateTime')}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-mono tabular-nums flex items-center gap-1.5 ${styles.badge}`}
                        title={formatInUserTimeZone(a.deadline, activeTimeZone, 'full')}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                        {formatDeadlineCountdown(a.deadline, a.status, activeTimeZone)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[11px] font-mono text-zinc-400">
                        {a.createdAt ? `Created ${formatInUserTimeZone(a.createdAt, activeTimeZone, 'shortDateTime')}` : 'No deadline'}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-600 inline-flex items-center gap-1">
                        <CalendarIcon className="h-3 w-3 opacity-60" />
                        No deadline
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingDeadlineItem(a);
                        setEditDeadlineInput(
                          toDateTimeLocalValue(a.deadline, activeTimeZone) || getPresetDateTimeLocal(48, activeTimeZone)
                        );
                      }}
                      className="p-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                      title="Edit deadline"
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentToDelete(a)}
                      className="p-1.5 rounded-md border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete assignment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      )}

      {/* Create Assignment Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Create Work Assignment"
        description="Allocate an individual production slot by specifying the chapter number."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createAssignmentMutation.mutate();
          }}
          className="space-y-3.5 text-xs"
        >
          {/* Select Manga Series */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Manga Series</label>
            <select
              value={selectedMangaId}
              onChange={(e) => {
                setSelectedMangaId(e.target.value);
              }}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
              required
            >
              <option value="">Select Manga Series</option>
              {mangas?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {/* Chapter Number Input (Manual Number with AniList latest detection) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-zinc-300 font-medium">Chapter Number</label>
              {isFetchingAnilist ? (
                <span className="text-[10px] text-zinc-500 font-mono">Checking AniList...</span>
              ) : anilistLatestChapter ? (
                <span className="text-[11px] text-indigo-400 font-mono font-medium">
                  Latest on AniList: Ch. {anilistLatestChapter}
                </span>
              ) : null}
            </div>
            <Input
              type="text"
              value={chapterNumber}
              onChange={(e) => setChapterNumber(e.target.value)}
              placeholder="e.g. 101 or 1151"
              required
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              If this chapter doesn't exist yet, it will be automatically registered into the production database.
            </p>
          </div>

          {/* Work Type / Role Multi-Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-zinc-300 font-medium">
                Roles / Work Types
                {selectedWorkTypeIds.length > 0 && (
                  <span className="ml-1.5 text-[10px] font-mono text-zinc-400">
                    ({selectedWorkTypeIds.length} selected)
                  </span>
                )}
              </label>
              {workTypes && workTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const allIds = workTypes.map((wt: any) => wt.id);
                    const allSelected = allIds.every((id: string) => selectedWorkTypeIds.includes(id));
                    setSelectedWorkTypeIds(allSelected ? [] : allIds);
                  }}
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                    workTypes.length > 0 && selectedWorkTypeIds.length === workTypes.length
                      ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                      : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  {selectedWorkTypeIds.length === workTypes.length ? 'Clear All' : `All Roles (${workTypes.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70">
              {workTypes?.map((wt: any) => {
                const isSelected = selectedWorkTypeIds.includes(wt.id);
                return (
                  <button
                    key={wt.id}
                    type="button"
                    onClick={() =>
                      setSelectedWorkTypeIds((prev) =>
                        prev.includes(wt.id) ? prev.filter((id) => id !== wt.id) : [...prev, wt.id]
                      )
                    }
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-left transition-colors ${
                      isSelected
                        ? 'border-zinc-600 bg-zinc-800/90 text-zinc-100'
                        : 'border-zinc-800/80 bg-[#111215] text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: wt.color || '#6366f1' }}
                      />
                      <span className="truncate font-medium">{wt.name}</span>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">{wt.code}</span>
                    </span>
                    {isSelected && <Check className="h-3 w-3 text-zinc-100 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {selectedWorkTypeIds.length === 0 && (
              <p className="text-[10px] text-zinc-500 mt-1">
                Pick one, multiple, or All Roles to dispatch together.
              </p>
            )}
          </div>

          {/* Deadline Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
                Deadline
              </label>
              <span className="text-[10px] font-mono text-zinc-500">{getTimeZoneShortLabel(activeTimeZone)}</span>
            </div>
            <DeadlineDatePicker
              timeZone={activeTimeZone}
              showPresets={false}
              value={assignmentDeadline}
              onChange={setAssignmentDeadline}
            />
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {[
                { label: '+24h', hours: 24 },
                { label: '+48h', hours: 48 },
                { label: '+3d', hours: 72 },
                { label: '+1w', hours: 168 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAssignmentDeadline(getPresetDateTimeLocal(p.hours, activeTimeZone))}
                  className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={createAssignmentMutation.isPending}
              disabled={!selectedMangaId || !chapterNumber.trim() || selectedWorkTypeIds.length === 0}
            >
              {selectedWorkTypeIds.length > 1 ? `Create ${selectedWorkTypeIds.length} Assignments` : 'Create Assignment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Deadline Modal */}
      {editingDeadlineItem && (
        <Modal
          isOpen={!!editingDeadlineItem}
          onClose={() => setEditingDeadlineItem(null)}
          title="Update Assignment Deadline"
          description={`${editingDeadlineItem.mangaId?.title || 'Series'} Ch. ${editingDeadlineItem.chapterId?.chapterNumber || '?'} • ${editingDeadlineItem.workType?.name || 'Task'}`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <CalendarIcon className="h-3.5 w-3.5 text-zinc-400" />
                  Due Date & Time
                </label>
                <span className="text-[10px] font-mono text-zinc-500">{getTimeZoneShortLabel(activeTimeZone)}</span>
              </div>
              <DeadlineDatePicker
                timeZone={activeTimeZone}
                showPresets={false}
                value={editDeadlineInput}
                onChange={setEditDeadlineInput}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { label: '+24h', hours: 24 },
                  { label: '+48h', hours: 48 },
                  { label: '+3 days', hours: 72 },
                  { label: '+1 week', hours: 168 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setEditDeadlineInput(getPresetDateTimeLocal(p.hours, activeTimeZone))}
                    className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() =>
                  updateDeadlineMutation.mutate({
                    assignmentId: editingDeadlineItem.id,
                    deadline: null,
                  })
                }
                disabled={updateDeadlineMutation.isPending}
              >
                Clear Deadline
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditingDeadlineItem(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={updateDeadlineMutation.isPending}
                  onClick={() =>
                    updateDeadlineMutation.mutate({
                      assignmentId: editingDeadlineItem.id,
                      deadline: editDeadlineInput || null,
                    })
                  }
                >
                  Save Deadline
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Assignment Confirmation Modal */}
      {assignmentToDelete && (
        <Modal
          isOpen={!!assignmentToDelete}
          onClose={() => setAssignmentToDelete(null)}
          title="Delete Work Assignment"
        >
          <div className="space-y-4 text-xs">
            <p className="text-zinc-300">
              Are you sure you want to permanently delete the assignment for{' '}
              <strong className="text-white">
                {assignmentToDelete.manga?.title || assignmentToDelete.mangaTitle || 'Series'}
              </strong>{' '}
              (Ch. {assignmentToDelete.chapter?.chapterNumber || assignmentToDelete.chapterNumber || '?'}) —{' '}
              <span className="text-indigo-400 font-mono font-medium">
                {assignmentToDelete.workType?.name || assignmentToDelete.workTypeName || 'Task'}
              </span>
              ?
            </p>
            <p className="text-zinc-500 text-[11px]">
              This will remove the assignment slot and unclaim any assigned work. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setAssignmentToDelete(null)}
                disabled={deleteAssignmentMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => deleteAssignmentMutation.mutate(assignmentToDelete.id)}
                isLoading={deleteAssignmentMutation.isPending}
              >
                Delete Assignment
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
