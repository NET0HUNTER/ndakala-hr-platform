import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Bell,
  Settings,
  X,
  UserPlus,
  Umbrella,
  Clock,
  Star,
  Trophy,
  LogOut,
  ShieldCheck,
  NdakalaEmptyState,
} from './Icons';

export default function Header({
  activeTab,
  setActiveTab,
  topContextTab,
  setTopContextTab,
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRetryNotification,
  onOpenLeaveModal,
  onOpenAbsenceModal,
  onOpenMfaModal,
  employees = [],
  policies = [],
  currentUser,
  onLogout,
  onOpenGettingStarted,
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  const quickAddRef = useRef(null);
  const profileRef = useRef(null);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const userPermissions = new Set(currentUser?.permissions || []);
  const activeRoles = currentUser?.roles?.length
    ? currentUser.roles
    : currentUser?.role
    ? [currentUser.role]
    : [];
  const roleSet = new Set(activeRoles.map((r) => String(r).toLowerCase()));
  const canManageDirectory =
    userPermissions.has('employees.create') ||
    userPermissions.has('employees.view') ||
    roleSet.has('head_of_hr') ||
    roleSet.has('managing_partner') ||
    roleSet.has('operations_director') ||
    roleSet.has('system_admin');
  const canAccessOrgSettings =
    userPermissions.has('org.manage') ||
    userPermissions.has('config.manage') ||
    userPermissions.has('config.create') ||
    userPermissions.has('users.manage') ||
    roleSet.has('head_of_hr') ||
    roleSet.has('managing_partner') ||
    roleSet.has('operations_director') ||
    roleSet.has('ict_admin') ||
    roleSet.has('system_admin');

  const displayName = currentUser?.fullName || currentUser?.name || 'Authenticated User';
  const displayEmail = currentUser?.email || '';
  const userInitials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ND';

  useEffect(() => {
    function handleOutside(e) {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target)) {
        setQuickAddOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Top dark navy context tabs based on active module
  const getTopBarTabs = () => {
    switch (activeTab) {
      case 'workspace':
        return [
          { id: 'myspace', label: 'My Space' },
          { id: 'team', label: 'Team' },
          { id: 'organization', label: 'Organization' },
        ];
      case 'directory':
        return [
          { id: 'onboarding', label: 'Onboarding' },
          { id: 'employees', label: 'Employee Information' },
        ];
      case 'inbox':
        return [
          { id: 'mydata', label: 'My Data' },
          { id: 'team', label: 'Team' },
          { id: 'holidays', label: 'Holidays' },
        ];
      case 'timetracker':
      case 'attendance':
        return [
          { id: 'mydata', label: 'My Data' },
          { id: 'team', label: 'Team' },
          { id: 'shifts', label: 'Shift Schedules' },
        ];
      case 'performance':
        return [
          { id: 'gettingstarted', label: 'Getting Started' },
          { id: 'appraisals', label: 'My Appraisals & Goals' },
          { id: 'settings', label: 'Performance Settings' },
        ];
      case 'okr':
        return [
          { id: 'appraisals', label: 'OKRs & Goals' },
          { id: 'gettingstarted', label: 'Getting Started' },
          { id: 'settings', label: 'Settings' },
        ];
      case 'payroll':
        return [
          { id: 'compensation', label: 'Compensation' },
          { id: 'payrollruns', label: 'Payroll & Payslips' },
          { id: 'settings', label: 'Settings' },
        ];
      case 'hrletters':
        return [
          { id: 'addressproof', label: 'Address Proof' },
          { id: 'bonafide', label: 'Bonafide Letter' },
          { id: 'experience', label: 'Experience Letter' },
        ];
      case 'engagement':
        return [
          { id: 'engagement', label: 'Engagement & Surveys' },
          { id: 'ercases', label: 'Employee Relations & Policies' },
        ];
      case 'travel':
        return [
          { id: 'travel', label: 'Business Travel & Per Diem' },
        ];
      case 'tasks':
        return [
          { id: 'tasks', label: 'Action & Workflow Tasks' },
        ];
      case 'admin':
        return [
          { id: 'files', label: 'Files & Policies' },
          { id: 'ercases', label: 'Employee Relations' },
          { id: 'audit', label: 'Governance & Audit Logs' },
        ];
      case 'operations':
        return [
          { id: 'operations', label: 'Operations' },
          { id: 'approvals', label: 'Approvals' },
        ];
      case 'reports':
        return [
          { id: 'myreports', label: 'My Reports' },
          { id: 'teamreports', label: 'Team Reports' },
          { id: 'orgreports', label: 'Organization Reports' },
        ];
      case 'hardening':
        return [
          { id: 'services', label: 'Services Hub (19)' },
          { id: 'orgsettings', label: 'Manage Account & Organization' },
          { id: 'automation', label: 'Automation & Blueprints' },
          { id: 'gettingstarted', label: 'Ndakala People Welcome' },
        ];
      default:
        return [{ id: 'myspace', label: 'My Space' }];
    }
  };

  const topTabs = getTopBarTabs();
  const currentTopTab = topTabs.some((t) => t.id === topContextTab)
    ? topContextTab
    : topTabs[0]?.id;

  return (
    <>
      {/* Top Dark Navy Bar (#1f2647) */}
      <header className="h-[44px] bg-[#1f2647] text-white px-4 flex items-center justify-between flex-shrink-0 select-none z-30">
        {/* Left: Module / Context Tabs */}
        <div className="flex items-center space-x-6 h-full">
          {topTabs.map((tab) => {
            const isSelected = currentTopTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTopContextTab && setTopContextTab(tab.id)}
                className={`relative h-full flex items-center text-[13px] font-medium transition-colors ${
                  isSelected ? 'text-white font-semibold' : 'text-[#a3aed0] hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                {isSelected && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0088ff] rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        {/* Right: Workspace Action Icons (+, Search, Notifications, Settings, Profile) */}
        <div className="flex items-center space-x-3">
          {searchOpen ? (
            <div className="relative flex items-center">
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search employees, policies, reports..."
                className="w-64 bg-[#141933] text-white text-xs px-3 py-1.5 rounded border border-white/20 focus:outline-none focus:border-[#0088ff]"
                autoFocus
              />
              {globalSearch.trim().length > 1 && (
                <div className="absolute left-0 top-9 w-72 bg-white text-slate-800 rounded-lg shadow-2xl border border-slate-200 py-2 z-50 max-h-72 overflow-y-auto text-xs">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase text-slate-400">Employees</div>
                  {employees
                    .filter((emp) =>
                      `${emp.firstName || ''} ${emp.lastName || ''} ${emp.workEmail || ''} ${emp.employeeNumber || ''}`
                        .toLowerCase()
                        .includes(globalSearch.toLowerCase())
                    )
                    .slice(0, 5)
                    .map((emp) => (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setGlobalSearch('');
                          setActiveTab('directory', 'employees', 'records');
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-blue-50 flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800">{emp.firstName} {emp.lastName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{emp.employeeNumber}</span>
                      </button>
                    ))}
                  
                  {/* System Modules & Services Search */}
                  <div className="px-3 py-1 mt-1 border-t border-slate-100 text-[10px] font-bold uppercase text-slate-400">Services & Modules</div>
                  {[
                    { id: 'workspace', top: 'myspace', label: 'Home - My Space' },
                    { id: 'workspace', top: 'team', label: 'Home - Team Space' },
                    { id: 'workspace', top: 'organization', label: 'Home - Organization & Org Chart' },
                    { id: 'directory', top: 'onboarding', label: 'Onboarding - Candidate Hub' },
                    { id: 'directory', top: 'employees', label: 'Employee Information' },
                    { id: 'inbox', top: 'mydata', label: 'Leave Tracker & Absence Calendar' },
                    { id: 'attendance', top: 'mydata', label: 'Attendance & Regularization' },
                    { id: 'timetracker', top: 'mydata', label: 'Time Tracker' },
                    { id: 'performance', top: 'appraisals', label: 'Performance & Appraisals' },
                    { id: 'okr', top: 'configuration', label: 'OKR Cycle Configuration' },
                    { id: 'admin', top: 'files', label: 'Files Hub & SharePoint Sync' },
                    { id: 'payroll', top: 'compensation', label: 'Compensation & Kenyan Payroll' },
                    { id: 'operations', top: 'approvals', label: 'Operations Approvals Hub' },
                    { id: 'operations', top: 'operations', label: 'Operations 17-Service Catalogue' },
                    { id: 'reports', top: 'myreports', label: 'Enterprise Reports Catalogue' },
                    { id: 'hardening', top: 'orgsettings', label: 'Settings & Administration' },
                  ]
                    .filter((m) => m.label.toLowerCase().includes(globalSearch.toLowerCase()))
                    .slice(0, 4)
                    .map((m) => (
                      <button
                        key={`${m.id}-${m.top}`}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setGlobalSearch('');
                          setActiveTab(m.id, m.top);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700 flex items-center justify-between"
                      >
                        <span className="font-medium text-slate-800 text-xs">{m.label}</span>
                        <span className="text-[10px] text-[#0088ff] font-semibold">Jump →</span>
                      </button>
                    ))}

                  <div className="px-3 py-1 mt-1 border-t border-slate-100 text-[10px] font-bold uppercase text-slate-400">Policies</div>
                  {policies
                    .filter((pol) => (pol.title || '').toLowerCase().includes(globalSearch.toLowerCase()))
                    .slice(0, 3)
                    .map((pol) => (
                      <button
                        key={pol.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          setGlobalSearch('');
                          setActiveTab('admin', 'files', 'documents');
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-blue-50 text-slate-700 truncate"
                      >
                        {pol.title}
                      </button>
                    ))}
                  <div className="px-3 pt-1.5 mt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setGlobalSearch('');
                        setActiveTab('reports');
                      }}
                      className="text-[11px] font-semibold text-[#0088ff] hover:underline"
                    >
                      Search in Enterprise Reports Hub →
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setGlobalSearch('');
                }}
                className="ml-1.5 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}

          {/* Blue Square + Quick Add Button matching Zoho People 11-action split menu */}
          <div className="relative" ref={quickAddRef}>
            <button
              type="button"
              onClick={() => setQuickAddOpen(!quickAddOpen)}
              title="Quick Add"
              className="w-7 h-7 rounded bg-[#0088ff] hover:bg-[#0073d9] text-white flex items-center justify-center shadow-xs transition-colors"
            >
              <Plus size={16} strokeWidth={2.5} />
            </button>

            {quickAddOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white text-slate-800 rounded-lg shadow-2xl border border-slate-200 py-2 z-50 animate-fadeIn divide-y divide-slate-100">
                {/* Section 1: Recruitment & People */}
                <div className="px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Recruitment & People
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('directory', 'onboarding');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Candidate
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('directory', 'employees');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Employee
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('workspace', 'organization');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Department
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('workspace', 'organization');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Designation
                    </button>
                  </div>
                </div>

                {/* Section 2: Time Off & Attendance */}
                <div className="px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Time Off & Attendance
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        onOpenLeaveModal && onOpenLeaveModal();
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Leave
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        onOpenAbsenceModal && onOpenAbsenceModal();
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Absence
                    </button>
                  </div>
                </div>

                {/* Section 3: HR Letters */}
                <div className="px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    HR Letters
                  </div>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('hrletters', 'addressproof');
                      }}
                      className="w-full px-2 py-1 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium flex items-center justify-between"
                    >
                      <span>+ Address Proof</span>
                      <span className="text-[10px] text-slate-400">PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('hrletters', 'bonafide');
                      }}
                      className="w-full px-2 py-1 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium flex items-center justify-between"
                    >
                      <span>+ Bonafide Letter</span>
                      <span className="text-[10px] text-slate-400">PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('hrletters', 'experience');
                      }}
                      className="w-full px-2 py-1 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium flex items-center justify-between"
                    >
                      <span>+ Experience Letter</span>
                      <span className="text-[10px] text-slate-400">PDF</span>
                    </button>
                  </div>
                </div>

                {/* Section 4: Travel & Tasks */}
                <div className="px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Travel & Operations
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('travel', 'travel');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Travel Request
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('travel', 'travel');
                      }}
                      className="px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Travel Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickAddOpen(false);
                        setActiveTab('tasks', 'tasks');
                      }}
                      className="col-span-2 px-2 py-1.5 text-left text-xs rounded hover:bg-blue-50 text-slate-700 hover:text-[#0088ff] font-medium"
                    >
                      + Operational Task
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Search Icon */}
          <button
            type="button"
            onClick={() => setSearchOpen(!searchOpen)}
            title="Search"
            className="p-1.5 text-[#a3aed0] hover:text-white rounded transition-colors"
          >
            <Search size={16} />
          </button>

          {/* Notifications Bell Icon */}
          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            title="Notifications"
            className="relative p-1.5 text-[#a3aed0] hover:text-white rounded transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>

          {/* Settings Gear Icon (Admin / HR / Governance Roles Only) */}
          {canAccessOrgSettings && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('hardening', 'services');
              }}
              title="Settings"
              className={`p-1.5 rounded transition-colors ${
                activeTab === 'hardening' ? 'text-white bg-white/15' : 'text-[#a3aed0] hover:text-white'
              }`}
            >
              <Settings size={16} />
            </button>
          )}

          {/* User Avatar & Authenticated Access Profile */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen(!profileOpen)}
              title={displayName}
              className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center border border-white/30 hover:ring-2 hover:ring-[#0088ff] transition-all overflow-hidden"
            >
              {userInitials}
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white text-slate-800 rounded-lg shadow-2xl border border-slate-200 overflow-hidden z-50 animate-fadeIn">
                <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0088ff] text-white font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {userInitials}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {displayName}
                    </p>
                    {displayEmail && (
                      <p className="text-[11px] text-slate-500 truncate">
                        {displayEmail}
                      </p>
                    )}
                    <span className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 bg-blue-50 text-[#0088ff] rounded">
                      Ndakala Advisory LLP • RBAC Active
                    </span>
                  </div>
                </div>

                <div className="p-3 border-b border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Authenticated Access Profile
                    </p>
                    <ShieldCheck size={13} className="text-emerald-600" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRoles.length > 0 ? (
                      activeRoles.map((roleKey) => (
                        <span
                          key={roleKey}
                          className="inline-flex items-center px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-[#0088ff] text-[11px] font-semibold capitalize"
                        >
                          {String(roleKey).replace(/_/g, ' ')}
                        </span>
                      ))
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                        Standard Session
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {userPermissions.size} permission{userPermissions.size === 1 ? '' : 's'} granted to this session
                  </p>
                </div>

                <div className="p-1.5 flex items-center justify-between bg-slate-50/50">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onOpenMfaModal && onOpenMfaModal();
                    }}
                    className="px-2 py-1.5 text-xs text-slate-700 hover:text-[#0088ff] font-medium"
                  >
                    MFA Security
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setActiveTab('hardening', 'gettingstarted');
                      onOpenGettingStarted && onOpenGettingStarted();
                    }}
                    className="px-2 py-1.5 text-xs text-[#0088ff] hover:underline font-medium"
                  >
                    Tour 5.0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout && onLogout();
                    }}
                    className="px-2 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded flex items-center gap-1 font-medium"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Right-Side "Notifications" Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-fadeIn">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Notifications</h3>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllNotificationsRead}
                    className="text-xs text-[#0088ff] hover:underline font-medium"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {notifications.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <NdakalaEmptyState title="No Notification Found" />
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => onMarkNotificationRead && onMarkNotificationRead(n.id)}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                        !n.readAt
                          ? 'bg-blue-50/40 border-blue-200 text-slate-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-slate-900">{n.title}</span>
                        <span className="text-[10px] text-slate-400">
                          {n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB') : 'Today'}
                        </span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">{n.message}</p>
                      {n.status === 'FAILED' && onRetryNotification && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetryNotification(n.id);
                          }}
                          className="mt-2 px-2.5 py-1 bg-amber-100 text-amber-800 rounded text-[10px] font-semibold hover:bg-amber-200"
                        >
                          Retry Delivery
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
