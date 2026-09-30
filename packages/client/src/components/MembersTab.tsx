import { useState } from 'react';
import InviteLink from './InviteLink';
import InviteFormModal from './InviteFormModal';
import EqualParticipationPicker, { type JoinableExpense } from './EqualParticipationPicker';
import type { GroupMember } from '../types/group';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId?: string;
  inviteCode?: string;
  groupCurrency?: string;
  /** Admin removes a member (parent owns members state + balance refetch). */
  onRemoveMember: (memberUserId: string, memberName: string) => void;
  /** Roster changed (placeholder added / added to expenses) — refetch members. */
  onMembersChanged?: () => void;
}

/**
 * Members tab: roster + roles + admin removal, plus the full invite cluster
 * (invite link, invite modal, its form state and POST). Extracted from
 * GroupDetail 2026-09-23 (staged split, step 5).
 *
 * Two actions (feature-invite-vs-add-member D5): "Add Member" (admin-only,
 * violet — seats a placeholder in the math NOW) and "Send Invite" (all
 * members, blue — a passive pending seat that touches no numbers).
 */
export default function MembersTab({ groupId, members, currentUserId, inviteCode, groupCurrency, onRemoveMember, onMembersChanged }: Props) {
  const isAdmin = !!currentUserId && members.find((m) => m.user_id === currentUserId)?.role === 'admin';

  // Invite form state (owned here; success banner renders outside the modal)
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteMode, setInviteMode] = useState<'add' | 'invite'>('invite');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  // Admin-proxy participation picker for an added placeholder (Decision 7).
  const [proxyFor, setProxyFor] = useState<GroupMember | null>(null);
  const [proxyExpenses, setProxyExpenses] = useState<JoinableExpense[]>([]);

  const seatStatus = (m: GroupMember) => m.status || (m.user.is_placeholder ? 'added' : 'active');

  const openForm = (mode: 'add' | 'invite') => {
    setShowInviteForm(false); // close any lingering modal before reopening
    setInviteMode(mode);
    setInviteResult(null);
    setInviteError('');
    setShowInviteForm(true);
  };

  const openProxyPicker = async (m: GroupMember) => {
    try {
      const res = await fetch(
        `/api/v1/groups/${groupId}/joinable-equal-expenses?for=${m.user_id}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setInviteError(d.error || 'Could not load expenses');
        return;
      }
      const exps: JoinableExpense[] = await res.json();
      if (exps.length === 0) {
        setInviteResult(`No shared expenses yet for ${m.user.name} to be added to.`);
        return;
      }
      setProxyExpenses(exps);
      setProxyFor(m);
    } catch {
      setInviteError('Could not load expenses');
    }
  };

  const confirmProxy = async (participate: string[], optOut: string[]) => {
    if (!proxyFor) return;
    const res = await fetch(`/api/v1/groups/${groupId}/equal-participation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ participate, optOut, for: proxyFor.user_id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || 'Failed to save');
    }
    setInviteResult(`${proxyFor.user.name} added to ${participate.length} expense${participate.length === 1 ? '' : 's'}.`);
    setProxyFor(null);
    onMembersChanged?.();
  };

  /** Admin promotes a passive `invited` seat into the math (D2). */
  const promoteMember = async (m: GroupMember) => {
    setInviteError('');
    const res = await fetch(`/api/v1/groups/${groupId}/members/${m.user_id}/promote`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setInviteError(d.error || 'Could not add that member to the group');
      return;
    }
    setInviteResult(`${m.user.name} is in the group now — they count in new expenses. They still get their own invite card.`);
    onMembersChanged?.();
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteResult(null);
    setInviteLoading(true);
    const isAdd = inviteMode === 'add';
    try {
      const response = await fetch(
        isAdd
          ? `/api/v1/groups/${groupId}/placeholder-members`
          : `/api/v1/groups/${groupId}/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ name: inviteName, email: inviteEmail }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || (isAdd ? 'Failed to add member' : 'Failed to send invitation'));
      }
      setInviteResult(
        isAdd
          ? `${inviteName} is in the calculations now${data.email_status === 'sent' ? ` — invite emailed to ${data.email || inviteEmail}` : ' (invite email pending)'}.`
          : data.already_invited
            ? `${data.sent_to} already has a pending invite here — the email was re-sent, nothing else changed.`
            : `Invitation to ${data.sent_to} sent.`,
      );
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
      if (isAdd) onMembersChanged?.();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900">Members</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => openForm('add')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-violet-600 hover:bg-violet-700"
            >
              Add Member
            </button>
          )}
          <button
            onClick={() => openForm('invite')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
          >
            Send Invite
          </button>
        </div>
      </div>

      {/* Full invite URL — always shown here (the navbar hides it on
          mobile/landscape, so this is the reliable place to copy it). */}
      {inviteCode && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          <InviteLink
            inviteCode={inviteCode}
            currency={groupCurrency}
            groupId={groupId}
            showUrl
          />
        </div>
      )}

      {inviteResult && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {inviteResult}
        </div>
      )}

      {/* Invite form modal */}
      {showInviteForm && (
        <InviteFormModal
          inviteCode={inviteCode}
          mode={inviteMode}
          name={inviteName}
          email={inviteEmail}
          error={inviteError}
          loading={inviteLoading}
          onName={setInviteName}
          onEmail={setInviteEmail}
          onClose={() => setShowInviteForm(false)}
          onSubmit={handleInvite}
        />
      )}

      {/* Admin-proxy participation picker for an added placeholder (Decision 7) */}
      {proxyFor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <EqualParticipationPicker
              expenses={proxyExpenses}
              subjectName={proxyFor.user.name}
              title={`Which expenses was ${proxyFor.user.name} part of?`}
              onConfirm={confirmProxy}
              onCancel={() => setProxyFor(null)}
            />
          </div>
        </div>
      )}

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const status = seatStatus(member);
            return (
            <li key={member.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.user.name}
                    {status === 'added' && (
                      <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-violet-100 text-violet-700">
                        added · not joined
                      </span>
                    )}
                    {status === 'invited' && (
                      <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-slate-100 text-slate-600">
                        invited · pending
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">{member.user.email}</p>
                  {status === 'added' && (
                    <p className="text-xs text-gray-400">
                      Already counted in every split they're part of.
                    </p>
                  )}
                  {status === 'invited' && (
                    <p className="text-xs text-gray-400">
                      Not counted in any expense yet. {isAdmin ? 'You can add them to the group to start counting them.' : 'An admin can add them to the group sooner.'}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && status === 'invited' && (
                    <button
                      onClick={() => void promoteMember(member)}
                      className="rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                    >
                      Add to group
                    </button>
                  )}
                  {isAdmin && status === 'added' && (
                    <button
                      onClick={() => void openProxyPicker(member)}
                      className="rounded px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                    >
                      Add to expenses
                    </button>
                  )}
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      member.role === 'admin'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {member.role}
                  </span>
                  {isAdmin && !isSelf && (
                    <button
                      onClick={() => onRemoveMember(member.user_id, member.user.name)}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
