/**
 * Load test — Service Request App
 * Pure Node.js, no external tools required (no k6 install needed).
 *
 * Simulates N concurrent "virtual users" each performing a realistic sequence:
 * login -> list tickets -> create a ticket -> check own profile.
 * Measures latency (p50/p95/max) and error rate per action type.
 *
 * This is a basic concurrent-load smoke test, not a substitute for a proper
 * ramping/soak test — good enough to catch gross problems (connection pool
 * exhaustion, missing indexes causing slow queries under concurrency) before
 * a more thorough tool-based test if this reveals issues worth digging into.
 *
 * Usage (PowerShell), run from backend/:
 *   $env:BASE_URL="http://localhost:30040"
 *   $env:SUPER_USERNAME="your_super_username"
 *   $env:SUPER_PASSWORD="your_super_password"
 *   $env:VIRTUAL_USERS="50"        # how many concurrent simulated users (default 50)
 *   $env:ITERATIONS="5"            # how many times each virtual user repeats the sequence (default 5)
 *   node load-test.js
 *
 * NOTE: This creates real test accounts and tickets (prefixed "loadtest_").
 * Run against a dev/staging database, not production. It reuses one disposable
 * test unit for all virtual users to avoid needing hundreds of units.
 */


const BASE_URL = process.env.BASE_URL || 'http://localhost:30040';
const SUPER_USERNAME = process.env.SUPER_USERNAME;
const SUPER_PASSWORD = process.env.SUPER_PASSWORD;
const VIRTUAL_USERS = parseInt(process.env.VIRTUAL_USERS || '50', 10);
const ITERATIONS = parseInt(process.env.ITERATIONS || '5', 10);


if (!SUPER_USERNAME || !SUPER_PASSWORD) {
  console.error('ERROR: SUPER_USERNAME and SUPER_PASSWORD env vars are required.');
  process.exit(1);
}


async function api(method, path, { token, body } = {}) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const elapsed = Date.now() - start;
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, body: json, elapsed, ok: res.status >= 200 && res.status < 300 };
  } catch (err) {
    return { status: 0, body: null, elapsed: Date.now() - start, ok: false, error: err.message };
  }
}


function unwrap(body, ...keys) {
  if (!body || typeof body !== 'object') return body;
  for (const k of keys) if (body[k] !== undefined) return body[k];
  return body;
}


const metrics = {};
const errors = {};


function recordMetric(action, elapsed, ok) {
  if (!metrics[action]) metrics[action] = [];
  metrics[action].push(elapsed);
  if (!ok) errors[action] = (errors[action] || 0) + 1;
}


function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}


async function setup() {
  console.log('Setting up shared test fixtures (unit, department)...');
  const login = await api('POST', '/auth/login', { body: { username: SUPER_USERNAME, password: SUPER_PASSWORD } });
  
  console.log('Login response:', { status: login.status, body: login.body, error: login.error });
  
  if (!login.ok || login.status !== 200) {
    throw new Error(login.error || `Super login failed: status ${login.status}, body: ${JSON.stringify(login.body)}`);
  }
  
  if (login.body.requiresTwoFactor) {
    throw new Error('Super has 2FA enabled — disable it before running this script');
  }
  
  const superToken = login.body.token;

const unitRes = await api('POST', '/units', {
  token: superToken,
  body: { name: `Load Test Unit ${Date.now()}` },
});

console.log('Unit creation response:', {
  status: unitRes.status,
  body: unitRes.body,
  error: unitRes.error,
});

if (!unitRes.ok) {
  throw new Error(
    `Failed to create load-test unit: status=${unitRes.status}, ` +
    `body=${JSON.stringify(unitRes.body)}`
  );
}

const unit = unwrap(unitRes.body, 'unit');

if (!unit || !unit.id || !Array.isArray(unit.departments)) {
  throw new Error(
    `Unexpected unit response shape: ${JSON.stringify(unitRes.body)}`
  );
}

const itDept = unit.departments.find((d) => d.name === 'IT');

if (!itDept) {
  throw new Error(
    `The created load-test unit response does not include an IT department: ` +
    `${JSON.stringify(unit)}`
  );
}

  // Create a staff department for this unit
  const staffDeptRes = await api('POST', '/staff-departments', {
    token: superToken,
    body: { unitId: unit.id, name: `Load Test Staff Dept` },
  });
  const staffDept = unwrap(staffDeptRes.body, 'staffDepartment');

  return { superToken, unitId: unit.id, deptId: itDept.id, staffDeptId: staffDept.id };
}


