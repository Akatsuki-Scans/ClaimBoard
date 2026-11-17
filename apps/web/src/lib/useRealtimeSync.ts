import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:4000/ws`;

    let reconnectTimeout: any;

    function connect() {
      try {
        const socket = new WebSocket(wsUrl);
        socketRef.current = socket;

        socket.onopen = () => {
          console.log('[RealtimeSync] WebSocket connection established.');
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            const { event: eventName, data } = payload;

            // Invalidate relevant TanStack Query caches based on event
            if (
              eventName.startsWith('assignment.') ||
              eventName.startsWith('claim.') ||
              eventName.startsWith('review.') ||
              eventName.startsWith('chapter.') ||
              eventName.startsWith('pipeline.')
            ) {
              queryClient.invalidateQueries({ queryKey: ['assignments'] });
              queryClient.invalidateQueries({ queryKey: ['claims'] });
              queryClient.invalidateQueries({ queryKey: ['pipeline'] });
              queryClient.invalidateQueries({ queryKey: ['analytics'] });
              queryClient.invalidateQueries({ queryKey: ['activity'] });
              queryClient.invalidateQueries({ queryKey: ['deliverables'] });
              queryClient.invalidateQueries({ queryKey: ['open-work'] });
            }

            if (eventName === 'notification.created') {
              queryClient.invalidateQueries({ queryKey: ['notifications'] });
            }

            if (eventName === 'manga.updated') {
              queryClient.invalidateQueries({ queryKey: ['manga'] });
            }
          } catch (err) {
            console.error('[RealtimeSync] Error parsing message:', err);
          }
        };

        socket.onclose = () => {
          console.log('[RealtimeSync] WebSocket disconnected. Retrying in 3s...');
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = (err) => {
          console.warn('[RealtimeSync] Socket error:', err);
          socket.close();
        };
      } catch (e) {
        console.error('[RealtimeSync] Could not instantiate WebSocket:', e);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [queryClient]);
}
