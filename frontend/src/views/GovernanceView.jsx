import React, { useState, useEffect, useCallback } from 'react';
import TimeTrackerView from './TimeTrackerView';
import FilesView from './FilesView';
import InlineDocumentViewerModal from './modals/InlineDocumentViewerModal';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  List,
  Filter,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  X,
  Check,
  Shield,
  FileText,
  Download,
  Lock,
  AlertTriangle,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownload, unwrapList } from '../utils/api';

function formatHoursHhMm(decimalHours) {
  const mins = Math.round((Number(decimalHours) || 0) * 60);
  const h = String(Math.floor(mins / 60)).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m} Hrs`;
}

export default function GovernanceView({
  activeTab = 'timetracker',
  topContextTab = 'mydata',
  subViewHint = null,
  currentUser,
  employees = [],
  policies = [],
  trainings = [],
  erCases = [],
  auditLogs = [],
  tasks = [],
  onPublishPolicy,
  onAcknowledgePolicy,
  onOpenWhistleblowerModal,
  onCreateErCase,
  onRefreshAll,
  onShowToast,
  setActiveTab,
}) {
  const userPermissions = new Set(currentUser?.permissions || []);
  const userRoles = new Set(
    (currentUser?.roles || (currentUser?.role ? [currentUser.role] : [])).map((r) => String(r).toLowerCase())
  );
  const canManagePolicy = userPermissions.has('policy.manage');
  const canManageTraining = userPermissions.has('training.manage');
  const canUploadDocs = userPermissions.has('documents.upload');
  const canDownloadDocs = userPermissions.has('documents.download');
  const canIntakeEr = userPermissions.has('er.intake');
  const canHandleEr = userPermissions.has('er.case.handle');
  const canAppealEr = userPermissions.has('er.case.appeal');
  const isHrOrAdmin =
    userRoles.has('system_admin') ||
    userRoles.has('managing_partner') ||
    userRoles.has('operations_director') ||
    userRoles.has('head_of_hr') ||
    userPermissions.has('employees.view') ||
    userPermissions.has('config.manage');

  // ==================== MODE A: TIME TRACKER, SHIFTS & ATTENDANCE ====================
  const [timeSubTab, setTimeSubTab] = useState(
    activeTab === 'attendance'
      ? topContextTab === 'shifts' || subViewHint === 'shifts'
        ? 'shifts'
        : 'attendance'
      : 'timelogs'
  );
  const [weekOffset, setWeekOffset] = useState(0);
  const [logDropdownOpen, setLogDropdownOpen] = useState(false);
  const [timeFilterOpen, setTimeFilterOpen] = useState(false);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');

  const [ttClients, setTtClients] = useState([]);
  const [ttProjects, setTtProjects] = useState([]);
  const [ttLogs, setTtLogs] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedPhaseId, setSelectedPhaseId] = useState('');
  const [workNote, setWorkNote] = useState('');
  const [manualHours, setManualHours] = useState('2.0');
  const [isBillable, setIsBillable] = useState(true);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Filter Drawer State
  const [filterPeriod, setFilterPeriod] = useState('This Week');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterBillable, setFilterBillable] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  // Inline Quick Modals for "Add Project" / "Add Job" inside Time Bar
  const [quickProjectModal, setQuickProjectModal] = useState(false);
  const [quickProjectForm, setQuickProjectForm] = useState({
    code: '',
    name: '',
    clientId: '',
    budgetAmountKes: 500000,
    budgetHours: 100,
    startDate: '2026-11-01',
    endDate: '2026-12-31',
  });
  const [quickPhaseModal, setQuickPhaseModal] = useState(false);
  const [quickPhaseForm, setQuickPhaseForm] = useState({
    name: '',
    startDate: '2026-11-01',
    endDate: '2026-12-15',
  });

  // Attendance State
  const [attendanceData, setAttendanceData] = useState({
    checkedIn: false,
    elapsedSeconds: 0,
    punches: [],
  });
  const [absencesList, setAbsencesList] = useState([]);

  // ==================== MODE B: HR LETTERS / ADDRESS PROOF ====================
  const [letterViewOpen, setLetterViewOpen] = useState(false);
  const [customViews, setCustomViews] = useState([]);
  const [createLetterViewOpen, setCreateLetterViewOpen] = useState(false);
  const [newLetterViewName, setNewLetterViewName] = useState('');
  const [addAddressProofOpen, setAddAddressProofOpen] = useState(false);
  const [addressProofRecords, setAddressProofRecords] = useState([]);
  const [letterStatusFilter, setLetterStatusFilter] = useState('ALL');
  const [letterSearch, setLetterSearch] = useState('');
  const [reasonDropdownOpen, setReasonDropdownOpen] = useState(false);
  const [reasonSearch, setReasonSearch] = useState('');
  const [addressForm, setAddressForm] = useState({
    employeeId: '',
    dateOfRequest: new Date().toISOString().slice(0, 10),
    dateOfJoining: '02-Feb-2024',
    reason: 'Select',
    otherReason: '',
    designation: currentUser?.roles?.[0] || 'Staff Member',
    changeInAddress: 'Select',
    newAddressLine1: '',
    newAddressLine2: '',
    newCity: '',
    newCountry: 'Kenya',
    newPostalCode: '',
  });
  const [addressErrors, setAddressErrors] = useState({});

  // ==================== MODE C: GOVERNANCE (POLICIES, TRAINING, DOCS, ER) ====================
  const [govSubTab, setGovSubTab] = useState(
    subViewHint === 'documents' || topContextTab === 'files'
      ? 'documents'
      : topContextTab === 'ercases'
      ? 'er'
      : 'policies'
  ); // policies | training | documents | er
  const [policyPreviewDoc, setPolicyPreviewDoc] = useState(null);
  const [acknowledgements, setAcknowledgements] = useState([]);
  const [programmes, setProgrammes] = useState([]);
  const [phishingRecords, setPhishingRecords] = useState([]);
  const [securityComms, setSecurityComms] = useState([]);
  const [vaultDocs, setVaultDocs] = useState([]);

  const [newPolicyForm, setNewPolicyForm] = useState({
    code: '',
    title: '',
    category: 'CODE_OF_CONDUCT',
    targetAudience: 'ALL_STAFF',
    sourceReference: 'Ndakala Policy Manual',
    effectiveDate: '2026-11-13',
    initialVersionSummary: '',
  });
  const [newProgForm, setNewProgForm] = useState({
    code: '',
    name: '',
    category: 'CYBERSECURITY_INDUCTION',
    recurrence: 'ANNUAL',
    dueDaysAfterAssignment: 14,
  });
  const [assignProgId, setAssignProgId] = useState('');
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('2026-12-15');
  const [newVersionModal, setNewVersionModal] = useState(null);
  const [newVersionForm, setNewVersionForm] = useState({
    versionNumber: '2.0',
    contentSummary: '',
    effectiveDate: '2026-12-01',
    sourceReference: 'Ndakala Policy Manual Rev',
  });
  const [refusalPromptAck, setRefusalPromptAck] = useState(null);
  const [refusalReasonText, setRefusalReasonText] = useState('Requires HR policy clause clarification before acknowledgement.');
  const [inspectedErCase, setInspectedErCase] = useState(null);
  const [newCommForm, setNewCommForm] = useState({
    subject: '',
    channel: 'EMAIL',
    audience: 'ALL_STAFF',
    reference: '',
  });
  const [newDocForm, setNewDocForm] = useState({
    fileName: '',
    mimeType: 'application/pdf',
    category: 'POLICY',
    securityClassification: 'INTERNAL',
    fileBase64: '',
  });
  const [newErForm, setNewErForm] = useState({
    caseType: 'GRIEVANCE',
    title: '',
    severity: 'STANDARD',
    primaryHandlerId: '',
    allegationSummary: '',
    policyClausesCited: '',
  });

  // Workspace Operations Modules: Shifts, Travel, Engagement Surveys, Action Tasks & ER Modal
  const [shiftsList, setShiftsList] = useState([]);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftEditForm, setShiftEditForm] = useState({
    startTime: '08:30',
    endTime: '17:30',
    breakMinutes: 60,
    gracePeriodMinutes: 15,
    assignedEmployeeIds: [],
  });
  const [shiftForm, setShiftForm] = useState({
    name: '',
    code: '',
    startTime: '08:30',
    endTime: '17:30',
    breakMinutes: 60,
    gracePeriodMinutes: 15,
    department: 'All Departments',
    isNightShift: false,
  });
  const [travelList, setTravelList] = useState([]);
  const [travelForm, setTravelForm] = useState({
    destination: '',
    purpose: '',
    departureDate: '2026-11-20',
    returnDate: '2026-11-22',
    transportMode: 'FLIGHT',
    perDiemDays: 2,
    estimatedBudgetKes: 45000,
    notes: '',
  });
  const [surveysList, setSurveysList] = useState([]);
  const [surveyForm, setSurveyForm] = useState({
    title: '',
    description: '',
    closingDate: '2026-12-15',
    anonymous: true,
  });
  const [activeSurveyRespond, setActiveSurveyRespond] = useState(null);
  const [surveyResponseForm, setSurveyResponseForm] = useState({ overallRating: 5, comment: '' });
  const [personalTasks, setPersonalTasks] = useState([]);
  const [personalTaskForm, setPersonalTaskForm] = useState({
    title: '',
    dueDate: '2026-11-20',
    priority: 'MEDIUM',
    assigneeEmployeeId: '',
    notes: '',
  });
  const [erModal, setErModal] = useState(null); // { mode: 'conflict'|'hearing'|'decision'|'appeal'|'review_appeal', caseItem }
  const [erModalForm, setErModalForm] = useState({
    natureOfConflict: 'Line-reporting conflict with complainant',
    scheduledDate: '2026-11-25T10:00:00Z',
    locationOrLink: 'Boardroom A / Microsoft Teams',
    findings: 'Formal investigation findings documented after human review.',
    sanction: 'WRITTEN_WARNING',
    appealOfficerId: '',
    grounds: 'Procedural mitigation and new documentary evidence',
    appealId: '',
    outcome: 'UPHELD',
    comments: 'Reviewed by Appeal Officer after hearing record verification.',
  });

  useEffect(() => {
    if (activeTab === 'attendance') {
      setTimeSubTab(topContextTab === 'shifts' || subViewHint === 'shifts' ? 'shifts' : 'attendance');
    } else if (activeTab === 'timetracker' && (timeSubTab === 'attendance' || timeSubTab === 'shifts')) {
      setTimeSubTab('timelogs');
    } else if (activeTab === 'admin') {
      if (topContextTab === 'ercases') {
        setGovSubTab('er');
      } else if (subViewHint === 'documents') {
        setGovSubTab('documents');
      }
    }
  }, [activeTab, topContextTab, subViewHint]);

  useEffect(() => {
    let t = null;
    if (timerRunning) {
      t = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    }
    return () => {
      if (t) clearInterval(t);
    };
  }, [timerRunning]);

  const loadTimeTrackerData = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (filterProjectId) q.set('projectId', filterProjectId);
      if (filterStatus !== 'All') q.set('status', filterStatus);
      const [cRes, pRes, lRes] = await Promise.all([
        apiGet('/api/v1/timetracker/clients').catch(() => []),
        apiGet('/api/v1/timetracker/projects').catch(() => []),
        apiGet(`/api/v1/timetracker/logs${q.toString() ? `?${q.toString()}` : ''}`).catch(() => []),
      ]);
      const clientsArr = unwrapList(cRes);
      const projsArr = unwrapList(pRes);
      const logsArr = unwrapList(lRes);
      setTtClients(clientsArr);
      setTtProjects(projsArr);
      setTtLogs(logsArr);
      if (!selectedProjectId && projsArr.length > 0) setSelectedProjectId(projsArr[0].id);
      if (!quickProjectForm.clientId && clientsArr.length > 0) {
        setQuickProjectForm((prev) => ({ ...prev, clientId: clientsArr[0].id }));
      }
    } catch {
      // handled cleanly per request
    }
  }, [filterProjectId, filterStatus]);

  const loadAttendance = useCallback(async () => {
    const [att, abs] = await Promise.all([
      apiGet('/api/v1/workspace/attendance').catch(() => ({ checkedIn: false, elapsedSeconds: 0, punches: [] })),
      apiGet('/api/v1/absences').catch(() => []),
    ]);
    setAttendanceData(att || { checkedIn: false, elapsedSeconds: 0, punches: [] });
    setAbsencesList(unwrapList(abs));
  }, []);

  const loadHrLetters = useCallback(async () => {
    const q = new URLSearchParams();
    if (letterStatusFilter !== 'ALL') q.set('status', letterStatusFilter);
    if (letterSearch.trim()) q.set('search', letterSearch.trim());
    const [lettersRes, viewsRes] = await Promise.all([
      apiGet(`/api/v1/hr-letters/address-proof${q.toString() ? `?${q.toString()}` : ''}`).catch(() => ({ items: [] })),
      apiGet('/api/v1/workspace/custom-views?module=ADDRESS_PROOF').catch(() => ({ items: [] })),
    ]);
    setAddressProofRecords(unwrapList(lettersRes));
    setCustomViews(unwrapList(viewsRes));
  }, [letterStatusFilter, letterSearch]);

  const loadGovernanceExtras = useCallback(async () => {
    const [acks, progs, phish, comms, docs] = await Promise.all([
      apiGet('/api/v1/governance/policies/acknowledgements').catch(() => []),
      apiGet('/api/v1/governance/training/programmes').catch(() => []),
      canManageTraining
        ? apiGet('/api/v1/governance/training/phishing-records').catch(() => [])
        : Promise.resolve([]),
      apiGet('/api/v1/governance/training/security-comms').catch(() => []),
      apiGet('/api/v1/documents').catch(() => []),
    ]);
    setAcknowledgements(unwrapList(acks));
    setProgrammes(unwrapList(progs));
    setPhishingRecords(unwrapList(phish));
    setSecurityComms(unwrapList(comms));
    setVaultDocs(unwrapList(docs));
  }, [canManageTraining]);

  const loadWorkspaceModules = useCallback(async (tabName) => {
    if (tabName === 'shifts' || tabName === 'attendance') {
      const sh = await apiGet('/api/v1/workspace/shifts').catch(() => ({ items: [] }));
      setShiftsList(unwrapList(sh));
    }
    if (tabName === 'travel') {
      const tr = await apiGet('/api/v1/workspace/travel-requests').catch(() => ({ items: [] }));
      setTravelList(unwrapList(tr));
    }
    if (tabName === 'engagement') {
      const sv = await apiGet('/api/v1/workspace/surveys').catch(() => ({ items: [] }));
      setSurveysList(unwrapList(sv));
    }
    if (tabName === 'tasks') {
      const tk = await apiGet('/api/v1/workspace/personal-tasks').catch(() => ({ items: [] }));
      setPersonalTasks(unwrapList(tk));
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'timetracker' || activeTab === 'attendance') {
      loadTimeTrackerData();
      loadAttendance();
      loadWorkspaceModules('shifts');
    } else if (activeTab === 'travel' || subViewHint === 'travel') {
      loadWorkspaceModules('travel');
    } else if (activeTab === 'engagement' || subViewHint === 'engagement') {
      loadWorkspaceModules('engagement');
    } else if (activeTab === 'tasks' || subViewHint === 'tasks') {
      loadWorkspaceModules('tasks');
    } else if (activeTab === 'hrletters') {
      loadHrLetters();
    } else {
      loadGovernanceExtras();
    }
  }, [activeTab, subViewHint, loadTimeTrackerData, loadAttendance, loadHrLetters, loadGovernanceExtras, loadWorkspaceModules]);

  const formatTimer = (totalSec) => {
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // Current selected project & phases
  const activeProjObj = ttProjects.find((p) => p.id === selectedProjectId) || ttProjects[0];
  const activePhases = activeProjObj?.phases || [];
  const activePhaseObj = activePhases.find((ph) => ph.id === selectedPhaseId) || activePhases[0];

  // Computed week range label
  const baseStart = new Date('2026-11-08T00:00:00Z');
  baseStart.setUTCDate(baseStart.getUTCDate() + weekOffset * 7);
  const baseEnd = new Date(baseStart);
  baseEnd.setUTCDate(baseEnd.getUTCDate() + 6);
  const fmtShortDate = (d) =>
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ /g, '-');
  const workDateDefault = new Date().toISOString().slice(0, 10);

  // Filtered logs for quick-view Time Logs canvas
  const filteredQuickLogs = ttLogs.filter((tl) => {
    if (filterClientId && tl.project?.clientId !== filterClientId) return false;
    if (filterBillable === 'Billable' && !tl.isBillable) return false;
    if (filterBillable === 'Non-billable' && tl.isBillable) return false;
    if (filterPeriod === 'This Week') {
      const startIso = baseStart.toISOString().slice(0, 10);
      const endIso = baseEnd.toISOString().slice(0, 10);
      if (tl.workDate < startIso || tl.workDate > endIso) return false;
    } else if (filterPeriod === 'This Month') {
      const monthPrefix = new Date().toISOString().slice(0, 7);
      if (!String(tl.workDate || '').startsWith(monthPrefix)) return false;
    }
    return true;
  });

  const totalHoursLogged = filteredQuickLogs.reduce((s, l) => s + Number(l.hours || 0), 0);
  const billableHoursLogged = filteredQuickLogs.filter((l) => l.isBillable).reduce((s, l) => s + Number(l.hours || 0), 0);
  const nonBillableHoursLogged = totalHoursLogged - billableHoursLogged;
  const approvedHoursLogged = filteredQuickLogs.filter((l) => l.status === 'APPROVED' || l.status === 'LOCKED').reduce((s, l) => s + Number(l.hours || 0), 0);
  const pendingHoursLogged = filteredQuickLogs.filter((l) => l.status === 'PENDING').reduce((s, l) => s + Number(l.hours || 0), 0);

  const handleQuickLogTime = async (hoursOverride, noteOverride) => {
    const projectId = selectedProjectId || ttProjects[0]?.id;
    if (!projectId) {
      onShowToast && onShowToast('No active Time Tracker project found.', 'error');
      return;
    }
    const rawHours = Number(hoursOverride ?? manualHours) || 1;
    const roundedHours = Math.max(0.25, Math.round(rawHours * 4) / 4);
    try {
      await apiPost('/api/v1/timetracker/logs', {
        projectId,
        phaseId: selectedPhaseId || activePhases[0]?.id || undefined,
        workDate: workDateDefault,
        hours: roundedHours,
        isBillable,
        description: (noteOverride || workNote || 'Client advisory time entry').trim(),
      });
      setWorkNote('');
      onShowToast && onShowToast(`Logged ${roundedHours} hrs successfully.`);
      await loadTimeTrackerData();
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Failed to save time log', 'error');
    }
  };

  const handleQuickAddProject = async (e) => {
    e.preventDefault();
    try {
      const created = await apiPost('/api/v1/timetracker/projects', {
        code: quickProjectForm.code.trim(),
        name: quickProjectForm.name.trim(),
        clientId: quickProjectForm.clientId || ttClients[0]?.id,
        leadEmployeeId: currentUser?.employeeId || employees[0]?.id,
        budgetAmountKes: Number(quickProjectForm.budgetAmountKes) || 0,
        budgetHours: Number(quickProjectForm.budgetHours) || 0,
        startDate: quickProjectForm.startDate,
        endDate: quickProjectForm.endDate,
      });
      setQuickProjectModal(false);
      setQuickProjectForm({ ...quickProjectForm, code: '', name: '' });
      setSelectedProjectId(created.id);
      onShowToast && onShowToast(`Project ${created.name} created.`);
      await loadTimeTrackerData();
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Unable to create project', 'error');
    }
  };

  const handleQuickAddPhase = async (e) => {
    e.preventDefault();
    if (!activeProjObj) return;
    try {
      const ph = await apiPost(`/api/v1/timetracker/projects/${activeProjObj.id}/phases`, {
        name: quickPhaseForm.name.trim(),
        startDate: quickPhaseForm.startDate,
        endDate: quickPhaseForm.endDate,
      });
      setQuickPhaseModal(false);
      setQuickPhaseForm({ ...quickPhaseForm, name: '' });
      setSelectedPhaseId(ph.id);
      onShowToast && onShowToast(`Job / Phase ${ph.name} added.`);
      await loadTimeTrackerData();
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Unable to create phase', 'error');
    }
  };

  // ==================== RENDER 1: TIME TRACKER & ATTENDANCE ====================
  if (activeTab === 'timetracker' || activeTab === 'attendance') {
    const mapToEmbeddedTab = {
      timesheets: 'logs',
      jobs: 'rates',
      projects: 'projects',
      schedule: 'periods',
      approvals: 'approvals',
      profitability: 'analytics',
    };

    return (
      <div className="flex flex-col h-full bg-[#edf1f7] relative">
        {/* White Sub-Tab Bar: Ndakala Time Tracker, Shifts & Attendance */}
        <div className="h-[42px] bg-white border-b border-slate-200 px-5 flex items-center space-x-6 flex-shrink-0 select-none overflow-x-auto">
          {[
            { id: 'timelogs', label: 'Time Logs' },
            { id: 'timesheets', label: 'Timesheets' },
            { id: 'jobs', label: 'Jobs & Rates' },
            { id: 'projects', label: 'Projects & Gantt' },
            { id: 'schedule', label: 'Period Lock' },
            { id: 'approvals', label: 'Approvals' },
            { id: 'profitability', label: 'Profitability KPIs' },
            { id: 'attendance', label: 'Attendance & Absences' },
            { id: 'shifts', label: 'Shift Schedules' },
          ].map((t) => {
            const active = timeSubTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeSubTab(t.id)}
                className={`relative h-full flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                  active ? 'text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{t.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Embedded ND-RUN-2026-10 Sub-modules for Timesheets / Jobs / Projects / Period Lock / Approvals / Analytics */}
        {mapToEmbeddedTab[timeSubTab] && (
          <div className="flex-1 overflow-y-auto">
            <TimeTrackerView
              currentUser={currentUser}
              employees={employees}
              onShowToast={onShowToast}
              initialSubTab={mapToEmbeddedTab[timeSubTab]}
            />
          </div>
        )}

        {/* Attendance & Absences Panel */}
        {timeSubTab === 'attendance' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Live Web Attendance & Shift Punches</h3>
                <p className="text-slate-500 mt-0.5">
                  Status:{' '}
                  <strong className={attendanceData.checkedIn ? 'text-emerald-600' : 'text-slate-700'}>
                    {attendanceData.checkedIn ? 'Checked In' : 'Checked Out'}
                  </strong>{' '}
                  • Today Elapsed: <span className="font-mono font-semibold">{formatTimer(attendanceData.elapsedSeconds || 0)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!attendanceData.checkedIn ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiPost('/api/v1/workspace/attendance/clock-in', { source: 'WEB' });
                      onShowToast && onShowToast('Checked in successfully.');
                      await loadAttendance();
                    }}
                    className="px-4 py-1.5 bg-[#00b87c] text-white font-semibold rounded"
                  >
                    Check In Now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiPost('/api/v1/workspace/attendance/clock-out', {});
                      onShowToast && onShowToast('Checked out and shift recorded.');
                      await loadAttendance();
                    }}
                    className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded"
                  >
                    Check Out
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">
                  Recent Web Punches ({attendanceData.punches?.length || 0})
                </div>
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Work Date</th>
                      <th className="py-2 px-3">Clock In</th>
                      <th className="py-2 px-3">Clock Out</th>
                      <th className="py-2 px-3">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(attendanceData.punches || []).map((p) => (
                      <tr key={p.id}>
                        <td className="py-2 px-3 font-mono">{p.workDate}</td>
                        <td className="py-2 px-3">{new Date(p.clockInAt).toLocaleTimeString()}</td>
                        <td className="py-2 px-3">{p.clockOutAt ? new Date(p.clockOutAt).toLocaleTimeString() : 'Active'}</td>
                        <td className="py-2 px-3 font-mono">{formatTimer(p.totalSecs || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">
                  Unexpected Absences Register ({absencesList.length})
                </div>
                <div className="divide-y divide-slate-100">
                  {absencesList.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">No unexpected absences recorded.</div>
                  ) : (
                    absencesList.map((ab) => (
                      <div key={ab.id} className="p-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-800">
                            {ab.employee ? `${ab.employee.firstName} ${ab.employee.lastName}` : ab.employeeId} • {ab.reasonCategory}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ab.startDate?.slice(0, 10)} ({ab.contactChannel}) • Status: {ab.status}
                          </div>
                        </div>
                        {(ab.status === 'RECORDED' || ab.status === 'INVESTIGATION_REQUIRED') && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/absences/${ab.id}/review`, {
                                  status: 'EXCUSED',
                                  notes: 'Reviewed & excused by manager/HR',
                                });
                                onShowToast && onShowToast('Absence reviewed and marked excused.');
                                await loadAttendance();
                              } catch (err) {
                                onShowToast && onShowToast(err?.message || 'Review failed', 'error');
                              }
                            }}
                            className="px-2.5 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                          >
                            Excuse Absence
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Shift Schedules Panel */}
        {timeSubTab === 'shifts' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Shift Schedules & Work Rosters ({shiftsList.length})</h3>
                  <p className="text-slate-500 mt-0.5">Define standard advisory, remote, or rotational shifts with grace periods</p>
                </div>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!shiftForm.name.trim()) return;
                  try {
                    await apiPost('/api/v1/workspace/shifts', {
                      ...shiftForm,
                      breakMinutes: Number(shiftForm.breakMinutes) || 60,
                      gracePeriodMinutes: Number(shiftForm.gracePeriodMinutes) || 15,
                    });
                    setShiftForm({ ...shiftForm, name: '', code: '' });
                    onShowToast && onShowToast('Shift schedule created.');
                    await loadWorkspaceModules('shifts');
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Unable to create shift', 'error');
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-6 gap-2.5 pt-2 border-t border-slate-100"
              >
                <input
                  required
                  placeholder="Shift Name (e.g. Nairobi Day)"
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  className="md:col-span-2 px-3 py-1.5 border border-slate-300 rounded"
                />
                <input
                  placeholder="Code (DAY-01)"
                  value={shiftForm.code}
                  onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value.toUpperCase() })}
                  className="px-3 py-1.5 border border-slate-300 rounded"
                />
                <input
                  type="time"
                  value={shiftForm.startTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                  className="px-3 py-1.5 border border-slate-300 rounded"
                />
                <input
                  type="time"
                  value={shiftForm.endTime}
                  onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                  className="px-3 py-1.5 border border-slate-300 rounded"
                />
                <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium">
                  + Add Shift
                </button>
              </form>

              {shiftsList.length === 0 ? (
                <NdakalaEmptyState title="No shift schedules configured yet" />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {shiftsList.map((s) => (
                    <div key={s.id} className="p-4 border border-slate-200 rounded-md bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800">{s.name}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] font-semibold">{s.code}</span>
                      </div>
                      <p className="text-slate-600">Hours: {s.startTime} – {s.endTime} ({s.breakMinutes || 60}m break • {s.gracePeriodMinutes || 15}m grace)</p>
                      <p className="text-[11px] text-slate-500">
                        Dept: {s.department} • Assigned: {(s.assignedEmployeeIds || []).length} staff
                      </p>
                      {editingShiftId === s.id && (
                        <div className="p-2.5 rounded bg-white border border-blue-200 space-y-2 text-[11px]">
                          <div className="grid grid-cols-2 gap-1.5">
                            <label className="block">
                              <span className="text-slate-500">Start</span>
                              <input
                                type="time"
                                value={shiftEditForm.startTime}
                                onChange={(e) => setShiftEditForm({ ...shiftEditForm, startTime: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 rounded"
                              />
                            </label>
                            <label className="block">
                              <span className="text-slate-500">End</span>
                              <input
                                type="time"
                                value={shiftEditForm.endTime}
                                onChange={(e) => setShiftEditForm({ ...shiftEditForm, endTime: e.target.value })}
                                className="w-full px-2 py-1 border border-slate-300 rounded"
                              />
                            </label>
                            <label className="block">
                              <span className="text-slate-500">Break (m)</span>
                              <input
                                type="number"
                                min={0}
                                max={240}
                                value={shiftEditForm.breakMinutes}
                                onChange={(e) => setShiftEditForm({ ...shiftEditForm, breakMinutes: Number(e.target.value) })}
                                className="w-full px-2 py-1 border border-slate-300 rounded"
                              />
                            </label>
                            <label className="block">
                              <span className="text-slate-500">Grace (m)</span>
                              <input
                                type="number"
                                min={0}
                                max={120}
                                value={shiftEditForm.gracePeriodMinutes}
                                onChange={(e) => setShiftEditForm({ ...shiftEditForm, gracePeriodMinutes: Number(e.target.value) })}
                                className="w-full px-2 py-1 border border-slate-300 rounded"
                              />
                            </label>
                          </div>
                          <div>
                            <span className="text-slate-500 block mb-1">Assign Staff</span>
                            <select
                              value=""
                              onChange={(e) => {
                                const empId = e.target.value;
                                if (!empId) return;
                                setShiftEditForm((prev) => ({
                                  ...prev,
                                  assignedEmployeeIds: Array.from(new Set([...(prev.assignedEmployeeIds || []), empId])),
                                }));
                              }}
                              className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                            >
                              <option value="">+ Add employee to shift...</option>
                              {employees.map((em) => (
                                <option key={em.id} value={em.id}>
                                  {em.fullName || `${em.firstName} ${em.lastName}`}
                                </option>
                              ))}
                            </select>
                            {(shiftEditForm.assignedEmployeeIds || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {shiftEditForm.assignedEmployeeIds.map((eid) => {
                                  const empObj = employees.find((x) => x.id === eid);
                                  const label = empObj ? `${empObj.firstName} ${empObj.lastName}` : eid;
                                  return (
                                    <span key={eid} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-[#0088ff] rounded">
                                      {label}
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setShiftEditForm((prev) => ({
                                            ...prev,
                                            assignedEmployeeIds: prev.assignedEmployeeIds.filter((id) => id !== eid),
                                          }))
                                        }
                                        className="text-rose-500 font-bold"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingShiftId(null)}
                              className="px-2 py-1 border border-slate-300 rounded text-slate-600"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/workspace/shifts/${s.id}`, {
                                    startTime: shiftEditForm.startTime,
                                    endTime: shiftEditForm.endTime,
                                    breakMinutes: Number(shiftEditForm.breakMinutes) || 0,
                                    gracePeriodMinutes: Number(shiftEditForm.gracePeriodMinutes) || 0,
                                    assignedEmployeeIds: shiftEditForm.assignedEmployeeIds,
                                  });
                                  setEditingShiftId(null);
                                  onShowToast && onShowToast(`Updated timings & roster for "${s.name}".`);
                                  await loadWorkspaceModules('shifts');
                                } catch (err) {
                                  onShowToast && onShowToast(err?.message || 'Unable to update shift', 'error');
                                }
                              }}
                              className="px-2.5 py-1 bg-[#0088ff] text-white rounded font-medium"
                            >
                              Save Shift
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPatch(`/api/v1/workspace/shifts/${s.id}`, { isActive: !s.isActive });
                                onShowToast && onShowToast(`Shift "${s.name}" ${!s.isActive ? 'activated' : 'paused'}.`);
                                await loadWorkspaceModules('shifts');
                              } catch (err) {
                                onShowToast && onShowToast(err?.message || 'Shift update failed', 'error');
                              }
                            }}
                            className={`px-2.5 py-0.5 rounded text-[11px] font-medium ${s.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                          >
                            {s.isActive ? 'Active' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingShiftId(editingShiftId === s.id ? null : s.id);
                              setShiftEditForm({
                                startTime: s.startTime || '08:30',
                                endTime: s.endTime || '17:30',
                                breakMinutes: s.breakMinutes ?? 60,
                                gracePeriodMinutes: s.gracePeriodMinutes ?? 15,
                                assignedEmployeeIds: Array.isArray(s.assignedEmployeeIds) ? s.assignedEmployeeIds : [],
                              });
                            }}
                            className="text-[#0088ff] hover:underline text-[11px] font-medium"
                          >
                            Edit / Assign
                          </button>
                        </div>
                        {s.id !== 'shift-general' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiDelete(`/api/v1/workspace/shifts/${s.id}`);
                                onShowToast && onShowToast('Shift removed.');
                                await loadWorkspaceModules('shifts');
                              } catch (err) {
                                onShowToast && onShowToast(err?.message || 'Delete restricted', 'error');
                              }
                            }}
                            className="text-rose-600 hover:underline text-[11px]"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Default Time Logs Quick Bar + Table + Filter Drawer + Footer */}
        {timeSubTab === 'timelogs' && (
          <>
            {/* Date Navigation & Log Time Bar */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div />
              <div className="flex items-center gap-2.5">
                <div className="inline-flex items-center border border-slate-200 rounded bg-white">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w - 1)}
                    className="px-2 py-1 text-slate-500 hover:bg-slate-50"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="px-2 py-1 border-x border-slate-200 text-slate-600">
                    <Calendar size={13} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setWeekOffset((w) => w + 1)}
                    className="px-2 py-1 text-slate-500 hover:bg-slate-50"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                <span className="text-xs font-semibold text-slate-700">
                  {fmtShortDate(baseStart)} - {fmtShortDate(baseEnd)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setLogDropdownOpen(!logDropdownOpen)}
                    className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded flex items-center gap-2 shadow-2xs"
                  >
                    <span>Log Time</span>
                    <ChevronDown size={13} />
                  </button>
                  {logDropdownOpen && (
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-xl border border-slate-200 py-1.5 z-40 text-xs animate-fadeIn">
                      {[
                        { label: 'Log Time (Quick)', hrs: Number(manualHours) || 2 },
                        { label: 'Daily Log (8h)', hrs: 8 },
                        { label: 'Half-Day Log (4h)', hrs: 4 },
                        { label: 'Advisory Block (2h)', hrs: 2 },
                      ].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={async () => {
                            setLogDropdownOpen(false);
                            await handleQuickLogTime(opt.hrs, workNote || opt.label);
                          }}
                          className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="inline-flex rounded border border-slate-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setTimeSubTab('timelogs')}
                    className="p-1.5 rounded bg-blue-50 text-[#0088ff] border border-[#0088ff]"
                  >
                    <List size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeSubTab('timesheets')}
                    title="Full Timesheet Grid"
                    className="p-1.5 rounded text-slate-500 hover:text-slate-800"
                  >
                    <Calendar size={13} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setTimeFilterOpen(!timeFilterOpen)}
                  title="Filter"
                  className="p-1.5 border border-slate-200 rounded bg-white text-slate-500 hover:text-slate-800"
                >
                  <Filter size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setTimeSubTab('profitability')}
                  title="Executive Profitability View"
                  className="p-1.5 border border-slate-200 rounded bg-white text-slate-500 hover:text-slate-800"
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>

            {/* Inline Timer Input Bar */}
            <div className="px-5 mb-3">
              <div className="bg-white rounded-md border border-slate-200 px-4 py-2.5 flex flex-wrap items-center gap-3 text-xs shadow-2xs">
                {/* Select Project Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setProjectDropdownOpen(!projectDropdownOpen);
                      setJobDropdownOpen(false);
                    }}
                    className="w-48 px-3 py-1.5 border-b border-slate-200 text-left text-slate-700 flex items-center justify-between"
                  >
                    <span className="truncate">{activeProjObj ? `${activeProjObj.code} - ${activeProjObj.name}` : 'Select Project'}</span>
                    <ChevronDown size={13} className="text-slate-400 shrink-0" />
                  </button>
                  {projectDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-60 bg-white rounded shadow-xl border border-slate-200 p-2 z-30">
                      <input
                        type="text"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full px-2.5 py-1 border border-slate-200 rounded mb-2 text-xs"
                      />
                      <div className="max-h-44 overflow-y-auto space-y-0.5">
                        {ttProjects
                          .filter((p) =>
                            `${p.code} ${p.name}`.toLowerCase().includes(projectSearch.toLowerCase())
                          )
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedProjectId(p.id);
                                setSelectedPhaseId(p.phases?.[0]?.id || '');
                                setProjectDropdownOpen(false);
                              }}
                              className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 rounded text-slate-700 truncate"
                            >
                              {p.code} — {p.name}
                            </button>
                          ))}
                      </div>
                      {currentUser?.permissions?.includes('timetracker.projects.manage') && (
                        <button
                          type="button"
                          onClick={() => {
                            setProjectDropdownOpen(false);
                            setQuickProjectModal(true);
                          }}
                          className="w-full mt-1 pt-1.5 border-t border-slate-100 text-center text-[#0088ff] font-medium"
                        >
                          + Add Project
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Select Job / Phase Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setJobDropdownOpen(!jobDropdownOpen);
                      setProjectDropdownOpen(false);
                    }}
                    className="w-40 px-3 py-1.5 border-b border-slate-200 text-left text-slate-700 flex items-center justify-between"
                  >
                    <span className="truncate">{activePhaseObj ? activePhaseObj.name : 'Select Job / Phase'}</span>
                    <ChevronDown size={13} className="text-slate-400 shrink-0" />
                  </button>
                  {jobDropdownOpen && (
                    <div className="absolute left-0 mt-1 w-52 bg-white rounded shadow-xl border border-slate-200 p-2 z-30">
                      <input
                        type="text"
                        value={jobSearch}
                        onChange={(e) => setJobSearch(e.target.value)}
                        placeholder="Search jobs/phases..."
                        className="w-full px-2.5 py-1 border border-slate-200 rounded mb-2 text-xs"
                      />
                      {activePhases
                        .filter((ph) => ph.name.toLowerCase().includes(jobSearch.toLowerCase()))
                        .map((ph) => (
                          <button
                            key={ph.id}
                            type="button"
                            onClick={() => {
                              setSelectedPhaseId(ph.id);
                              setJobDropdownOpen(false);
                            }}
                            className="w-full px-2.5 py-1.5 text-left hover:bg-slate-50 rounded text-slate-700"
                          >
                            {ph.name}
                          </button>
                        ))}
                      {currentUser?.permissions?.includes('timetracker.projects.manage') && (
                        <button
                          type="button"
                          onClick={() => {
                            setJobDropdownOpen(false);
                            setQuickPhaseModal(true);
                          }}
                          className="w-full mt-1 pt-1.5 border-t border-slate-100 text-center text-[#0088ff] font-medium"
                        >
                          + Add Job / Phase
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <input
                  type="text"
                  value={workNote}
                  onChange={(e) => setWorkNote(e.target.value)}
                  placeholder="What are you working on?"
                  className="flex-1 min-w-[180px] px-3 py-1.5 border-b border-slate-200 focus:outline-none focus:border-[#0088ff] text-slate-700"
                />

                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  value={manualHours}
                  onChange={(e) => setManualHours(e.target.value)}
                  title="Hours (0.25 increments)"
                  className="w-16 px-2 py-1.5 border-b border-slate-200 text-center font-mono text-slate-700"
                />

                <button
                  type="button"
                  onClick={() => setIsBillable(!isBillable)}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    isBillable ? 'text-[#0088ff] bg-blue-50' : 'text-slate-500 bg-slate-100'
                  }`}
                >
                  {isBillable ? 'Billable' : 'Non-Billable'}
                </button>

                <div className="flex items-center gap-2">
                  <div className="px-3.5 py-1.5 rounded bg-[#00b87c] text-white font-mono font-bold text-xs shadow-2xs">
                    {formatTimer(timerSeconds)}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (timerRunning) {
                        setTimerRunning(false);
                        const hrs = Math.max(0.25, Math.round((timerSeconds / 3600) * 4) / 4);
                        await handleQuickLogTime(hrs, workNote || 'Timer session');
                        setTimerSeconds(0);
                      } else {
                        setTimerRunning(true);
                      }
                    }}
                    title={timerRunning ? 'Stop & Save Time Log' : 'Start Live Timer'}
                    className={`w-7 h-7 rounded-full text-white flex items-center justify-center shadow-xs ${
                      timerRunning ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#00b87c] hover:bg-emerald-600'
                    }`}
                  >
                    <Play size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Main Time Logs Canvas */}
            <div className="flex-1 px-5 pb-3 overflow-hidden flex flex-col">
              <div className="flex-1 bg-white rounded-md border border-slate-200 flex flex-col p-4 overflow-y-auto">
                {filteredQuickLogs.length === 0 ? (
                  <div className="my-auto">
                    <NdakalaEmptyState title="No time logs added currently. To add new time logs, click Log Time" />
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Staff</th>
                        <th className="py-2.5 px-3">Project</th>
                        <th className="py-2.5 px-3">Job / Phase</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Billable</th>
                        <th className="py-2.5 px-3">Hours</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredQuickLogs.map((tl) => (
                        <tr key={tl.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-mono text-slate-600">{tl.workDate}</td>
                          <td className="py-2.5 px-3 text-slate-700">{tl.employeeName || 'Staff'}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{tl.project?.name || tl.projectId}</td>
                          <td className="py-2.5 px-3 text-slate-600">{tl.phase?.name || 'General'}</td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{tl.description}</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${tl.isBillable ? 'bg-blue-50 text-[#0088ff]' : 'bg-slate-100 text-slate-600'}`}>
                              {tl.isBillable ? 'Billable' : 'Non-billable'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold font-mono text-emerald-700">{Number(tl.hours).toFixed(2)}h</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              tl.status === 'APPROVED' || tl.status === 'LOCKED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : tl.status === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-800'
                            }`}>
                              {tl.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {tl.status === 'PENDING' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiDelete(`/api/v1/timetracker/logs/${tl.id}`);
                                    onShowToast && onShowToast('Time log deleted.');
                                    await loadTimeTrackerData();
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Delete blocked', 'error');
                                  }
                                }}
                                className="text-rose-600 hover:underline text-[11px] font-medium"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Bottom 5-Metric Summary Footer */}
            <div className="h-[52px] bg-white border-t border-slate-200 px-8 flex items-center justify-between text-xs flex-shrink-0">
              <div>
                <p className="font-semibold text-slate-800">{formatHoursHhMm(totalHoursLogged)}</p>
                <p className="text-[11px] text-slate-400">Logged</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">{formatHoursHhMm(billableHoursLogged)}</p>
                <p className="text-[11px] text-slate-400">Billable</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">{formatHoursHhMm(nonBillableHoursLogged)}</p>
                <p className="text-[11px] text-slate-400">Non-billable</p>
              </div>
              <div>
                <p className="font-semibold text-emerald-600">{formatHoursHhMm(approvedHoursLogged)}</p>
                <p className="text-[11px] text-slate-400">Approved / Locked</p>
              </div>
              <div>
                <p className="font-semibold text-slate-800">{formatHoursHhMm(pendingHoursLogged)}</p>
                <p className="text-[11px] text-slate-400">Pending Approval</p>
              </div>
            </div>

            {/* Right-Side Time Tracker Filter Panel */}
            {timeFilterOpen && (
              <div className="absolute right-4 top-12 bottom-14 w-72 bg-white border border-slate-200 rounded-md shadow-2xl flex flex-col z-30 animate-fadeIn">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800">Filter</span>
                  <button type="button" onClick={() => setTimeFilterOpen(false)} className="text-slate-400 hover:text-slate-700">
                    <X size={15} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-500 mb-1">Period</label>
                    <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded bg-white">
                      <option value="This Week">This Week</option>
                      <option value="This Month">This Month</option>
                      <option value="All Dates">All Dates</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Clients</label>
                    <select value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded bg-white">
                      <option value="">All Clients</option>
                      {ttClients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Projects</label>
                    <select value={filterProjectId} onChange={(e) => setFilterProjectId(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded bg-white">
                      <option value="">All Projects</option>
                      {ttProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Billable Status</label>
                    <select value={filterBillable} onChange={(e) => setFilterBillable(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded bg-white">
                      <option value="All">All</option>
                      <option value="Billable">Billable</option>
                      <option value="Non-billable">Non-billable</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">Approval Status</label>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded bg-white">
                      <option value="All">All</option>
                      <option value="PENDING">PENDING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="LOCKED">LOCKED</option>
                    </select>
                  </div>
                </div>
                <div className="p-3 border-t border-slate-200 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await loadTimeTrackerData();
                      setTimeFilterOpen(false);
                    }}
                    className="px-3.5 py-1.5 bg-[#0088ff] text-white text-xs font-medium rounded"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setFilterClientId('');
                      setFilterProjectId('');
                      setFilterBillable('All');
                      setFilterStatus('All');
                      setTimeFilterOpen(false);
                      await loadTimeTrackerData();
                    }}
                    className="px-3.5 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}

            {/* Quick Add Project Modal */}
            {quickProjectModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
                <form onSubmit={handleQuickAddProject} className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-semibold text-slate-800">Add Project</h4>
                    <button type="button" onClick={() => setQuickProjectModal(false)}><X size={15} /></button>
                  </div>
                  <input required placeholder="Project Code (e.g. PRJ-2026-09)" value={quickProjectForm.code} onChange={(e) => setQuickProjectForm({ ...quickProjectForm, code: e.target.value })} className="w-full px-3 py-2 border rounded" />
                  <input required placeholder="Project Name" value={quickProjectForm.name} onChange={(e) => setQuickProjectForm({ ...quickProjectForm, name: e.target.value })} className="w-full px-3 py-2 border rounded" />
                  <select required value={quickProjectForm.clientId} onChange={(e) => setQuickProjectForm({ ...quickProjectForm, clientId: e.target.value })} className="w-full px-3 py-2 border rounded bg-white">
                    <option value="">Select Client</option>
                    {ttClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" required value={quickProjectForm.budgetAmountKes} onChange={(e) => setQuickProjectForm({ ...quickProjectForm, budgetAmountKes: e.target.value })} placeholder="Budget KES" className="px-3 py-2 border rounded" />
                    <input type="number" required value={quickProjectForm.budgetHours} onChange={(e) => setQuickProjectForm({ ...quickProjectForm, budgetHours: e.target.value })} placeholder="Budget Hours" className="px-3 py-2 border rounded" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setQuickProjectModal(false)} className="px-3 py-1.5 border rounded">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">Create Project</button>
                  </div>
                </form>
              </div>
            )}

            {/* Quick Add Phase Modal */}
            {quickPhaseModal && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
                <form onSubmit={handleQuickAddPhase} className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-sm p-5 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="font-semibold text-slate-800">Add Job / Phase</h4>
                    <button type="button" onClick={() => setQuickPhaseModal(false)}><X size={15} /></button>
                  </div>
                  <input required placeholder="Phase / Deliverable Name" value={quickPhaseForm.name} onChange={(e) => setQuickPhaseForm({ ...quickPhaseForm, name: e.target.value })} className="w-full px-3 py-2 border rounded" />
                  <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={() => setQuickPhaseModal(false)} className="px-3 py-1.5 border rounded">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">Add Phase</button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ==================== RENDER 2: HR LETTERS / ADDRESS PROOF VIEW ====================
  if (activeTab === 'hrletters') {
    const handleSaveAddressProof = async (keepOpen = false, saveAsDraft = false) => {
      const errs = {};
      if (addressForm.reason === 'Select') {
        errs.reason = 'Select a value for Reason for request';
      }
      if (addressForm.reason === 'Others' && !addressForm.otherReason.trim()) {
        errs.otherReason = 'Enter the Reason for request (If others is chosen) is required.';
      }
      if (addressForm.changeInAddress === 'Select') {
        errs.changeInAddress = 'Select a value for Is there any change in Present address';
      }
      if (Object.keys(errs).length > 0) {
        setAddressErrors(errs);
        return;
      }
      setAddressErrors({});
      const addressDetails =
        addressForm.changeInAddress === 'Yes'
          ? [addressForm.newAddressLine1, addressForm.newAddressLine2, addressForm.newCity, addressForm.newPostalCode]
              .filter(Boolean)
              .join(', ')
          : undefined;
      try {
        await apiPost('/api/v1/hr-letters/address-proof', {
          employeeId: addressForm.employeeId || undefined,
          reason: addressForm.reason,
          otherReason: addressForm.otherReason || undefined,
          changeInAddress: addressForm.changeInAddress === 'Yes',
          addressDetails,
          status: saveAsDraft ? 'DRAFT' : 'SUBMITTED',
        });
        onShowToast && onShowToast(saveAsDraft ? 'Address Proof draft saved.' : 'Address Proof submitted.');
        await loadHrLetters();
        if (!keepOpen) {
          setAddAddressProofOpen(false);
        } else {
          setAddressForm({
            ...addressForm,
            reason: 'Select',
            otherReason: '',
            changeInAddress: 'Select',
          });
        }
      } catch (err) {
        onShowToast && onShowToast(err?.message || 'Failed to save HR letter request', 'error');
      }
    };

    const filteredReasons = [
      'Select',
      'Gas Connection',
      'Broadband Connection',
      'Opening a Bank Account',
      'Others',
    ].filter((r) => r.toLowerCase().includes(reasonSearch.toLowerCase()));

    return (
      <div className="flex flex-col h-full bg-[#edf1f7]">
        {/* Top Sub-Header Bar */}
        <div className="h-[48px] bg-white border-b border-slate-200 px-4 flex items-center justify-between flex-shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLetterViewOpen(!letterViewOpen)}
                className="w-52 px-3 py-1.5 border border-slate-200 rounded bg-white text-xs font-medium text-slate-700 flex items-center justify-between"
              >
                <span>Address Proof View</span>
                <ChevronDown size={13} className="text-slate-400" />
              </button>
              {letterViewOpen && (
                <div className="absolute left-0 mt-1 w-56 bg-white rounded shadow-xl border border-slate-200 py-2 z-30 text-xs">
                  <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                    Public & Saved Views
                  </p>
                  <button
                    type="button"
                    onClick={() => setLetterViewOpen(false)}
                    className="w-full px-3 py-2 text-left bg-blue-50/70 text-[#0088ff] font-medium"
                  >
                    Address Proof View
                  </button>
                  {customViews.map((cv) => (
                    <button
                      key={cv.id}
                      type="button"
                      onClick={() => setLetterViewOpen(false)}
                      className="w-full px-3 py-1.5 text-left hover:bg-slate-50 text-slate-700"
                    >
                      {cv.name}
                    </button>
                  ))}
                  <div className="px-3 pt-2 mt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setLetterViewOpen(false);
                        setCreateLetterViewOpen(true);
                      }}
                      className="w-full py-1.5 border border-[#0088ff] text-[#0088ff] rounded font-medium"
                    >
                      Create View
                    </button>
                  </div>
                </div>
              )}
            </div>
            <input
              type="text"
              value={letterSearch}
              onChange={(e) => setLetterSearch(e.target.value)}
              placeholder="Search letters..."
              className="px-2.5 py-1 border border-slate-200 rounded text-xs w-44"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setLetterStatusFilter('ALL');
                setLetterSearch('');
              }}
              className="text-xs text-[#0088ff] hover:underline font-medium"
            >
              View All Data
            </button>
            <select
              value={letterStatusFilter}
              onChange={(e) => setLetterStatusFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Drafts</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <button
              type="button"
              onClick={() => setAddAddressProofOpen(true)}
              className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
            >
              Add Record
            </button>
          </div>
        </div>

        {/* Main Table & Empty State */}
        <div className="flex-1 p-3.5 overflow-hidden flex flex-col">
          <div className="flex-1 bg-white rounded-md border border-slate-200 overflow-auto flex flex-col">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Employee</th>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Date of request</th>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Address Changed?</th>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Reason for request</th>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Details / Other Reason</th>
                  <th className="py-3 px-4 font-medium border-r border-slate-100">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              {addressProofRecords.length > 0 && (
                <tbody className="divide-y divide-slate-100">
                  {addressProofRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-medium text-slate-800">{rec.employeeName || rec.employeeId}</td>
                      <td className="py-3 px-4 text-slate-600">{rec.createdAt?.slice(0, 10)}</td>
                      <td className="py-3 px-4 text-slate-600">{rec.changeInAddress ? 'Yes' : 'No'}</td>
                      <td className="py-3 px-4 text-slate-600">{rec.reason}</td>
                      <td className="py-3 px-4 text-slate-600">{rec.otherReason || rec.addressDetails || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : rec.status === 'REJECTED'
                            ? 'bg-rose-50 text-rose-700'
                            : rec.status === 'DRAFT'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-blue-50 text-[#0088ff]'
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {rec.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiPatch(`/api/v1/hr-letters/address-proof/${rec.id}`, { status: 'SUBMITTED' });
                              onShowToast && onShowToast('Draft submitted.');
                              await loadHrLetters();
                            }}
                            className="text-[#0088ff] font-medium hover:underline"
                          >
                            Submit
                          </button>
                        )}
                        {isHrOrAdmin && rec.status === 'SUBMITTED' && (
                          <>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/hr-letters/address-proof/${rec.id}`, { status: 'APPROVED' });
                                  onShowToast && onShowToast('Address proof approved.');
                                  await loadHrLetters();
                                } catch (err) {
                                  onShowToast && onShowToast(err?.message || 'Approval forbidden', 'error');
                                }
                              }}
                              className="text-emerald-600 font-medium hover:underline"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/hr-letters/address-proof/${rec.id}`, { status: 'REJECTED' });
                                  onShowToast && onShowToast('Address proof rejected.');
                                  await loadHrLetters();
                                } catch (err) {
                                  onShowToast && onShowToast(err?.message || 'Action forbidden', 'error');
                                }
                              }}
                              className="text-rose-600 font-medium hover:underline"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>

            {addressProofRecords.length === 0 && (
              <div className="my-auto py-16">
                <NdakalaEmptyState title="No records found" />
              </div>
            )}
          </div>
        </div>

        {/* Create Custom View Modal */}
        {createLetterViewOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-sm p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-semibold text-slate-800">Create Custom Address Proof View</h4>
                <button type="button" onClick={() => setCreateLetterViewOpen(false)}><X size={15} /></button>
              </div>
              <input
                value={newLetterViewName}
                onChange={(e) => setNewLetterViewName(e.target.value)}
                placeholder="View Name"
                className="w-full px-3 py-2 border rounded"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreateLetterViewOpen(false)} className="px-3 py-1.5 border rounded">Cancel</button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newLetterViewName.trim()) return;
                    await apiPost('/api/v1/workspace/custom-views', {
                      module: 'ADDRESS_PROOF',
                      name: newLetterViewName.trim(),
                      columns: ['employeeName', 'reason', 'changeInAddress', 'status'],
                      viewPermission: 'ONLY_ME',
                    });
                    setNewLetterViewName('');
                    setCreateLetterViewOpen(false);
                    onShowToast && onShowToast('Custom view created.');
                    await loadHrLetters();
                  }}
                  className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                >
                  Save View
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full-Screen "Address Proof" Add Record Modal */}
        {addAddressProofOpen && (
          <div className="fixed inset-0 z-50 bg-[#edf1f7] flex flex-col animate-fadeIn">
            <div className="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Address Proof</h2>
              <button type="button" onClick={() => setAddAddressProofOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 text-xs">
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 pb-3 mb-6 border-b border-slate-100">
                  Address Proof Details
                </h3>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-5 max-w-5xl">
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      EmployeeID <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={addressForm.employeeId}
                      onChange={(e) => setAddressForm({ ...addressForm, employeeId: e.target.value })}
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded bg-white text-slate-800"
                    >
                      <option value="">My Profile ({currentUser?.name || currentUser?.email})</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.employeeNumber || ''} {e.firstName} {e.lastName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      Date of request <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={addressForm.dateOfRequest}
                      onChange={(e) => setAddressForm({ ...addressForm, dateOfRequest: e.target.value })}
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-500">Date of Joining</label>
                    <span className="col-span-8 text-slate-700 font-medium">{addressForm.dateOfJoining}</span>
                  </div>

                  <div className="grid grid-cols-12 items-start gap-3">
                    <label className="col-span-4 text-slate-600 font-medium pt-2">
                      Reason for request <span className="text-rose-500">*</span>
                    </label>
                    <div className="col-span-8 relative">
                      <button
                        type="button"
                        onClick={() => setReasonDropdownOpen(!reasonDropdownOpen)}
                        className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-left text-slate-800 flex items-center justify-between"
                      >
                        <span>{addressForm.reason}</span>
                        <ChevronDown size={13} className="text-slate-400" />
                      </button>
                      {reasonDropdownOpen && (
                        <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-xl z-30 p-2">
                          <div className="relative mb-2">
                            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                            <input
                              type="text"
                              value={reasonSearch}
                              onChange={(e) => setReasonSearch(e.target.value)}
                              className="w-full pl-8 pr-2 py-1 border border-slate-200 rounded text-xs"
                              autoFocus
                            />
                          </div>
                          {filteredReasons.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => {
                                setAddressForm({ ...addressForm, reason: r });
                                setReasonDropdownOpen(false);
                                setAddressErrors({});
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700 rounded"
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                      {addressErrors.reason && <p className="text-rose-500 text-[11px] mt-1">{addressErrors.reason}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-500">Designation</label>
                    <span className="col-span-8 text-slate-700 font-medium">{addressForm.designation}</span>
                  </div>

                  {addressForm.reason === 'Others' ? (
                    <div className="grid grid-cols-12 items-start gap-3">
                      <label className="col-span-4 text-slate-600 font-medium pt-2">
                        Enter the Reason for request (If others is chosen) <span className="text-rose-500">*</span>
                      </label>
                      <div className="col-span-8">
                        <textarea
                          rows={3}
                          value={addressForm.otherReason}
                          onChange={(e) => setAddressForm({ ...addressForm, otherReason: e.target.value })}
                          className={`w-full px-3 py-2 border rounded ${addressErrors.otherReason ? 'border-rose-400' : 'border-slate-300'}`}
                        />
                        {addressErrors.otherReason && <p className="text-rose-500 text-[11px] mt-1">{addressErrors.otherReason}</p>}
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}

                  <div className="grid grid-cols-12 items-start gap-3">
                    <label className="col-span-4 text-slate-600 font-medium pt-2">
                      Is there any change in Present address <span className="text-rose-500">*</span>
                    </label>
                    <div className="col-span-8">
                      <select
                        value={addressForm.changeInAddress}
                        onChange={(e) => {
                          setAddressForm({ ...addressForm, changeInAddress: e.target.value });
                          setAddressErrors({});
                        }}
                        className={`w-full px-3 py-2 border rounded bg-white ${addressErrors.changeInAddress ? 'border-rose-400' : 'border-slate-300'}`}
                      >
                        <option value="Select">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                      {addressErrors.changeInAddress && <p className="text-rose-500 text-[11px] mt-1">{addressErrors.changeInAddress}</p>}
                    </div>
                  </div>

                  {addressForm.changeInAddress === 'Yes' && (
                    <div className="grid grid-cols-12 items-start gap-3 lg:col-span-1">
                      <label className="col-span-4 text-slate-600 font-medium pt-2">New Present Address</label>
                      <div className="col-span-8 space-y-2">
                        <input type="text" placeholder="Address line 1" value={addressForm.newAddressLine1} onChange={(e) => setAddressForm({ ...addressForm, newAddressLine1: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
                        <input type="text" placeholder="Address line 2" value={addressForm.newAddressLine2} onChange={(e) => setAddressForm({ ...addressForm, newAddressLine2: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
                        <input type="text" placeholder="City" value={addressForm.newCity} onChange={(e) => setAddressForm({ ...addressForm, newCity: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
                        <input type="text" placeholder="Postal Code" value={addressForm.newPostalCode} onChange={(e) => setAddressForm({ ...addressForm, newPostalCode: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white px-6 py-3 border-t border-slate-200 flex items-center gap-2.5">
              <button type="button" onClick={() => handleSaveAddressProof(false, false)} className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded">
                Submit
              </button>
              <button type="button" onClick={() => handleSaveAddressProof(true, false)} className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded">
                Submit and New
              </button>
              <button type="button" onClick={() => handleSaveAddressProof(false, true)} className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50">
                Save Draft
              </button>
              <button type="button" onClick={() => setAddAddressProofOpen(false)} className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== RENDER 2B: BUSINESS TRAVEL & PER DIEM ====================
  if (activeTab === 'travel' || subViewHint === 'travel') {
    return (
      <div className="flex flex-col h-full bg-[#edf1f7] p-5 overflow-y-auto space-y-4 text-xs">
        <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Business Travel & Per Diem Requests ({travelList.length})</h3>
              <p className="text-slate-500 mt-0.5">Submit domestic or regional advisory travel plans, transport mode, and estimated KES allowance</p>
            </div>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiPost('/api/v1/workspace/travel-requests', {
                  ...travelForm,
                  perDiemDays: Number(travelForm.perDiemDays) || 1,
                  estimatedBudgetKes: Number(travelForm.estimatedBudgetKes) || 0,
                });
                setTravelForm({ ...travelForm, destination: '', purpose: '', notes: '' });
                onShowToast && onShowToast('Travel request submitted for approval.');
                await loadWorkspaceModules('travel');
              } catch (err) {
                onShowToast && onShowToast(err?.message || 'Unable to submit travel request', 'error');
              }
            }}
            className="grid grid-cols-1 md:grid-cols-7 gap-2.5 pt-3 border-t border-slate-100"
          >
            <input
              required
              placeholder="Destination (e.g. Mombasa / Kigali)"
              value={travelForm.destination}
              onChange={(e) => setTravelForm({ ...travelForm, destination: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded"
            />
            <input
              required
              minLength={5}
              placeholder="Business Purpose"
              value={travelForm.purpose}
              onChange={(e) => setTravelForm({ ...travelForm, purpose: e.target.value })}
              className="md:col-span-2 px-3 py-1.5 border border-slate-300 rounded"
            />
            <input
              type="date"
              required
              value={travelForm.departureDate}
              onChange={(e) => setTravelForm({ ...travelForm, departureDate: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <select
              value={travelForm.transportMode}
              onChange={(e) => setTravelForm({ ...travelForm, transportMode: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="FLIGHT">Flight</option>
              <option value="RAIL_SGR">SGR Rail</option>
              <option value="ROAD">Road / Fleet</option>
              <option value="LOCAL_TAXI">Local Taxi</option>
            </select>
            <input
              type="number"
              min="1"
              max="90"
              title="Per Diem Days"
              placeholder="Days"
              value={travelForm.perDiemDays}
              onChange={(e) => setTravelForm({ ...travelForm, perDiemDays: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="KES Budget"
                value={travelForm.estimatedBudgetKes}
                onChange={(e) => setTravelForm({ ...travelForm, estimatedBudgetKes: e.target.value })}
                className="w-24 px-2.5 py-1.5 border border-slate-300 rounded"
              />
              <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium flex-1">
                Submit
              </button>
            </div>
          </form>

          {travelList.length === 0 ? (
            <NdakalaEmptyState title="No travel requests logged yet" subtitle="Use the form above to submit a new domestic or international travel authorization request." />
          ) : (
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Destination & Purpose</th>
                  <th className="py-2.5 px-3">Dates, Days & Mode</th>
                  <th className="py-2.5 px-3">Budget / Reimbursed</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {travelList.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-800">{t.employeeName}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-800">{t.destination}</p>
                      <p className="text-[11px] text-slate-500">{t.purpose}</p>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{t.departureDate} → {t.returnDate} ({t.perDiemDays || 1}d • {t.transportMode})</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                      KES {Number(t.estimatedBudgetKes || 0).toLocaleString()}
                      {t.status === 'REIMBURSED' && (
                        <div className="text-[10px] text-emerald-700 font-normal">
                          Paid: KES {Number(t.reimbursementAmountKes || t.estimatedBudgetKes || 0).toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.status === 'REIMBURSED' ? 'bg-teal-50 text-teal-700' :
                        t.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                        t.status === 'REJECTED' ? 'bg-rose-50 text-rose-700' :
                        t.status === 'CANCELLED' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-[#0088ff]'
                      }`}>{t.status}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right space-x-2">
                      {isHrOrAdmin && t.status === 'APPROVED' && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiPatch(`/api/v1/workspace/travel-requests/${t.id}`, {
                                status: 'REIMBURSED',
                                reimbursementAmountKes: Number(t.estimatedBudgetKes) || 0,
                              });
                              onShowToast && onShowToast('Travel allowance marked REIMBURSED.');
                              await loadWorkspaceModules('travel');
                            } catch (err) {
                              onShowToast && onShowToast(err?.message || 'Reimbursement requires HR/Admin role', 'error');
                            }
                          }}
                          className="text-teal-700 font-semibold hover:underline"
                        >
                          Mark Reimbursed
                        </button>
                      )}
                      {t.status === 'SUBMITTED' && (
                        <>
                          {isHrOrAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPatch(`/api/v1/workspace/travel-requests/${t.id}`, { status: 'APPROVED' });
                                    onShowToast && onShowToast('Travel request approved.');
                                    await loadWorkspaceModules('travel');
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Approval requires HR/Admin role', 'error');
                                  }
                                }}
                                className="text-emerald-600 font-medium hover:underline"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPatch(`/api/v1/workspace/travel-requests/${t.id}`, { status: 'REJECTED' });
                                    onShowToast && onShowToast('Travel request rejected.');
                                    await loadWorkspaceModules('travel');
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Action restricted', 'error');
                                  }
                                }}
                                className="text-rose-600 font-medium hover:underline"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPatch(`/api/v1/workspace/travel-requests/${t.id}`, { status: 'CANCELLED' });
                                onShowToast && onShowToast('Travel request cancelled.');
                                await loadWorkspaceModules('travel');
                              } catch (err) {
                                onShowToast && onShowToast(err?.message || 'Cancel failed', 'error');
                              }
                            }}
                            className="text-slate-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ==================== RENDER 2C: EMPLOYEE ENGAGEMENT PULSE SURVEYS ====================
  if (activeTab === 'engagement' || subViewHint === 'engagement') {
    return (
      <div className="flex flex-col h-full bg-[#edf1f7] p-5 overflow-y-auto space-y-4 text-xs">
        <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Employee Engagement & Pulse Surveys ({surveysList.length})</h3>
              <p className="text-slate-500 mt-0.5">Measure team morale, anonymous feedback sentiment, and participation rates across Ndakala Advisory</p>
            </div>
          </div>

          {isHrOrAdmin && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiPost('/api/v1/workspace/surveys', surveyForm);
                setSurveyForm({ ...surveyForm, title: '', description: '' });
                onShowToast && onShowToast('Engagement survey published to workforce.');
                await loadWorkspaceModules('engagement');
              } catch (err) {
                onShowToast && onShowToast(err?.message || 'Unable to publish survey', 'error');
              }
            }}
            className="grid grid-cols-1 md:grid-cols-5 gap-2.5 pt-3 border-t border-slate-100"
          >
            <input
              required
              minLength={3}
              placeholder="Survey Title (e.g. Q4 Workplace Pulse)"
              value={surveyForm.title}
              onChange={(e) => setSurveyForm({ ...surveyForm, title: e.target.value })}
              className="md:col-span-2 px-3 py-1.5 border border-slate-300 rounded"
            />
            <input
              required
              minLength={5}
              placeholder="Description / Prompt"
              value={surveyForm.description}
              onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })}
              className="md:col-span-2 px-3 py-1.5 border border-slate-300 rounded"
            />
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={surveyForm.closingDate}
                onChange={(e) => setSurveyForm({ ...surveyForm, closingDate: e.target.value })}
                className="px-2 py-1.5 border border-slate-300 rounded w-32"
              />
              <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium flex-1">
                Publish
              </button>
            </div>
          </form>
          )}

          {surveysList.length === 0 ? (
            <NdakalaEmptyState title="No active pulse surveys" subtitle="HR administrators can publish an anonymous engagement survey above to gather staff feedback." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {surveysList.map((s) => (
                <div key={s.id} className="p-4 border border-slate-200 rounded-md bg-slate-50/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">{s.title}</h4>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                      Avg: {s.avgRating || 0} / 5 ({s.responseCount || 0} replies)
                    </span>
                  </div>
                  <p className="text-slate-600">{s.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>{s.anonymous ? 'Anonymous responses' : 'Named responses'} • Closes {s.closingDate}</span>
                    {s.hasResponded ? (
                      <span className="text-emerald-600 font-semibold">✓ Submitted</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveSurveyRespond(s);
                          setSurveyResponseForm({ overallRating: 5, comment: '' });
                        }}
                        className="px-3 py-1 bg-[#0088ff] text-white rounded font-medium"
                      >
                        Respond Now
                      </button>
                    )}
                  </div>
                  {(s.recentComments || []).length > 0 && (
                    <div className="pt-2 border-t border-slate-200 space-y-1">
                      {s.recentComments.slice(0, 2).map((rc, idx) => (
                        <div key={idx} className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded border border-slate-100">
                          <span className="font-semibold">★ {rc.rating}/5</span> — {rc.comment || 'Rated without comment'} ({rc.author})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {activeSurveyRespond && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
            <div className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <h4 className="font-semibold text-slate-800">{activeSurveyRespond.title}</h4>
                <button type="button" onClick={() => setActiveSurveyRespond(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiPost(`/api/v1/workspace/surveys/${activeSurveyRespond.id}/respond`, {
                      overallRating: Number(surveyResponseForm.overallRating),
                      comment: surveyResponseForm.comment,
                    });
                    setActiveSurveyRespond(null);
                    onShowToast && onShowToast('Thank you! Your survey response was recorded.');
                    await loadWorkspaceModules('engagement');
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Response failed', 'error');
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Satisfaction Score (1 to 5)</label>
                  <select
                    value={surveyResponseForm.overallRating}
                    onChange={(e) => setSurveyResponseForm({ ...surveyResponseForm, overallRating: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value={5}>5 — Strongly Engaged</option>
                    <option value={4}>4 — Satisfied</option>
                    <option value={3}>3 — Neutral</option>
                    <option value={2}>2 — Needs Improvement</option>
                    <option value={1}>1 — Dissatisfied</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Comments / Suggestions</label>
                  <textarea
                    rows={3}
                    value={surveyResponseForm.comment}
                    onChange={(e) => setSurveyResponseForm({ ...surveyResponseForm, comment: e.target.value })}
                    placeholder="Share constructive feedback..."
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button type="button" onClick={() => setActiveSurveyRespond(null)} className="px-3.5 py-1.5 border border-slate-300 rounded">Cancel</button>
                  <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">Submit Feedback</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== RENDER 2D: ACTION & WORKFLOW TASKS ====================
  if (activeTab === 'tasks' || subViewHint === 'tasks') {
    return (
      <div className="flex flex-col h-full bg-[#edf1f7] p-5 overflow-y-auto space-y-4 text-xs">
        <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Action Tasks & Workflow Inbox ({personalTasks.length + tasks.length})</h3>
              <p className="text-slate-500 mt-0.5">Track operational assignments, checklists, and pending HR workflow approvals</p>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiPost('/api/v1/workspace/personal-tasks', {
                  ...personalTaskForm,
                  assigneeEmployeeId: personalTaskForm.assigneeEmployeeId || undefined,
                });
                setPersonalTaskForm({ ...personalTaskForm, title: '', notes: '' });
                onShowToast && onShowToast('Action task added.');
                await loadWorkspaceModules('tasks');
              } catch (err) {
                onShowToast && onShowToast(err?.message || 'Unable to create task', 'error');
              }
            }}
            className="grid grid-cols-1 md:grid-cols-6 gap-2.5 pt-3 border-t border-slate-100"
          >
            <input
              required
              minLength={2}
              placeholder="Task Title (e.g. Verify NSSF Return Schedule)"
              value={personalTaskForm.title}
              onChange={(e) => setPersonalTaskForm({ ...personalTaskForm, title: e.target.value })}
              className="md:col-span-2 px-3 py-1.5 border border-slate-300 rounded"
            />
            <select
              value={personalTaskForm.assigneeEmployeeId}
              onChange={(e) => setPersonalTaskForm({ ...personalTaskForm, assigneeEmployeeId: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="">Assign to Me</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.fullName || `${e.firstName} ${e.lastName}`}</option>
              ))}
            </select>
            <input
              type="date"
              value={personalTaskForm.dueDate}
              onChange={(e) => setPersonalTaskForm({ ...personalTaskForm, dueDate: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded"
            />
            <select
              value={personalTaskForm.priority}
              onChange={(e) => setPersonalTaskForm({ ...personalTaskForm, priority: e.target.value })}
              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option value="LOW">Low Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="HIGH">High Priority</option>
            </select>
            <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium">
              + Add Task
            </button>
          </form>

          {personalTasks.length === 0 ? (
            <NdakalaEmptyState title="No operational tasks created yet" />
          ) : (
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Task</th>
                  <th className="py-2.5 px-3">Assignee</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personalTasks.map((tk) => (
                  <tr key={tk.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-800">{tk.title}</td>
                    <td className="py-2.5 px-3 text-slate-600">{tk.assigneeName}</td>
                    <td className="py-2.5 px-3">
                      <input
                        key={`${tk.id}-${tk.dueDate || ''}`}
                        type="date"
                        defaultValue={tk.dueDate || ''}
                        onChange={async (e) => {
                          const nextDate = e.target.value;
                          if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
                          try {
                            await apiPatch(`/api/v1/workspace/personal-tasks/${tk.id}`, { dueDate: nextDate });
                            onShowToast && onShowToast('Task due date updated.');
                            await loadWorkspaceModules('tasks');
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Due date update failed', 'error');
                          }
                        }}
                        className="px-2 py-1 border border-slate-200 rounded bg-white text-[11px]"
                      />
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={tk.priority || 'MEDIUM'}
                        onChange={async (e) => {
                          try {
                            await apiPatch(`/api/v1/workspace/personal-tasks/${tk.id}`, { priority: e.target.value });
                            onShowToast && onShowToast(`Priority updated to ${e.target.value}.`);
                            await loadWorkspaceModules('tasks');
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Priority update failed', 'error');
                          }
                        }}
                        className="px-2 py-1 border border-slate-200 rounded bg-white text-[11px] font-semibold"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={tk.status}
                        onChange={async (e) => {
                          try {
                            await apiPatch(`/api/v1/workspace/personal-tasks/${tk.id}`, { status: e.target.value });
                            onShowToast && onShowToast(`Task marked ${e.target.value}.`);
                            await loadWorkspaceModules('tasks');
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Update failed', 'error');
                          }
                        }}
                        className="px-2 py-1 border border-slate-200 rounded bg-white text-[11px]"
                      >
                        <option value="TODO">To Do</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="DONE">Done</option>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiDelete(`/api/v1/workspace/personal-tasks/${tk.id}`);
                            onShowToast && onShowToast('Task removed.');
                            await loadWorkspaceModules('tasks');
                          } catch (err) {
                            onShowToast && onShowToast(err?.message || 'Delete failed', 'error');
                          }
                        }}
                        className="text-rose-600 hover:underline text-[11px]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {tasks.length > 0 && (
          <div className="bg-white rounded-md border border-slate-200 p-5">
            <h4 className="text-sm font-semibold text-slate-800 mb-3">Pending HR Workflow Approvals ({tasks.length})</h4>
            <div className="divide-y divide-slate-100">
              {tasks.map((wf) => (
                <div key={wf.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{wf.stepName || wf.workflowInstance?.definition?.name || 'Approval Step'}</p>
                    <p className="text-[11px] text-slate-500">Status: {wf.status} • {wf.workflowInstance?.targetEntityType || 'HR Request'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab && setActiveTab('inbox', 'team')}
                    className="text-[#0088ff] font-medium hover:underline"
                  >
                    Open Approvals →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== RENDER 3: FILES, POLICIES, TRAINING, DOCUMENTS & ER VAULT ====================
  return (
    <div className="flex flex-col h-full bg-[#edf1f7] p-5 overflow-y-auto space-y-4 text-xs">
      <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Organization Files, Policies, Training & Employee Relations
          </h3>
          <p className="text-slate-500 mt-0.5">
            Manage Ndakala Advisory company policies, training compliance, document vault, and confidential ER cases
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'policies', label: `Policies (${policies.length})` },
            { id: 'training', label: `Training & Security (${programmes.length})` },
            { id: 'documents', label: `Files Hub (${vaultDocs.length})` },
            { id: 'er', label: `ER Cases (${erCases.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setGovSubTab(t.id)}
              className={`px-3 py-1.5 rounded border font-medium ${
                govSubTab === t.id ? 'bg-blue-50 border-[#0088ff] text-[#0088ff]' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenWhistleblowerModal}
            className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded font-medium hover:bg-slate-50"
          >
            Anonymous Whistleblower Portal
          </button>
        </div>
      </div>

      {/* Policies Tab */}
      {govSubTab === 'policies' && (
        <div className="space-y-4">
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            {policies.length === 0 ? (
              <NdakalaEmptyState title="No Files Found" />
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Code & Policy Title</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Latest Version</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {policies.map((pol) => {
                    const latestVer = pol.versions?.[0];
                    const isSelfAuthor = Boolean(latestVer?.createdById && currentUser?.id && latestVer.createdById === currentUser.id);
                    return (
                      <tr key={pol.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-800">{pol.code} — {pol.title}</td>
                        <td className="py-3 px-4 text-slate-600">{pol.category}</td>
                        <td className="py-3 px-4 text-slate-600">{latestVer ? `v${latestVer.versionNumber} (${latestVer.status})` : 'v1.0'}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          {latestVer?.documentId && (
                            <button
                              type="button"
                              onClick={() =>
                                setPolicyPreviewDoc({
                                  id: latestVer.documentId,
                                  fileName: `${pol.code} - ${pol.title}.pdf`,
                                  mimeType: 'application/pdf',
                                  securityClassification: latestVer.status === 'DRAFT' ? 'CONFIDENTIAL' : 'INTERNAL',
                                })
                              }
                              className="px-2.5 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium"
                            >
                              Preview PDF
                            </button>
                          )}
                          {canManagePolicy && latestVer && latestVer.status !== 'PUBLISHED' && (
                            isSelfAuthor ? (
                              <span
                                title="Maker-Checker enforced: Policy author cannot publish their own version"
                                className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-medium cursor-not-allowed"
                              >
                                Maker-Checker: Author Cannot Self-Publish
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await apiPost(`/api/v1/governance/policies/versions/${latestVer.id}/publish`, {});
                                    onShowToast && onShowToast('Policy version published.');
                                    onRefreshAll && (await onRefreshAll());
                                    await loadGovernanceExtras();
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Publish failed', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium"
                              >
                                Publish
                              </button>
                            )
                          )}
                          {canManagePolicy && latestVer && latestVer.status === 'PUBLISHED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVerNum = `${(Number(latestVer.versionNumber) || 1) + 1}.0`;
                                  setNewVersionForm({
                                    versionNumber: nextVerNum,
                                    contentSummary: `Revision ${nextVerNum} for ${pol.title}`,
                                    effectiveDate: new Date().toISOString().slice(0, 10),
                                    sourceReference: pol.versions?.[0]?.sourceReference || 'Ndakala Policy Manual',
                                  });
                                  setNewVersionModal(pol);
                                }}
                                className="px-2.5 py-1 border border-blue-300 text-[#0088ff] rounded text-[11px]"
                              >
                                + New Version
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const rem = await apiPost(`/api/v1/governance/policies/versions/${latestVer.id}/remind`, {});
                                    onShowToast && onShowToast(`Reminders dispatched (${rem.pendingCount ?? 0} pending staff).`);
                                  } catch (err) {
                                    onShowToast && onShowToast(err?.message || 'Reminder failed', 'error');
                                  }
                                }}
                                className="px-2.5 py-1 border border-slate-300 rounded text-[11px]"
                              >
                                Remind Pending
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending My Policy Acknowledgements */}
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-2">
            <h4 className="font-semibold text-slate-800">My Policy Acknowledgements ({acknowledgements.length})</h4>
            {acknowledgements.map((ack) => (
              <div key={ack.id} className="p-3 border border-slate-100 rounded flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-slate-800">{ack.policyVersion?.policy?.title || 'Company Policy'}</span>
                  <span className="ml-2 text-slate-500">v{ack.policyVersion?.versionNumber || '1.0'} • {ack.status}</span>
                </div>
                {ack.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        onAcknowledgePolicy && (await onAcknowledgePolicy(ack.id));
                        await loadGovernanceExtras();
                      }}
                      className="px-3 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRefusalReasonText('Requires HR policy clause clarification before acknowledgement.');
                        setRefusalPromptAck(ack);
                      }}
                      className="px-3 py-1 border border-rose-300 text-rose-700 rounded text-[11px]"
                    >
                      Refuse / Query
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {refusalPromptAck && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-semibold text-slate-800">Record Policy Query / Refusal Reason</h4>
                  <button type="button" onClick={() => setRefusalPromptAck(null)}><X size={15} /></button>
                </div>
                <textarea
                  rows={3}
                  minLength={5}
                  value={refusalReasonText}
                  onChange={(e) => setRefusalReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRefusalPromptAck(null)} className="px-3 py-1.5 border rounded">Cancel</button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost(`/api/v1/governance/policies/acknowledgements/${refusalPromptAck.id}/refuse`, {
                          refusalReason: refusalReasonText.trim(),
                        });
                        setRefusalPromptAck(null);
                        onShowToast && onShowToast('Refusal recorded for HR follow-up.');
                        await loadGovernanceExtras();
                      } catch (err) {
                        onShowToast && onShowToast(err?.message || 'Failed to record refusal', 'error');
                      }
                    }}
                    className="px-3.5 py-1.5 bg-rose-600 text-white rounded font-medium"
                  >
                    Submit Refusal
                  </button>
                </div>
              </div>
            </div>
          )}

          {newVersionModal && (
            <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-semibold text-slate-800">Draft New Version — {newVersionModal.code}</h4>
                  <button type="button" onClick={() => setNewVersionModal(null)}><X size={15} /></button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiPost(`/api/v1/governance/policies/${newVersionModal.id}/versions`, newVersionForm);
                      setNewVersionModal(null);
                      onShowToast && onShowToast(`Draft v${newVersionForm.versionNumber} created.`);
                      onRefreshAll && (await onRefreshAll());
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Failed to draft version', 'error');
                    }
                  }}
                  className="space-y-2.5"
                >
                  <input required placeholder="Version (e.g. 2.0)" value={newVersionForm.versionNumber} onChange={(e) => setNewVersionForm({ ...newVersionForm, versionNumber: e.target.value })} className="w-full px-3 py-1.5 border rounded" />
                  <textarea required minLength={5} rows={2} placeholder="Change summary" value={newVersionForm.contentSummary} onChange={(e) => setNewVersionForm({ ...newVersionForm, contentSummary: e.target.value })} className="w-full px-3 py-1.5 border rounded" />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setNewVersionModal(null)} className="px-3 py-1.5 border rounded">Cancel</button>
                    <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">Create Draft Version</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Draft New Policy Form */}
          {canManagePolicy && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiPost('/api/v1/governance/policies', newPolicyForm);
                setNewPolicyForm({ ...newPolicyForm, code: '', title: '', initialVersionSummary: '' });
                onShowToast && onShowToast('Policy drafted.');
                onRefreshAll && (await onRefreshAll());
              } catch (err) {
                onShowToast && onShowToast(err?.message || 'Failed to draft policy', 'error');
              }
            }}
            className="bg-white rounded-md border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <h4 className="md:col-span-3 font-semibold text-slate-800">Draft New Policy Document</h4>
            <input required placeholder="Policy Code (e.g. POL-SEC-09)" value={newPolicyForm.code} onChange={(e) => setNewPolicyForm({ ...newPolicyForm, code: e.target.value })} className="px-3 py-2 border rounded" />
            <input required placeholder="Policy Title" value={newPolicyForm.title} onChange={(e) => setNewPolicyForm({ ...newPolicyForm, title: e.target.value })} className="px-3 py-2 border rounded" />
            <select value={newPolicyForm.category} onChange={(e) => setNewPolicyForm({ ...newPolicyForm, category: e.target.value })} className="px-3 py-2 border rounded bg-white">
              <option value="CODE_OF_CONDUCT">Code of Conduct</option>
              <option value="INFORMATION_SECURITY">Information Security</option>
              <option value="OSH">Occupational Safety & Health</option>
              <option value="ANTI_HARASSMENT">Anti-Harassment</option>
              <option value="OPERATIONAL">Operational</option>
            </select>
            <input required placeholder="Initial Summary (>=5 chars)" value={newPolicyForm.initialVersionSummary} onChange={(e) => setNewPolicyForm({ ...newPolicyForm, initialVersionSummary: e.target.value })} className="md:col-span-2 px-3 py-2 border rounded" />
            <button type="submit" className="px-4 py-2 bg-[#0088ff] text-white rounded font-medium">Create Draft Policy</button>
          </form>
          )}
        </div>
      )}

      {/* Training & Security Comms Tab */}
      {govSubTab === 'training' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800">Training Programmes ({programmes.length})</h4>
            {canManageTraining && (
              <>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiPost('/api/v1/governance/training/programmes', newProgForm);
                      setNewProgForm({ ...newProgForm, code: '', name: '' });
                      onShowToast && onShowToast('Training programme added.');
                      await loadGovernanceExtras();
                    } catch (err) {
                      onShowToast && onShowToast(err?.message || 'Failed to add training programme', 'error');
                    }
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <input required placeholder="Code (TRN-01)" value={newProgForm.code} onChange={(e) => setNewProgForm({ ...newProgForm, code: e.target.value })} className="px-2.5 py-1.5 border rounded flex-1" />
                  <input required placeholder="Programme Name" value={newProgForm.name} onChange={(e) => setNewProgForm({ ...newProgForm, name: e.target.value })} className="px-2.5 py-1.5 border rounded flex-1" />
                  <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">Add</button>
                </form>
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <select value={assignProgId} onChange={(e) => setAssignProgId(e.target.value)} className="px-2.5 py-1.5 border rounded bg-white flex-1">
                    <option value="">Select Programme to Assign</option>
                    {programmes.map((pr) => <option key={pr.id} value={pr.id}>{pr.code} - {pr.name}</option>)}
                  </select>
                  <select value={assignEmpId} onChange={(e) => setAssignEmpId(e.target.value)} className="px-2.5 py-1.5 border rounded bg-white flex-1">
                    <option value="">Select Employee</option>
                    {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName} {em.lastName}</option>)}
                  </select>
                  <input type="date" value={assignDueDate} onChange={(e) => setAssignDueDate(e.target.value)} className="px-2 py-1.5 border rounded bg-white" />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!assignProgId || !assignEmpId) {
                        onShowToast && onShowToast('Select both a training programme and an employee.', 'error');
                        return;
                      }
                      try {
                        await apiPost('/api/v1/governance/training/assign', {
                          programmeId: assignProgId,
                          employeeId: assignEmpId,
                          dueDate: assignDueDate || '2026-12-15',
                        });
                        onShowToast && onShowToast('Training assigned.');
                        onRefreshAll && (await onRefreshAll());
                      } catch (err) {
                        onShowToast && onShowToast(err?.message || 'Failed to assign training', 'error');
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded font-medium"
                  >
                    Assign Staff
                  </button>
                </div>
              </>
            )}
            <div className="divide-y divide-slate-100">
              {trainings.length === 0 ? (
                <p className="text-slate-400 py-3">No training assignments assigned to your profile yet.</p>
              ) : trainings.map((tr) => (
                <div key={tr.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-800">{tr.programme?.name || 'Training'}</div>
                    <div className="text-[11px] text-slate-500">Status: {tr.status} • Due: {tr.dueDate?.slice(0, 10)}</div>
                  </div>
                  {tr.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/governance/training/assignments/${tr.id}/complete`, { scorePercent: 100, passed: true });
                          onShowToast && onShowToast('Training completed.');
                          onRefreshAll && (await onRefreshAll());
                        } catch (err) {
                          onShowToast && onShowToast(err?.message || 'Completion failed', 'error');
                        }
                      }}
                      className="px-2.5 py-1 bg-[#0088ff] text-white rounded text-[11px]"
                    >
                      Mark Complete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
            <h4 className="font-semibold text-slate-800">Security Comms ({securityComms.length}) & Phishing Records ({phishingRecords.length})</h4>
            {canManageTraining && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiPost('/api/v1/governance/training/security-comms', newCommForm);
                    setNewCommForm({ ...newCommForm, subject: '', reference: '' });
                    onShowToast && onShowToast('Security communication logged.');
                    await loadGovernanceExtras();
                  } catch (err) {
                    onShowToast && onShowToast(err?.message || 'Failed to log bulletin', 'error');
                  }
                }}
                className="flex gap-2"
              >
                <input required placeholder="Security bulletin subject..." value={newCommForm.subject} onChange={(e) => setNewCommForm({ ...newCommForm, subject: e.target.value })} className="px-2.5 py-1.5 border rounded flex-1" />
                <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">Log Bulletin</button>
              </form>
            )}
            <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
              {securityComms.map((sc) => (
                <div key={sc.id} className="py-2">
                  <div className="font-medium text-slate-800">{sc.subject}</div>
                  <div className="text-[11px] text-slate-500">{sc.channel} • {sc.audience} • {sc.sentAt?.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Document Vault Tab */}
      {/* Unified Zoho-Parity Files Hub Tab (SharePoint App-Only Proxy, Templates & Inline Viewer) */}
      {govSubTab === 'documents' && (
        <div className="bg-white rounded-md border border-slate-200 overflow-hidden min-h-[560px] flex flex-col">
          <FilesView
            currentUser={currentUser}
            employees={employees}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* ER Cases Vault Tab */}
      {govSubTab === 'er' && (
        <div className="bg-white rounded-md border border-slate-200 p-4 space-y-4">
          {canIntakeEr && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const handlerId = newErForm.primaryHandlerId || (canHandleEr ? currentUser?.id : undefined);
                await apiPost('/api/v1/er/cases', {
                  ...newErForm,
                  ...(handlerId ? { primaryHandlerId: handlerId } : {}),
                });
                setNewErForm({ ...newErForm, title: '', allegationSummary: '' });
                onShowToast && onShowToast('ER Case registered.');
                onRefreshAll && (await onRefreshAll());
              } catch (err) {
                onShowToast && onShowToast(err?.message || 'ER Intake failed', 'error');
              }
            }}
            className="grid grid-cols-1 md:grid-cols-4 gap-2 pb-4 border-b"
          >
            <select value={newErForm.caseType} onChange={(e) => setNewErForm({ ...newErForm, caseType: e.target.value })} className="px-2.5 py-1.5 border rounded bg-white">
              <option value="GRIEVANCE">Grievance</option>
              <option value="DISCIPLINARY">Disciplinary</option>
              <option value="HARASSMENT_DISCRIMINATION">Harassment / Discrimination</option>
            </select>
            <input required minLength={5} placeholder="Case Title (>=5 chars)" value={newErForm.title} onChange={(e) => setNewErForm({ ...newErForm, title: e.target.value })} className="px-2.5 py-1.5 border rounded" />
            <select value={newErForm.severity} onChange={(e) => setNewErForm({ ...newErForm, severity: e.target.value })} className="px-2.5 py-1.5 border rounded bg-white">
              <option value="STANDARD">Standard</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
            <select value={newErForm.primaryHandlerId} onChange={(e) => setNewErForm({ ...newErForm, primaryHandlerId: e.target.value })} className="px-2.5 py-1.5 border rounded bg-white">
              <option value="">{canHandleEr ? `Assign Handler: Me (${currentUser?.name || currentUser?.email})` : 'Default Unassigned Handler'}</option>
              {employees.filter((em) => em.userId).map((em) => (
                <option key={em.userId} value={em.userId}>Handler: {em.firstName} {em.lastName}</option>
              ))}
            </select>
            <input required minLength={10} placeholder="Summary (>=10 chars)" value={newErForm.allegationSummary} onChange={(e) => setNewErForm({ ...newErForm, allegationSummary: e.target.value })} className="md:col-span-3 px-2.5 py-1.5 border rounded" />
            <button type="submit" className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium">Open ER Case</button>
          </form>
          )}

          {erCases.length === 0 ? (
            <NdakalaEmptyState title="No ER Cases Visible" subtitle="Only cases explicitly assigned to your role or executive oversight are listed here (case-level isolation enforced)." />
          ) : (
          <div className="divide-y divide-slate-100">
            {erCases.map((c) => {
              const pendingAppeal = (c.appeals || []).find((a) => a.status === 'PENDING') || c.appeals?.[0];
              return (
              <div key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold mr-2">{c.caseNumber}</span>
                  <span className="font-semibold text-slate-800">{c.title}</span>
                  <span className="ml-2 px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded text-[10px] font-bold">{c.status}</span>
                  {c.isAnonymous && <span className="ml-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[10px] font-semibold">ANONYMOUS</span>}
                  <p className="text-slate-500 mt-0.5">{c.allegationSummary}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const detail = await apiGet(`/api/v1/er/cases/${c.id}`);
                        setInspectedErCase(detail);
                      } catch (err) {
                        onShowToast && onShowToast(err?.message || 'Access denied', 'error');
                      }
                    }}
                    className="px-2.5 py-1 border border-slate-300 text-slate-700 rounded hover:bg-slate-50 text-[11px]"
                  >
                    Inspect
                  </button>
                  {canHandleEr && c.status !== 'CLOSED' && (
                    <>
                      <button
                        type="button"
                        onClick={() => setErModal({ mode: 'conflict', caseItem: c })}
                        className="px-2.5 py-1 border border-amber-300 text-amber-700 rounded hover:bg-amber-50 text-[11px]"
                      >
                        Conflict
                      </button>
                      <button
                        type="button"
                        onClick={() => setErModal({ mode: 'hearing', caseItem: c })}
                        className="px-2.5 py-1 border border-blue-300 text-[#0088ff] rounded hover:bg-blue-50 text-[11px]"
                      >
                        Hearing
                      </button>
                      <button
                        type="button"
                        onClick={() => setErModal({ mode: 'decision', caseItem: c })}
                        className="px-2.5 py-1 border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 text-[11px]"
                      >
                        Issue Decision
                      </button>
                    </>
                  )}
                  {c.status !== 'CLOSED' && (
                    <button
                      type="button"
                      onClick={() => {
                        const defaultOfficer = employees.find((e) => e.userId && e.employeeNumber === 'SEED-0000')?.userId || currentUser?.id || '';
                        setErModalForm((f) => ({ ...f, appealOfficerId: defaultOfficer }));
                        setErModal({ mode: 'appeal', caseItem: c });
                      }}
                      className="px-2.5 py-1 border border-purple-300 text-purple-700 rounded hover:bg-purple-50 text-[11px]"
                    >
                      Submit Appeal
                    </button>
                  )}
                  {canAppealEr && pendingAppeal && c.status !== 'CLOSED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setErModalForm((f) => ({ ...f, appealId: pendingAppeal.id }));
                        setErModal({ mode: 'review_appeal', caseItem: c });
                      }}
                      className="px-2.5 py-1 border border-emerald-300 text-emerald-700 rounded hover:bg-emerald-50 text-[11px]"
                    >
                      Review Appeal
                    </button>
                  )}
                  {canHandleEr && c.status !== 'CLOSED' && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/er/cases/${c.id}/close`, { outcomeNotes: 'Closed after formal human review' });
                          onShowToast && onShowToast(`Case ${c.caseNumber} closed.`);
                          onRefreshAll && (await onRefreshAll());
                        } catch (err) {
                          onShowToast && onShowToast(err?.message || 'Close failed', 'error');
                        }
                      }}
                      className="px-3 py-1 border border-slate-300 rounded hover:bg-slate-50 text-[11px]"
                    >
                      Close Case
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
          )}

          {inspectedErCase && (
            <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <h5 className="font-semibold text-slate-800">Case Audit File: {inspectedErCase.caseNumber} ({inspectedErCase.status})</h5>
                <button type="button" onClick={() => setInspectedErCase(null)} className="text-slate-500 hover:text-slate-800">Close</button>
              </div>
              <div className="text-[11px] text-slate-600">
                Hearings: {inspectedErCase.hearings?.length || 0} • Decisions: {inspectedErCase.decisions?.length || 0} • Appeals: {inspectedErCase.appeals?.length || 0} • Events: {inspectedErCase.events?.length || 0}
              </div>
              {(inspectedErCase.events || []).length > 0 && (
                <div className="space-y-1">
                  {inspectedErCase.events.map((ev) => (
                    <div key={ev.id} className="text-[11px] bg-white px-2.5 py-1 rounded border border-slate-100">
                      <span className="font-mono font-semibold">{ev.eventType}</span> — {ev.description}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {erModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-md shadow-xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-semibold text-slate-800">
                {erModal.mode === 'conflict'
                  ? `Declare Conflict — ${erModal.caseItem.caseNumber}`
                  : erModal.mode === 'hearing'
                  ? `Schedule Hearing — ${erModal.caseItem.caseNumber}`
                  : erModal.mode === 'decision'
                  ? `Issue Decision — ${erModal.caseItem.caseNumber}`
                  : erModal.mode === 'appeal'
                  ? `Submit Appeal — ${erModal.caseItem.caseNumber}`
                  : `Review Appeal — ${erModal.caseItem.caseNumber}`}
              </h4>
              <button type="button" onClick={() => setErModal(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const cid = erModal.caseItem.id;
                const cnum = erModal.caseItem.caseNumber;
                try {
                  if (erModal.mode === 'conflict') {
                    await apiPost(`/api/v1/er/cases/${cid}/conflict`, { natureOfConflict: erModalForm.natureOfConflict });
                    onShowToast && onShowToast(`Conflict declared for ${cnum}.`);
                  } else if (erModal.mode === 'hearing') {
                    await apiPost(`/api/v1/er/cases/${cid}/hearings`, {
                      scheduledDate: erModalForm.scheduledDate,
                      locationOrLink: erModalForm.locationOrLink,
                      companionAllowed: true,
                    });
                    onShowToast && onShowToast(`Hearing scheduled for ${cnum}.`);
                  } else if (erModal.mode === 'decision') {
                    await apiPost(`/api/v1/er/cases/${cid}/decision`, {
                      findings: erModalForm.findings,
                      sanction: erModalForm.sanction,
                    });
                    onShowToast && onShowToast(`Formal decision recorded for ${cnum}.`);
                  } else if (erModal.mode === 'appeal') {
                    await apiPost(`/api/v1/er/cases/${cid}/appeal`, {
                      grounds: erModalForm.grounds,
                      appealOfficerId: erModalForm.appealOfficerId || currentUser?.id || '',
                    });
                    onShowToast && onShowToast(`Appeal submitted for ${cnum}.`);
                  } else if (erModal.mode === 'review_appeal') {
                    await apiPost(`/api/v1/er/cases/${cid}/appeal/review`, {
                      appealId: erModalForm.appealId,
                      outcome: erModalForm.outcome,
                      comments: erModalForm.comments,
                    });
                    onShowToast && onShowToast(`Appeal reviewed for ${cnum}.`);
                  }
                  setErModal(null);
                  onRefreshAll && (await onRefreshAll());
                } catch (err) {
                  onShowToast && onShowToast(err?.message || 'ER action failed', 'error');
                }
              }}
              className="space-y-3"
            >
              {erModal.mode === 'conflict' && (
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Nature of Conflict of Interest</label>
                  <textarea
                    required
                    minLength={5}
                    rows={3}
                    value={erModalForm.natureOfConflict}
                    onChange={(e) => setErModalForm({ ...erModalForm, natureOfConflict: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              )}
              {erModal.mode === 'hearing' && (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Hearing Date & Time (ISO / UTC)</label>
                    <input
                      required
                      value={erModalForm.scheduledDate}
                      onChange={(e) => setErModalForm({ ...erModalForm, scheduledDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Location or Video Link</label>
                    <input
                      required
                      value={erModalForm.locationOrLink}
                      onChange={(e) => setErModalForm({ ...erModalForm, locationOrLink: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                </>
              )}
              {erModal.mode === 'decision' && (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Findings (min 5 characters)</label>
                    <textarea
                      required
                      minLength={5}
                      rows={3}
                      value={erModalForm.findings}
                      onChange={(e) => setErModalForm({ ...erModalForm, findings: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Determination / Sanction</label>
                    <select
                      value={erModalForm.sanction}
                      onChange={(e) => setErModalForm({ ...erModalForm, sanction: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="NO_SANCTION">No Sanction / Resolved</option>
                      <option value="VERBAL_CAUTION">Verbal Caution</option>
                      <option value="WRITTEN_WARNING">Written Warning</option>
                      <option value="FINAL_WRITTEN_WARNING">Final Written Warning</option>
                    </select>
                  </div>
                </>
              )}
              {erModal.mode === 'appeal' && (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Appeal Officer</label>
                    <select
                      required
                      value={erModalForm.appealOfficerId}
                      onChange={(e) => setErModalForm({ ...erModalForm, appealOfficerId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="">Select Appeal Officer</option>
                      {employees.filter((e) => e.userId).map((e) => (
                        <option key={e.userId} value={e.userId}>{e.firstName} {e.lastName} ({e.employeeNumber})</option>
                      ))}
                      {currentUser?.id && <option value={currentUser.id}>Current User ({currentUser.name || currentUser.email})</option>}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Appeal Grounds (min 10 characters)</label>
                    <textarea
                      required
                      minLength={10}
                      rows={3}
                      value={erModalForm.grounds}
                      onChange={(e) => setErModalForm({ ...erModalForm, grounds: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                </>
              )}
              {erModal.mode === 'review_appeal' && (
                <>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Appeal Record ID</label>
                    <input
                      required
                      placeholder="Select or enter Appeal UUID"
                      value={erModalForm.appealId}
                      onChange={(e) => setErModalForm({ ...erModalForm, appealId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Outcome</label>
                    <select
                      value={erModalForm.outcome}
                      onChange={(e) => setErModalForm({ ...erModalForm, outcome: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="UPHELD">UPHELD</option>
                      <option value="OVERTURNED">OVERTURNED</option>
                      <option value="MODIFIED">MODIFIED</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Appeal Officer Notes</label>
                    <textarea
                      required
                      rows={2}
                      value={erModalForm.comments}
                      onChange={(e) => setErModalForm({ ...erModalForm, comments: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setErModal(null)} className="px-3.5 py-1.5 border border-slate-300 rounded">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">Confirm Action</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {policyPreviewDoc && (
        <InlineDocumentViewerModal
          doc={policyPreviewDoc}
          onClose={() => setPolicyPreviewDoc(null)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
