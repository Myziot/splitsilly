# Feature Plan: Invite UX Flow (join after register + feedback)

**Project:** split_silly (port 3002)  **Date:** 2026-07-10  **Status:** IMPLEMENTING

## Problem (from user field test)
1. Invite email link showed "page not found" — link host `http://myzi.gmk:3002/...`
   did NOT resolve on the user's devices. Root cause: the LAN DNS only resolves
   `myzi.gmk` (set by the user in the router), and `gmk.myzi` does NOT exist anywhere.
   The FRONTEND_BASE_URL was incorrectly set to `http://gmk.myzi:3002`.
2. New user registered from the invite but was dropped at `/groups` with NO join and
   NO "you've been added" notice.
3. After login the join just bounced to /groups with no confirmation.

## Fixes
- **FRONTEND_BASE_URL** -> `http://myzi.gmk:3002` (the host that resolves on the LAN;
  `gmk.myzi` does NOT exist and must never be used).
- **Server**: add public `GET /api/v1/join/:inviteCode/info` -> `{ groupName, currency }`
  (404 if unknown). Lets pages show the group name before auth. No auth required.
- **JoinGroup.tsx**:
  - If NOT authenticated -> redirect to `/login?invite=CODE` (login page carries the
    code to register too).
  - Fetch group name via /info to show "You're invited to <group>".
  - On join success -> success card: "You've joined <group>" + button "Open group".
  - If already a member (400) -> "You're already in <group>" + button.
  - On error -> message + "Back to groups".
- **Login.tsx**: read `?invite=`; after login navigate to `/join/CODE` (not /groups).
  "Register" link preserves `?invite=CODE`.
- **Register.tsx**: read `?invite=`; after register navigate to `/join/CODE`.
  Show a small banner "You'll join <group> after creating your account" (name via /info).
- **App.tsx**: routes unchanged; /join/:inviteCode is public (works before auth).

## Verification
- Rebuild client; restart server.
- curl /join/:code/info returns group name (public).
- Simulate full flow: register new user with ?invite=CODE -> auto-join -> success card.
- Confirm FRONTEND_BASE_URL change; send a test invite, link host = myzi.gmk:3002.
- Log to neonlin.
