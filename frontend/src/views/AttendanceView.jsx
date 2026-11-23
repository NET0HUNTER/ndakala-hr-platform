import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Filter,
  Download,
  RefreshCw,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  List,
  Grid,
  Check,
  X,
  Building,
  Users,
  UserCheck,
  Sliders,
  AlertTriangle,
} from '../components/Icons';
import { apiGet, apiPost } from '../utils/api';

export default function AttendanceView({
  currentUser,
  topContextTab = 'mydata',
  setTopContextTab,
  onShowToast,
  onNavigateTab,
}) {
  // 1. Navigation State: Top Context Tab ('mydata' | 'team') & Sub-View
  const [activeTab, setActiveTab] = useState(topContextTab === 'team' ? 'team' : 'mydata');
  const [activeSubView, setActiveSubView] = useState('summary'); // 'summary' | 'shift' | 'kanban'
  const [viewMode, setViewMode] = useState('tabular'); // 'tabular' | 'list' | 'calendar'
  const [displayUnit, setDisplayUnit] = useState('HOURS'); // 'HOURS' | 'DAYS'

  useEffect(() => {
    if (topContextTab === 'team') {
      setActiveTab('team');
      setActiveSubView('kanban');
    } else {
      setActiveTab('mydata');
      if (activeSubView === 'kanban') setActiveSubView('summary');
    }
  }, [topContextTab]);

  // 2. Month Navigator State
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1); // 1-12

  const monthString = useMemo(() => {
    return `${currentYear}-${currentMonth < 10 ? `0${currentMonth}` : currentMonth}`;
  }, [currentYear, currentMonth]);

  const monthDisplayName = useMemo(() => {
    const d = new Date(currentYear, currentMonth - 1, 1);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [currentYear, currentMonth]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // 3. Live Punch State
  const [currentTime, setCurrentTime] = useState(new Date());
  const [punchState, setPunchState] = useState({
    checkedIn: false,
    elapsedSeconds: 0,
    punches: [],
  });
  const [punchLoading, setPunchLoading] = useState(false);

  // Live real-time digital clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      setPunchState((prev) => {
        if (prev.checkedIn) {
          return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
        }
        return prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Live Punch Status
  const fetchPunchStatus = useCallback(async () => {
    try {
      const res = await apiGet('/api/v1/workspace/attendance');
      if (res) {
        setPunchState({
          checkedIn: Boolean(res.checkedIn),
          elapsedSeconds: res.elapsedSeconds || 0,
          punches: res.punches || [],
        });
      }
    } catch (err) {
      console.error('Failed to load punch status:', err);
    }
  }, []);

  // Execute Punch Action (Clock In / Clock Out)
  const handleTogglePunch = async () => {
    setPunchLoading(true);
    try {
      if (punchState.checkedIn) {
        await apiPost('/api/v1/workspace/attendance/clock-out', {
          notes: 'Clocked out via Zoho People Attendance Summary View',
        });
        onShowToast?.('Successfully punched out. Have a great evening!', 'success');
      } else {
        await apiPost('/api/v1/workspace/attendance/clock-in', {
          source: 'WEB_PORTAL',
          notes: 'Clocked in via Zoho People Attendance Summary View',
        });
        onShowToast?.('Successfully punched in. Have a productive day!', 'success');
      }
      await fetchPunchStatus();
      await fetchMonthlySummary();
    } catch (err) {
      console.error('Punch action failed:', err);
      onShowToast?.(err?.message || 'Failed to update attendance punch', 'error');
    } finally {
      setPunchLoading(false);
    }
  };

  // 4. Monthly Attendance Summary Data
  const [summaryData, setSummaryData] = useState({
    days: [],
    summary: {
      totalDays: 30,
      presentDays: 0,
      absentDays: 0,
      leaveDays: 0,
      holidayDays: 0,
      weekendDays: 0,
      totalPayableHours: '0.0',
      totalWorkedHours: '0.0',
      overtimeHours: '0.0',
    },
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEKEND'
  const [searchDayQuery, setSearchDayQuery] = useState('');

  const fetchMonthlySummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await apiGet(`/api/v1/attendance/summary?month=${monthString}&displayUnit=${displayUnit}`);
      if (res && res.days) {
        setSummaryData(res);
      }
    } catch (err) {
      console.error('Failed to load attendance summary:', err);
      onShowToast?.(err?.message || 'Failed to load attendance summary', 'error');
    } finally {
      setSummaryLoading(false);
    }
  }, [monthString, displayUnit, onShowToast]);

  useEffect(() => {
    fetchPunchStatus();
  }, [fetchPunchStatus]);

  useEffect(() => {
    if (activeTab === 'mydata') {
      fetchMonthlySummary();
    }
  }, [activeTab, fetchMonthlySummary]);

  // 5. Team Attendance Kanban State
  const [teamKanban, setTeamKanban] = useState({
    today: new Date().toISOString().slice(0, 10),
    summary: { totalCount: 0, checkedInCount: 0, notYetInCount: 0, onLeaveCount: 0 },
    checkedIn: [],
    notYetIn: [],
    onLeave: [],
  });
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  const fetchTeamKanban = useCallback(async () => {
    setTeamLoading(true);
    try {
      const res = await apiGet('/api/v1/attendance/team-kanban');
      if (res) {
        setTeamKanban(res);
      }
    } catch (err) {
      console.error('Failed to load team attendance kanban:', err);
      onShowToast?.(err?.message || 'Failed to load team attendance', 'error');
    } finally {
      setTeamLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    if (activeTab === 'team') {
      fetchTeamKanban();
    }
  }, [activeTab, fetchTeamKanban]);

  // 6. Regularization Request Drawer State
  const [regularizeDrawerOpen, setRegularizeDrawerOpen] = useState(false);
  const [regularizeForm, setRegularizeForm] = useState({
    workDate: '',
    type: 'FULL_DAY',
    clockInTime: '08:30',
    clockOutTime: '17:30',
    reason: 'Forgot to Punch',
    notes: '',
  });
  const [regularizeSubmitting, setRegularizeSubmitting] = useState(false);

  const openRegularizeDrawer = (dayItem) => {
    setRegularizeForm({
      workDate: dayItem?.date || now.toISOString().slice(0, 10),
      type: dayItem?.firstIn === '—' && dayItem?.lastOut === '—' ? 'FULL_DAY' : (dayItem?.firstIn === '—' ? 'MISSING_IN' : 'MISSING_OUT'),
      clockInTime: dayItem?.firstIn !== '—' ? dayItem?.firstIn : '08:30',
      clockOutTime: dayItem?.lastOut !== '—' && dayItem?.lastOut !== 'Running' ? dayItem?.lastOut : '17:30',
      reason: 'Forgot to Punch',
      notes: '',
    });
    setRegularizeDrawerOpen(true);
  };

  const handleRegularizeSubmit = async (e) => {
    e.preventDefault();
    setRegularizeSubmitting(true);
    try {
      await apiPost('/api/v1/attendance/regularize', regularizeForm);
      onShowToast?.(`Attendance for ${regularizeForm.workDate} successfully regularized!`, 'success');
      setRegularizeDrawerOpen(false);
      await fetchMonthlySummary();
      await fetchPunchStatus();
    } catch (err) {
      console.error('Regularization failed:', err);
      onShowToast?.(err?.message || 'Failed to submit regularization', 'error');
    } finally {
      setRegularizeSubmitting(false);
    }
  };

  // 7. Filtered Days for Tabular View
  const filteredDays = useMemo(() => {
    return (summaryData.days || []).filter((d) => {
      if (statusFilter !== 'ALL' && d.status !== statusFilter) return false;
      if (searchDayQuery.trim()) {
        const q = searchDayQuery.toLowerCase();
        return (
          d.formattedDate.toLowerCase().includes(q) ||
          d.dayName.toLowerCase().includes(q) ||
          d.status.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summaryData.days, statusFilter, searchDayQuery]);

  // 8. Helper Formatter for Timer (HH:MM:SS)
  const formatLiveTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs < 10 ? `0${hrs}` : hrs}:${mins < 10 ? `0${mins}` : mins}:${secs < 10 ? `0${secs}` : secs}`;
  };

  // Helper Formatter for Display Unit (Hours vs Days)
  const formatCellHours = (hhmmStr) => {
    if (displayUnit === 'DAYS') {
      if (hhmmStr === '—' || hhmmStr === '00:00') return '0.0 Day';
      const [h, m] = hhmmStr.split(':').map(Number);
      const totalH = h + m / 60;
      const days = (totalH / 8).toFixed(1);
      return `${days} Day`;
    }
    return hhmmStr;
  };

  // Export CSV Handler
  const handleExportCSV = () => {
    if (!summaryData.days || summaryData.days.length === 0) return;
    const headers = [
      'Date',
      'First In',
      'Last Out',
      'Total Hours',
      'Payable Hours',
      'Overtime / Deviation',
      'Status',
      'Shift',
      'Regularization',
    ];
    const rows = summaryData.days.map((d) => [
      `"${d.formattedDate}"`,
      `"${d.firstIn}"`,
      `"${d.lastOut}"`,
      `"${d.totalHours}"`,
      `"${d.payableHours}"`,
      `"${d.deviation}"`,
      `"${d.status}"`,
      `"${d.shift}"`,
      `"${d.regularization}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ndakala_Attendance_${monthString}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast?.('Attendance Summary CSV exported successfully', 'success');
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Present
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            On Leave
          </span>
        );
      case 'HOLIDAY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
            Holiday
          </span>
        );
      case 'WEEKEND':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
            Weekend
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Absent
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f7fa] overflow-hidden select-none">
      {/* 1. Header Bar matching Zoho People #attendance */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0088ff] text-white flex items-center justify-center font-bold text-sm shadow-sm">
              <Clock size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-[#191f3a] tracking-tight">Attendance</h1>
              <p className="text-xs text-slate-500">
                Track personal punches, monthly presence, overtime, shifts, and team check-ins.
              </p>
            </div>
          </div>

          {/* Top Context Sub-Nav Pills */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 ml-4">
            <button
              onClick={() => {
                setActiveTab('mydata');
                setTopContextTab?.('mydata');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === 'mydata' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              My Data
            </button>
            <button
              onClick={() => {
                setActiveTab('team');
                setTopContextTab?.('team');
              }}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                activeTab === 'team' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Team
            </button>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'mydata' && (
            <>
              {/* Display Unit Toggle (Hours vs Days) */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600">
                <button
                  onClick={() => setDisplayUnit('HOURS')}
                  className={`px-2 py-0.5 rounded ${displayUnit === 'HOURS' ? 'bg-white text-[#0088ff] font-semibold shadow-xs' : 'hover:text-slate-900'}`}
                >
                  Hours
                </button>
                <button
                  onClick={() => setDisplayUnit('DAYS')}
                  className={`px-2 py-0.5 rounded ${displayUnit === 'DAYS' ? 'bg-white text-[#0088ff] font-semibold shadow-xs' : 'hover:text-slate-900'}`}
                >
                  Days
                </button>
              </div>

              {/* View Switcher (Tabular vs List vs Calendar) */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-slate-600">
                <button
                  onClick={() => setViewMode('tabular')}
                  title="Tabular View"
                  className={`p-1 rounded ${viewMode === 'tabular' ? 'bg-white text-[#0088ff] shadow-xs' : 'hover:text-slate-900'}`}
                >
                  <Grid size={15} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  title="List View"
                  className={`p-1 rounded ${viewMode === 'list' ? 'bg-white text-[#0088ff] shadow-xs' : 'hover:text-slate-900'}`}
                >
                  <List size={15} />
                </button>
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
              >
                <Download size={13} />
                Export
              </button>

              <button
                onClick={() => openRegularizeDrawer(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#0088ff] text-white hover:bg-blue-600 transition-colors shadow-xs"
              >
                <Plus size={13} />
                Apply Regularization
              </button>
            </>
          )}

          {activeTab === 'team' && (
            <button
              onClick={fetchTeamKanban}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw size={13} />
              Refresh Team
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* ============================================================== */}
        {/* TAB 1: MY DATA (Live Check-In Widget + 9-Column Tabular Grid) */}
        {/* ============================================================== */}
        {activeTab === 'mydata' && (
          <>
            {/* Live Punch Widget matching Zoho People */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
              {/* Digital Real-Time Clock & Status */}
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex flex-col items-center justify-center text-blue-600 shadow-inner">
                  <Clock size={28} className="animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black font-mono text-slate-900 tracking-tight">
                      {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        punchState.checkedIn
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${punchState.checkedIn ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                      {punchState.checkedIn ? 'Checked In' : 'Not Checked In'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Calendar size={13} className="text-slate-400" />
                      {currentTime.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span>•</span>
                    <span>General Advisory Shift (08:30 - 17:30)</span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Building size={12} className="text-slate-400" />
                      Work From Office
                    </span>
                  </div>
                </div>
              </div>

              {/* Working Hours Gauge & Large Action Punch Button */}
              <div className="flex items-center gap-5">
                <div className="text-right">
                  <p className="text-xs text-slate-500">Today's Logged Time</p>
                  <p className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                    {formatLiveTimer(punchState.elapsedSeconds)}
                  </p>
                  <p className="text-[11px] text-slate-400">Standard Daily: 08:00 hrs</p>
                </div>

                <button
                  onClick={handleTogglePunch}
                  disabled={punchLoading}
                  className={`px-6 py-3 rounded-xl font-bold text-sm tracking-wide shadow-md transition-all flex items-center gap-2 ${
                    punchState.checkedIn
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200 active:scale-95'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 active:scale-95'
                  } disabled:opacity-50`}
                >
                  {punchLoading ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : punchState.checkedIn ? (
                    <>
                      <X size={16} className="stroke-[3]" />
                      Punch Out
                    </>
                  ) : (
                    <>
                      <Check size={16} className="stroke-[3]" />
                      Punch In
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Monthly Summary Strip (Key Metrics) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Days</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{summaryData.summary.totalDays}</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-emerald-100 bg-emerald-50/20 shadow-xs">
                <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Present</p>
                <p className="text-xl font-bold text-emerald-700 mt-1">{summaryData.summary.presentDays}</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-rose-100 bg-rose-50/20 shadow-xs">
                <p className="text-[11px] font-semibold text-rose-700 uppercase tracking-wider">Absent</p>
                <p className="text-xl font-bold text-rose-700 mt-1">{summaryData.summary.absentDays}</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-blue-100 bg-blue-50/20 shadow-xs">
                <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">On Leave</p>
                <p className="text-xl font-bold text-blue-700 mt-1">{summaryData.summary.leaveDays}</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-purple-100 bg-purple-50/20 shadow-xs">
                <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Holidays</p>
                <p className="text-xl font-bold text-purple-700 mt-1">{summaryData.summary.holidayDays}</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Payable Hours</p>
                <p className="text-xl font-bold text-slate-900 mt-1">{summaryData.summary.totalPayableHours} hrs</p>
              </div>
              <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Overtime</p>
                <p className="text-xl font-bold text-emerald-600 mt-1">+{summaryData.summary.overtimeHours} hrs</p>
              </div>
            </div>

            {/* Attendance Summary Filter Bar & Period Navigator */}
            <div className="bg-white rounded-lg border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              {/* Month Navigator */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200"
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-bold text-slate-800 min-w-[150px] text-center">
                  {monthDisplayName}
                </span>
                <button
                  onClick={handleNextMonth}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200"
                  title="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {['ALL', 'PRESENT', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === st
                        ? 'bg-[#0088ff] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st === 'ALL' ? 'All Statuses' : st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Search Within Month */}
              <div className="relative min-w-[200px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter by date..."
                  value={searchDayQuery}
                  onChange={(e) => setSearchDayQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0088ff] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* 9-Column Statutory Attendance Table (Tabular View) */}
            {viewMode === 'tabular' && (
              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">First In</th>
                        <th className="py-3 px-4">Last Out</th>
                        <th className="py-3 px-4">Total Hours</th>
                        <th className="py-3 px-4">Payable Hours</th>
                        <th className="py-3 px-4">Overtime / Deviation</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Shift(s)</th>
                        <th className="py-3 px-4 text-right">Regularization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaryLoading ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#0088ff]" />
                            Loading attendance records...
                          </td>
                        </tr>
                      ) : filteredDays.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-slate-400">
                            No attendance records matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredDays.map((d) => {
                          const isWeekendRow = d.status === 'WEEKEND';
                          const isHolidayRow = d.status === 'HOLIDAY';
                          const isAbsentRow = d.status === 'ABSENT';

                          return (
                            <tr
                              key={d.date}
                              className={`transition-colors ${
                                isWeekendRow
                                  ? 'bg-slate-50/40 text-slate-400'
                                  : isHolidayRow
                                  ? 'bg-purple-50/20'
                                  : isAbsentRow
                                  ? 'bg-rose-50/10 hover:bg-rose-50/20'
                                  : 'hover:bg-blue-50/20 text-slate-700'
                              }`}
                            >
                              {/* 1. Date */}
                              <td className="py-3 px-4 font-medium text-slate-900 whitespace-nowrap">
                                {d.formattedDate}
                              </td>

                              {/* 2. First In */}
                              <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                                {d.firstIn}
                              </td>

                              {/* 3. Last Out */}
                              <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                                {d.lastOut === 'Running' ? (
                                  <span className="text-emerald-600 font-semibold animate-pulse">Running</span>
                                ) : (
                                  d.lastOut
                                )}
                              </td>

                              {/* 4. Total Hours */}
                              <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                                {formatCellHours(d.totalHours)}
                              </td>

                              {/* 5. Payable Hours */}
                              <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                                {formatCellHours(d.payableHours)}
                              </td>

                              {/* 6. Overtime / Deviation */}
                              <td className="py-3 px-4 font-mono whitespace-nowrap">
                                {d.deviation.startsWith('+') ? (
                                  <span className="text-emerald-600 font-semibold">{d.deviation}</span>
                                ) : d.deviation.startsWith('-') ? (
                                  <span className="text-rose-600 font-semibold">{d.deviation}</span>
                                ) : (
                                  <span className="text-slate-400">00:00</span>
                                )}
                              </td>

                              {/* 7. Status */}
                              <td className="py-3 px-4 whitespace-nowrap">
                                {renderStatusBadge(d.status)}
                              </td>

                              {/* 8. Shift(s) */}
                              <td className="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                                {d.shift}
                              </td>

                              {/* 9. Regularization */}
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {d.regularization === 'REGULARIZED' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    <Check size={11} /> Regularized
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => openRegularizeDrawer(d)}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0088ff] hover:text-blue-700 bg-blue-50/50 hover:bg-blue-100/50 px-2.5 py-1 rounded border border-blue-200 transition-colors"
                                  >
                                    <Plus size={11} /> Apply
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDays.map((d) => (
                  <div key={d.date} className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm">{d.formattedDate}</span>
                      {renderStatusBadge(d.status)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">In / Out:</span>
                        <p className="font-mono text-slate-700 font-medium">{d.firstIn} - {d.lastOut}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Total Hours:</span>
                        <p className="font-mono text-slate-700 font-medium">{formatCellHours(d.totalHours)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Payable:</span>
                        <p className="font-mono text-slate-700 font-medium">{formatCellHours(d.payableHours)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Overtime:</span>
                        <p className="font-mono font-medium">{d.deviation}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">{d.shift}</span>
                      <button
                        onClick={() => openRegularizeDrawer(d)}
                        className="text-[#0088ff] font-medium hover:underline text-[11px]"
                      >
                        Apply Regularization
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============================================================== */}
        {/* TAB 2: TEAM (Attendance Kanban Board matching Zoho People)     */}
        {/* ============================================================== */}
        {activeTab === 'team' && (
          <div className="space-y-4">
            {/* Team Header & Live Stats */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Team Real-Time Attendance</h2>
                  <p className="text-xs text-slate-500">Live employee presence, check-in timestamps, and absence tracker for today.</p>
                </div>
              </div>

              {/* Counters */}
              <div className="flex items-center gap-4">
                <div className="text-center px-3 py-1 bg-slate-50 rounded-md border border-slate-200">
                  <span className="text-[11px] text-slate-400 block">Total Staff</span>
                  <span className="font-bold text-slate-800 text-sm">{teamKanban.summary.totalCount}</span>
                </div>
                <div className="text-center px-3 py-1 bg-emerald-50 rounded-md border border-emerald-200">
                  <span className="text-[11px] text-emerald-700 block">Checked In</span>
                  <span className="font-bold text-emerald-700 text-sm">{teamKanban.summary.checkedInCount}</span>
                </div>
                <div className="text-center px-3 py-1 bg-amber-50 rounded-md border border-amber-200">
                  <span className="text-[11px] text-amber-700 block">Not Yet In</span>
                  <span className="font-bold text-amber-700 text-sm">{teamKanban.summary.notYetInCount}</span>
                </div>
                <div className="text-center px-3 py-1 bg-blue-50 rounded-md border border-blue-200">
                  <span className="text-[11px] text-blue-700 block">On Leave</span>
                  <span className="font-bold text-blue-700 text-sm">{teamKanban.summary.onLeaveCount}</span>
                </div>
              </div>

              {/* Search */}
              <div className="relative min-w-[220px]">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search team member..."
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff] focus:bg-white"
                />
              </div>
            </div>

            {/* Kanban Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Column 1: Checked In */}
              <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 flex flex-col space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Checked In Today</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {teamKanban.checkedIn.length}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {teamKanban.checkedIn.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                      No employees checked in yet today.
                    </div>
                  ) : (
                    teamKanban.checkedIn
                      .filter((e) => !teamSearch || e.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .map((emp) => (
                        <div key={emp.id} className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs hover:border-emerald-300 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-xs">{emp.name}</h4>
                                <p className="text-[11px] text-slate-500">{emp.position}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {emp.status}
                            </span>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Clock In: <b className="font-mono text-slate-700">{emp.firstIn}</b></span>
                            <span>{emp.department}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Column 2: Not Yet In */}
              <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 flex flex-col space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">Not Yet Checked In</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                    {teamKanban.notYetIn.length}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {teamKanban.notYetIn.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                      Everyone has checked in!
                    </div>
                  ) : (
                    teamKanban.notYetIn
                      .filter((e) => !teamSearch || e.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .map((emp) => (
                        <div key={emp.id} className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs hover:border-amber-300 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-xs">{emp.name}</h4>
                                <p className="text-[11px] text-slate-500">{emp.position}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Pending In
                            </span>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span>ID: <b className="font-mono text-slate-700">{emp.employeeNumber || '—'}</b></span>
                            <span>{emp.department}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Column 3: On Leave */}
              <div className="bg-slate-100/70 rounded-xl p-3 border border-slate-200 flex flex-col space-y-3">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="font-bold text-xs text-slate-800 uppercase tracking-wider">On Approved Leave</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    {teamKanban.onLeave.length}
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                  {teamKanban.onLeave.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                      No team members on leave today.
                    </div>
                  ) : (
                    teamKanban.onLeave
                      .filter((e) => !teamSearch || e.name.toLowerCase().includes(teamSearch.toLowerCase()))
                      .map((emp) => (
                        <div key={emp.id} className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs hover:border-blue-300 transition-all">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold text-xs flex items-center justify-center">
                                {emp.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-xs">{emp.name}</h4>
                                <p className="text-[11px] text-slate-500">{emp.position}</p>
                              </div>
                            </div>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                              {emp.leaveType}
                            </span>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="italic truncate max-w-[150px]">{emp.reason || 'Annual Leave'}</span>
                            <span>{emp.department}</span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* SLIDE-OUT DRAWER: APPLY ATTENDANCE REGULARIZATION              */}
      {/* ============================================================== */}
      {regularizeDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0088ff] text-white flex items-center justify-center font-bold">
                  <Clock size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Attendance Regularization</h3>
                  <p className="text-[11px] text-slate-500">Correct missing punches or log full day field presence.</p>
                </div>
              </div>
              <button
                onClick={() => setRegularizeDrawerOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleRegularizeSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date to Regularize*</label>
                <input
                  type="date"
                  required
                  value={regularizeForm.workDate}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, workDate: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Correction Type*</label>
                <select
                  value={regularizeForm.type}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff]"
                >
                  <option value="FULL_DAY">Full Day Attendance Correction</option>
                  <option value="MISSING_IN">Missing Clock-In Only</option>
                  <option value="MISSING_OUT">Missing Clock-Out Only</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Clock-In</label>
                  <input
                    type="time"
                    value={regularizeForm.clockInTime}
                    onChange={(e) => setRegularizeForm({ ...regularizeForm, clockInTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Clock-Out</label>
                  <input
                    type="time"
                    value={regularizeForm.clockOutTime}
                    onChange={(e) => setRegularizeForm({ ...regularizeForm, clockOutTime: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Regularization*</label>
                <select
                  value={regularizeForm.reason}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff]"
                >
                  <option value="Forgot to Punch">Forgot to Punch (Check In / Check Out)</option>
                  <option value="Client Site Visit / Meeting">Client Site Visit / Advisory Meeting</option>
                  <option value="Network / Device Glitch">Network / Technical Device Failure</option>
                  <option value="Remote / On-field Duty">Remote / On-Field Assignment</option>
                  <option value="Official Travel">Official Business Travel</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Additional Notes / Justification</label>
                <textarea
                  rows={3}
                  placeholder="Provide context for line manager audit..."
                  value={regularizeForm.notes}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0088ff] resize-none"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-[11px] text-blue-800">
                <div className="flex items-start gap-2">
                  <AlertCircle size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
                  <p>
                    Regularized attendance updates will reflect across statutory reports and monthly payroll calculations once approved.
                  </p>
                </div>
              </div>
            </form>

            {/* Drawer Actions */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRegularizeDrawerOpen(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleRegularizeSubmit}
                disabled={regularizeSubmitting}
                className="px-5 py-2 bg-[#0088ff] text-white rounded-md text-xs font-semibold hover:bg-blue-600 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {regularizeSubmitting ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
                Submit Regularization
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
