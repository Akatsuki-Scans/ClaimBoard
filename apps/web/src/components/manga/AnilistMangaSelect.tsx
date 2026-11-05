import React, { useState, useEffect, useRef } from 'react';
import { searchAnilistManga, AnilistManga } from '../../lib/anilist';
import { Search, Loader2, BookOpen, Check } from 'lucide-react';

interface AnilistMangaSelectProps {
  onSelect: (manga: AnilistManga) => void;
  placeholder?: string;
  className?: string;
}

export function AnilistMangaSelect({
  onSelect,
  placeholder = 'Search manga on AniList (e.g. One Piece, Solo Leveling)...',
  className = '',
}: AnilistMangaSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AnilistManga[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await searchAnilistManga(query);
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        console.error('Failed to search AniList:', err);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (manga: AnilistManga) => {
    const title = manga.title.english || manga.title.romaji;
    setQuery(title);
    setIsOpen(false);
    onSelect(manga);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-9 rounded-lg bg-zinc-900 border border-zinc-700/80 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400 animate-spin" />
        )}
      </div>

      {/* AniList Results Dropdown */}
      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-zinc-800 bg-[#18181b] shadow-2xl max-h-80 overflow-y-auto divide-y divide-zinc-800/60 backdrop-blur-md">
          <div className="px-3 py-1.5 text-[10px] font-medium text-zinc-400 bg-zinc-900/60 sticky top-0 flex items-center justify-between font-mono">
            <span>AniList Manga Database</span>
            <span>{results.length} results</span>
          </div>

          {results.map((manga) => {
            const displayTitle = manga.title.english || manga.title.romaji;
            const cover = manga.coverImage.medium || manga.coverImage.large;

            return (
              <div
                key={manga.id}
                onClick={() => handleSelect(manga)}
                className="p-2.5 flex items-center gap-3 hover:bg-zinc-800/60 cursor-pointer transition-colors group"
              >
                {cover ? (
                  <img
                    src={cover}
                    alt={displayTitle}
                    className="h-12 w-9 rounded object-cover border border-zinc-700/80 shrink-0 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="h-12 w-9 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4 text-zinc-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-xs text-zinc-100 truncate group-hover:text-indigo-400 transition-colors">
                    {displayTitle}
                  </div>
                  {manga.title.romaji && manga.title.english && (
                    <div className="text-[11px] text-zinc-500 truncate font-mono">
                      {manga.title.romaji}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-zinc-400">
                    {manga.status && (
                      <span className="px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700 text-zinc-300">
                        {manga.status}
                      </span>
                    )}
                    {manga.chapters && (
                      <span>{manga.chapters} chapters</span>
                    )}
                    {manga.genres && manga.genres.length > 0 && (
                      <span className="text-zinc-500 truncate">
                        • {manga.genres.slice(0, 2).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
