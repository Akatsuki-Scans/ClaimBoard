import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Briefcase,
  Bookmark,
  GitFork,
  BookOpen,
  Users,
  BarChart3,
  Bell,
  Bot,
  ShieldCheck,
  UserCheck,
  Calendar,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isAdmin =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    Boolean(user?.role && user.role.toLowerCase().includes('admin'));

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

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
          case 'c':
            navigate('/calendar');
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
    { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', shortcut: 'G' },
    { label: 'Open Work', icon: Briefcase, path: '/open-work', shortcut: 'O' },
    { label: 'My Claims', icon: Bookmark, path: '/my-claims', shortcut: 'M' },
    { label: 'Production Pipeline', icon: GitFork, path: '/pipeline', shortcut: 'P' },
    { label: 'Calendar', icon: Calendar, path: '/calendar', shortcut: 'C' },
    { label: 'Manga Catalog', icon: BookOpen, path: '/manga' },
    { label: 'Team Workload', icon: Users, path: '/team' },
    { label: 'Notification Center', icon: Bell, path: '/notifications' },
    ...(isAdmin ? [{ label: 'Admin Operations', icon: ShieldCheck, path: '/admin', shortcut: 'A' }] : []),
    ...(isAdmin ? [{ label: 'Admin Users & Approvals', icon: UserCheck, path: '/admin/users' }] : []),
    ...(isAdmin ? [{ label: 'Admin Manga & Chapters', icon: BookOpen, path: '/admin/manga' }] : []),
    ...(isAdmin ? [{ label: 'Admin Discord Bot', icon: Bot, path: '/admin/discord' }] : []),
    ...(isAdmin ? [{ label: 'Admin Analytics', icon: BarChart3, path: '/admin/analytics' }] : []),
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
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      <div className="relative z-50 w-full max-w-lg rounded-xl border border-zinc-800 bg-[#111215] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center border-b border-zinc-800 px-3.5 py-2.5">
          <Search className="h-4 w-4 text-zinc-500 mr-2.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to page..."
            autoFocus
            className="w-full bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">No matching destinations found</div>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelect(item.path)}
                  className="w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800/70 hover:text-white transition-colors text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <kbd className="rounded border border-zinc-700/80 bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-3 py-2 text-[10px] text-zinc-500 flex justify-between items-center font-mono">
          <span>Navigate with arrows or shortcuts</span>
          <div className="flex items-center gap-1.5">
            <span>Toggle:</span>
            <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[9px] text-zinc-400">⌘K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
