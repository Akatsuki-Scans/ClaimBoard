import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { AnilistMangaSelect } from '../../components/manga/AnilistMangaSelect';
import { BookOpen, Plus, Search, Layers, Sparkles } from 'lucide-react';

export function MangaListPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');

  const { data: mangas, isLoading } = useQuery({
    queryKey: ['manga', statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (search) params.set('search', search);
      return apiRequest<any[]>(`/manga?${params.toString()}`);
    },
  });

  const createMangaMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/manga', {
        method: 'POST',
        body: JSON.stringify({
          title,
          author: author || 'Unknown',
          artist: artist || author || 'Unknown',
          description,
          coverUrl: coverUrl || undefined,
          status: 'Active',
          releaseSchedule: 'Weekly',
          language: 'Japanese',
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga'] });
      setIsAddModalOpen(false);
      setTitle('');
      setAuthor('');
      setArtist('');
      setDescription('');
      setCoverUrl('');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            Manga & Series Catalog
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Active scanlation projects, release schedules, and pipeline health.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Manga Series
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, genre..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {['All', 'Active', 'Completed', 'Paused', 'Archived'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors whitespace-nowrap ${
                statusFilter === status
                  ? 'bg-zinc-800 border-zinc-700 text-white font-medium'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Manga */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading catalog...</div>
      ) : mangas?.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <BookOpen className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-200">No series found</h3>
          <p className="text-xs text-zinc-500 mt-1 mb-4">Add your first manga series using the AniList search database.</p>
          <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Manga Series
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {mangas?.map((manga) => (
            <Link
              key={manga.id}
              to={`/manga/${manga.id}`}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col justify-between hover:border-zinc-700 hover:bg-zinc-900 transition-all group"
            >
              <div>
                <div className="h-44 w-full bg-zinc-800 relative overflow-hidden">
                  <img
                    src={manga.coverUrl || '/akatsuki.jpg'}
                    alt={manga.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2.5 right-2.5">
                    <Badge variant={manga.status === 'Active' ? 'success' : 'default'}>{manga.status}</Badge>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <h3 className="text-base font-bold text-zinc-100 group-hover:text-indigo-400 transition-colors">
                    {manga.title}
                  </h3>
                  <div className="text-xs text-zinc-400 flex items-center gap-2">
                    <span>By {manga.author}</span>
                    <span>•</span>
                    <span>{manga.language}</span>
                  </div>

                  <p className="text-xs text-zinc-500 line-clamp-2">{manga.description || 'No description provided.'}</p>
                </div>
              </div>

              <div className="p-4 pt-0 border-t border-zinc-800/80 bg-zinc-950/30 flex items-center justify-between text-xs text-zinc-400">
                <span className="flex items-center gap-1 font-mono">
                  <Layers className="h-3.5 w-3.5 text-zinc-500" />
                  {manga.totalChapters || 0} Chapters
                </span>

                <span className="flex items-center gap-1 text-emerald-400/90 font-medium">
                  {manga.openTasksCount || 0} Open Tasks
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add Manga via AniList Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Manga Series"
        description="Search AniList to auto-fill official title, cover art, and metadata."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMangaMutation.mutate();
          }}
          className="space-y-3.5 text-xs"
        >
          {/* AniList Search Component */}
          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/50 space-y-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Search AniList
            </span>
            <AnilistMangaSelect
              onSelect={(manga) => {
                const displayTitle = manga.title.english || manga.title.romaji;
                setTitle(displayTitle);
                const cover = manga.coverImage.extraLarge || manga.coverImage.large || manga.coverImage.medium || '';
                setCoverUrl(cover);
                if (manga.description) {
                  setDescription(manga.description.replace(/<[^>]*>?/gm, ''));
                }
                const staffEdges = manga.staff?.edges || [];
                const authorEdge = staffEdges.find(
                  (e) => e.role.toLowerCase().includes('story') || e.role.toLowerCase().includes('original')
                );
                const artistEdge = staffEdges.find(
                  (e) => e.role.toLowerCase().includes('art') || e.role.toLowerCase().includes('illustrator')
                );
                setAuthor(authorEdge?.node?.name?.full || 'Unknown');
                setArtist(artistEdge?.node?.name?.full || authorEdge?.node?.name?.full || 'Unknown');
              }}
            />
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Solo Leveling" required />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Author</label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Chugong" required />
            </div>
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Artist</label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. DUBU" required />
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Cover Image</label>
            <div className="flex gap-2">
              <Input value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://..." className="flex-1" />
              {coverUrl && (
                <img
                  src={coverUrl}
                  alt="Preview"
                  className="h-10 w-8 rounded object-cover border border-zinc-700 shrink-0"
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Description</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createMangaMutation.isPending}>
              Add to Catalog
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
