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
import { apiGet, apiPost, apiDownload, unwrapList } from '../utils/api';

export default function TaskInboxView({
  topContextTab = 'mydata',
  currentUser,
  leaveBalances = [],
  leaveRequests = [],
  leaveLedger = [],
  holidays = [],
  tasks = [],
  employees = [],
  onOpenLeaveModal,
  onApproveLeave,
  onRejectLeave,
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

  // Domain Lists loaded cleanly
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [workSchedules, setWorkSchedules] = useState([]);
  const [workflowDefs, setWorkflowDefs] = useState([]);

  // Forms
  const [holidayForm, setHolidayForm] = useState({ name: '', date: '2026-12-12', isRecurring: true });
  const [scheduleForm, setScheduleForm] = useState({
    code: '',
    name: '',
    workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    restDays: ['SAT', 'SUN'],
    dailyWorkingHours: 8,
  });
  const [newTypeForm, setNewTypeForm] = useState({
    code: '',
    name: '',
    category: 'COMPANY_ENHANCED',
    defaultEntitlementDays: 5,
    accrualMethod: 'ANNUAL_FRONTLOAD',
  });
  const [adjForm, setAdjForm] = useState({
    employeeId: '',
    leaveTypeId: '',
    amountDays: 1,
    reason: 'Carry-over balance correction',
  });

  const loadLeaveConfig = useCallback(async () => {
    const [ltRes, wsRes, wfRes] = await Promise.all([
      apiGet('/api/v1/leave/types').catch(() => []),
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
    if (!adjForm.employeeId && employees.length > 0) {
      setAdjForm((p) => ({ ...p, employeeId: employees[0].id }));
    }
  }, [employees]);

  useEffect(() => {
    loadLeaveConfig();
  }, [loadLeaveConfig]);

  const scopedLeaveRequests =
    topContextTab === 'mydata' && currentUser?.employeeId
      ? leaveRequests.filter((r) => r.employeeId === currentUser.employeeId)
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
    .reduce((acc, r) => acc + Number(r.daysRequested || r.workingDaysDeducted || 0), 0);

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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!holidayForm.name) return;
                  onCreateHoliday && onCreateHoliday(holidayForm);
                  setHolidayForm({ name: '', date: '2026-12-12', isRecurring: true });
                }}
                className="flex items-center gap-2 text-xs"
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
                <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                  Add Holiday
                </button>
              </form>
            </div>
            {holidays.length === 0 ? (
              <NdakalaEmptyState title="No Data Found" />
            ) : (
              <table className="w-full text-left border-collapse text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Holiday Name</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Recurring</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {holidays.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-medium text-slate-800">{h.name}</td>
                      <td className="py-2.5 px-4 text-slate-600">{h.date?.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 text-slate-600">{h.isRecurring ? 'Yes' : 'One-off'}</td>
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
                    <th className="py-2.5 px-4">Employee</th>
                    <th className="py-2.5 px-4">Leave Type</th>
                    <th className="py-2.5 px-4">Start Date</th>
                    <th className="py-2.5 px-4">End Date</th>
                    <th className="py-2.5 px-4">Days</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedLeaveRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-800">
                        {req.employee ? `${req.employee.firstName} ${req.employee.lastName}` : req.employeeId}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{req.leaveType?.name || req.leaveTypeCode || 'Annual Leave'}</td>
                      <td className="py-2.5 px-4 text-slate-600">{req.startDate?.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 text-slate-600">{req.endDate?.slice(0, 10)}</td>
                      <td className="py-2.5 px-4 text-slate-700 font-semibold">{req.daysRequested || req.workingDaysDeducted || 1}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                          req.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>{req.status}</span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="inline-flex gap-1.5">
                          {req.status === 'PENDING_APPROVAL' && (
                            <>
                              <button type="button" onClick={() => onApproveLeave && onApproveLeave(req.id)} className="px-2.5 py-1 bg-emerald-500 text-white rounded text-[11px]">
                                Approve
                              </button>
                              <button type="button" onClick={() => onRejectLeave && onRejectLeave(req.id)} className="px-2.5 py-1 border border-rose-300 text-rose-600 rounded text-[11px]">
                                Reject
                              </button>
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
                            </>
                          )}
                          {req.status === 'APPROVED' && (
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
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : subTab === 'shift' ? (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Active Work Schedules ({workSchedules.length})</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiPost('/api/v1/leave/schedules', {
                    ...scheduleForm,
                    dailyWorkingHours: Number(scheduleForm.dailyWorkingHours),
                  });
                  setScheduleForm({ ...scheduleForm, code: '', name: '' });
                  onShowToast && onShowToast('Work schedule created.');
                  await loadLeaveConfig();
                } catch (err) {
                  onShowToast && onShowToast(err?.message || 'Schedule creation failed', 'error');
                }
              }}
              className="flex flex-wrap gap-2 pb-4 border-b"
            >
              <input required placeholder="CODE (e.g. STD_KE)" value={scheduleForm.code} onChange={(e) => setScheduleForm({ ...scheduleForm, code: e.target.value.toUpperCase() })} className="px-3 py-1.5 border rounded" />
              <input required placeholder="Schedule Name" value={scheduleForm.name} onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })} className="px-3 py-1.5 border rounded flex-1" />
              <input type="number" min="1" max="24" value={scheduleForm.dailyWorkingHours} onChange={(e) => setScheduleForm({ ...scheduleForm, dailyWorkingHours: e.target.value })} className="w-24 px-3 py-1.5 border rounded" />
              <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Add Schedule</button>
            </form>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {workSchedules.map((ws) => (
                <div key={ws.id} className="p-3.5 border rounded-md bg-slate-50/50">
                  <div className="font-semibold text-slate-800">{ws.code} — {ws.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Working: {(ws.workingDays || []).join(', ')} • {ws.dailyWorkingHours} hrs/day
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
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/api/v1/leave/reconcile', { leaveYear: 2026 });
                      onShowToast && onShowToast('Leave ledger balances reconciled.');
                      onRefreshAll && (await onRefreshAll());
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
                      await apiPost('/api/v1/leave/accrual-job', { year: 2026, month: 11 });
                      onShowToast && onShowToast('Monthly accrual batch completed.');
                      onRefreshAll && (await onRefreshAll());
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Accrual restricted', 'error');
                    }
                  }}
                  className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                >
                  Run Monthly Accrual
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiPost('/api/v1/leave/adjustments', {
                      ...adjForm,
                      amountDays: Number(adjForm.amountDays),
                    });
                    onShowToast && onShowToast('Leave balance adjusted.');
                    onRefreshAll && (await onRefreshAll());
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
                    {leaveTypes.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                  </select>
                  <input type="number" step="0.5" value={adjForm.amountDays} onChange={(e) => setAdjForm({ ...adjForm, amountDays: e.target.value })} className="px-2.5 py-1.5 border rounded" />
                </div>
                <input required placeholder="Reason (>=5 chars)" value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} className="w-full px-2.5 py-1.5 border rounded" />
                <button type="submit" className="px-3.5 py-1.5 bg-emerald-600 text-white rounded font-medium">Post Adjustment</button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const created = await apiPost('/api/v1/leave/types', {
                      ...newTypeForm,
                      defaultEntitlementDays: Number(newTypeForm.defaultEntitlementDays),
                    });
                    setNewTypeForm({ ...newTypeForm, code: '', name: '' });
                    onShowToast && onShowToast(`Leave type ${created.code} drafted (activate to publish).`);
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
                <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Draft Leave Type</button>
              </form>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-4">
              <h4 className="font-semibold text-slate-800 mb-2">Recent Leave Ledger Entries ({leaveLedger.length})</h4>
              <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {leaveLedger.map((le) => (
                  <div key={le.id} className="py-2 flex items-center justify-between">
                    <span>{le.entryType} • {le.notes || le.sourceType}</span>
                    <span className={`font-mono font-semibold ${le.amountDays >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {le.amountDays >= 0 ? `+${le.amountDays}` : le.amountDays} days
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-md border border-slate-200 min-h-[450px] flex flex-col items-center justify-center p-6">
            {leaveBalances.length === 0 ? (
              <NdakalaEmptyState title="No Data Found" />
            ) : (
              <div className="w-full space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {leaveBalances.map((b) => (
                    <div key={b.id || b.leaveTypeCode} className="p-4 rounded-md border border-slate-200 bg-slate-50/40 flex flex-col justify-between">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-slate-800">{b.leaveType?.name || b.leaveTypeCode}</span>
                        <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded font-semibold">
                          Available: {b.availableDays ?? b.entitledDays ?? 21}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                        <span>Entitled: {b.entitledDays ?? 21}</span>
                        <span>Booked: {b.usedDays ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {scopedLeaveRequests.length === 0 && <NdakalaEmptyState title="No Leave History Found" />}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
