import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useGroupStore } from '../store/groups';
import RateFootnote from '../components/RateFootnote';
import EqualParticipationPicker, { type JoinableExpense } from '../components/EqualParticipationPicker';
import InvitationCard from '../components/InvitationCard';

export default function JoinGroup() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { fetchGroups } = useGroupStore();

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<null | { groupName: string; alreadyMember: boolean; groupId?: string }>(null);
  const [groupName, setGroupName] = useState('');
  const [infoLoading, setInfoLoading] = useState(true);

  // A pending placeholder invitation exists for this group + my email — show
  // the claim card instead of a plain join (feature-placeholder-member D2/10b).
  const [claim, setClaim] = useState<null | {
    membershipId: string; groupId: string; invitedName: string; invitedEmail: string;
    balanceIfAccepted: number; currency?: string; seatStatus?: 'added' | 'invited';
  }>(null);

  // Equal-participation step (shown after a fresh join, if there are equal expenses).
  const [equalExpenses, setEqualExpenses] = useState<JoinableExpense[]>([]);
  const [showParticipation, setShowParticipation] = useState(false);

  // Load the group name (public, works before auth) so we can show context.
  useEffect(() => {
    if (!inviteCode) return;
    setInfoLoading(true);
    fetch(`/api/v1/join/${inviteCode}/info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGroupName(d?.groupName || ''))
      .catch(() => setGroupName(''))
      .finally(() => setInfoLoading(false));
  }, [inviteCode]);

  useEffect(() => {
    if (!isAuthenticated) {
      // Carry the invite code into login (which forwards to register too).
      navigate(`/login?invite=${inviteCode}`);
      return;
    }

    if (inviteCode && !done && !error && !claim) {
      handleJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode, isAuthenticated]);

  const handleJoin = async () => {
    if (!inviteCode) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/v1/join/${inviteCode}`, {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        // Pending-invitation branch: the server found a ghost with my email
        // already counted in this group's math. Offer the claim card.
        if (data.pending_invitation) {
          // Full disclosure card (balance they'd inherit) via the claim lookup.
          let balance = 0; let currency: string | undefined;
          try {
            const cardRes = await fetch(`/api/v1/join/${inviteCode}/placeholder`, { credentials: 'include' });
            if (cardRes.ok) {
              const card = await cardRes.json();
              if (card?.found) { balance = card.balance_if_accepted; currency = card.currency; }
            }
          } catch { /* disclosure line falls back to "starts at zero" */ }
          setClaim({
            membershipId: data.pending_invitation.membership_id,
            groupId: data.id,
            invitedName: data.pending_invitation.invited_name,
            invitedEmail: data.pending_invitation.invited_email,
            balanceIfAccepted: balance,
            currency,
            seatStatus: data.pending_invitation.seat_status,
          });
          setGroupName(data.name || groupName);
          setLoading(false);
          return;
        }
        await fetchGroups();
        setDone({ groupName: data.name || groupName, alreadyMember: false, groupId: data.id });
        // Fetch equal expenses to offer the participation choice.
        if (data.id) {
          try {
            const exRes = await fetch(`/api/v1/groups/${data.id}/joinable-equal-expenses`, {
              credentials: 'include',
            });
            if (exRes.ok) {
              const exps: JoinableExpense[] = await exRes.json();
              if (exps.length > 0) {
                setEqualExpenses(exps);
                setShowParticipation(true);
              }
            }
          } catch {
            /* non-fatal — skip the participation step */
          }
        }
      } else if (response.status === 400) {
        // Already a member
        const data = await response.json().catch(() => ({}));
        setDone({ groupName: data.name || groupName, alreadyMember: true });
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to join group');
      }
    } catch (err) {
      setError('Failed to join group');
    } finally {
      setLoading(false);
    }
  };

  const submitParticipation = async (participate: string[], optOut: string[]) => {
    if (!done?.groupId) {
      setShowParticipation(false);
      return;
    }
    try {
      await fetch(`/api/v1/groups/${done.groupId}/equal-participation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ participate, optOut }),
      });
      setShowParticipation(false);
    } catch (e: any) {
      throw e; // surfaced inside the picker
    }
  };

  const title = groupName ? `“${groupName}”` : 'this group';

  // --- Equal-participation checklist screen (shared picker) ---
  if (showParticipation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8">
          <EqualParticipationPicker
            expenses={equalExpenses}
            subjectName="you"
            title="Which expenses were you part of?"
            onConfirm={submitParticipation}
            onCancel={() => setShowParticipation(false)}
          />
          <RateFootnote />
        </div>
      </div>
    );
  }

  // --- Claim-card screen (pending invitation found on the invite-link path) ---
  if (claim) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">You're already in {title}!</h2>
            <p className="mt-2 text-gray-600">
              {claim.seatStatus === 'invited'
                ? 'You were invited to this group. Accept to join — you will not appear in any expense until you do.'
                : "An admin added you to the group's calculations before you joined. Accept to bring that history into your account."}
            </p>
          </div>
          <InvitationCard
            membershipId={claim.membershipId}
            groupId={claim.groupId}
            groupName={groupName}
            invitedBy="the group admin"
            invitedName={claim.invitedName}
            invitedEmail={claim.invitedEmail}
            balanceIfAccepted={claim.balanceIfAccepted}
            currency={claim.currency}
            inviteCode={inviteCode}
            seatStatus={claim.seatStatus}
            withInviteCode
            onAccepted={() => {
              fetchGroups();
              setDone({ groupName, alreadyMember: false, groupId: claim.groupId });
              setClaim(null);
            }}
          />
          <RateFootnote />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          {done ? (
            <>
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">
                {done.alreadyMember ? `You're already in ${title}` : `You've joined ${title}!`}
              </h2>
              <p className="mt-2 text-gray-600">
                {done.alreadyMember
                  ? 'You are a member of this group.'
                  : 'Welcome aboard — you can now split expenses with the group.'}
              </p>
              <div className="mt-6">
                <Link
                  to="/groups"
                  className="inline-block w-full py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-medium"
                >
                  Go to your groups
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900">
                {infoLoading ? 'Joining group…' : `Join ${title}`}
              </h2>
              <p className="mt-2 text-gray-600">
                {infoLoading ? 'Loading…' : `You've been invited to share expenses in ${title}.`}
              </p>
              {loading && (
                <div className="mt-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              )}
              {error && (
                <div className="mt-4">
                  <p className="text-red-600">{error}</p>
                  <Link to="/groups" className="mt-4 inline-block text-blue-600 hover:text-blue-500">
                    Back to groups
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
        <RateFootnote />
      </div>
    </div>
  );
}
