import { Request, Response } from 'express';
import { db } from '../db';
import { groups, groupMembers, users, expenseSplits, settlements, notifications, expenseFlags, expenses, groupActivity } from '../db/schema';
import { eq, and, inArray, or } from 'drizzle-orm';
import crypto from 'crypto';
import { sendInviteEmail, isEmailConfigured } from '../services/email';
import { logGroupActivity } from './notifications';
import { purgeMemberGroupData, deleteGhostIfUnreferenced } from '../services/members';
import { broadcastGroupChanged } from '../sockets';

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 8);
}

export const groupsHandler = {
  getGroups: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;

      const memberGroups = await db
        .select({
          id: groups.id,
          name: groups.name,
          currency: groups.currency,
          inviteCode: groups.inviteCode,
          createdBy: groups.createdBy,
          createdAt: groups.createdAt,
          updatedAt: groups.updatedAt,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groupMembers.groupId, groups.id))
        .where(eq(groupMembers.userId, userId));

      res.status(200).json(memberGroups.map(g => ({
        ...g,
        created_by: g.createdBy,
        invite_code: g.inviteCode,
        created_at: g.createdAt.toISOString(),
        updated_at: g.updatedAt.toISOString(),
      })));
    } catch (error) {
      console.error('Get groups error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  createGroup: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { name, currency, expenseType } = req.body;

      const inviteCode = generateInviteCode();

      // ATOMIC: a group without its creator-admin row would be an orphan
      // nobody can manage.
      const group = await db.transaction(async (tx) => {
        const created = await tx
          .insert(groups)
          .values({ name, currency, expenseType: expenseType || 'general', inviteCode, createdBy: userId })
          .returning();

        // Add creator as admin
        await tx.insert(groupMembers).values({
          groupId: created[0].id,
          userId,
          role: 'admin',
        });
        return created[0];
      });

      // Transparent group log: the group's origin story. The creator's own
      // admin-membership is folded into this single row (Decision 2 — no
      // separate "creator joined" line).
      try {
        const creator = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        await logGroupActivity(group.id, userId, 'group_created', {
          actorName: creator[0]?.name || 'Someone',
          groupName: group.name,
        });
      } catch (logErr) {
        console.error('Create-group activity log error (non-fatal):', logErr);
      }

      res.status(201).json({
        id: group.id,
        name: group.name,
        currency: group.currency,
        expense_type: group.expenseType,
        invite_code: group.inviteCode,
        created_by: group.createdBy,
        created_at: group.createdAt.toISOString(),
        updated_at: group.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('Create group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getGroup: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const groupResult = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      if (groupResult.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const group = groupResult[0];
      res.status(200).json({
        id: group.id,
        name: group.name,
        currency: group.currency,
        expense_type: group.expenseType,
        invite_code: group.inviteCode,
        created_by: group.createdBy,
        created_at: group.createdAt.toISOString(),
        updated_at: group.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error('Get group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  deleteGroup: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Check admin
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, 'admin')
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(403).json({ error: 'Only admin can delete group' });
      }

      await db.delete(groups).where(eq(groups.id, groupId));
      res.status(204).send();
    } catch (error) {
      console.error('Delete group error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  getGroupMembers: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      // Check membership
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId)
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const members = await db
        .select({
          id: groupMembers.id,
          groupId: groupMembers.groupId,
          userId: groupMembers.userId,
          role: groupMembers.role,
          status: groupMembers.status,
          joinedAt: groupMembers.joinedAt,
          userEmail: users.email,
          userName: users.name,
          userCreatedAt: users.createdAt,
          userIsPlaceholder: users.isPlaceholder,
        })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, groupId));

      res.status(200).json(members.map(m => ({
        id: m.id,
        group_id: m.groupId,
        user_id: m.userId,
        role: m.role,
        status: m.status,
        joined_at: m.joinedAt.toISOString(),
        user: {
          id: m.userId,
          email: m.userEmail,
          name: m.userName,
          created_at: m.userCreatedAt.toISOString(),
          is_placeholder: m.userIsPlaceholder,
        },
      })));
    } catch (error) {
      console.error('Get group members error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  kickMember: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, userId: targetUserId } = req.params;

      // Check admin
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, 'admin')
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(403).json({ error: 'Only admin can kick members' });
      }

      // Guard: don't allow kicking the last remaining member.
      const remaining = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
      if (remaining.length <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last member of a group' });
      }

      // Names for the activity log (looked up BEFORE the tx; the users rows
      // themselves are never deleted by a kick — only the membership is).
      const [actorRow, targetRow, targetUserRow] = await Promise.all([
        db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
        db.select({ name: users.name }).from(users).where(eq(users.id, targetUserId)).limit(1),
        db.select({ isPlaceholder: users.isPlaceholder }).from(users).where(eq(users.id, targetUserId)).limit(1),
      ]);

      // All mutations below run in ONE transaction: if any step throws
      // (network blip, bad data, etc.) everything rolls back — so a partial
      // failure can NEVER leave orphaned splits/flags/settlements behind.
      // The cascade itself lives in services/members.ts (shared with the
      // placeholder discard/decline paths — one source of truth).
      await db.transaction(async (tx) => {
        await purgeMemberGroupData(tx, groupId, targetUserId);

        // Placeholder discard (Decision 9): when the removed member was a
        // never-claimed ghost, also delete its users row — unless other
        // references still pin it (it was a payer / holds a plan leg), in
        // which case the row stays visible in the admin panel.
        if (targetUserRow[0]?.isPlaceholder) {
          await deleteGhostIfUnreferenced(tx, targetUserId);
        }
      });

      // Transparent group log: member removed (visible to everyone left).
      await logGroupActivity(groupId, userId, 'member_removed', {
        actorName: actorRow[0]?.name || 'An admin',
        memberName: targetRow[0]?.name || 'A member',
        neverJoined: !!targetUserRow[0]?.isPlaceholder,
      });

      broadcastGroupChanged(groupId);
      res.status(204).send();
    } catch (error) {
      console.error('Kick member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get group settings (any member can read)
  getGroupSettings: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const g = await db
        .select({ name: groups.name, currency: groups.currency, expenseEdit: groups.expenseEdit })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      res.status(200).json({
        name: g[0].name,
        currency: g[0].currency,
        expense_edit: g[0].expenseEdit,
      });
    } catch (error) {
      console.error('Get group settings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update group settings (admin only)
  updateGroupSettings: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { expenseEdit } = req.body || {};

      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
          eq(groupMembers.role, 'admin'),
        ))
        .limit(1);
      if (membership.length === 0) {
        return res.status(403).json({ error: 'Only an admin can change group settings' });
      }

      const allowed = ['admin_only', 'creator_admin', 'creator_only', 'all_members'];
      if (!expenseEdit || !allowed.includes(expenseEdit)) {
        return res.status(400).json({ error: 'Invalid expense_edit value' });
      }

      // Old value for the activity diff (settings_changed).
      const before = await db
        .select({ expenseEdit: groups.expenseEdit })
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      await db
        .update(groups)
        .set({ expenseEdit, updatedAt: new Date() })
        .where(eq(groups.id, groupId));

      // Transparent group log: rule change (only when something actually changed).
      if (before[0] && before[0].expenseEdit !== expenseEdit) {
        const actor = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        await logGroupActivity(groupId, userId, 'settings_changed', {
          actorName: actor[0]?.name || 'An admin',
          oldValue: before[0].expenseEdit,
          newValue: expenseEdit,
        });
      }

      res.status(200).json({ expense_edit: expenseEdit });
      broadcastGroupChanged(groupId);
    } catch (error) {
      console.error('Update group settings error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Invite a person by email (feature-invite-vs-add-member): ANY member can.
  // Creates (or re-finds) a passive `invited` seat — roster-visible, NOT in
  // the math (D1/D3) — and emails the existing invite link (no rotation).
  // Dedup (D3): one seat per email per group; an existing seat's status is
  // NEVER changed by an invite (a member's invite can't upgrade/demote the
  // admin's `added` ghost) — collision just re-sends the email.
  inviteMember: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { name, email } = req.body || {};

      // Validate input
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Recipient name is required' });
      }
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
      }

      // Requester must be a member of the group
      const membership = await db
        .select()
        .from(groupMembers)
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, userId),
        ))
        .limit(1);

      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      // Fetch group + requester name
      const groupResult = await db
        .select()
        .from(groups)
        .where(eq(groups.id, groupId))
        .limit(1);

      if (groupResult.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const requester = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      const group = groupResult[0];
      const frontendBase = process.env.FRONTEND_BASE_URL || 'http://home-port.local:3002';
      const inviteLink = `${frontendBase.endsWith('/') ? frontendBase.slice(0, -1) : frontendBase}/join/${group.inviteCode}`;
      const invitedBy = requester[0]?.name || 'A friend';
      const invitedEmail = email.trim().toLowerCase();

      // Dedup (D3): any existing seat for this email in this group wins —
      // status is NEVER changed here. We just re-send the email.
      const existingSeat = await db
        .select({ id: groupMembers.id, status: groupMembers.status })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(and(eq(groupMembers.groupId, groupId), eq(users.email, invitedEmail)))
        .limit(1);

      let alreadyInvited = existingSeat.length > 0;
      if (!alreadyInvited) {
        // ATOMIC: find-or-create the ghost user row, then seat it as invited.
        await db.transaction(async (tx) => {
          const existingUser = await tx
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.email, invitedEmail), eq(users.isPlaceholder, true)))
            .limit(1);
          const ghostId = existingUser.length > 0
            ? existingUser[0].id
            : (await tx
                .insert(users)
                .values({
                  email: invitedEmail,
                  name: name.trim(),
                  passwordHash: `unusable$${crypto.randomBytes(24).toString('hex')}`,
                  isPlaceholder: true,
                })
                .returning({ id: users.id }))[0].id;
          await tx.insert(groupMembers).values({ groupId, userId: ghostId, role: 'member', status: 'invited' });
        });
      }

      // Email the invite link (best-effort — the in-app pending seat stands
      // even if Resend is down, same rule as placeholder-add).
      let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      if (isEmailConfigured()) {
        try {
          await sendInviteEmail({
            toName: name.trim(),
            toEmail: invitedEmail,
            groupName: group.name,
            inviteLink,
            invitedBy,
          });
          emailStatus = 'sent';
        } catch (emailErr) {
          console.error('Invite email send failed (seat still stands):', emailErr);
          emailStatus = 'failed';
        }
      }

      // Bell ADMINS only (D6: an invite changes no math — it is actionable
      // news for the people who can Promote). Everyone else sees the feed row.
      try {
        const adminRows = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, 'admin')));
        const rows = adminRows
          .filter((m) => m.userId !== userId)
          .map((m) => ({
            userId: m.userId,
            groupId,
            type: 'member_invited_pending',
            payload: { memberName: name.trim(), invitedEmail, groupName: group.name, inMath: false },
          }));
        if (rows.length > 0) await db.insert(notifications).values(rows);
      } catch (notifyErr) {
        console.error('Invite notification error (non-fatal):', notifyErr);
      }

      // Transparent group log: an invite went out (inMath:false = passive seat).
      try {
        await logGroupActivity(groupId, userId, 'invite_sent', {
          actorName: invitedBy,
          inviteeName: name.trim(),
          invitedEmail,
          inMath: false,
        });
      } catch (logErr) {
        console.error('Invite activity log error (non-fatal):', logErr);
      }

      // Audit log the invite (best-effort; never blocks the response).
      try {
        const { logEmail } = await import('../services/emailLog');
        await logEmail({
          type: 'invite',
          toEmail: email.trim(),
          subject: `You're invited to join "${group.name}" on Splitsilly`,
          fromUserId: userId,
          groupId,
        });
      } catch (logErr) {
        console.error('Failed to log invite email:', logErr);
      }

      res.status(200).json({
        ok: true,
        invite_code: group.inviteCode,
        invite_link: inviteLink,
        sent_to: invitedEmail,
        already_invited: alreadyInvited,
        email_status: emailStatus,
      });
      broadcastGroupChanged(groupId);
    } catch (error: any) {
      console.error('Invite member error:', error);
      res.status(500).json({ error: error?.message || 'Internal server error' });
    }
  },

  // Fired fire-and-forget by the client when a member COPIES the invite link
  // (the copy→text path never touches the server otherwise). Deduped: one
  // "shared the invite link" row per member per group, no matter how many
  // times they hit the button.
  logInviteLinkShared: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;

      const membership = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const existing = await db
        .select({ id: groupActivity.id })
        .from(groupActivity)
        .where(and(
          eq(groupActivity.groupId, groupId),
          eq(groupActivity.actorId, userId),
          eq(groupActivity.action, 'invite_link_shared'),
        ))
        .limit(1);
      if (existing.length > 0) {
        return res.status(200).json({ ok: true, deduped: true });
      }

      const [actor] = await db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      await logGroupActivity(groupId, userId, 'invite_link_shared', {
        actorName: actor?.name || 'A member',
      });
      res.status(200).json({ ok: true, deduped: false });
    } catch (error) {
      // Never fail the client's fire-and-forget — log server-side, return ok.
      console.error('Log invite-link-shared error (non-fatal):', error);
      res.status(200).json({ ok: true, deduped: true });
    }
  },
};
