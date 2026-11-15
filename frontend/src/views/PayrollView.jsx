import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Check,
  Plus,
  DollarSign,
  Eye,
  Lock,
  Search,
  Download,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiPut, apiDownload, unwrapList } from '../utils/api';

const COMP_SIDEBAR_TABS = [
  { id: 'general', label: 'General' },
  { id: 'currencies', label: 'Currencies' },
  { id: 'templates', label: 'Revision Letter Templates' },
  { id: 'reasons', label: 'Revision Reasons' },
  { id: 'payrollruns', label: 'Kenyan Statutory Payroll' },
  { id: 'salaries', label: 'Salary & Pay Groups Setup' },
  { id: 'rulesets', label: 'Statutory Rule Sets' },
  { id: 'calculator', label: 'PAYE / SHIF / AHL Calculator' },
];

export default function PayrollView({
  currentUser,
  topContextTab = 'compensation',
  setTopContextTab,
  payPeriods = [],
  payrollRuns = [],
  payslips = [],
  salaryStructures = [],
  employees = [],
  onOpenPayslipModal,
  onRefreshAll,
  onShowToast,
}) {
  const userPermissions = new Set(currentUser?.permissions || []);
  const userRoles = new Set(
    (currentUser?.roles || (currentUser?.role ? [currentUser.role] : [])).map((r) =>
      String(r).toLowerCase()
    )
  );
  const canPreparePayroll = userPermissions.has('payroll.prepare');
  const canReviewPayroll = userPermissions.has('payroll.review');
  const canApprovePayroll = userPermissions.has('payroll.approve');
  const canLockPayroll = userPermissions.has('payroll.lock');
  const canExportPayroll = userPermissions.has('payroll.export');
  const canAdjustPayroll = userPermissions.has('payroll.adjust');
  const canViewPayrollReports = userPermissions.has('payroll.reports.view');
  const canManagePayrollConfig = userPermissions.has('payroll.config.manage');
  const canManagePayroll =
    canPreparePayroll ||
    canReviewPayroll ||
    canApprovePayroll ||
    canLockPayroll ||
    canViewPayrollReports ||
    canManagePayrollConfig ||
    userRoles.has('managing_partner') ||
    userRoles.has('head_of_hr') ||
    userRoles.has('operations_director') ||
    userRoles.has('system_admin');
  // 3-Step Compensation Setup Wizard state
  const [wizardStep, setWizardStep] = useState(0);
  const [homeCurrency, setHomeCurrency] = useState('KES Kenya Shillings');
  const [currencySearch, setCurrencySearch] = useState('');
  const [currencyDropdownOpen, setCurrencyDropdownOpen] = useState(false);
  const [currencyFormat, setCurrencyFormat] = useState('1,234,567,89.00');
  const [allowSelfView, setAllowSelfView] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [selectedCompRoles, setSelectedCompRoles] = useState(['HR_ADMIN', 'FINANCE_PAYROLL', 'SUPER_ADMIN']);
  const [payScheduleFrequency, setPayScheduleFrequency] = useState('MONTHLY');
  const [statutoryDefaults, setStatutoryDefaults] = useState({ paye: true, nssf: true, shif: true, ahl: true });
  const [revisionTemplates, setRevisionTemplates] = useState([
    { id: 'rt-1', name: 'Revision letter template with Company details' },
    { id: 'rt-2', name: 'Revision letter template' },
  ]);
  const [newTplName, setNewTplName] = useState('');
  const [newReasonName, setNewReasonName] = useState('');

  // Active sub-tab in Compensation Settings
  const [compTab, setCompTab] = useState('general');
  const [trackingMethod, setTrackingMethod] = useState('employee_pay_only');
  const [roundOff, setRoundOff] = useState(false);
  const [revisionReasons, setRevisionReasons] = useState([
    { id: 'r1', name: 'Initial Salary', type: 'default' },
    { id: 'r2', name: 'Hike', type: 'revision' },
    { id: 'r3', name: 'Mid year appraisal', type: 'revision' },
    { id: 'r4', name: 'Promotion', type: 'revision' },
    { id: 'r5', name: 'Salary adjustment', type: 'revision' },
    { id: 'r6', name: 'Salary correction', type: 'correction' },
    { id: 'r7', name: 'Others', type: 'revision' },
  ]);

  // Live Payroll Domain State
  const [components, setComponents] = useState([]);
  const [ruleSets, setRuleSets] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [runSlipsPanel, setRunSlipsPanel] = useState(null);
  const [bankExportSummary, setBankExportSummary] = useState(null);
  const [employeeSalaryPreview, setEmployeeSalaryPreview] = useState(null);
  const [showDraftRuleSetForm, setShowDraftRuleSetForm] = useState(false);
  const [draftRuleSetForm, setDraftRuleSetForm] = useState({
    code: 'KENYA_STATUTORY_2026_V2',
    name: 'Kenya Statutory Framework 2026 (Draft Revision)',
    effectiveFrom: '2026-12-01',
    personalReliefMonthly: 2400,
  });
  const [reconData, setReconData] = useState(null);
  const [calcGross, setCalcGross] = useState(185000);
  const [simResult, setSimResult] = useState(null);

  // Forms for Pay Group, Component, Salary Assignment, Period
  const [payGroupForm, setPayGroupForm] = useState({ code: '', name: '', payFrequency: 'MONTHLY', cutoffDay: 20 });
  const [compForm, setCompForm] = useState({ code: '', name: '', category: 'EARNING' });
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    payGroupId: '',
    effectiveDate: '2026-11-01',
    basicSalaryKes: 120000,
    houseAllwKes: 0,
    commuterAllwKes: 0,
    changeReason: 'Initial Salary',
  });
  const [periodForm, setPeriodForm] = useState({
    payGroupId: '',
    periodNumber: 12,
    fiscalYear: 2026,
    name: 'December 2026',
    startDate: '2026-12-01',
    endDate: '2026-12-31',
  });

  const loadPayrollExtras = useCallback(async () => {
    const [cfgRes, compRes, rsRes, rolesRes] = await Promise.all([
      apiGet('/api/v1/workspace/ui-config?key=PAYROLL_WIZARD').catch(() => ({ configs: {} })),
      apiGet('/api/v1/payroll/components').catch(() => []),
      apiGet('/api/v1/payroll/rule-sets').catch(() => []),
      apiGet('/api/v1/roles').catch(() => []),
    ]);
    const saved = cfgRes?.configs?.PAYROLL_WIZARD || cfgRes?.value;
    if (saved) {
      if (saved.enabled) setWizardStep(4);
      if (saved.homeCurrency) setHomeCurrency(saved.homeCurrency);
      if (saved.currencyFormat) setCurrencyFormat(saved.currencyFormat);
      if (saved.allowSelfView !== undefined) setAllowSelfView(saved.allowSelfView);
      if (saved.trackingMethod) setTrackingMethod(saved.trackingMethod);
      if (saved.roundOff !== undefined) setRoundOff(saved.roundOff);
      if (Array.isArray(saved.revisionReasons)) setRevisionReasons(saved.revisionReasons);
      if (Array.isArray(saved.selectedCompRoles)) setSelectedCompRoles(saved.selectedCompRoles);
      if (saved.payScheduleFrequency) setPayScheduleFrequency(saved.payScheduleFrequency);
      if (saved.statutoryDefaults) setStatutoryDefaults(saved.statutoryDefaults);
      if (Array.isArray(saved.revisionTemplates)) setRevisionTemplates(saved.revisionTemplates);
    }
    setAvailableRoles(unwrapList(rolesRes));
    setComponents(unwrapList(compRes));
    setRuleSets(unwrapList(rsRes));
  }, []);

  useEffect(() => {
    loadPayrollExtras();
  }, [loadPayrollExtras]);

  useEffect(() => {
    if (!assignForm.employeeId && employees.length > 0) {
      setAssignForm((prev) => ({ ...prev, employeeId: employees[0].id }));
    }
    if (!assignForm.payGroupId && salaryStructures.length > 0) {
      setAssignForm((prev) => ({ ...prev, payGroupId: salaryStructures[0].id }));
    }
    if (!periodForm.payGroupId && salaryStructures.length > 0) {
      setPeriodForm((prev) => ({ ...prev, payGroupId: salaryStructures[0].id }));
    }
    if (!selectedRunId && payrollRuns.length > 0) {
      setSelectedRunId(payrollRuns[0].id);
    }
    if (!selectedPeriodId && payPeriods.length > 0) {
      setSelectedPeriodId(payPeriods[0].id);
    }
  }, [employees, salaryStructures, payrollRuns, payPeriods]);

  const persistWizardConfig = async (overrides = {}) => {
    const payload = {
      enabled: wizardStep === 4,
      homeCurrency,
      currencyFormat,
      allowSelfView,
      trackingMethod,
      roundOff,
      revisionReasons,
      selectedCompRoles,
      payScheduleFrequency,
      statutoryDefaults,
      revisionTemplates,
      ...overrides,
    };
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'PAYROLL_WIZARD',
        scope: 'ORG',
        value: payload,
      });
    } catch {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'PAYROLL_WIZARD',
        scope: 'USER',
        value: payload,
      }).catch(() => {});
    }
  };

  const currenciesList = [
    'KES Kenya Shillings',
    'USD United States Dollars',
    'GBP British Pound',
    'EUR Euro',
    'TZS Tanzanian Shilling',
    'UGX Uganda Shilling',
  ].filter((c) => c.toLowerCase().includes(currencySearch.toLowerCase()));

  // Show 3-Step Compensation Wizard if wizardStep < 4 and topContextTab === 'compensation' (Payroll Config Admin only)
  if (canManagePayrollConfig && topContextTab === 'compensation' && wizardStep < 4) {
    return (
      <div className="flex-1 bg-[#edf1f7] p-6 overflow-y-auto flex items-center justify-center">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[480px]">
          {/* Left Panel: Compensation Desk Illustration (01:58 of hr2.webm) */}
          <div className="lg:col-span-5 bg-[#f5f8ff] p-8 flex flex-col justify-between border-r border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Compensation</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Record and manage compensation policies, processes and data in a central space
              </p>
            </div>

            <div className="my-auto flex justify-center py-6">
              <svg viewBox="0 0 260 200" className="w-60 h-44">
                {/* Desk */}
                <line x1="20" y1="175" x2="240" y2="175" stroke="#1e293b" strokeWidth="2.5" />
                <line x1="55" y1="115" x2="215" y2="115" stroke="#1e293b" strokeWidth="2.5" />
                <line x1="70" y1="115" x2="55" y2="175" stroke="#1e293b" strokeWidth="2" />
                <line x1="195" y1="115" x2="210" y2="175" stroke="#1e293b" strokeWidth="2" />
                {/* Monitor */}
                <rect x="135" y="65" width="58" height="38" rx="4" fill="#ffffff" stroke="#1e293b" strokeWidth="2" />
                <line x1="164" y1="103" x2="164" y2="115" stroke="#1e293b" strokeWidth="2" />
                {/* Person sitting */}
                <circle cx="95" cy="58" r="11" fill="#ffffff" stroke="#1e293b" strokeWidth="2" />
                <path d="M75 112 C75 80 115 80 115 112 Z" fill="#e2e8f0" stroke="#1e293b" strokeWidth="2" />
                <path d="M82 115 L112 142 L100 172" fill="none" stroke="#ef4444" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                {/* Speech bubble */}
                <rect x="130" y="25" width="42" height="24" rx="4" fill="#ffffff" stroke="#3b82f6" strokeWidth="1.5" />
                <line x1="138" y1="34" x2="164" y2="34" stroke="#93c5fd" strokeWidth="2" />
                <line x1="138" y1="41" x2="156" y2="41" stroke="#93c5fd" strokeWidth="2" />
              </svg>
            </div>
          </div>

          {/* Right Panel: Step 0 (Overview) or Steps 1..3 */}
          <div className="lg:col-span-7 p-8 flex flex-col justify-between">
            {wizardStep === 0 && (
              <>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-1">Overview of Module</h3>
                  <p className="text-xs text-slate-500 mb-5">
                    Get to know the essential functions of the Ndakala People Compensation & Kenyan Statutory Payroll service
                  </p>
                  <div className="space-y-3 max-h-[290px] overflow-y-auto pr-1">
                    {[
                      {
                        title: 'Salary Packages',
                        desc: 'Define salary packages based on various parameters for different groups of employees.',
                      },
                      {
                        title: 'Salary Revisions',
                        desc: 'Manage the complete salary revision process, from setup to sending revision letters to employees.',
                      },
                      {
                        title: 'Reports',
                        desc: 'Access detailed compensation data, including historical insights, to guide future rewards and compensation decisions.',
                      },
                      {
                        title: 'Secure Permissions',
                        desc: 'Set fine-grained permissions to ensure data is accessible only to the appropriate employees.',
                      },
                    ].map((card) => (
                      <div
                        key={card.title}
                        className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5"
                      >
                        <div className="p-2 rounded bg-blue-50 text-[#0088ff]">
                          <DollarSign size={16} />
                        </div>
                        <div className="text-xs">
                          <p className="font-semibold text-slate-800">{card.title}</p>
                          <p className="text-slate-500 mt-1">{card.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-5 text-center">
                  <button
                    type="button"
                    onClick={() => setWizardStep(1)}
                    className="px-5 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-xs"
                  >
                    Get Started
                  </button>
                </div>
              </>
            )}

            {wizardStep > 0 && (
              <>
                {/* Stepper Header: 1 Salary Currencies --- 2 Applicability --- 3 Complete Setup (02:14 of hr2.webm) */}
                <div>
                  <div className="flex items-center justify-center gap-4 mb-8 text-xs">
                    {[
                      { step: 1, label: 'Salary Currencies' },
                      { step: 2, label: 'Applicability' },
                      { step: 3, label: 'Complete Setup' },
                    ].map((s, idx) => {
                      const done = wizardStep > s.step;
                      const curr = wizardStep === s.step;
                      return (
                        <React.Fragment key={s.step}>
                          <div className="flex flex-col items-center gap-1.5">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center font-semibold text-xs border ${
                                done
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
                                  : curr
                                  ? 'bg-[#0088ff] border-[#0088ff] text-white'
                                  : 'bg-white border-slate-300 text-slate-400'
                              }`}
                            >
                              {done ? <Check size={13} /> : s.step}
                            </div>
                            <span
                              className={`text-[11px] ${
                                curr ? 'text-slate-800 font-semibold' : 'text-slate-400'
                              }`}
                            >
                              {s.label}
                            </span>
                          </div>
                          {idx < 2 && <div className="w-16 h-[1px] bg-slate-200 -mt-4" />}
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* STEP 1: Salary Currencies (02:15 - 02:36 of hr2.webm) */}
                  {wizardStep === 1 && (
                    <div className="border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-800 text-sm">
                            Select base currency
                          </h4>
                          <p className="text-slate-500 mt-1 leading-relaxed">
                            The base currency serves as the standard for compensation-related data
                            across the organization. It ensures consistency by equating and
                            converting compensation values from different locations, enabling
                            accurate calculations and unified reporting.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-center gap-3 pt-2">
                        <label className="col-span-4 text-slate-700 font-medium">
                          Home Currency:
                        </label>
                        <div className="col-span-8 relative">
                          <button
                            type="button"
                            onClick={() => setCurrencyDropdownOpen(!currencyDropdownOpen)}
                            className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-left text-slate-800 flex items-center justify-between"
                          >
                            <span>{homeCurrency}</span>
                            <span className="text-slate-400">▾</span>
                          </button>

                          {currencyDropdownOpen && (
                            <div className="absolute left-0 right-0 bottom-11 bg-white border border-slate-300 rounded shadow-xl z-30 p-2">
                              <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 mb-2">
                                {currenciesList.map((cur) => (
                                  <button
                                    key={cur}
                                    type="button"
                                    onClick={() => {
                                      setHomeCurrency(cur);
                                      setCurrencyDropdownOpen(false);
                                    }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700"
                                  >
                                    {cur}
                                  </button>
                                ))}
                              </div>
                              <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                                <input
                                  type="text"
                                  value={currencySearch}
                                  onChange={(e) => setCurrencySearch(e.target.value)}
                                  placeholder="kes"
                                  className="w-full pl-8 pr-2 py-1 border border-slate-200 rounded text-xs"
                                  autoFocus
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-12 items-center gap-3">
                        <label className="col-span-4 text-slate-700 font-medium">
                          Currency Format:
                        </label>
                        <div className="col-span-8">
                          <select
                            value={currencyFormat}
                            onChange={(e) => setCurrencyFormat(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-slate-800"
                          >
                            <option value="1,234,567,89.00">1,234,567,89.00</option>
                            <option value="12,34,56,789.00">12,34,56,789.00</option>
                            <option value="123.456.789,00">123.456.789,00</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: Applicability (02:37 - 02:46 of hr2.webm) */}
                  {wizardStep === 2 && (
                    <div className="border border-slate-200 rounded-xl p-6 space-y-5 text-xs">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700">
                          <Lock size={20} />
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-800 text-sm">Applicability</h4>
                          <p className="text-slate-500 mt-1 leading-relaxed">
                            Select the roles that can access the Compensation service. Only
                            employees belonging to the selected roles can view and administer this
                            service in Ndakala People.
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-medium mb-1.5">
                          Select Authorized Roles ({selectedCompRoles.length} selected)
                        </label>
                        <div className="grid grid-cols-2 gap-2 p-3 border border-slate-200 rounded bg-slate-50/50 max-h-40 overflow-y-auto">
                          {(availableRoles.length > 0
                            ? availableRoles
                            : [
                                { id: 'SUPER_ADMIN', code: 'SUPER_ADMIN', name: 'Super Administrator' },
                                { id: 'HR_ADMIN', code: 'HR_ADMIN', name: 'HR Administrator' },
                                { id: 'FINANCE_PAYROLL', code: 'FINANCE_PAYROLL', name: 'Finance & Payroll' },
                                { id: 'LINE_MANAGER', code: 'LINE_MANAGER', name: 'Line Manager' },
                                { id: 'EMPLOYEE', code: 'EMPLOYEE', name: 'Employee Self-Service' },
                              ]
                          ).map((role) => {
                            const roleKey = role.code || role.name || role.id;
                            const isSelected = selectedCompRoles.includes(roleKey);
                            return (
                              <label key={role.id || roleKey} className="flex items-center gap-2 cursor-pointer text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    const next = isSelected
                                      ? selectedCompRoles.filter((r) => r !== roleKey)
                                      : [...selectedCompRoles, roleKey];
                                    setSelectedCompRoles(next);
                                  }}
                                  className="rounded text-[#0088ff]"
                                />
                                <span>{role.name || roleKey}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <label className="flex items-center gap-2.5 p-3 border border-slate-200 rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowSelfView}
                          onChange={(e) => setAllowSelfView(e.target.checked)}
                          className="rounded text-[#0088ff]"
                        />
                        <span className="text-slate-600">
                          Employees in the selected roles will be able to view their own
                          compensation data.
                        </span>
                      </label>
                    </div>
                  )}

                  {/* STEP 3: Complete Setup (02:47 - 02:56 of hr2.webm) */}
                  {wizardStep === 3 && (
                    <div className="border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
                      <div>
                        <p className="font-semibold text-slate-800 mb-1.5">
                          Who can view the compensation service?
                        </p>
                        <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600">
                          Employees can see their own compensation data if their roles have been
                          selected under module applicability. They can view others' data if their
                          role has the permission for it.
                        </div>
                      </div>

                      <div>
                        <p className="font-semibold text-slate-800 mb-1.5">
                          Who are the administrators for the compensation service?
                        </p>
                        <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600">
                          Only the administrators you have selected as compensation administrators
                          will have privileges to add, edit and modify compensation data.
                        </div>
                      </div>

                      <div className="p-3.5 rounded border border-slate-200 bg-slate-50/50 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800">Default Pay Frequency</span>
                          <select
                            value={payScheduleFrequency}
                            onChange={(e) => setPayScheduleFrequency(e.target.value)}
                            className="px-3 py-1 border border-slate-300 rounded bg-white text-xs"
                          >
                            <option value="MONTHLY">Monthly (Kenya Standard)</option>
                            <option value="BIWEEKLY">Bi-Weekly</option>
                          </select>
                        </div>
                        <div className="flex flex-wrap gap-4 pt-1">
                          {[
                            { key: 'paye', label: 'KRA PAYE (Graduated)' },
                            { key: 'nssf', label: 'NSSF Tier I & II' },
                            { key: 'shif', label: 'SHIF (2.75%)' },
                            { key: 'ahl', label: 'Housing Levy (1.5%)' },
                          ].map((st) => (
                            <label key={st.key} className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
                              <input
                                type="checkbox"
                                checked={Boolean(statutoryDefaults[st.key])}
                                onChange={(e) =>
                                  setStatutoryDefaults({ ...statutoryDefaults, [st.key]: e.target.checked })
                                }
                                className="rounded text-[#0088ff]"
                              />
                              <span>{st.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="p-3.5 rounded border border-amber-200 bg-[#fff8eb] text-slate-700 space-y-1">
                        <p className="font-semibold text-amber-700">Notes:</p>
                        <p className="text-[11px]">
                          1. Date of joining must be updated in the employee form to be able to add
                          salary in compensation
                        </p>
                        <p className="text-[11px]">
                          2. Only the super administrator can add or update self data
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-5 flex items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (wizardStep < 3) {
                        setWizardStep(wizardStep + 1);
                      } else {
                        setWizardStep(4);
                        await persistWizardConfig({ enabled: true });
                        onShowToast && onShowToast(`Compensation module enabled with ${homeCurrency}.`);
                      }
                    }}
                    className="px-5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
                  >
                    {wizardStep < 3 ? 'Next' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWizardStep(0)}
                    className="px-5 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== COMPENSATION SETTINGS & KENYAN STATUTORY PAYROLL (03:00 - 03:15 of hr2.webm) ====================
  const visibleSidebarTabs = canManagePayroll
    ? COMP_SIDEBAR_TABS
    : [{ id: 'payrollruns', label: 'My Payslips & Tax Summary' }];
  const activeLeftTab = !canManagePayroll
    ? 'payrollruns'
    : topContextTab === 'payrollruns'
    ? 'payrollruns'
    : compTab;

  // Compute Kenyan statutory deductions for 2026 calculator preview (matches KENYA_STATUTORY_2026 rules)
  const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
  const nssf = calcGross > 0 ? round2(Math.min(calcGross * 0.06, 6480)) : 0;
  const shif = calcGross > 0 ? round2(Math.max(calcGross * 0.0275, 300)) : 0;
  const ahl = calcGross > 0 ? round2(calcGross * 0.015) : 0;
  const taxable = Math.max(0, round2(calcGross - nssf - ahl));
  const computePaye2026 = (taxInc, shifAmt) => {
    if (taxInc <= 0) return 0;
    const bands = [
      [0, 24000, 0.1],
      [24000, 32333.33, 0.25],
      [32333.33, 500000, 0.3],
      [500000, 800000, 0.325],
      [800000, Infinity, 0.35],
    ];
    let grossTax = 0;
    for (const [from, to, rate] of bands) {
      if (taxInc > from) grossTax += (Math.min(taxInc, to) - from) * rate;
    }
    const insRelief = Math.min(shifAmt * 0.15, 5000);
    return Math.max(0, round2(grossTax - 2400 - insRelief));
  };
  const paye = computePaye2026(taxable, shif);
  const netPay = Math.max(0, round2(calcGross - nssf - shif - ahl - paye));

  const getSlipItemAmount = (slip, codePrefix) => {
    const items = Array.isArray(slip?.lineItems) ? slip.lineItems : [];
    const match = items.find((li) => li.componentCode === codePrefix || li.componentCode?.startsWith(codePrefix));
    return match ? Number(match.amount || 0) : null;
  };
  const getSlipDeductionSummary = (slip) => {
    const payeAmt = getSlipItemAmount(slip, 'PAYE') ?? Number(slip.payeTax || 0);
    const nssfAmt = getSlipItemAmount(slip, 'NSSF_EE') ?? Number(slip.nssfDeduction || 0);
    const shifAmt = getSlipItemAmount(slip, 'SHIF_EE') ?? Number(slip.shifDeduction || 0);
    const ahlAmt = getSlipItemAmount(slip, 'AHL_EE') ?? Number(slip.housingLevy || 0);
    return { payeAmt, statutoryOther: round2(nssfAmt + shifAmt + ahlAmt) };
  };

  return (
    <div className="flex flex-1 h-full bg-[#edf1f7] overflow-hidden">
      {/* Left Sub-Sidebar (General | Currencies | Revision Letter Templates | Revision Reasons | Payroll) */}
      <div className="w-[225px] bg-[#f8f9fc] border-r border-slate-200 flex flex-col justify-between flex-shrink-0 select-none">
        <div className="p-2.5 space-y-0.5">
          {visibleSidebarTabs.map((t) => {
            const active = activeLeftTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setCompTab(t.id);
                  if (topContextTab === 'payrollruns' && t.id !== 'payrollruns') {
                    setTopContextTab && setTopContextTab('settings');
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-md text-left text-xs transition-colors ${
                  active
                    ? 'bg-[#e6e9f4] text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/50 font-medium'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {canManagePayroll && (
          <div className="p-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setCompTab('payrollruns');
                setTopContextTab && setTopContextTab('payrollruns');
              }}
              className="w-full py-2 px-3 bg-white border border-slate-300 hover:border-[#0088ff] rounded text-xs font-medium text-slate-700 flex items-center justify-center gap-2 shadow-2xs"
            >
              <ArrowLeft size={13} />
              <span>Go to Operations</span>
            </button>
          </div>
        )}
      </div>

      {/* Right Content Canvas */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {/* 1. GENERAL (03:01 - 03:04 of hr2.webm) */}
        {activeLeftTab === 'general' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Salary tracking methods</h4>
              <p className="text-slate-500 mt-0.5 mb-4">
                Select the appropriate method for storing and tracking salary information in your
                organization.
              </p>
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={trackingMethod === 'employee_pay_only'}
                    onChange={() => {
                      setTrackingMethod('employee_pay_only');
                      persistWizardConfig({ trackingMethod: 'employee_pay_only' });
                      onShowToast && onShowToast('Salary tracking method updated.');
                    }}
                    className="mt-0.5 text-[#0088ff]"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">Employee pay only</p>
                    <p className="text-slate-500">
                      Store only the employee pay (cost to the company) of employees and track
                      historical changes
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={trackingMethod === 'detailed_breakup'}
                    onChange={() => {
                      setTrackingMethod('detailed_breakup');
                      persistWizardConfig({ trackingMethod: 'detailed_breakup' });
                      onShowToast && onShowToast('Salary tracking method updated.');
                    }}
                    className="mt-0.5 text-[#0088ff]"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">
                      Detailed employee pay tracking with benefits and breakup
                    </p>
                    <p className="text-slate-500">
                      Store detailed employee pay breakup with benefits and track historical
                      changes
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Round-off employee salaries</h4>
              <p className="text-slate-500 mt-0.5 mb-4">
                When enabled, salary values will be rounded to the nearest whole number. When
                disabled, salaries will be stored and displayed with up to two decimal places.
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const next = !roundOff;
                    setRoundOff(next);
                    persistWizardConfig({ roundOff: next });
                    onShowToast && onShowToast(`Salary round-off ${next ? 'enabled' : 'disabled'}.`);
                  }}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    roundOff ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      roundOff ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-slate-700 font-medium">Enable Round-off</span>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Security</h4>
              <p className="text-slate-500 mt-0.5">
                Mask employee compensation values by default and require explicit click-to-reveal
                in shared views.
              </p>
            </div>
          </div>
        )}

        {/* 2. CURRENCIES */}
        {activeLeftTab === 'currencies' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800">Base & Multi-Currency Setup</h4>
                <p className="text-slate-500 mt-0.5">
                  Configured Home Currency: <strong>{homeCurrency}</strong> ({currencyFormat})
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWizardStep(1);
                  setTopContextTab && setTopContextTab('compensation');
                }}
                className="px-3.5 py-1.5 border border-[#0088ff] text-[#0088ff] rounded font-medium"
              >
                Re-open Setup Wizard
              </button>
            </div>
          </div>
        )}

        {/* 3. REVISION LETTER TEMPLATES */}
        {activeLeftTab === 'templates' && (
          <div className="space-y-4 max-w-5xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTplName.trim()) return;
                const next = [...revisionTemplates, { id: 'rt-' + Date.now(), name: newTplName.trim() }];
                setRevisionTemplates(next);
                setNewTplName('');
                persistWizardConfig({ revisionTemplates: next });
                onShowToast && onShowToast('Revision letter template added.');
              }}
              className="flex justify-end gap-2"
            >
              <input
                type="text"
                required
                placeholder="New letter template name..."
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 rounded bg-white text-xs w-64"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
              >
                Add Revision Letter Template
              </button>
            </form>
            <div className="bg-white rounded-md border border-slate-200 p-6 space-y-4">
              <div className="p-4 rounded border border-amber-200 bg-[#fff8eb]">
                <p className="font-semibold text-amber-700">Mail Merge limits</p>
                <p className="text-slate-600 mt-1">
                  By default, a maximum of 1000 merges can be generated per month. Check your
                  current usage report and know more about increasing merge limits.
                </p>
              </div>

              <table className="w-full text-left border-collapse border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Template name</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revisionTemplates.map((tpl) => (
                    <tr key={tpl.id}>
                      <td className="py-3 px-4 text-slate-800">{tpl.name}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const next = revisionTemplates.filter((t) => t.id !== tpl.id);
                            setRevisionTemplates(next);
                            persistWizardConfig({ revisionTemplates: next });
                            onShowToast && onShowToast('Template removed.');
                          }}
                          className="text-rose-600 hover:underline text-xs"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. REVISION REASONS */}
        {activeLeftTab === 'reasons' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="font-semibold text-slate-800">Reason Customization</h4>
                <p className="text-slate-500 mt-0.5">
                  This enables users to manage salary revision reasons efficiently by editing
                  reason names, changing their types, and deleting those no longer needed.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const reasonTitle = newReasonName.trim() || 'Annual Merit Review';
                  const next = [
                    ...revisionReasons,
                    { id: 'r-' + Date.now(), name: reasonTitle, type: 'revision' },
                  ];
                  setRevisionReasons(next);
                  setNewReasonName('');
                  persistWizardConfig({ revisionReasons: next });
                  onShowToast && onShowToast(`Added reason "${reasonTitle}".`);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Reason name..."
                  value={newReasonName}
                  onChange={(e) => setNewReasonName(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0088ff] text-white font-medium rounded"
                >
                  Add Reason
                </button>
              </form>
            </div>

            <table className="w-full text-left border-collapse border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Type ⓘ</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {revisionReasons.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 text-slate-800 font-medium">{r.name}</td>
                    <td className="py-3 px-4">
                      {r.type === 'default' ? (
                        <span className="text-slate-600">
                          Default reason used for adding salary details
                        </span>
                      ) : (
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              checked={r.type === 'revision'}
                              onChange={() => {
                                const next = [...revisionReasons];
                                next[idx].type = 'revision';
                                setRevisionReasons(next);
                                persistWizardConfig({ revisionReasons: next });
                              }}
                            />
                            <span>Salary Revision</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-slate-500">
                            <input
                              type="radio"
                              checked={r.type === 'correction'}
                              onChange={() => {
                                const next = [...revisionReasons];
                                next[idx].type = 'correction';
                                setRevisionReasons(next);
                                persistWizardConfig({ revisionReasons: next });
                              }}
                            />
                            <span>Salary Correction</span>
                          </label>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {r.type !== 'default' && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = revisionReasons.filter((x) => x.id !== r.id);
                            setRevisionReasons(next);
                            persistWizardConfig({ revisionReasons: next });
                            onShowToast && onShowToast(`Removed reason "${r.name}".`);
                          }}
                          className="text-rose-600 hover:underline text-xs"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. KENYAN STATUTORY PAYROLL RUNS & PAYSLIPS */}
        {activeLeftTab === 'payrollruns' && (
          <div className="space-y-4 max-w-6xl">
            {canManagePayroll && (
              <>
                <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">
                      Kenyan Statutory Payroll Runs (KES)
                    </h4>
                    <p className="text-slate-500 mt-0.5">
                      Automated KRA PAYE bands, NSSF Tier I & II, SHIF (2.75%), and Affordable Housing Levy (1.5%)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Select Payroll Period"
                      value={selectedPeriodId || payPeriods[0]?.id || ''}
                      onChange={(e) => setSelectedPeriodId(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      {payPeriods.map((pp) => (
                        <option key={pp.id} value={pp.id}>
                          {pp.name} ({pp.periodCode}) — {pp.status}
                        </option>
                      ))}
                    </select>
                    {canPreparePayroll && (
                      <button
                        type="button"
                        onClick={async () => {
                          const targetPeriod = payPeriods.find((p) => p.id === selectedPeriodId) || payPeriods[0];
                          if (!targetPeriod) {
                            onShowToast && onShowToast('Create a pay period in Salary & Pay Groups Setup first.', 'error');
                            return;
                          }
                          try {
                            await apiPost(`/api/v1/payroll/periods/${targetPeriod.id}/runs`, {
                              ruleSetId: ruleSets.find((r) => r.status === 'ACTIVE')?.id,
                            });
                            onShowToast && onShowToast(`Payroll run initiated for ${targetPeriod.name}.`);
                            onRefreshAll && (await onRefreshAll());
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Unable to initiate run', 'error');
                          }
                        }}
                        className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                      >
                        + Initiate Payroll Run
                      </button>
                    )}
                  </div>
                </div>

                {/* Payroll Runs Maker-Checker Lifecycle Table */}
                <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-800 flex items-center justify-between">
                    <span>Payroll Cycles & Maker-Checker Actions ({payrollRuns.length})</span>
                    <span className="text-[11px] text-slate-500">Periods Open: {payPeriods.length}</span>
                  </div>
                  {payrollRuns.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">No payroll runs recorded yet.</div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {payrollRuns.map((run) => {
                        const isSelfPreparer = Boolean(run.preparerId && currentUser?.id && run.preparerId === currentUser.id);
                        return (
                        <div key={run.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono font-bold text-slate-900">Run #{run.runNumber || run.id.slice(0, 8)}</span>
                              <span className="font-semibold text-slate-800">{run.period?.name || 'Pay Period'}</span>
                              {run.runType === 'ADJUSTMENT' && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  ADJUSTMENT
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                run.status === 'LOCKED' ? 'bg-slate-900 text-white' :
                                run.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                                run.status === 'UNDER_REVIEW' || run.status === 'REVIEWED' || run.status === 'SUBMITTED' ? 'bg-amber-50 text-amber-800' :
                                'bg-blue-50 text-[#0088ff]'
                              }`}>{run.status}</span>
                              {run.auditHash && (
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" title={run.auditHash}>
                                  SHA-256: {run.auditHash.slice(0, 12)}...
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              Employees: {run.totalEmployeesCount || 0} • Gross: KES {Number(run.totalGrossPay || 0).toLocaleString()} • Net: KES {Number(run.totalNetPay || 0).toLocaleString()} • PAYE: KES {Number(run.totalPAYE ?? run.totalPaye ?? 0).toLocaleString()}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {canPreparePayroll && (run.status === 'DRAFT' || run.status === 'CALCULATED') && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/payroll/runs/${run.id}/calculate`, {});
                                    onShowToast && onShowToast('Run calculated.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Calculation failed', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#0088ff] text-white rounded font-medium"
                              >
                                Calculate
                              </button>
                            )}
                            {(canPreparePayroll || canReviewPayroll) && run.status === 'CALCULATED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/payroll/runs/${run.id}/submit`, {});
                                    onShowToast && onShowToast('Run submitted for Partner approval.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Submit failed', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium"
                              >
                                Submit
                              </button>
                            )}
                            {canApprovePayroll && (run.status === 'UNDER_REVIEW' || run.status === 'SUBMITTED' || run.status === 'CALCULATED') && (
                              isSelfPreparer ? (
                                <span
                                  title="Maker-Checker enforced: Preparer cannot approve their own payroll run"
                                  className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-medium cursor-not-allowed"
                                >
                                  Maker-Checker: Self-Approval Blocked
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await apiPost(`/api/v1/payroll/runs/${run.id}/approve`, {});
                                      onShowToast && onShowToast('Run approved (Maker-Checker verified).');
                                      onRefreshAll && (await onRefreshAll());
                                    } catch (err) {
                                      onShowToast && onShowToast(err?.message || 'Approve failed', 'error');
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-emerald-600 text-white rounded font-medium"
                                >
                                  Approve
                                </button>
                              )
                            )}
                            {canLockPayroll && run.status === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/payroll/runs/${run.id}/lock`, {});
                                    onShowToast && onShowToast('Payroll run locked cleanly.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Lock failed', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 bg-slate-900 text-white rounded font-medium"
                              >
                                Lock Run
                              </button>
                            )}
                            {canViewPayrollReports && Number(run.totalEmployeesCount || 0) > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const slipsRes = await apiGet(`/api/v1/payroll/runs/${run.id}/slips`);
                                    setRunSlipsPanel({ run, slips: unwrapList(slipsRes) });
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Unable to load payslips', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 inline-flex items-center gap-1"
                              >
                                <Eye size={12} /> View Slips
                              </button>
                            )}
                            {canViewPayrollReports && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const rec = await apiPost(`/api/v1/payroll/runs/${run.id}/reconcile`, {});
                                    setReconData(rec);
                                    onShowToast && onShowToast('Reconciliation variance report generated.');
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Reconcile error', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50"
                              >
                                Reconcile
                              </button>
                            )}
                            {canExportPayroll && Number(run.totalEmployeesCount || 0) > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await apiPost(`/api/v1/payroll/runs/${run.id}/export-bank`, { bankFormatCode: 'STANDARD_EFT_CSV' });
                                    if (res?.csvContent) {
                                      const blob = new Blob([res.csvContent], { type: 'text/csv' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = res.fileName || `eft-schedule-${run.id}.csv`;
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    }
                                    setBankExportSummary({
                                      fileName: res?.fileName || `eft-schedule-${run.id}.csv`,
                                      totalAmount: res?.totalAmount || 0,
                                      recordCount: res?.recordCount || 0,
                                      fileChecksum: res?.exportRecord?.fileChecksum || '',
                                      notice: res?.notice || 'Bank transfer schedule exported.',
                                      scheduleRows: res?.scheduleRows || [],
                                    });
                                    onShowToast && onShowToast('Bank EFT schedule exported.');
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Export restricted', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-slate-300 rounded hover:bg-slate-50 inline-flex items-center gap-1"
                              >
                                <Download size={12} /> Bank EFT
                              </button>
                            )}
                            {canAdjustPayroll && run.status === 'LOCKED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/payroll/runs/${run.id}/adjust`, { notes: 'Post-lock delta adjustment' });
                                    onShowToast && onShowToast('Adjustment run initiated.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Adjustment blocked', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-amber-300 text-amber-800 rounded"
                              >
                                Adjust
                              </button>
                            )}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {bankExportSummary && (
                  <div className="bg-emerald-50/70 rounded-md border border-emerald-200 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-emerald-900">
                        Bank EFT Export Confirmed — {bankExportSummary.fileName}
                      </h4>
                      <button type="button" onClick={() => setBankExportSummary(null)} className="text-emerald-700 hover:underline">Close</button>
                    </div>
                    <p className="text-emerald-800">{bankExportSummary.notice}</p>
                    <div className="text-[11px] font-mono text-emerald-900">
                      Records: {bankExportSummary.recordCount} • Total Net: KES {Number(bankExportSummary.totalAmount || 0).toLocaleString()} • SHA-256 Checksum: {bankExportSummary.fileChecksum}
                    </div>
                  </div>
                )}

                {runSlipsPanel && (
                  <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <span className="font-semibold text-slate-800">
                        Generated Payslips — Run #{runSlipsPanel.run?.runNumber} ({runSlipsPanel.run?.period?.name || 'Period'}, {runSlipsPanel.slips.length} employees)
                      </span>
                      <button type="button" onClick={() => setRunSlipsPanel(null)} className="text-slate-500 hover:text-slate-800">Close</button>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2 px-4">Employee</th>
                          <th className="py-2 px-4">Bank (Masked)</th>
                          <th className="py-2 px-4">Gross Pay (KES)</th>
                          <th className="py-2 px-4">PAYE</th>
                          <th className="py-2 px-4">NSSF + SHIF + AHL</th>
                          <th className="py-2 px-4">Net Pay (KES)</th>
                          <th className="py-2 px-4 text-right">Statement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {runSlipsPanel.slips.map((ps) => {
                          const { payeAmt, statutoryOther } = getSlipDeductionSummary(ps);
                          return (
                            <tr key={ps.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-4 font-medium text-slate-800">
                                {ps.employeeName} <span className="font-mono text-[10px] text-slate-400">({ps.employeeRef})</span>
                              </td>
                              <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">{ps.accountNumberMasked || '****0000'}</td>
                              <td className="py-2.5 px-4">{Number(ps.grossPay || 0).toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-rose-600">{payeAmt.toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-slate-600">{statutoryOther.toLocaleString()}</td>
                              <td className="py-2.5 px-4 font-bold text-emerald-700">{Number(ps.netPay || 0).toLocaleString()}</td>
                              <td className="py-2.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => onOpenPayslipModal && onOpenPayslipModal(ps)}
                                  className="inline-flex items-center gap-1 text-[#0088ff] hover:underline font-medium"
                                >
                                  <Eye size={13} />
                                  <span>View Payslip</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {reconData && (
                  <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-slate-800">Reconciliation Snapshot Summary</h4>
                      <button type="button" onClick={() => setReconData(null)} className="text-slate-400 hover:text-slate-700">Close</button>
                    </div>
                    <pre className="p-3 bg-slate-50 rounded text-[11px] font-mono overflow-x-auto">{JSON.stringify(reconData, null, 2)}</pre>
                  </div>
                )}
              </>
            )}

            {!canManagePayroll && (
              <div className="bg-white rounded-md border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-800">My Statutory Payslips & Tax Summary</h4>
                <p className="text-slate-500 mt-0.5">
                  Personal itemized Kenyan PAYE, NSSF Tier I & II, SHIF, and Affordable Housing Levy statements.
                </p>
              </div>
            )}

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              {payslips.length === 0 ? (
                <NdakalaEmptyState
                  title="No Payslips Generated Yet"
                  subtitle="Initiate or calculate a payroll run to generate itemized KES statutory payslips."
                />
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4">Employee / Period</th>
                      <th className="py-2.5 px-4">Gross Pay (KES)</th>
                      <th className="py-2.5 px-4">PAYE</th>
                      <th className="py-2.5 px-4">NSSF + SHIF + AHL</th>
                      <th className="py-2.5 px-4">Net Pay (KES)</th>
                      <th className="py-2.5 px-4 text-right">Statement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payslips.map((ps) => {
                      const { payeAmt, statutoryOther } = getSlipDeductionSummary(ps);
                      return (
                      <tr key={ps.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-medium text-slate-800">
                          <div>{ps.employeeName || (ps.employee ? `${ps.employee.firstName} ${ps.employee.lastName}` : ps.employeeId)}</div>
                          <div className="text-[10px] text-slate-400">
                            {ps.period?.name || 'Monthly Payroll'} {ps.employeeRef ? `• ${ps.employeeRef}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-4">{Number(ps.grossPay || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-rose-600">{payeAmt.toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-slate-600">{statutoryOther.toLocaleString()}</td>
                        <td className="py-2.5 px-4 font-bold text-emerald-700">{Number(ps.netPay || 0).toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenPayslipModal && onOpenPayslipModal(ps)}
                            className="inline-flex items-center gap-1 text-[#0088ff] hover:underline font-medium"
                          >
                            <Eye size={13} />
                            <span>View Payslip</span>
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 5B. SALARY ASSIGNMENT, PAY GROUPS, COMPONENTS & PERIODS */}
        {activeLeftTab === 'salaries' && (
          <div className="space-y-4 max-w-5xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {canManagePayrollConfig && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiPost('/api/v1/payroll/pay-groups', {
                        ...payGroupForm,
                        cutoffDay: Number(payGroupForm.cutoffDay) || 20,
                      });
                      setPayGroupForm({ code: '', name: '', payFrequency: 'MONTHLY', cutoffDay: 20 });
                      onShowToast && onShowToast('Pay Group created.');
                      onRefreshAll && (await onRefreshAll());
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Failed to create pay group', 'error');
                    }
                  }}
                  className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5"
                >
                  <h4 className="font-semibold text-slate-800">Create Pay Group ({salaryStructures.length})</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input required placeholder="Code (e.g. EXEC)" value={payGroupForm.code} onChange={(e) => setPayGroupForm({ ...payGroupForm, code: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                    <input required placeholder="Name" value={payGroupForm.name} onChange={(e) => setPayGroupForm({ ...payGroupForm, name: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {salaryStructures.map((pg) => (
                      <span key={pg.id} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">
                        {pg.code} • {pg.name}
                      </span>
                    ))}
                  </div>
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Create Pay Group</button>
                </form>
              )}

              {canPreparePayroll && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiPost('/api/v1/payroll/periods', {
                        ...periodForm,
                        periodNumber: Number(periodForm.periodNumber),
                        fiscalYear: Number(periodForm.fiscalYear),
                      });
                      onShowToast && onShowToast('Payroll Period created.');
                      onRefreshAll && (await onRefreshAll());
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Failed to create period', 'error');
                    }
                  }}
                  className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5"
                >
                  <h4 className="font-semibold text-slate-800">Open New Pay Period ({payPeriods.length})</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <select value={periodForm.payGroupId} onChange={(e) => setPeriodForm({ ...periodForm, payGroupId: e.target.value })} className="px-2 py-1.5 border rounded bg-white">
                      {salaryStructures.map((pg) => <option key={pg.id} value={pg.id}>{pg.code}</option>)}
                    </select>
                    <input required placeholder="Period Name" value={periodForm.name} onChange={(e) => setPeriodForm({ ...periodForm, name: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                    <input type="number" min="1" max="12" value={periodForm.periodNumber} onChange={(e) => setPeriodForm({ ...periodForm, periodNumber: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {payPeriods.map((pp) => (
                      <span key={pp.id} className="px-2 py-0.5 bg-slate-100 rounded text-[11px] text-slate-700">
                        {pp.periodCode} ({pp.status})
                      </span>
                    ))}
                  </div>
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Open Pay Period</button>
                </form>
              )}
            </div>

            {canManagePayrollConfig && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const compsPayload = { BASIC: Number(assignForm.basicSalaryKes) || 0 };
                    if (Number(assignForm.houseAllwKes) > 0) compsPayload.HOUSE_ALLW = Number(assignForm.houseAllwKes);
                    if (Number(assignForm.commuterAllwKes) > 0) compsPayload.COMMUTER_ALLW = Number(assignForm.commuterAllwKes);
                    await apiPost('/api/v1/payroll/salaries/assign', {
                      employeeId: assignForm.employeeId,
                      payGroupId: assignForm.payGroupId || undefined,
                      effectiveDate: assignForm.effectiveDate,
                      components: compsPayload,
                      changeReason: assignForm.changeReason,
                    });
                    onShowToast && onShowToast('Employee compensation assigned cleanly.');
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Salary assignment failed', 'error');
                  }
                }}
                className="bg-white rounded-md border border-slate-200 p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">Assign Employee Salary Package</span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!assignForm.employeeId) return;
                      try {
                        const sal = await apiGet(`/api/v1/payroll/salaries/employee/${assignForm.employeeId}`);
                        setEmployeeSalaryPreview(sal);
                        onShowToast && onShowToast('Loaded active effective-dated salary assignment.');
                      } catch (err) {
                        setEmployeeSalaryPreview(null);
                        onShowToast && onShowToast(err?.message || 'No active salary assignment found', 'error');
                      }
                    }}
                    className="px-3 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-50"
                  >
                    Inspect Current Package
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-slate-500 mb-1">Employee</label>
                    <select value={assignForm.employeeId} onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white">
                      {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName} {em.lastName} ({em.employeeNumber})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Basic (KES)</label>
                    <input type="number" required value={assignForm.basicSalaryKes} onChange={(e) => setAssignForm({ ...assignForm, basicSalaryKes: e.target.value })} className="w-full px-2.5 py-1.5 border rounded" />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">House Allw (KES)</label>
                    <input type="number" min="0" value={assignForm.houseAllwKes} onChange={(e) => setAssignForm({ ...assignForm, houseAllwKes: e.target.value })} className="w-full px-2.5 py-1.5 border rounded" />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Commuter (KES)</label>
                    <input type="number" min="0" value={assignForm.commuterAllwKes} onChange={(e) => setAssignForm({ ...assignForm, commuterAllwKes: e.target.value })} className="w-full px-2.5 py-1.5 border rounded" />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Revision Reason</label>
                    <select value={assignForm.changeReason} onChange={(e) => setAssignForm({ ...assignForm, changeReason: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white">
                      {revisionReasons.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded font-medium">Assign Salary</button>
                </div>
                {employeeSalaryPreview && (
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 text-[11px] font-mono">
                    Active Package ({employeeSalaryPreview.status}, Effective {employeeSalaryPreview.effectiveDate?.slice(0, 10)}): Total Gross KES {Number(employeeSalaryPreview.totalGrossSalary || 0).toLocaleString()} • Breakdown: {employeeSalaryPreview.components}
                  </div>
                )}
              </form>
            )}
          </div>
        )}

        {/* 5C. STATUTORY RULE SETS */}
        {activeLeftTab === 'rulesets' && (
          <div className="bg-white rounded-md border border-slate-200 p-5 max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-800">Configured Kenyan Statutory Rule Sets ({ruleSets.length})</h4>
              {canManagePayrollConfig && (
                <button
                  type="button"
                  onClick={() => setShowDraftRuleSetForm((v) => !v)}
                  className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium inline-flex items-center gap-1"
                >
                  <Plus size={13} /> Propose Draft Rule Set
                </button>
              )}
            </div>

            {showDraftRuleSetForm && canManagePayrollConfig && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const baseRs = ruleSets.find((r) => r.status === 'ACTIVE') || ruleSets[0];
                    const clonedRules = (baseRs?.rules || []).map((r) => {
                      let parsed = typeof r.parameters === 'string' ? JSON.parse(r.parameters) : r.parameters;
                      if (r.code === 'PAYE' && parsed) {
                        parsed = { ...parsed, personalReliefMonthly: Number(draftRuleSetForm.personalReliefMonthly) || 2400 };
                      }
                      return {
                        code: r.code,
                        name: r.name,
                        category: r.category,
                        algorithmType: r.algorithmType,
                        parameters: parsed,
                        deductibleFromTaxablePay: Boolean(r.deductibleFromTaxablePay),
                        reliefPercentage: r.reliefPercentage ?? undefined,
                        reliefMaxMonthly: r.reliefMaxMonthly ?? undefined,
                        isEmployeeDeduction: Boolean(r.isEmployeeDeduction),
                        isEmployerContribution: Boolean(r.isEmployerContribution),
                        roundingRule: r.roundingRule || 'ROUND_HALF_UP',
                        priority: r.priority || 10,
                      };
                    });
                    await apiPost('/api/v1/payroll/rule-sets', {
                      code: draftRuleSetForm.code.trim(),
                      name: draftRuleSetForm.name.trim(),
                      countryCode: 'KE',
                      effectiveFrom: draftRuleSetForm.effectiveFrom,
                      description: 'Draft statutory revision proposed for Maker-Checker review',
                      rules: clonedRules,
                    });
                    setShowDraftRuleSetForm(false);
                    onShowToast && onShowToast('Draft statutory rule set proposed (pending distinct partner activation).');
                    await loadPayrollExtras();
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Failed to propose rule set', 'error');
                  }
                }}
                className="p-4 rounded border border-blue-200 bg-blue-50/40 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-slate-600 mb-1">Rule Set Code</label>
                  <input required value={draftRuleSetForm.code} onChange={(e) => setDraftRuleSetForm({ ...draftRuleSetForm, code: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white" />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Name</label>
                  <input required value={draftRuleSetForm.name} onChange={(e) => setDraftRuleSetForm({ ...draftRuleSetForm, name: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white" />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Personal Relief (KES/mo)</label>
                  <input type="number" value={draftRuleSetForm.personalReliefMonthly} onChange={(e) => setDraftRuleSetForm({ ...draftRuleSetForm, personalReliefMonthly: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white" />
                </div>
                <button type="submit" className="px-4 py-1.5 bg-emerald-600 text-white rounded font-medium">Submit Draft</button>
              </form>
            )}

            <div className="divide-y divide-slate-100">
              {ruleSets.map((rs) => {
                const isSelfProposer = Boolean(rs.proposedById && currentUser?.id && rs.proposedById === currentUser.id);
                return (
                <div key={rs.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">{rs.code} — {rs.name}</div>
                    <div className="text-[11px] text-slate-500">
                      Status: <span className="font-semibold">{rs.status}</span> • Version: {rs.version} • Effective: {rs.effectiveFrom?.slice(0, 10)} • Rules: {(rs.rules || []).map((r) => r.code).join(', ')}
                    </div>
                  </div>
                  {rs.status !== 'ACTIVE' && canManagePayrollConfig && (
                    isSelfProposer ? (
                      <span
                        title="Maker-Checker enforced: Proposer cannot self-activate their own rule set"
                        className="px-2.5 py-1 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[11px] font-medium cursor-not-allowed"
                      >
                        Maker-Checker: Proposer Cannot Self-Activate
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPost(`/api/v1/payroll/rule-sets/${rs.id}/activate`, {});
                            onShowToast && onShowToast('Rule set activated.');
                            await loadPayrollExtras();
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Activation failed', 'error');
                          }
                        }}
                        className="px-3 py-1 bg-[#0088ff] text-white rounded font-medium"
                      >
                        Activate Rule Set
                      </button>
                    )
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. PAYE / SHIF / AHL CALCULATOR (Wired to live /payroll/simulate) */}
        {activeLeftTab === 'calculator' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">
                Kenyan Statutory Compensation & Tax Simulator (KES)
              </h4>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await apiPost('/api/v1/payroll/simulate', {
                      ruleSetId: ruleSets.find((r) => r.status === 'ACTIVE')?.id,
                      testEmployees: [
                        {
                          employeeId: 'SIM-01',
                          employeeName: 'Ndakala Staff Simulation',
                          employeeRef: 'SIM-01',
                          salaryComponents: { BASIC: Number(calcGross) || 0 },
                        },
                      ],
                    });
                    setSimResult(res);
                    onShowToast && onShowToast('Verified against live statutory engine.');
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Simulation error', 'error');
                  }
                }}
                className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Run Backend Tax Engine
              </button>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1.5">
                Monthly Gross Salary (KES)
              </label>
              <input
                type="number"
                value={calcGross}
                onChange={(e) => setCalcGross(Number(e.target.value))}
                className="w-64 px-3 py-2 border border-slate-300 rounded font-semibold text-slate-800"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <p className="text-slate-400">NSSF (Tier I & II)</p>
                <p className="font-semibold text-slate-800 mt-0.5">KES {nssf.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <p className="text-slate-400">SHIF (2.75%)</p>
                <p className="font-semibold text-slate-800 mt-0.5">KES {shif.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded border border-slate-200">
                <p className="text-slate-400">Housing Levy (1.5%)</p>
                <p className="font-semibold text-slate-800 mt-0.5">KES {ahl.toLocaleString()}</p>
              </div>
              <div className="p-3 bg-rose-50 rounded border border-rose-200">
                <p className="text-rose-500">Estimated PAYE</p>
                <p className="font-semibold text-rose-700 mt-0.5">KES {paye.toLocaleString()}</p>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between">
              <span className="font-semibold text-emerald-900">Estimated Net Take-Home Pay</span>
              <span className="text-base font-bold text-emerald-700">KES {netPay.toLocaleString()}</span>
            </div>
            {simResult && (
              <pre className="p-3 bg-slate-50 rounded border text-[11px] font-mono overflow-x-auto">
                {JSON.stringify(simResult, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
