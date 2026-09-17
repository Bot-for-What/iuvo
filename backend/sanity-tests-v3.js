/**
 * Sanity test suite v3 — Service Request App
 * Covers: core regression (auth/roles/single-Super), staff-departments (Sept 5),
 * ticket lifecycle regression, and Features A/B/C from Sept 7/8
 * (manual close, resolution remarks/cost + audit trail, messaging + unread flags).
 *
 * Requirements: Node 18+.
 *
 * Usage (PowerShell), run from backend/:
 *   $env:BASE_URL="http://localhost:30040"
 *   $env:SUPER_USERNAME="your_super_username"
 *   $env:SUPER_PASSWORD="your_super_password"
 *   node sanity-tests-v3.js
 *
 * NOTE: If Super currently has 2FA enabled, this script cannot log in on its
 * own (no way to auto-generate a live OTP without the enrollment secret).
 * Disable 2FA on Super first, or tell me and I'll add a manual-OTP step.
 *
 * This creates disposable test data (a unit, a staff-department, a few users,
 * a few tickets) since there's no delete endpoint for most of these.
 * Run against a dev database, not production.
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:30040';
const SUPER_USERNAME = process.env.SUPER_USERNAME;
const SUPER_PASSWORD = process.env.SUPER_PASSWORD;

if (!SUPER_USERNAME || !SUPER_PASSWORD) {
  console.error('ERROR: SUPER_USERNAME and SUPER_PASSWORD env vars are required.');
  process.exit(1);
}

const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}
async function step(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(name, false, `threw: ${err.message}`);
  }
}

async function api(method, path, { token, body, headers } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (_) {}
  return { status: res.status, body: json };
}

function unwrap(body, ...keys) {
  if (!body || typeof body !== 'object') return body;
  for (const k of keys) if (body[k] !== undefined) return body[k];
  return body;
}

function randSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

const state = {};

async function main() {
  console.log(`\n=== Service Request App — Sanity Tests v3 ===\nTarget: ${BASE_URL}\n`);

  // ============ SECTION A: CORE REGRESSION ============

  await step('A1/A2: Super login + /auth/me', async () => {
    const { status, body } = await api('POST', '/auth/login', { body: { username: SUPER_USERNAME, password: SUPER_PASSWORD } });
    if (status !== 200 || body.requiresTwoFactor) {
      record('A1: Super login', false, body.requiresTwoFactor ? '2FA is enabled on Super — cannot proceed without manual OTP entry. Disable 2FA and re-run.' : `status=${status}`);
      return;
    }
    state.superToken = body.token;
    state.superId = body.user && body.user.id;
    record('A1: Super login', Boolean(state.superToken), '');
    const me = await api('GET', '/auth/me', { token: state.superToken });
    record('A2: GET /auth/me role=super', me.status === 200 && me.body.role === 'super', `status=${me.status}`);
  });

  if (!state.superToken) { console.log('\nCannot continue without Super token.'); printSummary(); return; }

  await step('A3: invalid token rejected', async () => {
    const { status } = await api('GET', '/auth/me', { token: 'garbage' });
    record('A3: invalid token -> 401', status === 401, `status=${status}`);
  });

  await step('A4: cannot create second Super', async () => {
    const { status, body } = await api('POST', '/units', { token: state.superToken, body: { name: `Sanity Unit ${randSuffix()}` } });
    const unit = unwrap(body, 'unit');
    state.unitId = unit && unit.id;
    const depts = unit && unit.departments;
    if (Array.isArray(depts)) state.itDeptId = (depts.find(d => d.name === 'IT') || {}).id;
    record('setup: create test unit', Boolean(state.unitId) && Boolean(state.itDeptId), `unitId=${state.unitId}`);

    const { status: s2, body: b2 } = await api('POST', '/users', {
      token: state.superToken,
      body: { username: `sanity_bad_super_${randSuffix()}`, password: 'Whatever_123!', fullName: 'X', role: 'super', unitId: state.unitId, departmentId: state.itDeptId },
    });
    record('A4: creating a second Super -> 403', s2 === 403, `status=${s2}, body=${JSON.stringify(b2)}`);
  });

  await step('A5: cannot modify Super role', async () => {
    const { status } = await api('PATCH', `/users/${state.superId}`, { token: state.superToken, body: { role: 'admin' } });
    record('A5: PATCH Super role -> 403/400', status === 403 || status === 400, `status=${status}`);
  });

  // ============ SECTION B: STAFF DEPARTMENTS ============

  await step('B1: create a staff-department for the test unit', async () => {
    const { status, body } = await api('POST', '/staff-departments', { token: state.superToken, body: { unitId: state.unitId, name: `HR ${randSuffix()}` } });
    const dept = unwrap(body, 'staffDepartment', 'unitDepartment');
    state.staffDeptId = dept && dept.id;
    record('B1: POST /staff-departments', (status === 201 || status === 200) && Boolean(state.staffDeptId), `status=${status}, body=${JSON.stringify(body)}`);
  });

  await step('B2: list staff-departments scoped to unit', async () => {
    const { status, body } = await api('GET', `/staff-departments?unitId=${state.unitId}`, { token: state.superToken });
    const list = unwrap(body, 'staffDepartments', 'unitDepartments');
    const found = Array.isArray(list) && list.some(d => d.id === state.staffDeptId);
    record('B2: GET /staff-departments?unitId=', status === 200 && found, `status=${status}, count=${Array.isArray(list) ? list.length : 'n/a'}`);
  });

  const staffUsername = `sanity_staff_${randSuffix()}`;
  await step('B3: create Staff user with staff-department', async () => {
    const { status, body } = await api('POST', '/users', {
      token: state.superToken,
      body: { username: staffUsername, password: 'Sanity_Test_123!', fullName: 'Sanity Staff', role: 'staff', unitId: state.unitId, departmentId: state.staffDeptId },
    });
    const user = unwrap(body, 'user');
    state.staffId = user && user.id;
    record('B3: POST /users (staff, departmentId=staff-dept id)', (status === 201 || status === 200) && Boolean(state.staffId), `status=${status}, body=${JSON.stringify(body)}`);
  });

  await step('B4: Staff login', async () => {
    const { status, body } = await api('POST', '/auth/login', { body: { username: staffUsername, password: 'Sanity_Test_123!' } });
    state.staffToken = body && body.token;
    record('B4: Staff login', status === 200 && Boolean(state.staffToken), `status=${status}`);
  });

  // ============ SET UP ADMIN + TEAM FOR TICKET TESTS ============

  const adminUsername = `sanity_admin_${randSuffix()}`;
  await step('setup: create Admin', async () => {
    const { status, body } = await api('POST', '/users', {
      token: state.superToken,
      body: { username: adminUsername, password: 'Sanity_Test_123!', fullName: 'Sanity Admin', role: 'admin', unitId: state.unitId, departmentId: state.itDeptId },
    });
    const user = unwrap(body, 'user');
    state.adminId = user && user.id;
    record('setup: create Admin', (status === 201 || status === 200) && Boolean(state.adminId), `status=${status}`);
    const login = await api('POST', '/auth/login', { body: { username: adminUsername, password: 'Sanity_Test_123!' } });
    state.adminToken = login.body && login.body.token;
  });

  const teamUsername = `sanity_team_${randSuffix()}`;
  await step('setup: create Team', async () => {
    const { status, body } = await api('POST', '/users', {
      token: state.adminToken,
      body: { username: teamUsername, password: 'Sanity_Test_123!', fullName: 'Sanity Team', role: 'team', unitId: state.unitId, departmentId: state.itDeptId },
    });
    const user = unwrap(body, 'user');
    state.teamId = user && user.id;
    record('setup: create Team', (status === 201 || status === 200) && Boolean(state.teamId), `status=${status}`);
    const login = await api('POST', '/auth/login', { body: { username: teamUsername, password: 'Sanity_Test_123!' } });
    state.teamToken = login.body && login.body.token;
  });

  if (!state.staffToken || !state.adminToken || !state.teamToken) {
    console.log('\nMissing a required session token from setup — stopping.');
    printSummary();
    return;
  }

  // ============ SECTION D: TICKET LIFECYCLE REGRESSION ============

  await step('D1/D2: Staff creates ticket, cannot change priority', async () => {
    const { status, body } = await api('POST', '/tickets', {
      token: state.staffToken,
      body: { unitId: state.unitId, departmentId: state.itDeptId, title: 'Sanity ticket', description: 'v3 sanity test', priority: 'medium' },
    });
    const ticket = unwrap(body, 'ticket');
    state.ticketId = ticket && ticket.id;
    record('D1: Staff creates ticket', (status === 201 || status === 200) && Boolean(state.ticketId), `status=${status}`);

    const p = await api('PATCH', `/tickets/${state.ticketId}/priority`, { token: state.staffToken, body: { priority: 'urgent' } });
    record('D2: Staff blocked from priority change', p.status === 403, `status=${p.status}`);
  });

  if (!state.ticketId) { console.log('\nNo test ticket created — stopping.'); printSummary(); return; }

  await step('D3/D4: claim, assigned->in_progress', async () => {
    const c = await api('PATCH', `/tickets/${state.ticketId}/claim`, { token: state.teamToken });
    record('D3: Team claims ticket', c.status === 200, `status=${c.status}`);
    const s = await api('PATCH', `/tickets/${state.ticketId}/status`, { token: state.teamToken, body: { status: 'in_progress' } });
    record('D4: assigned -> in_progress', s.status === 200, `status=${s.status}`);
  });

  await step('D5: invalid transition rejected', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/status`, { token: state.teamToken, body: { status: 'closed' } });
    record('D5: in_progress -> closed directly rejected', status === 409 || status === 400, `status=${status}`);
  });

  // ============ SECTION F: RESOLUTION REMARKS + REPAIR COST ============

  await step('F1: resolve without remarks/cost rejected', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/status`, { token: state.teamToken, body: { status: 'resolved' } });
    record('F1: resolve missing remarks+cost -> rejected', status === 400, `status=${status}`);
  });

  await step('F2: resolve without cost only rejected', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/status`, { token: state.teamToken, body: { status: 'resolved', resolutionRemarks: 'Fixed the network switch.' } });
    record('F2: resolve missing cost -> rejected', status === 400, `status=${status}`);
  });

  await step('F3: resolve with cost=0 accepted', async () => {
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/status`, {
      token: state.teamToken,
      body: { status: 'resolved', resolutionRemarks: 'Fixed the network switch, no parts needed.', repairCost: 0 },
    });
    const ticket = unwrap(body, 'ticket');
    record('F3: resolve with cost=0 -> accepted', status === 200 && ticket && ticket.status === 'resolved', `status=${status}`);
  });

  await step('F4: resolution details present on ticket', async () => {
    const { status, body } = await api('GET', `/tickets/${state.ticketId}`, { token: state.teamToken });
    const ticket = unwrap(body, 'ticket');
    const hasFields = ticket && ticket.resolutionRemarks && ticket.repairCost !== undefined && ticket.repairCost !== null;
    record('F4: GET ticket shows resolutionRemarks/repairCost', status === 200 && hasFields, `status=${status}, remarks=${ticket && ticket.resolutionRemarks}, cost=${ticket && ticket.repairCost}`);
  });

  // ============ SECTION E: MANUAL CLOSE ============

  await step('E3: assignee cannot close (wrong actor)', async () => {
    const { status } = await api('POST', `/tickets/${state.ticketId}/close`, { token: state.teamToken });
    record('E3: assignee blocked from manual close', status === 403, `status=${status}`);
  });

  await step('E1: raiser closes resolved ticket', async () => {
    const { status, body } = await api('POST', `/tickets/${state.ticketId}/close`, { token: state.staffToken });
    const ticket = unwrap(body, 'ticket');
    record('E1: raiser manual close -> succeeds', status === 200 && ticket && ticket.status === 'closed', `status=${status}, resultStatus=${ticket && ticket.status}`);
  });

  await step('E4: closing an already-closed ticket rejected', async () => {
    const { status } = await api('POST', `/tickets/${state.ticketId}/close`, { token: state.staffToken });
    record('E4: re-closing already-closed ticket -> rejected', status === 409 || status === 400, `status=${status}`);
  });

  await step('E5: closed event has correct actor', async () => {
    const { status, body } = await api('GET', `/tickets/${state.ticketId}`, { token: state.teamToken });
    const ticket = unwrap(body, 'ticket');
    const events = (ticket && ticket.events) || (body && body.events) || [];
    const closedEvent = Array.isArray(events) ? events.find(e => (e.eventType || e.event_type) === 'closed') : null;
    const actor = closedEvent && (closedEvent.actorId || closedEvent.actor_id);
    record('E5: closed event has non-null actor', status === 200 && Boolean(actor), `actor=${actor}`);
  });

  // ============ SET UP SECOND TICKET FOR MESSAGING + REOPEN/RE-RESOLVE TESTS ============

  await step('setup: second ticket for messaging + reopen tests', async () => {
    const { body } = await api('POST', '/tickets', {
      token: state.staffToken,
      body: { unitId: state.unitId, departmentId: state.itDeptId, title: 'Sanity ticket 2', description: 'for messaging + F5-F7', priority: 'low' },
    });
    state.ticket2Id = (unwrap(body, 'ticket') || {}).id;
    await api('PATCH', `/tickets/${state.ticket2Id}/claim`, { token: state.teamToken });
    await api('PATCH', `/tickets/${state.ticket2Id}/status`, { token: state.teamToken, body: { status: 'in_progress' } });
    const r = await api('PATCH', `/tickets/${state.ticket2Id}/status`, {
      token: state.teamToken,
      body: { status: 'resolved', resolutionRemarks: 'FIRST RESOLUTION - original remarks', repairCost: 15.5 },
    });
    record('setup: second ticket resolved (first time)', r.status === 200, `status=${r.status}, ticketId=${state.ticket2Id}`);
  });

  await step('F5/F6/F7: reopen, re-resolve, check history preserved', async () => {
    const reopen = await api('PATCH', `/tickets/${state.ticket2Id}/reopen`, { token: state.staffToken });
    record('F5-setup: reopen succeeds', reopen.status === 200, `status=${reopen.status}`);

    const reresolve = await api('PATCH', `/tickets/${state.ticket2Id}/status`, {
      token: state.teamToken,
      body: { status: 'resolved', resolutionRemarks: 'SECOND RESOLUTION - edited remarks', repairCost: 42.0 },
    });
    record('F6: re-resolve overwrites current values', reresolve.status === 200, `status=${reresolve.status}`);

    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.teamToken });
    const ticket = unwrap(detail.body, 'ticket');
    const currentIsSecond = ticket && ticket.resolutionRemarks && ticket.resolutionRemarks.includes('SECOND');
    record('F6-verify: current ticket shows latest (SECOND) remarks', currentIsSecond, `remarks=${ticket && ticket.resolutionRemarks}`);

    const events = (ticket && ticket.events) || detail.body.events || [];
    const resolveEvents = Array.isArray(events) ? events.filter(e => (e.eventType || e.event_type) === 'status_change' && (e.toValue || e.to_value) === 'resolved') : [];
    const firstEventHasFirstRemarks = resolveEvents.some(e => (e.resolutionRemarks || e.resolution_remarks || '').includes('FIRST'));
    const secondEventHasSecondRemarks = resolveEvents.some(e => (e.resolutionRemarks || e.resolution_remarks || '').includes('SECOND'));
    record(
      'F7: audit trail preserves BOTH resolutions\' remarks (not just latest)',
      firstEventHasFirstRemarks && secondEventHasSecondRemarks,
      `resolveEventCount=${resolveEvents.length}, foundFirst=${firstEventHasFirstRemarks}, foundSecond=${secondEventHasSecondRemarks} — if this fails, check whether resolutionRemarks/repairCost are actually being attached per-event vs only stored on the ticket row`
    );
  });

  // ============ SECTION G: MESSAGING + UNREAD FLAGS ============
  // Uses ticket2 (currently: resolved, assignee=team, raiser=staff)

  await step('G1/G8: raiser posts -> assignee unread flag turns on', async () => {
    const post = await api('POST', `/tickets/${state.ticket2Id}/messages`, { token: state.staffToken, body: { body: 'Raiser message: is this really fixed?' } });
    record('G1: raiser can post', post.status === 201 || post.status === 200, `status=${post.status}`);

    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.superToken }); // super view doesn't clear any flag
    const ticket = unwrap(detail.body, 'ticket');
    record('G8: raiser post -> assigneeHasUnread=true, raiserHasUnread=false', ticket && ticket.assigneeHasUnread === true && ticket.raiserHasUnread === false, `assigneeHasUnread=${ticket && ticket.assigneeHasUnread}, raiserHasUnread=${ticket && ticket.raiserHasUnread}`);
  });

  await step('G13/G12: assignee opening clears only assignee flag', async () => {
    await api('GET', `/tickets/${state.ticket2Id}/messages`, { token: state.teamToken }); // assignee views -> should clear assignee flag
    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.superToken });
    const ticket = unwrap(detail.body, 'ticket');
    record('G13: assignee viewing clears assigneeHasUnread', ticket && ticket.assigneeHasUnread === false, `assigneeHasUnread=${ticket && ticket.assigneeHasUnread}`);
  });

  await step('G2/G9: assignee posts -> raiser unread flag turns on', async () => {
    const post = await api('POST', `/tickets/${state.ticket2Id}/messages`, { token: state.teamToken, body: { body: 'Assignee reply: yes, confirmed fixed.' } });
    record('G2: assignee can post', post.status === 201 || post.status === 200, `status=${post.status}`);
    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.superToken });
    const ticket = unwrap(detail.body, 'ticket');
    record('G9: assignee post -> raiserHasUnread=true', ticket && ticket.raiserHasUnread === true, `raiserHasUnread=${ticket && ticket.raiserHasUnread}`);
  });

  await step('G4: matching Admin can view but not post', async () => {
    const view = await api('GET', `/tickets/${state.ticket2Id}/messages`, { token: state.adminToken });
    record('G4a: matching Admin can view thread', view.status === 200, `status=${view.status}`);
    const post = await api('POST', `/tickets/${state.ticket2Id}/messages`, { token: state.adminToken, body: { body: 'Admin trying to post' } });
    record('G4b: matching Admin (not assignee) blocked from posting', post.status === 403, `status=${post.status}`);
  });

  await step('G14: Admin viewing does NOT clear assignee flag', async () => {
    // raiser posts again to set assignee flag, then admin views, then check flag still true
    await api('POST', `/tickets/${state.ticket2Id}/messages`, { token: state.staffToken, body: { body: 'Raiser follow-up' } });
    await api('GET', `/tickets/${state.ticket2Id}/messages`, { token: state.adminToken }); // admin views
    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.superToken });
    const ticket = unwrap(detail.body, 'ticket');
    record('G14: Admin view does not clear assigneeHasUnread', ticket && ticket.assigneeHasUnread === true, `assigneeHasUnread=${ticket && ticket.assigneeHasUnread}`);
  });

  await step('G3/G11: Super posts -> raiser flag turns on', async () => {
    await api('GET', `/tickets/${state.ticket2Id}/messages`, { token: state.teamToken }); // clear assignee flag first
    const post = await api('POST', `/tickets/${state.ticket2Id}/messages`, { token: state.superToken, body: { body: 'Super checking in.' } });
    record('G3: Super can post', post.status === 201 || post.status === 200, `status=${post.status}`);
    const detail = await api('GET', `/tickets/${state.ticket2Id}`, { token: state.adminToken });
    const ticket = unwrap(detail.body, 'ticket');
    record('G11: Super post -> raiserHasUnread=true', ticket && ticket.raiserHasUnread === true, `raiserHasUnread=${ticket && ticket.raiserHasUnread}`);
  });

  await step('G16: sidebar unread-summary reflects state for raiser', async () => {
    const { status, body } = await api('GET', '/tickets/unread-summary', { token: state.staffToken });
    record('G16: GET /tickets/unread-summary (staff/raiser)', status === 200 && body.hasUnread === true, `status=${status}, hasUnread=${body && body.hasUnread}`);
  });

  await step('G18: reassignment resets assignee unread flag', async () => {
    const { body: newTicketBody } = await api('POST', '/tickets', {
      token: state.staffToken,
      body: { unitId: state.unitId, departmentId: state.itDeptId, title: 'Sanity ticket 3 - reassign test', description: 'for G18', priority: 'low' },
    });
    const ticket3Id = (unwrap(newTicketBody, 'ticket') || {}).id;
    await api('PATCH', `/tickets/${ticket3Id}/claim`, { token: state.teamToken });
    await api('POST', `/tickets/${ticket3Id}/messages`, { token: state.staffToken, body: { body: 'raiser message before reassign' } });

    const before = await api('GET', `/tickets/${ticket3Id}`, { token: state.superToken });
    const beforeTicket = unwrap(before.body, 'ticket');
    record('G18-setup: assigneeHasUnread=true before reassign', beforeTicket && beforeTicket.assigneeHasUnread === true, `assigneeHasUnread=${beforeTicket && beforeTicket.assigneeHasUnread}`);

    const reassign = await api('PATCH', `/tickets/${ticket3Id}/assign`, {
      token: state.superToken,
      body: { assignedTo: state.adminId, reason: 'sanity test reassignment' },
    });
    record('G18-setup: Super reassign succeeds', reassign.status === 200, `status=${reassign.status}, body=${JSON.stringify(reassign.body)}`);

    const after = await api('GET', `/tickets/${ticket3Id}`, { token: state.superToken });
    const afterTicket = unwrap(after.body, 'ticket');
    record('G18: assigneeHasUnread reset to false after reassignment', afterTicket && afterTicket.assigneeHasUnread === false, `assigneeHasUnread=${afterTicket && afterTicket.assigneeHasUnread}`);
  });

  // ============ SECTION H/I: LIGHT SPOT-CHECK ============

  await step('H1/H2: dashboard access control', async () => {
    const superAccess = await api('GET', '/dashboard/metrics', { token: state.superToken });
    record('H1: Super can access dashboard', superAccess.status === 200, `status=${superAccess.status}`);
    const teamDenied = await api('GET', '/dashboard/metrics', { token: state.teamToken });
    record('H2: Team denied dashboard', teamDenied.status === 403, `status=${teamDenied.status}`);
  });

  await step('I1: non-delegated Admin denied Security Administration', async () => {
    const { status } = await api('GET', '/security/users', { token: state.adminToken });
    record('I1: non-delegated Admin -> 403 on /security/users', status === 403, `status=${status}`);
  });

  printSummary();
}

function printSummary() {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed, ${results.length} total ===`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.name}: ${r.detail || ''}`));
  }
}

main().catch(err => {
  console.error('Fatal error running sanity tests:', err);
  process.exit(1);
});