import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { AnilistMangaSelect } from '../../components/manga/AnilistMangaSelect';
import { MangaIcon, PlusIcon, SearchIcon, LayersIcon } from '../../components/ui/icon';

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
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">
            Manga & Series Catalog
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Active scanlation projects, publication schedules, and release progress
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
          <PlusIcon className="h-3.5 w-3.5 mr-1" />
          Add Series
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-72">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto relative">
          {['All', 'Active', 'Completed', 'Paused', 'Archived'].map((status) => {
            const isActive = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`relative px-3 py-1.5 text-xs rounded-lg transition-colors whitespace-nowrap z-10 ${
                  isActive ? 'text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="mangaStatusFilterPill"
                    className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-lg -z-10 shadow-sm"
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                  />
                )}
                {status}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid of Manga */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading catalog...</div>
      ) : mangas?.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-12 text-center">
          <MangaIcon className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-200">No series found</h3>
          <p className="text-xs text-zinc-500 mt-1 mb-4">Add your first manga series using AniList database import.</p>
          <Button variant="primary" size="sm" onClick={() => setIsAddModalOpen(true)}>
            <PlusIcon className="h-3.5 w-3.5 mr-1" />
            Add Series
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {mangas?.map((manga) => (
            <motion.div
              key={manga.id}
              whileHover={{ y: -4, borderColor: '#3f3f46' }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden flex flex-col justify-between transition-colors shadow-sm"
            >
              <Link
                to={`/manga/${manga.id}`}
                className="flex flex-col h-full justify-between group"
              >
              <div>
                <div className="h-44 w-full bg-zinc-900 relative overflow-hidden flex items-center justify-center">
                  {manga.coverUrl ? (
                    <img
                      src={manga.coverUrl}
                      alt={manga.title}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-500 gap-1.5 p-4 text-center">
                      <MangaIcon className="h-8 w-8 text-zinc-600" />
                      <span className="text-xs font-medium text-zinc-400 line-clamp-2">{manga.title}</span>
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5">
                    <Badge variant={manga.status === 'Active' ? 'success' : 'default'}>{manga.status}</Badge>
                  </div>
                </div>

                <div className="p-3.5 space-y-1.5">
                  <h3 className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
                    {manga.title}
                  </h3>
                  <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-1.5 truncate">
                    <span>{manga.author}</span>
                    <span>•</span>
                    <span>{manga.language || 'Japanese'}</span>
                  </div>

                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {manga.description || 'No description provided.'}
                  </p>
                </div>
              </div>

              <div className="px-3.5 py-2.5 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <LayersIcon className="h-3.5 w-3.5 text-zinc-500" />
                  {manga.totalChapters || 0} chapters
                </span>

                <span className="text-zinc-300">
                  {manga.openTasksCount || 0} open slots
                </span>
              </div>
            </Link>
          </motion.div>
          ))}
        </div>
      )}

      {/* Add Manga via AniList Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Series"
        description="Search AniList to import official metadata, cover art, and author credits."
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMangaMutation.mutate();
          }}
          className="space-y-3.5 text-xs"
        >
          {/* AniList Search Component */}
          <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-300 flex items-center gap-1.5">
              <SearchIcon className="h-3.5 w-3.5 text-zinc-400" /> Search AniList database
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
