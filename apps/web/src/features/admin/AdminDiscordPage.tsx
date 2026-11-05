import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { AdminNavTabs } from '../../components/admin/AdminNavTabs';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { HashIcon, TeamIcon, PlusIcon, DiscordIcon } from '../../components/ui/icon';
import { Eye, Trash2 } from 'lucide-react';

export function AdminDiscordPage() {
  const queryClient = useQueryClient();

  // New Channel Mapping State
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMangaId, setSelectedMangaId] = useState('');

  // New Role Mapping State
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleId, setNewRoleId] = useState('');

  // Announcement Builder State
  const [embedTitle, setEmbedTitle] = useState('New chapter announced: One Piece — Ch. 1150');
  const [embedDescription, setEmbedDescription] = useState('Tasks are now open for claiming directly via Discord buttons or the web board.');
  const [embedColor, setEmbedColor] = useState('#6366f1');

  // Queries
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

  // Save Channel Mapping Mutation
  const channelMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/discord/channels', {
        method: 'POST',
        body: JSON.stringify({
          channelId: newChannelId,
          channelName: newChannelName,
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
                  <div key={ch.id} className="pt-2.5 flex items-center justify-between text-xs group">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-zinc-200 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/60 text-[11px] shrink-0">
                        #{ch.channelName}
                      </span>
                      <span className="text-zinc-500 text-[10px]">→</span>
                      <span className="font-semibold text-zinc-100 truncate">{ch.mangaTitle}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-zinc-500">ID: {ch.channelId}</span>
                      <button
                        type="button"
                        onClick={() => deleteChannelMutation.mutate(ch.id)}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
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
              <div className="text-[11px] font-medium text-zinc-300">Add new channel mapping</div>
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

              <select
                value={selectedMangaId}
                onChange={(e) => setSelectedMangaId(e.target.value)}
                className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
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
              <div className="text-[11px] font-medium text-zinc-300">Add work type role mapping</div>
              
              <select
                value={selectedWorkTypeId}
                onChange={(e) => setSelectedWorkTypeId(e.target.value)}
                className="w-full bg-[#18181b] border border-zinc-800 rounded-lg px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-zinc-700"
                required
              >
                <option value="">Select work type stage</option>
                {workTypes?.map((wt: any) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.name} ({wt.code})
                  </option>
                ))}
              </select>

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
        </div>
      </div>
    </div>
  );
}
