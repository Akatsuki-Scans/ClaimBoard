import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { UserAvatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import {
  TeamIcon,
  MangaIcon,
  PlusIcon,
  SearchIcon,
  DiscordIcon,
  ShieldIcon,
  CheckIcon,
} from '../../components/ui/icon';
import {
  Users,
  UserPlus,
  Trash2,
  ArrowUpDown,
  Sparkles,
  Layers,
  X,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';

interface TeamMember {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  discordUsername?: string;
  discordId?: string;
  systemRole: string;
  teamRole: string;
  availability: string;
  workload: string;
  activeClaimsCount: number;
  completedTasksCount: number;
  joinedAt?: string;
}

interface MangaTeam {
  id: string;
  name: string;
  description?: string;
  manga?: {
    id: string;
    title: string;
    coverUrl?: string;
    status: string;
    discordRoleId?: string;
    discordRoleName?: string;
  } | null;
  discordRoleId?: string;
  discordRoleName?: string;
  members: TeamMember[];
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export function TeamPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Management Permission Check (Admin, Owner, Manager)
  const isAdmin =
    user?.role === 'Administrator' ||
    user?.role === 'Owner' ||
    user?.role === 'Manager' ||
    Boolean(user?.role && user.role.toLowerCase().includes('admin'));

  // Active Sub-tab
  const [subTab, setSubTab] = useState<'teams' | 'directory' | 'workload'>('teams');

  // Search & Sorting States
  const [teamSearch, setTeamSearch] = useState('');
  const [teamSort, setTeamSort] = useState<
    'manga-asc' | 'manga-desc' | 'name-asc' | 'members-desc' | 'members-asc' | 'newest'
  >('newest');

  const [dirSearch, setDirSearch] = useState('');
  const [dirRoleFilter, setDirRoleFilter] = useState('All');
  const [dirSort, setDirSort] = useState<'name-asc' | 'active-desc' | 'completed-desc' | 'role'>('name-asc');

  // Modal States
  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedTeamForMember, setSelectedTeamForMember] = useState<MangaTeam | null>(null);

  // Create Team Form State
  const [createName, setCreateName] = useState('');
  const [createMangaId, setCreateMangaId] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDiscordRoleId, setCreateDiscordRoleId] = useState('');
  const [createDiscordRoleName, setCreateDiscordRoleName] = useState('');

  // Add Member Form State
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('Translator');

  // 1. Fetch Manga Teams
  const { data: teamsData, isLoading: isTeamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiRequest<MangaTeam[]>('/team/teams').catch(() => []),
  });

  // 2. Fetch Directory Staff (Bug fixed: only approved users)
  const { data: staffData, isLoading: isStaffLoading } = useQuery({
    queryKey: ['team', 'workload'],
    queryFn: () => apiRequest<any[]>('/team/workload').catch(() => []),
  });

  // 3. Fetch Manga List (for Manga selection dropdown)
  const { data: mangasData } = useQuery({
    queryKey: ['manga', 'list-all'],
    queryFn: () => apiRequest<any[]>('/manga').catch(() => []),
  });

  // Filter out any unapproved users just in case
  const approvedStaff: any[] = useMemo(() => {
    return (staffData || []).filter((u: any) => u.isApproved !== false);
  }, [staffData]);

  const mangas: any[] = mangasData || [];
  const teams: MangaTeam[] = teamsData || [];

  // Auto-fill Discord Role info when manga is selected in Create Team Modal
  const handleSelectManga = (mangaId: string) => {
    setCreateMangaId(mangaId);
    if (!mangaId) return;
    const selected = mangas.find((m) => m.id === mangaId || m._id === mangaId);
    if (selected) {
      if (selected.discordRoleId && !createDiscordRoleId) {
        setCreateDiscordRoleId(selected.discordRoleId);
      }
      if (selected.discordRoleName && !createDiscordRoleName) {
        setCreateDiscordRoleName(selected.discordRoleName);
      }
      if (!createName) {
        setCreateName(`${selected.title} Team`);
      }
    }
  };

  // --- Mutations ---

  // Create Team Mutation
  const createTeamMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/team/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          mangaId: createMangaId || undefined,
          description: createDescription.trim(),
          discordRoleId: createDiscordRoleId.trim() || undefined,
          discordRoleName: createDiscordRoleName.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsCreateTeamOpen(false);
      setCreateName('');
      setCreateMangaId('');
      setCreateDescription('');
      setCreateDiscordRoleId('');
      setCreateDiscordRoleName('');
    },
  });

  // Delete Team Mutation
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      return apiRequest(`/team/teams/${teamId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  // Add Member to Team Mutation
  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTeamForMember || !addMemberUserId) return;
      return apiRequest(`/team/teams/${selectedTeamForMember.id}/members`, {
        method: 'POST',
        body: JSON.stringify({
          userId: addMemberUserId,
          role: addMemberRole,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsAddMemberOpen(false);
      setSelectedTeamForMember(null);
      setAddMemberUserId('');
      setAddMemberRole('Translator');
    },
  });

  // Remove Member from Team Mutation
  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      return apiRequest(`/team/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });

  // --- Filtering & Sorting Manga Teams ---
  const filteredAndSortedTeams = useMemo(() => {
    let result = teams.filter((t) => {
      if (!teamSearch.trim()) return true;
      const q = teamSearch.toLowerCase().trim();
      const matchName = t.name?.toLowerCase().includes(q);
      const matchManga = t.manga?.title?.toLowerCase().includes(q);
      const matchRole = t.discordRoleName?.toLowerCase().includes(q);
      const matchMember = (t.members || []).some(
        (m) =>
          m.displayName?.toLowerCase().includes(q) ||
          m.username?.toLowerCase().includes(q) ||
          m.teamRole?.toLowerCase().includes(q)
      );
      return matchName || matchManga || matchRole || matchMember;
    });

    result = [...result].sort((a, b) => {
      switch (teamSort) {
        case 'manga-asc':
          return (a.manga?.title || a.name).localeCompare(b.manga?.title || b.name);
        case 'manga-desc':
          return (b.manga?.title || b.name).localeCompare(a.manga?.title || a.name);
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'members-desc':
          return (b.memberCount || 0) - (a.memberCount || 0);
        case 'members-asc':
          return (a.memberCount || 0) - (b.memberCount || 0);
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [teams, teamSearch, teamSort]);

  // --- Filtering & Sorting Staff Directory ---
  const filteredAndSortedStaff = useMemo(() => {
    let result = approvedStaff.filter((m) => {
      if (dirRoleFilter !== 'All' && m.role?.toLowerCase() !== dirRoleFilter.toLowerCase()) {
        return false;
      }
      if (!dirSearch.trim()) return true;
      const q = dirSearch.toLowerCase().trim();
      return (
        m.displayName?.toLowerCase().includes(q) ||
        m.username?.toLowerCase().includes(q) ||
        m.discordUsername?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
      );
    });

    result = [...result].sort((a, b) => {
      switch (dirSort) {
        case 'active-desc':
          return (b.activeClaimsCount || 0) - (a.activeClaimsCount || 0);
        case 'completed-desc':
          return (b.completedTasksCount || 0) - (a.completedTasksCount || 0);
        case 'role':
          return (a.role || '').localeCompare(b.role || '');
        case 'name-asc':
        default:
          return (a.displayName || a.username).localeCompare(b.displayName || b.username);
      }
    });

    return result;
  }, [approvedStaff, dirSearch, dirRoleFilter, dirSort]);

  // Role pill colors for Manga Team Roles
  const getRoleBadgeColor = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r.includes('translat') || r === 'tl') return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    if (r.includes('clean') || r === 'cl') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    if (r.includes('type') || r === 'ts') return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    if (r.includes('proof') || r === 'pr') return 'bg-pink-500/10 text-pink-400 border-pink-500/30';
    if (r.includes('qual') || r.includes('check') || r === 'qc') return 'bg-teal-500/10 text-teal-400 border-teal-500/30';
    if (r.includes('redraw') || r === 'rd') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    if (r.includes('lead') || r.includes('mgr') || r.includes('admin')) return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    return 'bg-zinc-800 text-zinc-300 border-zinc-700/60';
  };

  return (
    <div className="space-y-6 max-w-[1440px] mx-auto text-zinc-100 select-none pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-zinc-100 tracking-tight">Teams & Staff</h1>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700/60 text-zinc-400">
              {teams.length} Teams • {approvedStaff.length} Approved Staff
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Organize manga production teams, monitor series crew discord roles, and track staff workload
          </p>
        </div>

        {/* Action Header & Subtab Switcher */}
        <div className="flex items-center gap-2.5">
          {/* Subtab Switcher */}
          <div className="flex items-center gap-1 bg-[#111215] border border-zinc-800 p-0.5 rounded-lg text-xs relative">
            <button
              onClick={() => setSubTab('teams')}
              className={`relative px-3 py-1.5 rounded-md transition-colors z-10 font-medium ${
                subTab === 'teams' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {subTab === 'teams' && (
                <motion.div
                  layoutId="teamSubTabPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <span className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-zinc-300" />
                Manga Teams
              </span>
            </button>
            <button
              onClick={() => setSubTab('directory')}
              className={`relative px-3 py-1.5 rounded-md transition-colors z-10 font-medium ${
                subTab === 'directory' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {subTab === 'directory' && (
                <motion.div
                  layoutId="teamSubTabPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-zinc-300" />
                Directory
              </span>
            </button>
            <button
              onClick={() => setSubTab('workload')}
              className={`relative px-3 py-1.5 rounded-md transition-colors z-10 font-medium ${
                subTab === 'workload' ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {subTab === 'workload' && (
                <motion.div
                  layoutId="teamSubTabPill"
                  className="absolute inset-0 bg-zinc-800 border border-zinc-700/60 rounded-md -z-10 shadow-sm"
                  transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                />
              )}
              Workload
            </button>
          </div>

          {/* Admin Create Team Button */}
          {isAdmin && subTab === 'teams' && (
            <Button
              onClick={() => setIsCreateTeamOpen(true)}
              variant="primary"
              size="sm"
              className="gap-1.5 shadow-sm"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              <span>Create Team</span>
            </Button>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* SUB-TAB 1: MANGA TEAMS & CREWS */}
      {/* ======================================================== */}
      {subTab === 'teams' && (
        <div className="space-y-4">
          {/* Filter & Sort Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111215] border border-zinc-800/80 p-3 rounded-xl">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Search manga title, team name, member..."
                className="pl-9 h-8 text-xs bg-zinc-900/60 border-zinc-800 focus:border-zinc-700"
              />
              {teamSearch && (
                <button
                  onClick={() => setTeamSearch('')}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Sort Options */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-zinc-400 flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3 text-zinc-500" />
                Sort:
              </span>
              <select
                value={teamSort}
                onChange={(e) => setTeamSort(e.target.value as any)}
                aria-label="Sort manga teams"
                className="h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 focus:outline-none focus:border-zinc-700"
              >
                <option value="newest">Recently Created</option>
                <option value="manga-asc">Manga Name (A → Z)</option>
                <option value="manga-desc">Manga Name (Z → A)</option>
                <option value="name-asc">Team Name (A → Z)</option>
                <option value="members-desc">Most Members</option>
                <option value="members-asc">Least Members</option>
              </select>
            </div>
          </div>

          {/* Teams Grid */}
          {isTeamsLoading ? (
            <div className="py-20 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
              Loading manga production teams...
            </div>
          ) : filteredAndSortedTeams.length === 0 ? (
            <div className="py-20 text-center border border-dashed border-zinc-800 rounded-xl p-8 space-y-3">
              <div className="h-10 w-10 mx-auto rounded-xl bg-zinc-900 flex items-center justify-center border border-zinc-800 text-zinc-500">
                <Layers className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium text-zinc-300">No manga teams found</div>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {teamSearch
                  ? 'No teams match your search criteria. Try a different keyword.'
                  : 'Create dedicated crews for manga series to link Discord roles, organize translators, and manage chapter production.'}
              </p>
              {isAdmin && !teamSearch && (
                <Button
                  onClick={() => setIsCreateTeamOpen(true)}
                  variant="primary"
                  size="sm"
                  className="mt-2"
                >
                  <PlusIcon className="h-3.5 w-3.5 mr-1" />
                  Create First Team
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAndSortedTeams.map((team) => (
                <motion.div
                  key={team.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-zinc-800 bg-[#111215] flex flex-col justify-between overflow-hidden transition-all duration-200 hover:border-zinc-700/80 shadow-sm"
                >
                  {/* Card Top: Manga & Discord Role */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Manga Cover or Fallback Icon */}
                        {team.manga?.coverUrl ? (
                          <img
                            src={team.manga.coverUrl}
                            alt={team.manga.title}
                            className="h-12 w-9 rounded-md object-cover border border-zinc-800 shrink-0 shadow-sm"
                          />
                        ) : (
                          <div className="h-12 w-9 rounded-md bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center shrink-0 text-zinc-400">
                            <MangaIcon className="h-4 w-4" />
                          </div>
                        )}

                        <div className="min-w-0">
                          {team.manga ? (
                            <Link
                              to={`/manga/${team.manga.id}`}
                              className="text-xs font-semibold text-zinc-100 hover:text-white transition-colors truncate block group flex items-center gap-1"
                            >
                              <span className="truncate">{team.manga.title}</span>
                              <ExternalLink className="h-2.5 w-2.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </Link>
                          ) : (
                            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider block">
                              General Team
                            </span>
                          )}
                          <h2 className="text-sm font-semibold text-zinc-200 mt-0.5 truncate">
                            {team.name}
                          </h2>
                          {team.description && (
                            <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
                              {team.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Admin Delete Action */}
                      {isAdmin && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete manga team "${team.name}"?`)) {
                              deleteTeamMutation.mutate(team.id);
                            }
                          }}
                          className="text-zinc-600 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors shrink-0"
                          title="Delete team"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Discord Role Mapping Badge */}
                    <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {team.discordRoleName || team.discordRoleId ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#5865F2]/10 border border-[#5865F2]/30 text-[#9bb0f5] text-[11px] font-mono truncate shadow-xs"
                            title={`Discord Role: ${team.discordRoleName || team.discordRoleId}`}
                          >
                            <DiscordIcon className="h-3 w-3 text-[#5865F2] shrink-0" />
                            <span className="truncate">
                              @{team.discordRoleName || `Role ${team.discordRoleId}`}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-zinc-500 italic font-mono flex items-center gap-1">
                            <DiscordIcon className="h-2.5 w-2.5 text-zinc-600" />
                            No Discord role mapped
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                        {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
                      </span>
                    </div>

                    {/* Members List */}
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                        Assigned Crew
                      </div>

                      {team.members.length === 0 ? (
                        <div className="py-4 text-center text-[11px] text-zinc-500 bg-zinc-900/40 rounded-lg border border-zinc-800/60">
                          No members assigned yet
                        </div>
                      ) : (
                        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {team.members.map((m) => (
                            <div
                              key={m.userId}
                              className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-zinc-900/60 border border-zinc-800/50 hover:border-zinc-700/60 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <UserAvatar src={m.avatarUrl} name={m.displayName} size="sm" />
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-zinc-200 truncate">
                                    {m.displayName}
                                  </div>
                                  {m.discordUsername && (
                                    <div className="text-[10px] text-zinc-500 truncate">
                                      @{m.discordUsername}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${getRoleBadgeColor(
                                    m.teamRole
                                  )}`}
                                >
                                  {m.teamRole}
                                </span>

                                {isAdmin && (
                                  <button
                                    onClick={() => {
                                      removeMemberMutation.mutate({
                                        teamId: team.id,
                                        userId: m.userId,
                                      });
                                    }}
                                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                    title={`Remove ${m.displayName} from this team`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: Admin Add Member Button */}
                  {isAdmin && (
                    <div className="p-3 bg-zinc-900/40 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                      <Button
                        onClick={() => {
                          setSelectedTeamForMember(team);
                          setIsAddMemberOpen(true);
                        }}
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs gap-1.5 h-8 bg-zinc-800/70 hover:bg-zinc-800 border-zinc-700/60 text-zinc-200"
                      >
                        <UserPlus className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Add Member</span>
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: APPROVED STAFF DIRECTORY */}
      {/* ======================================================== */}
      {subTab === 'directory' && (
        <div className="space-y-4">
          {/* Search, Filter & Sort */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111215] border border-zinc-800/80 p-3 rounded-xl">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                value={dirSearch}
                onChange={(e) => setDirSearch(e.target.value)}
                placeholder="Search staff by name, discord, or email..."
                className="pl-9 h-8 text-xs bg-zinc-900/60 border-zinc-800 focus:border-zinc-700"
              />
              {dirSearch && (
                <button
                  onClick={() => setDirSearch('')}
                  className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {/* Role Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">Role:</span>
                <select
                  value={dirRoleFilter}
                  onChange={(e) => setDirRoleFilter(e.target.value)}
                  aria-label="Filter staff by role"
                  className="h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 focus:outline-none focus:border-zinc-700"
                >
                  <option value="All">All Roles</option>
                  <option value="Administrator">Administrator</option>
                  <option value="Manager">Manager</option>
                  <option value="Translator">Translator</option>
                  <option value="Proofreader">Proofreader</option>
                  <option value="Cleaner">Cleaner</option>
                  <option value="Typesetter">Typesetter</option>
                  <option value="Redrawer">Redrawer</option>
                  <option value="QualityChecker">Quality Checker</option>
                  <option value="Worker">Worker</option>
                </select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">Sort:</span>
                <select
                  value={dirSort}
                  onChange={(e) => setDirSort(e.target.value as any)}
                  aria-label="Sort staff directory"
                  className="h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 px-2.5 focus:outline-none focus:border-zinc-700"
                >
                  <option value="name-asc">Name (A → Z)</option>
                  <option value="active-desc">Most Active Slots</option>
                  <option value="completed-desc">Most Completed Tasks</option>
                  <option value="role">Role</option>
                </select>
              </div>
            </div>
          </div>

          {/* Directory Table */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-medium">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">System Role</th>
                    <th className="py-3 px-4">Discord ID</th>
                    <th className="py-3 px-4">Active Tasks</th>
                    <th className="py-3 px-4">Completed</th>
                    <th className="py-3 px-4 text-right">Availability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                  {isStaffLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                        Loading verified staff directory...
                      </td>
                    </tr>
                  ) : filteredAndSortedStaff.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs text-zinc-500">
                        No approved staff members found
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedStaff.map((m) => (
                      <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar src={m.avatarUrl} name={m.displayName} size="md" />
                            <div>
                              <div className="font-medium text-zinc-100 flex items-center gap-1.5">
                                <span>{m.displayName}</span>
                                {m.isApproved && (
                                  <span
                                    title="Verified & Approved"
                                    className="text-emerald-400"
                                  >
                                    <CheckIcon className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 font-mono">
                                @{m.username}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${
                              m.role === 'Administrator' || m.role === 'Owner'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : m.role === 'Manager'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-zinc-800 text-zinc-300 border-zinc-700/60'
                            }`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                          {m.discordUsername ? `@${m.discordUsername}` : m.discordId || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-zinc-300">
                          {m.activeClaimsCount || 0} active
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-zinc-400">
                          {m.completedTasksCount || 0} done
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border ${
                              m.availability === 'Working' || m.availability === 'Available'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : m.availability === 'Away'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                            }`}
                          >
                            <span className="h-1 w-1 rounded-full bg-current mr-1.5" />
                            {m.availability || 'Available'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: WORKLOAD GRID */}
      {/* ======================================================== */}
      {subTab === 'workload' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {approvedStaff.length === 0 ? (
            <div className="col-span-full p-12 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
              No staff members registered yet
            </div>
          ) : (
            approvedStaff.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-zinc-800 bg-[#111215] p-4 space-y-3 transition-colors hover:border-zinc-700/80 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar src={m.avatarUrl} name={m.displayName} size="lg" />
                    <div className="min-w-0">
                      <div className="font-medium text-xs text-zinc-100 truncate">
                        {m.displayName}
                      </div>
                      <div className="text-[10px] text-zinc-400 capitalize">{m.role}</div>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border shrink-0 ${
                      m.workload === 'High' || m.workload === 'Overloaded'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}
                  >
                    {m.workload || 'Normal'}
                  </span>
                </div>

                <div className="text-xs text-zinc-400 font-mono">
                  Active assignments:{' '}
                  <span className="text-zinc-200 tabular-nums font-semibold">
                    {m.activeClaimsCount || 0}
                  </span>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-zinc-500">
                    Turnaround: {m.averageCompletionHours || 24}h avg
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] border ${
                      m.availability === 'Working' || m.availability === 'Available'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : m.availability === 'Away'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
                    }`}
                  >
                    {m.availability || 'Available'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: CREATE MANGA TEAM */}
      {/* ======================================================== */}
      <Modal
        isOpen={isCreateTeamOpen}
        onClose={() => setIsCreateTeamOpen(false)}
        title="Create Manga Production Team"
        description="Establish a dedicated scanlation crew for a manga series and link its Discord role"
      >
        <div className="space-y-4">
          {/* Team Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Team Name <span className="text-rose-400">*</span>
            </label>
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Dandadan Scan Crew"
              className="bg-zinc-900 border-zinc-800"
            />
          </div>

          {/* Manga Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Associated Manga Series
            </label>
            <select
              value={createMangaId}
              onChange={(e) => handleSelectManga(e.target.value)}
              className="w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 px-3 focus:outline-none focus:border-zinc-700"
            >
              <option value="">None / General Organization Team</option>
              {mangas.map((m) => (
                <option key={m.id || m._id} value={m.id || m._id}>
                  {m.title} {m.discordRoleName ? `(@${m.discordRoleName})` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-zinc-500">
              Selecting a manga series will automatically detect and link its mapped Discord role.
            </p>
          </div>

          {/* Discord Role Name & ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                <DiscordIcon className="h-3 w-3 text-[#5865F2]" />
                Discord Role Name
              </label>
              <Input
                value={createDiscordRoleName}
                onChange={(e) => setCreateDiscordRoleName(e.target.value)}
                placeholder="e.g. Dandadan-Staff"
                className="bg-zinc-900 border-zinc-800 text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                Discord Role ID
              </label>
              <Input
                value={createDiscordRoleId}
                onChange={(e) => setCreateDiscordRoleId(e.target.value)}
                placeholder="e.g. 112233445566778899"
                className="bg-zinc-900 border-zinc-800 text-xs font-mono"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">Description (Optional)</label>
            <Textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder="e.g. Core staff responsible for translating, cleaning, and quality checking weekly chapters"
              className="bg-zinc-900 border-zinc-800 text-xs"
              rows={2}
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateTeamOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={createTeamMutation.isPending}
              disabled={!createName.trim()}
              onClick={() => createTeamMutation.mutate()}
            >
              Create Team
            </Button>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL 2: ADD MEMBER TO MANGA TEAM */}
      {/* ======================================================== */}
      <Modal
        isOpen={isAddMemberOpen}
        onClose={() => {
          setIsAddMemberOpen(false);
          setSelectedTeamForMember(null);
        }}
        title={`Add Member to ${selectedTeamForMember?.name || 'Team'}`}
        description="Select an approved staff member and assign their production role. They will receive an instant in-app notification."
      >
        <div className="space-y-4">
          {/* Member Picker */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Staff Member <span className="text-rose-400">*</span>
            </label>
            <select
              value={addMemberUserId}
              onChange={(e) => setAddMemberUserId(e.target.value)}
              className="w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 px-3 focus:outline-none focus:border-zinc-700"
            >
              <option value="">Select an approved staff member...</option>
              {approvedStaff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} (@{u.username}) — {u.role} ({u.activeClaimsCount || 0} active)
                </option>
              ))}
            </select>
          </div>

          {/* Team Role */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Manga Team Role <span className="text-rose-400">*</span>
            </label>
            <select
              value={addMemberRole}
              onChange={(e) => setAddMemberRole(e.target.value)}
              className="w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 px-3 focus:outline-none focus:border-zinc-700"
            >
              <option value="Translator">Translator (TL)</option>
              <option value="Proofreader">Proofreader (PR)</option>
              <option value="Cleaner">Cleaner (CL)</option>
              <option value="Redrawer">Redrawer (RD)</option>
              <option value="Typesetter">Typesetter (TS)</option>
              <option value="Quality Checker">Quality Checker (QC)</option>
              <option value="Team Lead">Team Lead / Project Manager</option>
              <option value="Raw Provider">Raw Provider</option>
              <option value="Member">General Member</option>
            </select>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300 flex items-start gap-2">
            <Sparkles className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
            <span>
              The member will automatically receive an in-app notification alerting them that they have been assigned to this manga team.
            </span>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddMemberOpen(false);
                setSelectedTeamForMember(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={addMemberMutation.isPending}
              disabled={!addMemberUserId}
              onClick={() => addMemberMutation.mutate()}
            >
              Add to Team
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
