import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Sparkles, Hash, Users, Plus, Eye, Send } from 'lucide-react';

export function AdminDiscordPage() {
  const queryClient = useQueryClient();

  // New Channel Mapping State
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [selectedMangaId, setSelectedMangaId] = useState('');

  // Announcement Builder State (Specification #66)
  const [embedTitle, setEmbedTitle] = useState('📢 New Chapter Announced: One Piece — Ch. 1150');
  const [embedDescription, setEmbedDescription] = useState('Tasks are now open for claiming directly via Discord buttons or the web board.');
  const [embedColor, setEmbedColor] = useState('#6366f1');

  // Queries
  const { data: channels } = useQuery({
    queryKey: ['discord', 'channels'],
    queryFn: () => apiRequest<any[]>('/discord/channels'),
  });

  const { data: roles } = useQuery({
    queryKey: ['discord', 'roles'],
    queryFn: () => apiRequest<any[]>('/discord/roles'),
  });

  const { data: mangas } = useQuery({
    queryKey: ['manga'],
    queryFn: () => apiRequest<any[]>('/manga'),
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

  return (
    <div className="space-y-6">
      <div className="border-b border-zinc-800 pb-4">
        <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          Discord Gateway & Channel Mappings
        </h2>
        <p className="text-xs text-zinc-400 mt-0.5">
          Map Discord channels to manga titles for auto-detection, configure role mentions, and customize announcement embeds.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Channel & Role Mappings */}
        <div className="space-y-6">
          {/* Channel Mapping (Specification #40 & #67) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                <Hash className="h-4 w-4 text-indigo-400" />
                Channel ➔ Manga Auto-Detection
              </h3>
              <Badge variant="outline">MAPPING</Badge>
            </div>

            <div className="space-y-2 divide-y divide-zinc-800/80">
              {channels?.map((ch: any) => (
                <div key={ch.id} className="pt-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-indigo-400">#{ch.channelName}</span>
                    <span className="text-zinc-500">➔</span>
                    <span className="font-medium text-zinc-200">{ch.mangaTitle}</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-500">ID: {ch.channelId}</span>
                </div>
              ))}
            </div>

            {/* Add Channel Mapping Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                channelMutation.mutate();
              }}
              className="pt-3 border-t border-zinc-800 space-y-3 text-xs"
            >
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="text"
                  placeholder="Channel ID (e.g. 1234567)"
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
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
                required
              >
                <option value="">Select Manga to Map</option>
                {mangas?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>

              <Button type="submit" size="sm" variant="secondary" className="w-full" isLoading={channelMutation.isPending}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Discord Channel Mapping
              </Button>
            </form>
          </div>

          {/* Role Mappings (Specification #41) */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-400" />
              Work Type ➔ Discord Role Pings
            </h3>
            <div className="space-y-2 text-xs">
              {roles?.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between p-2 rounded bg-zinc-950/40 border border-zinc-800">
                  <span className="font-medium text-zinc-300">{r.workTypeName}</span>
                  <span className="font-mono text-purple-400">{r.roleName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Live Announcement Embed Builder & Previewer (Specification #66) */}
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Eye className="h-4 w-4 text-indigo-400" />
              Discord Announcement Embed Builder & Live Preview
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Announcement Embed Title</label>
                <Input value={embedTitle} onChange={(e) => setEmbedTitle(e.target.value)} />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Description / Body Text</label>
                <Textarea value={embedDescription} onChange={(e) => setEmbedDescription(e.target.value)} rows={2} />
              </div>
            </div>

            {/* Discord Visual Preview Card */}
            <div className="mt-4 p-4 rounded-lg bg-[#2b2d31] text-zinc-200 shadow-md font-sans">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white text-xs shrink-0">
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
                        <span className="text-zinc-400 text-[10px] uppercase font-bold block">Open Tasks</span>
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
                      <button className="px-3 py-1 rounded bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-medium">
                        Claim Cleaning
                      </button>
                      <button className="px-3 py-1 rounded bg-[#4e5058] hover:bg-[#6d6f78] text-white text-xs font-medium">
                        Claim Typesetting
                      </button>
                      <button className="px-3 py-1 rounded bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-medium">
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
