import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Shield,
  Sliders,
  Globe,
  Lock,
  Activity,
  Download,
  RefreshCw,
  CheckCircle,
  Ban,
  Plus,
  Send,
  Search,
} from './Icons';
import { apiGet, apiPost, apiPatch, apiPut, apiDownload, unwrapList } from '../utils/api';

/**
 * Enterprise Hardening & Administration Sub-Panels for Organization Settings.
 * Connects Users/RBAC, Layered Policy Maker-Checker, Integrations/SIEM/Bank-EFT,
 * Kenya DPA 2019 Privacy & Legal Holds, and System Health/Metrics/Audit Logs.
 */
export default function OrgAdminEnterprisePanels({
  orgTab,
  employees = [],
  onRefreshAll,
  onShowToast,
}) {
  // Users & Roles
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [roleDraft, setRoleDraft] = useState({});

  // Policy Engine
  const [policies, setPolicies] = useState([]);
  const [newPolicy, setNewPolicy] = useState({
    code: 'LEAVE_POLICY_STD',
    title: 'Standard Annual Leave Configuration',
    layer: 'ORGANISATION',
    sourceReference: 'Employment Act Cap 226 §28',
    owner: 'HR Lead',
    effectiveFrom: new Date().toISOString().slice(0, 16),
    valuesJson: '{\n  "annualDays": 21,\n  "carryOverCap": 10\n}',
  });
  const [previewCode, setPreviewCode] = useState('LEAVE_POLICY_STD');
  const [previewResult, setPreviewResult] = useState(null);

  // Integrations, SSRF, SIEM, Bank EFT & Webhooks
  const [profiles, setProfiles] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [integrationLogs, setIntegrationLogs] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [ssrfUrl, setSsrfUrl] = useState('https://api.safaricom.co.ke/webhooks/ndakala');
  const [ssrfResult, setSsrfResult] = useState(null);
  const [eftForm, setEftForm] = useState({
    payrollRunId: '',
    bankFormat: 'KENYA_KBA_EFT',
    sourceAccount: '0110099887766',
    valueDate: new Date().toISOString().slice(0, 10),
  });
  const [eftResult, setEftResult] = useState(null);
  const [providerForm, setProviderForm] = useState({
    provider: 'LMS_CORNERSTONE',
    status: 'TESTING',
    isEnabled: true,
    outboundUrl: 'https://lms.ndakala.co.ke/hooks',
  });

  // Microsoft 365 App-Only Config & Cold Storage Archive Settings
  const [m365Form, setM365Form] = useState({
    status: 'ACTIVE',
    tenantId: '',
    clientId: '',
    clientSecret: '',
    sharepointSiteUrl: '',
    senderMailbox: '',
    appBaseUrl: typeof window !== 'undefined' ? window.location.origin : 'https://ndakalahr.duckdns.org',
    hasClientSecret: false,
  });
  const [m365TestMailbox, setM365TestMailbox] = useState('');
  const [m365TestResult, setM365TestResult] = useState(null);
  const [coldArchiveCfg, setColdArchiveCfg] = useState({ coldArchiveEnabled: false, coldArchiveMonths: 6 });
  const [coldArchiveReport, setColdArchiveReport] = useState(null);

  // Privacy DPA 2019
  const [dpias, setDpias] = useState([]);
  const [dsrs, setDsrs] = useState([]);
  const [legalHolds, setLegalHolds] = useState([]);
  const [dsrForm, setDsrForm] = useState({
    employeeId: '',
    requestType: 'ACCESS',
    lawfulJustification: 'DPA 2019 Section 26 Data Subject Right of Access',
    requesterEmail: '',
    details: '',
  });
  const [holdForm, setHoldForm] = useState({
    employeeId: '',
    matterTitle: '',
    reasonCategory: 'REGULATORY',
    notes: '',
  });

  // System Metrics & Audit Logs
  const [health, setHealth] = useState(null);
  const [ready, setReady] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');

  const toast = (msg, type = 'success') => onShowToast && onShowToast(msg, type);

  const loadPanelData = useCallback(async () => {
    try {
      if (orgTab === 'users') {
        const [u, r] = await Promise.all([apiGet('/api/v1/users'), apiGet('/api/v1/roles')]);
        setUsers(unwrapList(u));
        setRoles(unwrapList(r));
      } else if (orgTab === 'policyengine') {
        const c = await apiGet('/api/v1/configuration');
        setPolicies(unwrapList(c));
      } else if (orgTab === 'integrations') {
        const [p, cfg, logs, runs, m365Cfg, orgRec] = await Promise.all([
          apiGet('/api/v1/integrations/profiles').catch(() => []),
          apiGet('/api/v1/integrations/configs').catch(() => []),
          apiGet('/api/v1/integrations/logs').catch(() => []),
          apiGet('/api/v1/payroll/runs').catch(() => []),
          apiGet('/api/v1/integrations/configs/MICROSOFT_365').catch(() => null),
          apiGet('/api/v1/organisation').catch(() => null),
        ]);
        setProfiles(unwrapList(p));
        setConfigs(unwrapList(cfg));
        setIntegrationLogs(unwrapList(logs));
        const runItems = unwrapList(runs);
        setPayrollRuns(runItems);
        if (runItems[0] && !eftForm.payrollRunId) {
          setEftForm((prev) => ({ ...prev, payrollRunId: runItems[0].id }));
        }
        const orgDomain = (orgRec?.email && orgRec.email.includes('@'))
          ? orgRec.email.split('@')[1]
          : (orgRec?.website ? orgRec.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] : 'company.com');

        if (m365Cfg?.settingsSummary) {
          setM365Form((prev) => ({
            ...prev,
            status: m365Cfg.status || 'DISABLED',
            tenantId: m365Cfg.settingsSummary.tenantId || '',
            clientId: m365Cfg.settingsSummary.clientId || '',
            sharepointSiteUrl: m365Cfg.settingsSummary.sharepointSiteUrl || prev.sharepointSiteUrl || `https://${orgDomain.split('.')[0]}.sharepoint.com/sites/HRVault`,
            senderMailbox: m365Cfg.settingsSummary.senderMailbox || `noreply@${orgDomain}`,
            appBaseUrl: m365Cfg.settingsSummary.appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://ndakalahr.duckdns.org'),
            hasClientSecret: Boolean(m365Cfg.settingsSummary.hasClientSecret),
            clientSecret: '',
          }));
        } else {
          setM365Form((prev) => ({
            ...prev,
            senderMailbox: prev.senderMailbox || `noreply@${orgDomain}`,
            sharepointSiteUrl: prev.sharepointSiteUrl || `https://${orgDomain.split('.')[0]}.sharepoint.com/sites/HRVault`,
          }));
        }
        setM365TestMailbox((prev) => prev || `audit@${orgDomain}`);
        if (orgRec) {
          setColdArchiveCfg({
            coldArchiveEnabled: Boolean(orgRec.coldArchiveEnabled),
            coldArchiveMonths: Number(orgRec.coldArchiveMonths) || 6,
          });
        }
      } else if (orgTab === 'privacy') {
        const [dp, ds, lh] = await Promise.all([
          apiGet('/api/v1/privacy/dpia').catch(() => []),
          apiGet('/api/v1/privacy/dsr').catch(() => []),
          apiGet('/api/v1/privacy/legal-holds').catch(() => []),
        ]);
        setDpias(unwrapList(dp));
        setDsrs(unwrapList(ds));
        setLegalHolds(unwrapList(lh));
        if (employees[0] && !dsrForm.employeeId) {
          setDsrForm((prev) => ({
            ...prev,
            employeeId: employees[0].id,
            requesterEmail: employees[0].workEmail || '',
          }));
          setHoldForm((prev) => ({ ...prev, employeeId: employees[0].id }));
        }
      } else if (orgTab === 'systemaudit') {
        const [h, rd, m, al] = await Promise.all([
          apiGet('/api/v1/health').catch(() => null),
          apiGet('/api/v1/ready').catch(() => null),
          apiGet('/api/v1/metrics').catch(() => null),
          apiGet('/api/v1/audit-logs?limit=50').catch(() => []),
        ]);
        setHealth(h);
        setReady(rd);
        setMetrics(m);
        setAuditLogs(unwrapList(al));
      }
    } catch (err) {
      toast(err.message || 'Failed to load admin data', 'error');
    }
  }, [orgTab, employees]);

  useEffect(() => {
    loadPanelData();
  }, [loadPanelData]);

  // --- USERS & RBAC ---
  if (orgTab === 'users') {
    const handleCreateUser = async (e) => {
      e.preventDefault();
      try {
        await apiPost('/api/v1/users', newUser);
        setNewUser({ name: '', email: '', password: '' });
        toast('User account created.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleAssignRole = async (userId) => {
      const roleKey = roleDraft[userId];
      if (!roleKey) return toast('Select a role first.', 'warning');
      try {
        await apiPost(`/api/v1/users/${userId}/roles`, { roleKey });
        toast(`Role '${roleKey}' assigned.`);
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleDeactivateUser = async (userId) => {
      try {
        await apiPatch(`/api/v1/users/${userId}/deactivate`, {});
        toast('User deactivated and sessions revoked.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    return (
      <div className="space-y-4 max-w-5xl">
        <div className="bg-white rounded-md border border-slate-200 p-5">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <Users size={15} className="text-[#0088ff]" />
            <span>Provision Platform User</span>
          </h4>
          <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              required
              placeholder="Full Name"
              value={newUser.name}
              onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <input
              type="email"
              required
              placeholder="Work Email"
              value={newUser.email}
              onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <input
              type="password"
              required
              placeholder="Strong Password (8+ chars, Upper, Num, Sym)"
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded flex items-center justify-center gap-1.5"
            >
              <Plus size={14} /> Create User
            </button>
          </form>
        </div>

        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-800">
              Identity Directory & RBAC Assignments ({users.length})
            </span>
            <span className="text-[11px] text-slate-500">
              {roles.length} system roles active (Separation of Duties enforced)
            </span>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4">User</th>
                <th className="py-2.5 px-4">Status / MFA</th>
                <th className="py-2.5 px-4">Assigned Roles</th>
                <th className="py-2.5 px-4">Assign Role & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4">
                    <p className="font-semibold text-slate-800">{u.name || u.fullName}</p>
                    <p className="text-[11px] text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        u.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {u.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                    {u.mfaEnabled && (
                      <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] bg-blue-50 text-[#0088ff] font-semibold">
                        MFA
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(u.userRoles || u.roles || []).map((ur, i) => {
                        const code = typeof ur === 'string' ? ur : ur.role?.key || ur.role?.name || ur.roleKey;
                        return (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                            {code}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={roleDraft[u.id] || ''}
                        onChange={(e) => setRoleDraft({ ...roleDraft, [u.id]: e.target.value })}
                        className="px-2 py-1 border border-slate-300 rounded bg-white text-[11px]"
                      >
                        <option value="">Select role...</option>
                        {roles.map((r) => (
                          <option key={r.id} value={r.key}>
                            {r.name} ({r.key})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAssignRole(u.id)}
                        className="px-2.5 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                      >
                        Assign
                      </button>
                      {u.isActive !== false && (
                        <button
                          type="button"
                          onClick={() => handleDeactivateUser(u.id)}
                          className="px-2.5 py-1 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded text-[11px]"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- LAYERED POLICY ENGINE ---
  if (orgTab === 'policyengine') {
    const handleCreateConfig = async (e) => {
      e.preventDefault();
      try {
        const parsedValues = JSON.parse(newPolicy.valuesJson || '{}');
        await apiPost('/api/v1/configuration', {
          code: newPolicy.code,
          title: newPolicy.title,
          layer: newPolicy.layer,
          sourceReference: newPolicy.sourceReference,
          owner: newPolicy.owner,
          effectiveFrom: new Date(newPolicy.effectiveFrom).toISOString(),
          values: parsedValues,
        });
        toast('Policy configuration draft saved.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSubmitConfig = async (id) => {
      try {
        await apiPost(`/api/v1/configuration/${id}/submit`, {});
        toast('Policy configuration submitted for Checker approval.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleApproveConfig = async (id) => {
      try {
        await apiPost(`/api/v1/configuration/${id}/approve`, {});
        toast('Policy configuration approved and activated.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handlePreview = async () => {
      try {
        const res = await apiPost('/api/v1/configuration/preview', { code: previewCode });
        setPreviewResult(res);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    return (
      <div className="space-y-4 max-w-5xl">
        <div className="bg-white rounded-md border border-slate-200 p-5">
          <h4 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <Sliders size={15} className="text-[#0088ff]" />
            <span>Create Layered Policy Rule (Maker-Checker Workflow)</span>
          </h4>
          <form onSubmit={handleCreateConfig} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="Policy Code (e.g. STATUTORY_SHIF)"
              value={newPolicy.code}
              onChange={(e) => setNewPolicy({ ...newPolicy, code: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <input
              type="text"
              required
              placeholder="Title"
              value={newPolicy.title}
              onChange={(e) => setNewPolicy({ ...newPolicy, title: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <select
              value={newPolicy.layer}
              onChange={(e) => setNewPolicy({ ...newPolicy, layer: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded bg-white"
            >
              {['STATUTORY', 'ORGANISATION', 'LOCATION', 'DEPARTMENT', 'EXCEPTION'].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Legal / Statutory Source Reference"
              value={newPolicy.sourceReference}
              onChange={(e) => setNewPolicy({ ...newPolicy, sourceReference: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <input
              type="text"
              required
              placeholder="Policy Owner"
              value={newPolicy.owner}
              onChange={(e) => setNewPolicy({ ...newPolicy, owner: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <input
              type="datetime-local"
              required
              value={newPolicy.effectiveFrom}
              onChange={(e) => setNewPolicy({ ...newPolicy, effectiveFrom: e.target.value })}
              className="px-3 py-2 border border-slate-300 rounded"
            />
            <textarea
              rows={2}
              value={newPolicy.valuesJson}
              onChange={(e) => setNewPolicy({ ...newPolicy, valuesJson: e.target.value })}
              className="md:col-span-2 px-3 py-2 border border-slate-300 rounded font-mono text-[11px]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#0088ff] text-white font-medium rounded h-fit self-end"
            >
              Save Draft Policy
            </button>
          </form>
        </div>

        <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">Effective Precedence Resolver:</span>
          <input
            type="text"
            value={previewCode}
            onChange={(e) => setPreviewCode(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded"
          />
          <button
            type="button"
            onClick={handlePreview}
            className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
          >
            Preview Effective Layer
          </button>
          {previewResult && (
            <pre className="w-full bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] overflow-x-auto">
              {JSON.stringify(previewResult, null, 2)}
            </pre>
          )}
        </div>

        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4">Code / Layer</th>
                <th className="py-2.5 px-4">Title & Legal Ref</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Workflow Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {policies.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4">
                    <span className="font-mono font-semibold text-slate-800">{p.code}</span>
                    <span className="block text-[10px] text-[#0088ff] font-semibold">{p.layer} v{p.version}</span>
                  </td>
                  <td className="py-2.5 px-4">
                    <p className="font-medium text-slate-800">{p.title}</p>
                    <p className="text-[11px] text-slate-500">{p.sourceReference}</p>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                      {p.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 flex gap-2">
                    {p.status === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => handleSubmitConfig(p.id)}
                        className="px-2.5 py-1 bg-amber-500 text-white rounded text-[11px]"
                      >
                        Submit for Approval
                      </button>
                    )}
                    {p.status === 'SUBMITTED' && (
                      <button
                        type="button"
                        onClick={() => handleApproveConfig(p.id)}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                      >
                        Approve (Checker)
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // --- INTEGRATIONS, SSRF, SIEM & BANK EFT ---
  if (orgTab === 'integrations') {
    const handleSaveProvider = async (e) => {
      e.preventDefault();
      try {
        await apiPut(`/api/v1/integrations/configs/${providerForm.provider}`, {
          status: providerForm.status,
          isEnabled: providerForm.isEnabled,
          outboundUrl: providerForm.outboundUrl,
        });
        toast(`Provider ${providerForm.provider} updated.`);
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleCheckSsrf = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/ssrf-validate', { url: ssrfUrl });
        setSsrfResult(res);
      } catch (err) {
        setSsrfResult({ safe: false, error: err.message });
      }
    };

    const handleTestSiem = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/siem/test', {
          severity: 'INFO',
          eventType: 'SECURITY_CONFIGURATION_PROBE',
        });
        toast(`SIEM probe emitted (${res.eventId || 'OK'}).`);
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleBankEft = async (e) => {
      e.preventDefault();
      try {
        const res = await apiPost('/api/v1/integrations/bank-eft/export', eftForm);
        setEftResult(res);
        toast('Bank EFT schedule generated.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleTriggerWebhook = async (type) => {
      try {
        const ts = new Date().toISOString();
        const evt = `EVT-${Date.now()}`;
        if (type === 'lms') {
          await apiPost('/api/v1/integrations/webhooks/lms', {
            eventId: evt,
            timestamp: ts,
            employeeReference: employees[0]?.employeeNumber || 'NDA-001',
            programCode: 'CYBER-2026',
            programTitle: 'ISO 27001 & DPA 2019 Compliance',
            completionDate: ts.slice(0, 10),
            scorePercentage: 95,
          });
        } else if (type === 'esignature') {
          await apiPost('/api/v1/integrations/webhooks/esignature', {
            eventId: evt,
            timestamp: ts,
            envelopeId: `ENV-${Date.now()}`,
            documentTitle: 'Employment Contract Renewal',
            signerEmail: employees[0]?.workEmail || 'employee@ndakala.co.ke',
            status: 'COMPLETED',
            signedAt: ts,
            documentSha256: 'e3b0c44298fc1c149afbf4c8996fb924',
          });
        } else {
          await apiPost('/api/v1/integrations/webhooks/ats', {
            eventId: evt,
            timestamp: ts,
            requisitionNumber: 'REQ-2026-01',
            candidateReference: 'CAND-104',
            candidateName: 'Grace Wanjiku',
            candidateEmail: 'grace.wanjiku@example.com',
            applicationDate: ts.slice(0, 10),
            currentStage: 'OFFER_ACCEPTED',
          });
        }
        toast(`Inbound ${type.toUpperCase()} webhook ingested cleanly.`);
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSaveM365 = async (e) => {
      e.preventDefault();
      try {
        await apiPut('/api/v1/integrations/configs/MICROSOFT_365', {
          status: m365Form.status,
          isEnabled: m365Form.status !== 'DISABLED',
          outboundUrl: m365Form.sharepointSiteUrl || undefined,
          configPayload: {
            tenantId: m365Form.tenantId.trim(),
            clientId: m365Form.clientId.trim(),
            ...(m365Form.clientSecret.trim() ? { clientSecret: m365Form.clientSecret.trim() } : {}),
            sharepointSiteUrl: m365Form.sharepointSiteUrl.trim(),
            senderMailbox: m365Form.senderMailbox.trim(),
            appBaseUrl: m365Form.appBaseUrl.trim(),
          },
        });
        toast('Microsoft 365 App-Only credentials encrypted & saved.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleTestM365Connection = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/test-connection', {});
        setM365TestResult(res);
        toast(res.connected ? 'Microsoft Graph App-Only connection verified!' : res.message || 'Not connected', res.connected ? 'success' : 'warning');
      } catch (err) {
        setM365TestResult({ connected: false, error: err.message });
        toast(err.message, 'error');
      }
    };

    const handleSendTestM365Mail = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/test-mail', { recipientMailbox: m365TestMailbox });
        setM365TestResult(res);
        toast(res.sent ? `Zero-PII link-only email sent to ${m365TestMailbox}` : res.reason || 'Mail dispatch skipped', res.sent ? 'success' : 'warning');
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSyncSharePoint = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/sync-sharepoint', {});
        setM365TestResult(res);
        toast(`SharePoint sync completed: ${res.syncedCount} synced, ${res.skippedCount} skipped.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSaveColdArchive = async (e) => {
      e.preventDefault();
      try {
        await apiPatch('/api/v1/organisation', {
          coldArchiveEnabled: coldArchiveCfg.coldArchiveEnabled,
          coldArchiveMonths: Number(coldArchiveCfg.coldArchiveMonths) || 6,
        });
        toast('Cold storage archival policy updated.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleRunColdArchiveNow = async () => {
      try {
        const res = await apiPost('/api/v1/files/cold-archive/run', {
          overrideMonths: Number(coldArchiveCfg.coldArchiveMonths) || 6,
          force: true,
        });
        setColdArchiveReport(res);
        toast(`Cold archive sweep checked ${res.checkedCount} doc(s), purged ${res.archivedCount} local copy/copies.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    return (
      <div className="space-y-4 max-w-5xl">
        {/* Microsoft 365 App-Only SharePoint, Outlook & Cold Storage Archive */}
        <div className="bg-white rounded-md border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                <Lock size={15} className="text-[#0088ff]" />
                <span>Microsoft 365 App-Only Integration (SharePoint, Outlook Mail & Shared Dept Calendars)</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Uses App-Only Client Credentials (Sites.Selected + Mail.Send + Calendars.ReadWrite). Staff log in strictly via personal email + TOTP MFA.
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
              m365Form.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}>
              Status: {m365Form.status}
            </span>
          </div>

          <form onSubmit={handleSaveM365} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Entra Directory (Tenant) ID</label>
              <input
                type="text"
                value={m365Form.tenantId}
                onChange={(e) => setM365Form({ ...m365Form, tenantId: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">App Registration (Client) ID</label>
              <input
                type="text"
                value={m365Form.clientId}
                onChange={(e) => setM365Form({ ...m365Form, clientId: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Client Secret {m365Form.hasClientSecret ? '(Encrypted in DB — leave blank to keep)' : ''}
              </label>
              <input
                type="password"
                value={m365Form.clientSecret}
                onChange={(e) => setM365Form({ ...m365Form, clientSecret: e.target.value })}
                placeholder={m365Form.hasClientSecret ? '•••••••• (saved encrypted)' : 'Paste Azure Client Secret'}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">SharePoint HR Site URL</label>
              <input
                type="url"
                value={m365Form.sharepointSiteUrl}
                onChange={(e) => setM365Form({ ...m365Form, sharepointSiteUrl: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Outlook Sender (Zero-PII Link Only)</label>
              <input
                type="email"
                value={m365Form.senderMailbox}
                onChange={(e) => setM365Form({ ...m365Form, senderMailbox: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Integration Mode</label>
              <select
                value={m365Form.status}
                onChange={(e) => setM365Form({ ...m365Form, status: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="ACTIVE">ACTIVE (Dual-Write & Link Alerts Live)</option>
                <option value="TESTING">TESTING (Staged)</option>
                <option value="DISABLED">DISABLED (Local AES-256 Vault Only)</option>
              </select>
            </div>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                Save M365 Credentials
              </button>
              <button type="button" onClick={handleTestM365Connection} className="px-3 py-1.5 border border-slate-300 rounded font-medium hover:bg-slate-50">
                Test App-Only Graph Connection
              </button>
              <button type="button" onClick={handleSyncSharePoint} className="px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded font-medium hover:bg-emerald-50">
                Sync Vault Files to SharePoint
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="email"
                  value={m365TestMailbox}
                  onChange={(e) => setM365TestMailbox(e.target.value)}
                  placeholder="recipient@company.com"
                  className="px-2.5 py-1 border border-slate-300 rounded w-52"
                />
                <button type="button" onClick={handleSendTestM365Mail} className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium">
                  Send Link-Only Test Mail
                </button>
              </div>
            </div>
          </form>

          {m365TestResult && (
            <pre className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] max-h-28 overflow-auto">
              {JSON.stringify(m365TestResult, null, 2)}
            </pre>
          )}

          {/* Cold Storage Archival Routine Setting */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={handleSaveColdArchive} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coldArchiveCfg.coldArchiveEnabled}
                  onChange={(e) => setColdArchiveCfg({ ...coldArchiveCfg, coldArchiveEnabled: e.target.checked })}
                />
                <span>Auto-Archive Cold Local Vault Files to SharePoint</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600">Retention Threshold (Months):</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={coldArchiveCfg.coldArchiveMonths}
                  onChange={(e) => setColdArchiveCfg({ ...coldArchiveCfg, coldArchiveMonths: Number(e.target.value) })}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-semibold"
                />
              </div>
              <button type="submit" className="px-3 py-1 bg-slate-700 text-white rounded font-medium">
                Save Retention
              </button>
            </form>
            <button
              type="button"
              onClick={handleRunColdArchiveNow}
              className="px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded font-medium"
            >
              Run Cold Archive Sweep Now
            </button>
          </div>
          {coldArchiveReport && (
            <pre className="bg-indigo-50/50 p-2.5 rounded border border-indigo-200 text-[11px] max-h-32 overflow-auto">
              {JSON.stringify(coldArchiveReport, null, 2)}
            </pre>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Globe size={15} className="text-[#0088ff]" />
              <span>Integration Gateway & Provider Config</span>
            </h4>
            <form onSubmit={handleSaveProvider} className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={providerForm.provider}
                  onChange={(e) => setProviderForm({ ...providerForm, provider: e.target.value })}
                  className="px-2.5 py-1.5 border border-slate-300 rounded"
                  placeholder="Provider key"
                />
                <select
                  value={providerForm.status}
                  onChange={(e) => setProviderForm({ ...providerForm, status: e.target.value })}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  {['ACTIVE', 'TESTING', 'DISABLED', 'SUSPENDED'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <input
                type="url"
                value={providerForm.outboundUrl}
                onChange={(e) => setProviderForm({ ...providerForm, outboundUrl: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                placeholder="Outbound Webhook HTTPS URL"
              />
              <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                Save Provider Config
              </button>
            </form>
            <div className="pt-2 border-t border-slate-100">
              <p className="font-medium text-slate-700 mb-1">Registered Profiles ({profiles.length}) & Configs ({configs.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {profiles.map((pr, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded text-[10px] font-semibold">
                    {pr.name || pr.provider || pr.code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800">SSRF Egress Guard & SIEM Security Probe</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={ssrfUrl}
                onChange={(e) => setSsrfUrl(e.target.value)}
                className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <button type="button" onClick={handleCheckSsrf} className="px-3 py-1.5 bg-slate-800 text-white rounded">
                Validate URL
              </button>
            </div>
            {ssrfResult && (
              <p className={`text-[11px] font-mono ${ssrfResult.safe === false ? 'text-rose-600' : 'text-emerald-700'}`}>
                {JSON.stringify(ssrfResult)}
              </p>
            )}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
              <button type="button" onClick={handleTestSiem} className="px-3 py-1.5 bg-emerald-600 text-white rounded">
                Send SIEM Probe
              </button>
              <button type="button" onClick={() => handleTriggerWebhook('lms')} className="px-2.5 py-1.5 border border-slate-300 rounded hover:bg-slate-50">
                Test LMS Webhook
              </button>
              <button type="button" onClick={() => handleTriggerWebhook('esignature')} className="px-2.5 py-1.5 border border-slate-300 rounded hover:bg-slate-50">
                Test E-Sign Webhook
              </button>
              <button type="button" onClick={() => handleTriggerWebhook('ats')} className="px-2.5 py-1.5 border border-slate-300 rounded hover:bg-slate-50">
                Test ATS Webhook
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
          <h4 className="font-semibold text-slate-800">Kenya KBA Bank EFT Payroll Export</h4>
          <form onSubmit={handleBankEft} className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
            <select
              value={eftForm.payrollRunId}
              onChange={(e) => setEftForm({ ...eftForm, payrollRunId: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="">Select Payroll Run...</option>
              {payrollRuns.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.periodName || r.payPeriod?.name || r.id.slice(0, 8)} ({r.status})
                </option>
              ))}
            </select>
            <select
              value={eftForm.bankFormat}
              onChange={(e) => setEftForm({ ...eftForm, bankFormat: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="KENYA_KBA_EFT">KENYA_KBA_EFT</option>
              <option value="STANDARD_CSV">STANDARD_CSV</option>
            </select>
            <input
              type="text"
              required
              value={eftForm.sourceAccount}
              onChange={(e) => setEftForm({ ...eftForm, sourceAccount: e.target.value })}
              placeholder="Source Account"
              className="px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <input
              type="date"
              required
              value={eftForm.valueDate}
              onChange={(e) => setEftForm({ ...eftForm, valueDate: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">
              Generate EFT Batch
            </button>
          </form>
          {eftResult && (
            <pre className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] max-h-36 overflow-auto">
              {JSON.stringify(eftResult, null, 2)}
            </pre>
          )}
        </div>

        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 font-semibold text-slate-800">
            Recent Integration & Webhook Logs ({integrationLogs.length})
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
            {integrationLogs.map((l, i) => (
              <div key={l.id || i} className="px-4 py-2 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700">{l.provider || l.eventType || l.direction}</span>
                <span className="text-slate-500">{l.status || l.outcome}</span>
              </div>
            ))}
            {integrationLogs.length === 0 && (
              <p className="p-4 text-center text-slate-400">No webhook execution events recorded yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- PRIVACY DPA 2019 & LEGAL HOLDS ---
  if (orgTab === 'privacy') {
    const handleCreateDsr = async (e) => {
      e.preventDefault();
      try {
        await apiPost('/api/v1/privacy/dsr', dsrForm);
        toast('Data Subject Request logged under Kenya DPA 2019.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleReviewDsr = async (id, action) => {
      try {
        await apiPost(`/api/v1/privacy/dsr/${id}/review`, { action });
        toast(`DSR ${action.toLowerCase()}d.`);
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleExportDsr = async (employeeId) => {
      try {
        await apiDownload(`/api/v1/privacy/dsr/export/${employeeId}`, `Ndakala_DPA_Export_${employeeId.slice(0, 8)}.json`);
        toast('Portable employee PII archive exported.');
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleApplyHold = async (e) => {
      e.preventDefault();
      try {
        await apiPost('/api/v1/privacy/legal-holds', holdForm);
        setHoldForm({ ...holdForm, matterTitle: '', notes: '' });
        toast('Legal Hold applied (blocks deletion/anonymisation).');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleReleaseHold = async (id) => {
      try {
        await apiPost(`/api/v1/privacy/legal-holds/${id}/release`, { notes: 'Released via Admin Console' });
        toast('Legal Hold released.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSaveM365 = async (e) => {
      e.preventDefault();
      try {
        await apiPut('/api/v1/integrations/configs/MICROSOFT_365', {
          status: m365Form.status,
          isEnabled: m365Form.status !== 'DISABLED',
          outboundUrl: m365Form.sharepointSiteUrl || undefined,
          configPayload: {
            tenantId: m365Form.tenantId.trim(),
            clientId: m365Form.clientId.trim(),
            ...(m365Form.clientSecret.trim() ? { clientSecret: m365Form.clientSecret.trim() } : {}),
            sharepointSiteUrl: m365Form.sharepointSiteUrl.trim(),
            senderMailbox: m365Form.senderMailbox.trim(),
            appBaseUrl: m365Form.appBaseUrl.trim(),
          },
        });
        toast('Microsoft 365 App-Only credentials encrypted & saved.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleTestM365Connection = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/test-connection', {});
        setM365TestResult(res);
        toast(res.connected ? 'Microsoft Graph App-Only connection verified!' : res.message || 'Not connected', res.connected ? 'success' : 'warning');
      } catch (err) {
        setM365TestResult({ connected: false, error: err.message });
        toast(err.message, 'error');
      }
    };

    const handleSendTestM365Mail = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/test-mail', { recipientMailbox: m365TestMailbox });
        setM365TestResult(res);
        toast(res.sent ? `Zero-PII link-only email sent to ${m365TestMailbox}` : res.reason || 'Mail dispatch skipped', res.sent ? 'success' : 'warning');
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSyncSharePoint = async () => {
      try {
        const res = await apiPost('/api/v1/integrations/m365/sync-sharepoint', {});
        setM365TestResult(res);
        toast(`SharePoint sync completed: ${res.syncedCount} synced, ${res.skippedCount} skipped.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleSaveColdArchive = async (e) => {
      e.preventDefault();
      try {
        await apiPatch('/api/v1/organisation', {
          coldArchiveEnabled: coldArchiveCfg.coldArchiveEnabled,
          coldArchiveMonths: Number(coldArchiveCfg.coldArchiveMonths) || 6,
        });
        toast('Cold storage archival policy updated.');
        loadPanelData();
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    const handleRunColdArchiveNow = async () => {
      try {
        const res = await apiPost('/api/v1/files/cold-archive/run', {
          overrideMonths: Number(coldArchiveCfg.coldArchiveMonths) || 6,
          force: true,
        });
        setColdArchiveReport(res);
        toast(`Cold archive sweep checked ${res.checkedCount} doc(s), purged ${res.archivedCount} local copy/copies.`);
      } catch (err) {
        toast(err.message, 'error');
      }
    };

    return (
      <div className="space-y-4 max-w-5xl">
        {/* Microsoft 365 App-Only SharePoint, Outlook & Cold Storage Archive */}
        <div className="bg-white rounded-md border border-slate-200 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h4 className="font-semibold text-sm text-slate-800 flex items-center gap-2">
                <Lock size={15} className="text-[#0088ff]" />
                <span>Microsoft 365 App-Only Integration (SharePoint, Outlook Mail & Shared Dept Calendars)</span>
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Uses App-Only Client Credentials (Sites.Selected + Mail.Send + Calendars.ReadWrite). Staff log in strictly via personal email + TOTP MFA.
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
              m365Form.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}>
              Status: {m365Form.status}
            </span>
          </div>

          <form onSubmit={handleSaveM365} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Entra Directory (Tenant) ID</label>
              <input
                type="text"
                value={m365Form.tenantId}
                onChange={(e) => setM365Form({ ...m365Form, tenantId: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">App Registration (Client) ID</label>
              <input
                type="text"
                value={m365Form.clientId}
                onChange={(e) => setM365Form({ ...m365Form, clientId: e.target.value })}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">
                Client Secret {m365Form.hasClientSecret ? '(Encrypted in DB — leave blank to keep)' : ''}
              </label>
              <input
                type="password"
                value={m365Form.clientSecret}
                onChange={(e) => setM365Form({ ...m365Form, clientSecret: e.target.value })}
                placeholder={m365Form.hasClientSecret ? '•••••••• (saved encrypted)' : 'Paste Azure Client Secret'}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">SharePoint HR Site URL</label>
              <input
                type="url"
                value={m365Form.sharepointSiteUrl}
                onChange={(e) => setM365Form({ ...m365Form, sharepointSiteUrl: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Outlook Sender (Zero-PII Link Only)</label>
              <input
                type="email"
                value={m365Form.senderMailbox}
                onChange={(e) => setM365Form({ ...m365Form, senderMailbox: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Integration Mode</label>
              <select
                value={m365Form.status}
                onChange={(e) => setM365Form({ ...m365Form, status: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                <option value="ACTIVE">ACTIVE (Dual-Write & Link Alerts Live)</option>
                <option value="TESTING">TESTING (Staged)</option>
                <option value="DISABLED">DISABLED (Local AES-256 Vault Only)</option>
              </select>
            </div>
            <div className="md:col-span-3 flex flex-wrap items-center gap-2 pt-1">
              <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                Save M365 Credentials
              </button>
              <button type="button" onClick={handleTestM365Connection} className="px-3 py-1.5 border border-slate-300 rounded font-medium hover:bg-slate-50">
                Test App-Only Graph Connection
              </button>
              <button type="button" onClick={handleSyncSharePoint} className="px-3 py-1.5 border border-emerald-300 text-emerald-700 rounded font-medium hover:bg-emerald-50">
                Sync Vault Files to SharePoint
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="email"
                  value={m365TestMailbox}
                  onChange={(e) => setM365TestMailbox(e.target.value)}
                  placeholder="recipient@company.com"
                  className="px-2.5 py-1 border border-slate-300 rounded w-52"
                />
                <button type="button" onClick={handleSendTestM365Mail} className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium">
                  Send Link-Only Test Mail
                </button>
              </div>
            </div>
          </form>

          {m365TestResult && (
            <pre className="bg-slate-50 p-2.5 rounded border border-slate-200 text-[11px] max-h-28 overflow-auto">
              {JSON.stringify(m365TestResult, null, 2)}
            </pre>
          )}

          {/* Cold Storage Archival Routine Setting */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <form onSubmit={handleSaveColdArchive} className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={coldArchiveCfg.coldArchiveEnabled}
                  onChange={(e) => setColdArchiveCfg({ ...coldArchiveCfg, coldArchiveEnabled: e.target.checked })}
                />
                <span>Auto-Archive Cold Local Vault Files to SharePoint</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-600">Retention Threshold (Months):</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={coldArchiveCfg.coldArchiveMonths}
                  onChange={(e) => setColdArchiveCfg({ ...coldArchiveCfg, coldArchiveMonths: Number(e.target.value) })}
                  className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-semibold"
                />
              </div>
              <button type="submit" className="px-3 py-1 bg-slate-700 text-white rounded font-medium">
                Save Retention
              </button>
            </form>
            <button
              type="button"
              onClick={handleRunColdArchiveNow}
              className="px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 rounded font-medium"
            >
              Run Cold Archive Sweep Now
            </button>
          </div>
          {coldArchiveReport && (
            <pre className="bg-indigo-50/50 p-2.5 rounded border border-indigo-200 text-[11px] max-h-32 overflow-auto">
              {JSON.stringify(coldArchiveReport, null, 2)}
            </pre>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <form onSubmit={handleCreateDsr} className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Lock size={15} className="text-[#0088ff]" />
              <span>Log Data Subject Request (DPA 2019)</span>
            </h4>
            <select
              value={dsrForm.employeeId}
              onChange={(e) => setDsrForm({ ...dsrForm, employeeId: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              {employees.map((em) => (
                <option key={em.id} value={em.id}>{em.firstName} {em.lastName} ({em.employeeNumber})</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={dsrForm.requestType}
                onChange={(e) => setDsrForm({ ...dsrForm, requestType: e.target.value })}
                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                {['ACCESS', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'PORTABILITY'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="email"
                required
                placeholder="Requester Email"
                value={dsrForm.requesterEmail}
                onChange={(e) => setDsrForm({ ...dsrForm, requesterEmail: e.target.value })}
                className="px-2.5 py-1.5 border border-slate-300 rounded"
              />
            </div>
            <input
              type="text"
              required
              placeholder="Lawful Justification"
              value={dsrForm.lawfulJustification}
              onChange={(e) => setDsrForm({ ...dsrForm, lawfulJustification: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">
              Submit DSR
            </button>
          </form>

          <form onSubmit={handleApplyHold} className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5">
            <h4 className="font-semibold text-slate-800 flex items-center gap-2">
              <Shield size={15} className="text-amber-600" />
              <span>Apply Legal Hold</span>
            </h4>
            <select
              value={holdForm.employeeId}
              onChange={(e) => setHoldForm({ ...holdForm, employeeId: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              {employees.map((em) => (
                <option key={em.id} value={em.id}>{em.firstName} {em.lastName} ({em.employeeNumber})</option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="Matter Title"
                value={holdForm.matterTitle}
                onChange={(e) => setHoldForm({ ...holdForm, matterTitle: e.target.value })}
                className="px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <select
                value={holdForm.reasonCategory}
                onChange={(e) => setHoldForm({ ...holdForm, reasonCategory: e.target.value })}
                className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
              >
                {['LITIGATION', 'ER_INVESTIGATION', 'TAX_AUDIT', 'REGULATORY'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <input
              type="text"
              placeholder="Hold Notes"
              value={holdForm.notes}
              onChange={(e) => setHoldForm({ ...holdForm, notes: e.target.value })}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <button type="submit" className="px-3 py-1.5 bg-amber-600 text-white rounded font-medium">
              Place Legal Hold
            </button>
          </form>
        </div>

        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 font-semibold text-slate-800">
            Data Subject Requests ({dsrs.length}) • Legal Holds ({legalHolds.length}) • DPIA Records ({dpias.length})
          </div>
          <div className="divide-y divide-slate-100">
            {dsrs.map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{d.requestType} — {d.requesterEmail}</p>
                  <p className="text-[11px] text-slate-500">Status: {d.status} • {d.lawfulJustification}</p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleReviewDsr(d.id, 'APPROVE')}
                    className="px-2 py-1 bg-blue-50 text-[#0088ff] rounded text-[11px]"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewDsr(d.id, 'FULFILL')}
                    className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[11px]"
                  >
                    Fulfill
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportDsr(d.employeeId)}
                    className="px-2 py-1 border border-slate-200 rounded text-[11px]"
                  >
                    Export Data
                  </button>
                </div>
              </div>
            ))}
            {legalHolds.map((h) => (
              <div key={h.id} className="px-4 py-2.5 flex items-center justify-between bg-amber-50/30">
                <div>
                  <p className="font-semibold text-amber-900">LEGAL HOLD: {h.matterTitle}</p>
                  <p className="text-[11px] text-amber-700">{h.reasonCategory} • Status: {h.status}</p>
                </div>
                {h.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => handleReleaseHold(h.id)}
                    className="px-2.5 py-1 bg-white border border-amber-300 text-amber-800 rounded text-[11px]"
                  >
                    Release Hold
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- SYSTEM METRICS & AUDIT LOGS ---
  if (orgTab === 'systemaudit') {
    const filteredAudit = auditLogs.filter(
      (l) =>
        !auditSearch ||
        `${l.action} ${l.targetType} ${l.actorEmail || ''}`.toLowerCase().includes(auditSearch.toLowerCase())
    );

    return (
      <div className="space-y-4 max-w-5xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-md border border-slate-200">
            <p className="text-slate-500">Liveness Probe (`/health`)</p>
            <p className="text-lg font-bold text-emerald-700 mt-1">{health?.status || 'healthy'}</p>
          </div>
          <div className="bg-white p-4 rounded-md border border-slate-200">
            <p className="text-slate-500">Readiness Probe (`/ready`)</p>
            <p className="text-lg font-bold text-[#0088ff] mt-1">{ready?.status || 'ready'}</p>
          </div>
          <div className="bg-white p-4 rounded-md border border-slate-200">
            <p className="text-slate-500">Process Metrics (`/metrics`)</p>
            <p className="text-xs font-mono text-slate-700 mt-1">
              Uptime: {Math.round(metrics?.uptimeSeconds || 0)}s • Mem: {metrics?.memoryMb?.rss ?? '-'} MB
            </p>
          </div>
        </div>

        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search immutable audit log..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={loadPanelData}
                className="px-3 py-1.5 border border-slate-200 rounded flex items-center gap-1"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              <button
                type="button"
                onClick={() => apiDownload('/api/v1/audit-logs/export?format=json', 'Ndakala_Audit_Log.json')}
                className="px-3 py-1.5 bg-[#0088ff] text-white rounded flex items-center gap-1"
              >
                <Download size={12} /> Export JSON
              </button>
            </div>
          </div>
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2 px-4">Timestamp</th>
                <th className="py-2 px-4">Action</th>
                <th className="py-2 px-4">Target</th>
                <th className="py-2 px-4">Actor</th>
                <th className="py-2 px-4">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAudit.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono text-[11px] text-slate-500">
                    {new Date(l.timestamp).toLocaleString()}
                  </td>
                  <td className="py-2 px-4 font-semibold text-slate-800">{l.action}</td>
                  <td className="py-2 px-4 text-slate-600">
                    {l.targetType} ({l.targetId?.slice(0, 8) || '-'})
                  </td>
                  <td className="py-2 px-4 text-slate-500">{l.actorEmail || l.actorUserId || 'system'}</td>
                  <td className="py-2 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${l.outcome === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {l.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}
