import { Resend } from 'resend';

/**
 * Email service scaffolding for split_silly.
 *
 * Uses Resend (https://resend.com). The API key is read from RESEND_API_KEY.
 * This is intentionally "scaffolding": if the key is not configured the
 * functions throw a clear, actionable error instead of failing obscurely.
 *
 * DELIVERABILITY NOTE: Resend's free tier can only send from the @resend.dev
 * sandbox domain until you verify your own domain in the Resend dashboard.
 * Until then Gmail/others may route to spam (envelope domain != your domain,
 * no aligned DKIM/SPF). To improve deliverability we send a multipart message
 * (HTML + plain-text), set a display name + Reply-To, and include a
 * List-Unsubscribe header. For production, verify a domain in Resend and set
 * RESEND_FROM_EMAIL to e.g. invites@yourdomain.com.
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
// RESEND_FROM_EMAIL may be a bare address (user@example.com) OR a full
// "Name <user@example.com>" string (e.g. a verified domain like the
// dungeon-arena.818888817.xyz one). Never double-wrap it.
const RESEND_FROM_RAW = (process.env.RESEND_FROM_EMAIL || '').trim();
const RESEND_FROM_NAME = (process.env.RESEND_FROM_NAME || 'Splitsilly').trim();
const RESEND_REPLY_TO = (process.env.RESEND_REPLY_TO || RESEND_FROM_RAW || 'onboarding@resend.dev').trim();

// Final `from` value: if RESEND_FROM_EMAIL already contains a <...> address
// part, use it verbatim; otherwise wrap the bare address with the display name.
function resolveFrom(): string {
  const raw = RESEND_FROM_RAW;
  if (!raw) return `${RESEND_FROM_NAME} <onboarding@resend.dev>`;
  if (/<.+@.+>/.test(raw)) return raw; // already "Name <addr>"
  return `${RESEND_FROM_NAME} <${raw}>`; // bare addr -> add display name
}
const RESEND_FROM = resolveFrom();

function getResend(): Resend {
  if (!RESEND_API_KEY) {
    throw new Error(
      'Email service not configured: RESEND_API_KEY is missing. ' +
        'Set it in packages/server/.env to enable invitation emails.'
    );
  }
  return new Resend(RESEND_API_KEY);
}

function buildInviteHtml(opts: {
  toName: string;
  groupName: string;
  inviteLink: string;
  invitedBy: string;
}): string {
  const name = opts.toName?.trim() || 'there';
  const safeLink = opts.inviteLink.replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0; padding:0; background:#f3f4f6;">
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="margin: 0 0 8px;">You're invited to join "${opts.groupName}" on Splitsilly</h2>
      <p style="color: #4b5563;">Hi ${name},</p>
      <p style="color: #4b5563;">
        ${opts.invitedBy} invited you to share expenses in the group
        <strong>${opts.groupName}</strong>. Splitsilly helps friends track and split costs easily.
      </p>
      <p style="margin: 24px 0;">
        <a href="${safeLink}"
           style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
          Join the group
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 13px; word-break: break-all;">
        Or copy this link into your browser:<br />${safeLink}
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        Sent by Splitsilly, a local cost-sharing app. If you weren't expecting this, you can
        safely ignore the message.
      </p>
    </div>
  </body>
</html>`;
}

function buildInviteText(opts: {
  toName: string;
  groupName: string;
  inviteLink: string;
  invitedBy: string;
}): string {
  const name = opts.toName?.trim() || 'there';
  return [
    `Hi ${name},`,
    ``,
    `${opts.invitedBy} invited you to share expenses in the group "${opts.groupName}" on Splitsilly.`,
    `Splitsilly helps friends track and split costs easily.`,
    ``,
    `Join the group: ${opts.inviteLink}`,
    ``,
    `Sent by Splitsilly, a local cost-sharing app. If you weren't expecting this, you can safely ignore the message.`,
  ].join('\n');
}

export interface InviteEmailInput {
  toName: string;
  toEmail: string;
  groupName: string;
  inviteLink: string;
  invitedBy: string;
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<{ id: string }> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [input.toEmail],
    replyTo: RESEND_REPLY_TO,
    subject: `You're invited to join "${input.groupName}" on Splitsilly`,
    html: buildInviteHtml(input),
    text: buildInviteText(input),
    headers: {
      'List-Unsubscribe': '<mailto:unsubscribe@resend.dev?subject=unsubscribe>',
    },
  });

  if (error) {
    throw new Error(`Failed to send invite email: ${error.message}`);
  }

  return { id: data?.id ?? 'unknown' };
}

/**
 * Settlement reminder email — sent by a creditor (someone owed money) to a
 * debtor (someone who owes) to nudge them to settle up. Brand: Splitsilly.
 */
