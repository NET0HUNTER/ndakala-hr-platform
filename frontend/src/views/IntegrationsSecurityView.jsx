import React, { useState, useEffect } from 'react';
import { apiGet, apiPatch, apiPut } from '../utils/api';
import OrgSettingsPanel from '../components/OrgSettingsPanel';
import {
  Search,
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
  Check,
  NdakalaEmptyState,
} from '../components/Icons';

const OPERATIONS_SERVICES = [
  { id: 'directory', topTab: 'onboarding', subHint: 'records', label: 'Onboarding', icon: UserPlus, color: 'text-blue-500 border-blue-200' },
  { id: 'directory', topTab: 'employees', subHint: 'records', label: 'Employee Information', icon: Users, color: 'text-sky-500 border-sky-200' },
  { id: 'inbox', topTab: 'mydata', label: 'Leave Tracker', icon: Umbrella, color: 'text-teal-500 border-teal-200' },
  { id: 'attendance', topTab: 'mydata', subHint: 'attendance', label: 'Attendance', icon: Calendar, color: 'text-orange-500 border-orange-200' },
  { id: 'attendance', topTab: 'shifts', subHint: 'shifts', label: 'Shift', icon: Clock, color: 'text-purple-500 border-purple-200' },
  { id: 'timetracker', topTab: 'mydata', subHint: 'timelogs', label: 'Time Tracker', icon: Clock, color: 'text-cyan-600 border-cyan-200' },
  { id: 'performance', topTab: 'appraisals', label: 'Performance', icon: Trophy, color: 'text-emerald-500 border-emerald-200' },
  { id: 'admin', topTab: 'files', subHint: 'documents', label: 'Files', icon: Folder, color: 'text-blue-500 border-blue-200' },
  { id: 'engagement', topTab: 'engagement', subHint: 'engagement', label: 'Employee Engagement', icon: Users, color: 'text-indigo-500 border-indigo-200' },
  { id: 'hrletters', topTab: 'addressproof', label: 'HR Letters', icon: Star, color: 'text-amber-500 border-amber-200' },
  { id: 'travel', topTab: 'travel', subHint: 'travel', label: 'Travel', icon: Briefcase, color: 'text-orange-500 border-orange-200' },
  { id: 'tasks', topTab: 'tasks', subHint: 'tasks', label: 'Tasks', icon: CheckCircle, color: 'text-emerald-600 border-emerald-200' },
  { id: 'directory', topTab: 'employees', subHint: 'separation', label: 'Offboarding', icon: Users, color: 'text-rose-500 border-rose-200' },
  { id: 'okr', topTab: 'appraisals', subHint: 'objectives', label: 'OKR', icon: Target, color: 'text-blue-600 border-blue-200' },
  { id: 'workspace', topTab: 'myspace', subHint: 'approvals', label: 'Approvals', icon: CheckCircle, color: 'text-yellow-600 border-yellow-200' },
  { id: 'hardening', topTab: 'orgsettings', label: 'Data Administration', icon: Database, color: 'text-pink-500 border-pink-200' },
  { id: 'payroll', topTab: 'compensation', label: 'Compensation', icon: DollarSign, color: 'text-emerald-600 border-emerald-200' },
];

const ORG_SETTINGS_TABS = [
  { id: 'details', label: 'Organization Details' },
  { id: 'policy', label: 'Organization Policy' },
  { id: 'structure', label: 'Organization Structure' },
  { id: 'locations', label: 'Locations' },
  { id: 'departments', label: 'Departments' },
  { id: 'designations', label: 'Designations' },
  { id: 'domains', label: 'Domains and Rebranding' },
  { id: 'fromaddresses', label: 'From Addresses' },
  { id: 'emailauth', label: 'Email Authentication' },
];

