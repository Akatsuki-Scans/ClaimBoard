import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  OpenWorkIcon,
  MyClaimsIcon,
  PipelineIcon,
  MangaIcon,
  HistoryIcon,
  TeamIcon,
  AnalyticsIcon,
  SettingsIcon,
  ClaimBoardLogoIcon,
  AdminIcon,
} from '../ui/icon';
import { useAuthStore } from '../../stores/authStore';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { cn } from '@claimboard/ui';

export function Sidebar() {
  const { user } = useAuthStore();

  const { data: claims } = useQuery({
    queryKey: ['claims', 'my'],
    queryFn: () => apiRequest<any[]>('/claims/my').catch(() => []),
  });

  const { data: pipelineData } = useQuery({
    queryKey: ['pipeline'],
    queryFn: () => apiRequest<any[]>('/pipeline').catch(() => []),
  });

  const activeClaimsCount = claims?.filter((c) => c.status === 'ACTIVE' || c.status === 'IN_PROGRESS' || c.status === 'CLAIMED')?.length || 0;
  const pipelineCount = pipelineData?.length || 0;

  // Check if current authenticated user has Admin / Owner privileges
  const isAdmin =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    Boolean(user?.role && user.role.toLowerCase().includes('admin'));

  const navLinks = [
    { label: 'Dashboard', to: '/dashboard', icon: HomeIcon },
    { label: 'Open Work', to: '/open-work', icon: OpenWorkIcon },
    { label: 'My Claims', to: '/my-claims', icon: MyClaimsIcon, badge: activeClaimsCount > 0 ? activeClaimsCount : undefined },
    { label: 'Pipeline', to: '/pipeline', icon: PipelineIcon },
    { label: 'Manga', to: '/manga', icon: MangaIcon },
    { label: 'History', to: '/history', icon: HistoryIcon },
    { label: 'Team', to: '/team', icon: TeamIcon },
    { label: 'Analytics', to: '/analytics', icon: AnalyticsIcon },
    ...(isAdmin ? [{ label: 'Admin', to: '/admin', icon: AdminIcon }] : []),
  ];

  return (
    <aside className="w-56 border-r border-[#1a1d21] bg-[#0c0d0e] flex flex-col justify-between shrink-0 h-screen select-none sticky top-0 z-30">
      {/* Brand Header */}
      <div>
        <div className="h-14 px-5 flex items-center gap-2.5">
          <div className="text-white">
            <ClaimBoardLogoIcon className="h-6 w-6 text-white" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">ClaimBoard</span>
        </div>

        {/* Primary Navigation */}
        <nav className="px-3 pt-3 space-y-1">
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all group',
                    isActive
                      ? 'bg-[#181b20] text-white shadow-sm font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#14161a]'
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4 w-4 shrink-0 transition-colors" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="text-[10px] font-semibold bg-[#1f2329] text-zinc-300 px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}

          <div className="pt-4">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all',
                  isActive
                    ? 'bg-[#181b20] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#14161a]'
                )
              }
            >
              <SettingsIcon className="h-4 w-4 shrink-0" />
              <span>Settings</span>
            </NavLink>
          </div>
        </nav>
      </div>

      {/* Bottom Manga Illustration Card */}
      <div className="p-3">
        <div className="relative rounded-xl overflow-hidden border border-[#23272f] bg-[#121418] p-4 text-left shadow-lg group">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 filter grayscale contrast-125 transition-transform duration-700 group-hover:scale-105"
            style={{ backgroundImage: `url('/akatsuki.jpg')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d0e] via-[#0c0d0e]/60 to-transparent" />
          <div className="relative z-10 space-y-1">
            <p className="text-xs font-bold text-white leading-tight">
              Better<br />Faster<br />Together.
            </p>
            <p className="text-[10px] text-zinc-400 font-mono pt-1">— ClaimBoard v1.0</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
