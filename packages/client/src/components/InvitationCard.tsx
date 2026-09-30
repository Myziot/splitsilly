import { useState } from 'react';
import { useInvitationStore } from '../store/invitations';
import { useGroupStore } from '../store/groups';

interface Props {
  membershipId: string;
  groupId: string;
  groupName: string;
  invitedBy: string;
  invitedName: string;
  invitedEmail: string;
  balanceIfAccepted: number;
  currency?: string;
  inviteCode?: string;
  /** 'invited' = passive seat (starts at zero); 'added' = already in the math. */
  seatStatus?: 'added' | 'invited';
  /** Extra proof for the hand-passed-link claim path (Decision 10b). */
  withInviteCode?: boolean;
  onAccepted?: (groupId: string) => void;
}

/**
 * Pending-invitation disclosure card (feature-placeholder-member Decision 4):
 * shows WHO invited you, WHERE, and the balance you'd inherit BEFORE Accept —
 * honest by disclosure, not by lock. Shared by the Groups overview inbox and
 * the invite-link claim screen.
 */
export default function InvitationCard({
  membershipId, groupId, groupName, invitedBy, invitedName, invitedEmail,
  balanceIfAccepted, currency, inviteCode, seatStatus, withInviteCode, onAccepted,
}: Props) {
  const { accept, decline } = useInvitationStore();
  const { fetchGroups } = useGroupStore();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [error, setError] = useState('');

  const bal = Math.round(balanceIfAccepted * 100) / 100;
  const balLine =
    Math.abs(bal) < 0.01 ? 'Your balance would start at zero.' :
    bal < 0 ? `You'd start owing ${Math.abs(bal).toFixed(2)}${currency ? ` ${currency}` : ''}.` :
    `You'd start owed ${bal.toFixed(2)}${currency ? ` ${currency}` : ''}.`;

  const doAccept = async () => {
    setBusy('accept'); setError('');
    try {
      const res = await accept(membershipId, withInviteCode && inviteCode ? inviteCode : undefined);
      void res;
      await fetchGroups();
      onAccepted?.(membershipId);
    } catch (e: any) {
      setError(e.message || 'Failed to accept');
      setBusy(null);
    }
  };

  const doDecline = async () => {
    setBusy('decline'); setError('');
    try {
      await decline(membershipId);
    } catch (e: any) {
      setError(e.message || 'Failed to decline');
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">
            Invitation to <span className="select-text">“{groupName}”</span>
          </p>
          <p className="mt-0.5 text-sm text-gray-600">
            <span className="select-text">{invitedBy}</span> {seatStatus === 'invited' ? 'invited' : 'added'}{' '}
            <span className="select-text">{invitedName}</span>
            {invitedEmail ? <> (<span className="select-text text-gray-400">{invitedEmail}</span>)</> : null}{' '}
            — {seatStatus === 'invited'
              ? "you're not in any expense yet; accepting just joins the group"
              : "you're counted in the group's expenses already"}.
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-indigo-700">{balLine}</p>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          onClick={doAccept}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
        >
          {busy === 'accept' ? 'Accepting…' : 'Accept & join'}
        </button>
        <button
          onClick={doDecline}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50"
        >
          {busy === 'decline' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  );
}
