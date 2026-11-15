import React, { useState, useEffect } from 'react';
import { X, Calendar, Info, Upload, CheckCircle } from '../../components/Icons';
import {
  apiGet,
  apiPost,
  unwrapList,
  computeLeaveBalanceStats,
  readFileAsBase64,
} from '../../utils/api';

const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', defaultEntitlement: 21 },
  { code: 'SICK', name: 'Sick Leave', defaultEntitlement: 14 },
  { code: 'COMPASSIONATE', name: 'Compassionate Leave', defaultEntitlement: 5 },
  { code: 'MATERNITY', name: 'Maternity Leave', defaultEntitlement: 90 },
  { code: 'PATERNITY', name: 'Paternity Leave', defaultEntitlement: 14 },
  { code: 'STUDY', name: 'Study / Exam Leave', defaultEntitlement: 10 },
  { code: 'UNPAID', name: 'Unpaid Leave', defaultEntitlement: 30 },
];

export function findOverlappingLeaveRequests(existingRequests = [], targetEmpId, startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return [];
  const start = String(startDateStr).slice(0, 10);
  const end = String(endDateStr).slice(0, 10);
  if (end < start) return [];
  return existingRequests.filter((r) => {
    if (!r || (r.status !== 'PENDING_APPROVAL' && r.status !== 'APPROVED')) return false;
    if (targetEmpId && r.employeeId && r.employeeId !== targetEmpId) return false;
    const rStart = String(r.startDate || '').slice(0, 10);
    const rEnd = String(r.endDate || '').slice(0, 10);
    if (!rStart || !rEnd) return false;
    return rStart <= end && rEnd >= start;
  });
}

function addUtcDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function getNextAvailableLeaveWindow(existingRequests = [], targetEmpId, baseStartStr = '2026-11-16') {
  const safeBase = /^\d{4}-\d{2}-\d{2}$/.test(String(baseStartStr || ''))
    ? String(baseStartStr).slice(0, 10)
    : '2026-11-16';
  for (let offset = 0; offset < 365; offset += 1) {
    const startCandidate = addUtcDays(safeBase, offset);
    const [y, m, d] = startCandidate.split('-').map(Number);
    const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    // Pick a Monday-Wednesday, Tuesday-Thursday, or Wednesday-Friday 3-weekday window
    if (dayOfWeek < 1 || dayOfWeek > 3) continue;
    const endCandidate = addUtcDays(startCandidate, 2);
    if (findOverlappingLeaveRequests(existingRequests, targetEmpId, startCandidate, endCandidate).length === 0) {
      return { startDate: startCandidate, endDate: endCandidate };
    }
  }
  return { startDate: safeBase, endDate: addUtcDays(safeBase, 2) };
}