export default function IntegrationsSecurityView({
  activeTab = 'hardening',
  topContextTab = 'orgsettings',
  setTopContextTab,
  setActiveTab,
  currentUser,
  employees = [],
  holidays = [],
  onRefreshAll,
  onShowToast,
}) {
  const [opsSearch, setOpsSearch] = useState('');

  // Organization Settings state (01:50 - 02:15 of hr.webm)
  const [orgTab, setOrgTab] = useState('details');
  const [orgDetails, setOrgDetails] = useState({
    name: 'Ndakala Advisory LLP',
    website: 'https://ndakalaadvisory.co.ke',
    orgType: 'Financial Services',
    contactPerson: 'People & Operations Office',
    contactNumber: '+254 20 000 0000',
    contactEmail: 'hr.lead@ndakalaadvisory.co.ke',
    addressLine1: '246 Owashika Road, Lavington',
    addressLine2: 'Nairobi Westlands',
    city: 'Nairobi',
    state: 'Nairobi County',
    country: 'Kenya',
    postalCode: '00100',
  });
  const [orgPolicyToggles, setOrgPolicyToggles] = useState({
    notifications: true,
    chat: true,
    birthday: true,
    workAnniversary: true,
    mobileNumber: true,
    orgStructure: false,
  });

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [shiftsCount, setShiftsCount] = useState(0);
  const [tourSeen, setTourSeen] = useState(false);

  // Welcome Carousel & Account Setup Modals
  const [welcomeSlide, setWelcomeSlide] = useState(0);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [readinessModalOpen, setReadinessModalOpen] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);
  const [setupForm, setSetupForm] = useState({
    companyName: 'Ndakala Advisory LLP',
    portalName: 'Ndakala People',
    industry: 'Financial Services',
    phone: '+254 20 000 0000',
    employeeCount: String(employees.length || 0),
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [deptsRes, posRes, shiftsRes, orgRes, setupCfg, tourCfg] = await Promise.all([
          apiGet('/api/v1/departments').catch(() => []),
          apiGet('/api/v1/positions').catch(() => []),
          apiGet('/api/v1/workspace/shifts').catch(() => ({ items: [] })),
          apiGet('/api/v1/organisation').catch(() => null),
          apiGet('/api/v1/workspace/ui-config?key=SETUP_WIZARD').catch(() => null),
          apiGet('/api/v1/workspace/ui-config?key=HOME_TOUR_SEEN').catch(() => null),
        ]);
        if (!active) return;
        const deptList = Array.isArray(deptsRes) ? deptsRes : deptsRes?.items || [];
        setDepartments(
          deptList.map((d) => ({
            id: d.id,
            name: d.name,
            code: d.code,
            users: d._count?.employees ?? 0,
            alias: d.code ? `${String(d.code).toLowerCase()}@ndakalaadvisory.co.ke` : '-',
            lead: d.headOfDepartment ? `${d.headOfDepartment.firstName} ${d.headOfDepartment.lastName}` : '-',
          }))
        );
        const posList = Array.isArray(posRes) ? posRes : posRes?.items || [];
        setDesignations(
          posList.map((p) => ({
            id: p.id,
            name: p.title || p.name,
            code: p.code,
            users: p._count?.employees ?? 0,
          }))
        );
        const shiftList = Array.isArray(shiftsRes?.items) ? shiftsRes.items : [];
        setShiftsCount(shiftList.length);

        const savedSetup = setupCfg?.configs?.SETUP_WIZARD || setupCfg?.value;
        const orgData = orgRes?.data || orgRes;
        setSetupForm((prev) => ({
          ...prev,
          ...(savedSetup && typeof savedSetup === 'object' ? savedSetup : {}),
          companyName: savedSetup?.companyName || orgData?.legalName || prev.companyName,
          portalName: savedSetup?.portalName || orgData?.tradingName || prev.portalName,
          phone: savedSetup?.phone || orgData?.phone || prev.phone,
          employeeCount: String(savedSetup?.employeeCount || employees.length || prev.employeeCount),
        }));

        const tourVal = tourCfg?.configs?.HOME_TOUR_SEEN || tourCfg?.value;
        if (tourVal?.seen) setTourSeen(true);
      } catch {
        // non-blocking initial fetch
      }
    })();
    return () => {
      active = false;
    };
  }, [employees.length]);

  // ==================== 1. OPERATIONS SERVICES DIRECTORY ====================
  if (activeTab === 'operations') {
    const filteredServices = OPERATIONS_SERVICES.filter((s) =>
      s.label.toLowerCase().includes(opsSearch.toLowerCase())
    );

    return (
      <div className="flex-1 bg-[#edf1f7] p-5 overflow-y-auto space-y-4">
        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <Search size={14} className="absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={opsSearch}
              onChange={(e) => setOpsSearch(e.target.value)}
              placeholder="Search Operations"
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-md text-xs text-slate-700 shadow-2xs focus:outline-none focus:border-[#0088ff]"
            />
          </div>
        </div>

        <div className="bg-white rounded-md border border-slate-200 p-6 shadow-2xs">
          <h3 className="text-sm font-semibold text-slate-800 mb-5">Services</h3>
          {filteredServices.length === 0 ? (
            <NdakalaEmptyState title="No matching services found" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
              {filteredServices.map((srv, idx) => {
                const IconComp = srv.icon;
                return (
                  <button
                    key={`${srv.label}-${idx}`}
                    type="button"
                    onClick={() =>
                      setActiveTab && setActiveTab(srv.id, srv.topTab || null, srv.subHint || null)
                    }
                    className="h-[140px] bg-white border border-slate-200 hover:border-[#0088ff] hover:shadow-md rounded-xl p-4 flex flex-col items-center justify-center gap-3.5 transition-all group"
                  >
                    <div
                      className={`w-12 h-12 rounded-xl border flex items-center justify-center bg-slate-50/60 group-hover:scale-105 transition-transform ${srv.color}`}
                    >
                      <IconComp size={22} />
                    </div>
                    <span className="text-xs font-medium text-slate-700 text-center">
                      {srv.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==================== 2. NDAKALA PEOPLE WELCOME TOUR & ACCOUNT SETUP ====================
  if (topContextTab === 'gettingstarted') {
    const slides = [
      {
        title: 'Welcome to Ndakala People HR Suite',
        desc: 'Manage Ndakala Advisory employee lifecycles, statutory Kenyan payroll, time tracking, performance appraisals, and governance from one unified portal.',
        badge: 'Ndakala HR',
        metricLabel: `${employees.length} Active Staff • ${departments.length} Departments`,
        ctaLabel: 'Open My Space',
        ctaAction: () => setActiveTab && setActiveTab('workspace', 'myspace'),
      },
      {
        title: 'My Space & Team Collaboration',
        desc: 'Track real-time clock-in shifts, review team approvals, manage leave coverage, and collaborate cleanly across engagement walls.',
        badge: 'My & Team Space',
        metricLabel: `${holidays.length} Gazetted Kenya Holidays Configured`,
        ctaLabel: 'Open Approvals Queue',
        ctaAction: () => setActiveTab && setActiveTab('workspace', 'myspace', 'approvals'),
      },
      {
        title: 'Time Tracker & Project Profitability',
        desc: 'Capture billable advisory hours across client engagements, lock month-end periods with immutable SHA-256 digests, and monitor margin KPIs.',
        badge: 'Timesheets & KPIs',
        metricLabel: 'Live Billability & Leakage Analytics Ready',
        ctaLabel: 'Open Time Tracker',
        ctaAction: () => setActiveTab && setActiveTab('timetracker', 'mydata', 'timelogs'),
      },
      {
        title: 'Enterprise Reports & Organization Control',
        desc: 'Access scoped self-service, team, and executive analytics across all HR domains plus full DPA 2019 governance.',
        badge: 'Reports & Settings',
        metricLabel: 'Role-Based Access Matrix Enforced',
        ctaLabel: 'Open Reports Hub',
        ctaAction: () => setActiveTab && setActiveTab('reports', 'orgreports'),
      },
    ];

    const currentSlide = slides[welcomeSlide] || slides[0];

    return (
      <div className="flex-1 bg-[#edf1f7] p-6 overflow-y-auto flex items-center justify-center">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs max-w-6xl w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[500px]">
          <div className="lg:col-span-7 p-8 flex flex-col justify-between border-r border-slate-100">
            <div className="rounded-xl bg-gradient-to-br from-blue-50 via-indigo-50/70 to-sky-100 p-8 text-center flex flex-col items-center justify-center min-h-[340px]">
              <div className="text-4xl font-black bg-gradient-to-r from-[#2563eb] to-[#0088ff] bg-clip-text text-transparent mb-3 select-none">
                {currentSlide.badge}
              </div>
              <span className="px-3 py-1 rounded-full bg-white/80 border border-blue-200 text-[#0088ff] text-[11px] font-semibold mb-4">
                {currentSlide.metricLabel}
              </span>
              <h2 className="text-lg font-bold text-slate-800 mb-2">{currentSlide.title}</h2>
              <p className="text-xs text-slate-600 max-w-lg leading-relaxed">
                {currentSlide.desc}
              </p>
            </div>

            <div className="pt-5 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={currentSlide.ctaAction}
                className="px-4 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded shadow-xs"
              >
                {currentSlide.ctaLabel}
              </button>

              <div className="flex items-center gap-1.5">
                {slides.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setWelcomeSlide(idx)}
                    aria-label={`Slide ${idx + 1}`}
                    className={`h-2 rounded-full transition-all ${
                      welcomeSlide === idx ? 'w-6 bg-[#0088ff]' : 'w-2 bg-slate-300'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3 text-slate-600 font-medium">
                {welcomeSlide > 0 && (
                  <button
                    type="button"
                    onClick={() => setWelcomeSlide(welcomeSlide - 1)}
                    className="hover:text-[#0088ff]"
                  >
                    Previous
                  </button>
                )}
                {welcomeSlide < slides.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setWelcomeSlide(welcomeSlide + 1)}
                    className="hover:text-[#0088ff]"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-[#f5f8ff] p-8 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800 mb-1">Let's begin!</h3>
              <p className="text-xs text-slate-500 mb-6">
                Follow the interactive setup checklist below; live completion badges update from your workspace database.
              </p>

              <div className="space-y-5 relative before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[1px] before:bg-blue-200">
                {[
                  {
                    title: 'Configure Organization Details',
                    desc: `${departments.length} departments & brand profile ready.`,
                    done: departments.length > 0,
                    action: () => setTopContextTab && setTopContextTab('orgsettings'),
                  },
                  {
                    title: 'Onboard & Invite Staff',
                    desc: `${employees.length} active staff record(s) in directory.`,
                    done: employees.length > 0,
                    action: () => setActiveTab && setActiveTab('directory', 'onboarding', 'records'),
                  },
                  {
                    title: 'Configure Leave & Holidays',
                    desc: `${holidays.length} gazetted holiday(s) active.`,
                    done: holidays.length > 0,
                    action: () => setActiveTab && setActiveTab('inbox', 'holidays'),
                  },
                  {
                    title: 'Define Work Shifts & Attendance',
                    desc: `${shiftsCount} shift schedule(s) active in workspace.`,
                    done: shiftsCount > 0,
                    action: () => setActiveTab && setActiveTab('attendance', 'shifts', 'shifts'),
                  },
                ].map((step) => (
                  <div key={step.title} className="pl-8 relative">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold absolute left-0 top-0.5 ${
                        step.done
                          ? 'bg-emerald-500 text-white border border-emerald-500'
                          : 'bg-white border-2 border-slate-300 text-slate-400'
                      }`}
                    >
                      {step.done ? <Check size={11} /> : ''}
                    </span>
                    <button
                      type="button"
                      onClick={step.action}
                      className="text-sm font-medium text-[#0088ff] hover:underline text-left"
                    >
                      {step.title}
                    </button>
                    <p className="text-xs text-slate-500 mt-0.5">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-blue-100 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSetupError('');
                  setSetupModalOpen(true);
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium text-slate-700 hover:border-[#0088ff]"
              >
                Account Setup Wizard
              </button>
              <button
                type="button"
                onClick={() => setReadinessModalOpen(true)}
                className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-medium text-slate-700 hover:border-[#0088ff]"
              >
                Workspace Readiness Check
              </button>
              {tourSeen && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                  <Check size={12} /> Setup Verified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Account Setup Wizard Modal */}
        {setupModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-md shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-fadeIn text-xs">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  Help us configure your organization
                </h3>
                <button type="button" onClick={() => setSetupModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  ✕
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Company name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={setupForm.companyName}
                    onChange={(e) => setSetupForm({ ...setupForm, companyName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Portal Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={setupForm.portalName}
                    onChange={(e) => setSetupForm({ ...setupForm, portalName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Industry <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={setupForm.industry}
                    onChange={(e) => setSetupForm({ ...setupForm, industry: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option>Financial Services</option>
                    <option>Audit & Advisory</option>
                    <option>Real Estate & Construction</option>
                    <option>Marketing & Advertising</option>
                    <option>IT & Cybersecurity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={setupForm.phone}
                    onChange={(e) => setSetupForm({ ...setupForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Employee Count Target
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={setupForm.employeeCount}
                    onChange={(e) => setSetupForm({ ...setupForm, employeeCount: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                {setupError && (
                  <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded px-2.5 py-1.5 font-medium">
                    {setupError}
                  </p>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-between">
                <button
                  type="button"
                  disabled={savingSetup}
                  onClick={() => setSetupModalOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSetup}
                  onClick={async () => {
                    if (!setupForm.companyName.trim() || !setupForm.portalName.trim() || !setupForm.phone.trim()) {
                      setSetupError('Company name, Portal Display Name, and Phone Number are required.');
                      return;
                    }
                    setSetupError('');
                    setSavingSetup(true);
                    try {
                      await apiPatch('/api/v1/organisation', {
                        legalName: setupForm.companyName.trim(),
                        tradingName: setupForm.portalName.trim(),
                        phone: setupForm.phone.trim(),
                      });
                      await apiPut('/api/v1/workspace/ui-config', {
                        key: 'SETUP_WIZARD',
                        scope: 'ORG',
                        value: {
                          ...setupForm,
                          companyName: setupForm.companyName.trim(),
                          portalName: setupForm.portalName.trim(),
                          phone: setupForm.phone.trim(),
                        },
                      });
                      onShowToast && onShowToast('Organization setup saved to database.');
                      if (onRefreshAll) await onRefreshAll();
                      setSetupModalOpen(false);
                      setReadinessModalOpen(true);
                    } catch (err) {
                      setSetupError(err.message || 'Failed to save organization setup');
                      onShowToast && onShowToast(err.message || 'Failed to save organization setup', 'error');
                    } finally {
                      setSavingSetup(false);
                    }
                  }}
                  className="px-4 py-1.5 bg-[#0088ff] text-white font-medium rounded disabled:opacity-50"
                >
                  {savingSetup ? 'Saving...' : 'Save & Verify Readiness'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Workspace Readiness Check Modal */}
        {readinessModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-lg shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-fadeIn text-xs">
              <div className="h-32 bg-[#d8e8ff] flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-[#1f2647] mb-1">Ndakala People</div>
                  <span className="text-[11px] text-[#0088ff] font-semibold">
                    Live Database Readiness Summary
                  </span>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-800">
                  Organization Data & Configuration Status
                </h3>
                <div className="space-y-2 border border-slate-200 rounded p-3 bg-slate-50/60">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Directory Employees Synced</span>
                    <span className="font-bold text-slate-800">{employees.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Departments Configured</span>
                    <span className="font-bold text-slate-800">{departments.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Kenya Public Holidays Loaded</span>
                    <span className="font-bold text-slate-800">{holidays.length}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={savingSetup}
                    onClick={async () => {
                      setSavingSetup(true);
                      try {
                        await apiPut('/api/v1/workspace/ui-config', {
                          key: 'HOME_TOUR_SEEN',
                          scope: 'ORG',
                          value: { seen: true, verifiedAt: new Date().toISOString(), employees: employees.length },
                        });
                        setTourSeen(true);
                        setReadinessModalOpen(false);
                        if (onRefreshAll) await onRefreshAll();
                        onShowToast && onShowToast('Workspace readiness synced with live database.');
                      } catch (err) {
                        onShowToast && onShowToast(err.message || 'Verification failed', 'warning');
                      } finally {
                        setSavingSetup(false);
                      }
                    }}
                    className="px-4 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded disabled:opacity-50"
                  >
                    {savingSetup ? 'Syncing...' : 'Sync Live Data & Continue'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReadinessModalOpen(false);
                      setTopContextTab && setTopContextTab('orgsettings');
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded"
                  >
                    Configure Organization Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== 3. ORGANIZATION SETTINGS ====================
  return (
    <OrgSettingsPanel
      orgTabs={ORG_SETTINGS_TABS}
      initialTab={orgTab}
      orgDetails={orgDetails}
      setOrgDetails={setOrgDetails}
      orgPolicyToggles={orgPolicyToggles}
      setOrgPolicyToggles={setOrgPolicyToggles}
      departments={departments}
      setDepartments={setDepartments}
      designations={designations}
      setDesignations={setDesignations}
      employees={employees}
      onRefreshAll={onRefreshAll}
      onShowToast={onShowToast}
    />
  );
}
