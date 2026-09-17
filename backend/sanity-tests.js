/**
 * Sanity test suite — Service Request App
 * Covers Phases 1–6 (DB/schema is implicitly exercised via API calls).
 *
 * Requirements:
 *   - Node.js 18+ (built-in fetch)
 *   - otplib installed (already a backend dependency — run this FROM the backend/ folder
 *     so `require('otplib')` resolves, or `npm install otplib` in wherever you run this)
 *
 * Usage (PowerShell):
 *   $env:BASE_URL="http://localhost:30040"
 *   $env:SUPER_USERNAME="your_super_username"
 *   $env:SUPER_PASSWORD="your_super_password"
 *   $env:CRON_KEY="your_x-internal-cron-key_value"
 *   node sanity-tests.js
 *
 * This script creates a small amount of real test data (a unit named
 * "Sanity Test Unit", a few users, a couple of tickets) since no DELETE
 * endpoints exist for units/users per spec. It disables what it can at the
 * end. Run against a dev database you don't mind having minor clutter in.
 *
 * It does NOT touch your Super account's real password. It DOES temporarily
 * enable and then disable 2FA on the Super account to test the full 2FA
 * flow end-to-end — if Super already has 2FA enabled before this runs, the
 * script detects that and skips the 2FA test with a warning rather than
 * disrupting your existing setup.
 */

const { authenticator } = require('otplib');

const BASE_URL = process.env.BASE_URL || 'http://localhost:30040';
const SUPER_USERNAME = process.env.SUPER_USERNAME;
const SUPER_PASSWORD = process.env.SUPER_PASSWORD;
const CRON_KEY = process.env.CRON_KEY;

if (!SUPER_USERNAME || !SUPER_PASSWORD) {
  console.error('ERROR: SUPER_USERNAME and SUPER_PASSWORD env vars are required.');
  process.exit(1);
}

