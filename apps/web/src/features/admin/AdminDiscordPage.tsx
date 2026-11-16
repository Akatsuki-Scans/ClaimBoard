import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { HashIcon, TeamIcon, PlusIcon, DiscordIcon, ActivityIcon } from '../../components/ui/icon';
import { Eye, Trash2 } from 'lucide-react';

export function AdminDiscordPage() {
  const queryClient = useQueryClient();

  // Guild & Server Role State
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [channelSelectMode, setChannelSelectMode] = useState<'picker' | 'manual'>('picker');
  const [createRoleName, setCreateRoleName] = useState('');
  const [createRoleColor, setCreateRoleColor] = useState('#818cf8');
  const [isRolePickerMode, setIsRolePickerMode] = useState(true);

  // New Channel Mapping State
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMangaId, setSelectedMangaId] = useState('');

  // New Role Mapping State
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleId, setNewRoleId] = useState('');

  // New Log Channel State
  const [newLogChannelId, setNewLogChannelId] = useState('');
  const [newLogChannelName, setNewLogChannelName] = useState('');

  // Announcement Builder State
  const [embedTitle, setEmbedTitle] = useState('New chapter announced: One Piece — Ch. 1150');
  const [embedDescription, setEmbedDescription] = useState('Tasks are now open for claiming directly via Discord buttons or the web board.');
  const [embedColor, setEmbedColor] = useState('#6366f1');

  // Queries
  const { data: guilds, isLoading: isGuildsLoading } = useQuery({
    queryKey: ['discord', 'guilds'],
    queryFn: () => apiRequest<any[]>('/discord/guilds').catch(() => []),
  });

  const { data: serverRoles, isLoading: isServerRolesLoading } = useQuery({
    queryKey: ['discord', 'server-roles'],
    queryFn: () => apiRequest<any[]>('/discord/server-roles').catch(() => []),
  });

  const { data: channels, isLoading: isChannelsLoading } = useQuery({
    queryKey: ['discord', 'channels'],
    queryFn: () => apiRequest<any[]>('/discord/channels'),
  });

  const { data: roles, isLoading: isRolesLoading } = useQuery({
    queryKey: ['discord', 'roles'],
    queryFn: () => apiRequest<any[]>('/discord/roles'),
  });

  const { data: mangas } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga'),
  });

  const { data: workTypes } = useQuery({
    queryKey: ['work-types'],
    queryFn: () => apiRequest<any[]>('/work-types'),
  });

  const { data: logChannels, isLoading: isLogChannelsLoading } = useQuery({
    queryKey: ['discord', 'log-channels'],
    queryFn: () => apiRequest<any[]>('/discord/log-channels').catch(() => []),
  });

  // Automatically select first guild when guilds data is available
  const activeGuild = guilds?.find((g: any) => g.id === selectedGuildId) || guilds?.[0];

  const createRoleMutation = useMutation({
    mutationFn: async () => {
      if (!createRoleName.trim()) throw new Error('Role name is required');
      return apiRequest<any>('/discord/create-role', {
        method: 'POST',
        body: JSON.stringify({
          name: createRoleName.trim(),
          color: createRoleColor,
          guildId: selectedGuildId || activeGuild?.id,
        }),
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'server-roles'] });
      setCreateRoleName('');
      setNewRoleId(created.id);
      setNewRoleName(created.name);
    },
  });

  const addLogChannelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/discord/log-channels', {
        method: 'POST',
        body: JSON.stringify({
          channelId: newLogChannelId,
          channelName: newLogChannelName,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'log-channels'] });
      setNewLogChannelId('');
      setNewLogChannelName('');
    },
  });

  const deleteLogChannelMutation = useMutation({
    mutationFn: async (logId: string) => {
      return apiRequest(`/discord/log-channels/${logId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'log-channels'] });
    },
  });

  // Save Channel Mapping Mutation
  const channelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/discord/channels', {
        method: 'POST',
        body: JSON.stringify({
          guildId: selectedGuildId || activeGuild?.id,
          channelId: newChannelId.trim(),
          channelName: newChannelName.trim(),
          mangaId: selectedMangaId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'channels'] });
      setNewChannelId('');
      setNewChannelName('');
      setSelectedMangaId('');
    },
  });

  // Delete Channel Mapping Mutation
  const deleteChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      return apiRequest(`/discord/channels/${channelId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'channels'] });
    },
  });

  // Save Role Mapping Mutation
  const roleMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/discord/roles', {
        method: 'POST',
        body: JSON.stringify({
          workTypeId: selectedWorkTypeId,
          roleName: newRoleName,
          roleId: newRoleId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'roles'] });
      setSelectedWorkTypeId('');
      setNewRoleName('');
      setNewRoleId('');
    },
  });

  // Delete Role Mapping Mutation
  const deleteRoleMutation = useMutation({
    mutationFn: async (roleMappingId: string) => {
      return apiRequest(`/discord/roles/${roleMappingId}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['discord', 'roles'] });
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto text-zinc-100 select-none pb-12">
      {/* Top Admin Sub-Navigation Tabs */}
      <AdminNavTabs />

      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
          <DiscordIcon className="h-4 w-4 text-[#5865F2]" />
          Discord bot integration, channels & role mapping
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Map Discord channels to series and configure automated role pings for stage releases
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Channel & Role Mappings */}
        <div className="space-y-6">
          {/* Channel Mapping */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <HashIcon className="h-3.5 w-3.5 text-zinc-400" />
                  Channel to series mappings
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Commands executed in these channels link automatically to the corresponding series
                </p>
              </div>
              <Badge variant="outline">
                {channels?.length || 0} mapped
              </Badge>
            </div>

            {isChannelsLoading ? (
              <div className="p-6 text-center text-xs text-zinc-500 font-mono">Loading channel mappings...</div>
            ) : !channels || channels.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No Discord channels mapped yet. Use the form below to link a channel to a series.
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-zinc-800/80">
                {channels.map((ch: any) => (
                  <div key={ch.id} className="pt-2.5 pb-1 flex items-center justify-between text-xs group gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Server Guild PFP */}
                      <div className="h-7 w-7 rounded-full bg-zinc-800 border border-zinc-700/80 overflow-hidden shrink-0 flex items-center justify-center">
                        {ch.guildIcon ? (
                          <img src={ch.guildIcon} alt={ch.guildName || 'Server'} className="h-full w-full object-cover" />
                        ) : (
                          <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-[11px] text-zinc-300 truncate">
                            {ch.guildName || 'Discord Server'}
                          </span>
                          <span className="font-mono text-zinc-200 bg-zinc-800/80 px-1.5 py-0.5 rounded border border-zinc-700/60 text-[10px] shrink-0">
                            #{ch.channelName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-0.5">
                          <span className="text-zinc-500">→</span>
                          <span className="font-semibold text-zinc-100 truncate">{ch.mangaTitle}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-zinc-500 hidden sm:inline">ID: {ch.channelId}</span>
                      <button
                        type="button"
                        onClick={() => deleteChannelMutation.mutate(ch.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1.5 rounded hover:bg-rose-500/10 transition-colors"
                        title="Delete mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Channel Mapping Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                channelMutation.mutate();
              }}
              className="pt-3 border-t border-zinc-800 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">Add new channel mapping</span>
                <button
                  type="button"
                  onClick={() => setChannelSelectMode(channelSelectMode === 'picker' ? 'manual' : 'picker')}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                >
                  {channelSelectMode === 'picker' ? 'Enter manual Channel ID' : 'Select from server channels'}
                </button>
              </div>

              {/* Server / Guild Selection */}
              {guilds && guilds.length > 0 && (
                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Target Discord Server</label>
                  <div className="flex items-center gap-2">
                    {activeGuild?.icon && (
                      <img src={activeGuild.icon} alt={activeGuild.name} className="h-7 w-7 rounded-full object-cover shrink-0 border border-zinc-700" />
                    )}
                    <select
                      value={selectedGuildId || activeGuild?.id || ''}
                      onChange={(e) => {
                        setSelectedGuildId(e.target.value);
                        setNewChannelId('');
                        setNewChannelName('');
                      }}
                      className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 text-xs"
                    >
                      {guilds.map((g: any) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Channel Selection: Picker vs Manual */}
              {channelSelectMode === 'picker' && activeGuild?.channels && activeGuild.channels.length > 0 ? (
                <div>
                  <label className="block text-zinc-400 text-[11px] mb-1">Select Channel</label>
                  <select
                    value={newChannelId}
                    onChange={(e) => {
                      const chId = e.target.value;
                      setNewChannelId(chId);
                      const found = activeGuild.channels.find((c: any) => c.id === chId);
                      if (found) setNewChannelName(found.name);
                    }}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 text-xs font-mono"
                    required
                  >
                    <option value="">-- Choose a text channel --</option>
                    {activeGuild.channels.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        #{c.name} ({c.id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder="Channel ID (e.g. 1198374829)"
                    value={newChannelId}
                    onChange={(e) => setNewChannelId(e.target.value)}
                    required
                  />
                  <Input
                    type="text"
                    placeholder="Channel name (e.g. one-piece)"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    required
                  />
                </div>
              )}

              <select
                value={selectedMangaId}
                onChange={(e) => setSelectedMangaId(e.target.value)}
                className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 text-xs"
                required
              >
                <option value="">Select series to associate</option>
                {mangas?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>

              <Button type="submit" size="sm" variant="secondary" className="w-full h-8 gap-1.5" isLoading={channelMutation.isPending}>
                <PlusIcon className="h-3.5 w-3.5" />
                Add channel mapping
              </Button>
            </form>
          </div>

          {/* Discord Server Roles & Role Creation */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <DiscordIcon className="h-3.5 w-3.5 text-[#5865F2]" />
                  Server roles & direct creation
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Available Discord server roles synced live from the Discord gateway
                </p>
              </div>
              <Badge variant="outline">
                {serverRoles?.length || 0} roles
              </Badge>
            </div>

            {/* List of server roles */}
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/80">
              {isServerRolesLoading ? (
                <div className="text-[11px] text-zinc-500 font-mono py-1">Loading server roles...</div>
              ) : !serverRoles || serverRoles.length === 0 ? (
                <div className="text-[11px] text-zinc-500 py-1">No roles found on server.</div>
              ) : (
                serverRoles.map((r: any) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border"
                    style={{
                      backgroundColor: `${r.hexColor || '#818cf8'}15`,
                      borderColor: `${r.hexColor || '#818cf8'}40`,
                      color: r.hexColor || '#818cf8',
                    }}
                    title={`ID: ${r.id}`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: r.hexColor || '#818cf8' }} />
                    @{r.name}
                  </span>
                ))
              )}
            </div>

            {/* Create New Role Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRoleMutation.mutate();
              }}
              className="pt-3 border-t border-zinc-800 space-y-2.5 text-xs"
            >
              <div className="text-[11px] font-medium text-zinc-300">Create new role in Discord server</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <Input
                    type="text"
                    placeholder="Role name (e.g. Solo Leveling Team)"
                    value={createRoleName}
                    onChange={(e) => setCreateRoleName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={createRoleColor}
                    onChange={(e) => setCreateRoleColor(e.target.value)}
                    className="h-8 w-10 bg-transparent rounded cursor-pointer border border-zinc-700 p-0.5"
                    title="Role color"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="primary"
                    className="flex-1 h-8 text-xs gap-1"
                    isLoading={createRoleMutation.isPending}
                  >
                    <PlusIcon className="h-3 w-3" />
                    Create
                  </Button>
                </div>
              </div>
            </form>
          </div>

          {/* Role Mappings */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <TeamIcon className="h-3.5 w-3.5 text-zinc-400" />
                  Work type to Discord role mentions
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  When a task stage opens, the bot mentions the associated server role
                </p>
              </div>
              <Badge variant="outline">
                {roles?.length || 0} mapped
              </Badge>
            </div>

            {isRolesLoading ? (
              <div className="p-6 text-center text-xs text-zinc-500 font-mono">Loading role mappings...</div>
            ) : !roles || roles.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No Discord roles mapped yet. Link a work type stage to a Discord server role below.
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-zinc-800/80">
                {roles.map((r: any) => (
                  <div key={r.id} className="pt-2.5 flex items-center justify-between text-xs group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-zinc-200 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60 text-[11px] shrink-0">
                        {r.workTypeName || 'Work Type'}
                      </span>
                      <span className="text-zinc-500 text-[10px]">→</span>
                      <span className="font-mono text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 text-[11px] truncate">
                        {r.roleName?.startsWith('@') ? r.roleName : `@${r.roleName}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-zinc-500">Role ID: {r.roleId}</span>
                      <button
                        type="button"
                        onClick={() => deleteRoleMutation.mutate(r.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
                        title="Delete role mapping"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Role Mapping Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                roleMutation.mutate();
              }}
              className="pt-3 border-t border-zinc-800 space-y-3 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-300">Add work type role mapping</span>
                <button
                  type="button"
                  onClick={() => setIsRolePickerMode(!isRolePickerMode)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                >
                  {isRolePickerMode ? 'Manual ID entry' : 'Select from server roles'}
                </button>
              </div>
              
              <select
                value={selectedWorkTypeId}
                onChange={(e) => setSelectedWorkTypeId(e.target.value)}
                className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 text-xs"
                required
              >
                <option value="">Select work type stage</option>
                {workTypes?.map((wt: any) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.name} ({wt.code})
                  </option>
                ))}
              </select>

              {isRolePickerMode && serverRoles && serverRoles.length > 0 ? (
                <div>
                  <select
                    value={newRoleId}
                    onChange={(e) => {
                      const rId = e.target.value;
                      setNewRoleId(rId);
                      const found = serverRoles.find((r: any) => r.id === rId);
                      if (found) setNewRoleName(found.name);
                    }}
                    className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700 text-xs font-mono"
                    required
                  >
                    <option value="">-- Select Discord role to ping --</option>
                    {serverRoles.map((r: any) => (
                      <option key={r.id} value={r.id}>
                        @{r.name} ({r.id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder="Role Name (e.g. @Translators)"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    required
                  />
                  <Input
                    type="text"
                    placeholder="Discord Role ID (e.g. 119837482910)"
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    required
                  />
                </div>
              )}

              <Button type="submit" size="sm" variant="secondary" className="w-full h-8 gap-1.5" isLoading={roleMutation.isPending}>
                <PlusIcon className="h-3.5 w-3.5" />
                Add role mapping
              </Button>
            </form>
          </div>
        </div>

        {/* Right Column: Live Announcement Embed Builder & Previewer */}
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <Eye className="h-3.5 w-3.5 text-zinc-400" />
              Discord announcement embed preview
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Announcement embed title</label>
                <Input value={embedTitle} onChange={(e) => setEmbedTitle(e.target.value)} />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Description / body text</label>
                <Textarea value={embedDescription} onChange={(e) => setEmbedDescription(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Discord Visual Preview Card */}
            <div className="mt-4 p-4 rounded-xl bg-[#2b2d31] text-zinc-200 shadow-md font-sans">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-zinc-700 flex items-center justify-center font-bold text-white text-xs shrink-0">
                  BOT
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">ClaimBoard Bot</span>
                    <span className="bg-[#5865f2] text-white text-[10px] px-1 py-0.2 rounded font-bold">APP</span>
                    <span className="text-[10px] text-zinc-400">Today at 11:30 AM</span>
                  </div>

                  {/* Embed Box */}
                  <div
                    className="p-3.5 rounded bg-[#1e1f22] border-l-4 space-y-2 shadow"
                    style={{ borderLeftColor: embedColor }}
                  >
                    <div className="font-bold text-sm text-white">{embedTitle}</div>
                    <div className="text-xs text-zinc-300 leading-relaxed">{embedDescription}</div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-800/80">
                      <div>
                        <span className="text-zinc-400 text-[10px] uppercase font-bold block">Open tasks</span>
                        <span className="text-zinc-200 font-mono text-[11px]">• Cleaning (CL)</span>
                        <span className="text-zinc-200 font-mono text-[11px] block">• Typesetting (TS)</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 text-[10px] uppercase font-bold block">Deadline</span>
                        <span className="text-zinc-200 font-mono text-[11px]">48 Hours</span>
                      </div>
                    </div>

                    {/* Discord Buttons Preview */}
                    <div className="pt-2 flex flex-wrap gap-2">
                      <button type="button" className="px-3 py-1 rounded bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-medium">
                        Claim Cleaning
                      </button>
                      <button type="button" className="px-3 py-1 rounded bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-medium">
                        Claim Typesetting
                      </button>
                      <button type="button" className="px-3 py-1 rounded bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium">
                        Open Web Board ↗
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Log Channels Section */}
          <div className="rounded-xl border border-zinc-800 bg-[#111215] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                  <ActivityIcon className="h-3.5 w-3.5 text-emerald-400" />
                  Bot activity & completion log channels
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Streams completed chapters, completed tasks (e.g. Translation by member), claims, and deadlines
                </p>
              </div>
              <Badge variant="outline">
                {logChannels?.length || 0} active
              </Badge>
            </div>

            {isLogChannelsLoading ? (
              <div className="p-6 text-center text-xs text-zinc-500 font-mono">Loading log channels...</div>
            ) : !logChannels || logChannels.length === 0 ? (
              <div className="p-5 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg space-y-1">
                <div>No log channels configured yet.</div>
                <div className="text-[11px] text-zinc-400 font-mono">
                  Run /add-log-channel in Discord or register a Channel ID below.
                </div>
              </div>
            ) : (
              <div className="space-y-2 divide-y divide-zinc-800/80">
                {logChannels.map((lc: any) => (
                  <div key={lc.id} className="pt-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                      <span className="font-mono text-zinc-200 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60 text-[11px] truncate">
                        #{lc.channelName}
                      </span>
                      {lc.addedByName && (
                        <span className="text-[10px] text-zinc-500 truncate">added by {lc.addedByName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-zinc-500">ID: {lc.channelId}</span>
                      <button
                        type="button"
                        onClick={() => deleteLogChannelMutation.mutate(lc.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
                        title="Remove log channel"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addLogChannelMutation.mutate();
              }}
              className="pt-3 border-t border-zinc-800 space-y-2.5 text-xs"
            >
              <div className="text-[11px] font-medium text-zinc-300">
                Add log channel manually (or run <code className="text-zinc-200 bg-zinc-800 px-1 rounded">/add-log-channel</code> / <code className="text-zinc-200 bg-zinc-800 px-1 rounded">/remove-log-channel</code> in Discord)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  placeholder="Channel ID (e.g. 1293847561)"
                  value={newLogChannelId}
                  onChange={(e) => setNewLogChannelId(e.target.value)}
                  required
                />
                <Input
                  type="text"
                  placeholder="Channel label (e.g. claimboard-logs)"
                  value={newLogChannelName}
                  onChange={(e) => setNewLogChannelName(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                className="w-full h-8 gap-1.5"
                isLoading={addLogChannelMutation.isPending}
              >
                <PlusIcon className="h-3.5 w-3.5" />
                Add Log Channel
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
