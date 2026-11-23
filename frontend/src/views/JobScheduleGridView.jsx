import React, { useState, useMemo } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle,
  Clock,
  X,
  Briefcase,
} from '../components/Icons';

const STORAGE_KEY = 'ndakala_job_schedule_v1';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

function getWeekDays(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = (day === 0 ? -6 : 1) - day + weekOffset * 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return labels.map((label, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return {
      label,
      date: d.toISOString().slice(0, 10),
      short: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      isWeekend: i >= 5,
    };
  });
}

function loadSavedSchedule() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function JobScheduleGridView({
  employees = [],
  projects = [],
  onShowToast,
}) {
  const [viewMode, setViewMode] = useState('WEEK'); // WEEK | DAY
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const initialSlots = useMemo(() => {
    const saved = loadSavedSchedule();
    if (saved && Array.isArray(saved.slots)) return saved.slots;
    const emp1 = employees[0];
    const emp2 = employees[1] || employees[0];
    const proj1 = projects[0];
    const proj2 = projects[1] || projects[0];
    const baseWeek = getWeekDays(0);
    const seed = [];
    if (emp1) {
      seed.push({
        id: 'slot-1',
        employeeId: emp1.id,
        projectId: proj1?.id || 'general',
        projectName: proj1 ? `${proj1.code} - ${proj1.name}` : 'Advisory Engagement',
        date: baseWeek[0].date,
        startHour: 9,
        endHour: 17,
        billable: true,
        status: 'PUBLISHED',
      });
      seed.push({
        id: 'slot-2',
        employeeId: emp1.id,
        projectId: proj1?.id || 'general',
        projectName: proj1 ? `${proj1.code} - ${proj1.name}` : 'Advisory Engagement',
        date: baseWeek[2].date,
        startHour: 8,
        endHour: 16,
        billable: true,
        status: 'PUBLISHED',
      });
    }
    if (emp2) {
      seed.push({
        id: 'slot-3',
        employeeId: emp2.id,
        projectId: proj2?.id || 'internal',
        projectName: proj2 ? `${proj2.code} - ${proj2.name}` : 'Statutory Compliance Audit',
        date: baseWeek[1].date,
        startHour: 10,
        endHour: 18,
        billable: false,
        status: 'DRAFT',
      });
    }
    return seed;
  }, [employees, projects]);

  const [slots, setSlots] = useState(initialSlots);
  const [assignForm, setAssignForm] = useState({
    employeeId: employees[0]?.id || '',
    projectId: projects[0]?.id || '',
    date: weekDays[0]?.date || new Date().toISOString().slice(0, 10),
    startHour: 9,
    endHour: 17,
    billable: true,
  });

  const persistSlots = (next) => {
    setSlots(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ slots: next }));
    } catch {
      // ignore storage errors
    }
  };

  const pendingDraftCount = slots.filter((s) => s.status === 'DRAFT').length;

  const handlePublishAll = () => {
    if (pendingDraftCount === 0) {
      onShowToast?.('All job schedule shifts are already published.');
      return;
    }
    const next = slots.map((s) => (s.status === 'DRAFT' ? { ...s, status: 'PUBLISHED' } : s));
    persistSlots(next);
    onShowToast?.(`Published ${pendingDraftCount} pending job schedule shift(s) to team calendars.`);
  };

  const handleClonePreviousWeek = () => {
    const prevWeek = getWeekDays(weekOffset - 1);
    const prevDates = new Set(prevWeek.map((d) => d.date));
    const source = slots.filter((s) => prevDates.has(s.date));
    if (source.length === 0) {
      // Clone current week's Mon slot across Tue-Fri if previous week is empty
      const baseEmp = employees[0];
      if (!baseEmp) return;
      const proj = projects[0];
      const cloned = weekDays.slice(0, 5).map((wd, idx) => ({
        id: `clone-${Date.now()}-${idx}`,
        employeeId: baseEmp.id,
        projectId: proj?.id || 'general',
        projectName: proj ? `${proj.code} - ${proj.name}` : 'Client Advisory Shift',
        date: wd.date,
        startHour: 9,
        endHour: 17,
        billable: true,
        status: 'DRAFT',
      }));
      persistSlots([...slots, ...cloned]);
      onShowToast?.(`Cloned ${cloned.length} weekday shift slots into ${weekDays[0].short} – ${weekDays[6].short} (Draft).`);
      return;
    }

    const cloned = source.map((s, idx) => {
      const oldIdx = prevWeek.findIndex((d) => d.date === s.date);
      const targetDate = weekDays[oldIdx]?.date || weekDays[0].date;
      return {
        ...s,
        id: `clone-${Date.now()}-${idx}`,
        date: targetDate,
        status: 'DRAFT',
      };
    });
    persistSlots([...slots, ...cloned]);
    onShowToast?.(`Cloned ${cloned.length} job shift(s) from previous week as Draft.`);
  };

  const handleCreateSlot = (e) => {
    e.preventDefault();
    const empId = assignForm.employeeId || employees[0]?.id;
    const proj = projects.find((p) => p.id === assignForm.projectId);
    if (!empId) return;
    if (Number(assignForm.endHour) <= Number(assignForm.startHour)) {
      onShowToast?.('End hour must be after start hour.', 'error');
      return;
    }
    const newSlot = {
      id: `slot-${Date.now()}`,
      employeeId: empId,
      projectId: assignForm.projectId || 'general',
      projectName: proj ? `${proj.code} - ${proj.name}` : 'General Shift Assignment',
      date: assignForm.date,
      startHour: Number(assignForm.startHour),
      endHour: Number(assignForm.endHour),
      billable: Boolean(assignForm.billable),
      status: 'DRAFT',
    };
    persistSlots([...slots, newSlot]);
    setAssignModalOpen(false);
    onShowToast?.('Job shift added to schedule (Draft — click Publish to notify employee).');
  };

  const visibleEmployees = employees.slice(0, 12);
  const activeDay = weekDays[selectedDayIdx] || weekDays[0];

  return (
    <div className="p-5 space-y-4 text-xs">
      {/* Top Toolbar matching Zoho People Job Schedule */}
      <div className="bg-white rounded-md border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5">
            {['DAY', 'WEEK'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`px-3 py-1 rounded text-xs font-semibold ${
                  viewMode === m ? 'bg-[#0088ff] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m === 'DAY' ? 'Day (24-Hr)' : 'Week'}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="px-2 py-1.5 text-slate-500 hover:bg-slate-50 border-r border-slate-200"
              title="Previous Week"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-r border-slate-200"
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="px-2 py-1.5 text-slate-500 hover:bg-slate-50"
              title="Next Week"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
            <Calendar size={14} className="text-[#0088ff]" />
            <span>
              {weekDays[0].short} – {weekDays[6].short}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              pendingDraftCount > 0
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {pendingDraftCount > 0 ? `${pendingDraftCount} Pending Changes` : 'All Published'}
          </span>

          <button
            type="button"
            onClick={handleClonePreviousWeek}
            className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 rounded font-medium"
          >
            Clone Week
          </button>

          <button
            type="button"
            onClick={handlePublishAll}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold flex items-center gap-1"
          >
            <CheckCircle size={13} />
            <span>Publish Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAssignForm((f) => ({
                ...f,
                employeeId: f.employeeId || employees[0]?.id || '',
                projectId: f.projectId || projects[0]?.id || '',
                date: activeDay.date,
              }));
              setAssignModalOpen(true);
            }}
            className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1"
          >
            <Plus size={13} />
            <span>Assign Job Shift</span>
          </button>
        </div>
      </div>

      {/* WEEK VIEW: Employee x 7-Day Schedule Grid */}
      {viewMode === 'WEEK' && (
        <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 font-semibold min-w-[210px] border-r border-slate-200">
                  Team Member
                </th>
                {weekDays.map((wd, idx) => (
                  <th
                    key={wd.date}
                    onClick={() => {
                      setSelectedDayIdx(idx);
                      setViewMode('DAY');
                    }}
                    className={`py-2.5 px-3 text-center font-semibold min-w-[130px] border-r border-slate-100 cursor-pointer hover:bg-blue-50/40 ${
                      wd.isWeekend ? 'bg-amber-50/60 text-amber-800' : ''
                    }`}
                    title="Click to inspect 24-hour timeline for this day"
                  >
                    <div>{wd.label}</div>
                    <div className="text-[10px] font-normal text-slate-400">{wd.short}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleEmployees.map((emp) => {
                const empSlots = slots.filter((s) => s.employeeId === emp.id);
                const weekHrs = empSlots
                  .filter((s) => weekDays.some((wd) => wd.date === s.date))
                  .reduce((acc, s) => acc + (s.endHour - s.startHour), 0);
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/40">
                    <td className="py-3 px-4 border-r border-slate-200 align-top">
                      <div className="font-semibold text-slate-800">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {emp.employeeNumber} • {weekHrs}h scheduled
                      </div>
                    </td>
                    {weekDays.map((wd) => {
                      const daySlots = empSlots.filter((s) => s.date === wd.date);
                      return (
                        <td
                          key={wd.date}
                          className={`p-2 border-r border-slate-100 align-top ${
                            wd.isWeekend ? 'bg-amber-50/30' : ''
                          }`}
                        >
                          <div className="space-y-1.5">
                            {daySlots.map((slot) => (
                              <div
                                key={slot.id}
                                className={`p-2 rounded border text-[10px] leading-tight ${
                                  slot.status === 'PUBLISHED'
                                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                                    : 'bg-amber-50 border-amber-300 border-dashed text-amber-900'
                                }`}
                              >
                                <div className="font-semibold truncate flex items-center gap-1">
                                  <Briefcase size={10} />
                                  <span className="truncate">{slot.projectName}</span>
                                </div>
                                <div className="font-mono text-[10px] text-slate-600 mt-0.5">
                                  {String(slot.startHour).padStart(2, '0')}:00 – {String(slot.endHour).padStart(2, '0')}:00 ({slot.endHour - slot.startHour}h)
                                </div>
                                <div className="flex items-center justify-between mt-1">
                                  <span
                                    className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                                      slot.billable
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {slot.billable ? 'Billable' : 'Internal'}
                                  </span>
                                  <span className="text-[9px] uppercase font-semibold opacity-75">
                                    {slot.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DAY VIEW: Full 24-Hour Horizontal Visual Timeline */}
      {viewMode === 'DAY' && (
        <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {weekDays.map((wd, idx) => (
                <button
                  key={wd.date}
                  type="button"
                  onClick={() => setSelectedDayIdx(idx)}
                  className={`px-2.5 py-1 rounded text-[11px] font-medium ${
                    selectedDayIdx === idx
                      ? 'bg-[#0088ff] text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {wd.label} {wd.short}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock size={12} /> 24-Hour Shift & Job Allocation Grid (00:00 – 23:00 EAT)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3 font-semibold text-slate-700 min-w-[180px] border-r border-slate-200 sticky left-0 bg-slate-50">
                    Employee
                  </th>
                  {HOURS_24.map((hr) => (
                    <th
                      key={hr}
                      className="py-2 px-1 text-center font-mono text-[10px] text-slate-500 min-w-[44px] border-r border-slate-100"
                    >
                      {hr.slice(0, 2)}h
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleEmployees.map((emp) => {
                  const daySlots = slots.filter((s) => s.employeeId === emp.id && s.date === activeDay.date);
                  return (
                    <tr key={emp.id}>
                      <td className="py-2.5 px-3 border-r border-slate-200 sticky left-0 bg-white">
                        <div className="font-semibold text-slate-800 text-[11px]">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-[10px] text-slate-400">{emp.employeeNumber}</div>
                      </td>
                      {HOURS_24.map((_, hrIdx) => {
                        const hit = daySlots.find((s) => hrIdx >= s.startHour && hrIdx < s.endHour);
                        return (
                          <td
                            key={hrIdx}
                            className={`p-0.5 border-r border-slate-100 h-10 ${
                              hrIdx >= 9 && hrIdx < 17 ? 'bg-slate-50/40' : ''
                            }`}
                          >
                            {hit && (
                              <div
                                title={`${hit.projectName} (${hit.startHour}:00–${hit.endHour}:00) [${hit.status}]`}
                                className={`h-full w-full rounded-sm ${
                                  hit.status === 'PUBLISHED'
                                    ? hit.billable
                                      ? 'bg-[#0088ff]'
                                      : 'bg-slate-500'
                                    : 'bg-amber-400'
                                }`}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign Job Shift Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold">Assign Job Shift Slot</h3>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateSlot} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Employee</label>
                <select
                  value={assignForm.employeeId}
                  onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.firstName} {e.lastName} ({e.employeeNumber})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Project / Job</label>
                <select
                  value={assignForm.projectId}
                  onChange={(e) => setAssignForm({ ...assignForm, projectId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={assignForm.date}
                  onChange={(e) => setAssignForm({ ...assignForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Hour (0–23)</label>
                  <input
                    type="number"
                    min="0"
                    max="22"
                    value={assignForm.startHour}
                    onChange={(e) => setAssignForm({ ...assignForm, startHour: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">End Hour (1–24)</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={assignForm.endHour}
                    onChange={(e) => setAssignForm({ ...assignForm, endHour: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={assignForm.billable}
                  onChange={(e) => setAssignForm({ ...assignForm, billable: e.target.checked })}
                />
                <span className="font-semibold text-slate-700">Billable Client Shift</span>
              </label>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0088ff] text-white font-semibold rounded hover:bg-[#0073d9]"
                >
                  Add Shift Slot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
