import React, { useState, useMemo, useCallback } from 'react';
import {
  Users,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Building,
  CheckCircle,
  RefreshCw,
  Layers,
  Eye,
  X,
} from './Icons';

export default function InteractiveOrgChart({ employees = [], departments = [], onSelectEmployee }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedMap, setCollapsedMap] = useState({});
  const [selectedEmp, setSelectedEmp] = useState(null);

  // Helper name & title resolvers
  const getEmpName = (e) =>
    e?.fullName || `${e?.firstName || ''} ${e?.lastName || ''}`.trim() || 'Team Member';

  const getEmpTitle = (e) =>
    e?.position?.title || e?.jobTitle || e?.title || e?.designation || 'Specialist';

  const getEmpDept = (e) =>
    e?.department?.name || (typeof e?.department === 'string' ? e.department : '') || 'Advisory';

  const getEmpInitials = (name) => {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return (name || 'TM').slice(0, 2).toUpperCase();
  };

  // Build Hierarchy Graph
  const { roots, childrenMap } = useMemo(() => {
    const cMap = new Map();
    const allIds = new Set(employees.map((e) => e.id));

    employees.forEach((e) => {
      const mId = e.managerId;
      if (mId && allIds.has(mId) && mId !== e.id) {
        if (!cMap.has(mId)) cMap.set(mId, []);
        cMap.get(mId).push(e);
      }
    });

    // Root nodes: no manager, manager is self, or manager is not in employee dataset
    let rootNodes = employees.filter(
      (e) => !e.managerId || e.managerId === e.id || !allIds.has(e.managerId)
    );

    // If no explicit root found (e.g. cycle), pick the highest ranking leader or first employee
    if (rootNodes.length === 0 && employees.length > 0) {
      rootNodes = [employees[0]];
    }

    return { roots: rootNodes, childrenMap: cMap };
  }, [employees]);

  // Expand / Collapse toggling
  const toggleCollapse = useCallback((id) => {
    setCollapsedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const expandAll = () => setCollapsedMap({});
  const collapseAll = () => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = true;
    });
    setCollapsedMap(map);
  };

  // Search filtering
  const matchingEmpIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set();
    const q = searchQuery.toLowerCase();
    const ids = new Set();
    employees.forEach((e) => {
      const name = getEmpName(e).toLowerCase();
      const title = getEmpTitle(e).toLowerCase();
      const dept = getEmpDept(e).toLowerCase();
      const code = (e.employeeNumber || '').toLowerCase();
      if (name.includes(q) || title.includes(q) || dept.includes(q) || code.includes(q)) {
        ids.add(e.id);
      }
    });
    return ids;
  }, [searchQuery, employees]);

  // Recursive Org Tree Node Component
  const TreeNode = ({ emp, level = 0 }) => {
    const children = childrenMap.get(emp.id) || [];
    const hasChildren = children.length > 0;
    const isCollapsed = Boolean(collapsedMap[emp.id]);
    const isMatched = matchingEmpIds.has(emp.id);

    return (
      <div className="flex flex-col items-center">
        {/* Employee Card Node */}
        <div
          onClick={() => setSelectedEmp(emp)}
          className={`relative group w-64 bg-white rounded-xl border-2 transition-all p-3.5 shadow-sm cursor-pointer select-none ${
            isMatched
              ? 'border-[#0088ff] ring-2 ring-blue-100 shadow-md scale-105'
              : level === 0
              ? 'border-indigo-600 bg-gradient-to-b from-slate-900 to-[#191f3a] text-white shadow-md'
              : level === 1
              ? 'border-blue-500 bg-white hover:border-blue-600 hover:shadow-md'
              : 'border-slate-200 hover:border-blue-400 hover:shadow-md'
          }`}
        >
          {/* Level Pill */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                level === 0
                  ? 'bg-indigo-500 text-white'
                  : level === 1
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {level === 0 ? 'Firm Executive' : `Level ${level}`}
            </span>
            <span
              className={`text-[11px] font-mono font-medium ${
                level === 0 ? 'text-slate-300' : 'text-slate-400'
              }`}
            >
              {emp.employeeNumber || 'NDK'}
            </span>
          </div>

          {/* Avatar & Details */}
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl font-black text-sm flex items-center justify-center flex-shrink-0 shadow-inner ${
                level === 0
                  ? 'bg-[#0088ff] text-white'
                  : 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 text-[#0088ff]'
              }`}
            >
              {getEmpInitials(getEmpName(emp))}
            </div>
            <div className="min-w-0 flex-1">
              <h4
                className={`font-bold text-xs truncate ${
                  level === 0 ? 'text-white' : 'text-slate-900'
                }`}
              >
                {getEmpName(emp)}
              </h4>
              <p
                className={`text-[11px] font-medium truncate ${
                  level === 0 ? 'text-blue-300' : 'text-slate-600'
                }`}
              >
                {getEmpTitle(emp)}
              </p>
              <p
                className={`text-[10px] truncate ${
                  level === 0 ? 'text-slate-400' : 'text-slate-400'
                }`}
              >
                {getEmpDept(emp)}
              </p>
            </div>
          </div>

          {/* Subordinates Count / Toggle */}
          {hasChildren && (
            <div className="mt-3 pt-2 border-t border-slate-100/50 flex items-center justify-between">
              <span
                className={`text-[10px] font-semibold ${
                  level === 0 ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {children.length} Direct {children.length === 1 ? 'Report' : 'Reports'}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(emp.id);
                }}
                className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                  level === 0
                    ? 'bg-slate-800 text-blue-300 hover:bg-slate-700'
                    : 'bg-blue-50 text-[#0088ff] hover:bg-blue-100'
                }`}
              >
                {isCollapsed ? <Plus size={10} /> : <ChevronDown size={10} />}
                {isCollapsed ? 'Expand' : 'Collapse'}
              </button>
            </div>
          )}
        </div>

        {/* Tree Connectors & Children */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col items-center">
            {/* Vertical connector down from parent */}
            <div className="w-0.5 h-6 bg-slate-300" />

            {/* Horizontal rail across all children */}
            <div className="flex justify-center relative">
              {children.length > 1 && (
                <div
                  className="absolute top-0 h-0.5 bg-slate-300"
                  style={{
                    left: `calc(50% / ${children.length})`,
                    right: `calc(50% / ${children.length})`,
                  }}
                />
              )}

              {/* Children branches */}
              <div className="flex items-start gap-8">
                {children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center relative">
                    {/* Vertical connector down to child node */}
                    <div className="w-0.5 h-6 bg-slate-300" />
                    <TreeNode emp={child} level={level + 1} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-6 space-y-6 relative overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0088ff] text-white flex items-center justify-center font-bold">
            <Layers size={18} />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Interactive Organization Chart</h3>
            <p className="text-xs text-slate-500">
              Visual firm hierarchy, reporting lines, and departmental organogram.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-[220px]">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee in hierarchy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0088ff] focus:bg-white transition-all"
            />
          </div>

          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              onClick={expandAll}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-medium rounded hover:bg-white"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-900 font-medium rounded hover:bg-white"
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Organogram Canvas */}
      <div className="overflow-x-auto overflow-y-auto pb-12 pt-4 px-4 bg-white rounded-xl border border-slate-200 min-h-[500px] flex justify-center shadow-inner">
        {roots.length === 0 ? (
          <div className="py-24 text-center text-xs text-slate-400">
            <Users size={32} className="mx-auto mb-2 text-slate-300" />
            No employee hierarchy roots found.
          </div>
        ) : (
          <div className="flex items-start gap-16 py-4">
            {roots.map((root) => (
              <TreeNode key={root.id} emp={root} level={0} />
            ))}
          </div>
        )}
      </div>

      {/* 3. Slide-Out Employee Profile Card Drawer */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-sm bg-white h-full shadow-2xl flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-gradient-to-br from-slate-900 to-[#191f3a] text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#0088ff] text-white font-black text-base flex items-center justify-center shadow-md">
                  {getEmpInitials(getEmpName(selectedEmp))}
                </div>
                <div>
                  <h3 className="font-bold text-sm">{getEmpName(selectedEmp)}</h3>
                  <p className="text-xs text-blue-300">{getEmpTitle(selectedEmp)}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {selectedEmp.employeeNumber || 'NDK-STAFF'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEmp(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Details */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-700">
              <div className="space-y-3">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Department</span>
                  <span className="font-semibold text-slate-800">{getEmpDept(selectedEmp)}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Employment Status</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle size={10} /> Active
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Direct Manager</span>
                  <span className="font-semibold text-slate-800">
                    {employees.find((m) => m.id === selectedEmp.managerId)
                      ? getEmpName(employees.find((m) => m.id === selectedEmp.managerId))
                      : 'Managing Partner (Executive)'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Email ID</span>
                  <span className="font-mono text-slate-800 truncate max-w-[180px]">
                    {selectedEmp.user?.email || selectedEmp.email || 'corporate@ndakalaadvisory.co.ke'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-400">Official Contact</span>
                  <span className="font-mono text-slate-800">
                    {selectedEmp.phoneNumber || selectedEmp.phone || '+254 700 000 000'}
                  </span>
                </div>
              </div>

              {/* Direct Reportees Section */}
              {childrenMap.get(selectedEmp.id) && childrenMap.get(selectedEmp.id).length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                    Direct Reportees ({childrenMap.get(selectedEmp.id).length})
                  </h4>
                  <div className="space-y-1.5">
                    {childrenMap.get(selectedEmp.id).map((rep) => (
                      <div
                        key={rep.id}
                        onClick={() => setSelectedEmp(rep)}
                        className="p-2.5 rounded-lg border border-slate-200 hover:border-[#0088ff] bg-white flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{getEmpName(rep)}</p>
                          <p className="text-[10px] text-slate-400">{getEmpTitle(rep)}</p>
                        </div>
                        <span className="text-[10px] text-[#0088ff] font-medium">View →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Actions */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setSelectedEmp(null)}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md text-xs font-semibold"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