async function createVirtualUserAccount(superToken, unitId, deptId, staffDeptId, index) {
  const username = `loadtest_staff_${index}_${Date.now()}`;
  const password = 'LoadTest_Pass_123!';
  const create = await api('POST', '/users', {
    token: superToken,
    body: { username, password, fullName: `Load Test User ${index}`, role: 'staff', unitId, departmentId: staffDeptId },
  });
  if (!create.ok) throw new Error(`Failed to create virtual user ${index}: ${create.status}`);
  return { username, password };
}


async function virtualUserRun(creds, unitId, deptId, iterations) {
  let r = await api('POST', '/auth/login', { body: { username: creds.username, password: creds.password } });
  recordMetric('login', r.elapsed, r.ok);
  if (!r.ok) return;
  const token = r.body.token;


  for (let i = 0; i < iterations; i++) {
    r = await api('GET', '/tickets', { token });
    recordMetric('list_tickets', r.elapsed, r.ok);


    r = await api('POST', '/tickets', {
      token,
      body: { unitId, departmentId: deptId, title: `Load test ticket ${i}`, description: 'concurrent load test', priority: 'low' },
    });
    
    if (!r.ok) {
      console.log(`CREATE_TICKET ERROR:`, { status: r.status, body: r.body, error: r.error });
    }
    
    recordMetric('create_ticket', r.elapsed, r.ok);


    r = await api('GET', '/auth/me', { token });
    recordMetric('auth_me', r.elapsed, r.ok);
  }
}


async function main() {
  console.log(`\n=== Load Test — Service Request App ===`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Virtual users: ${VIRTUAL_USERS}, iterations each: ${ITERATIONS}\n`);


  const { superToken, unitId, deptId, staffDeptId } = await setup();
 

  console.log(`Creating ${VIRTUAL_USERS} virtual user accounts (sequential, not timed)...`);
  const accounts = [];
  for (let i = 0; i < VIRTUAL_USERS; i++) {
    accounts.push(await createVirtualUserAccount(superToken, unitId, deptId, staffDeptId, i));
  }
  console.log('Accounts created. Starting concurrent load...\n');


  const startTime = Date.now();
  await Promise.all(accounts.map(creds => virtualUserRun(creds, unitId, deptId, ITERATIONS)));
  const totalElapsed = (Date.now() - startTime) / 1000;


  console.log(`\n=== Results (total wall time: ${totalElapsed.toFixed(1)}s) ===\n`);
  console.log('Action'.padEnd(20) + 'Count'.padEnd(8) + 'Errors'.padEnd(8) + 'p50 ms'.padEnd(10) + 'p95 ms'.padEnd(10) + 'Max ms');
  console.log('-'.repeat(70));
  for (const action of Object.keys(metrics)) {
    const arr = metrics[action];
    const errCount = errors[action] || 0;
    console.log(
      action.padEnd(20) +
      String(arr.length).padEnd(8) +
      String(errCount).padEnd(8) +
      String(percentile(arr, 50)).padEnd(10) +
      String(percentile(arr, 95)).padEnd(10) +
      String(Math.max(...arr))
    );
  }


  const totalRequests = Object.values(metrics).reduce((sum, arr) => sum + arr.length, 0);
  const totalErrors = Object.values(errors).reduce((sum, c) => sum + c, 0);
  console.log(`\nTotal requests: ${totalRequests}, total errors: ${totalErrors} (${((totalErrors / totalRequests) * 100).toFixed(1)}%)`);
  console.log(`Throughput: ${(totalRequests / totalElapsed).toFixed(1)} requests/sec\n`);


  console.log('--- What to look for ---');
  console.log('- p95 latency climbing sharply as VIRTUAL_USERS increases -> likely connection pool exhaustion or missing index');
  console.log('- Error rate > 0% under load that passed at low concurrency -> race condition or pool timeout');
  console.log('- Try re-running with VIRTUAL_USERS=100 or 200 to see where behavior starts to degrade\n');
}


main().catch(err => {
  console.error('Fatal error running load test:', err);
  process.exit(1);
});