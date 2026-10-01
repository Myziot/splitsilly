import { Request, Response } from 'express';
import { db } from '../db';
import {
  groups,
  groupMembers,
  users,
  notifications,
  groupActivity,
} from '../db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { sendInviteEmail, isEmailConfigured } from '../services/email';
import { logGroupActivity } from './notifications';
import { calculateBalances } from '../services/balances';
import { purgeMemberGroupData, deleteGhostIfUnreferenced, mergeGhostIntoUser } from '../services/members';
import { broadcastGroupChanged } from '../sockets';

/**
 * Placeholder members & the invitation inbox (feature-placeholder-member.md).
 *
 * A "placeholder" (ghost) is a users row an ADMIN creates for a person who has
 * not registered yet (Decision 1). The ghost row doubles as the invitation
 * (Decision 3): the inbox is simply "ghost memberships whose email is mine".
 * Nothing lands on a real account until the person ACCEPTS (Decision 3b), and
 * ghosts are invisible to every auth lookup (Decision 10).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin-of-this-group check (same gate as kickMember — Decision 6). */
async function requireAdminOfGroup(groupId: string, userId: string) {
  return db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(
      eq(groupMembers.groupId, groupId),
      eq(groupMembers.userId, userId),
      eq(groupMembers.role, 'admin'),
    ))
    .limit(1);
}

/** One pending-invitation card: group, inviter, invited email, balance-if-accepted. */
async function buildInboxItem(ghostMembership: {
  membershipId: string;
  membershipStatus?: string;
  groupId: string;
  ghostUserId: string;
  groupName: string;
  inviteCode: string;
  invitedEmail: string;
  invitedName: string;
}, claimerId: string) {
  // Who added them? The activity log row is the audit trail — prefer its
  // actorName; fall back to the group creator if the row is missing.
  const [activityActor] = await db
    .select({ name: users.name })
    .from(groupActivity)
    .innerJoin(users, eq(users.id, groupActivity.actorId))
    .where(and(
      eq(groupActivity.groupId, ghostMembership.groupId),
      eq(groupActivity.action, 'member_added_pending'),
      sql`(${groupActivity.details}->>'invitedEmail') = ${ghostMembership.invitedEmail}`,
    ))
    .limit(1);
  const inviterName =
    activityActor?.name ||
    (await db
      .select({ name: users.name })
      .from(groups)
      .innerJoin(users, eq(users.id, groups.createdBy))
      .where(eq(groups.id, ghostMembership.groupId))
      .limit(1))[0]?.name ||
    'An admin';

  // Disclosure card (Decision 4): the balance they'd inherit on accept.
  const balances = await calculateBalances(ghostMembership.groupId, [ghostMembership.ghostUserId]);
  const balance = balances[0]?.balance ?? 0;
  const [currencyRow] = await db
    .select({ currency: groups.currency })
    .from(groups)
    .where(eq(groups.id, ghostMembership.groupId))
    .limit(1);

  return {
    membership_id: ghostMembership.membershipId,
    seat_status: ghostMembership.membershipStatus || 'added',
    group_id: ghostMembership.groupId,
    group_name: ghostMembership.groupName,
    invite_code: ghostMembership.inviteCode,
    invited_email: ghostMembership.invitedEmail,
    invited_name: ghostMembership.invitedName,
    invited_by: inviterName,
    balance_if_accepted: balance,
    currency: currencyRow?.currency,
  };
}

/**
 * List the ghost memberships addressed to a set of emails, excluding groups
 * the claimer is already a member of (those surface in the roster, not the
 * inbox). Shared by GET /invitations (my email) and the invite-link claim
 * lookup (any email → matched by group + ghost id instead).
 */
async function findPendingInvitations(emails: string[], excludeMemberOfGroupId?: string) {
  if (emails.length === 0) return [];
  const rows = await db
    .select({
      membershipId: groupMembers.id,
      membershipStatus: groupMembers.status,
      groupId: groups.id,
      ghostUserId: users.id,
      groupName: groups.name,
      inviteCode: groups.inviteCode,
      invitedEmail: users.email,
      invitedName: users.name,
    })
    .from(groupMembers)
    .innerJoin(users, eq(users.id, groupMembers.userId))
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(
      inArray(users.email, emails),
      eq(users.isPlaceholder, true),
    ));
  return excludeMemberOfGroupId
    ? rows.filter((r) => r.groupId !== excludeMemberOfGroupId)
    : rows;
}

