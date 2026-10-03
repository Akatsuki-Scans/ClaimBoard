import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  Settings,
  Download,
  Activity,
  Database,
  Radio,
  Server,
  Hash,
  Sparkles,
  Shield,
  Edit2,
  Check,
} from 'lucide-react';

export function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'discord' | 'roles' | 'workTypes' | 'templates' | 'notifications'>('discord');

  const { data: diagnostics } = useQuery({
    queryKey: ['settings', 'diagnostics'],
    queryFn: () => apiRequest<any>('/settings/diagnostics'),
  });

  const channelMappings = [
    { channel: '#one-piece', manga: 'One Piece' },
    { channel: '#solo-leveling', manga: 'Solo Leveling' },
    { channel: '#naruto', manga: 'Naruto' },
    { channel: '#jujutsu-kaisen', manga: 'Jujutsu Kaisen' },
  ];

  const roleMappings = [
    { workType: 'Cleaning', discordRole: '@Cleaner' },
    { workType: 'Translation', discordRole: '@Translator' },
    { workType: 'Redrawing', discordRole: '@Redrawer' },
    { workType: 'Typesetting', discordRole: '@Typesetter' },
    { workType: 'QC', discordRole: '@QC' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          Settings
        </h1>
        <p className="text-xs text-zinc-400 mt-0.5">
          Workspace configurations, Discord bot sync, roles, and automated pipelines
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 p-1 rounded-lg text-xs overflow-x-auto">
        {[
          { key: 'general', label: 'General' },
          { key: 'discord', label: 'Discord' },
          { key: 'roles', label: 'Roles & Permissions' },
          { key: 'workTypes', label: 'Work Types' },
          { key: 'templates', label: 'Templates' },
          { key: 'notifications', label: 'Notifications' },
        ].map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                isActive ? 'bg-zinc-800 text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'discord' ? (
        <div className="space-y-5">
          {/* Discord Integration Banner */}
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-white">Discord Integration</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  ● Connected
                </span>
              </div>
              <div className="text-xs text-zinc-400 flex items-center gap-2">
                <span>Guild:</span>
                <span className="text-zinc-200 font-medium">CBHQ</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button size="sm" variant="outline" className="text-xs h-8">
                Reconfigure
              </Button>
              <Button size="sm" variant="secondary" className="text-xs h-8 text-rose-400 hover:text-rose-300">
                Disconnect
              </Button>
            </div>
          </div>

          {/* Grid: Channel Mapping & Role Mapping */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Channel Mapping */}
            <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Channel Mapping</h3>
                <span className="text-[11px] text-zinc-500">Manga to channel sync</span>
              </div>

              <div className="divide-y divide-zinc-800/80">
                {channelMappings.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-indigo-400 font-medium">{item.channel}</span>
                      <span className="text-zinc-600">➔</span>
                      <span className="text-zinc-200 font-medium">{item.manga}</span>
                    </div>
                    <button className="px-2.5 py-1 rounded text-[11px] border border-zinc-700/80 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors">
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Role Mapping */}
            <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-200">Role Mapping</h3>
                <span className="text-[11px] text-zinc-500">Work type ping roles</span>
              </div>

              <div className="divide-y divide-zinc-800/80">
                {roleMappings.map((item, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between text-xs first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-300 font-medium">{item.workType}</span>
                      <span className="text-zinc-600">➔</span>
                      <span className="font-mono text-emerald-400">{item.discordRole}</span>
                    </div>
                    <button className="px-2.5 py-1 rounded text-[11px] border border-zinc-700/80 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 transition-colors">
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* General Diagnostics and Settings */
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Service Health Telemetry
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300 flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5 text-indigo-400" /> API Gateway
                  </span>
                  <Badge variant="success">Healthy</Badge>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">Fastify Modular Engine • 2ms</div>
              </div>

              <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-emerald-400" /> MongoDB Store
                  </span>
                  <Badge variant="success">Healthy</Badge>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">Mongoose 8 • Concurrency Protected</div>
              </div>

              <div className="p-3.5 rounded-lg border border-zinc-800 bg-zinc-900/60 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-300 flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-purple-400" /> Realtime Sync
                  </span>
                  <Badge variant="success">Healthy</Badge>
                </div>
                <div className="text-[11px] text-zinc-500 font-mono">WebSockets • Zero Polling</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-[#121215] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Download className="h-4 w-4 text-indigo-400" />
              Production Snapshots & Exports
            </h3>
            <p className="text-xs text-zinc-400">
              Export full production database snapshots including manga metadata, chapter history, claims, assignments, deliverables, and team audits.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <Button size="sm" variant="secondary" onClick={() => window.open('/api/settings/export?type=json', '_blank')}>
                Export JSON Snapshot
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open('/api/settings/export?type=csv', '_blank')}>
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
