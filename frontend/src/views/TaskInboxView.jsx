import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  List,
  MoreHorizontal,
  Download,
  Upload,
  Check,
  X,
  Plus,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiDownload, unwrapList, computeLeaveBalanceStats } from '../utils/api';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TaskInboxView({
  topContextTab = 'mydata',
  currentUser,
  leaveBalances = [],
  leaveRequests = [],
  leaveLedger = [],
  holidays = [],
  absences = [],
  tasks = [],
  employees = [],
  onOpenLeaveModal,
  onOpenAbsenceModal,
  onApproveLeave,
  onRejectLeave,
  onReturnLeave,
  onCreateHoliday,
  onRefreshAll,
  onShowToast,
}) {
  const [subTab, setSubTab] = useState(topContextTab === 'team' ? 'requests' : 'summary');
  const [viewMode, setViewMode] = useState('list');
  const [calMonth, setCalMonth] = useState(10); // 10 = Nov 2026
  const [calYear, setCalYear] = useState(2026);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  const perms = new Set(currentUser?.permissions || []);
  const roleSet = new Set(
    (currentUser?.roles?.length ? currentUser.roles : currentUser?.role ? [currentUser.role] : []).map(
      (r) => String(r).toLowerCase()
    )
  );
  const canApproveLeave = perms.has('leave.approve');
  const canManageLeave = perms.has('leave.manage');
  const canConfigLeave = perms.has('leave.config') || perms.has('config.approve');
  const canApproveConfig = perms.has('config.approve');
  const canViewAllLeave = perms.has('leave.view_all');
  const canViewTeamLeave = perms.has('leave.view_team');
  const canManageAbsence = perms.has('absence.manage') || canViewTeamLeave;
  const isManagingPartner = roleSet.has('managing_partner');

  // Domain Lists loaded cleanly
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [workSchedules, setWorkSchedules] = useState([]);
  const [workflowDefs, setWorkflowDefs] = useState([]);
  const [inspectedEmpId, setInspectedEmpId] = useState('');
  const [inspectedBalances, setInspectedBalances] = useState([]);
  const [inspectedLedger, setInspectedLedger] = useState([]);
  const [reconcileResult, setReconcileResult] = useState(null);

  // Forms
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '2026-12-12',
    isHalfDay: false,
    sourceReference: 'Kenya Public Holidays Act / Gazette Notice',
  });
  const [scheduleForm, setScheduleForm] = useState({
    code: '',
    name: '',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    restDays: ['Saturday', 'Sunday'],
    dailyWorkingHours: 8,
  });
  const [newTypeForm, setNewTypeForm] = useState({
    code: '',
    name: '',
    category: 'COMPANY_ENHANCED',
    defaultEntitlementDays: 5,
    statutoryFloorDays: '',
    accrualMethod: 'ANNUAL_FRONTLOAD',
    requiresEvidence: false,
    handoverRequired: true,
  });
  const [adjForm, setAdjForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    amountDays: 1,
    reason: 'Carry-over balance correction',
  });

  const loadLeaveConfig = useCallback(async () => {
    const includeDrafts = canConfigLeave || canViewAllLeave ? '?includeInactive=true' : '';
    const [ltRes, wsRes, wfRes] = await Promise.all([
      apiGet(`/api/v1/leave/types${includeDrafts}`).catch(() => []),
      apiGet('/api/v1/leave/schedules').catch(() => []),
      apiGet('/api/v1/workflows/definitions').catch(() => []),
    ]);
    const ltArr = unwrapList(ltRes);
    setLeaveTypes(ltArr);
    setWorkSchedules(unwrapList(wsRes));
    setWorkflowDefs(unwrapList(wfRes));
    if (!adjForm.leaveTypeId && ltArr.length > 0) {
      setAdjForm((p) => ({ ...p, leaveTypeId: ltArr[0].id }));
    }
    const defaultEmp = currentUser?.employeeId || employees[0]?.id || '';
    if (!adjForm.employeeId && defaultEmp) {
      setAdjForm((p) => ({ ...p, employeeId: defaultEmp }));
    }
    if (!inspectedEmpId && defaultEmp) {
      setInspectedEmpId(defaultEmp);
    }
  }, [employees, currentUser?.employeeId, canConfigLeave, canViewAllLeave]);

  const loadInspectedEmployeeData = useCallback(async (empId) => {
    if (!empId) return;
    if (empId === currentUser?.employeeId) {
      setInspectedBalances(leaveBalances);
      setInspectedLedger(leaveLedger);
      return;
    }
    if (!canViewAllLeave && !canViewTeamLeave) return;
    const [balRes, ledRes] = await Promise.all([
      apiGet(`/api/v1/leave/balances?employeeId=${encodeURIComponent(empId)}&leaveYear=2026`).catch(() => []),
      canViewAllLeave
        ? apiGet(`/api/v1/leave/ledger?employeeId=${encodeURIComponent(empId)}&leaveYear=2026`).catch(() => [])
        : Promise.resolve([]),
    ]);
    setInspectedBalances(unwrapList(balRes));
    setInspectedLedger(unwrapList(ledRes));
  }, [currentUser?.employeeId, leaveBalances, leaveLedger, canViewAllLeave, canViewTeamLeave]);

  useEffect(() => {
    loadLeaveConfig();
  }, [loadLeaveConfig]);

  useEffect(() => {
    loadInspectedEmployeeData(inspectedEmpId);
  }, [inspectedEmpId, leaveRequests, loadInspectedEmployeeData]);

  const scopedLeaveRequests =
    topContextTab === 'mydata' && currentUser?.employeeId
      ? leaveRequests.filter((r) => r.employeeId === currentUser.employeeId)
      : topContextTab === 'team' && currentUser?.employeeId
      ? leaveRequests.filter((r) => r.employeeId !== currentUser.employeeId)
      : leaveRequests;

  useEffect(() => {
    if (topContextTab === 'team' && subTab === 'summary') setSubTab('requests');
  }, [topContextTab]);

  useEffect(() => {
    function handleOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const totalBookedDays = leaveRequests
    .filter((r) => r.status === 'APPROVED')
    .reduce((acc, r) => acc + Number(r.workingDaysDeducted ?? r.daysRequested ?? 0), 0);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const renderLeaveCalendar = () => {
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 text-xs font-medium text-slate-600">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <div key={d} className={`py-2.5 px-3 border-r last:border-r-0 border-slate-200 ${i === 0 || i === 6 ? 'bg-[#fffbeb]' : 'bg-white'}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((dayNum, idx) => {
            const colIdx = idx % 7;
            const isWeekend = colIdx === 0 || colIdx === 6;
            const dateStr = dayNum ? `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}` : '';
            const dayReqs = dayNum
              ? leaveRequests.filter((r) => r.startDate?.slice(0, 10) <= dateStr && r.endDate?.slice(0, 10) >= dateStr)
              : [];
            const dayHol = dayNum ? holidays.find((h) => h.date?.slice(0, 10) === dateStr) : null;
            const isToday = calYear === 2026 && calMonth === 10 && dayNum === 13;
            return (
              <div
                key={idx}
                onClick={() => dayNum && onOpenLeaveModal && onOpenLeaveModal()}
                className={`min-h-[96px] p-2 border-b border-r last:border-r-0 border-slate-200 cursor-pointer transition-colors ${
                  isWeekend ? 'bg-[#fffbeb]/80' : 'bg-white hover:bg-blue-50/20'
                }`}
              >
                {dayNum && (
                  <>
                    <span
                      className={`text-xs font-medium inline-flex items-center justify-center ${
                        isToday ? 'bg-[#0088ff] text-white w-6 h-6 rounded font-bold' : 'text-slate-600'
                      }`}
                    >
                      {dayNum}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayHol && (
                        <div className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 truncate">{dayHol.name}</div>
                      )}
                      {dayReqs.slice(0, 2).map((dr) => (
                        <div key={dr.id} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-[#0088ff] truncate">
                          {dr.employee?.firstName || 'Leave'} • {dr.status}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const navTabs =
    topContextTab === 'holidays'
      ? [{ id: 'holidays', label: 'Holidays' }]
      : [
          { id: 'summary', label: 'Leave Summary' },
          { id: 'requests', label: topContextTab === 'team' ? 'Team Leave Requests' : 'Leave Requests' },
          { id: 'absences', label: `Absences (${absences.length})` },
          { id: 'shift', label: 'Shift & Schedules' },
          { id: 'tasks', label: `Workflow Approvals (${tasks.length})` },
          { id: 'accrual', label: 'Accruals, Ledger & Types' },
        ];

  return (
    <div className="flex flex-col h-full bg-[#edf1f7]">
      {/* White Sub-Header Bar */}
      <div className="h-[42px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0 select-none overflow-x-auto">
        <div className="flex items-center space-x-6 h-full">
          {navTabs.map((t) => {
            const active = subTab === t.id || (topContextTab === 'holidays' && t.id === 'holidays');
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`relative h-full flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Sub-Toolbar */}
      {topContextTab !== 'holidays' && (
        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-slate-600 flex items-center gap-3">
            {viewMode === 'list' ? (
              <>
                <span>Leave booked this year : <strong className="text-slate-800">{totalBookedDays}</strong></span>
                <span className="text-slate-300">|</span>
                <span>Pending requests : <strong className="text-slate-800">{leaveRequests.filter((r) => r.status === 'PENDING_APPROVAL').length}</strong></span>
              </>
            ) : (
              <span className="text-slate-500 font-medium">Monthly Leave Calendar</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center border border-slate-200 rounded bg-white">
              <button
                type="button"
                onClick={() => {
                  if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
                  else setCalMonth((m) => m - 1);
                }}
                className="px-2 py-1 text-slate-500 hover:bg-slate-50"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 py-1 border-x border-slate-200 text-slate-600">
                <Calendar size={13} />
              </span>
              <button
                type="button"
                onClick={() => {
                  if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
                  else setCalMonth((m) => m + 1);
                }}
                className="px-2 py-1 text-slate-500 hover:bg-slate-50"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <span className="text-xs font-semibold text-slate-700">
              {viewMode === 'list' ? `01-Jan-${calYear} - 31-Dec-${calYear}` : `${monthNames[calMonth]} ${calYear}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-blue-50 text-[#0088ff] border border-[#0088ff]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('calendar')}
                title="Calendar view"
                className={`p-1.5 rounded ${viewMode === 'calendar' ? 'bg-blue-50 text-[#0088ff] border border-[#0088ff]' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <Calendar size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={onOpenLeaveModal}
              className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs transition-colors"
            >
              Apply Leave
            </button>

            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen(!moreOpen)}
                className="p-1.5 border border-slate-200 rounded bg-white text-slate-500 hover:text-slate-800"
              >
                <MoreHorizontal size={14} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-xl border border-slate-200 py-1.5 z-40 text-xs animate-fadeIn">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      setViewMode('calendar');
                    }}
                    className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Calendar size={13} className="text-slate-400" />
                    <span>Calendar View</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setMoreOpen(false);
                      await apiDownload('/api/v1/reports/export/leave', 'ndakala-leave-report.csv');
                      onShowToast && onShowToast('Leave CSV exported.');
                    }}
                    className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Upload size={13} className="text-slate-400" />
                    <span>Export Leave CSV</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 text-xs">
        {topContextTab === 'holidays' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">Gazetted Public Holidays (Kenya)</h3>
              {canManageLeave && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!holidayForm.name) return;
                    onCreateHoliday && onCreateHoliday({
                      name: holidayForm.name.trim(),
                      date: holidayForm.date,
                      isHalfDay: Boolean(holidayForm.isHalfDay),
                      sourceReference:
                        (holidayForm.sourceReference || '').trim().length >= 3
                          ? holidayForm.sourceReference.trim()
                          : 'Kenya Public Holidays Act / Gazette Notice',
                    });
                    setHolidayForm({
                      name: '',
                      date: '2026-12-12',
                      isHalfDay: false,
                      sourceReference: 'Kenya Public Holidays Act / Gazette Notice',
                    });
                  }}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <input
                    type="text"
                    placeholder="Holiday Name (e.g. Jamhuri Day)"
                    value={holidayForm.name}
                    onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                    className="px-3 py-1.5 border border-slate-300 rounded"
                  />
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    className="px-3 py-1.5 border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    placeholder="Gazette / Source Reference"
                    value={holidayForm.sourceReference}
                    onChange={(e) => setHolidayForm({ ...holidayForm, sourceReference: e.target.value })}
                    className="px-3 py-1.5 border border-slate-300 rounded w-56"
                  />
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                    Add Holiday
                  </button>
                </form>
              )}
            </div>
            {holidays.length === 0 ? (
              <NdakalaEmptyState title="No Data Found" />
            ) : (
              <table className="w-full text-left border-collapse text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Holiday Name</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Day Type</th>
                    <th className="py-2.5 px-4">Source Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{h.name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{h.date?.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 text-slate-600">{h.isHalfDay ? 'Half Day' : 'Full Day'}</td>
                      <td className="py-2.5 px-4 text-slate-500">{h.sourceReference || 'Gazetted Holiday'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : viewMode === 'calendar' ? (
          renderLeaveCalendar()
        ) : subTab === 'requests' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5">
            {scopedLeaveRequests.length === 0 ? (
              <NdakalaEmptyState title="No Leave Requests Found" actionLabel="Apply Leave" onAction={onOpenLeaveModal} />
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Ref</th>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Leave Type</th>
                    <th className="py-2.5 px-3">Dates</th>
                    <th className="py-2.5 px-3">Days</th>
                    <th className="py-2.5 px-3">Relieving / Evidence</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedLeaveRequests.map((req) => {
                    const isSelf =
                      (req.employee?.userId && req.employee.userId === currentUser?.id) ||
                      (currentUser?.employeeId && req.employeeId === currentUser.employeeId);
                    const canReviewThis =
                      req.status === 'PENDING_APPROVAL' &&
                      canApproveLeave &&
                      (!isSelf || isManagingPartner);
                    const canActAsApplicant = isSelf || canManageLeave;
                    return (
                      <tr key={req.id} className="hover:bg-slate-50 align-top">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {req.requestNumber || req.id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          <div>{req.employee ? `${req.employee.firstName} ${req.employee.lastName}` : req.employeeId}</div>
                          {req.employee?.employeeNumber && (
                            <div className="text-[10px] text-slate-400">{req.employee.employeeNumber}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{req.leaveType?.name || req.leaveTypeCode || 'Annual Leave'}</div>
                          {req.isHalfDay && (
                            <div className="text-[10px] text-blue-600 font-medium">
                              Half-Day ({req.halfDayType || 'PART'})
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                          {req.startDate?.slice(0, 10)} → {req.endDate?.slice(0, 10)}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-semibold">
                          {req.workingDaysDeducted ?? req.daysRequested ?? 1}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500 space-y-1">
                          {req.handoverEmployee && (
                            <div>
                              Reliever: <span className="text-slate-700">{req.handoverEmployee.firstName} {req.handoverEmployee.lastName}</span>
                            </div>
                          )}
                          {req.evidenceDocumentId && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const tok = await apiPost(`/api/v1/leave/requests/${req.id}/evidence-token`, {});
                                  await apiDownload(tok.downloadUrl, tok.fileName || 'leave-evidence.pdf');
                                  onShowToast && onShowToast(`Downloaded ${tok.fileName || 'evidence'}.`);
                                } catch (err) {
                                  onShowToast && onShowToast(err?.message || 'Unable to download evidence', 'error');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] hover:bg-blue-100 font-medium"
                            >
                              <Download size={11} />
                              <span>{req.evidenceFileName || 'Download Evidence'}</span>
                            </button>
                          )}
                          {(req.rejectionReason || req.cancellationReason) && (
                            <div className="text-[10px] text-rose-600">
                              Note: {req.rejectionReason || req.cancellationReason}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap ${
                            req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                            req.status === 'REJECTED' || req.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700' :
                            req.status === 'RETURNED_FOR_EDIT' ? 'bg-orange-50 text-orange-700' :
                            req.status === 'WITHDRAWN' ? 'bg-slate-100 text-slate-600' :
                            'bg-amber-50 text-amber-700'
                          }`}>{req.status}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {canReviewThis && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onApproveLeave && onApproveLeave(req.id)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px]"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onReturnLeave && onReturnLeave(req.id, 'Please review dates / handover details and resubmit')}
                                  className="px-2.5 py-1 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded text-[11px]"
                                >
                                  Return
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRejectLeave && onRejectLeave(req.id, 'Declined during leave review')}
                                  className="px-2.5 py-1 border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-[11px]"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {req.status === 'RETURNED_FOR_EDIT' && canActAsApplicant && (
                              <button
                                type="button"
                                onClick={() =>
                                  onOpenLeaveModal &&
                                  onOpenLeaveModal({
                                    editingRequestId: req.id,
                                    targetEmployeeId: req.employeeId,
                                    leaveTypeCode: req.leaveType?.code || req.leaveTypeCode || 'ANNUAL',
                                    startDate: req.startDate?.slice(0, 10),
                                    endDate: req.endDate?.slice(0, 10),
                                    isHalfDay: Boolean(req.isHalfDay),
                                    halfDayType: req.halfDayType || 'MORNING',
                                    handoverEmployeeId: req.handoverEmployeeId || '',
                                    handoverNotes: req.handoverNotes || req.reason || '',
                                    evidenceDocumentId: req.evidenceDocumentId || '',
                                    evidenceFileName: req.evidenceFileName || '',
                                  })
                                }
                                className="px-2.5 py-1 bg-[#0088ff] text-white rounded text-[11px]"
                              >
                                Edit & Resubmit
                              </button>
                            )}
                            {(req.status === 'PENDING_APPROVAL' || req.status === 'RETURNED_FOR_EDIT') && canActAsApplicant && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/leave/requests/${req.id}/withdraw`, {});
                                    onShowToast && onShowToast('Leave request withdrawn.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Cannot withdraw', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-slate-300 text-slate-700 rounded text-[11px]"
                              >
                                Withdraw
                              </button>
                            )}
                            {req.status === 'APPROVED' && canManageLeave && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/leave/requests/${req.id}/cancel`, { reason: 'Cancelled via HR Leave Console' });
                                    onShowToast && onShowToast('Approved leave cancelled & balance restored.');
                                    onRefreshAll && (await onRefreshAll());
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Cancel restricted', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-rose-300 text-rose-600 rounded text-[11px]"
                              >
                                Cancel Leave
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : subTab === 'absences' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Unexpected Absences Register ({absences.length})</h3>
                <p className="text-[11px] text-slate-500">Policy D-11 tracking without automated disciplinary sanctions</p>
              </div>
              {onOpenAbsenceModal && (
                <button
                  type="button"
                  onClick={onOpenAbsenceModal}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium"
                >
                  + Report Unexpected Absence
                </button>
              )}
            </div>
            {absences.length === 0 ? (
              <NdakalaEmptyState title="No Unexpected Absences Recorded" />
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Dates</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Channel</th>
                    <th className="py-2.5 px-3">Notes</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Follow-Up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {absences.map((ab) => (
                    <tr key={ab.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {ab.employee ? `${ab.employee.firstName} ${ab.employee.lastName}` : ab.employeeId}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {ab.startDate?.slice(0, 10)}{ab.endDate ? ` → ${ab.endDate.slice(0, 10)}` : ''}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{ab.reasonCategory}</td>
                      <td className="py-2.5 px-3 text-slate-600">{ab.contactChannel}</td>
                      <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{ab.notes || '—'}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          ab.status === 'EXCUSED' ? 'bg-emerald-50 text-emerald-700' :
                          ab.status === 'RETROSPECTIVE_LEAVE_REQUESTED' ? 'bg-blue-50 text-blue-700' :
                          ab.status === 'INVESTIGATION_REQUIRED' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>{ab.status}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {canManageAbsence && (ab.status === 'RECORDED' || ab.status === 'INVESTIGATION_REQUIRED') && (
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPost(`/api/v1/absences/${ab.id}/review`, {
                                    status: 'EXCUSED',
                                    notes: 'Reviewed & excused via Leave Console',
                                  });
                                  onShowToast && onShowToast('Absence marked EXCUSED.');
                                  onRefreshAll && (await onRefreshAll());
                                } catch (err) {
                                  onShowToast && onShowToast(err?.message || 'Review failed', 'error');
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                            >
                              Excuse
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenLeaveModal &&
                                onOpenLeaveModal({
                                  targetEmployeeId: ab.employeeId,
                                  leaveTypeCode: ab.reasonCategory === 'SICKNESS' ? 'SICK' : 'ANNUAL',
                                  startDate: ab.startDate?.slice(0, 10),
                                  endDate: (ab.endDate || ab.startDate)?.slice(0, 10),
                                  linkedAbsenceId: ab.id,
                                  handoverNotes: `Retrospective leave for absence: ${ab.notes || ab.reasonCategory}`,
                                })
                              }
                              className="px-2.5 py-1 border border-blue-300 text-[#0088ff] rounded text-[11px]"
                            >
                              Convert to Leave
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : subTab === 'shift' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Active Work Schedules ({workSchedules.length})</h3>
            {canConfigLeave && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const rest = WEEKDAYS.filter((d) => !scheduleForm.workingDays.includes(d));
                    if (scheduleForm.workingDays.length === 0 || rest.length === 0) {
                      onShowToast && onShowToast('Select at least 1 working day and 1 rest day.', 'error');
                      return;
                    }
                    await apiPost('/api/v1/leave/schedules', {
                      ...scheduleForm,
                      restDays: rest,
                      dailyWorkingHours: Number(scheduleForm.dailyWorkingHours),
                    });
                    setScheduleForm({
                      code: '',
                      name: '',
                      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
                      restDays: ['Saturday', 'Sunday'],
                      dailyWorkingHours: 8,
                    });
                    onShowToast && onShowToast('Work schedule created.');
                    await loadLeaveConfig();
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Schedule creation failed', 'error');
                  }
                }}
                className="space-y-2 pb-4 border-b"
              >
                <div className="flex flex-wrap gap-2">
                  <input required placeholder="CODE (e.g. STD_KE)" value={scheduleForm.code} onChange={(e) => setScheduleForm({ ...scheduleForm, code: e.target.value.toUpperCase() })} className="px-3 py-1.5 border rounded" />
                  <input required placeholder="Schedule Name" value={scheduleForm.name} onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })} className="px-3 py-1.5 border rounded flex-1" />
                  <input type="number" min="1" max="24" value={scheduleForm.dailyWorkingHours} onChange={(e) => setScheduleForm({ ...scheduleForm, dailyWorkingHours: e.target.value })} className="w-24 px-3 py-1.5 border rounded" />
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Add Schedule</button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="font-medium text-slate-700">Working Days:</span>
                  {WEEKDAYS.map((day) => {
                    const checked = scheduleForm.workingDays.includes(day);
                    return (
                      <label key={day} className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...scheduleForm.workingDays, day]
                              : scheduleForm.workingDays.filter((d) => d !== day);
                            setScheduleForm({ ...scheduleForm, workingDays: next });
                          }}
                        />
                        <span>{day.slice(0, 3)}</span>
                      </label>
                    );
                  })}
                </div>
              </form>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workSchedules.map((ws) => (
                <div key={ws.id} className="p-3.5 border rounded-md bg-slate-50/50">
                  <div className="font-semibold text-slate-800">{ws.code} — {ws.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Working: {(ws.workingDays || []).join(', ')} • Rest: {(ws.restDays || []).join(', ')} • {ws.dailyWorkingHours} hrs/day
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : subTab === 'tasks' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Workflow Task Inbox ({tasks.length})</h3>
              <span className="text-slate-500">{workflowDefs.length} Workflow Definitions</span>
            </div>
            {tasks.length === 0 ? (
              <NdakalaEmptyState title="No Pending Workflow Tasks" />
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <div key={t.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-800">{t.stepName || t.workflowInstance?.definition?.name || 'Approval Task'}</div>
                      <div className="text-[11px] text-slate-500">Status: {t.status} • Entity: {t.workflowInstance?.targetEntityType}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiPost(`/api/v1/tasks/${t.id}/action`, { action: 'APPROVE', comments: 'Approved in inbox' });
                          onShowToast && onShowToast('Task approved.');
                          onRefreshAll && (await onRefreshAll());
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiPost(`/api/v1/tasks/${t.id}/action`, { action: 'REJECT', comments: 'Returned/Rejected in inbox' });
                          onShowToast && onShowToast('Task rejected.');
                          onRefreshAll && (await onRefreshAll());
                        }}
                        className="px-2.5 py-1 border border-rose-300 text-rose-600 rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : subTab === 'accrual' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Leave Accruals, Ledger & Leave Types</h3>
                <p className="text-slate-500">Ledger adjustments, reconciliation, and Kenya statutory floor validation</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(canViewAllLeave || canViewTeamLeave) && employees.length > 0 && (
                  <select
                    value={inspectedEmpId}
                    onChange={(e) => setInspectedEmpId(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                  >
                    {employees.map((em) => (
                      <option key={em.id} value={em.id}>
                        Inspect: {em.firstName} {em.lastName} ({em.employeeNumber || 'Staff'})
                      </option>
                    ))}
                  </select>
                )}
                {canManageLeave && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const targetEmp = inspectedEmpId || adjForm.employeeId || employees[0]?.id;
                          const res = await apiPost('/api/v1/leave/reconcile', {
                            employeeId: targetEmp,
                            leaveYear: 2026,
                          });
                          const rows = Array.isArray(res) ? res : [];
                          setReconcileResult(rows);
                          onShowToast &&
                            onShowToast(
                              `Reconciled ${rows.length} balance(s): ${
                                rows.every((r) => r.isReconciled) ? '100% matched' : 'discrepancy found'
                              }.`
                            );
                          await loadInspectedEmployeeData(targetEmp);
                        } catch (err) {
                          onShowToast && onShowToast(err?.message || 'Reconcile restricted', 'error');
                        }
                      }}
                      className="px-3 py-1.5 border border-slate-300 rounded font-medium hover:bg-slate-50"
                    >
                      Reconcile Balances
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await apiPost('/api/v1/leave/accrual-job', { asOf: '2026-11-15' });
                          onShowToast &&
                            onShowToast(`Monthly accrual batch completed (${res?.accrualsPosted ?? 0} posted).`);
                          onRefreshAll && (await onRefreshAll());
                          await loadInspectedEmployeeData(inspectedEmpId);
                        } catch (err) {
                          onShowToast && onShowToast(err?.message || 'Accrual restricted', 'error');
                        }
                      }}
                      className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                    >
                      Run Monthly Accrual
                    </button>
                  </>
                )}
              </div>
            </div>

            {reconcileResult && reconcileResult.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-900 flex flex-wrap gap-4">
                {reconcileResult.map((r) => (
                  <span key={r.leaveTypeId} className="font-medium">
                    Ledger Sum: {r.ledgerSum}d • Closing: {r.projectedClosingBalance}d • Diff: {r.difference}d (
                    {r.isReconciled ? 'RECONCILED' : 'MISMATCH'})
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {canManageLeave && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const targetEmp = adjForm.employeeId || inspectedEmpId || employees[0]?.id;
                      await apiPost('/api/v1/leave/adjustments', {
                        ...adjForm,
                        employeeId: targetEmp,
                        amountDays: Number(adjForm.amountDays),
                      });
                      onShowToast && onShowToast('Leave balance adjusted.');
                      onRefreshAll && (await onRefreshAll());
                      await loadInspectedEmployeeData(targetEmp);
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Adjustment failed', 'error');
                    }
                  }}
                  className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5"
                >
                  <h4 className="font-semibold text-slate-800">Manual Leave Ledger Adjustment</h4>
                  <select value={adjForm.employeeId} onChange={(e) => setAdjForm({ ...adjForm, employeeId: e.target.value })} className="w-full px-2.5 py-1.5 border rounded bg-white">
                    {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName} {em.lastName}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={adjForm.leaveTypeId} onChange={(e) => setAdjForm({ ...adjForm, leaveTypeId: e.target.value })} className="px-2.5 py-1.5 border rounded bg-white">
                      {leaveTypes.filter((lt) => lt.isActive !== false).map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                    </select>
                    <input type="number" step="0.5" value={adjForm.amountDays} onChange={(e) => setAdjForm({ ...adjForm, amountDays: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                  </div>
                  <input required placeholder="Reason (>=5 chars)" value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full px-2.5 py-1.5 border rounded" />
                  <button type="submit" className="px-3.5 py-1.5 bg-emerald-600 text-white rounded font-medium">Post Adjustment</button>
                </form>
              )}

              {perms.has('leave.config') && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      const created = await apiPost('/api/v1/leave/types', {
                        code: newTypeForm.code,
                        name: newTypeForm.name,
                        category: newTypeForm.category,
                        accrualMethod: newTypeForm.accrualMethod,
                        defaultEntitlementDays: Number(newTypeForm.defaultEntitlementDays),
                        ...(newTypeForm.statutoryFloorDays !== ''
                          ? { statutoryFloorDays: Number(newTypeForm.statutoryFloorDays) }
                          : {}),
                        requiresEvidence: Boolean(newTypeForm.requiresEvidence),
                        handoverRequired: Boolean(newTypeForm.handoverRequired),
                      });
                      setNewTypeForm({
                        code: '',
                        name: '',
                        category: 'COMPANY_ENHANCED',
                        defaultEntitlementDays: 5,
                        statutoryFloorDays: '',
                        accrualMethod: 'ANNUAL_FRONTLOAD',
                        requiresEvidence: false,
                        handoverRequired: true,
                      });
                      onShowToast && onShowToast(`Leave type ${created.code} drafted (awaiting Maker-Checker activation).`);
                      await loadLeaveConfig();
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Leave type draft failed', 'error');
                    }
                  }}
                  className="bg-white rounded-md border border-slate-200 p-4 space-y-2.5"
                >
                  <h4 className="font-semibold text-slate-800">Draft Custom Leave Type</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input required placeholder="CODE (STUDY_LV)" value={newTypeForm.code} onChange={(e) => setNewTypeForm({ ...newTypeForm, code: e.target.value.toUpperCase() })} className="px-2.5 py-1.5 border rounded" />
                    <input required placeholder="Name" value={newTypeForm.name} onChange={(e) => setNewTypeForm({ ...newTypeForm, name: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" min="0" step="0.5" placeholder="Entitlement Days" value={newTypeForm.defaultEntitlementDays} onChange={(e) => setNewTypeForm({ ...newTypeForm, defaultEntitlementDays: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                    <input type="number" min="0" step="0.5" placeholder="Statutory Floor (optional)" value={newTypeForm.statutoryFloorDays} onChange={(e) => setNewTypeForm({ ...newTypeForm, statutoryFloorDays: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-600">
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={newTypeForm.requiresEvidence} onChange={(e) => setNewTypeForm({ ...newTypeForm, requiresEvidence: e.target.checked })} />
                      <span>Requires Evidence</span>
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input type="checkbox" checked={newTypeForm.handoverRequired} onChange={(e) => setNewTypeForm({ ...newTypeForm, handoverRequired: e.target.checked })} />
                      <span>Handover Required</span>
                    </label>
                  </div>
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Draft Leave Type</button>
                </form>
              )}
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
              <h4 className="font-semibold text-slate-800">Leave Types Catalog & Maker-Checker Activation ({leaveTypes.length})</h4>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {leaveTypes.map((lt) => (
                  <div key={lt.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold text-slate-800">{lt.code} — {lt.name}</span>
                      <span className="ml-2 text-[11px] text-slate-500">
                        Entitlement: {lt.defaultEntitlementDays ?? '—'}d • {lt.requiresEvidence ? 'Evidence Required' : 'Optional Evidence'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        lt.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}>{lt.isActive ? 'ACTIVE' : 'DRAFT (PENDING CHECKER)'}</span>
                      {!lt.isActive && canApproveConfig && lt.createdById !== currentUser?.id && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiPost(`/api/v1/leave/types/${lt.id}/activate`, {});
                              onShowToast && onShowToast(`Leave type ${lt.code} activated.`);
                              await loadLeaveConfig();
                            } catch (err) {
                              onShowToast && onShowToast(err?.message || 'Activation failed', 'error');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-800 mb-2">
                Authoritative Leave Ledger Entries ({(inspectedEmpId && inspectedEmpId !== currentUser?.employeeId ? inspectedLedger : leaveLedger).length})
              </h4>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {(inspectedEmpId && inspectedEmpId !== currentUser?.employeeId ? inspectedLedger : leaveLedger).map((le) => (
                  <div key={le.id} className="py-2 flex items-center justify-between">
                    <span>{le.leaveType?.code ? `[${le.leaveType.code}] ` : ''}{le.entryType} • {le.notes || le.sourceType}</span>
                    <span className={`font-mono font-semibold ${le.amountDays >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {le.amountDays >= 0 ? `+${le.amountDays}` : le.amountDays} days (bal: {le.runningBalanceDays})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-md border border-slate-200 min-h-[450px] flex flex-col p-6 space-y-5">
            {(canViewAllLeave || canViewTeamLeave) && employees.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-700">Employee Leave Balances</span>
                <select
                  value={inspectedEmpId}
                  onChange={(e) => setInspectedEmpId(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-300 rounded bg-white text-xs"
                >
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.firstName} {em.lastName} ({em.employeeNumber || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {(() => {
              const displayedBalances =
                inspectedEmpId && inspectedEmpId !== currentUser?.employeeId && (canViewAllLeave || canViewTeamLeave)
                  ? inspectedBalances
                  : leaveBalances;
              if (displayedBalances.length === 0) {
                return (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <NdakalaEmptyState
                      title="No Leave Balances Initialized Yet"
                      subtitle="Opening entitlement is posted automatically upon your first leave request or monthly accrual."
                      actionLabel="Apply Leave"
                      onAction={onOpenLeaveModal}
                    />
                  </div>
                );
              }
              return (
                <div className="w-full space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {displayedBalances.map((b) => {
                      const stats = computeLeaveBalanceStats(b);
                      return (
                        <div key={b.id || b.leaveTypeCode} className="p-4 rounded-md border border-slate-200 bg-slate-50/40 flex flex-col justify-between">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-semibold text-slate-800">{b.leaveType?.name || b.leaveTypeCode}</span>
                            <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded font-semibold">
                              Available: {stats.availableDays}
                            </span>
                          </div>
                          <div className="flex flex-wrap justify-between gap-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                            <span>Credited: {stats.entitledDays}</span>
                            <span>Taken: {stats.takenDays}</span>
                            {stats.reservedDays > 0 && (
                              <span className="text-amber-700 font-medium">Reserved: {stats.reservedDays}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {scopedLeaveRequests.length === 0 && <NdakalaEmptyState title="No Leave History Found" />}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
