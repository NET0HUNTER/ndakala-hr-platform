import React, { useState, useEffect } from 'react';
import { X, Clock, Play, Plus, Trash2, CheckCircle, Calendar } from '../../components/Icons';
import { apiPost } from '../../utils/api';

const MODE_META = [
  { id: 'daily', label: 'Daily Log', desc: 'Single-day time entry with Total Hours, Start/End, or Live Timer' },
  { id: 'weekly', label: 'Weekly Log', desc: 'Mon–Sun 7-day inline timesheet matrix' },
  { id: 'semimonthly', label: 'Semi Monthly Log', desc: 'Half-month (1st–15th or 16th–End) batch entry' },
  { id: 'monthly', label: 'Monthly Log', desc: 'Full-month summary & working-days batch entry' },
];

function getWeekDates(anchorDateStr) {
  const base = anchorDateStr ? new Date(`${anchorDateStr}T00:00:00`) : new Date();
  const day = base.getDay();
  const diffToMon = (day === 0 ? -6 : 1) - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + diffToMon);
  const days = [];
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      label: labels[i],
      date: d.toISOString().slice(0, 10),
      short: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      isWeekend: i >= 5,
    });
  }
  return days;
}

function fmtLocalYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getSemiMonthDates(anchorDateStr, half = 'FIRST') {
  const base = anchorDateStr ? new Date(`${anchorDateStr}T00:00:00`) : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const startDay = half === 'FIRST' ? 1 : 16;
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
  const endDay = half === 'FIRST' ? 15 : lastDayOfMonth;
  const days = [];
  for (let d = startDay; d <= endDay; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay();
    days.push({
      dayNum: d,
      date: fmtLocalYmd(dt),
      label: dt.toLocaleDateString('en-US', { weekday: 'short' }),
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return days;
}

function computeHoursFromRange(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const diffMin = eh * 60 + em - (sh * 60 + sm);
  if (diffMin <= 0) return 0;
  return Number((diffMin / 60).toFixed(2));
}

export default function LogTimeModal({
  isOpen,
  initialMode = 'daily',
  onClose,
  projects = [],
  onSaved,
  onShowToast,
}) {
  const [mode, setMode] = useState(initialMode); // daily | weekly | semimonthly | monthly
  const [timeInputMode, setTimeInputMode] = useState('TOTAL_HOURS'); // TOTAL_HOURS | START_END | TIMER
  const [submitting, setSubmitting] = useState(false);

  // Live Timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSec, setTimerSec] = useState(0);

  // Daily Form State
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dailyForm, setDailyForm] = useState({
    projectId: projects[0]?.id || '',
    phaseId: '',
    workItem: '',
    workDate: todayStr,
    hours: '2.0',
    startTime: '09:00',
    endTime: '11:00',
    isBillable: true,
    description: '',
  });

  // Weekly Matrix Rows
  const [weekAnchor, setWeekAnchor] = useState(todayStr);
  const [weeklyRows, setWeeklyRows] = useState([
    {
      id: 'row-1',
      projectId: projects[0]?.id || '',
      workItem: 'Client Advisory Deliverable',
      isBillable: true,
      hoursByDay: { 0: '2', 1: '2', 2: '2', 3: '2', 4: '2', 5: '', 6: '' },
    },
  ]);

  // Semi-Monthly State
  const [semiHalf, setSemiHalf] = useState('FIRST'); // FIRST (1-15) | SECOND (16-End)
  const [semiProjectId, setSemiProjectId] = useState(projects[0]?.id || '');
  const [semiWorkItem, setSemiWorkItem] = useState('Advisory Engagement Sprint');
  const [semiBillable, setSemiBillable] = useState(true);
  const [semiDailyHrs, setSemiDailyHrs] = useState('4');

  // Monthly State
  const [monthValue, setMonthValue] = useState(todayStr.slice(0, 7));
  const [monthProjectId, setMonthProjectId] = useState(projects[0]?.id || '');
  const [monthWorkItem, setMonthWorkItem] = useState('Monthly Retainer Advisory');
  const [monthBillable, setMonthBillable] = useState(true);
  const [monthHoursPerDay, setMonthHoursPerDay] = useState('2');
  const [monthWorkDaysOnly, setMonthWorkDaysOnly] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode || 'daily');
      if (!dailyForm.projectId && projects[0]?.id) {
        setDailyForm((f) => ({ ...f, projectId: projects[0].id }));
      }
      if (!semiProjectId && projects[0]?.id) setSemiProjectId(projects[0].id);
      if (!monthProjectId && projects[0]?.id) setMonthProjectId(projects[0].id);
      setWeeklyRows((rows) =>
        rows.map((r) => (r.projectId ? r : { ...r, projectId: projects[0]?.id || '' }))
      );
    }
  }, [isOpen, initialMode, projects]);

  useEffect(() => {
    if (!timerRunning) return;
    const iv = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [timerRunning]);

  if (!isOpen) return null;

  const selectedProject = projects.find((p) => p.id === dailyForm.projectId);
  const phases = selectedProject?.phases || [];
  const weekDays = getWeekDates(weekAnchor);
  const semiDays = getSemiMonthDates(todayStr, semiHalf);

  const fmtTimer = (sec) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const resolvedDailyHours =
    timeInputMode === 'START_END'
      ? computeHoursFromRange(dailyForm.startTime, dailyForm.endTime)
      : timeInputMode === 'TIMER'
      ? Math.max(0.25, Number((timerSec / 3600).toFixed(2)))
      : Number(dailyForm.hours || 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let createdCount = 0;

      if (mode === 'daily') {
        if (!dailyForm.projectId) throw new Error('Please select a project.');
        if (resolvedDailyHours < 0.25 || resolvedDailyHours > 24) {
          throw new Error('Logged hours must be between 0.25 and 24.0.');
        }
        const desc = [dailyForm.workItem?.trim(), dailyForm.description?.trim()]
          .filter(Boolean)
          .join(' — ') || 'Daily logged advisory work';

        await apiPost('/api/v1/timetracker/logs', {
          projectId: dailyForm.projectId,
          phaseId: dailyForm.phaseId || null,
          workDate: dailyForm.workDate,
          hours: resolvedDailyHours,
          isBillable: Boolean(dailyForm.isBillable),
          description: desc,
        });
        createdCount = 1;
        setTimerRunning(false);
        setTimerSec(0);
      } else if (mode === 'weekly') {
        const payloads = [];
        for (const row of weeklyRows) {
          if (!row.projectId) continue;
          weekDays.forEach((wd, idx) => {
            const hrs = Number(row.hoursByDay[idx] || 0);
            if (hrs >= 0.25 && hrs <= 24) {
              payloads.push({
                projectId: row.projectId,
                phaseId: null,
                workDate: wd.date,
                hours: hrs,
                isBillable: Boolean(row.isBillable),
                description: row.workItem?.trim() || `Weekly log (${wd.label} ${wd.short})`,
              });
            }
          });
        }
        if (payloads.length === 0) {
          throw new Error('Enter at least one valid hour cell (0.25–24h) in the weekly matrix.');
        }
        for (const p of payloads) {
          await apiPost('/api/v1/timetracker/logs', p);
          createdCount++;
        }
      } else if (mode === 'semimonthly') {
        if (!semiProjectId) throw new Error('Please select a project.');
        const hrs = Number(semiDailyHrs || 0);
        if (hrs < 0.25 || hrs > 24) throw new Error('Daily hours must be between 0.25 and 24.');
        const workDays = semiDays.filter((d) => !d.isWeekend);
        for (const d of workDays) {
          await apiPost('/api/v1/timetracker/logs', {
            projectId: semiProjectId,
            phaseId: null,
            workDate: d.date,
            hours: hrs,
            isBillable: Boolean(semiBillable),
            description: `${semiWorkItem.trim() || 'Semi-Monthly Log'} (${d.date})`,
          });
          createdCount++;
        }
      } else if (mode === 'monthly') {
        if (!monthProjectId) throw new Error('Please select a project.');
        const hrs = Number(monthHoursPerDay || 0);
        if (hrs < 0.25 || hrs > 24) throw new Error('Daily hours must be between 0.25 and 24.');
        const [y, m] = monthValue.split('-').map(Number);
        const totalDays = new Date(y, m, 0).getDate();
        // Log up to first 5 representative working days or full selected days cleanly
        for (let d = 1; d <= totalDays; d++) {
          const dt = new Date(y, m - 1, d);
          const dow = dt.getDay();
          if (monthWorkDaysOnly && (dow === 0 || dow === 6)) continue;
          const dateStr = dt.toISOString().slice(0, 10);
          await apiPost('/api/v1/timetracker/logs', {
            projectId: monthProjectId,
            phaseId: null,
            workDate: dateStr,
            hours: hrs,
            isBillable: Boolean(monthBillable),
            description: `${monthWorkItem.trim() || 'Monthly Log'} (${dateStr})`,
          });
          createdCount++;
        }
      }

      onShowToast?.(`Successfully recorded ${createdCount} time log ${createdCount === 1 ? 'entry' : 'entries'}.`);
      onSaved?.();
      onClose?.();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to save time log', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Top Navy Header */}
        <div className="bg-[#191f3a] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#0088ff] flex items-center justify-center">
              <Clock size={17} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Log Time</h3>
              <p className="text-[11px] text-slate-300">
                {MODE_META.find((m) => m.id === mode)?.desc}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Mode Switcher Bar: Daily / Weekly / Semi Monthly / Monthly */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 flex items-center gap-2 py-2.5 flex-shrink-0 overflow-x-auto">
          {MODE_META.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                mode === m.id
                  ? 'bg-[#0088ff] text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* ==================== MODE 1: DAILY LOG ==================== */}
          {mode === 'daily' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={dailyForm.projectId}
                    onChange={(e) => setDailyForm({ ...dailyForm, projectId: e.target.value, phaseId: '' })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="">-- Select Project --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name} ({p.client?.name || 'Internal'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Job / Phase Name</label>
                  <select
                    value={dailyForm.phaseId}
                    onChange={(e) => setDailyForm({ ...dailyForm, phaseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-xs"
                  >
                    <option value="">General Advisory / No Specific Phase</option>
                    {phases.map((ph) => (
                      <option key={ph.id} value={ph.id}>
                        {ph.name} ({ph.progressPct || 0}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Work Item</label>
                  <input
                    type="text"
                    value={dailyForm.workItem}
                    onChange={(e) => setDailyForm({ ...dailyForm, workItem: e.target.value })}
                    placeholder="e.g. Board Governance Review Draft"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dailyForm.workDate}
                    onChange={(e) => setDailyForm({ ...dailyForm, workDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              {/* Time Mode Radio Selector */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-700">Time Entry Mode</span>
                  <div className="flex items-center gap-4">
                    {[
                      { id: 'TOTAL_HOURS', label: 'Total Hours' },
                      { id: 'START_END', label: 'Start and End Time' },
                      { id: 'TIMER', label: 'Live Timer' },
                    ].map((opt) => (
                      <label key={opt.id} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="timeInputMode"
                          checked={timeInputMode === opt.id}
                          onChange={() => setTimeInputMode(opt.id)}
                          className="text-[#0088ff]"
                        />
                        <span className="font-medium text-slate-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {timeInputMode === 'TOTAL_HOURS' && (
                  <div className="flex items-center gap-3">
                    <label className="text-slate-600 font-medium">Hours (0.25–24.0):</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="24"
                      value={dailyForm.hours}
                      onChange={(e) => setDailyForm({ ...dailyForm, hours: e.target.value })}
                      className="w-28 px-3 py-1.5 border border-slate-300 rounded bg-white font-mono font-semibold text-slate-800"
                    />
                    <span className="text-[11px] text-slate-500">hrs</span>
                  </div>
                )}

                {timeInputMode === 'START_END' && (
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Start Time</label>
                      <input
                        type="time"
                        value={dailyForm.startTime}
                        onChange={(e) => setDailyForm({ ...dailyForm, startTime: e.target.value })}
                        className="px-3 py-1.5 border border-slate-300 rounded bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">End Time</label>
                      <input
                        type="time"
                        value={dailyForm.endTime}
                        onChange={(e) => setDailyForm({ ...dailyForm, endTime: e.target.value })}
                        className="px-3 py-1.5 border border-slate-300 rounded bg-white font-mono"
                      />
                    </div>
                    <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-[#0088ff] font-semibold">
                      Computed: {computeHoursFromRange(dailyForm.startTime, dailyForm.endTime)} hrs
                    </div>
                  </div>
                )}

                {timeInputMode === 'TIMER' && (
                  <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-[#191f3a] text-emerald-400 font-mono text-base font-bold rounded tracking-wider">
                      {fmtTimer(timerSec)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTimerRunning((r) => !r)}
                      className={`px-4 py-2 rounded font-semibold text-white flex items-center gap-1.5 ${
                        timerRunning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#00b87c] hover:bg-emerald-600'
                      }`}
                    >
                      <Play size={13} />
                      <span>{timerRunning ? 'Pause Timer' : 'Start Timer'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTimerRunning(false);
                        setTimerSec(0);
                      }}
                      className="px-3 py-2 border border-slate-300 rounded text-slate-600 hover:bg-white"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </div>

              {/* Billable Flag Toggle */}
              <div className="flex items-center justify-between p-3.5 border border-slate-200 rounded-md">
                <div>
                  <span className="font-semibold text-slate-800 block">Billing Status</span>
                  <span className="text-[11px] text-slate-500">
                    Billable entries apply the employee&apos;s active KES client billing rate card snapshot.
                  </span>
                </div>
                <div className="inline-flex rounded border border-slate-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDailyForm({ ...dailyForm, isBillable: true })}
                    className={`px-3.5 py-1.5 font-semibold text-xs ${
                      dailyForm.isBillable ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Billable
                  </button>
                  <button
                    type="button"
                    onClick={() => setDailyForm({ ...dailyForm, isBillable: false })}
                    className={`px-3.5 py-1.5 font-semibold text-xs ${
                      !dailyForm.isBillable ? 'bg-slate-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Non-billable
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={dailyForm.description}
                  onChange={(e) => setDailyForm({ ...dailyForm, description: e.target.value })}
                  placeholder="Describe deliverables, client interactions, or milestones completed..."
                  className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                />
              </div>
            </div>
          )}

          {/* ==================== MODE 2: WEEKLY LOG MATRIX ==================== */}
          {mode === 'weekly' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-[#0088ff]" />
                  <span className="font-semibold text-slate-700">Week Starting:</span>
                  <input
                    type="date"
                    value={weekAnchor}
                    onChange={(e) => setWeekAnchor(e.target.value)}
                    className="px-2.5 py-1 border border-slate-300 rounded text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setWeeklyRows((rows) => [
                      ...rows,
                      {
                        id: `row-${Date.now()}`,
                        projectId: projects[0]?.id || '',
                        workItem: '',
                        isBillable: true,
                        hoursByDay: { 0: '', 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
                      },
                    ])
                  }
                  className="px-3 py-1.5 bg-blue-50 text-[#0088ff] border border-blue-200 rounded font-semibold flex items-center gap-1 hover:bg-blue-100"
                >
                  <Plus size={13} />
                  <span>Add Project Row</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold min-w-[180px]">Project</th>
                      <th className="py-2.5 px-3 font-semibold min-w-[150px]">Work Item</th>
                      <th className="py-2.5 px-2 font-semibold text-center">Billable</th>
                      {weekDays.map((wd) => (
                        <th
                          key={wd.date}
                          className={`py-2 px-2 text-center font-semibold ${
                            wd.isWeekend ? 'bg-amber-50/70 text-amber-700' : ''
                          }`}
                        >
                          <div>{wd.label}</div>
                          <div className="text-[10px] font-normal text-slate-400">{wd.short}</div>
                        </th>
                      ))}
                      <th className="py-2.5 px-2 text-center font-semibold">Total</th>
                      <th className="py-2.5 px-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeklyRows.map((row) => {
                      const rowTotal = Object.values(row.hoursByDay).reduce((s, v) => s + (Number(v) || 0), 0);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/50">
                          <td className="p-2">
                            <select
                              value={row.projectId}
                              onChange={(e) =>
                                setWeeklyRows((rs) =>
                                  rs.map((r) => (r.id === row.id ? { ...r, projectId: e.target.value } : r))
                                )
                              }
                              className="w-full px-2 py-1 border border-slate-300 rounded bg-white text-[11px]"
                            >
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code} - {p.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={row.workItem}
                              onChange={(e) =>
                                setWeeklyRows((rs) =>
                                  rs.map((r) => (r.id === row.id ? { ...r, workItem: e.target.value } : r))
                                )
                              }
                              placeholder="Deliverable..."
                              className="w-full px-2 py-1 border border-slate-300 rounded text-[11px]"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={row.isBillable}
                              onChange={(e) =>
                                setWeeklyRows((rs) =>
                                  rs.map((r) => (r.id === row.id ? { ...r, isBillable: e.target.checked } : r))
                                )
                              }
                              className="rounded border-slate-300"
                            />
                          </td>
                          {weekDays.map((wd, idx) => (
                            <td
                              key={wd.date}
                              className={`p-1.5 text-center ${wd.isWeekend ? 'bg-amber-50/40' : ''}`}
                            >
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                max="24"
                                value={row.hoursByDay[idx] ?? ''}
                                onChange={(e) =>
                                  setWeeklyRows((rs) =>
                                    rs.map((r) =>
                                      r.id === row.id
                                        ? { ...r, hoursByDay: { ...r.hoursByDay, [idx]: e.target.value } }
                                        : r
                                    )
                                  )
                                }
                                placeholder="0"
                                className="w-12 px-1.5 py-1 border border-slate-200 rounded text-center font-mono text-[11px]"
                              />
                            </td>
                          ))}
                          <td className="p-2 text-center font-mono font-bold text-[#0088ff]">
                            {rowTotal.toFixed(1)}h
                          </td>
                          <td className="p-2 text-center">
                            {weeklyRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setWeeklyRows((rs) => rs.filter((r) => r.id !== row.id))}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Remove Row"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== MODE 3: SEMI MONTHLY LOG ==================== */}
          {mode === 'semimonthly' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Half-Month Cycle</label>
                  <div className="inline-flex rounded border border-slate-300 overflow-hidden w-full">
                    <button
                      type="button"
                      onClick={() => setSemiHalf('FIRST')}
                      className={`flex-1 py-2 text-xs font-semibold ${
                        semiHalf === 'FIRST' ? 'bg-[#0088ff] text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      1st – 15th
                    </button>
                    <button
                      type="button"
                      onClick={() => setSemiHalf('SECOND')}
                      className={`flex-1 py-2 text-xs font-semibold ${
                        semiHalf === 'SECOND' ? 'bg-[#0088ff] text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      16th – Month End
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Project</label>
                  <select
                    value={semiProjectId}
                    onChange={(e) => setSemiProjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-xs"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Work Item / Description</label>
                  <input
                    type="text"
                    value={semiWorkItem}
                    onChange={(e) => setSemiWorkItem(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block font-semibold text-slate-700 mb-1">Hours / Working Day</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="24"
                      value={semiDailyHrs}
                      onChange={(e) => setSemiDailyHrs(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={semiBillable}
                      onChange={(e) => setSemiBillable(e.target.checked)}
                    />
                    <span className="font-semibold text-slate-700">Billable</span>
                  </label>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50 border border-blue-200 rounded text-slate-700">
                Will batch-create{' '}
                <strong className="text-[#0088ff]">
                  {semiDays.filter((d) => !d.isWeekend).length} working-day entries
                </strong>{' '}
                ({semiDays.filter((d) => !d.isWeekend).length * Number(semiDailyHrs || 0)} total hours) for{' '}
                <strong>{semiDays[0]?.date}</strong> to <strong>{semiDays[semiDays.length - 1]?.date}</strong>.
              </div>
            </div>
          )}

          {/* ==================== MODE 4: MONTHLY LOG ==================== */}
          {mode === 'monthly' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Month</label>
                  <input
                    type="month"
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Project</label>
                  <select
                    value={monthProjectId}
                    onChange={(e) => setMonthProjectId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-xs"
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Work Item / Retainer Summary</label>
                  <input
                    type="text"
                    value={monthWorkItem}
                    onChange={(e) => setMonthWorkItem(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <label className="block font-semibold text-slate-700 mb-1">Hours / Day</label>
                    <input
                      type="number"
                      step="0.25"
                      min="0.25"
                      max="24"
                      value={monthHoursPerDay}
                      onChange={(e) => setMonthHoursPerDay(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
                    />
                  </div>
                  <label className="inline-flex items-center gap-1.5 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monthWorkDaysOnly}
                      onChange={(e) => setMonthWorkDaysOnly(e.target.checked)}
                    />
                    <span className="font-medium text-slate-700">Mon–Fri Only</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={monthBillable}
                      onChange={(e) => setMonthBillable(e.target.checked)}
                    />
                    <span className="font-medium text-slate-700">Billable</span>
                  </label>
                </div>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded text-slate-600 text-[11px]">
                Monthly batch entries respect active Period Locks and automatically snapshot each employee&apos;s billing and cost rate cards.
              </div>
            </div>
          )}

          {/* Footer Action Bar */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
            >
              <CheckCircle size={14} />
              <span>{submitting ? 'Saving Time Logs...' : `Save ${MODE_META.find((m) => m.id === mode)?.label}`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
