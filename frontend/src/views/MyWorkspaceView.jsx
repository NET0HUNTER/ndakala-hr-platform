import React, { useState, useEffect, useRef } from 'react';
import {
  MoreHorizontal,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sliders,
  X,
  Plus,
  Check,
  Star,
  Building,
  Globe,
  Info,
  FileText,
  Download,
  Users,
  Search,
  Award,
  CheckCircle,
  Settings,
  Layers,
  Send,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete, unwrapList } from '../utils/api';

const MORE_OVERVIEW_TABS = [
  { id: 'leave', label: 'Leave' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'timelogs', label: 'Time Logs' },
  { id: 'timesheets', label: 'Timesheets' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'files', label: 'Files' },
  { id: 'hrprocess', label: 'HR Process' },
  { id: 'careerhistory', label: 'Career History' },
  { id: 'goals', label: 'Goals' },
  { id: 'feedback', label: 'Feedback' },
];

const DEFAULT_QUICK_LINKS = [
  { id: 'ql-leave', label: '+ Apply Leave', actionType: 'modal_leave' },
  { id: 'ql-time', label: '⏱ Log Timesheet', actionType: 'tab', tab: 'timetracker', topTab: 'mydata' },
  { id: 'ql-pay', label: '📄 View Payslips', actionType: 'modal_payslip' },
  { id: 'ql-ops', label: '⚙ Operations Hub', actionType: 'tab', tab: 'operations', topTab: 'operations' },
];

const QUICK_LINK_TARGETS = [
  { label: 'Apply Leave', actionType: 'modal_leave' },
  { label: 'Log Timesheet', actionType: 'tab', tab: 'timetracker', topTab: 'mydata' },
  { label: 'View Payslips', actionType: 'modal_payslip' },
  { label: 'Operations Hub', actionType: 'tab', tab: 'operations', topTab: 'operations' },
  { label: 'Onboarding & Directory', actionType: 'tab', tab: 'directory', topTab: 'onboarding' },
  { label: 'Enterprise Reports', actionType: 'tab', tab: 'reports', topTab: 'myreports' },
  { label: 'HR Letters', actionType: 'tab', tab: 'hrletters', topTab: 'addressproof' },
  { label: 'Shift Schedules', actionType: 'tab', tab: 'attendance', topTab: 'shifts' },
];

const DEFAULT_WIDGETS = [
  { id: 'birthday', label: 'Birthday', enabled: true },
  { id: 'newhires', label: 'New Hires', enabled: true },
  { id: 'favorites', label: 'Favorites', enabled: true },
  { id: 'quicklinks', label: 'Quick Links', enabled: true },
  { id: 'announcements', label: 'Announcements', enabled: true },
  { id: 'lopsummary', label: 'Lop Summary', enabled: true },
  { id: 'leavereport', label: 'Leave Report', enabled: true },
  { id: 'upcomingholidays', label: 'Upcoming Holidays', enabled: true },
  { id: 'pendingtasks', label: 'My Pending Tasks', enabled: true },
  { id: 'myfiles', label: 'My Files', enabled: true },
  { id: 'workanniversary', label: 'Work Anniversary', enabled: true },
  { id: 'weddinganniversary', label: 'Wedding Anniversary', enabled: true },
  { id: 'onleavetoday', label: 'On Leave Today', enabled: true },
  { id: 'engagement', label: 'Employee Engagement', enabled: true },
];

const getEmpName = (e, fallback = 'Team Member') =>
  e?.fullName || `${e?.firstName || ''} ${e?.lastName || ''}`.trim() || fallback;

const getEmpDept = (e, fallback = 'Operations') =>
  e?.department?.name || (typeof e?.department === 'string' ? e.department : '') || fallback;

const getEmpTitle = (e, fallback = 'Staff') =>
  e?.jobTitle || e?.position?.title || e?.grade?.name || fallback;

const getEmpInitials = (name = '') =>
  String(name || 'ND')
    .trim()
    .split(/\s+/)
    .map((p) => p[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ND';

function BotanicalBanner() {
  return (
    <div
      className="h-[128px] w-full relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #06281e 0%, #0b3b2c 45%, #07221a 100%)',
      }}
    >
      <svg
        viewBox="0 0 1200 160"
        preserveAspectRatio="none"
        className="w-full h-full opacity-45"
        aria-hidden="true"
      >
        <g fill="#166534">
          <ellipse cx="140" cy="20" rx="95" ry="38" transform="rotate(-18 140 20)" />
          <ellipse cx="320" cy="130" rx="110" ry="45" transform="rotate(14 320 130)" />
          <ellipse cx="560" cy="35" rx="130" ry="42" transform="rotate(-12 560 35)" />
          <ellipse cx="820" cy="120" rx="120" ry="48" transform="rotate(20 820 120)" />
          <ellipse cx="1060" cy="40" rx="115" ry="44" transform="rotate(-16 1060 40)" />
        </g>
        <g stroke="#22c55e" strokeWidth="1.2" opacity="0.35" fill="none">
          <path d="M60,150 Q180,40 310,10" />
          <path d="M260,160 Q400,50 520,10" />
          <path d="M480,155 Q620,40 760,15" />
          <path d="M740,160 Q880,45 1020,10" />
          <path d="M940,155 Q1080,50 1190,20" />
        </g>
      </svg>
    </div>
  );
}

