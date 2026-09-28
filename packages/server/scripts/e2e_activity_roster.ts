// Self-cleaning E2E for the activity-log roster. Throwaway users + sessions
// are minted directly in the DB (the register endpoint is IP-rate-limited;
// the house pattern is raw-insert, NEVER touching a real user). Every tested
// action goes through the real HTTP API. Cleanup: delete group (cascades
// activity rows), sessions, users.
export {};
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3002/api/v1';
const stamp = Date.now();
const env = readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const dbUrl = env.match(/^DATABASE_URL=(.+)$/m)![1].trim().replace(/^"|"$/g, '');

class Session {
  cookie: string;
  constructor(rawToken: string) { this.cookie = `cost_sharing_session=${rawToken}`; }
  async req(method: string, p: string, body?: any) {
    const res = await fetch(BASE + p, {
      method,
      headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  }
  post = (p: string, body?: any) => this.req('POST', p, body);
}

const results: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
};

async function main() {
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const hash = bcrypt.hashSync('TestPass123!', 10);
  const ids: string[] = [];
  const tokenHashes: string[] = [];

  const mintUser = async (email: string, name: string) => {
    const u = await db.query(
      'INSERT INTO users (email, password_hash, name, created_at, updated_at) VALUES ($1,$2,$3, now(), now()) RETURNING id',
      [email, hash, name]);
    ids.push(u.rows[0].id);
    const raw = crypto.randomBytes(32).toString('hex');
    const tokHash = crypto.createHash('sha256').update(raw).digest('hex');
    tokenHashes.push(tokHash);
    await db.query("INSERT INTO sessions (user_id, token, expires_at) VALUES ($1,$2, NOW() + INTERVAL '10 minutes')", [u.rows[0].id, tokHash]);
    return new Session(raw);
  };

  const alpha = await mintUser(`alphatest_${stamp}@test.local`, 'AlphaTester');
  const beta = await mintUser(`betatest_${stamp}@test.local`, 'BetaTester');
  let groupId = '';

  try {
    // 1) create group -> group_created row (and NO creator member_joined row)
    const g = await alpha.post('/groups', { name: `LogRoster ${stamp}`, currency: 'USD' });
    check('createGroup 201', g.status === 201, `status=${g.status}`);
    groupId = g.json.id;
    const inviteCode = g.json.invite_code;

    let act = (await alpha.req('GET', `/groups/${groupId}/activity`)).json as any[];
    check('group_created logged', act.length === 1 && act[0].action === 'group_created', JSON.stringify(act.map(a => a.action)));
    check('no creator member_joined', !act.some(a => a.action === 'member_joined'));

    // 2) invite-link-shared x2 -> exactly one row (dedupe)
    const s1 = await alpha.post(`/groups/${groupId}/invite-link-shared`);
    const s2 = await alpha.post(`/groups/${groupId}/invite-link-shared`);
    act = (await alpha.req('GET', `/groups/${groupId}/activity`)).json as any[];
    const shared = act.filter(a => a.action === 'invite_link_shared');
    check('link-shared first insert', s1.status === 200 && s1.json.deduped === false, JSON.stringify(s1.json));
    check('link-shared deduped', s2.status === 200 && s2.json.deduped === true && shared.length === 1, `rows=${shared.length}`);

    // 3) settings change -> settings_changed row; no-op change logs nothing
    const put1 = await alpha.req('PUT', `/groups/${groupId}/settings`, { expenseEdit: 'all_members' });
    const put2 = await alpha.req('PUT', `/groups/${groupId}/settings`, { expenseEdit: 'all_members' });
    act = (await alpha.req('GET', `/groups/${groupId}/activity`)).json as any[];
    const settings = act.filter(a => a.action === 'settings_changed');
    check('settings_changed once', put1.status === 200 && put2.status === 200 && settings.length === 1, `rows=${settings.length}`);
    check('settings diff in details', settings[0]?.details?.oldValue === 'creator_admin' && settings[0]?.details?.newValue === 'all_members', JSON.stringify(settings[0]?.details));

    // 4) beta joins via invite -> member_joined row (THE BUG FIX: no expenses exist)
    const j = await beta.post(`/join/${inviteCode}`);
    check('join 200', j.status === 200, `status=${j.status}`);
    act = (await alpha.req('GET', `/groups/${groupId}/activity`)).json as any[];
    const joins = act.filter(a => a.action === 'member_joined');
    check('member_joined logged on plain join', joins.length === 1 && joins[0].details?.actorName === 'BetaTester', JSON.stringify(joins.map(x => x.details?.actorName)));

    // 5) kick beta -> member_removed row
    const members = (await alpha.req('GET', `/groups/${groupId}/members`)).json as any[];
    const betaMember = members.find((m: any) => String(m.user.email).startsWith('betatest_'));
    const kick = await alpha.req('DELETE', `/groups/${groupId}/members/${betaMember.user_id}`);
    check('kick 204', kick.status === 204);
    act = (await alpha.req('GET', `/groups/${groupId}/activity`)).json as any[];
    const removed = act.filter(a => a.action === 'member_removed');
    check('member_removed logged', removed.length === 1 && removed[0].details?.memberName === 'BetaTester' && removed[0].details?.actorName === 'AlphaTester');

    // 6) membership gate on link-shared (beta kicked -> 404)
    const gate = await beta.post(`/groups/${groupId}/invite-link-shared`);
    check('link-shared membership gate 404', gate.status === 404, `status=${gate.status}`);

    console.log(results.join('\n'));
    console.log(`TOTAL: ${results.filter(r => r.startsWith('PASS')).length}/${results.length} passed`);
  } catch (e: any) {
    console.log(results.join('\n'));
    console.error('E2E ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    if (groupId) {
      const del = await alpha.req('DELETE', `/groups/${groupId}`);
      console.log(`cleanup: delete throwaway group -> ${del.status}`);
    }
    for (const h of tokenHashes) await db.query('DELETE FROM sessions WHERE token=$1', [h]);
    for (const id of ids) await db.query('DELETE FROM users WHERE id=$1', [id]);
    await db.end();
    console.log('cleanup: users + sessions removed');
  }
}
main();
