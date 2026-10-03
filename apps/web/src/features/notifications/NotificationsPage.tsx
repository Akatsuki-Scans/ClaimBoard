import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Bell, CheckCheck, Clock, Bookmark, AlertTriangle } from 'lucide-react';

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
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-400" />
            Notification Center
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Production alerts, review requests, and deadline reminders.
          </p>
        </div>

        {notifications.some((n: any) => !n.isRead) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => markAllMutation.mutate()}
            isLoading={markAllMutation.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Mark All as Read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-xs text-zinc-500">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-12 text-center">
          <Bell className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-zinc-200">No notifications</h3>
          <p className="text-xs text-zinc-500 mt-1">You're all caught up with production events!</p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80 overflow-hidden">
          {notifications.map((notif: any) => (
            <div
              key={notif.id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                notif.isRead ? 'opacity-70 hover:opacity-100' : 'bg-indigo-950/20'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-1.5 rounded-md bg-zinc-800 text-indigo-400 shrink-0">
                  {notif.type === 'deadline' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400" />
                  ) : notif.type === 'review' ? (
                    <Clock className="h-4 w-4 text-sky-400" />
                  ) : (
                    <Bookmark className="h-4 w-4" />
                  )}
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium text-zinc-100">{notif.title}</div>
                  <div className="text-xs text-zinc-400">{notif.message}</div>
                  <div className="text-[10px] text-zinc-500">
                    {new Date(notif.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {!notif.isRead && (
                <Button
                  size="sm"
                  variant="ghost"
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
