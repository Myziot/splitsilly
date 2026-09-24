import { useState } from 'react';
import InviteLink from './InviteLink';
import InviteFormModal from './InviteFormModal';
import type { GroupMember } from '../types/group';

interface Props {
  groupId: string;
  members: GroupMember[];
  currentUserId?: string;
  inviteCode?: string;
  groupCurrency?: string;
  /** Admin removes a member (parent owns members state + balance refetch). */
  onRemoveMember: (memberUserId: string, memberName: string) => void;
}

/**
 * Members tab: roster + roles + admin removal, plus the full invite cluster
 * (invite link, invite modal, its form state and POST). Extracted from
 * GroupDetail 2026-09-23 (staged split, step 5).
 */
export default function MembersTab({ groupId, members, currentUserId, inviteCode, groupCurrency, onRemoveMember }: Props) {
  const isAdmin = !!currentUserId && members.find((m) => m.user_id === currentUserId)?.role === 'admin';

  // Invite form state (owned here; success banner renders outside the modal)
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError('');
    setInviteResult(null);
    setInviteLoading(true);
    try {
      const response = await fetch(`/api/v1/groups/${groupId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: inviteName, email: inviteEmail }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }
      setInviteResult(`Invitation to ${data.sent_to} sent.`);
      setInviteName('');
      setInviteEmail('');
      setShowInviteForm(false);
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
        <button
          onClick={() => { setShowInviteForm(true); setInviteResult(null); setInviteError(''); }}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
        >
          Invite
        </button>
      </div>

      {/* Full invite URL — always shown here (the navbar hides it on
          mobile/landscape, so this is the reliable place to copy it). */}
      {inviteCode && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          <InviteLink
            inviteCode={inviteCode}
            currency={groupCurrency}
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

      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            return (
            <li key={member.id} className="px-4 py-4 sm:px-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {member.user.name}
                  </p>
                  <p className="text-sm text-gray-500">{member.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
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
