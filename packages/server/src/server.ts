import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ensureAuth } from './middleware/session';
import { honeypot } from './middleware/honeypot';
import { requireAdmin } from './middleware/admin';
import { loginIpLimiter, registerIpLimiter } from './middleware/ratelimit';
import { authHandler, adminHandler } from './routes/auth';
import { groupsHandler } from './routes/groups';
import { expensesHandler } from './routes/expenses';
import { settlementsHandler } from './routes/settlements';
import { balancesHandler } from './routes/balances';
import { categoriesHandler } from './routes/categories';
import { joinHandler } from './routes/join';
import { notificationsHandler } from './routes/notifications';
import { booksHandler } from './routes/books';
import { setupSocketIO } from './sockets';
import { ensureUploadDir } from './services/upload';
import { purgeExpiredResetTokens } from './services/passwordReset';
import * as path from 'path';
import * as fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'https://splitsilly.818888817.xyz',
  'https://myzi.minis',
  'http://myzi.minis',
  'https://myzi.minis:3002',
  'http://myzi.minis:3002',
  // Local browse host (CORS origin the browser sends from the dev/preview UI).
  'http://localhost:3002',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.log('CORS rejected origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
// 25kb is ample for our tiny auth payloads; rejects oversized bodies cheaply
// (volumetric body DoS mitigation). File uploads use multer separately.
app.use(express.json({ limit: '25kb' }));
app.use(express.urlencoded({ extended: true, limit: '25kb' }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve client build (always, if it exists)
// __dirname is unreliable with tsx, use process.cwd() instead
const clientDist = path.join(process.cwd(), 'dist', 'client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Public auth routes (no session required).
// Order: honeypot (cheap bot trip) -> IP rate limit -> handler.
// Account-lockout (per-email) is enforced inside authHandler.login.
app.post('/api/v1/auth/login', honeypot, loginIpLimiter, authHandler.login);
app.post('/api/v1/auth/register', honeypot, registerIpLimiter, authHandler.register);
// Public password reset (token + new password). Stop-gap until Resend email
// works; the operator hands the link out-of-band. Honeypot + IP limiter like login.
app.post('/api/v1/auth/reset-password', honeypot, loginIpLimiter, authHandler.resetPassword);
// User-initiated "notify administrator" after failed logins. Flags the account
// (operator sees it in the admin panel). Honeypot + IP limiter like login.
app.post('/api/v1/auth/notify-reset', honeypot, loginIpLimiter, authHandler.notifyReset);

// Protected routes - all routes under /api/v1 require auth,
// EXCEPT public invite-info lookups (needed before login to show group name).
app.use('/api/v1', (req, res, next) => {
  // Public invite-info lookups (needed before login to show group name).
  // Note: because this middleware is mounted at /api/v1, req.path here is
  // the path AFTER the mount prefix (e.g. /join/CODE/info).
  const isPublicInviteInfo = /^\/join\/[^/]+\/info$/.test(req.path);
  // Operator back-office: its own requireAdmin guard (session OR ADMIN_API_KEY)
  // handles authorization, so it must bypass this blanket session check.
  const isAdminBackOffice = req.path.startsWith('/admin/');
  if (isPublicInviteInfo || isAdminBackOffice) return next();
  ensureAuth(req).then(user => {
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    (req as any).user = user;
    next();
  }).catch(err => {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });
});

// Auth routes that require session
app.post('/api/v1/auth/logout', authHandler.logout);
app.get('/api/v1/auth/me', authHandler.me);

// Operator back-office (admin). Authorized by requireAdmin (admin session OR
// ADMIN_API_KEY header). Public-facing but guarded — never returns sensitive
// data to non-admins (401 before reaching the handler).
app.get('/api/v1/admin/users', requireAdmin, adminHandler.listUsers);
app.post('/api/v1/admin/reset-link', requireAdmin, adminHandler.createResetLink);

// Groups
app.get('/api/v1/groups', groupsHandler.getGroups);
app.post('/api/v1/groups', groupsHandler.createGroup);
app.get('/api/v1/groups/:groupId', groupsHandler.getGroup);
app.get('/api/v1/groups/:groupId/settings', groupsHandler.getGroupSettings);
app.put('/api/v1/groups/:groupId/settings', groupsHandler.updateGroupSettings);
app.delete('/api/v1/groups/:groupId', groupsHandler.deleteGroup);
app.get('/api/v1/groups/:groupId/members', groupsHandler.getGroupMembers);
app.delete('/api/v1/groups/:groupId/members/:userId', groupsHandler.kickMember);
app.post('/api/v1/groups/:groupId/invite', groupsHandler.inviteMember);

// Join
app.post('/api/v1/join/:inviteCode', joinHandler.joinGroup);
app.get('/api/v1/join/:inviteCode/info', joinHandler.getInviteInfo);
app.get('/api/v1/groups/:groupId/joinable-equal-expenses', joinHandler.getJoinableEqualExpenses);
app.post('/api/v1/groups/:groupId/equal-participation', joinHandler.applyEqualParticipation);

// Expenses
app.get('/api/v1/groups/:groupId/expenses', expensesHandler.getExpenses);
app.post('/api/v1/groups/:groupId/expenses', expensesHandler.createExpense);
app.put('/api/v1/groups/:groupId/expenses/:expenseId', expensesHandler.updateExpense);
app.delete('/api/v1/groups/:groupId/expenses/:expenseId', expensesHandler.deleteExpense);
app.post('/api/v1/groups/:groupId/expenses/:expenseId/receipt', expensesHandler.uploadReceipt);

// Settlements
app.get('/api/v1/groups/:groupId/settlements', settlementsHandler.getSettlements);
app.post('/api/v1/groups/:groupId/settlements', settlementsHandler.createSettlement);
app.post('/api/v1/groups/:groupId/settlements/remind', settlementsHandler.sendReminder);
app.delete('/api/v1/groups/:groupId/settlements', settlementsHandler.resetSettlements);
app.delete('/api/v1/groups/:groupId/settlements/:settlementId', settlementsHandler.deleteSettlement);
app.patch('/api/v1/groups/:groupId/settlements/:settlementId', settlementsHandler.updateSettlement);
app.get('/api/v1/notifications', notificationsHandler.getNotifications);
app.get('/api/v1/notifications/unread-count', notificationsHandler.getUnreadCount);
app.patch('/api/v1/notifications/:id/read', notificationsHandler.markRead);
app.get('/api/v1/groups/:groupId/activity', notificationsHandler.getActivity);
app.get('/api/v1/groups/:groupId/expense-flags', expensesHandler.getExpenseFlags);

// Book-lock (freeze / unfreeze the suggested who-pays-whom list)
app.get('/api/v1/groups/:groupId/lock', booksHandler.getLockState);
app.post('/api/v1/groups/:groupId/lock', booksHandler.lockPlan);
app.delete('/api/v1/groups/:groupId/lock', booksHandler.unlockPlan);
app.post('/api/v1/groups/:groupId/recalculate', booksHandler.recalculatePlan);

// Balances
app.get('/api/v1/groups/:groupId/balances', balancesHandler.getBalances);
app.get('/api/v1/groups/:groupId/balances/optimize', balancesHandler.optimizeBalances);

// Categories
app.get('/api/v1/categories', categoriesHandler.getCategories);
app.post('/api/v1/categories', categoriesHandler.createCategory);
app.put('/api/v1/categories/:categoryId', categoriesHandler.updateCategory);
app.delete('/api/v1/categories/:categoryId', categoriesHandler.deleteCategory);

// Create HTTP server and Socket.io
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Setup Socket.io
setupSocketIO(io);

// SPA catch-all — serve index.html for any non-API route
app.get('*', (req, res) => {
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    res.sendFile(path.join(clientDist, 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Clean JSON errors for body-parser failures (e.g. 413 PayloadTooLarge)
// instead of Express's default HTML stack-trace page.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  if (err && err.status === 413) {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
ensureUploadDir();
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Periodic hygiene: drop used/expired reset tokens so the table stays small.
setInterval(() => {
  purgeExpiredResetTokens().catch((err) => console.error('Reset-token purge error:', err));
}, 60 * 60 * 1000).unref();
