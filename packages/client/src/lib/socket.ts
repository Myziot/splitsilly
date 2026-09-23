import { io, Socket } from 'socket.io-client';

/**
 * Single shared Socket.IO connection for the whole client. The session cookie
 * is HttpOnly, so we can't attach it manually — but socket.io-client sends it
 * automatically on the same-origin /socket.io handshake, and the server reads
 * it in setupSocketIO to authenticate + join the user's group rooms.
 *
 * We avoid reconnect storms by using a singleton: one socket for the app
 * lifetime, reconnecting automatically if the network drops.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  // Same origin in both dev (vite proxy) and prod (built client). The server
  // listens for Socket.IO on the same port as the HTTP API.
  socket = io({
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}
