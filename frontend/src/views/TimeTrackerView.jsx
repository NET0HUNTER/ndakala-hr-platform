import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  Play,
  Plus,
  Filter,
  CheckCircle,
  X,
  Lock,
  Unlock,
  Briefcase,
  DollarSign,
  BarChart,
  Users,
  Calendar,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, apiDelete, unwrapList } from '../utils/api';

const fmtKes = (n) =>
  `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const healthBadgeClass = (status) => {
  switch (status) {
    case 'OVER_BUDGET':
    case 'NO_BUDGET':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'ATTENTION':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'WATCH':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  }
};

export default function TimeTrackerView({ currentUser, employees = [], onShowToast, initialSubTab = 'logs' }) {
  const [subTab, setSubTab] = useState(initialSubTab); // logs | approvals | projects | rates | periods | analytics

  const perms = new Set(currentUser?.permissions || []);
  const canApprove = perms.has('timetracker.approve');
  const canViewRates = perms.has('timetracker.rates.view');
  const canManageRates = perms.has('timetracker.rates.manage');
  const canManageProjects = perms.has('timetracker.projects.manage');
  const canManagePeriods = perms.has('timetracker.periods.manage');

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [logs, setLogs] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [rates, setRates] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [executive, setExecutive] = useState(null);
  const [utilization, setUtilization] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filter Bar State
  const [filterSearch, setFilterSearch] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2026-12-31');

  // Live Timer + Log Form State
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [logForm, setLogForm] = useState({
    projectId: '',
    phaseId: '',
    workDate: new Date().toISOString().slice(0, 10),
    hours: '2',
    isBillable: true,
    description: '',
  });

  // Batch Approvals
  const [selectedLogIds, setSelectedLogIds] = useState([]);
  const [rejectionReason, setRejectionReason] = useState('Clarify deliverable & phase allocation');

  // Forms for Client, Project, Phase, Rate Card, Period Close/Reopen
  const [clientForm, setClientForm] = useState({ code: '', name: '', industry: 'Advisory', contactName: '', contactEmail: '' });
  const [projectForm, setProjectForm] = useState({
    code: '',
    name: '',
    clientId: '',
    department: 'IT & Cybersecurity',
    leadEmployeeId: '',
    budgetAmountKes: 500000,
    budgetHours: 120,
    startDate: '2026-11-01',
    endDate: '2026-12-31',
  });
  const [phaseForms, setPhaseForms] = useState({});
  const [rateForm, setRateForm] = useState({ employeeId: '', costRateKes: 2500, billingRateKes: 6500, effectiveFrom: '2026-11-01' });
  const [newPeriodForm, setNewPeriodForm] = useState({ name: 'December 2026', startDate: '2026-12-01', endDate: '2026-12-31' });
  const [reopenReason, setReopenReason] = useState('Audit adjustment verified by Managing Partner');

  useEffect(() => {
    if (!timerRunning) return;
    const iv = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [timerRunning]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterProject) params.set('projectId', filterProject);
      if (filterEmployee) params.set('employeeId', filterEmployee);
      if (filterStatus) params.set('status', filterStatus);
      if (filterSearch) params.set('search', filterSearch);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const [logsRes, prjRes, cliRes, perRes, execRes, utilRes] = await Promise.all([
        apiGet(`/api/v1/timetracker/logs?${params.toString()}`).catch(() => []),
        apiGet('/api/v1/timetracker/projects').catch(() => []),
        apiGet('/api/v1/timetracker/clients').catch(() => []),
        apiGet('/api/v1/timetracker/periods').catch(() => []),
        apiGet(`/api/v1/timetracker/reports/executive?startDate=${startDate}&endDate=${endDate}`).catch(() => null),
        apiGet(`/api/v1/timetracker/reports/utilization?startDate=2026-11-01&endDate=2026-11-30`).catch(() => null),
      ]);
      setLogs(unwrapList(logsRes));
      const prjList = unwrapList(prjRes);
      setProjects(prjList);
      const cliList = unwrapList(cliRes);
      setClients(cliList);
      setPeriods(unwrapList(perRes));
      setExecutive(execRes);
      setUtilization(utilRes);

      if (!logForm.projectId && prjList[0]) {
        setLogForm((f) => ({ ...f, projectId: prjList[0].id }));
      }
      if (!projectForm.clientId && cliList[0]) {
        setProjectForm((f) => ({ ...f, clientId: cliList[0].id }));
      }
      if (!projectForm.leadEmployeeId && employees[0]) {
        setProjectForm((f) => ({ ...f, leadEmployeeId: employees[0].id }));
      }
      if (!rateForm.employeeId && employees[0]) {
        setRateForm((f) => ({ ...f, employeeId: employees[0].id }));
      }

      // Rate cards (only succeeds if timetracker.rates.view permission is present)
      apiGet('/api/v1/timetracker/rates')
        .then((r) => setRates(unwrapList(r)))
        .catch(() => setRates([]));
    } finally {
      setLoading(false);
    }
  }, [filterProject, filterEmployee, filterStatus, filterSearch, startDate, endDate, employees.length]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatTimer = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [hrs, mins, s].map((v) => String(v).padStart(2, '0')).join(':');
  };

  const selectedProjectObj = projects.find((p) => p.id === logForm.projectId);
  const projectPhases = selectedProjectObj?.phases || [];

  const handleLogSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/timetracker/logs', {
        projectId: logForm.projectId,
        phaseId: logForm.phaseId || null,
        workDate: logForm.workDate,
        hours: Number(logForm.hours),
        isBillable: Boolean(logForm.isBillable),
        description: logForm.description.trim() || 'Client advisory engagement session',
      });
      setLogForm((f) => ({ ...f, description: '' }));
      onShowToast?.('Time log recorded & cost/billing rate card snapshotted.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Failed to log time', 'error');
    }
  };

  const handleToggleTimer = async () => {
    if (!timerRunning) {
      setTimerSeconds(0);
      setTimerRunning(true);
      onShowToast?.('Live billable timer started.');
    } else {
      setTimerRunning(false);
      const roundedHours = Math.max(0.25, Math.ceil((timerSeconds / 3600) * 4) / 4);
      try {
        await apiPost('/api/v1/timetracker/logs', {
          projectId: logForm.projectId || projects[0]?.id,
          phaseId: logForm.phaseId || null,
          workDate: logForm.workDate,
          hours: roundedHours,
          isBillable: logForm.isBillable,
          description: logForm.description.trim() || `Timed Advisory Session (${formatTimer(timerSeconds)})`,
        });
        setTimerSeconds(0);
        setLogForm((f) => ({ ...f, description: '' }));
        onShowToast?.(`Stopped timer & logged ${roundedHours} hrs.`);
        await loadAll();
      } catch (err) {
        onShowToast?.(err.message || 'Could not save timed entry', 'error');
      }
    }
  };

  const handleDeleteLog = async (id) => {
    try {
      await apiDelete(`/api/v1/timetracker/logs/${id}`);
      onShowToast?.('Pending time log removed.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Delete failed', 'error');
    }
  };

  const handleBatchReview = async (action) => {
    if (selectedLogIds.length === 0) return;
    try {
      await apiPatch('/api/v1/timetracker/logs/review', {
        logIds: selectedLogIds,
        action,
        ...(action === 'REJECT' ? { rejectionReason } : {}),
      });
      setSelectedLogIds([]);
      onShowToast?.(`Batch ${action.toLowerCase()} completed.`);
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Batch review failed', 'error');
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/timetracker/clients', clientForm);
      setClientForm({ code: '', name: '', industry: 'Advisory', contactName: '', contactEmail: '' });
      onShowToast?.('Client organization created.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Failed to create client', 'error');
    }
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/timetracker/projects', {
        ...projectForm,
        budgetAmountKes: Number(projectForm.budgetAmountKes),
        budgetHours: Number(projectForm.budgetHours),
      });
      setProjectForm((f) => ({ ...f, code: '', name: '' }));
      onShowToast?.('Project created.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Failed to create project', 'error');
    }
  };

  const handleAddPhase = async (projectId) => {
    const pf = phaseForms[projectId] || { name: 'Execution Sprint', startDate: '2026-11-01', endDate: '2026-11-30', progressPct: 0, sortOrder: 1 };
    try {
      await apiPost(`/api/v1/timetracker/projects/${projectId}/phases`, {
        ...pf,
        progressPct: Number(pf.progressPct || 0),
        sortOrder: Number(pf.sortOrder || 1),
      });
      onShowToast?.('Project Gantt phase added.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Failed to add phase', 'error');
    }
  };

  const handleUpdatePhaseProgress = async (phaseId, progressPct) => {
    try {
      await apiPatch(`/api/v1/timetracker/phases/${phaseId}`, { progressPct: Number(progressPct) });
      onShowToast?.(`Phase progress updated to ${progressPct}%.`);
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Failed to update phase progress', 'error');
    }
  };

  const handleSaveRateCard = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/timetracker/rates', {
        employeeId: rateForm.employeeId,
        costRateKes: Number(rateForm.costRateKes),
        billingRateKes: Number(rateForm.billingRateKes),
        effectiveFrom: rateForm.effectiveFrom,
      });
      onShowToast?.('Rate Card updated with audit trail.');
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Rate Card update failed', 'error');
    }
  };

  const handlePeriodAction = async (periodId, action, autoApprove = false) => {
    try {
      if (action === 'approve-all') {
        await apiPost(`/api/v1/timetracker/periods/${periodId}/approve-all`, {});
        onShowToast?.('All pending logs in period approved.');
      } else if (action === 'close') {
        await apiPost(`/api/v1/timetracker/periods/${periodId}/close`, { autoApprove });
        onShowToast?.('Period closed & immutable SHA-256 executive snapshot locked.');
      } else if (action === 'reopen') {
        await apiPost(`/api/v1/timetracker/periods/${periodId}/reopen`, { reason: reopenReason });
        onShowToast?.('Period reopened with mandatory audit reason.', 'warning');
      }
      await loadAll();
    } catch (err) {
      onShowToast?.(err.message || 'Period operation failed', 'error');
    }
  };

  const kpis = executive?.kpis || {
    totalLoggedHours: logs.reduce((s, l) => s + Number(l.hours || 0), 0),
    billableHours: logs.filter((l) => l.isBillable).reduce((s, l) => s + Number(l.hours || 0), 0),
    nonBillableHours: logs.filter((l) => !l.isBillable).reduce((s, l) => s + Number(l.hours || 0), 0),
    billabilityPct: 0,
    totalLaborCostKes: 0,
    billableRevenueKes: 0,
    nonBillableLeakageKes: 0,
    grossProfitMarginPct: 0,
  };

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Sub-navigation bar */}
      <div className="bg-white border-b border-slate-200 px-5 flex items-center justify-between h-11 flex-shrink-0">
        <div className="flex items-center space-x-5 h-full overflow-x-auto">
          {[
            { id: 'logs', label: 'Time Logs & Timer' },
            { id: 'approvals', label: `Approvals Queue (${logs.filter((l) => l.status === 'PENDING').length})` },
            { id: 'projects', label: 'Clients, Projects & Gantt' },
            { id: 'rates', label: 'Rate Cards (RBAC)' },
            { id: 'periods', label: 'Month-End Period Lock' },
            { id: 'analytics', label: 'Profitability & Capacity KPIs' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`relative h-full flex items-center whitespace-nowrap font-medium ${
                subTab === t.id ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{t.label}</span>
              {subTab === t.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0088ff]" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={loadAll}
          className="px-2.5 py-1 border border-slate-200 rounded text-[11px] font-medium text-slate-600 hover:bg-slate-50"
        >
          {loading ? 'Syncing...' : 'Refresh'}
        </button>
      </div>

      {/* Live Quick Entry & Stopwatch Bar */}
      <form onSubmit={handleLogSubmit} className="mx-5 mt-3 bg-white rounded-md border border-slate-200 p-3 flex flex-wrap items-center gap-2.5 shadow-2xs">
        <select
          value={logForm.projectId}
          onChange={(e) => setLogForm({ ...logForm, projectId: e.target.value, phaseId: '' })}
          required
          className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-800 max-w-[200px]"
        >
          <option value="">Select Project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.code}] {p.name}
            </option>
          ))}
        </select>

        <select
          value={logForm.phaseId}
          onChange={(e) => setLogForm({ ...logForm, phaseId: e.target.value })}
          className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-slate-700 max-w-[160px]"
        >
          <option value="">Phase (Optional)</option>
          {projectPhases.map((ph) => (
            <option key={ph.id} value={ph.id}>
              {ph.name} ({ph.progressPct}%)
            </option>
          ))}
        </select>

        <input
          type="date"
          value={logForm.workDate}
          onChange={(e) => setLogForm({ ...logForm, workDate: e.target.value })}
          required
          className="px-2.5 py-1.5 border border-slate-300 rounded text-slate-700"
        />

        <input
          type="number"
          step="0.25"
          min="0.25"
          max="24"
          value={logForm.hours}
          onChange={(e) => setLogForm({ ...logForm, hours: e.target.value })}
          className="w-20 px-2.5 py-1.5 border border-slate-300 rounded font-mono text-slate-800"
          placeholder="Hrs"
        />

        <input
          type="text"
          value={logForm.description}
          onChange={(e) => setLogForm({ ...logForm, description: e.target.value })}
          placeholder="Deliverable / work description..."
          className="flex-1 min-w-[180px] px-3 py-1.5 border border-slate-300 rounded text-slate-800"
        />

        <button
          type="button"
          onClick={() => setLogForm((f) => ({ ...f, isBillable: !f.isBillable }))}
          className={`px-3 py-1.5 rounded font-semibold border ${
            logForm.isBillable ? 'bg-blue-50 text-[#0088ff] border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}
        >
          {logForm.isBillable ? 'Billable' : 'Non-Billable'}
        </button>

        <button
          type="submit"
          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded"
        >
          + Log Time
        </button>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
          <span className="px-2.5 py-1.5 rounded bg-emerald-600 text-white font-mono font-bold">
            {formatTimer(timerSeconds)}
          </span>
          <button
            type="button"
            onClick={handleToggleTimer}
            className={`px-2.5 py-1.5 rounded font-semibold text-white flex items-center gap-1 ${
              timerRunning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Play size={12} />
            <span>{timerRunning ? 'Stop & Log' : 'Start'}</span>
          </button>
        </div>
      </form>

      {/* Main Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* TAB 1 & 2: TIME LOGS & APPROVALS */}
        {(subTab === 'logs' || subTab === 'approvals') && (
          <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Search description, project, employee..."
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white w-56"
                />
                <select
                  value={filterProject}
                  onChange={(e) => setFilterProject(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">All Projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                  ))}
                </select>
                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">All Staff</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="LOCKED">LOCKED</option>
                </select>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-2 py-1 border border-slate-300 rounded bg-white" />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-2 py-1 border border-slate-300 rounded bg-white" />
              </div>

              {canApprove && selectedLogIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Rejection reason..."
                    className="px-2.5 py-1 border border-slate-300 rounded bg-white w-48"
                  />
                  <button
                    type="button"
                    onClick={() => handleBatchReview('APPROVE')}
                    className="px-3 py-1 bg-emerald-600 text-white font-semibold rounded"
                  >
                    Approve ({selectedLogIds.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchReview('REJECT')}
                    className="px-3 py-1 bg-rose-600 text-white font-semibold rounded"
                  >
                    Reject ({selectedLogIds.length})
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    {canApprove && (
                      <th className="py-2.5 px-3 w-8">
                        <input
                          type="checkbox"
                          checked={logs.filter((l) => l.status === 'PENDING').length > 0 && selectedLogIds.length === logs.filter((l) => l.status === 'PENDING').length}
                          onChange={(e) =>
                            setSelectedLogIds(
                              e.target.checked ? logs.filter((l) => l.status === 'PENDING').map((l) => l.id) : []
                            )
                          }
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Staff</th>
                    <th className="py-2.5 px-3">Project / Phase</th>
                    <th className="py-2.5 px-3">Description</th>
                    <th className="py-2.5 px-3">Hours</th>
                    <th className="py-2.5 px-3">Billability</th>
                    <th className="py-2.5 px-3">Rate / Value</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(subTab === 'approvals' ? logs.filter((l) => l.status === 'PENDING') : logs).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      {canApprove && (
                        <td className="py-2.5 px-3">
                          {log.status === 'PENDING' && (
                            <input
                              type="checkbox"
                              checked={selectedLogIds.includes(log.id)}
                              onChange={(e) =>
                                setSelectedLogIds((prev) =>
                                  e.target.checked ? [...prev, log.id] : prev.filter((id) => id !== log.id)
                                )
                              }
                            />
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-3 font-mono text-slate-700">{log.workDate}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">{log.employeeName || 'Staff'}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{log.project?.code} {log.project?.name}</div>
                        <div className="text-[11px] text-slate-400">{log.phase?.name || 'General Advisory'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-xs">
                        <div className="truncate">{log.description}</div>
                        {log.status === 'REJECTED' && log.rejectionReason && (
                          <div className="text-[10px] text-rose-600 truncate">Reason: {log.rejectionReason}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{Number(log.hours).toFixed(2)}h</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.isBillable ? 'bg-blue-50 text-[#0088ff]' : 'bg-slate-100 text-slate-500'}`}>
                          {log.isBillable ? 'BILLABLE' : 'NON-BILLABLE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {canViewRates && log.billingRateSnap != null
                          ? fmtKes(Number(log.hours) * Number(log.billingRateSnap))
                          : 'Restricted (RBAC)'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          log.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                          log.status === 'LOCKED' ? 'bg-slate-800 text-white' :
                          log.status === 'REJECTED' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-2 whitespace-nowrap">
                        {canApprove && log.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch('/api/v1/timetracker/logs/review', { logIds: [log.id], action: 'APPROVE' });
                                  onShowToast?.('Time log approved.');
                                  await loadAll();
                                } catch (err) {
                                  onShowToast?.(err.message || 'Approve failed', 'error');
                                }
                              }}
                              className="text-emerald-700 hover:underline font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const reason = (rejectionReason || '').trim() || 'Clarify deliverable & phase allocation';
                                try {
                                  await apiPatch('/api/v1/timetracker/logs/review', {
                                    logIds: [log.id],
                                    action: 'REJECT',
                                    rejectionReason: reason,
                                  });
                                  onShowToast?.('Time log rejected.');
                                  await loadAll();
                                } catch (err) {
                                  onShowToast?.(err.message || 'Reject failed', 'error');
                                }
                              }}
                              className="text-amber-700 hover:underline font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {log.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log.id)}
                            className="text-rose-600 hover:underline font-medium"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(subTab === 'approvals' ? logs.filter((l) => l.status === 'PENDING') : logs).length === 0 && (
                    <tr>
                      <td colSpan={canApprove ? 10 : 9} className="py-8 text-center text-slate-400">
                        {subTab === 'approvals' ? 'No pending time logs in approvals queue.' : 'No time logs matched current filters.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: CLIENTS, PROJECTS & GANTT PHASES */}
        {subTab === 'projects' && (
          <div className="space-y-4">
            {canManageProjects && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <form onSubmit={handleCreateClient} className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
                  <h4 className="font-bold text-slate-800">Register Client Organization</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input required placeholder="Code (e.g. CLI-004)" value={clientForm.code} onChange={(e) => setClientForm({ ...clientForm, code: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input required placeholder="Client Name" value={clientForm.name} onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input placeholder="Industry" value={clientForm.industry} onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input placeholder="Contact Email" value={clientForm.contactEmail} onChange={(e) => setClientForm({ ...clientForm, contactEmail: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  </div>
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white font-semibold rounded">Add Client</button>
                </form>

                <form onSubmit={handleCreateProject} className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
                  <h4 className="font-bold text-slate-800">Create Advisory Project & Budget</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <input required placeholder="PRJ Code" value={projectForm.code} onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input required placeholder="Project Name" value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} className="col-span-2 px-2.5 py-1.5 border border-slate-300 rounded" />
                    <select required value={projectForm.clientId} onChange={(e) => setProjectForm({ ...projectForm, clientId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                      <option value="">Select Client</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select required value={projectForm.leadEmployeeId} onChange={(e) => setProjectForm({ ...projectForm, leadEmployeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                      <option value="">Project Lead</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                    </select>
                    <input type="number" required placeholder="Budget (KES)" value={projectForm.budgetAmountKes} onChange={(e) => setProjectForm({ ...projectForm, budgetAmountKes: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  </div>
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white font-semibold rounded">Create Project</button>
                </form>
              </div>
            )}

            {projects.length === 0 && (
              <div className="bg-white rounded-md border border-slate-200 p-8 text-center text-slate-400">
                No advisory projects created yet.
              </div>
            )}

            {projects.map((prj) => {
              const health = prj.metrics?.health || prj.health;
              return (
              <div key={prj.id} className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <span className="font-mono text-[11px] font-bold text-[#0088ff] mr-2">{prj.code}</span>
                    <span className="text-sm font-bold text-slate-900">{prj.name}</span>
                    <span className="text-slate-400 ml-2">({prj.client?.name}) • {prj.startDate} → {prj.endDate}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-500">{prj.metrics?.totalHours || 0}h ({prj.metrics?.billabilityPct || 0}% billable)</span>
                    <span className="font-mono font-semibold text-slate-700">Budget: {fmtKes(prj.budgetAmountKes)}</span>
                    {health && (
                      <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${healthBadgeClass(health.status)}`}>
                        {health.label} ({health.burnPct}%)
                      </span>
                    )}
                  </div>
                </div>

                {/* Gantt Phases */}
                <div className="space-y-2">
                  {(prj.phases || []).map((ph) => (
                    <div key={ph.id} className="grid grid-cols-12 items-center gap-3 p-2 bg-slate-50 rounded border border-slate-100">
                      <div className="col-span-4 font-semibold text-slate-800">{ph.name}</div>
                      <div className="col-span-3 font-mono text-[11px] text-slate-500">{ph.startDate} → {ph.endDate}</div>
                      <div className="col-span-3">
                        <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0088ff] rounded-full transition-all" style={{ width: `${ph.progressPct}%` }} />
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        {canManageProjects ? (
                          <input
                            key={`${ph.id}-${ph.progressPct}`}
                            type="number"
                            min="0"
                            max="100"
                            defaultValue={ph.progressPct}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (val !== ph.progressPct) handleUpdatePhaseProgress(ph.id, val);
                            }}
                            className="w-14 px-1.5 py-0.5 border border-slate-300 rounded text-right font-mono"
                          />
                        ) : (
                          <span className="font-mono font-semibold text-slate-700">{ph.progressPct}</span>
                        )}
                        <span>%</span>
                      </div>
                    </div>
                  ))}
                  {canManageProjects && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        placeholder="New phase name..."
                        value={phaseForms[prj.id]?.name || ''}
                        onChange={(e) => setPhaseForms({ ...phaseForms, [prj.id]: { ...(phaseForms[prj.id] || { startDate: prj.startDate, endDate: prj.endDate }), name: e.target.value } })}
                        className="px-2.5 py-1 border border-slate-300 rounded flex-1 max-w-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddPhase(prj.id)}
                        className="px-3 py-1 bg-slate-800 text-white rounded font-medium"
                      >
                        + Add Gantt Phase
                      </button>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* TAB 4: RATE CARDS */}
        {subTab === 'rates' && (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Employee Cost & Client Billing Rate Cards</h4>
                <p className="text-slate-500">Protected by RBAC (`timetracker.rates.view` / `timetracker.rates.manage`). Rates snapshot onto each new TimeLog.</p>
              </div>
            </div>
            {canManageRates && (
              <form onSubmit={handleSaveRateCard} className="grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded border border-slate-200">
                <select required value={rateForm.employeeId} onChange={(e) => setRateForm({ ...rateForm, employeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>)}
                </select>
                <input type="number" min="0" required value={rateForm.costRateKes} onChange={(e) => setRateForm({ ...rateForm, costRateKes: e.target.value })} placeholder="Cost Rate KES/hr" className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono" />
                <input type="number" min="0" required value={rateForm.billingRateKes} onChange={(e) => setRateForm({ ...rateForm, billingRateKes: e.target.value })} placeholder="Billing Rate KES/hr" className="px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono" />
                <input type="date" value={rateForm.effectiveFrom} onChange={(e) => setRateForm({ ...rateForm, effectiveFrom: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white" />
                <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white font-semibold rounded">Save Rate Card</button>
              </form>
            )}

            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Internal Cost Rate</th>
                  <th className="py-2.5 px-3">Client Billing Rate</th>
                  <th className="py-2.5 px-3">Gross Spread</th>
                  <th className="py-2.5 px-3">Effective From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((r) => {
                  const emp = employees.find((e) => e.id === r.employeeId);
                  const margin = r.billingRateKes > 0 ? (((r.billingRateKes - r.costRateKes) / r.billingRateKes) * 100).toFixed(1) : '0.0';
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{emp ? `${emp.firstName} ${emp.lastName}` : r.employeeId}</td>
                      <td className="py-2.5 px-3 font-mono">{fmtKes(r.costRateKes)}/hr</td>
                      <td className="py-2.5 px-3 font-mono text-emerald-700 font-semibold">{fmtKes(r.billingRateKes)}/hr</td>
                      <td className="py-2.5 px-3 font-mono">{margin}%</td>
                      <td className="py-2.5 px-3 text-slate-500">{r.effectiveFrom}</td>
                    </tr>
                  );
                })}
                {rates.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400">{canViewRates ? 'No rate cards configured yet.' : 'Restricted (RBAC): Cost & billing rates are hidden for this role.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 5: MONTH-END PERIOD CLOSE & SHA-256 LOCK */}
        {subTab === 'periods' && (
          <div className="space-y-4">
            {canManagePeriods ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiPost('/api/v1/timetracker/periods', newPeriodForm);
                    onShowToast?.('Financial time period opened.');
                    await loadAll();
                  } catch (err) {
                    onShowToast?.(err.message || 'Could not open period', 'error');
                  }
                }}
                className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center gap-3"
              >
                <span className="font-bold text-slate-800">Open Period:</span>
                <input required value={newPeriodForm.name} onChange={(e) => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })} placeholder="Period Name" className="px-2.5 py-1.5 border border-slate-300 rounded" />
                <input type="date" required value={newPeriodForm.startDate} onChange={(e) => setNewPeriodForm({ ...newPeriodForm, startDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                <input type="date" required value={newPeriodForm.endDate} onChange={(e) => setNewPeriodForm({ ...newPeriodForm, endDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white font-semibold rounded">Open Period</button>
                <input
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Mandatory audit reason if reopening..."
                  className="flex-1 min-w-[200px] px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </form>
            ) : (
              <div className="bg-white rounded-md border border-slate-200 p-4 text-slate-500">
                Period Close & Lock controls require Finance / Partner period management permission (`timetracker.periods.manage`).
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {periods.map((per) => (
                <div key={per.id} className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {per.status === 'LOCKED' ? <Lock size={15} className="text-rose-600" /> : <Unlock size={15} className="text-emerald-600" />}
                      <span className="text-sm font-bold text-slate-900">{per.name}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${per.status === 'LOCKED' ? 'bg-slate-900 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
                        {per.status}
                      </span>
                    </div>
                    <p className="text-slate-500 mt-0.5 font-mono">
                      {per.startDate} → {per.endDate}
                      {per.status !== 'LOCKED' && ` • ${per.unapprovedCount || 0} pending logs`}
                    </p>
                    {per.snapshotChecksum && (
                      <p className="text-[11px] font-mono text-slate-500 mt-1 break-all">
                        SHA-256 Digest: <span className="text-slate-800 font-semibold">{per.snapshotChecksum}</span>
                        {per.snapshot ? ` • ${per.snapshot.entriesLocked} logs • ${per.snapshot.kpis?.billabilityPct || 0}% billable` : ''}
                      </p>
                    )}
                  </div>
                  {canManagePeriods && (
                    <div className="flex items-center gap-2">
                      {per.status === 'OPEN' ? (
                        <>
                          <button type="button" onClick={() => handlePeriodAction(per.id, 'approve-all')} className="px-3 py-1.5 border border-slate-300 rounded font-semibold text-slate-700 hover:bg-slate-50">
                            Approve All Logs
                          </button>
                          <button type="button" onClick={() => handlePeriodAction(per.id, 'close', true)} className="px-3.5 py-1.5 bg-slate-900 text-white rounded font-semibold hover:bg-slate-800">
                            Close & SHA-256 Lock Period
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => handlePeriodAction(per.id, 'reopen')} className="px-3 py-1.5 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700">
                          Reopen Period (Audit Reason)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: EXECUTIVE PROFITABILITY & MON-FRI CAPACITY UTILIZATION */}
        {subTab === 'analytics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Logged Hours', value: `${kpis.totalLoggedHours} hrs`, sub: `${kpis.billableHours}h billable` },
                { label: 'Billability %', value: `${kpis.billabilityPct}%`, sub: 'Billable / Total' },
                { label: 'Labor Cost (KES)', value: kpis.totalLaborCostKes != null ? fmtKes(kpis.totalLaborCostKes) : 'Restricted (RBAC)', sub: 'Cost Rate × Hours' },
                { label: 'Billable Revenue', value: fmtKes(kpis.billableRevenueKes), sub: 'Billing Rate × Billable' },
                { label: 'Non-Billable Leakage', value: fmtKes(kpis.nonBillableLeakageKes), sub: 'Foregone billing' },
                { label: 'Gross Profit Margin %', value: kpis.grossProfitMarginPct != null ? `${kpis.grossProfitMarginPct}%` : 'Restricted (RBAC)', sub: 'Rev - Cost / Rev' },
              ].map((card) => (
                <div key={card.label} className="bg-white rounded-md border border-slate-200 p-3.5">
                  <p className="text-[11px] font-semibold text-slate-500">{card.label}</p>
                  <p className="text-base font-bold text-slate-900 mt-1 font-mono">{card.value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{card.sub}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h4 className="font-bold text-slate-800">Mon-Fri Resource Capacity Utilization ({utilization?.startDate} → {utilization?.endDate})</h4>
                <span className="font-mono text-slate-500">{utilization?.workingDays || 0} Mon-Fri Days • {utilization?.expectedHoursPerEmployee || 0}h Expected/Staff</span>
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Staff Member</th>
                    <th className="py-2.5 px-4">Role</th>
                    <th className="py-2.5 px-4">Expected Hours</th>
                    <th className="py-2.5 px-4">Logged Hours</th>
                    <th className="py-2.5 px-4">Utilization %</th>
                    <th className="py-2.5 px-4">Billability %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(utilization?.employees || []).map((emp) => (
                    <tr key={emp.employeeId} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{emp.fullName} ({emp.employeeNumber})</td>
                      <td className="py-2.5 px-4 text-slate-600">{emp.jobTitle}</td>
                      <td className="py-2.5 px-4 font-mono">{emp.expectedHours}h</td>
                      <td className="py-2.5 px-4 font-mono font-bold">{emp.loggedHours}h</td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-[#0088ff]">{emp.utilizationPct}%</td>
                      <td className="py-2.5 px-4 font-mono text-emerald-700">{emp.billabilityPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottom 5-Metric Footer */}
      <div className="h-[46px] bg-white border-t border-slate-200 px-6 flex items-center justify-between text-xs flex-shrink-0">
        <div><strong className="font-mono text-slate-800">{Number(kpis.totalLoggedHours || 0).toFixed(2)}h</strong> <span className="text-slate-400 ml-1">Logged</span></div>
        <div><strong className="font-mono text-emerald-700">{Number(kpis.billableHours || 0).toFixed(2)}h</strong> <span className="text-slate-400 ml-1">Billable ({kpis.billabilityPct}%)</span></div>
        <div><strong className="font-mono text-amber-700">{Number(kpis.nonBillableHours || 0).toFixed(2)}h</strong> <span className="text-slate-400 ml-1">Non-Billable</span></div>
        <div><strong className="font-mono text-slate-800">{fmtKes(kpis.billableRevenueKes)}</strong> <span className="text-slate-400 ml-1">Billable Revenue</span></div>
        <div><strong className="font-mono text-[#0088ff]">{kpis.grossProfitMarginPct != null ? `${kpis.grossProfitMarginPct}%` : 'Restricted'}</strong> <span className="text-slate-400 ml-1">Gross Margin</span></div>
      </div>
    </div>
  );
}