export const invitationsHandler = {
  /**
   * POST /api/v1/groups/:groupId/placeholder-members  (admin only, Decision 6)
   * Body: { name, email }. Creates the ghost + membership atomically, emails
   * the invite (best-effort — the in-app invitation is the source of truth),
   * bells EVERY member (Decision 8), and logs `member_added_pending`.
   */
  addPlaceholderMember: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId } = req.params;
      const { name, email } = req.body || {};

      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Name is required' });
      }
      if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
        return res.status(400).json({ error: 'A valid email address is required' });
      }
      const invitedEmail = email.toLowerCase().trim();
      const invitedName = name.trim();

      const admin = await requireAdminOfGroup(groupId, userId);
      if (admin.length === 0) {
        return res.status(403).json({ error: 'Only an admin can add a member before they join' });
      }

      const groupResult = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
      if (groupResult.length === 0) {
        return res.status(404).json({ error: 'Group not found' });
      }
      const group = groupResult[0];

      // Dedup (Decision 9): one pending invitation per email per group, and a
      // REAL member with that email can't also hold a ghost seat.
      const clash = await db
        .select({ id: groupMembers.id, isPlaceholder: users.isPlaceholder, seatStatus: groupMembers.status })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(and(eq(groupMembers.groupId, groupId), eq(users.email, invitedEmail)))
        .limit(1);
      if (clash.length > 0) {
        return res.status(400).json({
          error: clash[0].isPlaceholder
            ? clash[0].seatStatus === 'invited'
              ? `${invitedName} already has a pending invite here — use “Add to group” on their row to count them now`
              : `${invitedName} is already invited to this group`
            : `Someone with that email is already a member of this group`,
        });
      }

      const actor = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const actorName = actor[0]?.name || 'An admin';

      // ATOMIC: find-or-create the ghost by email, then seat it. The random
      // password hash is unusable by design (Decision 1 + 10).
      const ghost = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(users)
          .where(and(eq(users.email, invitedEmail), eq(users.isPlaceholder, true)))
          .limit(1);
        const ghostRow = existing.length > 0
          ? existing[0]
          : (await tx
              .insert(users)
              .values({
                email: invitedEmail,
                name: invitedName,
                passwordHash: `unusable$${crypto.randomBytes(24).toString('hex')}`,
                isPlaceholder: true,
              })
              .returning())[0];

        await tx.insert(groupMembers).values({ groupId, userId: ghostRow.id, role: 'member', status: 'added' });
        return ghostRow;
      });

      // Bell for EVERY member (Decision 8: full broadcast, actor included —
      // unlike the except-sender pattern, an add is news for the adder too).
      try {
        const memberRows = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, groupId));
        const rows = memberRows.map((m) => ({
          userId: m.userId,
          groupId,
          type: 'member_invited_pending',
          payload: { memberName: invitedName, invitedEmail, groupName: group.name, inMath: true },
        }));
        if (rows.length > 0) await db.insert(notifications).values(rows);
      } catch (notifyErr) {
        console.error('Placeholder-invite notification error (non-fatal):', notifyErr);
      }

      await logGroupActivity(groupId, userId, 'member_added_pending', {
        actorName,
        memberName: invitedName,
        invitedEmail,
      });

      // Email the invite link (best-effort; the in-app invitation stands even
      // if Resend is down — Decision 8 / edge case list).
      let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
      let sendErrForLog: unknown = null; // P3: real error text for email_logs
      const frontendBase = process.env.FRONTEND_BASE_URL || 'http://home-port.local:3002';
      const inviteLink = `${frontendBase.replace(/\/$/, '')}/join/${group.inviteCode}`;
      if (isEmailConfigured()) {
        try {
          await sendInviteEmail({
            toName: invitedName,
            toEmail: invitedEmail,
            groupName: group.name,
            inviteLink,
            invitedBy: actorName,
          });
          emailStatus = 'sent';
        } catch (sendErr: any) {
          emailStatus = 'failed';
          sendErrForLog = sendErr;
          console.info('Placeholder invite email not sent (non-fatal):', sendErr?.message);
        }
      }
      try {
        if (emailStatus !== 'skipped') {
          const { logEmail } = await import('../services/emailLog');
          await logEmail({
            type: 'invite',
            toEmail: invitedEmail,
            subject: `You're invited to join "${group.name}" on Splitsilly`,
            fromUserId: userId,
            groupId,
            status: emailStatus === 'sent' ? 'sent' : 'failed',
            // P3 (signup-flow review): capture the REAL Resend error instead of
            // the generic 'Send failed (placeholder add)' — debugging email
            // failures meant probing Resend by hand before.
            errorMessage: emailStatus === 'failed' ? String((sendErrForLog as any)?.message || sendErrForLog || 'Send failed (placeholder add)').slice(0, 500) : null,
          });
        }
      } catch (logErr) {
        console.error('Failed to log placeholder invite email:', logErr);
      }

      res.status(201).json({
        ok: true,
        user_id: ghost.id,
        email: ghost.email,
        name: ghost.name,
        is_placeholder: true,
        email_status: emailStatus,
        invite_link: inviteLink,
      });
      broadcastGroupChanged(groupId);
    } catch (error) {
      console.error('Add placeholder member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * GET /api/v1/invitations — the account-based inbox (Decision 2b): pending
   * invitations addressed to MY email, in groups I'm not a member of yet.
   */
  getMyInvitations: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!me) return res.status(200).json([]);

      const rows = await findPendingInvitations([me.email]);
      // Drop rows in groups I already belong to (roster shows those instead).
      const myGroupIds = await db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(eq(groupMembers.userId, userId));
      const mine = new Set(myGroupIds.map((g) => g.groupId));
      const visible = rows.filter((r) => !mine.has(r.groupId));

      const items = [];
      for (const row of visible) {
        items.push(await buildInboxItem(row, userId));
      }
      res.status(200).json(items);
    } catch (error) {
      console.error('Get invitations error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * GET /api/v1/join/:inviteCode/placeholder — authed claim-card lookup for
   * the invite-link path (Decision 10b): does THIS group hold a pending ghost
   * for my email? Returns the disclosure card when it does.
   */
  getPlaceholderByInvite: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { inviteCode } = req.params;
      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);

      const groupResult = await db
        .select({ id: groups.id, name: groups.name, inviteCode: groups.inviteCode })
        .from(groups)
        .where(eq(groups.inviteCode, inviteCode.toUpperCase()))
        .limit(1);
      if (groupResult.length === 0 || !me) {
        return res.status(404).json({ error: 'Invite code not found' });
      }

      const rows = await findPendingInvitations([me.email], undefined);
      const hit = rows.find((r) => r.groupId === groupResult[0].id);
      if (!hit) return res.status(200).json({ found: false });

      res.status(200).json({ found: true, ...(await buildInboxItem(hit, userId)) });
    } catch (error) {
      console.error('Get placeholder by invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * POST /api/v1/invitations/:membershipId/accept — the merge (Decision 2/4).
   * Allowed when the ghost's email is MY email, or when the request carries
   * this group's invite code (the hand-passed-link path, Decision 10b — the
   * client only offers Accept after showing the disclosure card).
   */
  acceptInvitation: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { membershipId } = req.params;
      const inviteCode: string | undefined = req.body?.invite_code;

      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (!me) return res.status(404).json({ error: 'User not found' });

      const rows = await db
        .select({
          membershipId: groupMembers.id,
          groupId: groupMembers.groupId,
          ghostUserId: users.id,
          ghostEmail: users.email,
          ghostName: users.name,
          groupName: groups.name,
          inviteCode: groups.inviteCode,
        })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .where(and(eq(groupMembers.id, membershipId), eq(users.isPlaceholder, true)))
        .limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found' });
      }
      const inv = rows[0];

      // Proof (Decision 4 + 10b): my email, or possession of the group's
      // invite code (the emailed link). No proof -> 403.
      const emailMatch = inv.ghostEmail.toLowerCase() === me.email.toLowerCase();
      const codeMatch = !!inviteCode && inviteCode.toUpperCase() === inv.inviteCode.toUpperCase();
      if (!emailMatch && !codeMatch) {
        return res.status(403).json({ error: 'This invitation belongs to another email. Use the invite link from your email to claim it here.' });
      }

      // Already a member? Nothing to merge into twice.
      const alreadyIn = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, inv.groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (alreadyIn.length > 0) {
        return res.status(400).json({ error: 'You are already a member of this group' });
      }

      await db.transaction(async (tx) => {
        await mergeGhostIntoUser(tx, inv.ghostUserId, userId);
        await tx.insert(groupMembers).values({ groupId: inv.groupId, userId, role: 'member' });
      });

      // The joiner's own bell/flags machinery (weighted-expense review) is
      // skipped on merge: the ghost already sat in every split, so there is
      // nothing "new" to review — the history simply becomes theirs.
      await logGroupActivity(inv.groupId, userId, 'member_joined', {
        actorName: me.email === inv.ghostEmail.toLowerCase()
          ? inv.ghostName
          : `${inv.ghostName} (claimed an invite addressed to ${inv.ghostEmail})`,
        groupName: inv.groupName,
      });

      res.status(200).json({ ok: true, group_id: inv.groupId, name: inv.groupName });
      broadcastGroupChanged(inv.groupId);
    } catch (error) {
      console.error('Accept invitation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * POST /api/v1/groups/:groupId/members/:userId/promote  (admin only —
   * feature-invite-vs-add-member D2). Flips a passive `invited` seat to
   * `added`: the person now counts in the math and appears in splitters,
   * exactly like the admin "Add Member" path. The person is NOT joined —
   * they still accept the invite later to claim the history.
   */
  promoteInvitedMember: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { groupId, userId: targetUserId } = req.params;

      const admin = await requireAdminOfGroup(groupId, userId);
      if (admin.length === 0) {
        return res.status(403).json({ error: 'Only an admin can add a pending member to the group' });
      }

      const flipped = await db
        .update(groupMembers)
        .set({ status: 'added' })
        .where(and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.userId, targetUserId),
          eq(groupMembers.status, 'invited'),
        ))
        .returning({ id: groupMembers.id });
      if (flipped.length === 0) {
        return res.status(400).json({ error: 'That member is not an invited (pending) member of this group' });
      }

      const [target] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, targetUserId)).limit(1);
      const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);

      // Full broadcast (D6): promoting MOVES THE MATH, so everyone hears it —
      // same event the admin "Add Member" path fires.
      try {
        const memberRows = await db
          .select({ userId: groupMembers.userId })
          .from(groupMembers)
          .where(eq(groupMembers.groupId, groupId));
        const rows = memberRows.map((m) => ({
          userId: m.userId,
          groupId,
          type: 'member_invited_pending',
          payload: { memberName: target?.name || 'A member', invitedEmail: target?.email || '', groupName: group?.name || '', inMath: true },
        }));
        if (rows.length > 0) await db.insert(notifications).values(rows);
      } catch (notifyErr) {
        console.error('Promote notification error (non-fatal):', notifyErr);
      }

      await logGroupActivity(groupId, userId, 'member_added_pending', {
        actorName: actor?.name || 'An admin',
        memberName: target?.name || 'A member',
        invitedEmail: target?.email || '',
        promoted: true,
      });

      broadcastGroupChanged(groupId);
      res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Promote invited member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  /**
   * POST /api/v1/invitations/:membershipId/decline — the invitee says no.
   * Same cascade as an admin discard (Decision 9), actor = the invitee.
   */
  declineInvitation: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const { membershipId } = req.params;

      const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      const rows = await db
        .select({
          membershipId: groupMembers.id,
          groupId: groupMembers.groupId,
          ghostUserId: users.id,
          ghostEmail: users.email,
          ghostName: users.name,
        })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(and(eq(groupMembers.id, membershipId), eq(users.isPlaceholder, true)))
        .limit(1);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Invitation not found' });
      }
      const inv = rows[0];
      if (!me || inv.ghostEmail.toLowerCase() !== me.email.toLowerCase()) {
        return res.status(403).json({ error: 'Only the invited person can decline this invitation' });
      }

      await db.transaction(async (tx) => {
        await purgeMemberGroupData(tx, inv.groupId, inv.ghostUserId);
        await deleteGhostIfUnreferenced(tx, inv.ghostUserId);
      });

      await logGroupActivity(inv.groupId, userId, 'member_removed', {
        actorName: 'The system',
        memberName: inv.ghostName,
        neverJoined: true,
        declined: true,
      });

      broadcastGroupChanged(inv.groupId);
      res.status(204).send();
    } catch (error) {
      console.error('Decline invitation error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
