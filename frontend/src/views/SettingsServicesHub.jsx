import React, { useState } from 'react';
import {
  Search,
  Settings,
  UserPlus,
  Users,
  Umbrella,
  Calendar,
  Clock,
  Trophy,
  Folder,
  Star,
  Briefcase,
  CheckCircle,
  Target,
  Database,
  DollarSign,
  Shield,
  Sliders,
  Plus,
  X,
  Globe,
  Bell,
} from '../components/Icons';

const ADMIN_SERVICES_19 = [
  {
    id: 'manage_accounts',
    name: 'Manage Accounts',
    category: 'Core & Security',
    desc: 'Organization details, users, RBAC roles, M365 OAuth2 & dynamic domains.',
    icon: Shield,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
    nav: { type: 'settingsTab', tab: 'orgsettings' },
  },
  {
    id: 'onboarding',
    name: 'Onboarding',
    category: 'Core & Security',
    desc: 'Candidate hub fields, 7-section intake forms, offer letters & checklists.',
    icon: UserPlus,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    nav: { type: 'module', tab: 'directory', top: 'onboarding' },
  },
  {
    id: 'employee_info',
    name: 'Employee Information',
    category: 'Core & Security',
    desc: 'ID auto-sequencing (NDA-2026-XXXX), 10-section profiles & statutory vault.',
    icon: Users,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    nav: { type: 'module', tab: 'directory', top: 'employees' },
  },
  {
    id: 'leave_tracker',
    name: 'Leave Tracker',
    category: 'Time & Attendance',
    desc: '8 Kenyan statutory & enhanced leave types, carry-over & Outlook calendar sync.',
    icon: Umbrella,
    color: 'text-teal-600 bg-teal-50 border-teal-200',
    nav: { type: 'module', tab: 'inbox', top: 'mydata' },
  },
  {
    id: 'attendance',
    name: 'Attendance',
    category: 'Time & Attendance',
    desc: '9-column statutory grid, digital check-in/out & regularization workflows.',
    icon: Calendar,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    nav: { type: 'module', tab: 'attendance', top: 'mydata' },
  },
  {
    id: 'shifts',
    name: 'Shifts',
    category: 'Time & Attendance',
    desc: 'Shift schedules, working hours, rest days & overtime deviation rules.',
    icon: Clock,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    nav: { type: 'module', tab: 'attendance', top: 'shifts' },
  },
  {
    id: 'time_tracker',
    name: 'Time Tracker',
    category: 'Time & Attendance',
    desc: 'Daily/Weekly/Monthly time logs, 24-hr job schedule & client rate cards.',
    icon: Clock,
    color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
    nav: { type: 'module', tab: 'timetracker', top: 'mydata' },
  },
  {
    id: 'performance',
    name: 'Performance',
    category: 'Talent & Growth',
    desc: 'Appraisal cycles, KRA weighting, Competency ratings, Skill Set Matrix & 360 feedback.',
    icon: Trophy,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    nav: { type: 'module', tab: 'performance', top: 'settings' },
  },
  {
    id: 'files',
    name: 'Files',
    category: 'Operations & Compliance',
    desc: 'AES-256 encrypted local vault, SharePoint dual-write & HR form templates.',
    icon: Folder,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    nav: { type: 'module', tab: 'admin', top: 'files' },
  },
  {
    id: 'engagement',
    name: 'Employee Engagement',
    category: 'Talent & Growth',
    desc: 'Pulse surveys, anonymous questionnaires & firm eNPS tracking.',
    icon: Users,
    color: 'text-violet-600 bg-violet-50 border-violet-200',
    nav: { type: 'module', tab: 'engagement', top: 'engagement' },
  },
  {
    id: 'hr_letters',
    name: 'HR Letters',
    category: 'Operations & Compliance',
    desc: 'Address Proof, Bonafide & Experience Letter self-service PDF generation.',
    icon: Star,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
    nav: { type: 'module', tab: 'hrletters', top: 'addressproof' },
  },
  {
    id: 'travel',
    name: 'Travel',
    category: 'Operations & Compliance',
    desc: 'Client travel requests, per-diem limits & billable expense approvals.',
    icon: Briefcase,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    nav: { type: 'module', tab: 'travel', top: 'travel' },
  },
  {
    id: 'tasks',
    name: 'Tasks',
    category: 'Operations & Compliance',
    desc: 'Operational task boards, SLA escalations & onboarding/offboarding checklists.',
    icon: CheckCircle,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    nav: { type: 'module', tab: 'tasks', top: 'tasks' },
  },
  {
    id: 'compensation',
    name: 'Compensation',
    category: 'Payroll & Finance',
    desc: 'Kenyan PAYE, NSSF Tier I/II, SHIF 2.75%, Housing Levy 1.5% & digital payslips.',
    icon: DollarSign,
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    nav: { type: 'module', tab: 'payroll', top: 'compensation' },
  },
  {
    id: 'offboarding',
    name: 'Offboarding',
    category: 'Core & Security',
    desc: 'Separation workflows, asset handover, exit interviews & Certificate of Service.',
    icon: Users,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
    nav: { type: 'module', tab: 'directory', top: 'employees', sub: 'separation' },
  },
  {
    id: 'okr',
    name: 'OKR',
    category: 'Talent & Growth',
    desc: 'OKR cycle start month, quarterly formula & deviation percentage brackets.',
    icon: Target,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    nav: { type: 'module', tab: 'okr', top: 'configuration' },
  },
  {
    id: 'marketplace',
    name: 'Marketplace & Integrations',
    category: 'Platform & Automation',
    desc: 'Microsoft 365 App-Only Graph API, SharePoint Online, Outlook & SSO connectors.',
    icon: Globe,
    color: 'text-sky-600 bg-sky-50 border-sky-200',
    nav: { type: 'settingsTab', tab: 'orgsettings' },
  },
  {
    id: 'developer_space',
    name: 'Developer Space',
    category: 'Platform & Automation',
    desc: 'REST APIs, Webhooks, Automation Blueprints, Audit Trails & CSRF controls.',
    icon: Database,
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    nav: { type: 'settingsTab', tab: 'automation' },
  },
  {
    id: 'smart_insights',
    name: 'Smart HR Assistant',
    category: 'Platform & Automation',
    desc: 'Automated statutory compliance alerts, leave conflict checks & policy guidance.',
    icon: Sliders,
    color: 'text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200',
    nav: { type: 'settingsTab', tab: 'automation' },
  },
];

