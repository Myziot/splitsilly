import { Server, Socket } from 'socket.io';
import { db } from '../db';
import { groupMembers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getSessionToken, getSessionByToken } from '../middleware/session';

// Module-level handle to the live Socket.IO server so route handlers can emit
// events to group rooms (e.g. broadcast a settlement to every other member).
let io: Server | null = null;

export function setupSocketIO(server: Server) {
  io = server;
  server.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Authenticate socket connection. The session is an HttpOnly cookie, so it
    // arrives in the handshake Cookie header (same as a normal HTTP request),
    // NOT in handshake.auth (which would require the client to read the
    // HttpOnly cookie and re-send it - impossible). Reuse the HTTP middleware's
    // cookie parser so socket auth behaves identically to /api/v1 auth.
    const cookieHeader = (socket.handshake.headers as any)?.cookie as string | undefined;
    const handshakeReq = { headers: { cookie: cookieHeader || '' } } as any;
    const token = getSessionToken(handshakeReq);
    if (token) {
      getSessionByToken(token).then(session => {
        if (session) {
          (socket as any).userId = session.userId;

          // Join group rooms
          db.select({ groupId: groupMembers.groupId })
            .from(groupMembers)
            .where(eq(groupMembers.userId, session.userId))
            .then(groups => {
              groups.forEach(g => {
                socket.join(`group:${g.groupId}`);
              });
            });
        }
      });
    }

    socket.on('join-group', (groupId: string) => {
      socket.join(`group:${groupId}`);
    });

    socket.on('leave-group', (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // Helper to emit events to group rooms
  server.on('connection', (socket: Socket) => {
    socket.on('expense-created', (data: { groupId: string; expense: any }) => {
      socket.to(`group:${data.groupId}`).emit('expense-updated', data.expense);
    });

    socket.on('settlement-created', (data: { groupId: string; settlement: any }) => {
      socket.to(`group:${data.groupId}`).emit('settlement-updated', data.settlement);
    });
  });
}

/**
 * Broadcast a settlement change to every member of a group's room EXCEPT the
 * actor (the actor already optimistically refreshes on their own device). This
 * is how a settlement recorded by a friend reaches your browser so the balance
 * card + payment log refresh live instead of going stale.
 */
export function broadcastSettlement(
  groupId: string,
  event: 'settlement:recorded' | 'settlement:removed',
) {
  if (!io) return;
  io.to(`group:${groupId}`).emit(event, { groupId });
}
