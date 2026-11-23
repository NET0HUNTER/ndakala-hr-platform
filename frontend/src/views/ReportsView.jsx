import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Download,
  RefreshCw,
  Users,
  Clock,
  DollarSign,
  Trophy,
  Umbrella,
  ShieldCheck,
  Lock,
  Activity,
  Check,
  X,
  ArrowLeft,
  Eye,
  FileText,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPut, apiDownload } from '../utils/api';
import ReportsCataloguePanel from './ReportsCataloguePanel';

const REPORT_DOMAINS = [
  { id: 'catalogue', label: '50-Report Catalogue', icon: FileText },
  { id: 'summary', label: 'Executive Summary', icon: Activity },
  { id: 'timetracker', label: 'Timesheet & Profitability', icon: Clock },
  { id: 'workforce', label: 'Workforce & Career', icon: Users },
  { id: 'leave', label: 'Leave & Absences', icon: Umbrella },
  { id: 'payroll', label: 'Payroll & Statutory KES', icon: DollarSign },
  { id: 'performance', label: 'Performance & PIPs', icon: Trophy },
  { id: 'governance', label: 'Governance, Privacy & Audit', icon: ShieldCheck },
];

export default function ReportsView({
  topContextTab = 'orgreports',
  onOpenPayslipModal,
  onShowToast,
}) {
  const scope =
    topContextTab === 'myreports' ? 'my' : topContextTab === 'teamreports' ? 'team' : 'org';

  const [activeDomain, setActiveDomain] = useState('summary');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-11-30');
  const [loading, setLoading] = useState(false);

  const [summaryData, setSummaryData] = useState(null);
  const [domainData, setDomainData] = useState(null);

  // Access Permissions State (persisted via PUT /api/v1/reports/permissions)
  const [accessPermMode, setAccessPermMode] = useState(false);
  const [permSubTab, setPermSubTab] = useState('my');
  const [permMatrix, setPermMatrix] = useState({
    my: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: true, governance: true },
    team: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: false, governance: true },
    org: { enabled: true, empInfo: true, leaveTracker: true, timeTracker: true, performance: true, payroll: true, governance: true },
  });

  const loadReport = useCallback(async () => {
    if (activeDomain === 'catalogue') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ scope, startDate, endDate, search }).toString();
      if (activeDomain === 'summary') {
        const res = await apiGet(`/api/v1/reports/summary?${qs}`);
        setSummaryData(res);
      } else {
        const res = await apiGet(`/api/v1/reports/${activeDomain}?${qs}`);
        setDomainData(res ? { __domain: activeDomain, ...res } : null);
      }
    } catch (err) {
      onShowToast && onShowToast(err.message || 'Unable to load report data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeDomain, scope, startDate, endDate, search, onShowToast]);

  const loadPermissions = useCallback(async () => {
    try {
      const matrix = await apiGet('/api/v1/reports/permissions');
      if (matrix) setPermMatrix(matrix);
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    if (accessPermMode) loadPermissions();
  }, [accessPermMode, loadPermissions]);

  const handleSavePermissions = async (nextMatrix) => {
    setPermMatrix(nextMatrix);
    try {
      const saved = await apiPut('/api/v1/reports/permissions', nextMatrix);
      setPermMatrix(saved);
      onShowToast && onShowToast('Report access permissions persisted.');
    } catch (err) {
      onShowToast && onShowToast(err.message || 'Permission update requires HR Lead or Managing Partner.', 'warning');
    }
  };

  const handleExportCsv = async (domain) => {
    try {
      const qs = new URLSearchParams({ scope, startDate, endDate, search }).toString();
      const targetDomain = domain === 'summary' ? 'timetracker' : domain;
      await apiDownload(`/api/v1/reports/export/${targetDomain}?${qs}`, `Ndakala_${targetDomain}_Report.csv`);
      onShowToast && onShowToast(`Exported ${targetDomain} report CSV.`);
    } catch (err) {
      onShowToast && onShowToast(err.message || 'Export failed', 'error');
    }
  };

  const handleExportAuditLogs = async (format = 'json') => {
    try {
      await apiDownload(`/api/v1/audit-logs/export?format=${format}`, `Ndakala_Audit_Log.${format}`);
      onShowToast && onShowToast(`Audit trail exported (${format.toUpperCase()}).`);
    } catch (err) {
      onShowToast && onShowToast(err.message || 'Audit export failed', 'error');
    }
  };

  // ==================== ACCESS PERMISSIONS MODE ====================
  if (accessPermMode) {
    const activePerm = permMatrix[permSubTab] || permMatrix.my;
    return (
      <div className="flex h-full bg-[#edf1f7]">
        <div className="w-56 bg-[#f5f6fa] border-r border-slate-200 p-3 flex-shrink-0 space-y-1">
          <button
            type="button"
            onClick={() => setAccessPermMode(false)}
            className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-200/60 rounded flex items-center gap-2 mb-2"
          >
            <ArrowLeft size={14} />
            <span>Back to Live Reports</span>
          </button>
          {[
            { id: 'my', label: 'My Reports' },
            { id: 'team', label: 'Team Reports' },
            { id: 'org', label: 'Organization Reports' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPermSubTab(t.id)}
              className={`w-full px-4 py-2 rounded text-left text-xs ${
                permSubTab === t.id ? 'bg-[#e6e9f4] text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-200/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-4xl space-y-6 text-xs">
            <div className="p-4 rounded-md bg-[#f5f8ff] border border-blue-100 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleSavePermissions({
                      ...permMatrix,
                      [permSubTab]: { ...activePerm, enabled: !activePerm.enabled },
                    })
                  }
                  className={`mt-0.5 w-9 h-5 rounded-full transition-colors p-0.5 flex-shrink-0 ${
                    activePerm.enabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${activePerm.enabled ? 'translate-x-4' : ''}`} />
                </button>
                <div>
                  <p className="font-semibold text-slate-800">
                    {permSubTab === 'my' ? 'My Reports' : permSubTab === 'team' ? 'Team Reports' : 'Organization Reports'}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Persisted in Organization Policy Configuration (`REPORT_ACCESS_MATRIX`). Toggle visibility per HR domain.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { key: 'empInfo', title: 'Employee Information & Career', items: ['Headcount & Profile Completion', 'Transfers & Separations'] },
                { key: 'leaveTracker', title: 'Leave & Attendance Compliance', items: ['Leave Entitlements & Balances', 'Unexpected Absences'] },
                { key: 'timeTracker', title: 'Time Tracker & Profitability', items: ['Billability & Labor Cost', 'Project Health & Leakage', 'Capacity Utilization'] },
                { key: 'payroll', title: 'Kenyan Statutory Payroll', items: ['PAYE / NSSF / SHIF / AHL Totals', 'Payslip Register'] },
                { key: 'performance', title: 'Performance & PIPs', items: ['Appraisal Ratings & Moderation', 'Active Capability PIPs'] },
                { key: 'governance', title: 'Governance, DPA 2019 & Audit', items: ['Policy Acknowledgements', 'DSRs, Legal Holds & Audit Trail'] },
              ].map((cat) => (
                <div key={cat.key} className="space-y-2.5 p-3.5 border border-slate-200 rounded-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="font-semibold text-slate-800">{cat.title}</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSavePermissions({
                          ...permMatrix,
                          [permSubTab]: { ...activePerm, [cat.key]: !activePerm[cat.key] },
                        })
                      }
                      className={`w-8 h-4 rounded-full transition-colors p-0.5 ${
                        activePerm[cat.key] ? 'bg-[#0088ff]' : 'bg-slate-300'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform ${activePerm[cat.key] ? 'translate-x-4' : ''}`} />
                    </button>
                  </div>
                  {cat.items.map((it) => (
                    <div key={it} className="flex items-center justify-between text-slate-500 text-[11px]">
                      <span>{it}</span>
                      <Lock size={11} className="text-slate-300" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden">
      {/* Top Sub-Navigation Domain Tabs */}
      <div className="bg-white border-b border-slate-200 px-5 flex items-center space-x-5 overflow-x-auto flex-shrink-0">
        {REPORT_DOMAINS.map((dom) => {
          const Icon = dom.icon;
          const active = activeDomain === dom.id;
          return (
            <button
              key={dom.id}
              type="button"
              onClick={() => {
                if (dom.id !== activeDomain) {
                  setDomainData(null);
                  setLoading(true);
                  setActiveDomain(dom.id);
                }
              }}
              className={`relative h-[42px] flex items-center gap-2 text-xs font-medium whitespace-nowrap transition-colors ${
                active ? 'text-[#0088ff] font-semibold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon size={14} />
              <span>{dom.label}</span>
              {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
            </button>
          );
        })}
      </div>

      {/* Filter & Export Bar */}
      <div className="px-5 py-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-64">
            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter report records..."
              className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0088ff]"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-2 text-slate-400">
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded text-xs"
            />
            <span className="text-slate-500">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded text-xs"
            />
          </div>
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium uppercase text-[10px]">
            Scope: {scope}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadReport}
            disabled={loading}
            className="px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded flex items-center gap-1.5 font-medium"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => handleExportCsv(activeDomain)}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded flex items-center gap-1.5 font-medium shadow-2xs"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setAccessPermMode(true)}
            className="px-3 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium shadow-2xs"
          >
            Access Permissions
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
        {loading && (
          <div className="bg-white rounded-md border border-slate-200 p-8 text-center text-slate-500">
            Generating live report from database...
          </div>
        )}

        {/* 0. COMPLETE 50-REPORT STANDARD CATALOGUE */}
        {!loading && activeDomain === 'catalogue' && (
          <ReportsCataloguePanel
            onOpenDomain={(target) => {
              setDomainData(null);
              setActiveDomain(target);
            }}
            onExportDomain={(target) => handleExportCsv(target)}
            onShowToast={onShowToast}
          />
        )}

        {/* 1. EXECUTIVE SUMMARY */}
        {!loading && activeDomain === 'summary' && summaryData && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Total Workforce</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.workforce?.totalEmployees ?? 0}</p>
                <p className="text-[11px] text-emerald-600 mt-1">
                  {summaryData.workforce?.activeEmployees ?? 0} Active • {summaryData.workforce?.probationEmployees ?? 0} Probation
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Timesheet Billability</p>
                <p className="text-2xl font-bold text-[#0088ff] mt-1">{summaryData.timetracker?.billabilityPct ?? 0}%</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {summaryData.timetracker?.billableHours ?? 0} / {summaryData.timetracker?.totalLoggedHours ?? 0} Hrs
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Billable Revenue (KES)</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">
                  KES {Number(summaryData.timetracker?.billableRevenueKes ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-amber-600 mt-1">
                  Leakage: KES {Number(summaryData.timetracker?.nonBillableLeakageKes ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Pending Leave & Absences</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.leaveAndAbsence?.leavePending ?? 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  {summaryData.leaveAndAbsence?.absencesCount ?? 0} recorded absences
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Statutory Payroll Runs</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.payroll?.totalRuns ?? 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Latest Gross: {summaryData.payroll?.latestGrossPayKes !== null ? `KES ${Number(summaryData.payroll?.latestGrossPayKes).toLocaleString()}` : 'Restricted'}
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Appraisals & Active PIPs</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.performance?.appraisalsCount ?? 0}</p>
                <p className="text-[11px] text-rose-600 mt-1">{summaryData.performance?.activePipsCount ?? 0} active PIPs</p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">Governance & Policy Acks</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.governanceAndPrivacy?.pendingPolicyAcknowledgements ?? 0}</p>
                <p className="text-[11px] text-slate-500 mt-1">Pending policy acknowledgements</p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-500 font-medium">DPA 2019 Privacy & ER</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{summaryData.governanceAndPrivacy?.pendingDsrs ?? 0} DSRs</p>
                <p className="text-[11px] text-amber-700 mt-1">
                  {summaryData.governanceAndPrivacy?.activeLegalHolds ?? 0} Legal Holds • {summaryData.governanceAndPrivacy?.openErCases ?? 0} ER Cases
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. TIMETRACKER PROFITABILITY & UTILIZATION */}
        {!loading && activeDomain === 'timetracker' && domainData?.__domain === 'timetracker' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-400">Logged / Billable</p>
                <p className="text-lg font-bold text-slate-900 mt-1">
                  {domainData.executive?.kpis?.totalLoggedHours} / {domainData.executive?.kpis?.billableHours} hrs
                </p>
                <p className="text-[11px] text-[#0088ff]">{domainData.executive?.kpis?.billabilityPct}% Billability</p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-400">Billable Revenue</p>
                <p className="text-lg font-bold text-emerald-700 mt-1">
                  KES {Number(domainData.executive?.kpis?.billableRevenueKes ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-400">Burdened Labor Cost</p>
                <p className="text-lg font-bold text-slate-800 mt-1">
                  {domainData.executive?.kpis?.totalLaborCostKes !== null
                    ? `KES ${Number(domainData.executive?.kpis?.totalLaborCostKes).toLocaleString()}`
                    : 'Masked (RBAC)'}
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-400">Non-Billable Leakage</p>
                <p className="text-lg font-bold text-rose-600 mt-1">
                  KES {Number(domainData.executive?.kpis?.nonBillableLeakageKes ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-white p-4 rounded-md border border-slate-200">
                <p className="text-slate-400">Gross Margin %</p>
                <p className="text-lg font-bold text-indigo-700 mt-1">
                  {domainData.executive?.kpis?.grossProfitMarginPct !== null
                    ? `${domainData.executive?.kpis?.grossProfitMarginPct}%`
                    : 'Masked'}
                </p>
              </div>
            </div>

            {/* Project Budget Health Table */}
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">
                Project Budget Burn & Revenue Health Matrix
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Code</th>
                    <th className="py-2.5 px-4">Project & Client</th>
                    <th className="py-2.5 px-4">Hours (Billable %)</th>
                    <th className="py-2.5 px-4">Budget (KES)</th>
                    <th className="py-2.5 px-4">Billed Value</th>
                    <th className="py-2.5 px-4">Health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(domainData.executive?.projects || []).map((p) => {
                    const st = p.metrics?.health?.status;
                    const badgeCls =
                      st === 'OVER_BUDGET'
                        ? 'bg-rose-100 text-rose-700'
                        : st === 'ATTENTION'
                        ? 'bg-orange-100 text-orange-700'
                        : st === 'WATCH'
                        ? 'bg-amber-100 text-amber-700'
                        : st === 'NO_BUDGET'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-emerald-100 text-emerald-700';
                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">{p.code}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-[11px] text-slate-500">{p.client?.name}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          {p.metrics?.totalHours} hrs ({p.metrics?.billabilityPct}%)
                        </td>
                        <td className="py-2.5 px-4">KES {Number(p.budgetAmountKes).toLocaleString()}</td>
                        <td className="py-2.5 px-4 font-semibold text-emerald-700">
                          KES {Number(p.metrics?.billableRevenueKes || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeCls}`}>
                            {p.metrics?.health?.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mon-Fri Capacity Utilization */}
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="font-semibold text-slate-800">
                  Resource Capacity Utilization (Mon–Fri: {domainData.utilization?.workingDays} Working Days = {domainData.utilization?.expectedHoursPerEmployee} Expected Hrs)
                </span>
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-4">Employee</th>
                    <th className="py-2 px-4">Expected Hrs</th>
                    <th className="py-2 px-4">Logged Hrs</th>
                    <th className="py-2 px-4">Billable Hrs</th>
                    <th className="py-2 px-4">Utilization %</th>
                    <th className="py-2 px-4">Billability %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(domainData.utilization?.employees || []).map((e) => (
                    <tr key={e.employeeId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {e.fullName} <span className="text-[10px] text-slate-400">({e.employeeNumber})</span>
                      </td>
                      <td className="py-2.5 px-4">{e.expectedHours}</td>
                      <td className="py-2.5 px-4 font-semibold">{e.loggedHours}</td>
                      <td className="py-2.5 px-4 text-[#0088ff] font-semibold">{e.billableHours}</td>
                      <td className="py-2.5 px-4">{e.utilizationPct}%</td>
                      <td className="py-2.5 px-4">{e.billabilityPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. WORKFORCE */}
        {!loading && activeDomain === 'workforce' && domainData?.__domain === 'workforce' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-800">Workforce Directory & Career History ({domainData.rows?.length || 0})</span>
              <span className="text-slate-500">
                Transfers: {domainData.transfersCount || 0} • Separations: {domainData.separationsCount || 0}
              </span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Emp #</th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Department</th>
                  <th className="py-2.5 px-4">Position / Grade</th>
                  <th className="py-2.5 px-4">Location</th>
                  <th className="py-2.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(domainData.rows || []).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono">{r.employeeNumber}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {r.fullName} <span className="block text-[10px] text-slate-400">{r.workEmail}</span>
                    </td>
                    <td className="py-2.5 px-4">{r.department}</td>
                    <td className="py-2.5 px-4">{r.position} ({r.grade})</td>
                    <td className="py-2.5 px-4">{r.location}</td>
                    <td className="py-2.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#0088ff]">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. LEAVE & ABSENCE */}
        {!loading && activeDomain === 'leave' && domainData?.__domain === 'leave' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">
              Leave Entitlements & Balances ({domainData.balances?.length || 0})
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Employee</th>
                  <th className="py-2.5 px-4">Leave Type</th>
                  <th className="py-2.5 px-4">Year</th>
                  <th className="py-2.5 px-4">Accrued</th>
                  <th className="py-2.5 px-4">Taken</th>
                  <th className="py-2.5 px-4">Pending</th>
                  <th className="py-2.5 px-4">Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(domainData.balances || []).map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-medium text-slate-800">{b.employeeName}</td>
                    <td className="py-2.5 px-4">{b.leaveType}</td>
                    <td className="py-2.5 px-4">{b.leaveYear}</td>
                    <td className="py-2.5 px-4">{b.accruedDays}</td>
                    <td className="py-2.5 px-4">{b.takenDays}</td>
                    <td className="py-2.5 px-4">{b.pendingReservedDays}</td>
                    <td className="py-2.5 px-4 font-bold text-emerald-700">{b.closingBalanceDays} days</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5. PAYROLL */}
        {!loading && activeDomain === 'payroll' && domainData?.__domain === 'payroll' && (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">
                Statutory Payroll Runs Register (KES)
              </div>
              {(!domainData.runs || domainData.runs.length === 0) ? (
                <div className="p-6"><NdakalaEmptyState title="No Payroll Runs Found" /></div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4">Period</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Staff</th>
                      <th className="py-2.5 px-4">Gross Pay</th>
                      <th className="py-2.5 px-4">PAYE</th>
                      <th className="py-2.5 px-4">NSSF+SHIF+AHL</th>
                      <th className="py-2.5 px-4">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(domainData.runs || []).map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-4 font-medium text-slate-900">{r.periodName} (#{r.runNumber})</td>
                        <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] font-semibold text-[10px]">{r.status}</span></td>
                        <td className="py-2.5 px-4">{r.totalEmployeesCount}</td>
                        <td className="py-2.5 px-4">{Number(r.totalGrossPay).toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-rose-600">{Number(r.totalPAYE).toLocaleString()}</td>
                        <td className="py-2.5 px-4">{Number(r.totalNSSFEmployee + r.totalSHIF + r.totalHousingLevyEmployee).toLocaleString()}</td>
                        <td className="py-2.5 px-4 font-bold text-emerald-700">KES {Number(r.totalNetPay).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {domainData.slips?.length > 0 && (
              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">Payslip Register</div>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-4">Employee</th>
                      <th className="py-2 px-4">Period</th>
                      <th className="py-2 px-4">Gross</th>
                      <th className="py-2 px-4">Net Pay</th>
                      <th className="py-2 px-4 text-right">Payslip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(domainData.slips || []).map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2 px-4 font-medium">{s.employeeName}</td>
                        <td className="py-2 px-4">{s.period?.name}</td>
                        <td className="py-2 px-4">{Number(s.grossPay).toLocaleString()}</td>
                        <td className="py-2 px-4 font-bold text-emerald-700">KES {Number(s.netPay).toLocaleString()}</td>
                        <td className="py-2 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onOpenPayslipModal && onOpenPayslipModal(s)}
                            className="text-[#0088ff] hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <Eye size={12} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 6. PERFORMANCE */}
        {!loading && activeDomain === 'performance' && domainData?.__domain === 'performance' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="font-semibold text-slate-800">Appraisals & PIP Compliance Register</span>
              <span className="text-slate-500">Cycles: {domainData.cycles?.length || 0} • PIPs: {domainData.pips?.length || 0}</span>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Cycle</th>
                  <th className="py-2.5 px-4">Employee</th>
                  <th className="py-2.5 px-4">Manager</th>
                  <th className="py-2.5 px-4">Stage</th>
                  <th className="py-2.5 px-4">Rating / Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(domainData.appraisals || []).map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4">{a.cycleTitle}</td>
                    <td className="py-2.5 px-4 font-medium">{a.employeeName}</td>
                    <td className="py-2.5 px-4">{a.managerName}</td>
                    <td className="py-2.5 px-4"><span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[10px] font-bold">{a.status}</span></td>
                    <td className="py-2.5 px-4 font-semibold">{a.moderatedRatingCode ?? a.managerRatingCode ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 7. GOVERNANCE & AUDIT */}
        {!loading && activeDomain === 'governance' && domainData?.__domain === 'governance' && (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-200 p-4 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800">Tamper-Evident Audit Log & DPA 2019 Export</h4>
                <p className="text-slate-500">
                  Policy Acknowledgements: {domainData.acknowledgements?.length || 0} • DSRs: {domainData.dsrs?.length || 0} • Legal Holds: {domainData.legalHolds?.length || 0}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleExportAuditLogs('csv')}
                  className="px-3 py-1.5 border border-slate-200 rounded bg-white hover:bg-slate-50 font-medium flex items-center gap-1"
                >
                  <FileText size={13} /> Export Audit CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExportAuditLogs('json')}
                  className="px-3 py-1.5 border border-slate-200 rounded bg-white hover:bg-slate-50 font-medium"
                >
                  Export Audit JSON
                </button>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 font-semibold text-slate-800">Recent Audit Trail</div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-4">Timestamp</th>
                    <th className="py-2 px-4">Action</th>
                    <th className="py-2 px-4">Entity</th>
                    <th className="py-2 px-4">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(domainData.auditLogs || []).slice(0, 25).map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="py-2 px-4 font-mono text-[11px] text-slate-500">
                        {new Date(l.timestamp || l.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2 px-4 font-semibold text-slate-800">{l.action}</td>
                      <td className="py-2 px-4 text-slate-600">
                        {l.targetType || l.entityType} ({(l.targetId || l.entityId || '').slice(0, 8)})
                      </td>
                      <td className="py-2 px-4 text-slate-500">
                        {l.actorEmail || l.actorUserId || 'system'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
