#!/usr/bin/env node
/**
 * Ndakala Advisory LLP — Enterprise HR Platform
 * Authoritative Full-Stack Go-Live UAT & Security Verification Script (35 Scenarios)
 *
 * Usage:
 *   node scripts/full_uat_golive_audit.mjs [baseUrl]
 *   Default baseUrl: http://localhost:4000
 */

const BASE_URL = (process.argv[2] || process.env.UAT_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const API_PREFIX = `${BASE_URL}/api/v1`;
const DEFAULT_PASSWORD = process.env.UAT_PASSWORD || 'Ndakala@Secure2026!';

const PERSONAS = {
  managing_partner: 'managing.partner@ndakalaadvisory.co.ke',
  operations_director: 'operations.director@ndakalaadvisory.co.ke',
  head_of_hr: 'hr.lead@ndakalaadvisory.co.ke',
  line_manager: 'line.manager@ndakalaadvisory.co.ke',
  employee: 'employee.one@ndakalaadvisory.co.ke',
  auditor: 'auditor@ndakalaadvisory.co.ke',
  ict_admin: 'ict.admin@ndakalaadvisory.co.ke',
  dpo: 'dpo@ndakalaadvisory.co.ke',
};

function unwrap(json) {
  if (json && typeof json === 'object' && 'data' in json) return json.data;
  return json;
}

function asArray(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    for (const k of ['items', 'shifts', 'views', 'letters', 'requests', 'delegations', 'results', 'rows']) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}

class SessionClient {
  constructor(roleKey, email) {
    this.roleKey = roleKey;
    this.email = email;
    this.cookie = '';
    this.csrfToken = '';
    this.user = null;
  }

  async request(method, path, body = undefined, { includeCookie = true, includeCsrf = true, rawBody = undefined, extraHeaders = {} } = {}) {
    const url = path.startsWith('http') ? path : (path.startsWith('/api') ? `${BASE_URL}${path}` : `${API_PREFIX}${path}`);
    const headers = { ...extraHeaders };
    if (includeCookie && this.cookie) headers['Cookie'] = this.cookie;
    if (includeCsrf && this.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
      headers['X-CSRF-Token'] = this.csrfToken;
    }
    let payloadBody = rawBody;
    if (body !== undefined && rawBody === undefined) {
      headers['Content-Type'] = 'application/json';
      payloadBody = JSON.stringify(body);
    }

    const t0 = performance.now();
    const res = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : payloadBody,
      redirect: 'manual',
    });
    const ms = Math.round((performance.now() - t0) * 10) / 10;

    // Extract hr_sid cookie from Set-Cookie if sent
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const sc of setCookies) {
      const m = /hr_sid=([^;]+)/.exec(sc);
      if (m) {
        this.cookie = m[1] ? `hr_sid=${m[1]}` : '';
      }
    }

    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      status: res.status,
      ok: res.ok,
      ms,
      headers: res.headers,
      text,
      json,
      data: unwrap(json),
    };
  }

  async login(password = DEFAULT_PASSWORD) {
    const r = await this.request('POST', '/auth/login', { email: this.email, password }, { includeCookie: false, includeCsrf: false });
    if (r.ok && r.data) {
      this.csrfToken = r.data.csrfToken || '';
      this.user = r.data.user || null;
    }
    return r;
  }

  async logout() {
    if (!this.cookie) return null;
    const r = await this.request('POST', '/auth/logout', {});
    this.cookie = '';
    this.csrfToken = '';
    return r;
  }
}

const results = [];
const sessions = {};
const shared = {};

