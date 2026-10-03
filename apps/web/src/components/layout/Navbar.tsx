import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, ChevronDown, Settings, LogOut, ShieldCheck, CheckSquare, Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

export function DiscordIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function Navbar() {
  const { user, logout } = useAuthStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: any[]; unreadCount: number }>('/notifications').catch(() => ({ notifications: [], unreadCount: 0 })),
    refetchInterval: 15000,
  });

  const unreadCount = notifData?.unreadCount || 0;

  const isAdmin =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    Boolean(user?.role && user.role.toLowerCase().includes('admin'));

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-14 border-b border-[#1a1d21] bg-[#0c0d0e]/95 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Global Search input */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Search manga, chapters, users..."
          onClick={() => {
            const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
            window.dispatchEvent(event);
          }}
          className="w-full h-9 pl-9 pr-10 rounded-lg bg-[#14161a] border border-[#23272f] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        <kbd className="absolute right-2.5 top-2 px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-[10px] text-zinc-400 font-mono">
          ⌘ K
        </kbd>
      </div>

      {/* Right Action Icons & User Pill */}
      <div className="flex items-center gap-4">
        {/* Notifications Icon */}
        <Link
          to="/notifications"
          className="relative text-zinc-400 hover:text-white transition-colors p-1"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
          )}
        </Link>

        {/* Discord Icon */}
        <Link
          to="/settings"
          className="text-zinc-400 hover:text-[#5865F2] transition-colors p-1"
          title={(user as any)?.discordUsername ? `Connected as ${(user as any).discordUsername}` : 'Discord Integration'}
        >
          <DiscordIcon className="h-4 w-4" />
        </Link>

        {/* User Profile Pill & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2.5 pl-2 py-1 pr-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer group focus:outline-none"
          >
            {user?.avatarUrl && !avatarFailed ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName || 'User'}
                onError={() => setAvatarFailed(true)}
                className="h-8 w-8 rounded-full object-cover border border-[#2a2e36]"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                {(user?.displayName || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="text-left leading-none hidden sm:block">
              <div className="text-xs font-semibold text-white tracking-tight">
                {user?.displayName || 'User'}
              </div>
              <div className="text-[10px] text-zinc-400 mt-1 capitalize">
                {user?.role || 'Worker'}
              </div>
            </div>
            <ChevronDown className={`h-3 w-3 text-zinc-500 group-hover:text-zinc-300 transition-transform ml-0.5 ${isDropdownOpen ? 'rotate-180 text-white' : ''}`} />
          </button>

          {/* Account Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-800 bg-[#111317] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100">
              {/* Profile Card Header */}
              <div className="p-3 border-b border-zinc-800/80 mb-1 flex items-center gap-3">
                {user?.avatarUrl && !avatarFailed ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="h-10 w-10 rounded-full object-cover border border-zinc-700 shrink-0"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-sm font-bold text-white">
                    {(user?.displayName || 'U').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">
                    {user?.displayName || 'User'}
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    {user?.email || ((user as any)?.discordUsername ? `@${(user as any).discordUsername}` : user?.username || '')}
                  </div>
                  <span className="inline-block mt-1 text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {user?.role || 'Worker'}
                  </span>
                </div>
              </div>

              {/* Navigation Links */}
              <div className="space-y-0.5 text-xs">
                <Link
                  to="/my-claims"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
                >
                  <CheckSquare className="h-4 w-4 text-zinc-400" />
                  <span>My Claims & Tasks</span>
                </Link>

                <Link
                  to="/pipeline"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
                >
                  <Layers className="h-4 w-4 text-zinc-400" />
                  <span>Production Pipeline</span>
                </Link>

                <Link
                  to="/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
                >
                  <Settings className="h-4 w-4 text-zinc-400" />
                  <span>Account Settings</span>
                </Link>

                {/* Conditional Admin Link in Dropdown */}
                {isAdmin && (
                  <Link
                    to="/admin"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-amber-300 hover:text-amber-200 hover:bg-amber-950/30 transition-colors font-medium"
                  >
                    <ShieldCheck className="h-4 w-4 text-amber-400" />
                    <span>Admin Panel</span>
                  </Link>
                )}
              </div>

              <div className="my-1 border-t border-zinc-800/80" />

              {/* Log Out Button */}
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 text-xs transition-colors"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
