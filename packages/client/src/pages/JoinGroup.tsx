import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useGroupStore } from '../store/groups';
import RateFootnote from '../components/RateFootnote';

interface EqualExpense {
  id: string;
  description: string;
  amount: string;
  currency: string;
  expense_date: string;
  paid_by_name: string;
  is_owner: boolean;
}

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

  // Equal-participation step (shown after a fresh join, if there are equal expenses).
  const [equalExpenses, setEqualExpenses] = useState<EqualExpense[]>([]);
  // Checked = "I participated" (default checked). user_id set of expense ids opted IN.
  const [participateIds, setParticipateIds] = useState<Set<string>>(new Set());
  const [showParticipation, setShowParticipation] = useState(false);
  const [applying, setApplying] = useState(false);

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

    if (inviteCode && !done && !error) {
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
        await fetchGroups();
        setDone({ groupName: data.name || groupName, alreadyMember: false, groupId: data.id });
        // Fetch equal expenses to offer the participation choice.
        if (data.id) {
          try {
            const exRes = await fetch(`/api/v1/groups/${data.id}/joinable-equal-expenses`, {
              credentials: 'include',
            });
            if (exRes.ok) {
              const exps: EqualExpense[] = await exRes.json();
              if (exps.length > 0) {
                setEqualExpenses(exps);
                // Default: every expense checked (participated).
                setParticipateIds(new Set(exps.map((e) => e.id)));
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

  const submitParticipation = async () => {
    if (!done?.groupId) {
      setShowParticipation(false);
      return;
    }
    setApplying(true);
    try {
      const participate = equalExpenses.filter((e) => participateIds.has(e.id)).map((e) => e.id);
      const optOut = equalExpenses.filter((e) => !participateIds.has(e.id)).map((e) => e.id);
      await fetch(`/api/v1/groups/${done.groupId}/equal-participation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ participate, optOut }),
      });
    } catch {
      /* non-fatal */
    } finally {
      setApplying(false);
      setShowParticipation(false);
    }
  };

  const title = groupName ? `“${groupName}”` : 'this group';

  // --- Equal-participation checklist screen ---
  if (showParticipation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 text-center">Which expenses were you part of?</h2>
            <p className="mt-2 text-sm text-gray-600 text-center">
              These shared (equal-split) expenses already exist in {title}. Leave an item checked if you
              took part in it — uncheck the ones you weren't part of. Checked expenses will include your share.
            </p>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {equalExpenses.map((e) => (
              <label
                key={e.id}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 cursor-pointer hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  checked={participateIds.has(e.id)}
                  onChange={(ev) =>
                    setParticipateIds((prev) => {
                      const next = new Set(prev);
                      if (ev.target.checked) next.add(e.id);
                      else next.delete(e.id);
                      return next;
                    })
                  }
                />
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-gray-900">{e.description}</span>
                    <span className="text-sm text-gray-700">
                      {e.currency} {parseFloat(e.amount).toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Paid by {e.paid_by_name} · {e.expense_date}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-400 text-center">
            {participateIds.size} of {equalExpenses.length} selected. Unchecked expenses notify their creator to review.
          </p>
          <button
            onClick={submitParticipation}
            disabled={applying}
            className="w-full py-2 px-4 rounded-md text-white bg-blue-600 hover:bg-blue-700 font-medium disabled:opacity-50"
          >
            {applying ? 'Saving…' : 'Confirm'}
          </button>
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