export default function MyWorkspaceView({
  currentUser,
  topContextTab = 'myspace',
  setTopContextTab,
  subViewHint = null,
  employees = [],
  leaveBalances = [],
  leaveRequests = [],
  leaveLedger = [],
  absences = [],
  payslips = [],
  policies = [],
  trainings = [],
  holidays = [],
  tasks = [],
  onOpenLeaveModal,
  onOpenAbsenceModal,
  onOpenPayslipModal,
  onAcknowledgePolicy,
  onCompleteTraining,
  onApproveLeave,
  onRejectLeave,
  onRefreshAll,
  onShowToast,
  setActiveTab,
}) {
  // Top white sub-bar tabs: Overview | Dashboard | Calendar | Delegation
  const [subTab, setSubTab] = useState('overview');

  // Inner Overview tabs: Activities | Feeds | Profile | Approvals | [pinnedExtraTab] | ...
  const [innerTab, setInnerTab] = useState('activities');
  const [pinnedExtraTab, setPinnedExtraTab] = useState({ id: 'leave', label: 'Leave' });
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // Welcome Tour popover (02:19 - 02:37 of hr.webm)
  const [tourStep, setTourStep] = useState(0); // 0 = hidden, 1..4 = visible

  // Live Check-in Timer (02:38 of hr.webm)
  const [checkedIn, setCheckedIn] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Feeds state (hydrated from /api/v1/workspace/feeds)
  const [feedFilter, setFeedFilter] = useState('All');
  const [feedInput, setFeedInput] = useState('');
  const [feedsList, setFeedsList] = useState([]);

  // Dashboard Customize Widgets Drawer
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [widgetTab, setWidgetTab] = useState('my');
  const [mandateOrgWidgets, setMandateOrgWidgets] = useState(false);
  const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
  const [favoriteEmpIds, setFavoriteEmpIds] = useState([]);
  const [quickLinks, setQuickLinks] = useState(DEFAULT_QUICK_LINKS);
  const [addingQuickLink, setAddingQuickLink] = useState(false);
  const [quickLinkForm, setQuickLinkForm] = useState({ label: '', targetIndex: 0 });
  const [surveySummary, setSurveySummary] = useState({ count: 0, pending: 0 });
  const [filesWidgetTab, setFilesWidgetTab] = useState('org');

  // Delegation Drawer (06:39 - 06:58 of hr.webm)
  const [delegations, setDelegations] = useState([]);
  const [delegationDrawerOpen, setDelegationDrawerOpen] = useState(false);
  const [delegationForm, setDelegationForm] = useState({
    delegateeId: '',
    type: 'Temporary',
    dateRange: '13-Nov-2026 to 20-Nov-2026',
    notification: 'both',
    description: '',
  });

  // Calendar Month State (05:50 of hr.webm)
  const [calMonth, setCalMonth] = useState(10); // 10 = Nov (0-indexed)
  const [calYear, setCalYear] = useState(2026);

  // Live Attendance Punches
  const [punches, setPunches] = useState([]);
  // Profile inline self-service edit state (PATCH /api/v1/employees/:id)
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ phoneNumber: '', personalEmail: '', preferredName: '' });
  // Feeds category post selector
  const [feedCategory, setFeedCategory] = useState('STATUS');

  // Team Context View state (when topContextTab === 'team')
  const [teamSubTab, setTeamSubTab] = useState('teamspace'); // 'teamspace' | 'reportees' | 'deptdirectory' | 'teamcalendar'
  const [teamInnerTab, setTeamInnerTab] = useState('wall'); // 'wall' | 'approvals' | 'peers' | 'leavesummary'
  const [teamSearch, setTeamSearch] = useState('');
  const [teamDeptFilter, setTeamDeptFilter] = useState('ALL');

  // Organization Context View state (when topContextTab === 'organization')
  const [orgSubTab, setOrgSubTab] = useState('announcements'); // 'announcements' | 'directory' | 'tree' | 'celebrations' | 'policies'
  const [orgTreeMode, setOrgTreeMode] = useState('employee'); // 'employee' | 'department'
  const [orgSearch, setOrgSearch] = useState('');
  const [orgDeptFilter, setOrgDeptFilter] = useState('ALL');
  const [orgProfile, setOrgProfile] = useState({
    legalName: 'Ndakala Advisory LLP',
    tradingName: 'Ndakala Advisory',
    address: '246 Owashika Road, Lavington, Nairobi, Kenya',
    phone: '+254 792 605 909',
    email: 'info@ndakalaadvisory.co.ke',
    website: 'www.ndakalaadvisory.co.ke',
    timezone: 'Africa/Nairobi',
    currencyCode: 'KES',
  });
  const [orgDepartments, setOrgDepartments] = useState([]);
  const [orgLocations, setOrgLocations] = useState([]);
  const [orgAnnouncementInput, setOrgAnnouncementInput] = useState('');
  const [policyAcks, setPolicyAcks] = useState([]);
  const [myOnboardingTasks, setMyOnboardingTasks] = useState([]);

  useEffect(() => {
    if (subViewHint === 'approvals') {
      setSubTab('overview');
      setInnerTab('approvals');
    }
  }, [subViewHint]);

  const refreshMyOnboardingTasks = async () => {
    const res = await apiGet('/api/v1/onboarding-tasks/mine').catch(() => []);
    setMyOnboardingTasks(unwrapList(res));
  };

  useEffect(() => {
    async function loadWorkspaceData() {
      try {
        const [attRes, feedsRes, delRes, widgetRes, favRes, survRes, orgRes, deptsRes, locsRes, acksRes, onbRes] = await Promise.all([
          apiGet('/api/v1/workspace/attendance').catch(() => null),
          apiGet('/api/v1/workspace/feeds').catch(() => null),
          apiGet('/api/v1/workspace/delegations').catch(() => null),
          apiGet('/api/v1/workspace/ui-config?key=WIDGETS').catch(() => null),
          apiGet('/api/v1/workspace/ui-config?key=WORKSPACE_FAVORITES').catch(() => null),
          apiGet('/api/v1/workspace/surveys').catch(() => null),
          apiGet('/api/v1/organisation').catch(() => null),
          apiGet('/api/v1/departments').catch(() => null),
          apiGet('/api/v1/locations').catch(() => null),
          apiGet('/api/v1/governance/policies/acknowledgements').catch(() => []),
          apiGet('/api/v1/onboarding-tasks/mine').catch(() => []),
        ]);
        if (attRes) {
          setCheckedIn(Boolean(attRes.checkedIn));
          setElapsedSeconds(Number(attRes.elapsedSeconds || 0));
          setPunches(Array.isArray(attRes.punches) ? attRes.punches : []);
        }
        const feedItems = unwrapList(feedsRes);
        if (feedItems.length > 0) {
          setFeedsList(
            feedItems.map((f) => ({
              id: f.id,
              author: f.authorName,
              role: f.category,
              type: f.category === 'ANNOUNCEMENT' ? 'Announcement' : f.category === 'KUDOS' ? 'Kudos' : 'Status',
              time: f.createdAt ? new Date(f.createdAt).toLocaleString() : 'Recently',
              content: f.message,
            }))
          );
        }
        const delItems = unwrapList(delRes);
        setDelegations(
          delItems.map((d) => ({
            id: d.id,
            delegator: currentUser?.fullName || currentUser?.name || d.delegatorId,
            delegatee: d.delegateName,
            type: d.delegationType === 'PERMANENT' ? 'Permanent' : 'Temporary',
            dateRange: `${d.startDate} to ${d.endDate}`,
            notification: d.notifyDelegator ? 'both' : 'delegatee',
            description: d.reason || '',
          }))
        );
        const widgetVal = widgetRes?.configs?.WIDGETS || widgetRes?.value;
        if (widgetVal && Array.isArray(widgetVal.widgets)) {
          setWidgets(widgetVal.widgets);
          setMandateOrgWidgets(Boolean(widgetVal.mandateOrgWidgets));
        }
        const favVal = favRes?.configs?.WORKSPACE_FAVORITES || favRes?.value;
        if (Array.isArray(favVal?.ids)) {
          setFavoriteEmpIds(favVal.ids);
        }
        if (Array.isArray(favVal?.quickLinks) && favVal.quickLinks.length > 0) {
          setQuickLinks(favVal.quickLinks);
        }
        const survItems = unwrapList(survRes);
        if (survItems.length > 0) {
          setSurveySummary({
            count: survItems.length,
            pending: survItems.filter((s) => s.status === 'OPEN' && !s.hasResponded).length,
          });
        }
        if (orgRes && (orgRes.legalName || orgRes.tradingName)) {
          setOrgProfile((prev) => ({ ...prev, ...orgRes }));
        }
        const deptsList = unwrapList(deptsRes);
        if (deptsList.length > 0) setOrgDepartments(deptsList);
        const locsList = unwrapList(locsRes);
        if (locsList.length > 0) setOrgLocations(locsList);
        const ackList = unwrapList(acksRes);
        if (Array.isArray(ackList)) setPolicyAcks(ackList);
        setMyOnboardingTasks(unwrapList(onbRes));
        if (ackList.length > 0) setPolicyAcks(ackList);
      } catch {
        // ignore load errors on restricted views
      }
    }
    loadWorkspaceData();
  }, [currentUser?.userId]);

  useEffect(() => {
    let timer = null;
    if (checkedIn) {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [checkedIn]);

  useEffect(() => {
    function handleOutside(e) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const hrs = String(Math.floor(elapsedSeconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0');
  const secs = String(elapsedSeconds % 60).padStart(2, '0');

  const matchedEmp = employees.find(
    (e) =>
      (currentUser?.email && (e.email === currentUser.email || e.workEmail === currentUser.email)) ||
      (currentUser?.employeeId && e.id === currentUser.employeeId)
  );
  const currentEmp = matchedEmp || {
    id: currentUser?.employeeId || currentUser?.id || '',
    employeeNumber: currentUser?.employeeNumber || '-',
    fullName: currentUser?.fullName || currentUser?.name || 'Workspace User',
    email: currentUser?.email || '-',
    workEmail: currentUser?.email || '-',
    department: currentUser?.department || 'Executive & Advisory',
    jobTitle: currentUser?.role ? String(currentUser.role).replace(/_/g, ' ') : 'Staff',
    employmentType: 'Permanent',
    status: 'ACTIVE',
    hireDate: currentUser?.createdAt || null,
    phone: '-',
    phoneNumber: '-',
  };

  const pendingLeaveApprovals = leaveRequests.filter((r) => r.status === 'PENDING_APPROVAL');

  const notify = (msg, type = 'success') => {
    if (onShowToast) onShowToast(msg, type);
  };

  const handleClockToggle = async () => {
    try {
      if (!checkedIn) {
        await apiPost('/api/v1/workspace/attendance/clock-in', { source: 'WEB' });
        setCheckedIn(true);
        notify('Checked in — timer synced to attendance punch ledger.');
      } else {
        await apiPost('/api/v1/workspace/attendance/clock-out', {});
        setCheckedIn(false);
        notify('Checked out — session recorded in attendance ledger.');
      }
      const fresh = await apiGet('/api/v1/workspace/attendance').catch(() => null);
      if (fresh) {
        setElapsedSeconds(Number(fresh.elapsedSeconds || 0));
        setPunches(Array.isArray(fresh.punches) ? fresh.punches : []);
      }
    } catch (err) {
      notify(err?.message || 'Unable to update check-in status', 'error');
    }
  };

  const toggleWidget = async (id) => {
    const nextWidgets = widgets.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w));
    setWidgets(nextWidgets);
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'WIDGETS',
        scope: widgetTab === 'org' ? 'ORG' : 'USER',
        value: { widgets: nextWidgets, mandateOrgWidgets },
      });
    } catch (err) {
      notify(err?.message || 'Unable to persist widget preferences', 'error');
    }
  };

  const handleToggleMandateWidgets = async () => {
    const nextVal = !mandateOrgWidgets;
    setMandateOrgWidgets(nextVal);
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'WIDGETS',
        scope: 'ORG',
        value: { widgets, mandateOrgWidgets: nextVal },
      });
      notify('Organization widget mandate updated.');
    } catch (err) {
      notify(err?.message || 'Only HR/Admin can mandate org widgets', 'error');
    }
  };

  const isWidgetEnabled = (id) => widgets.find((w) => w.id === id)?.enabled ?? true;

  const handleSaveDelegation = async (e) => {
    e.preventDefault();
    if (!delegationForm.delegateeId) return;
    const targetEmp = employees.find((emp) => emp.id === delegationForm.delegateeId);
    const delegateName = targetEmp
      ? targetEmp.fullName || `${targetEmp.firstName || ''} ${targetEmp.lastName || ''}`.trim()
      : delegationForm.delegateeId;

    const parts = (delegationForm.dateRange || '').split(/\s+to\s+/i);
    const toIso = (raw, fallback) => {
      if (!raw) return fallback;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim();
      const parsed = new Date(raw.trim());
      return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().slice(0, 10);
    };
    const startDate = toIso(parts[0], new Date().toISOString().slice(0, 10));
    const endDate = toIso(parts[1], startDate);

    try {
      const created = await apiPost('/api/v1/workspace/delegations', {
        delegateName,
        delegateId: targetEmp ? targetEmp.id : undefined,
        startDate,
        endDate,
        delegationType: delegationForm.type === 'Permanent' ? 'PERMANENT' : 'TEMPORARY',
        notifyDelegator: delegationForm.notification === 'both',
        reason: delegationForm.description || undefined,
      });
      setDelegations((prev) => [
        {
          id: created.id,
          delegator: currentEmp.fullName || currentUser?.name,
          delegatee: created.delegateName,
          type: created.delegationType === 'PERMANENT' ? 'Permanent' : 'Temporary',
          dateRange: `${created.startDate} to ${created.endDate}`,
          notification: created.notifyDelegator ? 'both' : 'delegatee',
          description: created.reason || '',
        },
        ...prev,
      ]);
      setDelegationDrawerOpen(false);
      setDelegationForm({
        delegateeId: '',
        type: 'Temporary',
        dateRange: '2026-11-13 to 2026-11-20',
        notification: 'both',
        description: '',
      });
      notify(`Delegation saved for ${delegateName}.`);
    } catch (err) {
      notify(err?.message || 'Failed to save delegation', 'error');
    }
  };

  const handleRevokeDelegation = async (id) => {
    try {
      await apiDelete(`/api/v1/workspace/delegations/${id}`);
      setDelegations((prev) => prev.filter((d) => d.id !== id));
      notify('Delegation revoked.');
    } catch (err) {
      notify(err?.message || 'Failed to revoke delegation', 'error');
    }
  };

  // Real reportees / team peers from live backend employee records
  const directReportees = employees.filter((e) => e.managerId && e.managerId === currentUser?.employeeId);
  const reporteeSource = directReportees.length > 0 ? directReportees : employees.filter((e) => e.id !== currentUser?.employeeId);
  const reporteesList = reporteeSource.map((e, i) => ({
    id: e.id,
    code: e.employeeNumber || `NDK-${i + 1}`,
    name: e.fullName || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Team Member',
    dept: `${getEmpTitle(e)} - ${getEmpDept(e)}`,
    phone: e.phoneNumber || e.phone || 'Corporate Directory',
    status: e.status === 'ACTIVE' ? 'Active' : e.status || 'Active',
  }));

  const toggleFavoriteEmployee = async (empId) => {
    const nextIds = favoriteEmpIds.includes(empId)
      ? favoriteEmpIds.filter((id) => id !== empId)
      : [...favoriteEmpIds, empId];
    setFavoriteEmpIds(nextIds);
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'WORKSPACE_FAVORITES',
        scope: 'USER',
        value: { ids: nextIds, quickLinks },
      });
    } catch {
      // keep optimistic UI state
    }
  };

  const publishWorkspaceFeed = async (category, rawMessage, onClear) => {
    const cleanMsg = String(rawMessage || '').trim();
    if (!cleanMsg) return false;
    try {
      const created = await apiPost('/api/v1/workspace/feeds', {
        category,
        message: cleanMsg,
      });
      setFeedsList((prev) => [
        {
          id: created.id,
          author: created.authorName || getEmpName(currentEmp),
          role: created.category,
          type: created.category === 'ANNOUNCEMENT' ? 'Announcement' : created.category === 'KUDOS' ? 'Kudos' : 'Status',
          time: 'Just now',
          content: created.message,
        },
        ...prev,
      ]);
      if (onClear) onClear();
      notify(
        category === 'ANNOUNCEMENT'
          ? 'Announcement published to organization wall.'
          : category === 'KUDOS'
            ? 'Kudos shared with the team!'
            : 'Update published to feeds.'
      );
      return true;
    } catch (err) {
      notify(err?.message || 'Failed to publish feed update', 'error');
      return false;
    }
  };

  // Derived department list combining DB departments and employee records
  const uniqueDeptNames = Array.from(
    new Set([
      ...orgDepartments.map((d) => d.name).filter(Boolean),
      ...employees.map((e) => getEmpDept(e)).filter(Boolean),
    ])
  ).sort();

  // Render Calendar days for Nov 2026 (05:50 of hr.webm)
  const renderCalendarGrid = () => {
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(d);
    }
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }

    return (
      <div className="bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden">
        {/* Month Navigation Header */}
        <div className="py-3 px-4 border-b border-slate-200 flex items-center justify-center gap-3">
          <div className="inline-flex items-center border border-slate-200 rounded bg-white">
            <button
              type="button"
              onClick={() => {
                if (calMonth === 0) {
                  setCalMonth(11);
                  setCalYear(calYear - 1);
                } else {
                  setCalMonth(calMonth - 1);
                }
              }}
              className="px-2 py-1 text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2.5 py-1 border-x border-slate-200 text-slate-600">
              <Calendar size={13} />
            </span>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 11) {
                  setCalMonth(0);
                  setCalYear(calYear + 1);
                } else {
                  setCalMonth(calMonth + 1);
                }
              }}
              className="px-2 py-1 text-slate-500 hover:bg-slate-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <span className="text-xs font-semibold text-slate-800">
            {monthNames[calMonth]} {calYear}
          </span>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 text-xs font-medium text-slate-600 bg-slate-50/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
            <div
              key={day}
              className={`py-2.5 px-3 border-r last:border-r-0 border-slate-200 ${
                idx === 0 || idx === 6 ? 'bg-[#fffbeb]' : 'bg-white'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="grid grid-cols-7">
          {cells.map((dayNum, idx) => {
            const colIdx = idx % 7;
            const isWeekend = colIdx === 0 || colIdx === 6;
            const isToday = dayNum === 13 && calMonth === 10 && calYear === 2026;
            const isPastWorkday =
              dayNum && !isWeekend && calMonth === 10 && calYear === 2026 && dayNum < 13;

            return (
              <div
                key={idx}
                className={`min-h-[96px] p-2.5 border-b border-r last:border-r-0 border-slate-200 transition-colors ${
                  isWeekend ? 'bg-[#fffbeb]/80' : 'bg-white hover:bg-slate-50/50'
                }`}
              >
                {dayNum && (
                  <>
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${
                          isToday
                            ? 'bg-[#0088ff] text-white w-6 h-6 rounded flex items-center justify-center font-bold shadow-2xs'
                            : 'text-slate-600'
                        }`}
                      >
                        {dayNum}
                      </span>
                    </div>
                    {isPastWorkday && (
                      <div className="mt-3 px-2.5 py-1 rounded bg-[#fff1f0] border-l-[3px] border-[#ff4d4f] text-[#cf1322] text-[11px] font-medium">
                        Absent
                      </div>
                    )}
                    {isToday && checkedIn && (
                      <div className="mt-3 px-2.5 py-1 rounded bg-emerald-50 border-l-[3px] border-emerald-500 text-emerald-700 text-[11px] font-medium">
                        Present
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const HOME_TOUR_STEPS = [
    {
      step: 1,
      title: 'My Space & Daily Attendance',
      desc: 'Clock in/out for your shift, inspect your live schedule timer, and launch self-service actions from one place.',
      bullets: [
        `Shift Timer: ${checkedIn ? 'Checked in and recording shift hours' : 'Ready to check in for General Shift (08:30–17:30)'}`,
        'Edit your corporate profile and view work experience right inside the Profile tab',
        'Submit Leave or Unexpected Absence notices directly from quick actions',
      ],
      ctaLabel: 'Open Attendance & Shifts',
      ctaAction: () => {
        setTourStep(0);
        setActiveTab && setActiveTab('attendance', 'mydata', 'attendance');
      },
      prepareView: () => {
        setSubTab('overview');
        setInnerTab('activities');
      },
    },
    {
      step: 2,
      title: 'Team Collaboration & Approvals',
      desc: 'Stay aligned with department announcements in Feeds and process pending approvals without switching apps.',
      bullets: [
        `Pending Leave Approvals: ${pendingLeaveApprovals.length} request(s) awaiting review`,
        `Company Feeds & Announcements: ${feedsList.length} recent update(s) in wall`,
        'Review reportees and department directory contacts directly from Team view',
      ],
      ctaLabel: 'Open Leave Tracker',
      ctaAction: () => {
        setTourStep(0);
        setActiveTab && setActiveTab('inbox', 'mydata');
      },
      prepareView: () => {
        setSubTab('overview');
        setInnerTab('approvals');
      },
    },
    {
      step: 3,
      title: 'Live KPI Dashboard & Custom Widgets',
      desc: 'Monitor real-time new hires, holidays, pending workflow tasks, leave balances, and engagement surveys via configurable widgets.',
      bullets: [
        `Live Staff Roster: ${employees.length} active employee(s) synced`,
        `Gazetted Holidays: ${holidays.length} Kenya holiday(s) upcoming`,
        'Use Customize Widgets to pin or hide cards across My & Org dashboards',
      ],
      ctaLabel: 'Customize Dashboard Widgets',
      ctaAction: () => {
        setTourStep(0);
        setSubTab('dashboard');
        setCustomizeOpen(true);
      },
      prepareView: () => {
        setSubTab('dashboard');
      },
    },
    {
      step: 4,
      title: 'Leave Calendar & Approval Delegation',
      desc: 'Inspect month-by-month holidays and assign temporary or permanent approval delegates whenever you are out of office.',
      bullets: [
        `Active Delegations: ${delegations.length} delegation rule(s) configured`,
        'Interactive monthly Calendar highlights Kenya public holidays & leave dates',
        'Audit-logged delegation automatically routes requests while you are away',
      ],
      ctaLabel: 'Manage Delegations',
      ctaAction: () => {
        setTourStep(0);
        setSubTab('delegation');
        setDelegationDrawerOpen(true);
      },
      prepareView: () => {
        setSubTab('calendar');
      },
    },
  ];
  const currentTour = HOME_TOUR_STEPS[tourStep - 1] || HOME_TOUR_STEPS[0];

  const handleStepHomeTour = async (nextStep) => {
    if (nextStep >= 1 && nextStep <= 4) {
      HOME_TOUR_STEPS[nextStep - 1].prepareView();
      setTourStep(nextStep);
    } else {
      setTourStep(0);
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'HOME_TOUR_SEEN',
        scope: 'USER',
        value: { completedAt: new Date().toISOString() },
      }).catch(() => {});
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#edf1f7]">
      {/* White Sub-Navigation Bar (Context-aware for My Space | Team | Organization) */}
      <div className="h-[42px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0 select-none">
        <div className="flex items-center space-x-6 h-full overflow-x-auto">
          {topContextTab === 'myspace' &&
            [
              { id: 'overview', label: 'Overview' },
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'calendar', label: 'Calendar' },
              { id: 'delegation', label: 'Delegation' },
            ].map((t) => {
              const active = subTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSubTab(t.id)}
                  className={`relative h-full flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{t.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />
                  )}
                </button>
              );
            })}

          {topContextTab === 'team' &&
            [
              { id: 'teamspace', label: 'Team Space' },
              { id: 'reportees', label: 'Reportees' },
              { id: 'deptdirectory', label: 'Department Directory' },
              { id: 'teamcalendar', label: 'Team Calendar' },
            ].map((t) => {
              const active = teamSubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeamSubTab(t.id)}
                  className={`relative h-full flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{t.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />
                  )}
                </button>
              );
            })}

          {topContextTab === 'organization' &&
            [
              { id: 'announcements', label: 'Announcements' },
              { id: 'directory', label: 'Employee Directory' },
              { id: 'tree', label: 'Department Tree' },
              { id: 'celebrations', label: 'Birthday & Anniversaries' },
              { id: 'policies', label: 'Company Policies' },
            ].map((t) => {
              const active = orgSubTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOrgSubTab(t.id)}
                  className={`relative h-full flex items-center text-xs font-medium transition-colors whitespace-nowrap ${
                    active ? 'text-slate-900 font-semibold' : 'text-slate-600 hover:text-slate-900'
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

        {/* Right toolbar icons */}
        <div className="flex items-center gap-2">
          {(topContextTab === 'myspace' && subTab === 'dashboard') || topContextTab !== 'myspace' ? (
            <button
              type="button"
              onClick={() => onRefreshAll && onRefreshAll()}
              title="Refresh Workspace Data"
              className="p-1.5 text-slate-500 hover:text-slate-800 border border-slate-200 rounded bg-white"
            >
              <RefreshCw size={13} />
            </button>
          ) : null}
          {topContextTab === 'myspace' && subTab === 'dashboard' && (
            <button
              type="button"
              onClick={() => setCustomizeOpen(true)}
              title="Customize widgets"
              className="p-1.5 text-slate-500 hover:text-slate-800 border border-slate-200 rounded bg-white"
            >
              <Sliders size={13} />
            </button>
          )}
          {topContextTab === 'myspace' && (
            <button
              type="button"
              onClick={() => handleStepHomeTour(1)}
              className="text-[11px] text-[#0088ff] hover:underline font-medium ml-2"
            >
              Home Tour ({tourStep > 0 ? tourStep : 1}/4)
            </button>
          )}
        </div>
      </div>

      {/* Interactive 4-Step Guided Home Tour Popover */}
      {tourStep > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-start p-16">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 p-6 max-w-md w-full animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[10px] font-bold">
                  Step {tourStep} of 4
                </span>
                <h3 className="text-sm font-bold text-slate-900">{currentTour.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setTourStep(0)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Skip
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              {currentTour.desc}
            </p>
            <ul className="space-y-2.5 text-xs text-slate-600 mb-5">
              {currentTour.bullets.map((b, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <Check size={14} className="text-[#0088ff] mt-0.5 flex-shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
              <button
                type="button"
                onClick={currentTour.ctaAction}
                className="text-xs font-medium text-[#0088ff] hover:underline"
              >
                {currentTour.ctaLabel} →
              </button>
              <div className="flex items-center gap-2">
                {tourStep > 1 && (
                  <button
                    type="button"
                    onClick={() => handleStepHomeTour(tourStep - 1)}
                    className="px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded"
                  >
                    Previous
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleStepHomeTour(tourStep < 4 ? tourStep + 1 : 0)}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded"
                >
                  {tourStep < 4 ? 'Next' : 'Finish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto">
        {topContextTab === 'myspace' && (
          <>
            {/* ==================== SUB-TAB 1: OVERVIEW (02:38 - 05:15) ==================== */}
            {subTab === 'overview' && (
              <div>
                <BotanicalBanner />

            {/* Two-Column Overlapping Layout */}
            <div className="px-5 pb-8 flex flex-col lg:flex-row gap-4 items-start -mt-14 relative z-10">
              {/* LEFT COLUMN: Profile Check-In Card + Reportees Card */}
              <div className="w-full lg:w-[255px] flex-shrink-0 space-y-4">
                {/* Check-in Card */}
                <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-5 text-center">
                  {/* Overlapping Avatar */}
                  <div className="w-20 h-20 rounded-xl bg-slate-100 border-4 border-white shadow-sm mx-auto -mt-11 flex items-center justify-center overflow-hidden">
                    <svg viewBox="0 0 80 80" className="w-full h-full">
                      <rect width="80" height="80" fill="#cbd5e1" />
                      <circle cx="40" cy="30" r="14" fill="#ffffff" />
                      <path d="M16 74c0-14 10-24 24-24s24 10 24 24" fill="#ffffff" />
                    </svg>
                  </div>

                  <h3 className="mt-2.5 text-xs font-semibold text-slate-800">
                    {currentEmp.employeeNumber || '-'} - {getEmpName(currentEmp, currentUser?.fullName || 'Workspace User')}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {getEmpTitle(currentEmp, currentUser?.role ? String(currentUser.role).replace(/_/g, ' ') : 'Staff')}
                  </p>

                  <p
                    className={`text-[11px] font-medium mt-2 ${
                      checkedIn ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  >
                    {checkedIn ? 'Checked-in' : 'Yet to check-in'}
                  </p>

                  {/* Digital Timer Boxes: [00] : [00] : [00] */}
                  <div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-xs text-slate-700">
                    <span className="px-2 py-1.5 bg-slate-100 rounded font-semibold">{hrs}</span>
                    <span className="text-slate-400 font-bold">:</span>
                    <span className="px-2 py-1.5 bg-slate-100 rounded font-semibold">{mins}</span>
                    <span className="text-slate-400 font-bold">:</span>
                    <span className="px-2 py-1.5 bg-slate-100 rounded font-semibold">{secs}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleClockToggle}
                    className={`mt-4 px-5 py-1.5 rounded text-xs font-medium border transition-colors ${
                      checkedIn
                        ? 'border-rose-500 text-rose-600 hover:bg-rose-500 hover:text-white'
                        : 'border-emerald-500 text-emerald-600 hover:bg-emerald-500 hover:text-white'
                    }`}
                  >
                    {checkedIn ? 'Check-out' : 'Check-in'}
                  </button>
                </div>

                {/* Reportees Card */}
                <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-4">
                  <h4 className="text-xs font-semibold text-slate-800 mb-3">Team & Reportees</h4>
                  <div className="space-y-3">
                    {reporteesList.length === 0 ? (
                      <p className="text-xs text-slate-400">No team members found.</p>
                    ) : (
                      reporteesList.slice(0, 4).map((rep) => (
                        <div key={rep.id} className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {rep.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              <span className="text-slate-400 mr-1">{rep.code}</span>- {rep.name}
                            </p>
                            <p className="text-[11px] text-emerald-600 mt-0.5">{rep.status}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT MAIN COLUMN: Contextual Tabs Card */}
              <div className="flex-1 w-full min-w-0">
                {/* Inner Tab Strip (Activities | Feeds | Profile | Approvals | [Extra] | ...) */}
                <div className="bg-white rounded-md border border-slate-200 shadow-2xs px-5 h-[46px] flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-6 h-full">
                    {[
                      { id: 'activities', label: 'Activities' },
                      { id: 'feeds', label: 'Feeds' },
                      { id: 'profile', label: 'Profile' },
                      { id: 'approvals', label: 'Approvals' },
                      ...(pinnedExtraTab ? [pinnedExtraTab] : []),
                    ].map((tab) => {
                      const active = innerTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setInnerTab(tab.id)}
                          className={`relative h-full flex items-center text-xs font-medium transition-colors ${
                            active
                              ? 'text-slate-900 font-semibold'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span>{tab.label}</span>
                          {active && (
                            <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />
                          )}
                        </button>
                      );
                    })}

                    {/* ... More Dropdown (04:53 - 05:12 of hr.webm) */}
                    <div className="relative h-full flex items-center" ref={moreMenuRef}>
                      <button
                        type="button"
                        onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                        title="More"
                        className="p-1.5 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                      >
                        <MoreHorizontal size={16} />
                      </button>

                      {moreMenuOpen && (
                        <div className="absolute left-0 top-11 w-44 bg-white rounded-md shadow-xl border border-slate-200 py-1.5 z-40 animate-fadeIn">
                          {MORE_OVERVIEW_TABS.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setPinnedExtraTab(item);
                                setInnerTab(item.id);
                                setMoreMenuOpen(false);
                              }}
                              className={`w-full px-4 py-2 text-left text-xs transition-colors ${
                                innerTab === item.id
                                  ? 'bg-blue-50 text-[#0088ff] font-semibold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* -------- INNER TAB 1: ACTIVITIES (02:38 - 02:54 of hr.webm) -------- */}
                {innerTab === 'activities' && (
                  <div className="space-y-3">
                    {/* Greeting Banner Card */}
                    <div className="bg-white rounded-md border border-slate-200 p-4 flex items-center justify-between relative overflow-hidden">
                      <div className="flex items-center gap-3.5">
                        <div className="flex items-center gap-1.5 pr-3 border-r border-slate-200">
                          <svg viewBox="0 0 36 36" className="w-7 h-7">
                            <circle cx="18" cy="10" r="4.5" fill="#ff5252" />
                            <circle cx="10" cy="15" r="3.5" fill="#ffca28" />
                            <circle cx="26" cy="15" r="3.5" fill="#26a69a" />
                            <path d="M11 27c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="#42a5f5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                          </svg>
                          <span className="text-[11px] font-bold text-slate-700 leading-tight">
                            Ndakala<br />People
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            Good Afternoon <span className="font-bold">{currentEmp.fullName}</span>
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">Have a productive day!</p>
                        </div>
                      </div>
                      {/* Warm Sun Illustration */}
                      <div className="w-12 h-12 rounded-full bg-amber-300/80 blur-[1px] flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-amber-400" />
                      </div>
                    </div>

                    {/* Check-in reminder Card */}
                    <div className="bg-white rounded-md border border-slate-200 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-full bg-blue-50 text-[#0088ff] flex items-center justify-center">
                          <Clock size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Check-in reminder</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {checkedIn ? 'You are currently checked in for your shift' : 'Your shift has already started'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-semibold text-slate-700">General</p>
                        <p className="text-slate-500 text-[11px]">9:00 AM - 6:00 PM</p>
                      </div>
                    </div>

                    {/* Work Schedule Timeline Card (02:48 of hr.webm) */}
                    <div className="bg-white rounded-md border border-slate-200 p-4">
                      <div className="flex items-center gap-3.5 mb-3">
                        <div className="w-9 h-9 rounded-full bg-blue-50 text-[#0088ff] flex items-center justify-center">
                          <Calendar size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-800">Work Schedule</p>
                          <p className="text-[11px] text-slate-500">08-Nov-2026 - 14-Nov-2026</p>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-md p-3 bg-slate-50/40">
                        <div className="text-xs mb-3">
                          <span className="font-semibold text-slate-700">General</span>
                          <span className="text-slate-400 ml-2 text-[11px]">9:00 AM - 6:00 PM</span>
                        </div>
                        <div className="relative h-[2px] bg-slate-200 my-3">
                          <span className="absolute left-[72%] -top-1.5 w-3 h-3 rounded-full bg-[#0088ff] border-2 border-white shadow-xs" />
                        </div>
                        <div className="grid grid-cols-7 gap-2 text-xs pt-1">
                          {[
                            { day: 'Sun', date: '08', status: 'Weekend', color: 'text-amber-600' },
                            { day: 'Mon', date: '09', status: 'Absent', color: 'text-rose-500' },
                            { day: 'Tue', date: '10', status: 'Absent', color: 'text-rose-500' },
                            { day: 'Wed', date: '11', status: 'Absent', color: 'text-rose-500' },
                            { day: 'Thu', date: '12', status: 'Absent', color: 'text-rose-500' },
                            { day: 'Fri', date: '13', status: checkedIn ? 'Present' : 'Today', color: 'text-[#0088ff]' },
                            { day: 'Sat', date: '14', status: 'Weekend', color: 'text-amber-600' },
                          ].map((d) => (
                            <div key={d.date} className="border-r last:border-r-0 border-slate-200 pr-2">
                              <p className="text-slate-700 font-medium">
                                {d.day} <span className="font-bold">{d.date}</span>
                              </p>
                              <p className={`text-[11px] mt-0.5 ${d.color}`}>{d.status}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Time Logs Prompt Card (02:50 of hr.webm) */}
                    <div className="bg-white rounded-md border border-slate-200 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                          <Clock size={18} />
                        </div>
                        <p className="text-xs font-semibold text-slate-800">
                          You are yet to submit your time logs today!
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab && setActiveTab('timetracker')}
                        className="px-3.5 py-1.5 text-xs font-medium text-[#0088ff] border border-[#0088ff] hover:bg-blue-50 rounded transition-colors"
                      >
                        Log Time
                      </button>
                    </div>
                  </div>
                )}

                {/* -------- INNER TAB 2: FEEDS (02:56 of hr.webm) -------- */}
                {innerTab === 'feeds' && (
                  <div className="space-y-3">
                    <div className="bg-white rounded-md border border-slate-200 p-4">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          publishWorkspaceFeed(feedCategory, feedInput, () => setFeedInput(''));
                        }}
                        className="flex items-center gap-3 pb-3 border-b border-slate-100"
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                          {(currentEmp.fullName || 'N').slice(0, 2).toUpperCase()}
                        </div>
                        <select
                          value={feedCategory}
                          onChange={(e) => setFeedCategory(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded text-[11px] bg-white text-slate-600"
                        >
                          <option value="STATUS">Status</option>
                          <option value="ANNOUNCEMENT">Announcement</option>
                          <option value="KUDOS">Kudos</option>
                        </select>
                        <input
                          type="text"
                          value={feedInput}
                          onChange={(e) => setFeedInput(e.target.value)}
                          placeholder="Type @ to mention someone or share an announcement"
                          className="flex-1 text-xs text-slate-700 focus:outline-none"
                        />
                        {feedInput.trim() && (
                          <button
                            type="submit"
                            className="px-3 py-1 bg-[#0088ff] text-white text-xs rounded"
                          >
                            Post
                          </button>
                        )}
                      </form>
                      <div className="flex items-center gap-5 pt-3 text-xs">
                        {['All', 'Status', 'Announcement', 'Approvals', 'Mail Alerts', 'Holidays'].map(
                          (f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => setFeedFilter(f)}
                              className={`pb-1 transition-colors ${
                                feedFilter === f
                                  ? 'text-slate-900 font-semibold border-b-2 border-[#0088ff]'
                                  : 'text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              {f}
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {feedsList
                      .filter((item) => feedFilter === 'All' || item.type === feedFilter)
                      .map((item) => (
                        <div
                          key={item.id}
                          className="bg-white rounded-md border border-slate-200 p-4 text-xs"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-slate-800">
                              {item.author}{' '}
                              <span className="text-slate-400 font-normal">• {item.role}</span>
                            </span>
                            <span className="text-[11px] text-slate-400">{item.time}</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed">{item.content}</p>
                        </div>
                      ))}
                  </div>
                )}

                {/* -------- INNER TAB 3: PROFILE (02:59 - 03:19 of hr.webm) -------- */}
                {innerTab === 'profile' && (
                  <div className="space-y-3">
                    {/* Top 6-Item Icon Summary Card */}
                    <div className="bg-white rounded-md border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <Building size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Department</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            {getEmpDept(currentEmp, 'Management')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <Clock size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Shift</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            General (09:00 AM - 06:00 PM)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <Globe size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Time zone</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            East Africa Time (GMT+03:00)
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <Building size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Seating Location</p>
                          <p className="font-semibold text-slate-800 mt-0.5">FL_EXEC_1</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <FileText size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Email address</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            {currentEmp.workEmail || currentEmp.email || currentUser?.email || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded bg-slate-100 text-slate-500">
                          <Info size={16} />
                        </div>
                        <div>
                          <p className="text-slate-400 text-[11px]">Work Phone Number</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            {currentEmp.phoneNumber || currentEmp.phone || '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* About Me & Tags Cards */}
                    <div className="bg-white rounded-md border border-slate-200 p-5 text-xs">
                      <h4 className="font-semibold text-slate-800 mb-3">About Me</h4>
                      <p className="text-slate-400 py-2">Write a short introduction about yourself</p>
                    </div>

                    {/* My Assigned Onboarding Checklist */}
                    {myOnboardingTasks.length > 0 && (
                      <div className="bg-white rounded-md border border-slate-200 p-5 text-xs space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-slate-800">My Onboarding Checklist</h4>
                            <p className="text-[11px] text-slate-500">
                              Tasks assigned directly to you or your role during onboarding
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={refreshMyOnboardingTasks}
                            className="text-[11px] text-[#0088ff] hover:underline font-medium"
                          >
                            Refresh
                          </button>
                        </div>
                        <div className="space-y-2">
                          {myOnboardingTasks.map((task) => (
                            <div
                              key={task.id}
                              className="p-3 border border-slate-200 rounded flex items-center justify-between gap-3"
                            >
                              <div>
                                <div className="font-medium text-slate-800">{task.taskTitle}</div>
                                <div className="text-[11px] text-slate-500">
                                  {task.employee ? `${task.employee.firstName} ${task.employee.lastName} (${task.employee.employeeNumber}) • ` : ''}
                                  Owner: {task.ownerType} • Status: <b>{task.status}</b>
                                  {task.dueDate ? ` • Due: ${String(task.dueDate).slice(0, 10)}` : ''}
                                </div>
                              </div>
                              {task.status !== 'COMPLETED' && task.status !== 'WAIVED' && !task.evidenceRequired && (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {task.status === 'PENDING' && (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        try {
                                          await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                            status: 'IN_PROGRESS',
                                            completionNotes: 'Started in My Space',
                                          });
                                          notify(`Started task: ${task.taskTitle}`);
                                          await refreshMyOnboardingTasks();
                                          onRefreshAll && onRefreshAll();
                                        } catch (err) {
                                          notify(err?.message || 'Unable to start task', 'error');
                                        }
                                      }}
                                      className="px-2.5 py-1 border border-blue-300 text-[#0088ff] rounded text-[11px] font-medium"
                                    >
                                      Start
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                          status: 'COMPLETED',
                                          completionNotes: 'Completed in My Space self-service checklist',
                                        });
                                        notify(`Completed task: ${task.taskTitle}`);
                                        await refreshMyOnboardingTasks();
                                        onRefreshAll && onRefreshAll();
                                      } catch (err) {
                                        notify(err?.message || 'Unable to complete task', 'error');
                                      }
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium"
                                  >
                                    Complete
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Basic Information */}
                    <div className="bg-white rounded-md border border-slate-200 p-5 text-xs">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-slate-800">Basic Information</h4>
                        {currentEmp.id && currentEmp.id.length > 10 && (
                          <button
                            type="button"
                            onClick={() => {
                              setProfileForm({
                                phoneNumber: currentEmp.phone || currentEmp.phoneNumber || '',
                                personalEmail: currentEmp.personalEmail || '',
                                preferredName: currentEmp.preferredName || '',
                              });
                              setEditingProfile(!editingProfile);
                            }}
                            className="text-xs text-[#0088ff] hover:underline font-medium"
                          >
                            {editingProfile ? 'Cancel Edit' : 'Edit Personal Details'}
                          </button>
                        )}
                      </div>
                      {editingProfile && (
                        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Preferred Name"
                              value={profileForm.preferredName}
                              onChange={(e) => setProfileForm({ ...profileForm, preferredName: e.target.value })}
                              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="text"
                              placeholder="Phone Number (+254...)"
                              value={profileForm.phoneNumber}
                              onChange={(e) => setProfileForm({ ...profileForm, phoneNumber: e.target.value })}
                              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                            <input
                              type="email"
                              placeholder="Personal Email"
                              value={profileForm.personalEmail}
                              onChange={(e) => setProfileForm({ ...profileForm, personalEmail: e.target.value })}
                              className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPatch(`/api/v1/employees/${currentEmp.id}`, {
                                  ...(profileForm.preferredName ? { preferredName: profileForm.preferredName } : {}),
                                  ...(profileForm.phoneNumber ? { phoneNumber: profileForm.phoneNumber } : {}),
                                  ...(profileForm.personalEmail ? { personalEmail: profileForm.personalEmail } : {}),
                                });
                                notify('Self-service profile update submitted.');
                                setEditingProfile(false);
                                onRefreshAll && onRefreshAll();
                              } catch (err) {
                                notify(err?.message || 'Failed to update profile', 'error');
                              }
                            }}
                            className="px-3 py-1.5 bg-[#0088ff] text-white rounded text-xs font-medium"
                          >
                            Save Changes
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                        <div className="flex justify-between sm:justify-start sm:gap-12">
                          <span className="text-slate-500 w-36">Employee ID</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.employeeNumber || '1'}
                          </span>
                        </div>
                        <div className="flex justify-between sm:justify-start sm:gap-12">
                          <span className="text-slate-500 w-36">Nick name</span>
                          <span className="font-medium text-slate-800">-</span>
                        </div>
                        <div className="flex justify-between sm:justify-start sm:gap-12">
                          <span className="text-slate-500 w-36">Full Name</span>
                          <span className="font-medium text-slate-800">
                            {getEmpName(currentEmp, currentUser?.fullName || 'Workspace User')}
                          </span>
                        </div>
                        <div className="flex justify-between sm:justify-start sm:gap-12">
                          <span className="text-slate-500 w-36">Email address</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.workEmail || currentEmp.email || currentUser?.email || '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Work Information */}
                    <div className="bg-white rounded-md border border-slate-200 p-5 text-xs">
                      <h4 className="font-semibold text-slate-800 mb-4">Work Information</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Department</span>
                          <span className="font-medium text-slate-800">
                            {getEmpDept(currentEmp, 'Management')}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Workspace Role</span>
                          <span className="font-medium text-slate-800">
                            {currentUser?.role || 'Staff'}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Location</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.location?.name || 'Nairobi, Kenya'}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Employment Type</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.employmentType || 'Permanent'}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Designation</span>
                          <span className="font-medium text-slate-800">
                            {getEmpTitle(currentEmp, currentUser?.role ? String(currentUser.role).replace(/_/g, ' ') : '-')}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Employee Status</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.status || 'Active'}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Date of Joining</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.hireDate
                              ? new Date(currentEmp.hireDate).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : '-'}
                          </span>
                        </div>
                        <div className="flex sm:gap-12">
                          <span className="text-slate-500 w-36">Onboarding Status</span>
                          <span className="font-medium text-slate-800">
                            {currentEmp.onboardingCompletedAt
                              ? 'Completed'
                              : currentEmp.status === 'PROBATION' ||
                                  (currentEmp.onboardingTasks || []).some(
                                    (t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETED' || t.status === 'WAIVED',
                                  )
                                ? 'In Progress'
                                : currentEmp.status === 'ONBOARDING'
                                  ? 'Triggered'
                                  : currentEmp.onboardingStatus || 'Completed'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Work Experience & Education Details Tables */}
                    <div className="bg-white rounded-md border border-slate-200 p-5 text-xs">
                      <h4 className="font-semibold text-slate-800 mb-3">Work experience</h4>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3 font-medium">Company Name</th>
                              <th className="py-2.5 px-3 font-medium">Job Title</th>
                              <th className="py-2.5 px-3 font-medium">From Date</th>
                              <th className="py-2.5 px-3 font-medium">To Date</th>
                              <th className="py-2.5 px-3 font-medium">Department / Practice</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Array.isArray(currentEmp.workExperience) && currentEmp.workExperience.length > 0 ? (
                              currentEmp.workExperience.map((exp, idx) => (
                                <tr key={idx}>
                                  <td className="py-2.5 px-3 text-slate-800">{exp.companyName || 'Ndakala Advisory LLP'}</td>
                                  <td className="py-2.5 px-3 text-slate-700">{exp.jobTitle || '-'}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{exp.fromDate || '-'}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{exp.toDate || 'Present'}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{exp.description || '-'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td className="py-2.5 px-3 text-slate-800">Ndakala Advisory LLP</td>
                                <td className="py-2.5 px-3 text-slate-700">
                                  {getEmpTitle(currentEmp, currentUser?.role ? String(currentUser.role).replace(/_/g, ' ') : '-')}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">
                                  {currentEmp.hireDate
                                    ? new Date(currentEmp.hireDate).toLocaleDateString('en-GB', {
                                        day: '2-digit',
                                        month: 'short',
                                        year: 'numeric',
                                      })
                                    : '-'}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600">Present</td>
                                <td className="py-2.5 px-3 text-slate-600">
                                  {getEmpDept(currentEmp, 'Advisory')}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-white rounded-md border border-slate-200 p-5 text-xs">
                      <h4 className="font-semibold text-slate-800 mb-3">Education Details</h4>
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3 font-medium">Institute Name</th>
                              <th className="py-2.5 px-3 font-medium">Degree/Diploma</th>
                              <th className="py-2.5 px-3 font-medium">Specialization</th>
                              <th className="py-2.5 px-3 font-medium">Date of Completion</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Array.isArray(currentEmp.education) && currentEmp.education.length > 0 ? (
                              currentEmp.education.map((edu, idx) => (
                                <tr key={idx}>
                                  <td className="py-2.5 px-3 text-slate-800">{edu.instituteName || '-'}</td>
                                  <td className="py-2.5 px-3 text-slate-700">{edu.degree || '-'}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{edu.specialization || '-'}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{edu.completionDate || '-'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="py-4 px-3 text-center text-slate-400">
                                  No education records uploaded
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* -------- INNER TAB 4: APPROVALS -------- */}
                {innerTab === 'approvals' && (
                  <div className="bg-white rounded-md border border-slate-200 p-6">
                    {pendingLeaveApprovals.length === 0 ? (
                      <NdakalaEmptyState
                        variant="approval"
                        title="All set! No requests pending approval"
                        actionLabel="View Task Inbox"
                        onAction={() => setActiveTab && setActiveTab('tasks', 'tasks', 'tasks')}
                      />
                    ) : (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-slate-800 mb-2">
                          Pending Leave Requests ({pendingLeaveApprovals.length})
                        </h4>
                        {pendingLeaveApprovals.map((req) => (
                          <div
                            key={req.id}
                            className="p-3.5 rounded border border-slate-200 flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-slate-800">
                                {req.employee?.fullName ||
                                  (req.employee
                                    ? `${req.employee.firstName || ''} ${req.employee.lastName || ''}`.trim()
                                    : '') ||
                                  empNameMap[req.employeeId] ||
                                  req.employeeId}{' '}
                                — {req.leaveType?.name || req.leaveTypeCode || 'Annual Leave'}
                              </p>
                              <p className="text-slate-500 mt-0.5">
                                {req.startDate?.slice(0, 10)} to {req.endDate?.slice(0, 10)} (
                                {req.workingDaysDeducted ?? req.daysRequested ?? req.chargeableDays ?? 1} days)
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onApproveLeave && onApproveLeave(req.id)}
                                className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-medium"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => onRejectLeave && onRejectLeave(req.id)}
                                className="px-3 py-1 bg-white border border-rose-300 text-rose-600 hover:bg-rose-50 rounded text-xs font-medium"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* -------- INNER TAB 5: LEAVE / FILES / MODULE SHORTCUTS -------- */}
                {innerTab !== 'activities' &&
                  innerTab !== 'feeds' &&
                  innerTab !== 'profile' &&
                  innerTab !== 'approvals' && (
                    <div className="bg-white rounded-md border border-slate-200 p-6">
                      {innerTab === 'leave' && leaveRequests.length === 0 ? (
                        <NdakalaEmptyState
                          variant="approval"
                          title="No leave requests submitted yet"
                          subtitle="Submit annual, sick, or compassionate leave directly to your manager."
                          actionLabel="Apply Leave"
                          onAction={onOpenLeaveModal}
                        />
                      ) : innerTab === 'leave' ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-slate-800">
                              Leave Summary ({leaveRequests.length} request{leaveRequests.length === 1 ? '' : 's'})
                            </h4>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={onOpenLeaveModal}
                                className="px-3 py-1 bg-[#0088ff] text-white rounded text-xs font-medium"
                              >
                                Apply Leave
                              </button>
                              <button
                                type="button"
                                onClick={() => setActiveTab && setActiveTab('inbox', 'mydata')}
                                className="px-3 py-1 border border-slate-300 text-slate-700 rounded text-xs font-medium hover:bg-slate-50"
                              >
                                Open Leave Module →
                              </button>
                            </div>
                          </div>
                          {leaveRequests.slice(0, 5).map((req) => (
                            <div key={req.id} className="p-3 border border-slate-200 rounded flex items-center justify-between text-xs">
                              <div>
                                <p className="font-semibold text-slate-800">
                                  {req.leaveType?.name || req.leaveTypeCode || 'Leave'} — {req.startDate?.slice(0, 10)} to {req.endDate?.slice(0, 10)}
                                </p>
                                <p className="text-[11px] text-slate-500">{req.workingDaysDeducted ?? req.daysRequested ?? req.chargeableDays ?? 1} day(s) • Status: {req.status}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                                {req.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : innerTab === 'files' && policies.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-semibold text-slate-800">
                              Organization Policy Files ({policies.length})
                            </h4>
                            <button
                              type="button"
                              onClick={() => setActiveTab && setActiveTab('admin', 'files', 'documents')}
                              className="text-xs text-[#0088ff] hover:underline font-medium"
                            >
                              Open Document Vault →
                            </button>
                          </div>
                          {policies.map((pol) => {
                            const matchedAck = policyAcks.find(
                              (a) => a.policyVersion?.policyId === pol.id || a.policyVersion?.policy?.id === pol.id
                            );
                            return (
                              <div
                                key={pol.id}
                                className="p-3 border border-slate-200 rounded flex items-center justify-between text-xs"
                              >
                                <div>
                                  <p className="font-semibold text-slate-800">{pol.title}</p>
                                  <p className="text-slate-500 text-[11px]">
                                    {pol.category} • Version {pol.versions?.[0]?.versionNumber || pol.version || '1.0'}
                                  </p>
                                </div>
                                {matchedAck?.status === 'PENDING' ? (
                                  <button
                                    type="button"
                                    onClick={() => onAcknowledgePolicy && onAcknowledgePolicy(matchedAck.id)}
                                    className="px-3 py-1 bg-[#0088ff] text-white rounded text-xs"
                                  >
                                    Acknowledge
                                  </button>
                                ) : matchedAck?.status === 'ACKNOWLEDGED' ? (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded text-[11px] font-semibold">
                                    Acknowledged ✓
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab && setActiveTab('admin', 'files', 'documents')}
                                    className="px-3 py-1 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-xs"
                                  >
                                    View Policy →
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : innerTab === 'attendance' ? (
                        <div className="space-y-3 text-xs">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-slate-800">Attendance Logs ({punches.length} recent entries)</h4>
                            <button
                              type="button"
                              onClick={() => setActiveTab && setActiveTab('attendance', 'mydata')}
                              className="px-3 py-1 bg-[#0088ff] text-white rounded font-medium"
                            >
                              Open Attendance →
                            </button>
                          </div>
                          {punches.length === 0 ? (
                            <p className="text-slate-500">Use Check-In in the left profile card or open Attendance to view shift logs.</p>
                          ) : (
                            punches.slice(0, 5).map((p, idx) => {
                              const secs = Number(p.totalSecs || 0);
                              const dur = secs > 0 ? `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m` : p.clockOutAt ? '0h 0m' : 'Active';
                              return (
                                <div key={p.id || idx} className="p-2.5 border border-slate-200 rounded flex justify-between items-center">
                                  <div>
                                    <span className="font-mono font-medium text-slate-800">{p.workDate}</span>
                                    <span className="text-slate-500 ml-2">
                                      {p.clockInAt ? new Date(p.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                      {' → '}
                                      {p.clockOutAt ? new Date(p.clockOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Checked In'}
                                    </span>
                                  </div>
                                  <span className={`font-mono text-[11px] font-semibold ${p.clockOutAt ? 'text-slate-600' : 'text-emerald-600'}`}>{dur}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-6 space-y-3">
                          <h4 className="text-sm font-semibold text-slate-800 capitalize">
                            {MORE_OVERVIEW_TABS.find((t) => t.id === innerTab)?.label || innerTab} Workspace
                          </h4>
                          <p className="text-xs text-slate-500 max-w-md mx-auto">
                            {innerTab === 'timelogs' || innerTab === 'timesheets'
                              ? 'Log billable project hours, submit weekly timesheets, and track Kenyan project profitability.'
                              : innerTab === 'jobs' || innerTab === 'careerhistory'
                              ? 'Review active employee records, role history, and HR onboarding transitions.'
                              : innerTab === 'goals' || innerTab === 'feedback'
                              ? 'Manage KRAs, OKRs, 360-degree appraisals, and continuous feedback.'
                              : innerTab === 'hrprocess'
                              ? 'Track active HR approvals, exit/separation workflows, and statutory tasks.'
                              : 'Access your organization document vault and compliance acknowledgements.'}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (innerTab === 'timelogs' || innerTab === 'timesheets') {
                                setActiveTab && setActiveTab('timetracker', 'mydata');
                              } else if (innerTab === 'jobs' || innerTab === 'careerhistory') {
                                setActiveTab && setActiveTab('directory', 'employees');
                              } else if (innerTab === 'goals' || innerTab === 'feedback') {
                                setActiveTab && setActiveTab('performance', 'mydata', innerTab === 'goals' ? 'objectives' : null);
                              } else if (innerTab === 'hrprocess') {
                                setActiveTab && setActiveTab('tasks', 'tasks', 'tasks');
                              } else {
                                setActiveTab && setActiveTab('admin', 'files', 'documents');
                              }
                            }}
                            className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded"
                          >
                            Open {MORE_OVERVIEW_TABS.find((t) => t.id === innerTab)?.label || 'Module'} →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* ==================== SUB-TAB 2: DASHBOARD ==================== */}
        {subTab === 'dashboard' && (
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Birthday */}
            {isWidgetEnabled('birthday') && (() => {
              const todayMd = new Date().toISOString().slice(5, 10);
              const birthdayEmps = employees.filter((e) => (e.dateOfBirth || '').slice(5, 10) === todayMd);
              return (
                <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[190px]">
                  <h4 className="text-xs font-semibold text-slate-800 mb-3">Birthday</h4>
                  {birthdayEmps.length > 0 ? (
                    <div className="space-y-2">
                      {birthdayEmps.slice(0, 2).map((b, i) => (
                        <div key={b.id || i} className="p-3 rounded-md bg-slate-50/70 border border-slate-100 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center">
                            {(b.fullName || 'NB').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="text-xs min-w-0">
                            <p className="font-medium text-slate-800 truncate">
                              {b.employeeNumber || `NDK-${i + 1}`} - {b.fullName}
                            </p>
                            <p className="text-slate-500 text-[11px] truncate">
                              {getEmpTitle(b)} - {getEmpDept(b)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                      No birthdays today
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 2. New Hires */}
            {isWidgetEnabled('newhires') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[190px]">
                <h4 className="text-xs font-semibold text-slate-800 mb-3">New Hires</h4>
                {employees.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-xs text-slate-400">
                    No employee records available
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {[...employees]
                      .sort((a, b) => String(b.hireDate || '').localeCompare(String(a.hireDate || '')))
                      .slice(0, 3)
                      .map((e, i) => ({
                        id: e.id || i,
                        code: e.employeeNumber || `NDK-${i + 1}`,
                        name: e.fullName || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Employee',
                        role: `${getEmpTitle(e)} - ${getEmpDept(e)}`,
                        phone: e.phoneNumber || e.phone || 'Corporate Directory',
                      }))
                      .map((nh) => (
                        <div
                          key={nh.id}
                          className="p-2.5 rounded-md bg-slate-50/70 border border-slate-100 flex items-center gap-3"
                        >
                          <div className="w-9 h-9 rounded-lg bg-blue-100 text-[#0088ff] font-bold text-xs flex items-center justify-center">
                            {nh.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)}
                          </div>
                          <div className="text-xs min-w-0">
                            <p className="font-medium text-slate-800 truncate">
                              {nh.code} - {nh.name}
                            </p>
                            <p className="text-slate-500 text-[11px] truncate">{nh.role}</p>
                            <p className="text-slate-500 text-[11px] mt-0.5">{nh.phone}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* 3. Favorites */}
            {isWidgetEnabled('favorites') && (() => {
              const favPool = favoriteEmpIds.length > 0
                ? employees.filter((e) => favoriteEmpIds.includes(e.id))
                : employees.slice(0, 4);
              return (
                <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[190px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-semibold text-slate-800">Favorites</h4>
                    <span className="text-[11px] text-slate-400">Click ★ to pin</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {employees.slice(0, 6).map((e, i) => {
                      const isPinned = favoriteEmpIds.includes(e.id) || (favoriteEmpIds.length === 0 && i < 2);
                      const fullName = e.fullName || `${e.firstName || ''} ${e.lastName || ''}`.trim() || 'Employee';
                      return (
                        <div key={e.id || i} className="flex items-center justify-between py-1 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                              {fullName.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-800 truncate">
                                <span className="text-slate-400">{e.employeeNumber || `NDK-${i + 1}`}</span> - {fullName}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">{e.phoneNumber || e.phone || e.workEmail || e.email}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleFavoriteEmployee(e.id)}
                            title={isPinned ? 'Unpin favorite' : 'Pin favorite'}
                            className="p-1 rounded hover:bg-slate-100"
                          >
                            <Star
                              size={14}
                              className={isPinned ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}
                            />
                          </button>
                        </div>
                      );
                    })}
                    {favPool.length === 0 && employees.length === 0 && (
                      <div className="h-28 flex items-center justify-center text-xs text-slate-400">
                        No colleagues found
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* 4. Quick Links */}
            {isWidgetEnabled('quicklinks') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-800">Quick Links</h4>
                  <button
                    type="button"
                    onClick={() => setAddingQuickLink((v) => !v)}
                    className="text-[11px] font-medium text-[#0088ff] hover:underline"
                  >
                    {addingQuickLink ? 'Close' : '+ Add Link'}
                  </button>
                </div>
                {addingQuickLink && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const chosen = QUICK_LINK_TARGETS[Number(quickLinkForm.targetIndex) || 0] || QUICK_LINK_TARGETS[0];
                      const nextLabel = (quickLinkForm.label || chosen.label).trim();
                      if (!nextLabel) return;
                      const nextLinks = [
                        ...quickLinks,
                        { id: `ql-${Date.now()}`, label: nextLabel, ...chosen },
                      ];
                      setQuickLinks(nextLinks);
                      setQuickLinkForm({ label: '', targetIndex: 0 });
                      setAddingQuickLink(false);
                      try {
                        await apiPut('/api/v1/workspace/ui-config', {
                          key: 'WORKSPACE_FAVORITES',
                          scope: 'USER',
                          value: { ids: favoriteEmpIds, quickLinks: nextLinks },
                        });
                        notify('Quick Link added & saved.');
                      } catch (err) {
                        notify(err?.message || 'Unable to save Quick Link', 'error');
                      }
                    }}
                    className="mb-2.5 p-2 bg-slate-50 border border-slate-200 rounded space-y-1.5 text-[11px]"
                  >
                    <input
                      type="text"
                      placeholder="Link label (optional)"
                      value={quickLinkForm.label}
                      onChange={(e) => setQuickLinkForm({ ...quickLinkForm, label: e.target.value })}
                      className="w-full px-2 py-1 border border-slate-300 rounded bg-white"
                    />
                    <div className="flex gap-1.5">
                      <select
                        value={quickLinkForm.targetIndex}
                        onChange={(e) => setQuickLinkForm({ ...quickLinkForm, targetIndex: e.target.value })}
                        className="flex-1 px-2 py-1 border border-slate-300 rounded bg-white"
                      >
                        {QUICK_LINK_TARGETS.map((t, idx) => (
                          <option key={t.label} value={idx}>{t.label}</option>
                        ))}
                      </select>
                      <button type="submit" className="px-2.5 py-1 bg-[#0088ff] text-white rounded font-medium">
                        Save
                      </button>
                    </div>
                  </form>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {quickLinks.map((ql) => (
                    <div
                      key={ql.id}
                      className="group relative flex items-center border border-slate-200 hover:border-[#0088ff] hover:bg-blue-50/40 rounded overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (ql.actionType === 'modal_leave') onOpenLeaveModal && onOpenLeaveModal();
                          else if (ql.actionType === 'modal_payslip') onOpenPayslipModal && onOpenPayslipModal();
                          else if (setActiveTab && ql.tab) setActiveTab(ql.tab, ql.topTab || null, ql.subHint || null);
                        }}
                        className="flex-1 p-2 text-left font-medium text-slate-700 truncate pr-6"
                      >
                        {ql.label}
                      </button>
                      {quickLinks.length > 1 && (
                        <button
                          type="button"
                          title="Remove Quick Link"
                          aria-label={`Remove ${ql.label}`}
                          onClick={async () => {
                            const nextLinks = quickLinks.filter((x) => x.id !== ql.id);
                            setQuickLinks(nextLinks);
                            try {
                              await apiPut('/api/v1/workspace/ui-config', {
                                key: 'WORKSPACE_FAVORITES',
                                scope: 'USER',
                                value: { ids: favoriteEmpIds, quickLinks: nextLinks },
                              });
                              notify('Quick Link removed.');
                            } catch (err) {
                              notify(err?.message || 'Unable to update Quick Links', 'error');
                            }
                          }}
                          className="absolute right-1.5 text-slate-400 hover:text-rose-500 p-0.5 text-[11px]"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Announcements */}
            {isWidgetEnabled('announcements') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-800">Announcements</h4>
                  <button
                    type="button"
                    onClick={() => {
                      setSubTab('overview');
                      setInnerTab('feeds');
                    }}
                    className="text-[11px] text-[#0088ff] hover:underline"
                  >
                    Post Feed
                  </button>
                </div>
                {feedsList.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                    No Announcements
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {feedsList.slice(0, 3).map((f) => (
                      <div key={f.id} className="p-2 rounded bg-slate-50 border border-slate-100">
                        <p className="font-medium text-slate-800 line-clamp-2">{f.content}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{f.author} • {f.type}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 6. Lop Summary */}
            {isWidgetEnabled('lopsummary') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <h4 className="text-xs font-semibold text-slate-800">Lop Summary</h4>
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  {payslips.length > 0
                    ? `${payslips.length} Payslip(s) processed`
                    : 'No pay period is configured'}
                </div>
              </div>
            )}

            {/* 7. Leave Report */}
            {isWidgetEnabled('leavereport') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <h4 className="text-xs font-semibold text-slate-800">Leave Report</h4>
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  {leaveBalances.length > 0
                    ? `${leaveBalances.length} Leave Entitlements Active`
                    : 'No reports illustrated yet'}
                </div>
              </div>
            )}

            {/* 8. Upcoming Holidays */}
            {isWidgetEnabled('upcomingholidays') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <h4 className="text-xs font-semibold text-slate-800">Upcoming Holidays</h4>
                {holidays.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                    No Data Found
                  </div>
                ) : (
                  <div className="mt-2 space-y-1.5 text-xs">
                    {holidays.slice(0, 3).map((h) => (
                      <div key={h.id} className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-700 font-medium">{h.name}</span>
                        <span className="text-slate-400">{h.date?.slice(0, 10)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 9. My Pending Tasks */}
            {isWidgetEnabled('pendingtasks') && (() => {
              const openOnboarding = myOnboardingTasks.filter(
                (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS',
              );
              const totalOpen = tasks.length + openOnboarding.length;
              return (
                <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-slate-800">My Pending Tasks</h4>
                    {totalOpen > 0 && (
                      <span className="text-[11px] font-medium text-[#0088ff]">{totalOpen} open</span>
                    )}
                  </div>
                  {totalOpen === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                      There are no tasks available
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {openOnboarding.slice(0, 4).map((t) => (
                        <div key={t.id} className="p-2 border border-slate-100 rounded bg-slate-50 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{t.taskTitle}</p>
                            <p className="text-[11px] text-slate-500">
                              {t.employee ? `${t.employee.firstName} ${t.employee.lastName} • ` : ''}{t.status}
                            </p>
                          </div>
                          {!t.evidenceRequired && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/onboarding-tasks/${t.id}`, {
                                    status: 'COMPLETED',
                                    completionNotes: 'Completed from My Pending Tasks widget',
                                  });
                                  notify(`Completed: ${t.taskTitle}`);
                                  await refreshMyOnboardingTasks();
                                  onRefreshAll && onRefreshAll();
                                } catch (err) {
                                  notify(err?.message || 'Unable to complete task', 'error');
                                }
                              }}
                              className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] shrink-0"
                            >
                              Complete
                            </button>
                          )}
                        </div>
                      ))}
                      {tasks.length > 0 && (
                        <p className="text-[11px] text-slate-500">{tasks.length} workflow approval task(s) pending</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 10. My Files (06:08 of hr.webm) */}
            {isWidgetEnabled('myfiles') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[190px] flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-800">My Files</h4>
                  <span className="text-[11px] text-slate-400">
                    Total Files : {policies.length}
                  </span>
                </div>
                <div className="flex items-center justify-center mb-3">
                  <div className="inline-flex rounded border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setFilesWidgetTab('org')}
                      className={`px-3 py-1 rounded ${
                        filesWidgetTab === 'org'
                          ? 'bg-white text-[#0088ff] border border-[#0088ff] font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      Organization Files
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilesWidgetTab('emp')}
                      className={`px-3 py-1 rounded ${
                        filesWidgetTab === 'emp'
                          ? 'bg-white text-[#0088ff] border border-[#0088ff] font-medium'
                          : 'text-slate-500'
                      }`}
                    >
                      Employee Files
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  {policies.length === 0 ? 'No Files Found' : `${policies.length} Policy File(s)`}
                </div>
              </div>
            )}

            {/* 11. Work Anniversary */}
            {isWidgetEnabled('workanniversary') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <h4 className="text-xs font-semibold text-slate-800">Work Anniversary</h4>
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  No work anniversaries today
                </div>
              </div>
            )}

            {/* 12. Wedding Anniversary */}
            {isWidgetEnabled('weddinganniversary') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <h4 className="text-xs font-semibold text-slate-800">Wedding Anniversary</h4>
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                  No wedding anniversaries today
                </div>
              </div>
            )}

            {/* 13. On Leave Today */}
            {isWidgetEnabled('onleavetoday') && (() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              const onLeaveToday = leaveRequests.filter(
                (r) =>
                  r.status === 'APPROVED' &&
                  String(r.startDate || '').slice(0, 10) <= todayStr &&
                  String(r.endDate || '').slice(0, 10) >= todayStr
              );
              return (
                <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                  <h4 className="text-xs font-semibold text-slate-800 mb-2">On Leave Today</h4>
                  {onLeaveToday.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                      No approved absences scheduled for today
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {onLeaveToday.slice(0, 4).map((r) => (
                        <div key={r.id} className="p-2 rounded bg-amber-50/70 border border-amber-100 flex justify-between">
                          <span className="font-medium text-slate-800">{r.employee?.fullName || r.employeeId}</span>
                          <span className="text-[11px] text-amber-700">{r.leaveType?.name || r.leaveTypeCode || 'Leave'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 14. Employee Engagement */}
            {isWidgetEnabled('engagement') && (
              <div className="bg-white rounded-md border border-slate-200 p-4 min-h-[170px] flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-slate-800">Employee Engagement</h4>
                  <span className="text-[11px] text-slate-500">Pending : {surveySummary.pending}</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                  <p>
                    {surveySummary.count === 0
                      ? 'Launch pulse surveys and track participation'
                      : `${surveySummary.count} active survey(s), ${surveySummary.pending} awaiting response`}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab && setActiveTab('engagement', 'engagement', 'engagement')}
                    className="px-3 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                  >
                    Open Engagement Surveys
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== SUB-TAB 3: CALENDAR ==================== */}
        {subTab === 'calendar' && <div className="p-5">{renderCalendarGrid()}</div>}

        {/* ==================== SUB-TAB 4: DELEGATION ==================== */}
        {subTab === 'delegation' && (
          <div className="p-5">
            <div className="bg-white rounded-md border border-slate-200 min-h-[480px] flex flex-col items-center justify-center p-6">
              {delegations.length === 0 ? (
                <NdakalaEmptyState
                  title="No delegations added currently."
                  subtitle="Delegation lets you reassign approvals from one employee to another for a specific time frame."
                  actionLabel="Add Delegation"
                  onAction={() => setDelegationDrawerOpen(true)}
                />
              ) : (
                <div className="w-full max-w-4xl self-start">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-semibold text-slate-800">Active Delegations</h4>
                    <button
                      type="button"
                      onClick={() => setDelegationDrawerOpen(true)}
                      className="px-3.5 py-1.5 bg-[#0088ff] text-white text-xs font-medium rounded"
                    >
                      Add Delegation
                    </button>
                  </div>
                  <table className="w-full text-left border-collapse text-xs border border-slate-200">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3">Delegator</th>
                        <th className="py-2.5 px-3">Delegatee</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Date Range</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {delegations.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2.5 px-3 font-medium text-slate-800">{d.delegator}</td>
                          <td className="py-2.5 px-3 text-slate-700">{d.delegatee}</td>
                          <td className="py-2.5 px-3 text-slate-600">{d.type}</td>
                          <td className="py-2.5 px-3 text-slate-600">{d.dateRange}</td>
                          <td className="py-2.5 px-3 text-slate-500">{d.description || '-'}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => handleRevokeDelegation(d.id)}
                              className="text-rose-600 hover:underline text-[11px]"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}

        {/* ==================== CONTEXT 2: TEAM (topContextTab === 'team') ==================== */}
        {topContextTab === 'team' && (() => {
          const teamSearchLower = teamSearch.trim().toLowerCase();
          const filteredReportees = reporteesList.filter(
            (r) =>
              !teamSearchLower ||
              r.name.toLowerCase().includes(teamSearchLower) ||
              r.code.toLowerCase().includes(teamSearchLower) ||
              r.dept.toLowerCase().includes(teamSearchLower)
          );
          const empNameMap = Object.fromEntries(employees.map((e) => [e.id, getEmpName(e)]));
          const deptGroups = (teamDeptFilter === 'ALL' ? uniqueDeptNames : uniqueDeptNames.filter((d) => d === teamDeptFilter)).map(
            (deptName) => {
              const matchedDept = orgDepartments.find((d) => d.name === deptName);
              const members = employees.filter((e) => getEmpDept(e) === deptName);
              return { name: deptName, code: matchedDept?.code || deptName.slice(0, 4).toUpperCase(), members };
            }
          );

          return (
            <>
              {teamSubTab === 'teamspace' && (
                <div>
                  <BotanicalBanner />
                  <div className="px-5 pb-8 flex flex-col lg:flex-row gap-4 items-start -mt-14 relative z-10">
                    {/* Left Team Summary & Direct Reportees Rail */}
                    <div className="w-full lg:w-[270px] flex-shrink-0 space-y-4">
                      <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-5 text-center">
                        <div className="w-16 h-16 rounded-xl bg-emerald-700 text-white border-4 border-white shadow-sm mx-auto -mt-11 flex items-center justify-center">
                          <Users size={26} />
                        </div>
                        <h3 className="mt-2.5 text-xs font-semibold text-slate-900">
                          {getEmpDept(currentEmp)} Team
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Lead: {getEmpName(currentEmp)}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-1.5 py-2.5 border-y border-slate-100 text-center">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{reporteesList.length}</p>
                            <p className="text-[10px] text-slate-400">Members</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-amber-600">{pendingLeaveApprovals.length}</p>
                            <p className="text-[10px] text-slate-400">Approvals</p>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-emerald-600">{leaveRequests.filter((r) => r.status === 'APPROVED').length}</p>
                            <p className="text-[10px] text-slate-400">On Leave</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab && setActiveTab('attendance', 'team')}
                          className="mt-3 w-full py-1.5 border border-[#0088ff] text-[#0088ff] hover:bg-blue-50 rounded text-xs font-medium transition-colors"
                        >
                          Open Team Attendance →
                        </button>
                      </div>

                      <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-semibold text-slate-800">Reportees ({reporteesList.length})</h4>
                          <button
                            type="button"
                            onClick={() => setTeamSubTab('reportees')}
                            className="text-[11px] text-[#0088ff] hover:underline font-medium"
                          >
                            View All
                          </button>
                        </div>
                        {reporteesList.length === 0 ? (
                          <p className="text-xs text-slate-400">No direct reportees assigned yet.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {reporteesList.slice(0, 5).map((r) => {
                              const isFav = favoriteEmpIds.includes(r.id);
                              return (
                                <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-md bg-blue-50 text-[#0088ff] font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                      {getEmpInitials(r.name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-800 truncate">{r.name}</p>
                                      <p className="text-[10.5px] text-slate-400 truncate">{r.dept}</p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => toggleFavoriteEmployee(r.id)}
                                    title={isFav ? 'Unpin favorite' : 'Pin favorite'}
                                    className="p-1 rounded hover:bg-slate-100 flex-shrink-0"
                                  >
                                    <Star size={12} className={isFav ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Team Workspace Tabs */}
                    <div className="flex-1 min-w-0 space-y-4">
                      <div className="bg-white rounded-md border border-slate-200 shadow-2xs px-4 h-[44px] flex items-center justify-between">
                        <div className="flex items-center space-x-6 h-full overflow-x-auto text-xs">
                          {[
                            { id: 'wall', label: 'Team Wall' },
                            { id: 'approvals', label: `Team Approvals (${pendingLeaveApprovals.length})` },
                            { id: 'peers', label: `Team Peers (${reporteesList.length})` },
                            { id: 'leavesummary', label: 'Leave & Attendance Summary' },
                          ].map((tab) => {
                            const active = teamInnerTab === tab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                onClick={() => setTeamInnerTab(tab.id)}
                                className={`relative h-full flex items-center font-medium transition-colors whitespace-nowrap ${
                                  active ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <span>{tab.label}</span>
                                {active && (
                                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#0088ff] rounded-t" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {teamInnerTab === 'wall' && (
                        <div className="space-y-3">
                          <div className="bg-white rounded-md border border-slate-200 p-4">
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                publishWorkspaceFeed(feedCategory, feedInput, () => setFeedInput(''));
                              }}
                              className="flex items-center gap-3 pb-3 border-b border-slate-100"
                            >
                              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                {getEmpInitials(getEmpName(currentEmp))}
                              </div>
                              <select
                                value={feedCategory}
                                onChange={(e) => setFeedCategory(e.target.value)}
                                className="px-2 py-1 border border-slate-200 rounded text-[11px] bg-white text-slate-600"
                              >
                                <option value="STATUS">Team Update</option>
                                <option value="ANNOUNCEMENT">Announcement</option>
                                <option value="KUDOS">Kudos</option>
                              </select>
                              <input
                                type="text"
                                value={feedInput}
                                onChange={(e) => setFeedInput(e.target.value)}
                                placeholder="Share an update, milestone, or announcement with your team..."
                                className="flex-1 text-xs text-slate-700 focus:outline-none"
                              />
                              {feedInput.trim() && (
                                <button type="submit" className="px-3 py-1 bg-[#0088ff] text-white text-xs rounded font-medium">
                                  Post
                                </button>
                              )}
                            </form>
                            <div className="pt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                              <span>Showing {feedsList.length} live team &amp; organization feed item(s)</span>
                              <button
                                type="button"
                                onClick={() => setTopContextTab && setTopContextTab('organization')}
                                className="text-[#0088ff] hover:underline font-medium"
                              >
                                Open Organization Wall →
                              </button>
                            </div>
                          </div>

                          {feedsList.map((f) => (
                            <div key={f.id} className="bg-white rounded-md border border-slate-200 p-4 text-xs">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0088ff] font-bold flex items-center justify-center text-[11px]">
                                    {getEmpInitials(f.author)}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-800">{f.author}</p>
                                    <p className="text-[11px] text-slate-400">{f.time}</p>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                  {f.type}
                                </span>
                              </div>
                              <p className="mt-2.5 text-slate-700 leading-relaxed">{f.content}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {teamInnerTab === 'approvals' && (
                        <div className="bg-white rounded-md border border-slate-200 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-900">Pending Team Leave Approvals</h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Review requests submitted by team members or jump to the full Leave Tracker.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActiveTab && setActiveTab('inbox', 'team')}
                              className="text-xs font-medium text-[#0088ff] hover:underline"
                            >
                              Open Leave Tracker →
                            </button>
                          </div>
                          {pendingLeaveApprovals.length === 0 ? (
                            <NdakalaEmptyState
                              title="No pending team approvals"
                              subtitle="All submitted leave requests in your approval queue have been actioned."
                              actionLabel="Open Leave Tracker"
                              onAction={() => setActiveTab && setActiveTab('inbox', 'team')}
                            />
                          ) : (
                            <div className="space-y-3">
                              {pendingLeaveApprovals.map((req) => (
                                <div key={req.id} className="p-3.5 rounded-md border border-slate-200 flex items-center justify-between gap-4 text-xs">
                                  <div>
                                    <p className="font-semibold text-slate-800">
                                      {req.employee?.fullName || empNameMap[req.employeeId] || req.employeeId}
                                    </p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                      {req.leaveType?.name || req.leaveTypeCode || 'Leave'} • {String(req.startDate || '').slice(0, 10)} → {String(req.endDate || '').slice(0, 10)} ({req.daysRequested} days)
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => onApproveLeave && onApproveLeave(req.id)}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRejectLeave && onRejectLeave(req.id)}
                                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-medium"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {teamInnerTab === 'peers' && (
                        <div className="bg-white rounded-md border border-slate-200 p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-semibold text-slate-900">Team Members &amp; Direct Reportees</h4>
                            <button
                              type="button"
                              onClick={() => setActiveTab && setActiveTab('directory', 'employees')}
                              className="text-xs font-medium text-[#0088ff] hover:underline"
                            >
                              Open Full Directory →
                            </button>
                          </div>
                          {reporteesList.length === 0 ? (
                            <p className="text-xs text-slate-400">No reportees matched.</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {reporteesList.map((r) => (
                                <div key={r.id} className="p-3 rounded-md border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-3 text-xs">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-lg bg-[#0088ff]/10 text-[#0088ff] font-bold flex items-center justify-center text-xs flex-shrink-0">
                                      {getEmpInitials(r.name)}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-800 truncate">{r.code} - {r.name}</p>
                                      <p className="text-[11px] text-slate-500 truncate">{r.dept}</p>
                                      <p className="text-[10.5px] text-slate-400 mt-0.5">{r.phone}</p>
                                    </div>
                                  </div>
                                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold flex-shrink-0">
                                    {r.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {teamInnerTab === 'leavesummary' && (
                        <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4 text-xs">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-xs font-semibold text-slate-900">Team Leave &amp; Absence Activity</h4>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {leaveRequests.length} leave record(s) • {absences.length} unexpected absence notice(s)
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenLeaveModal && onOpenLeaveModal()}
                                className="px-3 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-[11px] font-medium"
                              >
                                + Apply Leave
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenAbsenceModal && onOpenAbsenceModal()}
                                className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium"
                              >
                                Log Absence
                              </button>
                            </div>
                          </div>
                          {leaveRequests.length === 0 ? (
                            <p className="text-slate-400 py-4 text-center">No leave requests recorded in the workspace yet.</p>
                          ) : (
                            <div className="overflow-x-auto border border-slate-200 rounded">
                              <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                                  <tr>
                                    <th className="py-2 px-3">Employee</th>
                                    <th className="py-2 px-3">Leave Type</th>
                                    <th className="py-2 px-3">Dates</th>
                                    <th className="py-2 px-3">Days</th>
                                    <th className="py-2 px-3">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {leaveRequests.slice(0, 8).map((lr) => (
                                    <tr key={lr.id}>
                                      <td className="py-2 px-3 font-medium text-slate-800">
                                        {lr.employee?.fullName ||
                                          (lr.employee
                                            ? `${lr.employee.firstName || ''} ${lr.employee.lastName || ''}`.trim()
                                            : '') ||
                                          empNameMap[lr.employeeId] ||
                                          lr.employeeId}
                                      </td>
                                      <td className="py-2 px-3 text-slate-600">{lr.leaveType?.name || lr.leaveTypeCode || 'Leave'}</td>
                                      <td className="py-2 px-3 text-slate-500">
                                        {String(lr.startDate || '').slice(0, 10)} → {String(lr.endDate || '').slice(0, 10)}
                                      </td>
                                      <td className="py-2 px-3 text-slate-700">{lr.workingDaysDeducted ?? lr.daysRequested ?? '-'}</td>
                                      <td className="py-2 px-3">
                                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                                          {lr.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {teamSubTab === 'reportees' && (
                <div className="p-5 max-w-6xl mx-auto">
                  <div className="bg-white rounded-md border border-slate-200 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Reportees &amp; Supervised Staff ({filteredReportees.length})</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Live directory scope linked to {getEmpName(currentEmp)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={teamSearch}
                            onChange={(e) => setTeamSearch(e.target.value)}
                            placeholder="Filter reportees..."
                            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs text-slate-700 focus:outline-none focus:border-[#0088ff]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab && setActiveTab('directory', 'employees')}
                          className="px-3 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-medium"
                        >
                          Employee Directory →
                        </button>
                      </div>
                    </div>
                    {filteredReportees.length === 0 ? (
                      <NdakalaEmptyState
                        title="No matching reportees"
                        subtitle="Adjust your search filter or open the full Employee Directory to manage reporting lines."
                        actionLabel="Clear Search"
                        onAction={() => setTeamSearch('')}
                      />
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2.5 px-3">ID</th>
                              <th className="py-2.5 px-3">Name</th>
                              <th className="py-2.5 px-3">Designation &amp; Department</th>
                              <th className="py-2.5 px-3">Contact</th>
                              <th className="py-2.5 px-3">Status</th>
                              <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredReportees.map((r) => {
                              const isFav = favoriteEmpIds.includes(r.id);
                              return (
                                <tr key={r.id} className="hover:bg-slate-50/70">
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{r.code}</td>
                                  <td className="py-2.5 px-3 font-semibold text-slate-800">{r.name}</td>
                                  <td className="py-2.5 px-3 text-slate-600">{r.dept}</td>
                                  <td className="py-2.5 px-3 text-slate-500">{r.phone}</td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                                      {r.status}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right space-x-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleFavoriteEmployee(r.id)}
                                      className="inline-flex items-center p-1 rounded hover:bg-slate-100"
                                      title="Pin Favorite"
                                    >
                                      <Star size={13} className={isFav ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setActiveTab && setActiveTab('inbox', 'team')}
                                      className="text-[#0088ff] hover:underline text-[11px] font-medium"
                                    >
                                      Leave Requests
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {teamSubTab === 'deptdirectory' && (
                <div className="p-5 max-w-6xl mx-auto space-y-4">
                  <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Department Directory</h3>
                      <p className="text-xs text-slate-500">Live roster grouped across {uniqueDeptNames.length} department(s)</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTeamDeptFilter('ALL')}
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${
                          teamDeptFilter === 'ALL'
                            ? 'bg-[#0088ff] text-white border-[#0088ff]'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        All Departments
                      </button>
                      {uniqueDeptNames.map((dName) => (
                        <button
                          key={dName}
                          type="button"
                          onClick={() => setTeamDeptFilter(dName)}
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            teamDeptFilter === dName
                              ? 'bg-[#0088ff] text-white border-[#0088ff]'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {dName}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {deptGroups.map((grp) => (
                      <div key={grp.name} className="bg-white rounded-md border border-slate-200 p-4">
                        <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                          <div>
                            <h4 className="text-xs font-semibold text-slate-900">{grp.name}</h4>
                            <p className="text-[10.5px] text-slate-400">Code: {grp.code}</p>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[11px] font-semibold">
                            {grp.members.length} Staff
                          </span>
                        </div>
                        {grp.members.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">No employees assigned to this department yet.</p>
                        ) : (
                          <div className="space-y-2.5">
                            {grp.members.map((m) => (
                              <div key={m.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                    {getEmpInitials(getEmpName(m))}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium text-slate-800 truncate">{getEmpName(m)}</p>
                                    <p className="text-[10.5px] text-slate-400 truncate">{getEmpTitle(m)} • {m.workEmail || m.email || '-'}</p>
                                  </div>
                                </div>
                                <span className="text-[10.5px] text-slate-500 flex-shrink-0">{m.phoneNumber || m.phone || '-'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {teamSubTab === 'teamcalendar' && (
                <div className="p-5 space-y-4">
                  <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <h4 className="font-semibold text-slate-900">Team Leave &amp; Holiday Calendar</h4>
                      <p className="text-[11px] text-slate-500">
                        {holidays.length} Kenya gazetted holiday(s) • {leaveRequests.filter((r) => r.status === 'APPROVED').length} approved leave(s)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab && setActiveTab('inbox', 'holidays')}
                      className="text-[#0088ff] hover:underline font-medium"
                    >
                      Manage Holidays &amp; Leave →
                    </button>
                  </div>
                  {renderCalendarGrid()}
                </div>
              )}
            </>
          );
        })()}

        {/* ==================== CONTEXT 3: ORGANIZATION (topContextTab === 'organization') ==================== */}
        {topContextTab === 'organization' && (() => {
          const orgSearchLower = orgSearch.trim().toLowerCase();
          const filteredOrgEmps = employees.filter((e) => {
            const dept = getEmpDept(e);
            const matchesDept = orgDeptFilter === 'ALL' || dept === orgDeptFilter;
            const hay = `${getEmpName(e)} ${getEmpTitle(e)} ${dept} ${e.workEmail || e.email || ''} ${e.employeeNumber || ''}`.toLowerCase();
            return matchesDept && (!orgSearchLower || hay.includes(orgSearchLower));
          });
          const empIdSet = new Set(employees.map((e) => e.id));
          const rootLeaders = employees.filter((e) => !e.managerId || !empIdSet.has(e.managerId));

          return (
            <>
              {orgSubTab === 'announcements' && (
                <div>
                  <BotanicalBanner />
                  <div className="px-5 pb-8 space-y-4 -mt-14 relative z-10 max-w-6xl mx-auto">
                    {/* Organization Identity Banner Card */}
                    <div className="bg-white rounded-md border border-slate-200 shadow-2xs p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-xl bg-[#191f3a] flex items-center justify-center shadow-sm flex-shrink-0">
                          <svg viewBox="0 0 36 36" className="w-9 h-9">
                            <circle cx="18" cy="10" r="4.5" fill="#ff5252" />
                            <circle cx="10" cy="15" r="3.5" fill="#ffca28" />
                            <circle cx="26" cy="15" r="3.5" fill="#26a69a" />
                            <path d="M11 27c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="#42a5f5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                            <path d="M5 28c0-2.6 2-4.6 4.8-4.6" stroke="#ffca28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                            <path d="M31 28c0-2.6-2-4.6-4.8-4.6" stroke="#26a69a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-base font-bold text-slate-900">{orgProfile.legalName}</h2>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {orgProfile.address} • {orgProfile.email} • {orgProfile.phone}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] font-medium text-slate-600">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff]">{employees.length} Active Staff</span>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">{orgDepartments.length || uniqueDeptNames.length} Departments</span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">{orgLocations.length || 1} Location(s)</span>
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700">{policies.length} Policies</span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab && setActiveTab('hardening', 'orgsettings')}
                        className="px-3.5 py-2 border border-slate-300 hover:border-[#0088ff] text-slate-700 hover:text-[#0088ff] rounded text-xs font-medium inline-flex items-center gap-1.5 self-start md:self-center flex-shrink-0"
                      >
                        <Settings size={13} />
                        <span>Organization Settings</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                      {/* Announcements Feed Composer + Stream */}
                      <div className="lg:col-span-8 space-y-3">
                        <div className="bg-white rounded-md border border-slate-200 p-4">
                          <h4 className="text-xs font-semibold text-slate-900 mb-2.5">Publish Organization Announcement</h4>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              publishWorkspaceFeed('ANNOUNCEMENT', orgAnnouncementInput, () => setOrgAnnouncementInput(''));
                            }}
                            className="flex items-center gap-2.5"
                          >
                            <input
                              type="text"
                              value={orgAnnouncementInput}
                              onChange={(e) => setOrgAnnouncementInput(e.target.value)}
                              placeholder="Broadcast an official company-wide notice or policy reminder..."
                              className="flex-1 px-3 py-2 border border-slate-200 rounded text-xs text-slate-700 focus:outline-none focus:border-[#0088ff]"
                            />
                            <button
                              type="submit"
                              disabled={!orgAnnouncementInput.trim()}
                              className="px-3.5 py-2 bg-[#0088ff] hover:bg-[#0073d9] disabled:opacity-50 text-white text-xs font-medium rounded inline-flex items-center gap-1.5"
                            >
                              <Send size={12} />
                              <span>Publish</span>
                            </button>
                          </form>
                        </div>

                        {feedsList.map((f) => (
                          <div key={f.id} className="bg-white rounded-md border border-slate-200 p-4 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 font-bold flex items-center justify-center text-[11px]">
                                  {getEmpInitials(f.author)}
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-800">{f.author}</p>
                                  <p className="text-[11px] text-slate-400">{f.time}</p>
                                </div>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  f.type === 'Announcement'
                                    ? 'bg-blue-50 text-[#0088ff]'
                                    : f.type === 'Kudos'
                                      ? 'bg-amber-50 text-amber-700'
                                      : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {f.type}
                              </span>
                            </div>
                            <p className="mt-2.5 text-slate-700 leading-relaxed">{f.content}</p>
                          </div>
                        ))}
                      </div>

                      {/* Right Organization Snapshots */}
                      <div className="lg:col-span-4 space-y-4">
                        <div className="bg-white rounded-md border border-slate-200 p-4 text-xs">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-slate-800">Upcoming Gazetted Holidays</h4>
                            <button
                              type="button"
                              onClick={() => setActiveTab && setActiveTab('inbox', 'holidays')}
                              className="text-[11px] text-[#0088ff] hover:underline"
                            >
                              View All
                            </button>
                          </div>
                          {holidays.length === 0 ? (
                            <p className="text-slate-400">No upcoming holidays loaded.</p>
                          ) : (
                            <div className="space-y-2">
                              {holidays.slice(0, 4).map((h) => (
                                <div key={h.id} className="flex items-center justify-between py-1 border-b last:border-b-0 border-slate-100">
                                  <span className="font-medium text-slate-700">{h.name}</span>
                                  <span className="text-[11px] text-slate-400">{String(h.date || '').slice(0, 10)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bg-white rounded-md border border-slate-200 p-4 text-xs">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-semibold text-slate-800">Office Locations</h4>
                            <Globe size={13} className="text-slate-400" />
                          </div>
                          {orgLocations.length === 0 ? (
                            <div className="p-2.5 rounded bg-slate-50 border border-slate-100">
                              <p className="font-medium text-slate-800">Nairobi Head Office</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{orgProfile.address}</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {orgLocations.map((loc) => (
                                <div key={loc.id} className="p-2.5 rounded bg-slate-50 border border-slate-100">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-800">{loc.name}</span>
                                    {loc.isHeadOffice && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">HQ</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-500 mt-0.5">{loc.address || loc.timezone}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {orgSubTab === 'directory' && (
                <div className="p-5 max-w-6xl mx-auto">
                  <div className="bg-white rounded-md border border-slate-200 p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-5">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Organization Employee Directory ({filteredOrgEmps.length})</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Search staff members across all Ndakala departments</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                          <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            value={orgSearch}
                            onChange={(e) => setOrgSearch(e.target.value)}
                            placeholder="Search name, title, email..."
                            className="pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs text-slate-700 focus:outline-none focus:border-[#0088ff]"
                          />
                        </div>
                        <select
                          value={orgDeptFilter}
                          onChange={(e) => setOrgDeptFilter(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-200 rounded text-xs text-slate-700 bg-white"
                        >
                          <option value="ALL">All Departments</option>
                          {uniqueDeptNames.map((dName) => (
                            <option key={dName} value={dName}>{dName}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setActiveTab && setActiveTab('directory', 'employees')}
                          className="px-3 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-medium"
                        >
                          Full Onboarding Directory →
                        </button>
                      </div>
                    </div>

                    {filteredOrgEmps.length === 0 ? (
                      <NdakalaEmptyState
                        title="No matching employees"
                        subtitle="No employee records matched your current search or department filter."
                        actionLabel="Reset Filters"
                        onAction={() => {
                          setOrgSearch('');
                          setOrgDeptFilter('ALL');
                        }}
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {filteredOrgEmps.map((emp) => {
                          const empName = getEmpName(emp);
                          const isFav = favoriteEmpIds.includes(emp.id);
                          return (
                            <div key={emp.id} className="p-4 rounded-md border border-slate-200 hover:border-[#0088ff]/50 transition-colors bg-white text-xs space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-10 h-10 rounded-lg bg-[#0088ff]/10 text-[#0088ff] font-bold flex items-center justify-center text-xs flex-shrink-0">
                                    {getEmpInitials(empName)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 truncate">{empName}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{getEmpTitle(emp)}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleFavoriteEmployee(emp.id)}
                                  className="p-1 rounded hover:bg-slate-100 flex-shrink-0"
                                  title={isFav ? 'Unpin favorite' : 'Pin favorite'}
                                >
                                  <Star size={14} className={isFav ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} />
                                </button>
                              </div>
                              <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-500">
                                <p className="truncate"><strong className="text-slate-700">Dept:</strong> {getEmpDept(emp)}</p>
                                <p className="truncate"><strong className="text-slate-700">Email:</strong> {emp.workEmail || emp.email || '-'}</p>
                                <p className="flex items-center justify-between">
                                  <span><strong className="text-slate-700">ID:</strong> {emp.employeeNumber || 'NDK'}</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                                    {emp.status || 'ACTIVE'}
                                  </span>
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {orgSubTab === 'tree' && (
                <div className="p-5 max-w-6xl mx-auto space-y-4">
                  <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Layers size={15} className="text-[#0088ff]" />
                      <h3 className="text-sm font-semibold text-slate-900">Organization &amp; Department Tree</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => setOrgTreeMode('employee')}
                          className={`px-3 py-1 rounded font-medium ${
                            orgTreeMode === 'employee'
                              ? 'bg-white text-[#0088ff] shadow-2xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Employee Reporting Tree
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrgTreeMode('department')}
                          className={`px-3 py-1 rounded font-medium ${
                            orgTreeMode === 'department'
                              ? 'bg-white text-[#0088ff] shadow-2xs'
                              : 'text-slate-600'
                          }`}
                        >
                          Department Structure Tree
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab && setActiveTab('hardening', 'orgsettings')}
                        className="px-3 py-1.5 border border-slate-200 hover:border-[#0088ff] rounded text-slate-700 font-medium"
                      >
                        Manage Structure →
                      </button>
                    </div>
                  </div>

                  {orgTreeMode === 'employee' ? (
                    <div className="bg-white rounded-md border border-slate-200 p-6 space-y-6">
                      {rootLeaders.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">No employee reporting nodes found.</p>
                      ) : (
                        rootLeaders.map((leader) => {
                          const directChildren = employees.filter((e) => e.managerId === leader.id);
                          return (
                            <div key={leader.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50/40">
                              <div className="inline-flex items-center gap-3 px-4 py-3 rounded-lg bg-[#191f3a] text-white shadow-sm">
                                <div className="w-9 h-9 rounded-full bg-[#0088ff] font-bold text-xs flex items-center justify-center">
                                  {getEmpInitials(getEmpName(leader))}
                                </div>
                                <div className="text-xs">
                                  <p className="font-semibold">{getEmpName(leader)}</p>
                                  <p className="text-[11px] text-slate-300">
                                    {getEmpTitle(leader)} • {getEmpDept(leader)}
                                  </p>
                                </div>
                              </div>
                              {directChildren.length > 0 && (
                                <div className="mt-4 pl-6 border-l-2 border-blue-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {directChildren.map((child) => (
                                    <div key={child.id} className="p-3 rounded-md bg-white border border-slate-200 text-xs flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-md bg-blue-50 text-[#0088ff] font-bold text-[11px] flex items-center justify-center flex-shrink-0">
                                        {getEmpInitials(getEmpName(child))}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 truncate">{getEmpName(child)}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{getEmpTitle(child)}</p>
                                        <p className="text-[10px] text-slate-400 truncate">{getEmpDept(child)}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {uniqueDeptNames.map((dName) => {
                        const deptMeta = orgDepartments.find((d) => d.name === dName);
                        const staff = employees.filter((e) => getEmpDept(e) === dName);
                        return (
                          <div key={dName} className="bg-white rounded-md border border-slate-200 p-4 text-xs space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] font-mono text-[10px] font-bold">
                                  {deptMeta?.code || dName.slice(0, 4).toUpperCase()}
                                </span>
                                <h4 className="text-sm font-semibold text-slate-900 mt-1.5">{dName}</h4>
                                {deptMeta?.parentDepartment?.name && (
                                  <p className="text-[11px] text-slate-400">Reports under: {deptMeta.parentDepartment.name}</p>
                                )}
                              </div>
                              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                {staff.length} Staff
                              </span>
                            </div>
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                              {staff.length === 0 ? (
                                <span className="text-[11px] text-slate-400">Open department structure node</span>
                              ) : (
                                staff.slice(0, 5).map((m) => (
                                  <span key={m.id} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10.5px]">
                                    {getEmpName(m)}
                                  </span>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {orgSubTab === 'celebrations' && (
                <div className="p-5 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Birthdays */}
                  <div className="bg-white rounded-md border border-slate-200 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="font-semibold text-slate-900">Birthdays</h4>
                      <Award size={14} className="text-amber-500" />
                    </div>
                    {(() => {
                      const todayMd = new Date().toISOString().slice(5, 10);
                      const bdays = employees.filter((e) => (e.dateOfBirth || '').slice(5, 10) === todayMd);
                      const showPool = bdays.length > 0 ? bdays : employees.slice(0, 3);
                      return showPool.length === 0 ? (
                        <p className="text-slate-400 py-6 text-center">No staff records available.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {showPool.map((emp) => {
                            const name = getEmpName(emp);
                            return (
                              <div key={emp.id} className="p-2.5 rounded bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">{name}</p>
                                  <p className="text-[10.5px] text-slate-500 truncate">{getEmpDept(emp)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    publishWorkspaceFeed('KUDOS', `Warm birthday wishes and appreciation to ${name}!`)
                                  }
                                  className="px-2.5 py-1 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-[10.5px] font-medium flex-shrink-0"
                                >
                                  Send Kudos
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Work Anniversaries & Tenure */}
                  <div className="bg-white rounded-md border border-slate-200 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="font-semibold text-slate-900">Work Anniversaries &amp; Tenure</h4>
                      <CheckCircle size={14} className="text-emerald-600" />
                    </div>
                    {employees.length === 0 ? (
                      <p className="text-slate-400 py-6 text-center">No tenure data loaded.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {employees.slice(0, 4).map((emp) => {
                          const name = getEmpName(emp);
                          const joined = String(emp.hireDate || '2026-01-01').slice(0, 10);
                          return (
                            <div key={emp.id} className="p-2.5 rounded bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-800 truncate">{name}</p>
                                <p className="text-[10.5px] text-slate-500 truncate">Joined: {joined}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  publishWorkspaceFeed('KUDOS', `Celebrating ${name}'s dedication since ${joined}!`)
                                }
                                className="px-2.5 py-1 border border-[#0088ff] text-[#0088ff] hover:bg-blue-50 rounded text-[10.5px] font-medium flex-shrink-0"
                              >
                                Celebrate
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Recent New Hires */}
                  <div className="bg-white rounded-md border border-slate-200 p-4 text-xs space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <h4 className="font-semibold text-slate-900">Welcome New Hires</h4>
                      <Users size={14} className="text-[#0088ff]" />
                    </div>
                    {employees.length === 0 ? (
                      <p className="text-slate-400 py-6 text-center">No recent hires found.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {[...employees]
                          .sort((a, b) => String(b.hireDate || '').localeCompare(String(a.hireDate || '')))
                          .slice(0, 4)
                          .map((emp) => {
                            const name = getEmpName(emp);
                            return (
                              <div key={emp.id} className="p-2.5 rounded bg-slate-50 border border-slate-100 flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">{name}</p>
                                  <p className="text-[10.5px] text-slate-500 truncate">{getEmpTitle(emp)} • {getEmpDept(emp)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    publishWorkspaceFeed('KUDOS', `Welcome to Ndakala Advisory, ${name}! Wishing you every success.`)
                                  }
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10.5px] font-medium flex-shrink-0"
                                >
                                  Welcome
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {orgSubTab === 'policies' && (
                <div className="p-5 max-w-6xl mx-auto space-y-4">
                  <div className="bg-white rounded-md border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Company Policies &amp; Compliance Vault ({policies.length})</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Acknowledge published HR governance documents and mandatory compliance modules.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab && setActiveTab('admin', 'files', 'documents')}
                        className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-medium"
                      >
                        Open Document Vault →
                      </button>
                    </div>
                    {policies.length === 0 ? (
                      <NdakalaEmptyState
                        title="No organization policies published"
                        subtitle="Policies published in Files & Governance will appear here for staff acknowledgment."
                        actionLabel="Go to Files & Policies"
                        onAction={() => setActiveTab && setActiveTab('admin', 'files', 'documents')}
                      />
                    ) : (
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                        {policies.map((p) => {
                          const matchedAck = policyAcks.find(
                            (a) => a.policyVersion?.policyId === p.id || a.policyVersion?.policy?.id === p.id
                          );
                          return (
                            <div key={p.id} className="p-3.5 flex items-center justify-between gap-4 text-xs">
                              <div>
                                <p className="font-semibold text-slate-800">{p.title || p.name || 'Company Policy'}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  Category: {p.category || 'HR Governance'} • Version {p.versions?.[0]?.versionNumber || p.version || '1.0'}
                                </p>
                              </div>
                              {matchedAck?.status === 'PENDING' ? (
                                <button
                                  type="button"
                                  onClick={() => onAcknowledgePolicy && onAcknowledgePolicy(matchedAck.id)}
                                  className="px-3 py-1.5 border border-[#0088ff] text-[#0088ff] hover:bg-blue-50 rounded text-[11px] font-medium flex-shrink-0"
                                >
                                  Acknowledge Policy
                                </button>
                              ) : matchedAck?.status === 'ACKNOWLEDGED' ? (
                                <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 text-[11px] font-semibold flex-shrink-0">
                                  Acknowledged ✓
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setActiveTab && setActiveTab('admin', 'files', 'documents')}
                                  className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded text-[11px] font-medium flex-shrink-0"
                                >
                                  Review Policy →
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {trainings.length > 0 && (
                    <div className="bg-white rounded-md border border-slate-200 p-5">
                      <h4 className="text-xs font-semibold text-slate-900 mb-3">Mandatory Compliance Trainings ({trainings.length})</h4>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded">
                        {trainings.map((t) => (
                          <div key={t.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                            <div>
                              <p className="font-medium text-slate-800">{t.module?.title || t.title || 'Compliance Training'}</p>
                              <p className="text-[11px] text-slate-400">Status: {t.status || 'ASSIGNED'}</p>
                            </div>
                            {t.status !== 'COMPLETED' && (
                              <button
                                type="button"
                                onClick={() => onCompleteTraining && onCompleteTraining(t.id)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-medium"
                              >
                                Complete Training
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Right-Side "Customize widgets" Drawer */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20">
          <div className="w-80 bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-fadeIn">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Customize widgets</h3>
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 border-b border-slate-200 flex space-x-6 text-xs">
              <button
                type="button"
                onClick={() => setWidgetTab('my')}
                className={`py-2.5 font-medium border-b-2 ${
                  widgetTab === 'my'
                    ? 'border-[#0088ff] text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500'
                }`}
              >
                My Widgets
              </button>
              <button
                type="button"
                onClick={() => setWidgetTab('org')}
                className={`py-2.5 font-medium border-b-2 ${
                  widgetTab === 'org'
                    ? 'border-[#0088ff] text-slate-900 font-semibold'
                    : 'border-transparent text-slate-500'
                }`}
              >
                Org Widgets
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {widgetTab === 'org' && (
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-700 leading-snug pr-2">
                    Mandate org widgets across the organization
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleMandateWidgets}
                    className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                      mandateOrgWidgets ? 'bg-[#0088ff]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        mandateOrgWidgets ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>
              )}

              {widgets.map((w) => (
                <div
                  key={w.id}
                  className="px-3 py-2.5 rounded border border-slate-200 bg-white flex items-center justify-between text-xs"
                >
                  <span className="text-slate-700 font-medium">⋮⋮ &nbsp;{w.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleWidget(w.id)}
                    className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                      w.enabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        w.enabled ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right-Side "Add Delegation" Drawer */}
      {delegationDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Add Delegation</h3>
              <button
                type="button"
                onClick={() => setDelegationDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveDelegation} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <label className="block text-slate-600 font-medium mb-2">
                    Delegator <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600">
                      EO
                    </div>
                    <span className="text-slate-800 font-medium">{currentEmp.fullName}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1.5">
                    Delegatee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={delegationForm.delegateeId}
                    onChange={(e) =>
                      setDelegationForm({ ...delegationForm, delegateeId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-slate-700 focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="">Select</option>
                    {employees
                      .filter((e) => e.id !== currentEmp.id)
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {getEmpName(e)} — {e.jobTitle || getEmpDept(e)}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1.5">Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={delegationForm.type}
                      onChange={(e) =>
                        setDelegationForm({ ...delegationForm, type: e.target.value })
                      }
                      className="px-3 py-2 border border-slate-300 rounded bg-white text-slate-700"
                    >
                      <option value="Temporary">Temporary</option>
                      <option value="Permanent">Permanent</option>
                    </select>
                    <input
                      type="text"
                      value={delegationForm.dateRange}
                      onChange={(e) =>
                        setDelegationForm({ ...delegationForm, dateRange: e.target.value })
                      }
                      placeholder="Select date range"
                      className="px-3 py-2 border border-slate-300 rounded bg-white text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-2">Notification</label>
                  <div className="flex items-center gap-6">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={delegationForm.notification === 'both'}
                        onChange={() =>
                          setDelegationForm({ ...delegationForm, notification: 'both' })
                        }
                        className="text-[#0088ff]"
                      />
                      <span>Delegator and Delegatee</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={delegationForm.notification === 'delegatee'}
                        onChange={() =>
                          setDelegationForm({ ...delegationForm, notification: 'delegatee' })
                        }
                        className="text-[#0088ff]"
                      />
                      <span>Delegatee</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-medium mb-1.5">Description</label>
                  <textarea
                    rows={3}
                    value={delegationForm.description}
                    onChange={(e) =>
                      setDelegationForm({ ...delegationForm, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white text-slate-700 focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
              </div>

              <div className="px-6 py-3 border-t border-slate-200 flex items-center gap-2.5 bg-white">
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setDelegationDrawerOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
