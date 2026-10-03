import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { WebSocket } from 'ws';
import { setEventBroadcaster } from '../services/productionService';

const connectedClients = new Set<WebSocket>();

export function broadcastToAll(event: string, data: any) {
  const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message);
      } catch (e) {
        console.error('[WebSocket] Error sending message to client:', e);
      }
    }
  }
}

async function websocketPluginHandler(fastify: FastifyInstance) {
  setEventBroadcaster(broadcastToAll);

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    connectedClients.add(socket);
    console.log(`[WebSocket] Client connected. Total clients: ${connectedClients.size}`);

    socket.send(JSON.stringify({ event: 'connected', message: 'ClaimBoard Realtime Sync Active' }));

    socket.on('close', () => {
      connectedClients.delete(socket);
      console.log(`[WebSocket] Client disconnected. Total clients: ${connectedClients.size}`);
    });

    socket.on('error', (err) => {
      console.error('[WebSocket] Socket error:', err);
      connectedClients.delete(socket);
    });
  });
}

export const websocketPlugin = fp(websocketPluginHandler, {
  name: 'websocket-plugin',
});
