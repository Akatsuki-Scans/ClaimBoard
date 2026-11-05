import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { BellIcon, ClockIcon, AlertTriangleIcon, MyClaimsIcon } from '../../components/ui/icon';
import { CheckCheck } from 'lucide-react';

export function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiRequest<{ notifications: any[]; unreadCount: number }>('/notifications'),
  });

  const markAllMutation = useMutation({
    mutationFn: () => apiRequest('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markSingleMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications = data?.notifications || [];

  return (
    <div className="space-y-6 max-w-3xl mx-auto text-zinc-100 select-none pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <BellIcon className="h-4 w-4 text-zinc-400" />
            Notification Center
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production alerts, review requests, and deadline reminders
          </p>
        </div>

        {notifications.some((n: any) => !n.isRead) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAllMutation.mutate()}
            isLoading={markAllMutation.isPending}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] p-12 text-center">
          <BellIcon className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-medium text-zinc-200">No notifications</h3>
          <p className="text-xs text-zinc-500 mt-1">You are all caught up with production events.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-[#111215] divide-y divide-zinc-800/80 overflow-hidden">
          {notifications.map((notif: any) => (
            <div
              key={notif.id}
              className={`p-3.5 flex items-start justify-between gap-3 transition-colors ${
                notif.isRead ? 'opacity-65 hover:opacity-100' : 'bg-zinc-800/20'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 p-1.5 rounded-md bg-zinc-800 text-zinc-300 shrink-0 border border-zinc-700/60">
                  {notif.type === 'deadline' ? (
                    <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-400" />
                  ) : notif.type === 'review' ? (
                    <ClockIcon className="h-3.5 w-3.5 text-sky-400" />
                  ) : (
                    <MyClaimsIcon className="h-3.5 w-3.5" />
                  )}
                </div>

                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-medium text-zinc-100 flex items-center gap-2">
                    <span>{notif.title}</span>
                    {!notif.isRead && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 leading-normal">{notif.message}</div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {new Date(notif.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {!notif.isRead && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => markSingleMutation.mutate(notif.id)}
                >
                  Mark read
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