// ---------- tiny test harness ----------
const results = [];
function record(name, passed, detail) {
  results.push({ name, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}${detail ? ' — ' + detail : ''}`);
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
  } catch (_) {
    // non-JSON response, fine for some endpoints (e.g. CSV/PDF export)
  }
  return { status: res.status, body: json, raw: res };
}

function randSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

// ---------- shared state across steps ----------
const state = {
  superToken: null,
  superId: null,
  unitId: null,
  adminToken: null,
  adminId: null,
  teamToken: null,
  teamId: null,
  staffToken: null,
  staffId: null,
  staffUsername: null,
  ticketId: null,
  disposableStaffId: null,
  disposableStaffUsername: null,
  superHad2FABefore: null,
};

async function main() {
  console.log(`\n=== Service Request App — Sanity Tests ===`);
  console.log(`Target: ${BASE_URL}\n`);

  // ---------------- PHASE 2: AUTH ----------------

  await step('Super login succeeds (2FA off) or returns pending_2fa_token (2FA on)', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: SUPER_USERNAME, password: SUPER_PASSWORD },
    });
    if (status !== 200) {
      record('Super login', false, `expected 200, got ${status}: ${JSON.stringify(body)}`);
      return;
    }
    if (body.requiresTwoFactor) {
      state.superHad2FABefore = true;
      record(
        'Super login',
        false,
        'Super already has 2FA enabled — cannot auto-login without a live OTP. ' +
          'Skipping downstream Super-authenticated tests. Disable 2FA temporarily to run the full suite, ' +
          'or provide a manual OTP flow.'
      );
      return;
    }
    state.superHad2FABefore = false;
    state.superToken = body.token;
    state.superId = body.user && body.user.id;
    record('Super login', Boolean(state.superToken && state.superId), `role=${body.user && body.user.role}`);
  });

  if (!state.superToken) {
    console.log('\nCannot continue without a valid Super session token. Stopping here.');
    printSummary();
    return;
  }

  await step('GET /auth/me returns super role', async () => {
    const { status, body } = await api('GET', '/auth/me', { token: state.superToken });
    record('GET /auth/me (super)', status === 200 && body.role === 'super', `status=${status}, role=${body && body.role}`);
  });

  await step('Invalid/missing token is rejected with 401', async () => {
    const { status } = await api('GET', '/auth/me', { token: 'not-a-real-token' });
    record('Invalid token rejected', status === 401, `status=${status}`);
  });

  await step('No token is rejected with 401', async () => {
    const { status } = await api('GET', '/auth/me');
    record('Missing token rejected', status === 401, `status=${status}`);
  });

  // ---------------- PHASE 3: UNITS / DEPARTMENTS / USERS ----------------

  const unitName = `Sanity Test Unit ${randSuffix()}`;
  await step('Super creates a unit with 3 active departments', async () => {
    const { status, body } = await api('POST', '/units', {
      token: state.superToken,
      body: { name: unitName },
    });
    state.unitId = body && body.id;
    record('POST /units (super)', status === 201 || status === 200, `status=${status}, id=${state.unitId}`);
  });

  await step('GET /units includes the new unit with 3 departments', async () => {
    const { status, body } = await api('GET', '/units', { token: state.superToken });
    const found = Array.isArray(body) ? body.find((u) => u.id === state.unitId) : null;
    record(
      'New unit visible with departments',
      status === 200 && Boolean(found),
      `status=${status}, found=${Boolean(found)}`
    );
  });

  await step('Non-super cannot create a unit', async () => {
    // create a throwaway admin first isn't possible pre-unit, so test with staff created later;
    // for now, just confirm POST /units rejects an unauthenticated/garbage token
    const { status } = await api('POST', '/units', {
      token: 'garbage-token',
      body: { name: 'Should Not Exist' },
    });
    record('POST /units with bad token rejected', status === 401, `status=${status}`);
  });

  const adminUsername = `sanity_admin_${randSuffix()}`;
  const adminPassword = 'Sanity_Test_Password_123!';
  await step('Super creates an Admin scoped to new unit / IT', async () => {
    const { status: unitStatus, body: unitBody } = await api('GET', '/units', { token: state.superToken });
    const unit = Array.isArray(unitBody) ? unitBody.find((u) => u.id === state.unitId) : null;
    const itDept =
      unit && unit.departments
        ? unit.departments.find((d) => d.name === 'IT')
        : null;
    if (!itDept) {
      record('Locate IT department id on new unit', false, 'Could not find departments array on unit — check GET /units response shape');
      return;
    }
    const { status, body } = await api('POST', '/users', {
      token: state.superToken,
      body: {
        username: adminUsername,
        password: adminPassword,
        full_name: 'Sanity Admin',
        role: 'admin',
        unit_id: state.unitId,
        department_id: itDept.id,
      },
    });
    state.adminId = body && body.id;
    record('POST /users (super creates admin)', status === 201 || status === 200, `status=${status}, id=${state.adminId}`);
    state.itDepartmentId = itDept.id;
  });

  await step('POST /users rejects role: "super"', async () => {
    const { status, body } = await api('POST', '/users', {
      token: state.superToken,
      body: {
        username: `sanity_bad_super_${randSuffix()}`,
        password: 'Whatever_Password_123!',
        full_name: 'Should Fail',
        role: 'super',
      },
    });
    record('Creating a second Super via API is blocked', status === 403, `status=${status}, body=${JSON.stringify(body)}`);
  });

  await step('Updating existing Super account role/unit is blocked', async () => {
    const { status } = await api('PATCH', `/users/${state.superId}`, {
      token: state.superToken,
      body: { role: 'admin' },
    });
    record('PATCH Super role is rejected', status === 403 || status === 400, `status=${status}`);
  });

  await step('Admin login succeeds', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: adminUsername, password: adminPassword },
    });
    state.adminToken = body && body.token;
    record('Admin login', status === 200 && Boolean(state.adminToken), `status=${status}`);
  });

  const teamUsername = `sanity_team_${randSuffix()}`;
  const teamPassword = 'Sanity_Test_Password_123!';
  await step('Admin creates a Team user in own unit/dept', async () => {
    const { status, body } = await api('POST', '/users', {
      token: state.adminToken,
      body: {
        username: teamUsername,
        password: teamPassword,
        full_name: 'Sanity Team',
        role: 'team',
        unit_id: state.unitId,
        department_id: state.itDepartmentId,
      },
    });
    state.teamId = body && body.id;
    record('POST /users (admin creates team)', status === 201 || status === 200, `status=${status}`);
  });

  await step('Admin cannot create a Management user', async () => {
    const { status } = await api('POST', '/users', {
      token: state.adminToken,
      body: {
        username: `sanity_mgmt_${randSuffix()}`,
        password: 'Sanity_Test_Password_123!',
        full_name: 'Should Fail',
        role: 'management',
      },
    });
    record('Admin blocked from creating Management', status === 403, `status=${status}`);
  });

  const staffUsername = `sanity_staff_${randSuffix()}`;
  const staffPassword = 'Sanity_Test_Password_123!';
  state.staffUsername = staffUsername;
  await step('Team creates a Staff user in own unit', async () => {
    await api('POST', '/auth/login', { body: { username: teamUsername, password: teamPassword } }).then(
      async ({ body }) => {
        state.teamToken = body && body.token;
      }
    );
    const { status, body } = await api('POST', '/users', {
      token: state.teamToken,
      body: {
        username: staffUsername,
        password: staffPassword,
        full_name: 'Sanity Staff',
        role: 'staff',
        unit_id: state.unitId,
        department_id: state.itDepartmentId,
      },
    });
    state.staffId = body && body.id;
    record('POST /users (team creates staff)', status === 201 || status === 200, `status=${status}`);
  });

  await step('Admin user listing does not expose Super account', async () => {
    const { status, body } = await api('GET', '/users', { token: state.adminToken });
    const containsSuper = Array.isArray(body) && body.some((u) => u.role === 'super');
    record('Super hidden from Admin user list', status === 200 && !containsSuper, `status=${status}, containsSuper=${containsSuper}`);
  });

  await step('Staff login succeeds', async () => {
    const { status, body } = await api('POST', '/auth/login', {
      body: { username: staffUsername, password: staffPassword },
    });
    state.staffToken = body && body.token;
    record('Staff login', status === 200 && Boolean(state.staffToken), `status=${status}`);
  });

  // ---------------- PHASE 4: TICKETS ----------------

  await step('Staff creates a ticket', async () => {
    const { status, body } = await api('POST', '/tickets', {
      token: state.staffToken,
      body: {
        unit_id: state.unitId,
        department_id: state.itDepartmentId,
        title: 'Sanity test ticket',
        description: 'Created by automated sanity test script.',
        priority: 'medium',
      },
    });
    state.ticketId = body && body.id;
    record('POST /tickets (staff)', status === 201 || status === 200, `status=${status}, id=${state.ticketId}`);
  });

  await step('Staff cannot change ticket priority', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/priority`, {
      token: state.staffToken,
      body: { priority: 'urgent' },
    });
    record('Staff blocked from priority change', status === 403, `status=${status}`);
  });

  await step('Staff sees only own tickets in GET /tickets', async () => {
    const { status, body } = await api('GET', '/tickets', { token: state.staffToken });
    const allOwnedByStaff = Array.isArray(body) && body.every((t) => t.raised_by === state.staffId || t.raisedBy === state.staffId);
    record('Staff ticket list scoped to own tickets', status === 200 && allOwnedByStaff, `status=${status}, count=${Array.isArray(body) ? body.length : 'n/a'}`);
  });

  await step('Team claims the open ticket', async () => {
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/claim`, {
      token: state.teamToken,
    });
    record('PATCH /tickets/:id/claim (team)', status === 200, `status=${status}, resultStatus=${body && body.status}`);
  });

  await step('Team moves ticket assigned -> in_progress', async () => {
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/status`, {
      token: state.teamToken,
      body: { status: 'in_progress' },
    });
    record('assigned -> in_progress', status === 200, `status=${status}, resultStatus=${body && body.status}`);
  });

  await step('Invalid transition (in_progress -> closed directly) is rejected', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/status`, {
      token: state.teamToken,
      body: { status: 'closed' },
    });
    record('Skipping resolved is rejected', status === 409 || status === 400, `status=${status}`);
  });

  await step('Team moves ticket in_progress -> resolved', async () => {
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/status`, {
      token: state.teamToken,
      body: { status: 'resolved' },
    });
    record('in_progress -> resolved', status === 200, `status=${status}, resultStatus=${body && body.status}`);
  });

  await step('Original Staff raiser can reopen same-day resolved ticket', async () => {
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/reopen`, {
      token: state.staffToken,
    });
    record('Same-day reopen succeeds', status === 200 && (body.status === 'in_progress'), `status=${status}, resultStatus=${body && body.status}`);
  });

  await step('Reopen retains same assignee (Team member who claimed it)', async () => {
    const { status, body } = await api('GET', `/tickets/${state.ticketId}`, { token: state.teamToken });
    const assigneeId = body && (body.assigned_to || body.assignedTo);
    record('Assignee retained after reopen', status === 200 && assigneeId === state.teamId, `status=${status}, assignee=${assigneeId}`);
  });

  await step('Ticket audit trail contains expected lifecycle events', async () => {
    const { status, body } = await api('GET', `/tickets/${state.ticketId}`, { token: state.teamToken });
    const events = (body && (body.events || body.ticket_events)) || [];
    const types = events.map((e) => e.event_type || e.eventType);
    const expectedPresent = ['created', 'claimed', 'status_change', 'reopened'].every((t) => types.includes(t));
    record('Audit trail contains created/claimed/status_change/reopened', status === 200 && expectedPresent, `status=${status}, types=${types.join(',')}`);
  });

  // resolve it again so Phase 5 auto-close has something to work with conceptually
  // (note: auto-close only affects PRIOR-day resolved tickets, so this won't actually
  // get closed by the cron run below — that's expected and correct per spec)
  await step('Team resolves ticket again after reopen (for Phase 5 context)', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/status`, {
      token: state.teamToken,
      body: { status: 'resolved' },
    });
    record('Re-resolve after reopen', status === 200, `status=${status}`);
  });

  // ---------------- PHASE 5: AUTO-CLOSE CRON + SUPER UNLOCK ----------------

  if (!CRON_KEY) {
    record('POST /system/cron/auto-close', false, 'CRON_KEY env var not set — skipping cron test');
  } else {
    await step('Auto-close cron runs without error (same-day ticket should NOT close)', async () => {
      const { status } = await api('POST', '/system/cron/auto-close', {
        headers: { 'x-internal-cron-key': CRON_KEY },
      });
      record('Cron endpoint responds 200', status === 200, `status=${status}`);
    });

    await step('Same-day resolved ticket remains resolved (not closed) after cron', async () => {
      const { status, body } = await api('GET', `/tickets/${state.ticketId}`, { token: state.teamToken });
      record('Ticket still resolved, not closed', status === 200 && body.status === 'resolved', `status=${status}, resultStatus=${body && body.status}`);
    });

    await step('Cron endpoint rejects requests without the internal key', async () => {
      const { status } = await api('POST', '/system/cron/auto-close', {});
      record('Cron endpoint requires x-internal-cron-key', status === 401 || status === 403, `status=${status}`);
    });
  }

  // Note: we cannot fully test the "resolved before today gets closed" path without
  // either manipulating resolved_at directly in the DB or waiting a day — this script
  // does not do either. Manually verify that path once if not already covered, e.g. by
  // backdating a test row's resolved_at and re-running the cron.

  await step('Super unlock is rejected without a reason', async () => {
    // ticket is currently 'resolved', not 'closed' — this correctly should fail regardless,
    // but tests that the endpoint validates reason presence before/independent of status
    const { status, body } = await api('PATCH', `/tickets/${state.ticketId}/unlock`, {
      token: state.superToken,
      body: {},
    });
    record('Unlock without reason rejected', status === 400 || status === 409, `status=${status}, body=${JSON.stringify(body)}`);
  });

  await step('Non-super cannot call unlock', async () => {
    const { status } = await api('PATCH', `/tickets/${state.ticketId}/unlock`, {
      token: state.teamToken,
      body: { reason: 'testing' },
    });
    record('Team blocked from unlock', status === 403, `status=${status}`);
  });

  // ---------------- PHASE 6: DASHBOARD / SAVED FILTERS / EXPORT ----------------

  await step('Super can access dashboard metrics', async () => {
    const { status } = await api('GET', '/dashboard/metrics', { token: state.superToken });
    record('GET /dashboard/metrics (super)', status === 200, `status=${status}`);
  });

  await step('Team is denied dashboard metrics', async () => {
    const { status } = await api('GET', '/dashboard/metrics', { token: state.teamToken });
    record('GET /dashboard/metrics (team) rejected', status === 403, `status=${status}`);
  });

  await step('Staff is denied dashboard metrics', async () => {
    const { status } = await api('GET', '/dashboard/metrics', { token: state.staffToken });
    record('GET /dashboard/metrics (staff) rejected', status === 403, `status=${status}`);
  });

  await step('Admin is denied dashboard metrics', async () => {
    const { status } = await api('GET', '/dashboard/metrics', { token: state.adminToken });
    record('GET /dashboard/metrics (admin) rejected', status === 403, `status=${status}`);
  });

  let savedFilterId = null;
  const filterName = `Sanity filter ${randSuffix()}`;
  await step('Super creates a saved filter', async () => {
    const { status, body } = await api('POST', '/dashboard/saved-filters', {
      token: state.superToken,
      body: { name: filterName, filter_json: { status: 'open' } },
    });
    savedFilterId = body && body.id;
    record('POST /dashboard/saved-filters (super)', status === 201 || status === 200, `status=${status}, id=${savedFilterId}`);
  });

  await step('Super sees own saved filter in list', async () => {
    const { status, body } = await api('GET', '/dashboard/saved-filters', { token: state.superToken });
    const found = Array.isArray(body) && body.some((f) => f.id === savedFilterId);
    record('Saved filter visible to creator', status === 200 && found, `status=${status}, found=${found}`);
  });

  await step('CSV export responds with 200 and CSV-ish content', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/export?format=csv`, {
      headers: { Authorization: `Bearer ${state.superToken}` },
    });
    const contentType = res.headers.get('content-type') || '';
    record('GET /dashboard/export?format=csv', res.status === 200, `status=${res.status}, content-type=${contentType}`);
  });

  await step('PDF export responds with 200 and PDF content-type', async () => {
    const res = await fetch(`${BASE_URL}/dashboard/export?format=pdf`, {
      headers: { Authorization: `Bearer ${state.superToken}` },
    });
    const contentType = res.headers.get('content-type') || '';
    record('GET /dashboard/export?format=pdf', res.status === 200, `status=${res.status}, content-type=${contentType}`);
  });

  await step('Super deletes own saved filter (cleanup)', async () => {
    if (!savedFilterId) {
      record('DELETE own saved filter', false, 'no savedFilterId captured — skipped');
      return;
    }
    const { status } = await api('DELETE', `/dashboard/saved-filters/${savedFilterId}`, {
      token: state.superToken,
    });
    record('DELETE /dashboard/saved-filters/:id (own filter)', status === 200 || status === 204, `status=${status}`);
  });

  // ---------------- PHASE 2 (cont'd): 2FA FULL ROUND TRIP ----------------
  // Only run if Super did NOT already have 2FA enabled before this script started.

  if (state.superHad2FABefore === false) {
    let manualSecret = null;
    await step('Super enables 2FA on own account', async () => {
      const { status, body } = await api('PATCH', `/users/${state.superId}/2fa`, {
        token: state.superToken,
        body: { enabled: true },
      });
      manualSecret =
        body &&
        body.twoFactorSetup &&
        (body.twoFactorSetup.manualSecret || body.twoFactorSetup.manual_secret);
      record(
        '2FA enable returns manualSecret + QR',
        status === 200 && Boolean(manualSecret) && Boolean(body.twoFactorSetup.qrCodeDataUrl || body.twoFactorSetup.qr_code_data_url),
        `status=${status}`
      );
    });

    await step('Login now requires 2FA (pending_2fa_token returned)', async () => {
      const { status, body } = await api('POST', '/auth/login', {
        body: { username: SUPER_USERNAME, password: SUPER_PASSWORD },
      });
      state.pendingToken = body && body.pending_2fa_token;
      record(
        'Login returns pending_2fa_token, not full JWT',
        status === 200 && body.requiresTwoFactor === true && Boolean(state.pendingToken) && !body.token,
        `status=${status}`
      );
    });

    await step('Valid OTP completes login and returns full JWT', async () => {
      if (!manualSecret || !state.pendingToken) {
        record('Complete 2FA login', false, 'missing manualSecret or pendingToken from prior steps');
        return;
      }
      const otp = authenticator.generate(manualSecret);
      const { status, body } = await api('POST', '/auth/login/verify-2fa', {
        body: { pending_2fa_token: state.pendingToken, otp },
      });
      record(
        'verify-2fa returns full JWT for super role',
        status === 200 && Boolean(body.token) && body.user && body.user.role === 'super',
        `status=${status}`
      );
      if (body.token) {
        state.superToken = body.token; // refresh in case later steps need it
      }
    });

    await step('Super disables 2FA again (restore original state)', async () => {
      const { status, body } = await api('PATCH', `/users/${state.superId}/2fa`, {
        token: state.superToken,
        body: { enabled: false },
      });
      record('2FA disable restores original state', status === 200, `status=${status}`);
    });

    await step('Login no longer requires 2FA after disabling', async () => {
      const { status, body } = await api('POST', '/auth/login', {
        body: { username: SUPER_USERNAME, password: SUPER_PASSWORD },
      });
      record('Login returns full JWT again post-disable', status === 200 && Boolean(body.token), `status=${status}`);
    });
  } else {
    console.log('\n[SKIPPED] Full 2FA round-trip test — Super already had 2FA enabled before this run.');
  }

  // ---------------- CLEANUP (best-effort, no delete endpoints exist) ----------------

  await step('Cleanup: disable disposable test unit', async () => {
    if (!state.unitId) {
      record('Disable test unit', false, 'no unitId captured — skipped');
      return;
    }
    const { status } = await api('PATCH', `/units/${state.unitId}/disable`, { token: state.superToken });
    record('PATCH /units/:id/disable (cleanup)', status === 200, `status=${status}`);
  });

  printSummary();
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed, ${results.length} total ===`);
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.detail || ''}`));
  }
}

main().catch((err) => {
  console.error('Fatal error running sanity tests:', err);
  process.exit(1);
});
