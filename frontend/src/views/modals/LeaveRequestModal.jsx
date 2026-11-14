import React, { useState, useEffect } from 'react';
import { X, Calendar, Info } from '../../components/Icons';
import { apiPost } from '../../utils/api';

const DEFAULT_LEAVE_TYPES = [
  { code: 'ANNUAL', name: 'Annual Leave', defaultEntitlement: 21 },
  { code: 'SICK', name: 'Sick Leave', defaultEntitlement: 14 },
  { code: 'COMPASSIONATE', name: 'Compassionate Leave', defaultEntitlement: 5 },
  { code: 'MATERNITY', name: 'Maternity Leave', defaultEntitlement: 90 },
  { code: 'PATERNITY', name: 'Paternity Leave', defaultEntitlement: 14 },
  { code: 'STUDY', name: 'Study / Exam Leave', defaultEntitlement: 10 },
  { code: 'UNPAID', name: 'Unpaid Leave', defaultEntitlement: 30 },
];

export default function LeaveRequestModal({
  isOpen,
  onClose,
  leaveForm,
  setLeaveForm,
  onSubmit,
  leaveBalances = [],
  employees = [],
  currentEmployeeId,
}) {
  const [calcPreview, setCalcPreview] = useState(null);
  const [teamEmail, setTeamEmail] = useState('');

  const selectedCode = leaveForm.leaveTypeCode || 'ANNUAL';

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
          employeeId: currentEmployeeId || undefined,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          leaveTypeCode: selectedCode,
        });
        if (active && preview) {
          setCalcPreview(preview);
        }
      } catch (_err) {
        // Fallback local calculation
      }
    }
    runPreview();
    return () => {
      active = false;
    };
  }, [isOpen, leaveForm.startDate, leaveForm.endDate, selectedCode, currentEmployeeId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const matchedBalance = leaveBalances.find(
    (b) => (b.leaveType?.code || b.leaveTypeCode) === selectedCode
  );
  const availableDays =
    matchedBalance && typeof matchedBalance.availableDays === 'number'
      ? matchedBalance.availableDays
      : DEFAULT_LEAVE_TYPES.find((t) => t.code === selectedCode)?.defaultEntitlement ?? 21;

  const chargeableDays = calcPreview?.chargeableDays ?? calcPreview?.netWorkingDays ?? 0;
  const requiresHandover = chargeableDays >= 5;

  const colleagues = employees.filter((e) => e.id !== currentEmployeeId);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[1px]"
    >
      {/* Apply Leave Slide-Over Drawer */}
      <div className="w-full max-w-4xl bg-[#edf1f7] h-full shadow-2xl flex flex-col animate-fadeIn">
        {/* Top Header */}
        <div className="bg-[#f7f9fc] px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-slate-800">Apply Leave</h2>
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
              <h3 className="text-sm font-semibold text-slate-800 pb-4 mb-5 border-b border-slate-100">
                Leave
              </h3>

              <div className="space-y-5">
                {/* Leave type * */}
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-3">
                  <label className="sm:col-span-3 text-xs font-medium text-slate-700">
                    Leave type <span className="text-rose-500">*</span>
                  </label>
                  <div className="sm:col-span-9 flex items-center gap-3">
                    <select
                      value={selectedCode}
                      onChange={(e) =>
                        setLeaveForm({ ...leaveForm, leaveTypeCode: e.target.value })
                      }
                      className="w-full max-w-md px-3 py-2 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                      required
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {DEFAULT_LEAVE_TYPES.map((lt) => (
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
              </div>
            </div>
          </div>

          {/* Sticky Bottom Footer (Submit / Cancel) */}
          <div className="bg-white px-6 py-3 border-t border-slate-200 flex items-center gap-2.5">
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs transition-colors"
            >
              Submit
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
