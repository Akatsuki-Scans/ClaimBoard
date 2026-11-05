import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { searchAnilistManga } from '../../lib/anilist';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  OpenWorkIcon,
  UserCheckIcon,
  PlusIcon,
  ClockIcon,
  AlertTriangleIcon,
  LayersIcon,
} from '../../components/ui/icon';
import { Lock } from 'lucide-react';

export function AdminAssignmentsPage() {
  const queryClient = useQueryClient();
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedMangaId, setSelectedMangaId] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('Normal');
  const [anilistLatestChapter, setAnilistLatestChapter] = useState<number | null>(null);
  const [isFetchingAnilist, setIsFetchingAnilist] = useState(false);

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

  // Smart suggestions
  const { data: suggestions } = useQuery({
    queryKey: ['smart-suggestions', selectedWorkTypeId],
    queryFn: () => apiRequest<any[]>('/analytics/smart-suggestions'),
  });

  const createAssignmentMutation = useMutation({
    mutationFn: async () => {
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
          workTypeId: selectedWorkTypeId,
          priority: selectedPriority,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['chapters'] });
      setIsAssignModalOpen(false);
      setChapterNumber('');
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
            Task assignments & allocations
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Create production slots, specify chapter numbers, and apply automated pipeline templates
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsAssignModalOpen(true)} className="h-8 gap-1.5">
          <PlusIcon className="h-3.5 w-3.5" />
          Create assignment
        </Button>
      </div>

      {/* Worker Allocation Suggestions */}
      <div className="rounded-lg border border-zinc-800 bg-[#111215] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
            <UserCheckIcon className="h-4 w-4 text-zinc-400" />
            Worker Allocation Recommendations
          </div>
          <span className="text-[10px] text-zinc-500 font-mono">Live workload balancing</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {suggestions?.slice(0, 3).map((sug: any) => (
            <div
              key={sug.workerId}
              className="p-3 rounded-md border border-zinc-800 bg-zinc-950/60 flex items-center justify-between"
            >
              <div className="space-y-0.5">
                <div className="text-xs font-medium text-zinc-200">{sug.workerName}</div>
                <div className="text-[11px] text-zinc-400">
                  {sug.reason} • Active: {sug.currentLoad}
                </div>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                Score: {sug.matchScore}%
              </span>
            </div>
          ))}
        </div>
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
            assignments?.map((a: any) => (
              <div key={a.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-zinc-100">{a.mangaId?.title || 'Series'}</span>
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
              </div>
            ))
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

          {/* Work Type Selection */}
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Work Type</label>
            <select
              value={selectedWorkTypeId}
              onChange={(e) => setSelectedWorkTypeId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
              required
            >
              <option value="">Select Production Type</option>
              {workTypes?.map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name} ({wt.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createAssignmentMutation.isPending}>
              Create Assignment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
