import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  UserPlus,
  Umbrella,
  MoreHorizontal,
  Trophy,
  Clock,
  Calendar,
  Folder,
  Users,
  Star,
  Briefcase,
  CheckCircle,
  DollarSign,
  Target,
  Globe,
  PieChart,
  Search,
  Sliders,
  Settings,
} from './Icons';

const MORE_SERVICES = [
  { id: 'inbox', label: 'Leave Tracker', icon: Umbrella, color: 'text-teal-500' },
  { id: 'attendance', label: 'Attendance', icon: Calendar, color: 'text-orange-500', topTab: 'mydata', subHint: 'attendance' },
  { id: 'timetracker', label: 'Time Tracker', icon: Clock, color: 'text-cyan-600', topTab: 'mydata', subHint: 'timelogs' },
  { id: 'performance', label: 'Performance', icon: Trophy, color: 'text-emerald-500', topTab: 'appraisals' },
  { id: 'admin', label: 'Files', icon: Folder, color: 'text-blue-500', topTab: 'files', subHint: 'documents' },
  { id: 'engagement', label: 'Employee Engagement', icon: Users, color: 'text-purple-500', topTab: 'engagement', subHint: 'engagement' },
  { id: 'hrletters', label: 'HR Letters', icon: Star, color: 'text-amber-500', topTab: 'addressproof' },
  { id: 'travel', label: 'Travel', icon: Briefcase, color: 'text-orange-500', topTab: 'travel', subHint: 'travel' },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle, color: 'text-emerald-600', topTab: 'tasks', subHint: 'tasks' },
  { id: 'payroll', label: 'Compensation', icon: DollarSign, color: 'text-blue-600', topTab: 'compensation' },
  { id: 'okr', label: 'OKR', icon: Target, color: 'text-indigo-500', topTab: 'appraisals', subHint: 'objectives' },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedDynamicId, setPinnedDynamicId] = useState('performance');
  const flyoutRef = useRef(null);

  // Update dynamic 4th rail slot whenever user navigates to one of the More services
  useEffect(() => {
    const found = MORE_SERVICES.find((s) => s.id === activeTab && s.id !== 'inbox');
    if (found) {
      setPinnedDynamicId(found.id);
    }
  }, [activeTab]);

  useEffect(() => {
    function handleOutside(e) {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [moreOpen]);

  const dynamicService =
    MORE_SERVICES.find((s) => s.id === pinnedDynamicId) ||
    MORE_SERVICES.find((s) => s.id === 'performance');

  const filteredMore = MORE_SERVICES.filter((s) =>
    s.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const primaryRail = [
    { id: 'workspace', label: 'Home', icon: Home },
    { id: 'directory', label: 'Onboarding', icon: UserPlus },
    { id: 'inbox', label: 'Leave Tracker', icon: Umbrella },
    ...(dynamicService ? [{ id: dynamicService.id, label: dynamicService.label, icon: dynamicService.icon }] : []),
  ];

  return (
    <aside
      ref={flyoutRef}
      className="relative w-[68px] bg-[#191f3a] text-[#a3aed0] flex flex-col justify-between h-full flex-shrink-0 select-none z-40 border-r border-[#12172d]"
    >
      {/* Top Logo + Primary Icon Rail */}
      <div className="flex flex-col items-center pt-2.5 space-y-1">
        {/* Ndakala People Emblem */}
        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          title="Ndakala People 5.0"
          className="w-10 h-10 mb-1.5 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 36 36" className="w-7 h-7">
            <circle cx="18" cy="10" r="4.5" fill="#ff5252" />
            <circle cx="10" cy="15" r="3.5" fill="#ffca28" />
            <circle cx="26" cy="15" r="3.5" fill="#26a69a" />
            <path d="M11 27c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="#42a5f5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <path d="M5 28c0-2.6 2-4.6 4.8-4.6" stroke="#ffca28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M31 28c0-2.6-2-4.6-4.8-4.6" stroke="#26a69a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </svg>
        </button>

        {primaryRail.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setMoreOpen(false);
              }}
              className={`w-[58px] py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
                isActive
                  ? 'bg-[#0088ff] text-white shadow-sm'
                  : 'text-[#a3aed0] hover:bg-white/10 hover:text-white'
              }`}
            >
              <IconComponent size={19} strokeWidth={1.8} />
              <span className="text-[10px] font-medium leading-tight text-center truncate w-full">
                {item.label}
              </span>
            </button>
          );
        })}

        {/* ... More Button */}
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          className={`w-[58px] py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
            moreOpen
              ? 'bg-white/15 text-white'
              : 'text-[#a3aed0] hover:bg-white/10 hover:text-white'
          }`}
        >
          <MoreHorizontal size={19} />
          <span className="text-[10px] font-medium leading-tight">More</span>
        </button>
      </div>

      {/* Bottom Pinned Items: Operations & Reports */}
      <div className="flex flex-col items-center pb-3 space-y-1 border-t border-white/10 pt-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('operations');
            setMoreOpen(false);
          }}
          className={`w-[58px] py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === 'operations'
              ? 'bg-[#0088ff] text-white shadow-sm'
              : 'text-[#a3aed0] hover:bg-white/10 hover:text-white'
          }`}
        >
          <Globe size={19} strokeWidth={1.8} />
          <span className="text-[10px] font-medium leading-tight">Operations</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('reports');
            setMoreOpen(false);
          }}
          className={`w-[58px] py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === 'reports'
              ? 'bg-[#0088ff] text-white shadow-sm'
              : 'text-[#a3aed0] hover:bg-white/10 hover:text-white'
          }`}
        >
          <PieChart size={19} strokeWidth={1.8} />
          <span className="text-[10px] font-medium leading-tight">Reports</span>
        </button>
      </div>

      {/* "More Services" Floating Flyout Popover */}
      {moreOpen && (
        <div className="absolute left-[72px] top-12 w-[265px] bg-white rounded-lg shadow-2xl border border-slate-200 text-slate-800 overflow-hidden z-50 animate-fadeIn">
          <div className="p-2.5 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Services"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-[#0088ff] text-slate-700"
                autoFocus
              />
            </div>
          </div>

          <div className="px-3.5 py-2 flex items-center justify-between bg-slate-50/60 border-b border-slate-100">
            <span className="text-[11px] font-semibold text-slate-600">More Services</span>
            <button
              type="button"
              onClick={() => {
                setActiveTab('hardening', 'orgsettings');
                setMoreOpen(false);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-[#0088ff] hover:underline font-medium"
            >
              <Sliders size={12} />
              <span>Preferences</span>
            </button>
          </div>

          <div className="max-h-[370px] overflow-y-auto divide-y divide-slate-100">
            {filteredMore.map((srv) => {
              const SrvIcon = srv.icon;
              const isCurr = activeTab === srv.id;
              return (
                <button
                  key={srv.id}
                  type="button"
                  onClick={() => {
                    setPinnedDynamicId(srv.id);
                    setActiveTab(srv.id, srv.topTab || null, srv.subHint || null);
                    setMoreOpen(false);
                    setSearchQuery('');
                  }}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 text-left text-xs transition-colors ${
                    isCurr
                      ? 'bg-blue-50/70 text-[#0088ff] font-semibold'
                      : 'text-slate-700 hover:bg-slate-50 font-medium'
                  }`}
                >
                  <SrvIcon size={16} className={srv.color} />
                  <span>{srv.label}</span>
                </button>
              );
            })}
            {filteredMore.length === 0 && (
              <div className="py-8 text-center text-xs text-slate-400">No matching services</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