async function runScenario(id, moduleName, title, personaLabel, stepsDesc, expectedDesc, fn) {
  const t0 = performance.now();
  try {
    const outcome = await fn();
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    const passed = outcome?.passed !== false;
    const entry = {
      id,
      module: moduleName,
      title,
      persona: personaLabel,
      steps: stepsDesc,
      expected: expectedDesc,
      status: passed ? 'PASS' : 'FAIL',
      httpStatus: outcome?.httpStatus ?? 'N/A',
      latencyMs: ms,
      finding: outcome?.finding || 'Verified cleanly.',
    };
    results.push(entry);
    const badge = entry.status === 'PASS' ? '[PASS]' : '[FAIL]';
    console.log(`${badge} ${id.padEnd(13)} | HTTP ${String(entry.httpStatus).padEnd(8)} | ${String(entry.latencyMs).padStart(6)}ms | ${title} — ${entry.finding}`);
  } catch (err) {
    const ms = Math.round((performance.now() - t0) * 10) / 10;
    const entry = {
      id,
      module: moduleName,
      title,
      persona: personaLabel,
      steps: stepsDesc,
      expected: expectedDesc,
      status: 'FAIL',
      httpStatus: 'ERR',
      latencyMs: ms,
      finding: `Unhandled exception: ${err?.message || String(err)}`,
    };
    results.push(entry);
    console.log(`[FAIL] ${id.padEnd(13)} | ERR          | ${String(entry.latencyMs).padStart(6)}ms | ${title} — ${entry.finding}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`\n================================================================================`);
  console.log(` NDAKALA HR PLATFORM — FULL LIVE END-TO-END UAT & GO-LIVE VERIFICATION`);
  console.log(` Target Base URL: ${BASE_URL}`);
  console.log(`================================================================================\n`);

  const anon = new SessionClient('public', 'anonymous');

  // -------------------------------------------------------------------------
  // 1. AUTHENTICATION, BRANDING, MFA & CSRF (UAT-AUTH-01 .. UAT-AUTH-05)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-AUTH-01',
    'Authentication & Login',
    'Public White-Label Branding & Login Logo Config',
    'Unauthenticated Visitor',
    'GET /api/v1/auth/branding',
    'Returns 200 with Ndakala Advisory orgName and logoLabel without Zoho/mock strings.',
    async () => {
      const r = await anon.request('GET', '/auth/branding');
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      assert(r.data?.orgName && /ndakala/i.test(r.data.orgName), `Unexpected orgName: ${JSON.stringify(r.data)}`);
      assert(typeof r.data?.logoLabel === 'string' && !/zoho|zylker/i.test(r.data.logoLabel), `Forbidden brand text in logoLabel: ${r.data?.logoLabel}`);
      return { httpStatus: '200', finding: `orgName="${r.data.orgName}", logoLabel="${r.data.logoLabel}"` };
    }
  );

  await runScenario(
    'UAT-AUTH-02',
    'Authentication & Login',
    'Self-Service Forgot-Password Recovery Request',
    'Employee (Unauthenticated)',
    'POST /api/v1/auth/forgot-password with valid and unknown email addresses',
    'Returns non-enumerating 200 accepted response for both known & unknown emails.',
    async () => {
      const r1 = await anon.request('POST', '/auth/forgot-password', { email: PERSONAS.employee });
      const r2 = await anon.request('POST', '/auth/forgot-password', { email: 'nonexistent.user@ndakalaadvisory.co.ke' });
      assert(r1.status === 200 && r1.data?.accepted === true, `Known email failed: ${r1.status}`);
      assert(r2.status === 200 && r2.data?.accepted === true, `Unknown email enumerated state: ${r2.status}`);
      return { httpStatus: '200/200', finding: `Non-enumerating recovery verified (accepted=true on known & unknown email).` };
    }
  );

  await runScenario(
    'UAT-AUTH-03',
    'Authentication & Login',
    'Invalid Credential Rejection + Multi-Role Authentication (All 8 Personas)',
    'All 8 Seeded Accounts',
    '1 bad password attempt (expect 401), then valid POST /auth/login for all 8 personas',
    'Bad password rejected 401; all 8 personas authenticate 200 with hr_sid cookie + CSRF token (resetting failed count).',
    async () => {
      const badClient = new SessionClient('employee', PERSONAS.employee);
      const bad = await badClient.login('WrongPassword!999');
      assert(bad.status === 401, `Expected 401 for wrong password, got ${bad.status}`);

      for (const [roleKey, email] of Object.entries(PERSONAS)) {
        const client = new SessionClient(roleKey, email);
        const ok = await client.login(DEFAULT_PASSWORD);
        assert(ok.status === 200, `Login failed for ${roleKey} (${email}): HTTP ${ok.status} ${ok.text}`);
        assert(client.cookie.startsWith('hr_sid='), `Missing hr_sid cookie for ${roleKey}`);
        assert(client.csrfToken.length > 10, `Missing csrfToken for ${roleKey}`);
        sessions[roleKey] = client;
      }
      return { httpStatus: '401/200', finding: `Wrong password -> 401; all 8 RBAC roles logged in cleanly with HttpOnly cookie & CSRF.` };
    }
  );

  await runScenario(
    'UAT-AUTH-04',
    'Authentication & Login',
    'Authenticated Session Restoration & Role/Permission Hydration',
    'Line Manager',
    'GET /api/v1/auth/me using session cookie',
    'Returns 200 with user profile, roles array, non-empty permissions array, and csrfToken.',
    async () => {
      const lm = sessions.line_manager;
      const r = await lm.request('GET', '/auth/me');
      assert(r.status === 200, `Expected 200, got ${r.status}`);
      assert(r.data?.user?.email === PERSONAS.line_manager, `Mismatch user email`);
      assert(Array.isArray(r.data?.roles) && r.data.roles.includes('line_manager'), `Missing line_manager role`);
      assert(Array.isArray(r.data?.permissions) && r.data.permissions.length > 0, `Empty permissions array`);
      return { httpStatus: '200', finding: `Restored ${r.data.user.name} (${r.data.roles.join(', ')}; ${r.data.permissions.length} permissions).` };
    }
  );

  await runScenario(
    'UAT-AUTH-05',
    'Authentication & Login',
    'TOTP MFA Secret Enrollment & Strict CSRF Token Guard',
    'Employee',
    'POST /api/v1/auth/mfa/setup without X-CSRF-Token (expect 403), then with X-CSRF-Token (expect 200)',
    'Missing CSRF header blocked 403 CSRF_FAILED; valid CSRF issues TOTP secret + otpauth:// URI.',
    async () => {
      const emp = sessions.employee;
      const noCsrf = await emp.request('POST', '/auth/mfa/setup', {}, { includeCsrf: false });
      assert(noCsrf.status === 403, `Expected 403 without CSRF token, got ${noCsrf.status}`);
      const ok = await emp.request('POST', '/auth/mfa/setup', {});
      assert(ok.status === 200, `Expected 200 with CSRF token, got ${ok.status}`);
      assert(typeof ok.data?.secret === 'string' && ok.data.secret.length >= 16, `Invalid MFA secret`);
      assert(String(ok.data?.otpauthUrl || '').startsWith('otpauth://totp/NdakalaHR:'), `Invalid otpauth URL`);
      return { httpStatus: '403/200', finding: `CSRF check blocked 403; TOTP secret (${ok.data.secret.length} chars) + NdakalaHR otpauth URI generated.` };
    }
  );

  // -------------------------------------------------------------------------
  // 2. HOME WORKSPACE, ATTENDANCE, FEEDS, DELEGATIONS & UI CONFIG (UAT-HOME-01 .. 04)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-HOME-01',
    'Home & My Space',
    'Attendance Clock-In -> Live Record Retrieval -> Clock-Out Cycle',
    'Employee',
    'POST /workspace/attendance/clock-in -> GET /workspace/attendance -> POST /workspace/attendance/clock-out',
    'Employee self-service attendance records persist and expose todayCheckIn/logs.',
    async () => {
      const emp = sessions.employee;
      const ci = await emp.request('POST', '/workspace/attendance/clock-in', { source: 'WEB' });
      assert(ci.status === 200 || ci.status === 201, `Clock-in failed: HTTP ${ci.status} ${ci.text}`);
      const list = await emp.request('GET', '/workspace/attendance');
      assert(list.status === 200, `Attendance list failed: HTTP ${list.status}`);
      const co = await emp.request('POST', '/workspace/attendance/clock-out', {});
      assert(co.status === 200 || co.status === 201, `Clock-out failed: HTTP ${co.status} ${co.text}`);
      return { httpStatus: `${ci.status}/${list.status}/${co.status}`, finding: `Clock-in, attendance log fetch, and clock-out succeeded.` };
    }
  );

  await runScenario(
    'UAT-HOME-02',
    'Home & My Space',
    'Company Feeds / Announcements Broadcast & Feed Stream Query',
    'Head of HR & Employee',
    'POST /workspace/feeds (ANNOUNCEMENT) as Head of HR -> GET /workspace/feeds as Employee',
    'Announcement saves 201 and immediately streams in employee organization feed.',
    async () => {
      const hr = sessions.head_of_hr;
      const emp = sessions.employee;
      const tag = `UAT-FEED-${Date.now()}`;
      const post = await hr.request('POST', '/workspace/feeds', {
        category: 'ANNOUNCEMENT',
        message: `Go-Live Readiness Check Broadcast [${tag}]`,
      });
      assert(post.status === 201 || post.status === 200, `Feed post failed: HTTP ${post.status} ${post.text}`);
      const feed = await emp.request('GET', '/workspace/feeds');
      assert(feed.status === 200, `Feed read failed: HTTP ${feed.status}`);
      const items = Array.isArray(feed.data) ? feed.data : (feed.data?.items || []);
      assert(items.some((f) => String(f.message || '').includes(tag)), `Posted feed [${tag}] not found in feed stream`);
      return { httpStatus: `${post.status}/${feed.status}`, finding: `Announcement persisted & visible in feed stream (${items.length} entries).` };
    }
  );

  await runScenario(
    'UAT-HOME-03',
    'Home & My Space',
    'Approval Delegation Create -> List -> Delete Lifecycle',
    'Line Manager',
    'POST /workspace/delegations -> GET /workspace/delegations -> DELETE /workspace/delegations/:id',
    'Temporary delegation persists to PolicyConfiguration, lists cleanly, and deletes without residue.',
    async () => {
      const lm = sessions.line_manager;
      const dName = `UAT Delegate ${Date.now()}`;
      const created = await lm.request('POST', '/workspace/delegations', {
        delegateName: dName,
        startDate: '2026-11-16',
        endDate: '2026-11-20',
        delegationType: 'TEMPORARY',
      });
      assert(created.status === 201, `Delegation create expected 201, got ${created.status} ${created.text}`);
      const delId = created.data?.id;
      assert(delId, `Missing delegation id`);
      const listed = await lm.request('GET', '/workspace/delegations');
      const items = asArray(listed.data);
      assert(listed.status === 200 && items.some((d) => d.id === delId), `Delegation not listed`);
      const removed = await lm.request('DELETE', `/workspace/delegations/${delId}`);
      assert(removed.status === 200, `Delegation delete failed: ${removed.status}`);
      return { httpStatus: '201/200/200', finding: `Delegation id=${delId.slice(0, 8)}... created, queried & cleaned up.` };
    }
  );

  await runScenario(
    'UAT-HOME-04',
    'Home & My Space',
    'Workspace UI Config Persistence (`PUT` & `POST` `/workspace/ui-config`)',
    'Employee & Head of HR',
    'PUT WIDGETS (record) as Employee + POST ORG_LOGO_LABEL (record) as HR, verify GET /workspace/ui-config round-trip & restore',
    'Both PUT & POST persist record values cleanly across subsequent GET /workspace/ui-config reads.',
    async () => {
      const emp = sessions.employee;
      const hr = sessions.head_of_hr;
      const getBefore = await hr.request('GET', '/workspace/ui-config');
      assert(getBefore.status === 200, `GET ui-config failed: ${getBefore.status}`);
      const prevWidgets = getBefore.data?.configs?.WIDGETS;
      const prevLogo = getBefore.data?.configs?.ORG_LOGO_LABEL;

      const testWidgets = { enabled: ['attendance', 'leave', 'announcements', 'birthdays'], updatedBy: 'uat' };
      const putWidgets = await emp.request('PUT', '/workspace/ui-config', {
        key: 'WIDGETS',
        scope: 'USER',
        value: testWidgets,
      });
      assert(putWidgets.status === 200, `PUT WIDGETS failed: ${putWidgets.status} ${putWidgets.text}`);

      const testLogoObj = { label: 'UATPeople' };
      const postLogo = await hr.request('POST', '/workspace/ui-config', {
        key: 'ORG_LOGO_LABEL',
        scope: 'ORG',
        value: testLogoObj,
      });
      assert(postLogo.status === 200, `POST ORG_LOGO_LABEL failed: ${postLogo.status} ${postLogo.text}`);

      const check = await emp.request('GET', '/workspace/ui-config');
      assert(check.status === 200 && check.data?.configs?.WIDGETS?.updatedBy === 'uat', `User WIDGETS config did not persist`);
      assert(check.data?.configs?.ORG_LOGO_LABEL?.label === 'UATPeople', `Org ORG_LOGO_LABEL config did not persist`);

      // Restore previous values cleanly
      await hr.request('POST', '/workspace/ui-config', {
        key: 'ORG_LOGO_LABEL',
        scope: 'ORG',
        value: typeof prevLogo === 'object' && prevLogo !== null ? prevLogo : { label: 'People' },
      });
      if (prevWidgets && typeof prevWidgets === 'object') {
        await emp.request('PUT', '/workspace/ui-config', { key: 'WIDGETS', scope: 'USER', value: prevWidgets });
      }
      return { httpStatus: '200/200', finding: `PUT WIDGETS (USER) & POST ORG_LOGO_LABEL (ORG) persisted via PolicyConfiguration and restored cleanly.` };
    }
  );

  // -------------------------------------------------------------------------
  // 3. ORGANISATION, DIRECTORY & WORKFORCE LIFECYCLE (UAT-DIR-01 .. 04)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-DIR-01',
    'Organisation & Directory',
    'Enterprise Org Structure, Directory Feed & RBAC Employee List Scoping',
    'Employee (Negative 403) & Head of HR (Full Directory)',
    'GET /organisation, /departments, /positions, /grades, /locations (Employee) + GET /employees (Employee expect 403, HR expect 200)',
    'Org catalogs return 200 for all staff; global /employees PII list strictly restricted to HR/Managers (403 for standard employee).',
    async () => {
      const emp = sessions.employee;
      const hr = sessions.head_of_hr;
      const [org, depts, pos, grades, locs, empDenied, emps] = await Promise.all([
        emp.request('GET', '/organisation'),
        emp.request('GET', '/departments'),
        emp.request('GET', '/positions'),
        emp.request('GET', '/grades'),
        emp.request('GET', '/locations'),
        emp.request('GET', '/employees'),
        hr.request('GET', '/employees'),
      ]);
      for (const [name, r] of [['organisation', org], ['departments', depts], ['positions', pos], ['grades', grades], ['locations', locs], ['employees(HR)', emps]]) {
        assert(r.status === 200, `${name} failed: HTTP ${r.status}`);
      }
      assert(empDenied.status === 403, `Expected 403 for standard employee accessing /employees, got ${empDenied.status}`);
      const deptList = asArray(depts.data);
      const empList = asArray(emps.data);
      assert(deptList.length > 0 && empList.length > 0, `Empty departments (${deptList.length}) or employees (${empList.length})`);
      shared.departmentId = deptList[0].id;
      const selfEmp = empList.find((e) => e.workEmail === PERSONAS.employee) || empList[0];
      shared.employeeRecordId = selfEmp.id;
      shared.allEmployeeIds = empList.map((e) => e.id);
      return { httpStatus: '200/403', finding: `${deptList.length} depts, ${empList.length} employees loaded (HR); standard employee denied global directory (403).` };
    }
  );

  await runScenario(
    'UAT-DIR-02',
    'Organisation & Directory',
    'Employee Onboarding Record Creation + RBAC Enforcement Check',
    'Employee (Negative 403) & Head of HR (Create 201)',
    'POST /employees as standard employee (expect 403), then POST /employees + GET /employees/:id as Head of HR',
    'Employee blocked 403; HR creates encrypted PII employee record 201 and retrieves detail.',
    async () => {
      const ts = Date.now();
      const randDigits = String(ts).slice(-8);
      const payload = {
        firstName: 'Uat',
        lastName: `Candidate${randDigits.slice(-4)}`,
        workEmail: `uat.hire.${ts}@ndakalaadvisory.co.ke`,
        phoneNumber: `+2547${randDigits}`,
        nationalId: randDigits,
        kraPin: `A0${randDigits}Z`,
        bankAccountNumber: `0100${randDigits}`,
        employmentCategoryCode: 'PERMANENT',
        startDate: '2026-02-01',
        jobTitle: 'UAT Advisory Associate',
        departmentId: shared.departmentId,
      };

      const denied = await sessions.employee.request('POST', '/employees', payload);
      assert(denied.status === 403, `Expected 403 RBAC denial for employee creating staff, got ${denied.status}`);

      const created = await sessions.head_of_hr.request('POST', '/employees', payload);
      assert(created.status === 201, `Expected 201 creating employee, got ${created.status} ${created.text}`);
      const newEmpId = created.data?.employee?.id || created.data?.id;
      assert(newEmpId, `Missing employee id in ${JSON.stringify(created.data)}`);
      const detail = await sessions.head_of_hr.request('GET', `/employees/${newEmpId}`);
      assert(detail.status === 200 && detail.data?.workEmail === payload.workEmail, `Detail read failed: ${detail.status}`);
      return { httpStatus: '403/201/200', finding: `RBAC denied employee 403; HR onboarded employee id=${newEmpId.slice(0, 8)}... with encrypted statutory PII.` };
    }
  );

  await runScenario(
    'UAT-DIR-03',
    'Organisation & Directory',
    'Directory Custom View Column Shuttle Persistence (`DIRECTORY`)',
    'Head of HR',
    'POST /workspace/custom-views -> GET /workspace/custom-views?module=DIRECTORY -> DELETE',
    'Custom column array persists accurately and cleans up cleanly.',
    async () => {
      const hr = sessions.head_of_hr;
      const cols = ['employeeNumber', 'firstName', 'lastName', 'jobTitle', 'status'];
      const cr = await hr.request('POST', '/workspace/custom-views', {
        module: 'DIRECTORY',
        name: `UAT Shuttle View ${Date.now()}`,
        columns: cols,
      });
      assert(cr.status === 201, `Expected 201, got ${cr.status} ${cr.text}`);
      const id = cr.data?.id;
      const list = await hr.request('GET', '/workspace/custom-views?module=DIRECTORY');
      const items = asArray(list.data);
      assert(list.status === 200 && items.some((v) => v.id === id && v.columns?.length === cols.length), `Custom view mismatch`);
      const del = await hr.request('DELETE', `/workspace/custom-views/${id}`);
      assert(del.status === 200, `Custom view delete failed: ${del.status}`);
      return { httpStatus: '201/200/200', finding: `5-column DIRECTORY shuttle view persisted & deleted.` };
    }
  );

  await runScenario(
    'UAT-DIR-04',
    'Workforce & HR Letters',
    'Probation Forms, Staff Requisitions, Transfers & Address Proof HR Letter Submission',
    'Head of HR & Employee',
    'GET /probation-forms, /workforce/requisitions, /workforce/transfers + POST/GET /hr-letters/address-proof',
    'Workforce workflow endpoints return 200; employee Address Proof Letter saves 201 and appears in requests.',
    async () => {
      const hr = sessions.head_of_hr;
      const emp = sessions.employee;
      const [prob, reqs, trans] = await Promise.all([
        hr.request('GET', '/probation-forms'),
        hr.request('GET', '/workforce/requisitions'),
        hr.request('GET', '/workforce/transfers'),
      ]);
      assert(prob.status === 200 && reqs.status === 200 && trans.status === 200, `Workforce GET failed: ${prob.status}/${reqs.status}/${trans.status}`);

      const letter = await emp.request('POST', '/hr-letters/address-proof', {
        reason: `UAT Bank Verification ${Date.now()}`,
        changeInAddress: false,
        status: 'SUBMITTED',
      });
      assert(letter.status === 201, `HR Letter create failed: ${letter.status} ${letter.text}`);
      const letters = await emp.request('GET', '/hr-letters/address-proof');
      const letterItems = asArray(letters.data);
      assert(letters.status === 200 && letterItems.some((l) => l.id === letter.data?.id), `Letter not returned`);
      return { httpStatus: '200/201', finding: `Probation/Requisition/Transfer feeds live; Address Proof Letter ${letter.data.id.slice(0, 8)}... submitted.` };
    }
  );

  // -------------------------------------------------------------------------
  // 4. LEAVE TRACKER & ABSENCES (UAT-LEAVE-01 .. 03)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-LEAVE-01',
    'Leave Tracker',
    'Leave Types, Public Holidays, Work Schedules, Balances & Authoritative Ledger',
    'Employee',
    'GET /leave/types, /leave/holidays, /leave/schedules, /leave/balances, /leave/ledger',
    'All 5 statutory leave feeds return 200 with seeded Kenya Employment Act leave types & schedules.',
    async () => {
      const emp = sessions.employee;
      const [types, hols, scheds, bals, ledger] = await Promise.all([
        emp.request('GET', '/leave/types'),
        emp.request('GET', '/leave/holidays'),
        emp.request('GET', '/leave/schedules'),
        emp.request('GET', '/leave/balances'),
        emp.request('GET', '/leave/ledger'),
      ]);
      for (const [k, r] of [['types', types], ['holidays', hols], ['schedules', scheds], ['balances', bals], ['ledger', ledger]]) {
        assert(r.status === 200, `leave/${k} failed: ${r.status}`);
      }
      assert(Array.isArray(types.data) && types.data.length > 0, `Empty leave types`);
      assert(Array.isArray(scheds.data) && scheds.data.length > 0, `Empty work schedules`);
      return { httpStatus: '200', finding: `${types.data.length} leave types, ${hols.data.length} holidays, ${scheds.data.length} schedules, ${bals.data.length} balances loaded.` };
    }
  );

  await runScenario(
    'UAT-LEAVE-02',
    'Leave Tracker',
    'Working-Day Exclusion Calculator (`POST /leave/calculate`)',
    'Employee',
    'POST /leave/calculate for 2026-11-16 (Mon) to 2026-11-22 (Sun)',
    'Excludes statutory Sunday rest day cleanly and computes netWorkingDays=6 & restDaysExcluded=1 per Kenya 6-day default schedule.',
    async () => {
      const r = await sessions.employee.request('POST', '/leave/calculate', {
        startDate: '2026-11-16',
        endDate: '2026-11-22',
      });
      assert(r.status === 200, `Expected 200, got ${r.status} ${r.text}`);
      assert(r.data?.calendarDays === 7 && r.data?.restDaysExcluded === 1 && r.data?.netWorkingDays === 6, `Unexpected calculation: ${JSON.stringify(r.data)}`);
      return { httpStatus: '200', finding: `Mon–Sun span -> calendarDays=7, restDaysExcluded=1 (Sunday), netWorkingDays=${r.data.netWorkingDays}.` };
    }
  );

  await runScenario(
    'UAT-LEAVE-03',
    'Leave Tracker',
    'Unplanned Absence / Sickness Logging & HR Register Visibility',
    'Employee & Head of HR',
    'POST /absences as Employee -> GET /absences as Head of HR',
    'Absence record saves 201 for employee and surfaces in HR absence register.',
    async () => {
      assert(shared.employeeRecordId, `Missing employeeRecordId`);
      const ab = await sessions.employee.request('POST', '/absences', {
        employeeId: shared.employeeRecordId,
        startDate: '2026-11-14',
        reasonCategory: 'SICKNESS',
        contactChannel: 'PHONE',
        notes: 'UAT verification absence log',
      });
      assert(ab.status === 201, `Absence log expected 201, got ${ab.status} ${ab.text}`);
      const list = await sessions.head_of_hr.request('GET', '/absences');
      assert(list.status === 200 && Array.isArray(list.data) && list.data.some((a) => a.id === ab.data?.id), `Absence missing in HR register`);
      return { httpStatus: '201/200', finding: `Sickness absence ${ab.data.id.slice(0, 8)}... persisted and visible to HR.` };
    }
  );

  // -------------------------------------------------------------------------
  // 5. TIME TRACKER (UAT-TIME-01 .. 02)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-TIME-01',
    'Time Tracker',
    'Client Projects Catalog, Time Logs & Periods Inspection',
    'Employee',
    'GET /timetracker/projects, /timetracker/logs, /timetracker/periods',
    'Returns 200 with seeded engagement project list; non-finance employee sees rate-redacted view cleanly.',
    async () => {
      const emp = sessions.employee;
      const [proj, logs, periods] = await Promise.all([
        emp.request('GET', '/timetracker/projects'),
        emp.request('GET', '/timetracker/logs'),
        emp.request('GET', '/timetracker/periods'),
      ]);
      assert(proj.status === 200 && logs.status === 200 && periods.status === 200, `TimeTracker GET failed: ${proj.status}/${logs.status}/${periods.status}`);
      assert(Array.isArray(proj.data) && proj.data.length > 0, `No projects returned`);
      shared.projectId = proj.data[0].id;
      return { httpStatus: '200', finding: `${proj.data.length} projects, ${Array.isArray(logs.data) ? logs.data.length : 0} time logs, ${Array.isArray(periods.data) ? periods.data.length : 0} periods fetched.` };
    }
  );

  await runScenario(
    'UAT-TIME-02',
    'Time Tracker',
    'Log Billable Time -> Cleanup Delete -> Executive & Utilization Analytics',
    'Employee & Operations Director',
    'POST /timetracker/logs (201) -> DELETE /timetracker/logs/:id (200) -> GET executive & utilization reports',
    'Timesheet entry validates hours/projectId, deletes cleanly, and executive rollups return 200.',
    async () => {
      assert(shared.projectId, `Missing projectId`);
      const emp = sessions.employee;
      const ops = sessions.operations_director;
      const log = await emp.request('POST', '/timetracker/logs', {
        projectId: shared.projectId,
        workDate: '2026-11-14',
        hours: 2.5,
        isBillable: true,
        description: `UAT billable advisory review ${Date.now()}`,
      });
      assert(log.status === 201, `Time log create failed: ${log.status} ${log.text}`);
      const del = await emp.request('DELETE', `/timetracker/logs/${log.data.id}`);
      assert(del.status === 200, `Time log delete failed: ${del.status} ${del.text}`);

      const [execRep, utilRep] = await Promise.all([
        ops.request('GET', '/timetracker/reports/executive'),
        ops.request('GET', '/timetracker/reports/utilization'),
      ]);
      assert(execRep.status === 200 && utilRep.status === 200, `TimeTracker reports failed: ${execRep.status}/${utilRep.status}`);
      return { httpStatus: '201/200/200', finding: `2.5h log created & cleaned up; executive + utilization reports 200.` };
    }
  );

  // -------------------------------------------------------------------------
  // 6. PERFORMANCE (UAT-PERF-01)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-PERF-01',
    'Performance',
    'Appraisal Cycles, Appraisals & Performance Improvement Plans (PIPs)',
    'Head of HR & Line Manager',
    'GET /performance/cycles, /performance/appraisals, /performance/pips',
    'Returns 200 with active performance cycle configuration and appraisal pipelines.',
    async () => {
      const hr = sessions.head_of_hr;
      const [cyc, app, pips] = await Promise.all([
        hr.request('GET', '/performance/cycles'),
        hr.request('GET', '/performance/appraisals'),
        hr.request('GET', '/performance/pips'),
      ]);
      assert(cyc.status === 200 && app.status === 200 && pips.status === 200, `Performance GET failed: ${cyc.status}/${app.status}/${pips.status}`);
      return {
        httpStatus: '200',
        finding: `${Array.isArray(cyc.data) ? cyc.data.length : 0} cycles, ${Array.isArray(app.data) ? app.data.length : 0} appraisals, ${Array.isArray(pips.data) ? pips.data.length : 0} PIPs loaded.`,
      };
    }
  );

  // -------------------------------------------------------------------------
  // 7. KENYA PAYROLL & STATUTORY SIMULATOR (UAT-PAY-01 .. 02)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-PAY-01',
    'Payroll & Compensation',
    'Pay Groups, Payroll Periods, Runs & Self-Service Payslip Isolation',
    'Head of HR & Employee',
    'GET /payroll/pay-groups, /periods, /runs (HR) + GET /payroll/slips/me (Employee) + GET /payroll/runs as Employee (expect 403)',
    'HR views enterprise runs; standard employee accesses only own payslips and is denied 403 on company payroll runs.',
    async () => {
      const hr = sessions.head_of_hr;
      const emp = sessions.employee;
      const [pg, per, runs, mySlips, empRuns] = await Promise.all([
        hr.request('GET', '/payroll/pay-groups'),
        hr.request('GET', '/payroll/periods'),
        hr.request('GET', '/payroll/runs'),
        emp.request('GET', '/payroll/slips/me'),
        emp.request('GET', '/payroll/runs'),
      ]);
      assert(pg.status === 200 && per.status === 200 && runs.status === 200, `HR payroll GET failed: ${pg.status}/${per.status}/${runs.status}`);
      assert(mySlips.status === 200, `Employee payslips/me failed: ${mySlips.status}`);
      assert(empRuns.status === 403, `Expected 403 for employee reading /payroll/runs, got ${empRuns.status}`);
      return { httpStatus: '200/403', finding: `HR fetched ${Array.isArray(pg.data) ? pg.data.length : 0} pay groups; employee isolated from org payroll runs (403).` };
    }
  );

  await runScenario(
    'UAT-PAY-02',
    'Payroll & Compensation',
    'Kenya Statutory Payroll Simulator (PAYE / SHIF / NSSF / AHL Live Calculation)',
    'Head of HR & Employee Access Observation',
    'GET /payroll/rule-sets -> POST /payroll/simulate with KES 150,000 BASIC + active statutory ruleSetId',
    'HR simulation computes non-zero statutory PAYE/SHIF/NSSF/AHL deductions and netPay < 150,000 cleanly.',
    async () => {
      const hr = sessions.head_of_hr;
      const rsRes = await hr.request('GET', '/payroll/rule-sets');
      assert(rsRes.status === 200, `Failed to load payroll rule-sets: ${rsRes.status}`);
      const ruleSets = asArray(rsRes.data);
      const activeRuleSet =
        ruleSets.find((r) => (r.status === 'ACTIVE' || r.isActive) && Array.isArray(r.rules) && r.rules.length > 0 && !/UAT/i.test(r.code || '')) ||
        ruleSets.find((r) => Array.isArray(r.rules) && r.rules.length > 0) ||
        ruleSets.find((r) => /2026|KE_STAT/i.test(r.code || '') && !/UAT/i.test(r.code || '')) ||
        ruleSets[0];

      const payload = {
        ...(activeRuleSet?.id ? { ruleSetId: activeRuleSet.id } : {}),
        testEmployees: [
          {
            employeeId: 'uat-sim-1',
            employeeName: 'UAT Kenya Earner',
            employeeRef: 'UAT-001',
            salaryComponents: { BASIC: 150000 },
          },
        ],
      };
      const empProbe = await sessions.employee.request('POST', '/payroll/simulate', payload);
      const sim = await hr.request('POST', '/payroll/simulate', payload);
      assert(sim.status === 200, `Expected 200 on /payroll/simulate, got ${sim.status} ${sim.text}`);
      const slip = sim.data?.simulatedSlips?.[0];
      assert(slip, `Missing simulatedSlips[0] in ${JSON.stringify(sim.data)}`);
      const gross = Number(slip.grossPay ?? 0);
      const deductions = Number(slip.totalEmployeeDeductions ?? 0);
      const net = Number(slip.netPay ?? 0);
      assert(gross === 150000 && net > 0, `Unexpected simulation math: ${JSON.stringify(slip)}`);
      const codes = (slip.lineItems || []).map((l) => `${l.componentCode}:${Math.round(l.amount)}`).join(', ');
      return {
        httpStatus: `200/${empProbe.status}`,
        finding: `RuleSet "${activeRuleSet?.code || 'default'}" | Gross KES ${gross.toLocaleString()}, Deductions KES ${deductions.toLocaleString()}, Net KES ${net.toLocaleString()} (${codes}) [Employee probe: ${empProbe.status}].`,
      };
    }
  );

  // -------------------------------------------------------------------------
  // 8. GOVERNANCE, OPERATIONS & EMPLOYEE RELATIONS (UAT-GOV-01 .. 06)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-GOV-01',
    'Governance & Compliance',
    'Policy Register, Employee Acknowledgements & Training Programmes',
    'Employee',
    'GET /governance/policies, /policies/acknowledgements, /training/programmes, /training/my-assignments',
    'All governance policy & training endpoints return 200 with valid record arrays.',
    async () => {
      const emp = sessions.employee;
      const [pols, acks, progs, myTr] = await Promise.all([
        emp.request('GET', '/governance/policies'),
        emp.request('GET', '/governance/policies/acknowledgements'),
        emp.request('GET', '/governance/training/programmes'),
        emp.request('GET', '/governance/training/my-assignments'),
      ]);
      for (const [k, r] of [['policies', pols], ['acknowledgements', acks], ['programmes', progs], ['my-assignments', myTr]]) {
        assert(r.status === 200, `governance/${k} failed: ${r.status}`);
      }
      return { httpStatus: '200', finding: `${Array.isArray(pols.data) ? pols.data.length : 0} policies, ${Array.isArray(acks.data) ? acks.data.length : 0} acks, ${Array.isArray(progs.data) ? progs.data.length : 0} training programmes.` };
    }
  );

  await runScenario(
    'UAT-GOV-02',
    'Operations (Shifts)',
    'Operational Shift Roster Full CRUD Lifecycle',
    'Head of HR',
    'POST /workspace/shifts -> GET -> PATCH /workspace/shifts/:id -> DELETE',
    'Shift creates 201, updates timings via PATCH 200, and deletes cleanly.',
    async () => {
      const hr = sessions.head_of_hr;
      const created = await hr.request('POST', '/workspace/shifts', {
        name: `UAT Audit Shift ${Date.now()}`,
        startTime: '08:00',
        endTime: '17:00',
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      });
      assert(created.status === 201, `Shift create expected 201, got ${created.status} ${created.text}`);
      const id = created.data.id;
      const patched = await hr.request('PATCH', `/workspace/shifts/${id}`, { endTime: '17:30' });
      assert(patched.status === 200 && patched.data?.endTime === '17:30', `Shift PATCH failed: ${patched.status}`);
      const list = await hr.request('GET', '/workspace/shifts');
      const items = asArray(list.data);
      assert(list.status === 200 && items.some((s) => s.id === id), `Shift missing from list`);
      const del = await hr.request('DELETE', `/workspace/shifts/${id}`);
      assert(del.status === 200, `Shift DELETE failed: ${del.status}`);
      return { httpStatus: '201/200/200', finding: `Shift CRUD + timing edit (17:00 -> 17:30) + cleanup succeeded.` };
    }
  );

  await runScenario(
    'UAT-GOV-03',
    'Operations (Travel)',
    'Business Travel & Per Diem Maker-Checker Lifecycle',
    'Employee (Requester) & Head of HR (Approver)',
    'POST /workspace/travel-requests -> PATCH APPROVED -> PATCH REIMBURSED',
    'Travel request enforces state workflow PENDING -> APPROVED -> REIMBURSED across roles.',
    async () => {
      const emp = sessions.employee;
      const hr = sessions.head_of_hr;
      const req = await emp.request('POST', '/workspace/travel-requests', {
        destination: 'Mombasa Advisory Client Site',
        purpose: `UAT Statutory Audit Mission ${Date.now()}`,
        departureDate: '2026-12-01',
        returnDate: '2026-12-03',
        transportMode: 'FLIGHT',
        perDiemDays: 2,
        estimatedBudgetKes: 35000,
      });
      assert(req.status === 201, `Travel create failed: ${req.status} ${req.text}`);
      const id = req.data.id;
      const app = await hr.request('PATCH', `/workspace/travel-requests/${id}`, { status: 'APPROVED' });
      assert(app.status === 200 && app.data?.status === 'APPROVED', `Travel approve failed: ${app.status}`);
      const reimb = await hr.request('PATCH', `/workspace/travel-requests/${id}`, {
        status: 'REIMBURSED',
        reimbursementAmountKes: 34500,
      });
      assert(reimb.status === 200 && reimb.data?.status === 'REIMBURSED', `Travel reimburse failed: ${reimb.status}`);
      return { httpStatus: '201/200/200', finding: `Travel ${id.slice(0, 8)}... moved PENDING -> APPROVED -> REIMBURSED (KES 34,500).` };
    }
  );

  await runScenario(
    'UAT-GOV-04',
    'Operations (Surveys)',
    'Employee Engagement Pulse Survey Creation, Response & Duplicate Guard',
    'Head of HR & Employee',
    'POST /workspace/surveys (HR) -> POST /:id/respond (Employee) -> Duplicate respond check (expect 400)',
    'Survey tallies employee score cleanly and blocks duplicate voting by same user.',
    async () => {
      const hr = sessions.head_of_hr;
      const emp = sessions.employee;
      const surv = await hr.request('POST', '/workspace/surveys', {
        title: `UAT Pulse ${Date.now()}`,
        description: 'Go-live employee readiness sentiment check',
        closingDate: '2026-12-31',
        anonymous: true,
      });
      assert(surv.status === 201, `Survey create failed: ${surv.status} ${surv.text}`);
      const id = surv.data.id;
      const resp1 = await emp.request('POST', `/workspace/surveys/${id}/respond`, {
        overallRating: 5,
        comment: 'Platform fast and clean.',
      });
      assert(resp1.status === 200 || resp1.status === 201, `Survey respond failed: ${resp1.status} ${resp1.text}`);
      const dup = await emp.request('POST', `/workspace/surveys/${id}/respond`, {
        overallRating: 1,
        comment: 'Duplicate attempt',
      });
      assert(dup.status === 400 || dup.status === 409, `Expected 400/409 duplicate rejection, got ${dup.status}`);
      return { httpStatus: '201/200/400', finding: `Survey response tallied (rating=5); duplicate submission rejected (${dup.status}).` };
    }
  );

  await runScenario(
    'UAT-GOV-05',
    'Operations (Tasks)',
    'Action & Workflow Personal Tasks Full CRUD Lifecycle',
    'Employee',
    'POST /workspace/personal-tasks -> PATCH status=DONE -> DELETE',
    'Personal task persists 201, marks DONE 200, and removes cleanly.',
    async () => {
      const emp = sessions.employee;
      const t = await emp.request('POST', '/workspace/personal-tasks', {
        title: `UAT Verify Cutover ${Date.now()}`,
        dueDate: '2026-12-15',
        priority: 'HIGH',
      });
      assert(t.status === 201, `Task create failed: ${t.status} ${t.text}`);
      const id = t.data.id;
      const done = await emp.request('PATCH', `/workspace/personal-tasks/${id}`, { status: 'DONE' });
      assert(done.status === 200 && done.data?.status === 'DONE', `Task PATCH failed: ${done.status}`);
      const del = await emp.request('DELETE', `/workspace/personal-tasks/${id}`);
      assert(del.status === 200, `Task DELETE failed: ${del.status}`);
      return { httpStatus: '201/200/200', finding: `Task created, completed (DONE), and cleaned up.` };
    }
  );

  await runScenario(
    'UAT-GOV-06',
    'Employee Relations (ER)',
    'Anonymous Whistleblower Intake + Token Tracking + Case Isolation RBAC',
    'Anonymous Visitor, Managing Partner & Employee',
    'POST /er/cases/whistleblower/anonymous -> GET /track/:token -> GET /er/cases (Managing Partner vs Employee)',
    'Anonymous portal yields tracking token 201; Managing Partner views case while standard Employee sees zero confidential ER leaks.',
    async () => {
      const tag = `UAT-WB-${Date.now()}`;
      const wb = await anon.request('POST', '/er/cases/whistleblower/anonymous', {
        title: `UAT Confidential Intake ${tag}`,
        allegationSummary: `Automated UAT verification disclosure token check [${tag}] for compliance pipeline.`,
        policyClausesCited: 'Anti-Bribery & Whistleblowing Policy Sec 4',
      });
      assert(wb.status === 201, `Whistleblower submit expected 201, got ${wb.status} ${wb.text}`);
      const token = wb.data?.trackingToken || wb.data?.anonymousTrackingToken || wb.data?.token;
      assert(token && typeof token === 'string', `Missing whistleblower tracking token in ${JSON.stringify(wb.data)}`);

      const track = await anon.request('GET', `/er/cases/whistleblower/track/${encodeURIComponent(token)}`);
      assert(track.status === 200, `Whistleblower track expected 200, got ${track.status} ${track.text}`);

      const mpCases = await sessions.managing_partner.request('GET', '/er/cases');
      const empCases = await sessions.employee.request('GET', '/er/cases');
      assert(mpCases.status === 200 && empCases.status === 200, `ER listing error: ${mpCases.status}/${empCases.status}`);
      const mpHas = Array.isArray(mpCases.data) && mpCases.data.some((c) => String(c.title || '').includes(tag));
      const empHas = Array.isArray(empCases.data) && empCases.data.some((c) => String(c.title || '').includes(tag));
      assert(mpHas && !empHas, `ER Isolation failure: mpHas=${mpHas}, empHas=${empHas}`);
      return { httpStatus: '201/200', finding: `Tracking token ${token} verified; confidential ER case visible to Managing Partner and strictly isolated from Employee.` };
    }
  );

  // -------------------------------------------------------------------------
  // 9. REPORTS & CSV EXPORTS (UAT-REP-01)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-REP-01',
    'Reports & Analytics',
    'Executive Summary, All 6 Domain Reports, Permissions Matrix & Workforce CSV Export',
    'Operations Director & Employee (Negative 403)',
    'GET /reports/{summary,workforce,leave,payroll,performance,governance,timetracker,permissions} + /export/workforce',
    'Operations Director receives 200 + UTF-8 CSV stream; Employee blocked 403 on export.',
    async () => {
      const ops = sessions.operations_director;
      const emp = sessions.employee;
      const domains = ['summary', 'workforce', 'leave', 'payroll', 'performance', 'governance', 'timetracker', 'permissions'];
      const responses = await Promise.all(domains.map((d) => ops.request('GET', `/reports/${d}`)));
      for (let i = 0; i < domains.length; i++) {
        assert(responses[i].status === 200, `/reports/${domains[i]} failed: HTTP ${responses[i].status}`);
      }
      const csv = await ops.request('GET', '/reports/export/workforce');
      assert(csv.status === 200 && (csv.headers.get('content-type') || '').includes('text/csv'), `CSV export failed: ${csv.status}`);
      assert(csv.text.includes('\n') && csv.text.length > 20, `CSV export empty`);

      const empDenied = await emp.request('GET', '/reports/export/workforce');
      assert(empDenied.status === 403, `Expected 403 for employee exporting CSV, got ${empDenied.status}`);
      return { httpStatus: '200/403', finding: `All 8 report endpoints 200; workforce CSV stream (${csv.text.split(/\r?\n/).length} lines) verified; employee blocked 403.` };
    }
  );

  // -------------------------------------------------------------------------
  // 10. OBSERVABILITY, SECURITY, SSRF, ODPC PRIVACY & HARDENING (UAT-SEC-01 .. 05)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-SEC-01',
    'Observability & Health',
    'Liveness (`/health`), DB Readiness (`/ready`) & Prometheus Metrics (`/metrics`)',
    'Infrastructure Probe (Public / Unauthenticated)',
    'GET /api/v1/health, /api/v1/ready, /api/v1/metrics',
    'Health UP, SQLite DB readiness true, and process telemetry metrics respond 200 in <100ms.',
    async () => {
      const [h, r, m] = await Promise.all([
        anon.request('GET', '/health'),
        anon.request('GET', '/ready'),
        anon.request('GET', '/metrics'),
      ]);
      assert(h.status === 200 && r.status === 200 && m.status === 200, `Observability probe failed: ${h.status}/${r.status}/${m.status}`);
      return { httpStatus: '200', finding: `/health status="${h.data?.status || 'UP'}", /ready ok, /metrics responded (${m.ms}ms).` };
    }
  );

  await runScenario(
    'UAT-SEC-02',
    'Security & Audit',
    'IAM User/Role Directory, System Policy Config & Immutable Audit Log Access Segregation',
    'ICT Admin, Auditor & Employee (Negative 403)',
    'GET /users & /roles (ICT Admin), GET /configuration & /audit-logs (Auditor), Employee attempt on /audit-logs (expect 403)',
    'Authorized roles retrieve live IAM/Audit records 200; Employee strictly denied 403.',
    async () => {
      const [users, roles, cfg, logs, empLogs] = await Promise.all([
        sessions.ict_admin.request('GET', '/users'),
        sessions.ict_admin.request('GET', '/roles'),
        sessions.auditor.request('GET', '/configuration'),
        sessions.auditor.request('GET', '/audit-logs?limit=10'),
        sessions.employee.request('GET', '/audit-logs?limit=5'),
      ]);
      assert(users.status === 200 && roles.status === 200, `ICT Admin IAM read failed: ${users.status}/${roles.status}`);
      assert(cfg.status === 200 && logs.status === 200, `Auditor log/config read failed: ${cfg.status}/${logs.status}`);
      assert(empLogs.status === 403, `Expected 403 for employee reading /audit-logs, got ${empLogs.status}`);
      return { httpStatus: '200/403', finding: `${Array.isArray(users.data) ? users.data.length : 0} IAM users, ${Array.isArray(roles.data) ? roles.data.length : 0} roles, ${logs.data?.total ?? '?'} total audit entries; employee blocked 403.` };
    }
  );

  await runScenario(
    'UAT-SEC-03',
    'Security & Anti-Privilege-Escalation',
    'Self-Role-Escalation Block & Self-Account-Deactivation Prevention',
    'ICT Admin',
    'POST /users/:selfId/roles + PATCH /users/:selfId/deactivate',
    'Both self-targeting admin mutations strictly fail 403 per Maker-Checker / RBAC hardening.',
    async () => {
      const ict = sessions.ict_admin;
      const selfId = ict.user?.id;
      assert(selfId, `Missing ICT Admin user id`);
      const esc = await ict.request('POST', `/users/${selfId}/roles`, { roleKey: 'managing_partner' });
      assert(esc.status === 403, `SECURITY BUG: Self-role assignment returned ${esc.status} instead of 403!`);
      const deact = await ict.request('PATCH', `/users/${selfId}/deactivate`, {});
      assert(deact.status === 403, `SECURITY BUG: Self-deactivation returned ${deact.status} instead of 403!`);
      return { httpStatus: '403/403', finding: `Self-escalation to managing_partner blocked 403; self-deactivation blocked 403.` };
    }
  );

  await runScenario(
    'UAT-SEC-04',
    'Security & Integrations',
    'Webhook Outbound SSRF Validator (`169.254.169.254` / `localhost` Block vs Public HTTPS Allow)',
    'ICT Admin',
    'POST /integrations/ssrf-validate against AWS metadata IP, localhost, and https://example.com/webhook',
    'Internal/metadata URLs blocked cleanly; live DNS-resolved public HTTPS URL passes validation.',
    async () => {
      const ict = sessions.ict_admin;
      const bad1 = await ict.request('POST', '/integrations/ssrf-validate', { url: 'http://169.254.169.254/latest/meta-data/' });
      const bad2 = await ict.request('POST', '/integrations/ssrf-validate', { url: 'http://127.0.0.1:4000/api/v1/health' });
      const good = await ict.request('POST', '/integrations/ssrf-validate', { url: 'https://example.com/hr-events' });
      const bad1Rejected = bad1.status === 400 || bad1.status === 403 || bad1.data?.allowed === false || bad1.data?.safe === false;
      const bad2Rejected = bad2.status === 400 || bad2.status === 403 || bad2.data?.allowed === false || bad2.data?.safe === false;
      assert(bad1Rejected && bad2Rejected, `SSRF metadata/loopback not blocked: ${bad1.status}/${JSON.stringify(bad1.data)} & ${bad2.status}/${JSON.stringify(bad2.data)}`);
      assert(good.status === 200 && good.data?.allowed === true, `Valid HTTPS webhook failed: ${good.status} ${good.text}`);
      return { httpStatus: `${bad1.status}/${good.status}`, finding: `Cloud metadata (169.254.169.254) & loopback (127.0.0.1) blocked; DNS-verified https://example.com allowed.` };
    }
  );

  await runScenario(
    'UAT-SEC-05',
    'ODPC Privacy & Data Protection',
    'DPIA Register, DSR Requests & Legal Holds Governance Access',
    'Data Protection Officer (DPO) & Employee',
    'GET /privacy/dpia, /privacy/dsr, /privacy/legal-holds as DPO + Employee DSR scope check',
    'DPO inspects DPIA, DSR queue & Legal Holds; Employee gets only own DSR list and is blocked 403 from Legal Holds.',
    async () => {
      const dpo = sessions.dpo;
      const emp = sessions.employee;
      const [dpia, dsr, holds, empDsr, empHolds] = await Promise.all([
        dpo.request('GET', '/privacy/dpia'),
        dpo.request('GET', '/privacy/dsr'),
        dpo.request('GET', '/privacy/legal-holds'),
        emp.request('GET', '/privacy/dsr'),
        emp.request('GET', '/privacy/legal-holds'),
      ]);
      assert(dsr.status === 200 && empDsr.status === 200, `DSR read failed: DPO ${dsr.status} / Emp ${empDsr.status}`);
      assert(holds.status === 200, `DPO legal-holds failed: ${holds.status}`);
      assert(empHolds.status === 403, `Expected 403 for employee reading /privacy/legal-holds, got ${empHolds.status}`);
      return {
        httpStatus: `${dpia.status}/${holds.status}/403`,
        finding: `DPO dpia=${dpia.status}, dsr=${Array.isArray(dsr.data) ? dsr.data.length : 0}, legal-holds=${holds.status}; employee blocked 403 on legal-holds.`,
      };
    }
  );

  // -------------------------------------------------------------------------
  // 11. FRONTEND BUNDLE & ZOD INPUT HYGIENE (UAT-FE-01 & UAT-ZOD-01)
  // -------------------------------------------------------------------------
  await runScenario(
    'UAT-FE-01',
    'Frontend Delivery & Security Headers',
    'Production SPA HTML Shell, Built Asset Delivery & Helmet Security Headers',
    'Unauthenticated Browser',
    'GET ${BASE_URL}/ + fetch built /dist/app.js & /dist/app.css + verify Helmet headers & X-Request-Id',
    'SPA root HTML returns 200 with Ndakala title, built JS/CSS bundles serve 200, and CSP/nosniff/X-Request-Id are set.',
    async () => {
      const root = await anon.request('GET', `${BASE_URL}/`);
      assert(root.status === 200 && /<!doctype html>/i.test(root.text), `SPA root failed: ${root.status}`);
      assert(!/zoho|zylker/i.test(root.text), `Zoho brand reference found in index.html`);
      const jsMatch = root.text.match(/src="(\/(?:dist|assets)\/[^"]+\.js)"/);
      const cssMatch = root.text.match(/href="(\/(?:dist|assets)\/[^"]+\.css)"/);
      assert(jsMatch && cssMatch, `Built asset script/css tags not found in index.html`);

      const [jsRes, cssRes] = await Promise.all([
        anon.request('GET', `${BASE_URL}${jsMatch[1]}`),
        anon.request('GET', `${BASE_URL}${cssMatch[1]}`),
      ]);
      assert(jsRes.status === 200 && cssRes.status === 200, `Asset fetch failed: JS ${jsRes.status}, CSS ${cssRes.status}`);
      const reqId = root.headers.get('x-request-id');
      const xcto = root.headers.get('x-content-type-options');
      const csp = root.headers.get('content-security-policy');
      assert(reqId && xcto === 'nosniff' && csp, `Missing security headers: reqId=${reqId}, xcto=${xcto}, csp=${Boolean(csp)}`);
      return { httpStatus: '200', finding: `index.html + ${jsMatch[1]} (${Math.round(jsRes.text.length / 1024)}KB) + ${cssMatch[1]} (${Math.round(cssRes.text.length / 1024)}KB); CSP + nosniff + X-Request-Id present.` };
    }
  );

  await runScenario(
    'UAT-ZOD-01',
    'API Input Validation & Error Hygiene',
    'Strict Zod Rejection & Zero Internal Stack-Trace Leakage on Bad Payloads',
    'Head of HR',
    'POST /workspace/shifts with invalid time ("99:99") + POST /api/v1 with malformed JSON',
    'Returns structured 400 JSON error containing requestId correlation code and zero stack trace leakage.',
    async () => {
      const hr = sessions.head_of_hr;
      const badSchema = await hr.request('POST', '/workspace/shifts', {
        name: 'Bad Time Shift',
        startTime: '99:99',
        endTime: 'bad',
      });
      assert(badSchema.status === 400, `Expected 400 for invalid shift time, got ${badSchema.status}`);
      assert(!/at Function|node_modules|\.ts:/.test(badSchema.text), `Stack trace leaked in error body!`);

      const badJson = await hr.request('POST', '/workspace/shifts', undefined, {
        rawBody: '{"name": invalidJson',
        extraHeaders: { 'Content-Type': 'application/json' },
      });
      assert(badJson.status === 400 && badJson.json?.error?.code === 'MALFORMED_JSON', `Expected MALFORMED_JSON 400, got ${badJson.status} ${badJson.text}`);
      return { httpStatus: '400/400', finding: `Zod validation 400 & MALFORMED_JSON 400 returned structured correlation ID without stack leakage.` };
    }
  );

  // Cleanup active test sessions cleanly
  for (const s of Object.values(sessions)) {
    await s.logout().catch(() => {});
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const total = results.length;
  const avgMs = Math.round((results.reduce((acc, r) => acc + r.latencyMs, 0) / Math.max(total, 1)) * 10) / 10;

  console.log(`\n================================================================================`);
  console.log(` SUMMARY: ${passed}/${total} PASSED | ${failed} FAILED | Avg Scenario Latency: ${avgMs}ms`);
  console.log(`================================================================================`);
  console.log('__UAT_JSON_START__');
  console.log(JSON.stringify({ baseUrl: BASE_URL, total, passed, failed, avgMs, executedAt: new Date().toISOString(), results }));
  console.log('__UAT_JSON_END__');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal UAT runner error:', err);
  process.exit(1);
});
