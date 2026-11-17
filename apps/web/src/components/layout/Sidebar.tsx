import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  OpenWorkIcon,
  MyClaimsIcon,
  PipelineIcon,
  MangaIcon,
  HistoryIcon,
  TeamIcon,
  AnalyticsIcon,
  ClaimBoardLogoIcon,
  AdminIcon,
  UserCheckIcon,
  DiscordIcon,
  HashIcon,
  CloseIcon,
  CalendarIcon,
} from '../ui/icon';
import { useAuthStore } from '../../stores/authStore';
import { useUIStore } from '../../stores/uiStore';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { getBrowserTimeZone, getZonedDayBoundsIso } from '../../lib/deadlines';
import { cn } from '@claimboard/ui';

export function Sidebar() {
  const { user } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const location = useLocation();

  const { data: claims } = useQuery({
    queryKey: ['claims', 'my'],
    queryFn: () => apiRequest<any[]>('/claims/my').catch(() => []),
  });

  const activeClaimsCount =
    claims?.filter((c) => c.status === 'ACTIVE' || c.status === 'IN_PROGRESS' || c.status === 'CLAIMED')?.length || 0;

  const isAdmin =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    Boolean(user?.role && user.role.toLowerCase().includes('admin'));

  const { data: teamData } = useQuery<{ stats: { pending: number } }>({
    queryKey: ['team', 'users', 'stats'],
    queryFn: () => apiRequest<{ stats: { pending: number } }>('/team/users').catch(() => ({ stats: { pending: 0 } })),
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const pendingApprovalsCount = teamData?.stats?.pending || 0;

  const { data: tzData } = useQuery<{ timezone: string | null }>({
    queryKey: ['deadlines', 'timezone'],
    queryFn: () => apiRequest<{ timezone: string | null }>('/deadlines/timezone').catch(() => ({ timezone: null })),
  });
  const activeTimeZone = tzData?.timezone || getBrowserTimeZone();

  const { data: deadlineStats } = useQuery<{ summary?: { overdue?: number; dueToday?: number } }>({
    queryKey: ['deadlines', 'sidebar-summary', activeTimeZone],
    queryFn: () => {
      const { startIso, endIso } = getZonedDayBoundsIso(new Date(), activeTimeZone);
      const params = new URLSearchParams({ todayStart: startIso, todayEnd: endIso });
      return apiRequest<{ summary?: { overdue?: number; dueToday?: number } }>(
        `/deadlines?${params.toString()}`
      ).catch(() => ({}));
    },
    refetchInterval: 60000,
  });

  const urgentDeadlinesCount =
    (deadlineStats?.summary?.overdue || 0) + (deadlineStats?.summary?.dueToday || 0);

  const navLinks = [
    { label: 'Dashboard', to: '/dashboard', icon: HomeIcon },
    { label: 'Open Work', to: '/open-work', icon: OpenWorkIcon },
    { label: 'My Claims', to: '/my-claims', icon: MyClaimsIcon, badge: activeClaimsCount > 0 ? activeClaimsCount : undefined },
    { label: 'Pipeline', to: '/pipeline', icon: PipelineIcon },
    { label: 'Calendar', to: '/calendar', icon: CalendarIcon, badge: urgentDeadlinesCount > 0 ? urgentDeadlinesCount : undefined },
    { label: 'Manga', to: '/manga', icon: MangaIcon },
    { label: 'History', to: '/history', icon: HistoryIcon },
    { label: 'Team', to: '/users', icon: TeamIcon },
    { label: 'Analytics', to: '/analytics', icon: AnalyticsIcon },
  ];

  const adminLinks = [
    { label: 'Admin Overview', to: '/admin', icon: AdminIcon },
    {
      label: 'Users & Approvals',
      to: '/admin/users',
      icon: UserCheckIcon,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
    },
    { label: 'Manga & Chapters', to: '/admin/manga', icon: MangaIcon },
    { label: 'Discord & Roles', to: '/admin/discord', icon: DiscordIcon },
  ];

  const renderNavContent = () => (
    <div className="flex flex-col justify-between h-full">
      <div className="overflow-y-auto scrollbar-none">
        {/* Brand Header */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-zinc-800/80 sticky top-0 bg-[#090a0b] z-10">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: 90 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-zinc-100 flex items-center justify-center h-7 w-7 rounded-md bg-zinc-900 border border-zinc-800 shadow-sm cursor-pointer"
            >
              <ClaimBoardLogoIcon className="h-4 w-4 text-zinc-100" />
            </motion.div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs tracking-tight text-zinc-100 leading-tight">ClaimBoard</span>
              <span className="text-[10px] text-zinc-500 font-mono truncate">Scanlation Desk</span>
            </div>
          </div>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            aria-label="Close sidebar"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="p-3 space-y-1">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 px-2.5 pb-1 pt-1">
            Workspace
          </div>
          {navLinks.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.to === '/users'
                ? location.pathname.startsWith('/users') ||
                  location.pathname.startsWith('/user') ||
                  location.pathname.startsWith('/team')
                : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className="relative block"
              >
                <motion.div
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'flex items-center justify-between h-[34px] px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 group relative z-10',
                    isActive
                      ? 'text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-200'
                  )}
                >
                  {/* Fluid Framer Motion pill background */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebarActivePill"
                      className="absolute inset-0 bg-zinc-800/90 border border-zinc-700/60 rounded-lg -z-10 shadow-sm"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}

                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200')} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span className="text-[10px] font-mono tabular-nums bg-zinc-800 text-zinc-300 px-1.5 py-0.2 rounded border border-zinc-700/60 min-w-[18px] text-center">
                      {item.badge}
                    </span>
                  )}
                </motion.div>
              </NavLink>
            );
          })}

          {/* Admin Navigation Section */}
          {isAdmin && (
            <div className="pt-3 mt-2 border-t border-zinc-800/60 space-y-1">
              <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 px-2.5 pb-1">
                Administration
              </div>
              {adminLinks.map((item) => {
                const Icon = item.icon;
                const isActive = item.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.to);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setSidebarOpen(false)}
                    className="relative block"
                  >
                    <motion.div
                      whileHover={{ x: 3 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      className={cn(
                        'flex items-center justify-between h-[34px] px-2.5 rounded-lg text-xs font-medium transition-colors duration-150 group relative z-10',
                        isActive
                          ? 'text-zinc-100'
                          : 'text-zinc-400 hover:text-zinc-200'
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebarActivePill"
                          className="absolute inset-0 bg-zinc-800/90 border border-zinc-700/60 rounded-lg -z-10 shadow-sm"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}

                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200')} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge !== undefined && (
                        <span className="text-[10px] font-mono tabular-nums bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.2 rounded border border-amber-500/30 min-w-[18px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </motion.div>
                  </NavLink>
                );
              })}
            </div>
          )}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 border-r border-zinc-800 bg-[#090a0b] flex-col justify-between shrink-0 h-screen select-none sticky top-0 z-30">
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer (Framer Motion) */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="mobile-sidebar-root"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed inset-0 z-50 md:hidden flex"
          >
            {/* Backdrop */}
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            />

            {/* Off-canvas Sheet */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
              className="relative w-72 max-w-[85vw] bg-[#090a0b] border-r border-zinc-800 h-full z-10 shadow-2xl flex flex-col"
            >
              {renderNavContent()}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
