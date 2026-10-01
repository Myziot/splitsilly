> **ARCHIVED (2026-09-30)** — docs consolidation pass; moved out of the active plans list.
**Status:** CLOSED — grill complete 2026-09-29; blueprint compiled and shipped.

# Grill Ledger — Placeholder Member ("add a person before they join")

**Status:** GRILL IN PROGRESS — resume protocol: open this file, continue at the OPEN question, never re-ask ticked items.

**Feature ask:** As a group admin I want to add a person to my group (even before that person registers/joins) so I can include them in expense calculations immediately. Driver: a friend slow to accept the invite.

## Verified ground truth (codebase)
- `users`: unique email, NOT NULL `password_hash` (schema.ts:25-40). No nullable-password concept today.
- `group_members`: hard FK `user_id -> users.id` (schema.ts:127-135). Every member IS a real user row.
- `expense_splits.user_id`, `settlements.from/to_user_id`, `balance_plans.from/to_user_id`: all hard FKs to `users.id` — balances (services/balances.ts) flow entirely through user IDs.
- Invite today = email the permanent group invite link only (routes/groups.ts `inviteMember`); NO pending/placeholder member row exists anywhere (grep: zero pending|ghost|placeholder matches).
- Join = authed user hits invite code -> `groupMembers` insert (routes/join.ts). Register = email unique, 409 on clash (routes/auth.ts).
- KickMember already has a full cascade-clean pattern (splits, flags, settlements, percent-renorm) in one tx — reuse for "discard placeholder".
- Email = Resend via services/email.ts; logged to `email_logs`.
- Client: InviteFormModal.tsx (name+email -> invite email), GroupDetail.tsx roster.

## Locked decisions
| # | Topic | Decision |
|---|-------|----------|
| 1 | Data model | **A: shadow user row + placeholder flag.** Admin-add creates a real `users` row (random unusable password, `is_placeholder`-style flag) + normal `group_members` row. All FKs/splits/balances unchanged. Claim flow bolts on later. |

| 2 | Claim/merge | **A + C:** auto-merge placeholder into the real account when registering/loggin' in AND when arriving via the invite link. Email = convenience messenger only. |
| 2b | Invitation visibility | **Account-based inbox:** a logged-in user sees outstanding invitations addressed to their email in their overview (Groups view), regardless of how/when the invite was sent. Email is just delivery. |

| 3 | Inbox data model | **A: placeholder row IS the invitation.** Partial unique index `UNIQUE(email) WHERE NOT is_placeholder` replaces full UNIQUE on users.email (migration). Inbox query = placeholder memberships where invited email = my email. One entity, one merge path. |
| 3b | Join semantics | Splitwise-style: notification (in-app + email) is NOT membership. Nothing lands on a real account until the person ACCEPTS. Placeholders are inert until claimed. |
| 3c | Reconciled w/ D2 | "Auto-merge at registration" softened to: registration/login DETECTS placeholders by email and SURFACES them in the inbox; the merge code runs only on the user's explicit Accept. |

| 4 | Accept proof | **A: email match + disclosure card** (Splitwise parity). Accept card shows group name, who added you, balance you'd inherit. Accept endpoint designed so a token check can bolt on later. |

| 5 | Placeholder in the math | **Full participation** — can split, be payer, be settlement party. No special-casing in the engine. Inactive = can't log in / edit / add; admins act on their behalf. |

| 6 | Who adds placeholders | **Admins only** (same gate as kick). UI: toggle inside existing InviteFormModal — "Add to calculations now" vs plain invite. |

| 7 | Backfill past expenses | **B: reuse the join participation picker, admin as proxy** (getJoinableEqualExpenses + applyEqualParticipation pointed at the placeholder). Per-expense manual edit (A) remains available for free. |

| 8 | Signals on add/accept | **Full broadcast**: group_activity row ('member_added_pending' + later 'member_joined' on accept), email to invitee (existing invite email), bell notification to EVERY member (existing notifications table pattern). |

| 9 | Discard placeholder | **Reuse kick-member cascade** (splits/settlements/flags/percent-renorm in one tx) + 400 dedup when same email added twice in same group. Fix typo'd email = discard + re-add. Activity row: "removed X (never joined)". |

| 10 | Auth lookups | **A: real accounts win** — login/register/reset queries add `WHERE NOT is_placeholder`. Register beside a placeholder-only email SUCCEEDS (no 409); invite then surfaces in the inbox. |
| 10b | Email mismatch at claim | **A: invite link claimable by any logged-in account** with disclosure card ("invite sent to old@…, balance $X"); Accept re-keys/merges onto the claimer. Activity log records the swap. Covers email-change + typo cases. |

**Status: GRILL COMPLETE — blueprint compiled to feature-placeholder-member.md (2026-09-29).**
