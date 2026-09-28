// One-off migration: activity-log roster backfill + link-shared dedupe index.
// Reads DATABASE_URL from ../.env (or DATABASE_URL_DB override for scratch).
// Idempotent: safe to rerun. Run on splitsilly_scratch FIRST, verify, then live.
import { readFileSync } from 'fs';
import path from 'path';
import pg from 'pg';

const env = readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) throw new Error('DATABASE_URL not found in .env');
let url = m[1].trim().replace(/^"|"$/g, '');
if (process.env.DATABASE_URL_DB) url = url.replace(/\/[^/?]+(\?|$)/, `/${process.env.DATABASE_URL_DB}$1`);
const client = new pg.Client({ connectionString: url });

async function main() {
await client.connect();
console.log('connected to', (await client.query("SELECT current_database() AS db")).rows[0].db);

// 1) Partial unique index: one invite_link_shared row per (group, actor).
await client.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS uq_group_activity_link_shared
  ON group_activity (group_id, actor_id)
  WHERE action = 'invite_link_shared';
`);
console.log('index ensured');

// 2) Backfill group_created (actor = creator, ts = groups.created_at).
//    Skip if a group_created row already exists for the group.
const created = await client.query(`
  INSERT INTO group_activity (group_id, actor_id, action, details, created_at)
  SELECT g.id, g.created_by, 'group_created',
         jsonb_build_object('actorName', u.name, 'groupName', g.name, 'backfilled', true),
         g.created_at
  FROM groups g
  JOIN users u ON u.id = g.created_by
  WHERE NOT EXISTS (
    SELECT 1 FROM group_activity a
    WHERE a.group_id = g.id AND a.action = 'group_created'
  )
  RETURNING group_id
`);
console.log('group_created rows inserted:', created.rowCount);

// 2b) Undo (if a previous run of this script added them): creator's own
//     member_joined rows — Decision 2 says the creator is represented by
//     group_created alone. Only touches backfilled rows, never live-logged ones.
const undo = await client.query(`
  DELETE FROM group_activity a
  USING groups g
  WHERE a.group_id = g.id AND a.action = 'member_joined'
    AND a.actor_id = g.created_by
    AND a.details ? 'backfilled'
  RETURNING a.id
`);
if (undo.rowCount) console.log('removed creator member_joined backfill rows:', undo.rowCount);

// 3) Backfill member_joined for CURRENT members (ts = joined_at).
//    The CREATOR is excluded: their membership is represented by the
//    group_created row (Decision 2 — no separate creator-join line).
//    Dedupe on (group_id, actor_id, action).
const joined = await client.query(`
  INSERT INTO group_activity (group_id, actor_id, action, details, created_at)
  SELECT gm.group_id, gm.user_id, 'member_joined',
         jsonb_build_object('actorName', u.name, 'groupName', g.name, 'backfilled', true),
         gm.joined_at
  FROM group_members gm
  JOIN users u ON u.id = gm.user_id
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.user_id <> g.created_by
  AND NOT EXISTS (
    SELECT 1 FROM group_activity a
    WHERE a.group_id = gm.group_id AND a.actor_id = gm.user_id AND a.action = 'member_joined'
  )
  RETURNING group_id
`);
console.log('member_joined rows inserted:', joined.rowCount);

// Summary
const summary = await client.query(`
  SELECT g.name,
         count(*) FILTER (WHERE a.action='group_created') AS created_rows,
         count(*) FILTER (WHERE a.action='member_joined') AS join_rows,
         count(*) AS total_rows
  FROM groups g
  LEFT JOIN group_activity a ON a.group_id = g.id
  GROUP BY g.id, g.name ORDER BY g.name
`);
console.table(summary.rows);
await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