export default function LeaveRequestModal({
  isOpen,
  onClose,
  leaveForm,
  setLeaveForm,
  onSubmit,
  leaveBalances = [],
  leaveRequests = [],
  employees = [],
  currentEmployeeId,
  targetEmployeeId,
  onShowToast,
}) {
  const [calcPreview, setCalcPreview] = useState(null);
  const [teamEmail, setTeamEmail] = useState('');
  const [leaveTypesList, setLeaveTypesList] = useState([]);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const selectedCode = leaveForm.leaveTypeCode || 'ANNUAL';
  const resolvedEmpId = targetEmployeeId || currentEmployeeId || employees[0]?.id;
  const isSingleDay = Boolean(
    leaveForm.startDate && leaveForm.endDate && leaveForm.startDate === leaveForm.endDate
  );

  useEffect(() => {
    if (!isOpen) return;
    apiGet('/api/v1/leave/types')
      .then((res) => {
        const list = unwrapList(res);
        if (list.length > 0) setLeaveTypesList(list);
      })
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    let active = true;
    async function runPreview() {
      if (!isOpen || !leaveForm.startDate || !leaveForm.endDate) {
        setCalcPreview(null);
        return;
      }
      if (new Date(leaveForm.endDate) < new Date(leaveForm.startDate)) {
        setCalcPreview(null);
        return;
      }
      try {
        const preview = await apiPost('/api/v1/leave/calculate', {
          employeeId: resolvedEmpId || undefined,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          leaveTypeCode: selectedCode,
          isHalfDay: Boolean(leaveForm.isHalfDay && isSingleDay),
          halfDayType: leaveForm.isHalfDay && isSingleDay ? leaveForm.halfDayType || 'MORNING' : null,
        });
        if (active && preview) {
          setCalcPreview(preview);
        }
      } catch (_err) {
        if (active) setCalcPreview(null);
      }
    }
    runPreview();
    return () => {
      active = false;
    };
  }, [
    isOpen,
    leaveForm.startDate,
    leaveForm.endDate,
    leaveForm.isHalfDay,
    leaveForm.halfDayType,
    selectedCode,
    resolvedEmpId,
    isSingleDay,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeLeaveTypes =
    leaveTypesList.length > 0
      ? leaveTypesList
      : DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, allowHalfDay: true, requiresEvidence: false }));
  const selectedLeaveType = activeLeaveTypes.find((t) => t.code === selectedCode) || null;

  const matchedBalance = leaveBalances.find(
    (b) =>
      (b.leaveType?.code || b.leaveTypeCode) === selectedCode &&
      (!resolvedEmpId || !b.employeeId || b.employeeId === resolvedEmpId)
  );
  const balStats = matchedBalance ? computeLeaveBalanceStats(matchedBalance) : null;
  const availableDays = balStats
    ? balStats.availableDays
    : selectedLeaveType?.defaultEntitlementDays ??
      selectedLeaveType?.defaultEntitlement ??
      DEFAULT_LEAVE_TYPES.find((t) => t.code === selectedCode)?.defaultEntitlement ??
      21;

  const chargeableDays = calcPreview?.chargeableDays ?? calcPreview?.netWorkingDays ?? 0;
  const requiresHandover = chargeableDays >= 5;
  const requiresEvidence = Boolean(selectedLeaveType?.requiresEvidence);

  const colleagues = employees.filter((e) => e.id !== resolvedEmpId);
  const overlappingExisting = leaveForm.editingRequestId
    ? []
    : findOverlappingLeaveRequests(
        leaveRequests,
        resolvedEmpId,
        leaveForm.startDate,
        leaveForm.endDate
      );
  const nextAvailableWindow =
    overlappingExisting.length > 0
      ? getNextAvailableLeaveWindow(leaveRequests, resolvedEmpId, leaveForm.startDate)
      : null;

  const handleUploadEvidence = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingEvidence(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const uploaded = await apiPost('/api/v1/leave/evidence', {
        ...(resolvedEmpId ? { employeeId: resolvedEmpId } : {}),
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        evidenceType: selectedLeaveType?.evidenceType || 'SUPPORTING',
        fileBase64,
        notes: `${selectedLeaveType?.name || selectedCode} supporting evidence`,
      });
      setLeaveForm((prev) => ({
        ...prev,
        evidenceDocumentId: uploaded.documentRecordId,
        evidenceFileName: uploaded.fileName,
      }));
      onShowToast && onShowToast(`Uploaded evidence: ${uploaded.fileName}`);
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Evidence upload failed', 'error');
    } finally {
      setUploadingEvidence(false);
      e.target.value = '';
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
    >
      {/* Apply Leave Slide-Over Drawer */}
      <div className="w-full max-w-4xl bg-[#edf1f7] h-full shadow-2xl flex flex-col animate-fadeIn">
        {/* Top Header */}
        <div className="bg-[#f7f9fc] px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-800">
            {leaveForm.editingRequestId ? 'Revise & Resubmit Leave Request' : 'Apply Leave'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5">
            <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-6 max-w-3xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">Leave Details</h3>
                {selectedLeaveType && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                      {selectedLeaveType.isPaid === false ? 'Unpaid' : 'Paid'}
                    </span>
                    {selectedLeaveType.noticeDaysRequired > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                        Notice: {selectedLeaveType.noticeDaysRequired}d
                      </span>
                    )}
                    {requiresEvidence && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                        Evidence Required ({selectedLeaveType.evidenceType || 'DOCUMENT'})
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-5">
                {/* Leave type * */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700">
                    Leave type <span className="text-rose-500">*</span>
                  </label>
                  <div className="sm:col-span-9 flex items-center gap-3">
                    <select
                      value={selectedCode}
                      disabled={Boolean(leaveForm.editingRequestId)}
                      onChange={(e) =>
                        setLeaveForm({ ...leaveForm, leaveTypeCode: e.target.value })
                      }
                      className="w-full max-w-md px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700 disabled:bg-slate-100"
                      required
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {activeLeaveTypes.map((lt) => (
                        <option key={lt.code} value={lt.code}>
                          {lt.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] font-medium text-slate-500 whitespace-nowrap bg-slate-100 px-2.5 py-1 rounded">
                      Available : <strong className="text-slate-800">{availableDays}</strong> days
                    </span>
                  </div>
                </div>

                {/* Date * (From / To) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-start gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700 pt-2">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <div className="sm:col-span-9 space-y-2">
                    <div className="flex flex-wrap items-center gap-3 max-w-md">
                      <div className="relative flex-1 min-w-[160px]">
                        <input
                          type="date"
                          required
                          value={leaveForm.startDate}
                          onChange={(e) =>
                            setLeaveForm({ ...leaveForm, startDate: e.target.value })
                          }
                          placeholder="dd-MMM-yyyy"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                        />
                      </div>
                      <div className="relative flex-1 min-w-[160px]">
                        <input
                          type="date"
                          required
                          value={leaveForm.endDate}
                          onChange={(e) =>
                            setLeaveForm({ ...leaveForm, endDate: e.target.value })
                          }
                          placeholder="dd-MMM-yyyy"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                        />
                      </div>
                    </div>

                    {isSingleDay && selectedLeaveType?.allowHalfDay !== false && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(leaveForm.isHalfDay)}
                            onChange={(e) =>
                              setLeaveForm({ ...leaveForm, isHalfDay: e.target.checked })
                            }
                            className="rounded border-slate-300 text-[#0088ff]"
                          />
                          <span>Half-Day Leave (0.5 day)</span>
                        </label>
                        {leaveForm.isHalfDay && (
                          <select
                            value={leaveForm.halfDayType || 'MORNING'}
                            onChange={(e) =>
                              setLeaveForm({ ...leaveForm, halfDayType: e.target.value })
                            }
                            className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
                          >
                            <option value="MORNING">Morning</option>
                            <option value="AFTERNOON">Afternoon</option>
                          </select>
                        )}
                      </div>
                    )}

                    {calcPreview && (
                      <div className="inline-flex items-center gap-3 px-3 py-1.5 bg-blue-50/70 border border-blue-200 rounded text-[11px] text-slate-700">
                        <Calendar size={13} className="text-[#0088ff]" />
                        <span>
                          Days Booked: <strong>{chargeableDays}</strong> working day(s)
                          (Calendar: {calcPreview.totalCalendarDays ?? calcPreview.calendarDays ?? chargeableDays}, Weekends/Holidays excluded:{' '}
                          {(calcPreview.weekendDaysExcluded ?? calcPreview.restDaysExcluded ?? 0) +
                            (calcPreview.publicHolidaysExcluded ?? calcPreview.holidaysExcluded ?? 0)}
                          )
                        </span>
                      </div>
                    )}

                    {overlappingExisting.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900">
                        <div className="flex items-start gap-2">
                          <Info size={14} className="text-amber-600 shrink-0 mt-0.5" />
                          <span>
                            Overlaps existing request{' '}
                            <strong>{overlappingExisting[0].requestNumber}</strong> (
                            {overlappingExisting[0].status.replace(/_/g, ' ')}). Submitting will replace the overlapping request, or you can use the next open dates.
                          </span>
                        </div>
                        {nextAvailableWindow && (
                          <button
                            type="button"
                            onClick={() =>
                              setLeaveForm({
                                ...leaveForm,
                                startDate: nextAvailableWindow.startDate,
                                endDate: nextAvailableWindow.endDate,
                              })
                            }
                            className="px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 rounded text-[11px] font-medium text-amber-900 transition-colors"
                          >
                            Use {nextAvailableWindow.startDate} to {nextAvailableWindow.endDate}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Conditional Handover Colleague if >= 5 Days */}
                {requiresHandover && (
                  <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
                    <label className="sm:col-span-3 text-xs font-medium text-slate-700">
                      Relieving Officer <span className="text-rose-500">*</span>
                    </label>
                    <div className="sm:col-span-9">
                      <select
                        required
                        value={leaveForm.handoverEmployeeId || ''}
                        onChange={(e) =>
                          setLeaveForm({ ...leaveForm, handoverEmployeeId: e.target.value })
                        }
                        className="w-full max-w-md px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                      >
                        <option value="">Select Handover Colleague (Required for 5+ days)</option>
                        {colleagues.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.fullName} — {c.jobTitle || c.department?.name || (typeof c.department === 'string' ? c.department : 'Operations')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Team Email ID */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700">
                    Team Email ID
                  </label>
                  <div className="sm:col-span-9">
                    <input
                      type="email"
                      value={teamEmail}
                      onChange={(e) => setTeamEmail(e.target.value)}
                      placeholder="team@ndakala.com"
                      className="w-full max-w-md px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                    />
                  </div>
                </div>

                {/* Reason for leave */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-start gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700 pt-2">
                    Reason for leave
                  </label>
                  <div className="sm:col-span-9">
                    <textarea
                      rows={3}
                      required
                      value={leaveForm.handoverNotes || ''}
                      onChange={(e) =>
                        setLeaveForm({ ...leaveForm, handoverNotes: e.target.value })
                      }
                      placeholder="Enter reason for leave and task handover summary..."
                      className="w-full max-w-md px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                    />
                  </div>
                </div>

                {/* Supporting Evidence Upload */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-start gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700 pt-2">
                    Supporting Evidence {requiresEvidence && <span className="text-rose-500">*</span>}
                  </label>
                  <div className="sm:col-span-9 space-y-2 max-w-md">
                    <label className="flex items-center justify-between gap-2 px-3 py-2 border border-dashed border-slate-300 rounded bg-slate-50 hover:bg-blue-50/40 hover:border-[#0088ff] cursor-pointer transition-colors">
                      <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                        <Upload size={14} className="text-[#0088ff]" />
                        {uploadingEvidence
                          ? 'Uploading evidence...'
                          : leaveForm.evidenceFileName
                          ? `Replace file (${leaveForm.evidenceFileName})`
                          : `Upload ${selectedLeaveType?.evidenceType || 'supporting'} PDF / image`}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                        disabled={uploadingEvidence}
                        onChange={handleUploadEvidence}
                        className="sr-only"
                      />
                    </label>
                    {leaveForm.evidenceDocumentId && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-medium">
                        <CheckCircle size={12} />
                        <span>Attached: {leaveForm.evidenceFileName || leaveForm.evidenceDocumentId}</span>
                      </div>
                    )}
                    {requiresEvidence && !leaveForm.evidenceDocumentId && (
                      <p className="text-[11px] text-amber-700">
                        {selectedLeaveType?.name || selectedCode} requires uploading supporting{' '}
                        {selectedLeaveType?.evidenceType || 'documentation'} before submission.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Bottom Footer (Submit / Cancel) */}
          <div className="bg-white px-6 py-3 border-t border-slate-200 flex items-center gap-2.5">
            <button
              type="submit"
              disabled={uploadingEvidence || (requiresEvidence && !leaveForm.evidenceDocumentId)}
              className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] disabled:opacity-50 text-white text-xs font-medium rounded shadow-2xs transition-colors"
            >
              {leaveForm.editingRequestId ? 'Resubmit Leave' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
