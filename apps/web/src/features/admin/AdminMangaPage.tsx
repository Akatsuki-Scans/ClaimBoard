import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { AnilistMangaSelect } from '../../components/manga/AnilistMangaSelect';
import { BookOpen, Plus, Sparkles, Layers } from 'lucide-react';

export function AdminMangaPage() {
  const queryClient = useQueryClient();
  const [isAddMangaOpen, setIsAddMangaOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [artist, setArtist] = useState('');
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState('Japanese');
  const [releaseSchedule, setReleaseSchedule] = useState('Weekly');
  const [coverUrl, setCoverUrl] = useState('');

  const { data: mangas, isLoading } = useQuery({
    queryKey: ['manga', 'admin'],
    queryFn: () => apiRequest<any[]>('/manga'),
  });

  const createMangaMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/manga', {
        method: 'POST',
        body: JSON.stringify({
          title,
          author,
          artist,
          description,
          language,
          releaseSchedule,
          coverUrl: coverUrl || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga'] });
      setIsAddMangaOpen(false);
      setTitle('');
      setAuthor('');
      setArtist('');
      setDescription('');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-indigo-400" />
            Manga & Series Catalog Management
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Create and maintain series metadata, default pipelines, and release cadences.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsAddMangaOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add Manga Series
        </Button>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading series...</div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden text-xs">
          {mangas?.map((m) => (
            <div key={m.id} className="p-4 flex items-center justify-between hover:bg-zinc-800/20 transition-colors">
              <div className="flex items-center gap-3">
                <img
                  src={m.coverUrl || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400'}
                  alt={m.title}
                  className="h-10 w-8 object-cover rounded border border-zinc-700"
                />
                <div>
                  <div className="font-semibold text-sm text-zinc-100">{m.title}</div>
                  <div className="text-zinc-500 text-[11px]">
                    By {m.author} • {m.language} • {m.releaseSchedule}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-mono text-zinc-400">{m.totalChapters} chapters</span>
                <Badge variant={m.status === 'Active' ? 'success' : 'default'}>{m.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Manga Modal */}
      <Modal
        isOpen={isAddMangaOpen}
        onClose={() => setIsAddMangaOpen(false)}
        title="Add New Manga Series"
        description="Register a new manga or manhwa production title."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMangaMutation.mutate();
          }}
          className="space-y-3.5 text-xs"
        >
          {/* AniList Live Search & Auto-fill */}
          <div className="p-3 rounded-lg bg-indigo-950/30 border border-indigo-800/50 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Auto-fill with AniList Database
              </span>
            </div>
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chainsaw Man" required />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Author</label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="e.g. Tatsuki Fujimoto" required />
            </div>
            <div>
              <label className="block text-zinc-300 font-medium mb-1">Artist</label>
              <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. Tatsuki Fujimoto" required />
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Cover Image URL</label>
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
            <Button type="button" variant="secondary" size="sm" onClick={() => setIsAddMangaOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={createMangaMutation.isPending}>
              Create Series
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
