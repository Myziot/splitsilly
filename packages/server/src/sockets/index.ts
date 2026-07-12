import { Server, Socket } from 'socket.io';
import { db } from '../db';
import { groupMembers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { getSessionToken, getSessionByToken } from '../middleware/session';

export function setupSocketIO(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Authenticate socket connection
    const token = socket.handshake.auth.token;
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
  io.on('connection', (socket: Socket) => {
    socket.on('expense-created', (data: { groupId: string; expense: any }) => {
      socket.to(`group:${data.groupId}`).emit('expense-updated', data.expense);
    });

    socket.on('settlement-created', (data: { groupId: string; settlement: any }) => {
      socket.to(`group:${data.groupId}`).emit('settlement-updated', data.settlement);
    });
  });
}
