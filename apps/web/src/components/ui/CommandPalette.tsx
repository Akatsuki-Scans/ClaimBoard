import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Briefcase, Bookmark, GitFork, BookOpen, Users, BarChart3, Settings, ShieldCheck, X } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user, hasPermission } = useAuthStore();

  const isAdmin = user?.role === 'Administrator' || user?.role === 'Owner' || user?.role === 'Manager';

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        return;
      }

      if (!isInput && !isOpen && !e.ctrlKey && !e.metaKey && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'g':
            navigate('/dashboard');
            break;
          case 'o':
            navigate('/open-work');
            break;
          case 'm':
            navigate('/my-claims');
            break;
          case 'p':
            navigate('/pipeline');
            break;
          case 'a':
            if (isAdmin) navigate('/admin');
            break;
          case '/':
            e.preventDefault();
            setIsOpen(true);
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, navigate, isAdmin]);

  if (!isOpen) return null;

  const actions = [
    { label: 'Go to Dashboard', icon: LayoutDashboard, path: '/dashboard', shortcut: 'G' },
    { label: 'Go to Open Work Board', icon: Briefcase, path: '/open-work', shortcut: 'O' },
    { label: 'Go to My Claims', icon: Bookmark, path: '/my-claims', shortcut: 'M' },
    { label: 'Go to Pipeline Visualization', icon: GitFork, path: '/pipeline', shortcut: 'P' },
    { label: 'Go to Manga Catalog', icon: BookOpen, path: '/manga' },
    { label: 'Go to Team & Workload', icon: Users, path: '/team' },
    { label: 'Go to Notification Center', icon: Settings, path: '/notifications' },
    ...(isAdmin ? [{ label: 'Admin: Operations Center', icon: ShieldCheck, path: '/admin', shortcut: 'A' }] : []),
    ...(isAdmin ? [{ label: 'Admin: Manga & Chapters', icon: BookOpen, path: '/admin/manga' }] : []),
    ...(isAdmin ? [{ label: 'Admin: Discord Integrations', icon: Settings, path: '/admin/discord' }] : []),
    ...(isAdmin ? [{ label: 'Admin: Analytics & Bottlenecks', icon: BarChart3, path: '/admin/analytics' }] : []),
  ];

  const filtered = actions.filter((a) =>
    a.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

      <div className="relative z-50 w-full max-w-xl rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center border-b border-zinc-800 px-3.5 py-2.5">
          <Search className="h-4 w-4 text-zinc-400 mr-2.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            autoFocus
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No matching commands found.</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(item.path)}
                  className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800/80 hover:text-white transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-zinc-400" />
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <kbd className="rounded border border-zinc-700 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-zinc-800/80 bg-zinc-950/40 px-3.5 py-2 text-[11px] text-zinc-500 flex justify-between items-center">
          <span>Use arrow keys to navigate, Enter to select</span>
          <div className="flex items-center gap-2">
            <span>Palette:</span>
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[10px] font-mono text-zinc-400">Ctrl+K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
