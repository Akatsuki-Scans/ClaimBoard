import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  SearchIcon,
  BellIcon,
  ChevronDownIcon,
  DiscordIcon,
  ShieldIcon,
  CheckIcon,
  LayersIcon,
  MenuIcon,
} from '../ui/icon';
import { LogOut } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';

export function Navbar() {
  const { user, logout } = useAuthStore();
  const { toggleSidebar } = useUIStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () =>
      apiRequest<{ notifications: any[]; unreadCount: number }>('/notifications').catch(() => ({
        notifications: [],
        unreadCount: 0,
      })),
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
    <header className="h-14 border-b border-zinc-800 bg-[#090a0b]/90 backdrop-blur px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 select-none">
      {/* Left: Mobile hamburger menu toggle + Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          type="button"
          onClick={toggleSidebar}
          className="md:hidden p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
          aria-label="Toggle navigation menu"
        >
          <MenuIcon className="h-4 w-4" />
        </button>

        <div className="relative w-full">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search manga, chapters, tasks..."
            onClick={() => {
              const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true });
              window.dispatchEvent(event);
            }}
            className="w-full h-9 pl-9 pr-12 rounded-lg bg-[#111215] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors"
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-2 px-1.5 py-0.5 rounded border border-zinc-700/80 bg-zinc-800/80 text-[10px] text-zinc-400 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right Action Icons & User Pill */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Notifications Icon */}
        <Link
          to="/notifications"
          className="relative text-zinc-400 hover:text-zinc-200 transition-colors p-2 rounded-lg hover:bg-zinc-800/60"
          title="Notification center"
        >
          <BellIcon className="h-4 w-4" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#090a0b]"
            />
          )}
        </Link>

        {/* Discord Bot Link if Admin */}
        {isAdmin && (
          <Link
            to="/admin/discord"
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-2 rounded-lg hover:bg-zinc-800/60"
            title="Discord bot configuration"
          >
            <DiscordIcon className="h-4 w-4" />
          </Link>
        )}

        {/* User Profile Pill & Dropdown */}
        <div className="relative ml-1" ref={dropdownRef}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-zinc-800/60 border border-transparent hover:border-zinc-800 transition-colors cursor-pointer group focus:outline-none"
          >
            {user?.avatarUrl && !avatarFailed ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName || 'User'}
                onError={() => setAvatarFailed(true)}
                className="h-7 w-7 rounded-full object-cover border border-zinc-700"
              />
            ) : (
              <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-medium text-zinc-200">
                {(user?.displayName || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}

            <div className="text-left leading-tight hidden sm:block">
              <div className="text-xs font-medium text-zinc-200 group-hover:text-white transition-colors">
                {user?.displayName || 'User'}
              </div>
              <div className="text-[10px] text-zinc-500 capitalize">
                {user?.role || 'Worker'}
              </div>
            </div>
            <ChevronDownIcon
              className={`h-3 w-3 text-zinc-500 transition-transform duration-150 ml-0.5 ${
                isDropdownOpen ? 'rotate-180 text-zinc-300' : ''
              }`}
            />
          </motion.button>

          {/* Animated Account Dropdown Menu */}
          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-64 rounded-xl border border-zinc-800 bg-[#111215] p-2 shadow-2xl z-50"
              >
                {/* Profile Card Header */}
                <div className="p-2.5 border-b border-zinc-800/80 mb-1 flex items-center gap-2.5">
                  {user?.avatarUrl && !avatarFailed ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.displayName}
                      className="h-9 w-9 rounded-full object-cover border border-zinc-700 shrink-0"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-medium text-zinc-200">
                      {(user?.displayName || 'U').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-zinc-100 truncate">
                      {user?.displayName || 'User'}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">
                      {user?.email ||
                        ((user as any)?.discordUsername
                          ? `@${(user as any).discordUsername}`
                          : user?.username || '')}
                    </div>
                    <span className="inline-block mt-0.5 text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                      {user?.role || 'Worker'}
                    </span>
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="space-y-0.5 text-xs">
                  <Link
                    to="/my-claims"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
                  >
                    <CheckIcon className="h-4 w-4 text-zinc-500" />
                    <span>My claims & tasks</span>
                  </Link>

                  <Link
                    to="/pipeline"
                    onClick={() => setIsDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800/70 transition-colors"
                  >
                    <LayersIcon className="h-4 w-4 text-zinc-500" />
                    <span>Production pipeline</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-200 hover:text-white hover:bg-zinc-800/70 transition-colors"
                    >
                      <ShieldIcon className="h-4 w-4 text-zinc-400" />
                      <span>Admin panel</span>
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
                  className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