const WORKFLOW_STORAGE_KEY = 'ndakala_automation_workflows_v1';

const DEFAULT_WORKFLOWS = [
  {
    id: 'wf-1',
    name: 'Leave Approved → Sync M365 Shared Calendar',
    module: 'Leave Tracker',
    trigger: 'On Approval',
    action: 'Create All-Day Free Event in Outlook Shared Calendar + Link-Only Email Alert',
    enabled: true,
    runs: 42,
  },
  {
    id: 'wf-2',
    name: 'New Employee Created → AES-256 Vault & SharePoint Sync',
    module: 'Employee Information',
    trigger: 'On Create',
    action: 'Provision Employee Folder & Dual-Write Employment Contract',
    enabled: true,
    runs: 14,
  },
  {
    id: 'wf-3',
    name: 'Probation 14-Day Expiry Alert',
    module: 'Onboarding',
    trigger: 'Date-Based (14 days prior)',
    action: 'Notify Line Manager & HR Partner for Confirmation Review',
    enabled: true,
    runs: 9,
  },
  {
    id: 'wf-4',
    name: 'Payslip Published → Zero-PII Link-Only Notification',
    module: 'Compensation',
    trigger: 'On Payroll Approval',
    action: 'Dispatch Authenticated Portal Link (No PDF Attachment in Shared Mailbox)',
    enabled: true,
    runs: 28,
  },
];

const BLUEPRINTS = [
  {
    id: 'bp-1',
    name: 'Leave Application Maker-Checker Blueprint',
    module: 'Leave Tracker',
    stages: ['Draft / Submitted', 'Relieving Officer Handover', 'Line Manager Approval', 'M365 Calendar Synced'],
    status: 'Active',
  },
  {
    id: 'bp-2',
    name: 'Monthly Kenyan Payroll Statutory Blueprint',
    module: 'Compensation',
    stages: ['Draft Calculation (PAYE/NSSF/SHIF/AHL)', 'HR Verification', 'Managing Partner Approval', 'Payslips Published'],
    status: 'Active',
  },
  {
    id: 'bp-3',
    name: 'Employee Probation Confirmation Blueprint',
    module: 'Employee Information',
    stages: ['Onboarding Active', '90-Day Objectives Set', 'Manager Evaluation', 'Confirmed Permanent'],
    status: 'Active',
  },
];

