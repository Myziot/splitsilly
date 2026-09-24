/** Shared shapes used across group pages/components (extracted from GroupDetail 2026-09-23). */

export interface GroupMember {
  id: string;
  user_id: string;
  user: { id: string; name: string; email: string };
  role: 'admin' | 'member';
}
