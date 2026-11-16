import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { searchAnilistManga, AnilistManga } from '../../lib/anilist';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { DeadlineDatePicker } from '../../components/application/date-picker/DatePicker';
import { Modal } from '../../components/ui/Modal';
import { DiscordIcon } from '../../components/ui/icon';
import {
  BookOpen,
  Plus,
  Layers,
  GitFork,
  Clock,
  CheckCircle,
  Hash,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
} from 'lucide-react';
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

export function MangaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAllChapters, setShowAllChapters] = useState(false);

  // Single chapter modal
  const [isAddChapterOpen, setIsAddChapterOpen] = useState(false);
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterPriority, setChapterPriority] = useState('Normal');
  const [chapterDeadline, setChapterDeadline] = useState('');
  const [editingChapterDeadline, setEditingChapterDeadline] = useState<any | null>(null);
  const [editChapterDeadlineVal, setEditChapterDeadlineVal] = useState('');

  // Discord Role modal
  const [isDiscordRoleModalOpen, setIsDiscordRoleModalOpen] = useState(false);
  const [discordRoleId, setDiscordRoleId] = useState('');
  const [discordRoleName, setDiscordRoleName] = useState('');
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [isCreatingRole, setIsCreatingRole] = useState(false);
  const [newRoleInputName, setNewRoleInputName] = useState('');
  const [newRoleInputColor, setNewRoleInputColor] = useState('#5865f2');

  // AniList metadata state
  const [anilistData, setAnilistData] = useState<AnilistManga | null>(null);
  const [isFetchingAnilist, setIsFetchingAnilist] = useState(false);

  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  const { data: manga, isLoading: isMangaLoading } = useQuery({
    queryKey: ['manga', id],
    queryFn: () => (id ? apiRequest<any>(`/manga/${id}`) : null),
  });

  const { data: chapters, isLoading: isChaptersLoading } = useQuery({
    queryKey: ['chapters', id],
    queryFn: () => (id ? apiRequest<any[]>(`/chapters?mangaId=${id}`) : []),
  });

  const { data: guilds } = useQuery({
    queryKey: ['discord', 'guilds'],
    queryFn: () => apiRequest<any[]>('/discord/guilds').catch(() => []),
  });

  const { data: discordChannels } = useQuery({
    queryKey: ['discord', 'channels'],
    queryFn: () => apiRequest<any[]>('/discord/channels').catch(() => []),
  });

  const { data: serverRoles, isLoading: isServerRolesLoading } = useQuery({
    queryKey: ['discord', 'server-roles'],
    queryFn: () => apiRequest<any[]>('/discord/server-roles').catch(() => []),
  });

  const matchedGuild =
    guilds?.find((g: any) => g.id === (selectedGuildId || manga?.discordGuildId)) ||
    guilds?.find((g: any) => g.id === discordChannels?.find((c: any) => c.mangaId === id)?.guildId) ||
    guilds?.[0];

  const mappedChannel = discordChannels?.find((c: any) => c.mangaId === id);

  // Create Discord Role Mutation
  const createRoleMutation = useMutation({
    mutationFn: async () => {
      if (!newRoleInputName.trim()) throw new Error('Role name is required');
      return apiRequest<any>('/discord/create-role', {
        method: 'POST',
        body: JSON.stringify({
          name: newRoleInputName.trim(),
          color: newRoleInputColor,
          guildId: selectedGuildId || matchedGuild?.id,
        }),
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'server-roles'] });
      setDiscordRoleId(created.id);
      setDiscordRoleName(created.name);
      setNewRoleInputName('');
      setIsCreatingRole(false);
    },
  });

  // Update Discord Role Mutation
  const updateDiscordRoleMutation = useMutation({
    mutationFn: async (payload?: { roleId?: string; roleName?: string; guildId?: string }) => {
      const targetId = payload?.roleId !== undefined ? payload.roleId : discordRoleId.trim();
      const targetName = payload?.roleName !== undefined ? payload.roleName : discordRoleName.trim();
      const targetGuildId = payload?.guildId !== undefined ? payload.guildId : (selectedGuildId || matchedGuild?.id || null);
      return apiRequest(`/manga/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          discordRoleId: targetId || undefined,
          discordRoleName: targetName || undefined,
          guildId: targetGuildId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga', id] });
      setIsDiscordRoleModalOpen(false);
    },
  });

  // Query AniList whenever manga data is loaded
  useEffect(() => {
    if (!manga?.title) return;

    let isMounted = true;
    setIsFetchingAnilist(true);

    searchAnilistManga(manga.title)
      .then((results) => {
        if (!isMounted) return;
        const match = results[0];
        if (match) {
          setAnilistData(match);
        }
      })
      .catch((err) => console.warn('AniList lookup error:', err))
      .finally(() => {
        if (isMounted) setIsFetchingAnilist(false);
      });

    return () => {
      isMounted = false;
    };
  }, [manga?.title]);

  // Determine latest chapter from DB or AniList
  const sortedChapters = [...(chapters || [])].sort((a, b) => {
    const numA = parseFloat(a.chapterNumber) || 0;
    const numB = parseFloat(b.chapterNumber) || 0;
    return numB - numA;
  });

  const latestDbChapter = sortedChapters[0];
  const latestChapterNumber = latestDbChapter
    ? latestDbChapter.chapterNumber
    : anilistData?.chapters
      ? anilistData.chapters.toString()
      : 'None yet';

  // Automatically suggest next chapter number when modal opens
  useEffect(() => {
    if (isAddChapterOpen && !chapterNumber) {
      const nextNum = latestDbChapter
        ? (parseFloat(latestDbChapter.chapterNumber) || 0) + 1
        : anilistData?.chapters
          ? anilistData.chapters + 1
          : 1;
      setChapterNumber(nextNum.toString());
      setChapterTitle(`Chapter ${nextNum}`);
    }
  }, [isAddChapterOpen, latestDbChapter, anilistData]);

  // Create Chapter Mutation
  const createChapterMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/chapters', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: id,
          chapterNumber: chapterNumber.trim(),
          title: chapterTitle.trim() || `Chapter ${chapterNumber.trim()}`,
          priority: chapterPriority,
          deadline: chapterDeadline ? (zonedDateTimeLocalToIso(chapterDeadline, activeTimeZone) || undefined) : undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      queryClient.invalidateQueries({ queryKey: ['manga', id] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      setIsAddChapterOpen(false);
      setChapterNumber('');
      setChapterTitle('');
      setChapterDeadline('');
    },
  });

  const updateChapterDeadlineMutation = useMutation({
    mutationFn: async ({ chapterId, deadline }: { chapterId: string; deadline: string | null }) => {
      return apiRequest(`/chapters/${chapterId}/deadline`, {
        method: 'PATCH',
        body: JSON.stringify({
          deadline: deadline ? zonedDateTimeLocalToIso(deadline, activeTimeZone) : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      queryClient.invalidateQueries({ queryKey: ['deadlines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      setEditingChapterDeadline(null);
    },
  });

  if (isMangaLoading) {
    return (
      <div className="p-12 text-center text-xs text-zinc-500">
        Loading manga series details...
      </div>
    );
  }

  if (!manga) {
    return (
      <div className="p-12 text-center space-y-3">
        <h2 className="text-lg font-bold text-white">Manga Not Found</h2>
        <p className="text-xs text-zinc-400">The requested series does not exist or has been removed.</p>
        <Link to="/manga">
          <Button variant="outline" size="sm">
            ← Back to Manga Catalog
          </Button>
        </Link>
      </div>
    );
  }

  // Slice chapters so we don't display all at once
  const displayedChapters = showAllChapters ? sortedChapters : sortedChapters.slice(0, 5);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Hero Header Card */}
      <div className="rounded-2xl border border-zinc-800 bg-[#121215] overflow-hidden relative">
        <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-6 items-start">
          {/* Cover thumbnail */}
          <div className="relative shrink-0">
            <img
              src={manga.coverUrl || anilistData?.coverImage.extraLarge || '/akatsuki.jpg'}
              alt={manga.title}
              className="h-44 w-32 md:h-52 md:w-36 rounded-xl object-cover border border-zinc-700/80 shadow-2xl"
            />
          </div>

          {/* Details Column */}
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-sans">
                {manga.title}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                {manga.status || 'Active'}
              </span>
            </div>

            {/* Genres & Tags */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(manga.genres?.length ? manga.genres : anilistData?.genres || ['Manga', 'Scanlation']).map(
                (tag: string) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                  >
                    {tag}
                  </span>
                )
              )}
            </div>

            {/* Meta row */}
            <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-3">
              <span className="text-zinc-200 font-medium">By {manga.author || 'Unknown'}</span>
              <span>•</span>
              <span>{manga.language || 'Japanese'}</span>
              <span>•</span>
              <span className="text-indigo-400 font-medium">
                {manga.releaseSchedule || 'Weekly'} Releases
              </span>
            </div>

            {/* Discord Server & Role Tagging Configuration */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
              {/* Guild Server Info with PFP */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-900/90 border border-zinc-800">
                <div className="h-4 w-4 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700/60">
                  {matchedGuild?.icon ? (
                    <img src={matchedGuild.icon} alt={matchedGuild.name} className="h-full w-full object-cover" />
                  ) : (
                    <DiscordIcon className="h-3 w-3 text-[#5865F2]" />
                  )}
                </div>
                <span className="text-[11px] font-semibold text-zinc-200">
                  {matchedGuild?.name || 'Discord Server'}
                </span>
                {mappedChannel && (
                  <span className="font-mono text-[10px] text-zinc-400 bg-zinc-800/80 px-1.5 py-0.2 rounded border border-zinc-700/60 ml-0.5">
                    #{mappedChannel.channelName}
                  </span>
                )}
              </div>

              {/* Discord Role Tag */}
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 text-[11px] flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-[#5865F2]" />
                  Role:
                </span>
                {manga.discordRoleId ? (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#7983f5] font-semibold flex items-center gap-1">
                    @{manga.discordRoleName || manga.discordRoleId}
                  </span>
                ) : (
                  <span className="text-zinc-500 italic text-[11px]">No role tagged</span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDiscordRoleId(manga.discordRoleId || '');
                    setDiscordRoleName(manga.discordRoleName || '');
                    setSelectedGuildId(manga.discordGuildId || matchedGuild?.id || '');
                    setIsDiscordRoleModalOpen(true);
                  }}
                  className="text-[11px] text-[#5865F2] hover:text-[#7983f5] underline ml-1 font-medium cursor-pointer"
                >
                  {manga.discordRoleId ? 'Change' : '+ Configure Discord'}
                </button>
              </div>
            </div>

            {/* Synopsis */}
            <p className="text-xs text-zinc-400/90 leading-relaxed max-w-3xl line-clamp-3">
              {manga.description || anilistData?.description?.replace(/<[^>]*>?/gm, '') || 'No synopsis provided.'}
            </p>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <Link to={`/pipeline?mangaId=${manga.id}`}>
                <Button size="sm" variant="primary" className="text-xs">
                  Active Pipeline
                </Button>
              </Link>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsAddChapterOpen(true)}
                className="text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Chapter
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* SERIES LATEST CHAPTER HERO BANNER (AniList + DB Integration) */}
      <div className="rounded-xl border border-zinc-800 bg-[#111215] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/60">
              Latest chapter
            </span>
            {isFetchingAnilist && (
              <span className="text-[11px] text-zinc-400 font-mono">Syncing with AniList...</span>
            )}
          </div>
          <div className="text-base font-semibold text-zinc-100 flex items-center gap-2.5">
            <span>Chapter {latestChapterNumber}</span>
            {latestDbChapter?.title && (
              <span className="text-xs text-zinc-400 font-normal">({latestDbChapter.title})</span>
            )}
          </div>
          <div className="text-xs text-zinc-400 flex items-center gap-3">
            <span>
              Status: <strong className="text-zinc-200 font-medium">{latestDbChapter?.status || 'Active'}</strong>
            </span>
            {anilistData?.chapters && (
              <span>• Official AniList chapters: {anilistData.chapters}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="primary"
            onClick={() => setIsAddChapterOpen(true)}
            className="text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Next Chapter
          </Button>
        </div>
      </div>

      {/* Chapters Table (Shows latest chapters instead of everything at once) */}
      <div className="rounded-xl border border-zinc-800 bg-[#121215] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Production Chapters</h2>
            <p className="text-[11px] text-zinc-500">
              Showing {displayedChapters.length} of {sortedChapters.length} chapters
            </p>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setIsAddChapterOpen(true)}>
            + Add Chapter
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Chapter #</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Target Deadline</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
              {displayedChapters.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-zinc-500">
                    No chapters added for this manga yet. Click "+ Add Chapter" above.
                  </td>
                </tr>
              ) : (
                displayedChapters.map((ch: any) => {
                  const urgency = getDeadlineUrgency(ch.deadline, ch.status);
                  const styles = getUrgencyStyles(urgency);
                  return (
                    <tr key={ch.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-zinc-100">
                        Ch. {ch.chapterNumber}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300 font-medium">
                        {ch.title || `Chapter ${ch.chapterNumber}`}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${ch.status === 'Completed'
                            ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                            : 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/50'
                            }`}
                        >
                          ● {ch.status || 'In_Production'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-400 font-mono text-[11px]">
                        <div className="flex items-center gap-2">
                          {ch.deadline ? (
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] tabular-nums inline-flex items-center gap-1.5 ${styles.badge}`}
                              title={formatInUserTimeZone(ch.deadline, activeTimeZone, 'full')}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                              <Calendar className="h-3 w-3 shrink-0 opacity-85" />
                              {formatDeadlineCountdown(ch.deadline, ch.status, activeTimeZone)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">No deadline</span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingChapterDeadline(ch);
                              setEditChapterDeadlineVal(
                                toDateTimeLocalValue(ch.deadline, activeTimeZone) ||
                                getPresetDateTimeLocal(72, activeTimeZone)
                              );
                            }}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                            title="Set chapter deadline"
                          >
                            <Calendar className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Link to={`/pipeline/${manga.id}/${ch.id || ch._id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                            Pipeline
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Toggle to view all chapters if more than 5 */}
        {sortedChapters.length > 5 && (
          <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40 text-center">
            <button
              onClick={() => setShowAllChapters(!showAllChapters)}
              className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 font-medium transition-colors"
            >
              {showAllChapters ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" /> Show latest chapters only
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" /> Show all {sortedChapters.length} chapters
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Add Chapter Modal (Manual Chapter Number + AniList Auto-fill) */}
      {isAddChapterOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsAddChapterOpen(false)}
          title={`Add Chapter to ${manga.title}`}
          description="Enter the chapter number. The title will automatically format."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createChapterMutation.mutate();
            }}
            className="space-y-4 text-xs"
          >
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-zinc-300 font-medium">Chapter Number</label>
                {latestChapterNumber !== 'None yet' && (
                  <span className="text-[11px] text-indigo-400 font-mono">
                    Series latest: Ch. {latestChapterNumber}
                  </span>
                )}
              </div>
              <Input
                type="text"
                value={chapterNumber}
                onChange={(e) => {
                  setChapterNumber(e.target.value);
                  if (!chapterTitle || chapterTitle.startsWith('Chapter ')) {
                    setChapterTitle(`Chapter ${e.target.value}`);
                  }
                }}
                placeholder="e.g. 101 or 1151"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Chapter Title</label>
              <Input
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder="e.g. The Dawn of Adventure"
              />
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Priority</label>
              <select
                value={chapterPriority}
                onChange={(e) => setChapterPriority(e.target.value)}
                className="w-full h-9 rounded-md bg-zinc-950 border border-zinc-800 text-zinc-200 px-3 text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  Target Deadline (Optional)
                </label>
                <span className="text-[10px] font-mono text-zinc-500">{getTimeZoneShortLabel(activeTimeZone)}</span>
              </div>
              <DeadlineDatePicker
                timeZone={activeTimeZone}
                showPresets={false}
                value={chapterDeadline}
                onChange={setChapterDeadline}
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {[
                  { label: '+48h', hours: 48 },
                  { label: '+3d', hours: 72 },
                  { label: '+1w', hours: 168 },
                ].map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setChapterDeadline(getPresetDateTimeLocal(p.hours, activeTimeZone))}
                    className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[10px] font-mono text-zinc-300 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddChapterOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={createChapterMutation.isPending}>
                Create Chapter
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Chapter Target Deadline Edit Modal */}
      {editingChapterDeadline && (
        <Modal
          isOpen={!!editingChapterDeadline}
          onClose={() => setEditingChapterDeadline(null)}
          title={`Target Deadline • Ch. ${editingChapterDeadline.chapterNumber}`}
          description={`${manga.title}`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="flex items-center gap-1.5 text-zinc-300 font-medium">
                  <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                  Due Date & Time
                </label>
                <span className="text-[10px] font-mono text-zinc-500">{getTimeZoneShortLabel(activeTimeZone)}</span>
              </div>
              <DeadlineDatePicker
                timeZone={activeTimeZone}
                showPresets={false}
                value={editChapterDeadlineVal}
                onChange={setEditChapterDeadlineVal}
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
                    onClick={() => setEditChapterDeadlineVal(getPresetDateTimeLocal(p.hours, activeTimeZone))}
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
                  updateChapterDeadlineMutation.mutate({
                    chapterId: editingChapterDeadline.id || editingChapterDeadline._id,
                    deadline: null,
                  })
                }
                disabled={updateChapterDeadlineMutation.isPending}
              >
                Clear
              </Button>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setEditingChapterDeadline(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={updateChapterDeadlineMutation.isPending}
                  onClick={() =>
                    updateChapterDeadlineMutation.mutate({
                      chapterId: editingChapterDeadline.id || editingChapterDeadline._id,
                      deadline: editChapterDeadlineVal || null,
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

      {/* Discord Role Tagging Modal */}
      {isDiscordRoleModalOpen && (
        <Modal
          isOpen={isDiscordRoleModalOpen}
          onClose={() => setIsDiscordRoleModalOpen(false)}
          title={`Discord Role Tagging • ${manga?.title}`}
        >
          <div className="space-y-4 text-xs">
            <p className="text-zinc-400 leading-relaxed">
              Configure the Discord role to automatically tag whenever new chapters of <strong className="text-white">{manga?.title}</strong> are assigned using <code className="text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded border border-indigo-800/40">/assign</code> in your Discord server.
            </p>

            {/* Target Discord Guild */}
            {guilds && guilds.length > 0 && (
              <div>
                <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                  Discord Server
                </label>
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700/80">
                    {matchedGuild?.icon ? (
                      <img src={matchedGuild.icon} alt={matchedGuild.name} className="h-full w-full object-cover" />
                    ) : (
                      <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2]" />
                    )}
                  </div>
                  <select
                    value={selectedGuildId || matchedGuild?.id || ''}
                    onChange={(e) => setSelectedGuildId(e.target.value)}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500 text-xs"
                  >
                    {guilds.map((g: any) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Role Picker from Discord Server Roles */}
            <div>
              <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                Discord role name (e.g. Solo Leveling Team)
              </label>
              <Input
                value={discordRoleName}
                onChange={(e) => setDiscordRoleName(e.target.value)}
                placeholder="e.g. Solo Leveling Team or Translators"
                className="text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-300 block mb-1">
                Discord role ID (Right click role in Discord ➔ Copy ID)
              </label>
              <Input
                value={discordRoleId}
                onChange={(e) => setDiscordRoleId(e.target.value)}
                placeholder="e.g. 1446000987742535814"
                className="text-xs font-mono"
              />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              {manga?.discordRoleId ? (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => updateDiscordRoleMutation.mutate({ roleId: '', roleName: '' })}
                  disabled={updateDiscordRoleMutation.isPending}
                  className="text-xs"
                >
                  Clear Role
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsDiscordRoleModalOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => updateDiscordRoleMutation.mutate()}
                  disabled={updateDiscordRoleMutation.isPending}
                  className="text-xs"
                >
                  {updateDiscordRoleMutation.isPending ? 'Saving...' : 'Save Role'}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