function readWorkflows() {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_WORKFLOWS;
  } catch {
    return DEFAULT_WORKFLOWS;
  }
}

export function SettingsServicesGrid({ onNavigateModule, onSwitchSettingsTab, onShowToast }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [enabledMap, setEnabledMap] = useState(() =>
    Object.fromEntries(ADMIN_SERVICES_19.map((s) => [s.id, true]))
  );

  const categories = ['All', ...Array.from(new Set(ADMIN_SERVICES_19.map((s) => s.category)))];

  const filtered = ADMIN_SERVICES_19.filter((s) => {
    const matchesCat = category === 'All' || s.category === category;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q || s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    return matchesCat && matchesQuery;
  });

  const handleOpenService = (svc) => {
    if (svc.nav.type === 'settingsTab') {
      onSwitchSettingsTab?.(svc.nav.tab);
    } else if (svc.nav.type === 'module') {
      onNavigateModule?.(svc.nav.tab, svc.nav.top, svc.nav.sub || null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#edf1f7] p-5 space-y-4 text-xs">
      {/* Header Banner */}
      <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#191f3a] text-white flex items-center justify-center">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Settings &amp; Administration Hub (19 Services)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Centralized configuration directory for HR services, M365 integrations, RBAC permissions, and automation blueprints.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 19 admin services..."
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-60 bg-white"
            />
          </div>
          <button
            type="button"
            onClick={() => onSwitchSettingsTab?.('automation')}
            className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold"
          >
            Automation &amp; Blueprints
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              category === cat
                ? 'bg-[#191f3a] text-white border-[#191f3a]'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 19-Service Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((svc) => {
          const IconComp = svc.icon;
          const isEnabled = enabledMap[svc.id] !== false;
          return (
            <div
              key={svc.id}
              onClick={() => handleOpenService(svc)}
              className="bg-white rounded-md border border-slate-200 p-4 hover:border-[#0088ff] hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${svc.color}`}>
                    <IconComp size={18} />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !isEnabled;
                      setEnabledMap((m) => ({ ...m, [svc.id]: next }));
                      onShowToast?.(`${svc.name} service ${next ? 'enabled' : 'paused'}.`);
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      isEnabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {isEnabled ? 'Active' : 'Paused'}
                  </button>
                </div>
                <h4 className="font-bold text-slate-800 text-xs">{svc.name}</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{svc.desc}</p>
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-medium">{svc.category}</span>
                <span className="text-[#0088ff] font-semibold">Configure →</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AutomationBuilderPanel({ onShowToast }) {
  const [subTab, setSubTab] = useState('workflows'); // workflows | blueprints | webhooks
  const [workflows, setWorkflows] = useState(readWorkflows);
  const [modalOpen, setModalOpen] = useState(false);
  const [wfForm, setWfForm] = useState({
    name: '',
    module: 'Leave Tracker',
    trigger: 'On Create',
    action: 'Send Link-Only M365 Notification',
  });

  const saveWorkflows = (next) => {
    setWorkflows(next);
    try {
      localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleCreateWorkflow = (e) => {
    e.preventDefault();
    if (!wfForm.name.trim()) return;
    const next = [
      {
        id: `wf-${Date.now()}`,
        ...wfForm,
        name: wfForm.name.trim(),
        enabled: true,
        runs: 0,
      },
      ...workflows,
    ];
    saveWorkflows(next);
    setWfForm({ name: '', module: 'Leave Tracker', trigger: 'On Create', action: 'Send Link-Only M365 Notification' });
    setModalOpen(false);
    onShowToast?.('Workflow automation rule created and activated.');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#edf1f7] p-5 space-y-4 text-xs">
      <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Automation Engine, Blueprints &amp; Webhooks</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Event-driven HR workflows, multi-stage maker-checker blueprints, and zero-PII email alert templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { id: 'workflows', label: `Workflows (${workflows.length})` },
            { id: 'blueprints', label: `Blueprints (${BLUEPRINTS.length})` },
            { id: 'webhooks', label: 'Email Alerts & Webhooks' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded font-medium ${
                subTab === t.id ? 'bg-[#0088ff] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#191f3a] hover:bg-slate-800 text-white rounded font-semibold flex items-center gap-1"
          >
            <Plus size={13} />
            <span>New Workflow</span>
          </button>
        </div>
      </div>

      {subTab === 'workflows' && (
        <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Workflow Rule</th>
                <th className="py-2.5 px-3 font-semibold">Module</th>
                <th className="py-2.5 px-3 font-semibold">Trigger</th>
                <th className="py-2.5 px-3 font-semibold">Automated Action</th>
                <th className="py-2.5 px-3 font-semibold text-center">Runs</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-800">{wf.name}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                      {wf.module}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-600">{wf.trigger}</td>
                  <td className="py-3 px-3 text-slate-600">{wf.action}</td>
                  <td className="py-3 px-3 text-center font-mono font-semibold text-slate-700">{wf.runs}</td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        const next = workflows.map((x) => (x.id === wf.id ? { ...x, enabled: !x.enabled } : x));
                        saveWorkflows(next);
                        onShowToast?.(`Workflow "${wf.name}" ${!wf.enabled ? 'enabled' : 'disabled'}.`);
                      }}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        wf.enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      {wf.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'blueprints' && (
        <div className="space-y-3">
          {BLUEPRINTS.map((bp) => (
            <div key={bp.id} className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 text-xs">{bp.name}</h4>
                  <span className="text-[11px] text-slate-500">Module: {bp.module}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                  {bp.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {bp.stages.map((st, idx) => (
                  <React.Fragment key={st}>
                    <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-[#0088ff] font-semibold text-[11px]">
                      {idx + 1}. {st}
                    </div>
                    {idx < bp.stages.length - 1 && <span className="text-slate-400 font-bold">→</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {subTab === 'webhooks' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <Bell size={14} className="text-[#0088ff]" />
              <span>Zero-PII Link-Only M365 Email Alerts</span>
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              All transactional notifications (Leave approvals, Payslip alerts, Onboarding welcomes) dispatch authenticated portal deep-links via Microsoft Graph API without exposing PII or PDF attachments in shared mailboxes.
            </p>
            <div className="pt-2 text-[11px] text-emerald-700 font-semibold">
              ✓ Active • App-Only OAuth2 Channel Verified
            </div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <Database size={14} className="text-indigo-600" />
              <span>Audit Trail &amp; Webhook Dispatch</span>
            </h4>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every HR mutation records an immutable PostgreSQL audit entry with actor ID, IP, before/after state diff, and correlation Request ID.
            </p>
            <div className="pt-2 text-[11px] text-[#0088ff] font-semibold">
              ✓ CSRF Double-Submit + Rate Limiting Enforced
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold">Create Workflow Automation Rule</h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateWorkflow} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Workflow Name *</label>
                <input
                  required
                  value={wfForm.name}
                  onChange={(e) => setWfForm({ ...wfForm, name: e.target.value })}
                  placeholder="e.g. Overtime Threshold Alert"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Module</label>
                  <select
                    value={wfForm.module}
                    onChange={(e) => setWfForm({ ...wfForm, module: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option>Leave Tracker</option>
                    <option>Employee Information</option>
                    <option>Attendance</option>
                    <option>Time Tracker</option>
                    <option>Performance</option>
                    <option>Compensation</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Trigger</label>
                  <select
                    value={wfForm.trigger}
                    onChange={(e) => setWfForm({ ...wfForm, trigger: e.target.value })}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option>On Create</option>
                    <option>On Edit</option>
                    <option>On Approval</option>
                    <option>Date-Based</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Automated Action</label>
                <input
                  value={wfForm.action}
                  onChange={(e) => setWfForm({ ...wfForm, action: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0088ff] text-white font-semibold rounded hover:bg-[#0073d9]"
                >
                  Create Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
