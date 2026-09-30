/** Shared shapes used across group pages/components (extracted from GroupDetail 2026-09-23). */

export interface GroupMember {
  id: string;
  user_id: string;
  user: { id: string; name: string; email: string; is_placeholder?: boolean };
  role: 'admin' | 'member';
  /** Seat state (feature-invite-vs-add-member): active | added | invited. */
  status?: 'active' | 'added' | 'invited';
}

/** A pending invitation (the placeholder row IS the invite — feature-placeholder-member D3). */
export interface Invitation {
  membership_id: string;
  group_id: string;
  group_name: string;
  invite_code: string;
  invited_email: string;
  invited_name: string;
  invited_by: string;
  balance_if_accepted: number;
  currency?: string;
  /** 'invited' = passive seat (starts at zero); 'added' = in the math already. */
  seat_status?: 'added' | 'invited';
}
