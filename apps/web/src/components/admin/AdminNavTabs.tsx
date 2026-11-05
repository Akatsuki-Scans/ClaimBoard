import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import {
  AnalyticsIcon,
  UserCheckIcon,
  MangaIcon,
  OpenWorkIcon,
  MyClaimsIcon,
  HashIcon,
  ShieldIcon,
  DiscordIcon,
} from '../ui/icon';
import { cn } from '@claimboard/ui';

export function AdminNavTabs() {
  const location = useLocation();
  const { data: teamData } = useQuery<{ stats: { pending: number } }>({
    queryKey: ['team', 'users', 'stats'],
    queryFn: () => apiRequest<{ stats: { pending: number } }>('/team/users').catch(() => ({ stats: { pending: 0 } })),
    refetchInterval: 10000,
  });

  const pendingCount = teamData?.stats?.pending || 0;

  const tabs = [
    { label: 'Overview', to: '/admin', icon: AnalyticsIcon },
    {
      label: 'Users & Approvals',
      to: '/admin/users',
      icon: UserCheckIcon,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    { label: 'Manga & Chapters', to: '/admin/manga', icon: MangaIcon },
    { label: 'Assignments', to: '/admin/assignments', icon: OpenWorkIcon },
    { label: 'Claims', to: '/admin/claims', icon: MyClaimsIcon },
    { label: 'Discord & Roles', to: '/admin/discord', icon: DiscordIcon },
    { label: 'Audit Log', to: '/admin/audit', icon: ShieldIcon },
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-zinc-800/80 mb-6 scrollbar-none relative">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(tab.to);

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/admin'}
            className="relative shrink-0"
          >
            <motion.div
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors relative z-10',
                isActive
                  ? 'text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="adminNavPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-lg -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
              <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-zinc-100' : 'text-zinc-400')} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="font-mono text-[10px] tabular-nums px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
                  {tab.badge}
                </span>
              )}
            </motion.div>
          </NavLink>
        );
      })}
    </div>
  );
}
