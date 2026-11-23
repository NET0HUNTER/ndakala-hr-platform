import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Users,
  Umbrella,
  Calendar,
  Clock,
  Trophy,
  Folder,
  Star,
  Briefcase,
  CheckCircle,
  DollarSign,
  Target,
  FileText,
  Shield,
  Layers,
  ArrowRight,
  Sliders,
  Settings,
  Search,
  ExternalLink,
} from '../components/Icons';
import OperationsApprovalsView from './OperationsApprovalsView';
import { apiGet } from '../utils/api';

export default function OperationsHubView({
  currentUser,
  onShowToast,
  onNavigateTab,
  initialSubView = null,
}) {
  const [subView, setSubView] = useState(initialSubView); // null (Hub), 'approvals'
  const [searchFilter, setSearchFilter] = useState('');
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  useEffect(() => {
    if (initialSubView) {
      setSubView(initialSubView);
    }
  }, [initialSubView]);

  // Fetch pending count for the Approvals card badge
  useEffect(() => {
    async function loadCounts() {
      try {
        const res = await apiGet('/api/v1/operations/approvals?status=PENDING');
        if (res?.counts?.pendingCount !== undefined) {
          setPendingApprovalsCount(res.counts.pendingCount);
        } else if (Array.isArray(res?.data)) {
          setPendingApprovalsCount(res.data.length);
        }
      } catch (err) {
        // silent fallback
      }
    }
    loadCounts();
  }, []);

  // 17 Operations Service Cards matching Zoho People 5.0 (#operations/home)
  const OPERATIONS_SERVICES = [
    {
      id: 'approvals',
      title: 'Approvals',
      code: 'APPR',
      icon: CheckCircle,
      color: 'text-amber-500 bg-amber-50 border-amber-200',
      badge: pendingApprovalsCount > 0 ? `${pendingApprovalsCount} Pending` : null,
      badgeColor: 'bg-amber-500 text-white',
      description: 'Manage and process all multi-stage employee requests, leave approvals, and maker-checker tasks.',
      action: () => setSubView('approvals'),
    },
    {
      id: 'onboarding',
      title: 'Onboarding',
      code: 'ONBD',
      icon: UserPlus,
      color: 'text-blue-500 bg-blue-50 border-blue-200',
      description: 'Candidate recruitment pipeline, welcome wizards, tentative joining dates, and offer letters.',
      action: () => onNavigateTab?.('directory', 'candidates'),
    },
    {
      id: 'employee_info',
      title: 'Employee Information',
      code: 'EMP',
      icon: Users,
      color: 'text-indigo-500 bg-indigo-50 border-indigo-200',
      description: 'Central workforce master, 10-section profile schemas, designations, and departmental organograms.',
      action: () => onNavigateTab?.('directory', 'employees'),
    },
    {
      id: 'leave_tracker',
      title: 'Leave Tracker',
      code: 'LEAVE',
      icon: Umbrella,
      color: 'text-teal-500 bg-teal-50 border-teal-200',
      description: 'Leave entitlements, immutable ledger balances, compensatory off, and Kenyan gazetted public holidays.',
      action: () => onNavigateTab?.('inbox', 'summary'),
    },
    {
      id: 'attendance',
      title: 'Attendance',
      code: 'ATTN',
      icon: Calendar,
      color: 'text-orange-500 bg-orange-50 border-orange-200',
      description: 'Daily check-in / check-out timestamps, first-in/last-out logs, payable hours, and regularization.',
      action: () => onNavigateTab?.('attendance', 'attendance'),
    },
    {
      id: 'shift',
      title: 'Shift',
      code: 'SHIFT',
      icon: Clock,
      color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
      description: 'Weekly and monthly shift mapping, general business hours schedule (9:00 AM - 6:00 PM), and roasters.',
      action: () => onNavigateTab?.('attendance', 'shifts'),
    },
    {
      id: 'time_tracker',
      title: 'Time Tracker',
      code: 'TIME',
      icon: Clock,
      color: 'text-emerald-500 bg-emerald-50 border-emerald-200',
      description: 'Daily/weekly time logs, client job scheduling, billable hours tracking, and timesheet approvals.',
      action: () => onNavigateTab?.('timetracker', 'timelogs'),
    },
    {
      id: 'performance',
      title: 'Performance',
      code: 'PERF',
      icon: Trophy,
      color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
      description: 'KRAs, Competencies, Performance Improvement Plans (PIPs), and 360-degree feedback reviews.',
      action: () => onNavigateTab?.('performance', 'appraisals'),
    },
    {
      id: 'files',
      title: 'Files',
      code: 'FILES',
      icon: Folder,
      color: 'text-blue-600 bg-blue-50 border-blue-200',
      description: 'Organization files, AES-256 local vault, HR templates, and Microsoft 365 SharePoint dual-write.',
      action: () => onNavigateTab?.('admin', 'documents'),
    },
    {
      id: 'hr_letters',
      title: 'HR Letters',
      code: 'LETT',
      icon: Star,
      color: 'text-amber-500 bg-amber-50 border-amber-200',
      description: 'Address proof forms, bonafide letters, and certificate of service zero-dependency PDF generation.',
      action: () => onNavigateTab?.('admin', 'templates'),
    },
    {
      id: 'compensation',
      title: 'Compensation',
      code: 'COMP',
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      description: 'Kenyan statutory payroll (PAYE, NSSF, SHIF, Housing Levy), salary structures, and digital payslips.',
      action: () => onNavigateTab?.('payroll', 'runs'),
    },
    {
      id: 'okr',
      title: 'OKR',
      code: 'OKR',
      icon: Target,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
      description: 'Quarterly OKR cycle configuration, deviation percentage threshold formulas, and location targeting.',
      action: () => onNavigateTab?.('okr', 'configuration'),
    },
    {
      id: 'tasks',
      title: 'Tasks',
      code: 'TASK',
      icon: CheckCircle,
      color: 'text-purple-500 bg-purple-50 border-purple-200',
      description: 'Operational task assignments, reminders, priorities, and workflow onboarding checklists.',
      action: () => setSubView('approvals'),
    },
    {
      id: 'engagement',
      title: 'Employee Engagement',
      code: 'ENG',
      icon: Users,
      color: 'text-pink-500 bg-pink-50 border-pink-200',
      description: 'Anonymous pulse questionnaires, staff satisfaction surveys, and corporate eNPS tracking.',
      action: () => onShowToast?.('Employee Engagement survey dashboard active in report view.', 'info'),
    },
    {
      id: 'travel',
      title: 'Travel',
      code: 'TRAV',
      icon: Briefcase,
      color: 'text-orange-600 bg-orange-50 border-orange-200',
      description: 'Travel requests, travel advances, client billability confirmations, and expense vouchers.',
      action: () => onShowToast?.('Travel Request workflow integrated with Approvals hub.', 'info'),
    },
    {
      id: 'offboarding',
      title: 'Offboarding',
      code: 'OFFB',
      icon: Layers,
      color: 'text-slate-600 bg-slate-100 border-slate-200',
      description: 'Resignation management, exit interviews, asset handover clearances, and final dues settlement.',
      action: () => onNavigateTab?.('hardening', 'governance'),
    },
    {
      id: 'data_admin',
      title: 'Data Administration',
      code: 'ADMIN',
      icon: Shield,
      color: 'text-blue-700 bg-blue-50 border-blue-200',
      description: 'Immutable system audit trails, cold-archive storage retention (>6 mos), and M365 security settings.',
      action: () => onNavigateTab?.('hardening', 'orgsettings'),
    },
  ];

  // If subView is 'approvals', render the full Operations Approvals Hub
  if (subView === 'approvals') {
    return (
      <OperationsApprovalsView
        currentUser={currentUser}
        onShowToast={onShowToast}
        onNavigateTab={() => setSubView(null)}
      />
    );
  }

  const filteredServices = OPERATIONS_SERVICES.filter(
    (s) =>
      s.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      s.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      s.code.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f4f7fa] overflow-y-auto select-none">
      {/* 1. Operations Header Bar */}
      <div className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-[#191f3a]">Operations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Central operational hub for workforce administration, approval queues, workflows, and service configuration.
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter operational services..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0088ff] focus:bg-white shadow-2xs"
          />
        </div>
      </div>

      {/* 2. 17 Service Cards Grid matching Zoho People */}
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredServices.map((svc) => {
            const IconComp = svc.icon;
            return (
              <div
                key={svc.id}
                onClick={svc.action}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:shadow-md hover:border-[#0088ff]/40 transition-all cursor-pointer flex flex-col justify-between group relative"
              >
                {/* Card Top: Icon & Badge */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center border ${svc.color} transition-transform group-hover:scale-105`}
                    >
                      <IconComp size={20} strokeWidth={2} />
                    </div>

                    {svc.badge ? (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${svc.badgeColor} animate-pulse`}
                      >
                        {svc.badge}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 tracking-wider">
                        {svc.code}
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm group-hover:text-[#0088ff] transition-colors mb-1">
                    {svc.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {svc.description}
                  </p>
                </div>

                {/* Card Bottom: Action Link */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#0088ff]">
                  <span>Access Service</span>
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