export interface ReminderEmailInput {
  /** Creditor — the person owed money (the sender/reminder author). */
  fromName: string;
  fromEmail: string;
  /** Debtor — the person who owes (the recipient of the nudge). */
  toName: string;
  toEmail: string;
  groupName: string;
  amount: number;
  currency: string;
  /** Optional short note from the creditor. */
  note?: string | null;
}

function buildReminderHtml(opts: ReminderEmailInput): string {
  const debtor = opts.toName?.trim() || 'there';
  const creditor = opts.fromName?.trim() || 'A friend';
  const amount = `${opts.amount.toFixed(2)} ${opts.currency}`;
  // A short, friendly, funny haiku to soften the nudge.
  const haiku = [
    'The debt gently waits,',
    'like a cat by an empty bowl —',
    'please feed it some coins.',
  ].join('<br />');
  const note = opts.note?.trim()
    ? `<p style="color:#4b5563;">${creditor} added: <em>"${opts.note.replace(/</g, '&lt;')}"</em></p>`
    : '';
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0; padding:0; background:#f3f4f6;">
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="margin: 0 0 8px;">A friendly nudge from ${creditor} 🏴‍☠️</h2>
      <p style="color: #4b5563;">Ahoy ${debtor},</p>
      <p style="color: #4b5563;">
        In the group <strong>${opts.groupName}</strong> you currently owe
        <strong>${amount}</strong>. Whenever you're ready, a quick settlement would
        make the ship sail smooth again!
      </p>
      <div style="margin: 16px 0; padding: 16px; background:#eef2ff; border-left: 4px solid #6366f1; border-radius: 6px; color:#3730a3; font-style: italic; line-height: 1.5;">
        ${haiku}
      </div>
      ${note}
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        Sent by Splitsilly, a friendly cost-sharing app. No pressure — just a gentle reminder.
      </p>
    </div>
  </body>
</html>`;
}

function buildReminderText(opts: ReminderEmailInput): string {
  const debtor = opts.toName?.trim() || 'there';
  const creditor = opts.fromName?.trim() || 'A friend';
  const amount = `${opts.amount.toFixed(2)} ${opts.currency}`;
  const haiku = [
    'The debt gently waits,',
    'like a cat by an empty bowl —',
    'please feed it some coins.',
  ].join('\n');
  const note = opts.note?.trim() ? `\n\n${creditor} added: "${opts.note.trim()}"` : '';
  return [
    `Ahoy ${debtor},`,
    ``,
    `In the group "${opts.groupName}" you currently owe ${amount}.`,
    `Whenever you're ready, a quick settlement would make the ship sail smooth again!`,
    ``,
    haiku,
    note,
    ``,
    `Sent by Splitsilly, a friendly cost-sharing app. No pressure — just a gentle reminder.`,
  ].join('\n');
}

export async function sendReminderEmail(input: ReminderEmailInput): Promise<{ id: string }> {
  const resend = getResend();

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM,
    to: [input.toEmail],
    replyTo: RESEND_REPLY_TO,
    subject: `Friendly reminder: you owe ${input.amount.toFixed(2)} ${input.currency} in "${input.groupName}"`,
    html: buildReminderHtml(input),
    text: buildReminderText(input),
    headers: {
      'List-Unsubscribe': '<mailto:unsubscribe@resend.dev?subject=unsubscribe>',
    },
  });

  if (error) {
    throw new Error(`Failed to send reminder email: ${error.message}`);
  }

  return { id: data?.id ?? 'unknown' };
}

/**
 * Returns true when the Resend API key is present (i.e. email is wired up).
 * Used by callers to return a clear 503 instead of throwing mid-request.
 */
export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}
