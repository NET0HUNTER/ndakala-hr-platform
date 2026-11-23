import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Check,
  X,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Calendar,
  AlertCircle,
  FileText,
  ChevronDown,
  CheckCircle,
  XCircle,
  Shield,
  Layers,
  ArrowRight,
} from '../components/Icons';
import { apiGet, apiPost } from '../utils/api';

export default function OperationsApprovalsView({
  currentUser,
  onShowToast,
  onNavigateTab,
}) {
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState([]);
  const [counts, setCounts] = useState({ pendingCount: 0, approvedCount: 0, rejectedCount: 0, totalCount: 0 });

  // Filters & Search State (matching Zoho People)
  const [activeTopTab, setActiveTopTab] = useState('ALL_APPROVALS');
  const [statusFilter, setStatusFilter] = useState('PENDING'); // PENDING, APPROVED, REJECTED, ALL
  const [empStatusFilter, setEmpStatusFilter] = useState('ACTIVE'); // ACTIVE, ALL
  const [moduleFilter, setModuleFilter] = useState('ALL'); // ALL, LEAVE, CONFIG
  const [searchQuery, setSearchQuery] = useState('');

  // Dropdown open states for filter pills
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [empStatusDropdownOpen, setEmpStatusDropdownOpen] = useState(false);
  const [moduleDropdownOpen, setModuleDropdownOpen] = useState(false);

  // Selection & Batch Action State
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionInProgress, setActionInProgress] = useState(false);

  // Detail / Action Modal State
  const [detailModalItem, setDetailModalItem] = useState(null);
  const [actionModalItem, setActionModalItem] = useState(null);
  const [actionType, setActionType] = useState('APPROVE'); // APPROVE, REJECT, RETURN
  const [actionComments, setActionComments] = useState('');

  // Fetch Approvals from Backend API
  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (empStatusFilter !== 'ALL') params.append('employeeStatus', empStatusFilter);
      if (moduleFilter !== 'ALL') params.append('module', moduleFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await apiGet(`/operations/approvals?${params.toString()}`);
      if (res && res.data) {
        setApprovals(res.data);
        if (res.counts) setCounts(res.counts);
      } else if (Array.isArray(res)) {
        setApprovals(res);
      }
    } catch (err) {
      console.error('Failed to load approvals:', err);
      onShowToast?.(err.message || 'Failed to load approvals', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, empStatusFilter, moduleFilter, searchQuery, onShowToast]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  // Handle Multi-Select Checkboxes
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(approvals.map((item) => item.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Batch Action Handler
  const handleBatchAction = async (action, comments = '') => {
    if (selectedIds.length === 0) return;
    setActionInProgress(true);
    try {
      const res = await apiPost('/operations/approvals/batch', {
        itemIds: selectedIds,
        action,
        comments: comments || `Batch ${action.toLowerCase()} from Operations Approvals Hub`,
      });

      if (res?.success) {
        onShowToast?.(
          `Successfully ${action.toLowerCase()}d ${res.processedCount || selectedIds.length} request(s).`,
          'success'
        );
        setSelectedIds([]);
        fetchApprovals();
      } else {
        throw new Error(res?.error || 'Failed to process batch approval');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error processing batch action', 'error');
    } finally {
      setActionInProgress(false);
      setActionModalItem(null);
    }
  };

  // Single Item Action Handler
  const handleSingleAction = async (item, action, comments = '') => {
    setActionInProgress(true);
    try {
      const res = await apiPost('/operations/approvals/batch', {
        itemIds: [item.id],
        action,
        comments: comments || `${action} from Operations Approvals Hub`,
      });

      if (res?.success) {
        onShowToast?.(`Request ${item.requestId} ${action.toLowerCase()}d successfully.`, 'success');
        setSelectedIds((prev) => prev.filter((id) => id !== item.id));
        fetchApprovals();
      } else {
        throw new Error(res?.error || 'Action failed');
      }
    } catch (err) {
      onShowToast?.(err.message || 'Error performing action', 'error');
    } finally {
      setActionInProgress(false);
      setActionModalItem(null);
    }
  };

  // Status Badge Styling Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Pending
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Check size={12} className="text-emerald-600 stroke-[2.5]" />
            Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <X size={12} className="text-rose-600 stroke-[2.5]" />
            Rejected
          </span>
        );
      case 'RETURNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <RefreshCw size={12} className="text-blue-600 stroke-[2.5]" />
            Returned for Edit
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f7fa] overflow-hidden select-none">
      {/* 1. Header Bar matching Zoho People #operations/approvals */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 text-slate-800 font-semibold text-lg">
            <button
              type="button"
              onClick={() => onNavigateTab?.('operations', null)}
              className="text-slate-500 hover:text-[#0088ff] text-sm font-medium flex items-center gap-1 transition-colors"
            >
              Operations &gt;
            </button>
            <span className="text-[#191f3a] font-bold">Approvals</span>
          </div>

          {/* Top Sub-Tabs */}
          <div className="flex items-center space-x-4 border-l border-slate-200 pl-6">
            <button
              type="button"
              onClick={() => {
                setActiveTopTab('ALL_APPROVALS');
                setStatusFilter('ALL');
              }}
              className={`pb-1 text-sm font-medium transition-all relative ${
                activeTopTab === 'ALL_APPROVALS' && statusFilter === 'ALL'
                  ? 'text-[#0088ff] font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Approvals
              {activeTopTab === 'ALL_APPROVALS' && statusFilter === 'ALL' && (
                <div className="absolute -bottom-[13px] left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t-sm" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTopTab('PENDING_TAB');
                setStatusFilter('PENDING');
              }}
              className={`pb-1 text-sm font-medium transition-all relative ${
                statusFilter === 'PENDING'
                  ? 'text-[#0088ff] font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending ({counts.pendingCount})
              {statusFilter === 'PENDING' && (
                <div className="absolute -bottom-[13px] left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t-sm" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTopTab('APPROVED_TAB');
                setStatusFilter('APPROVED');
              }}
              className={`pb-1 text-sm font-medium transition-all relative ${
                statusFilter === 'APPROVED'
                  ? 'text-[#0088ff] font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Approved ({counts.approvedCount})
              {statusFilter === 'APPROVED' && (
                <div className="absolute -bottom-[13px] left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t-sm" />
              )}
            </button>
          </div>
        </div>

        {/* Refresh & Record Count */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={fetchApprovals}
            title="Refresh Feed"
            className="p-1.5 text-slate-500 hover:text-[#0088ff] hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md font-medium">
            Total Record Count : {approvals.length}
          </span>
        </div>
      </div>

      {/* 2. Zoho Filter Bar with Dynamic Filter Pills */}
      <div className="bg-[#f8fafc] border-b border-slate-200 px-6 py-2.5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Search Input */}
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Employee / Request ID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0088ff] shadow-2xs"
            />
          </div>

          {/* Filter Pill 1: Status */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setStatusDropdownOpen(!statusDropdownOpen);
                setEmpStatusDropdownOpen(false);
                setModuleDropdownOpen(false);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:border-slate-400 shadow-2xs"
            >
              <span className="text-slate-400">Status :</span>
              <span className="font-semibold text-slate-800">
                {statusFilter === 'ALL'
                  ? 'All Statuses'
                  : statusFilter === 'PENDING'
                  ? 'Pending'
                  : statusFilter === 'APPROVED'
                  ? 'Approved'
                  : statusFilter === 'REJECTED'
                  ? 'Rejected'
                  : 'Returned'}
              </span>
              <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>
            {statusDropdownOpen && (
              <div className="absolute left-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                {['PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'ALL'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                      statusFilter === s ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    {s === 'ALL'
                      ? 'All Statuses'
                      : s === 'PENDING'
                      ? 'Pending'
                      : s === 'APPROVED'
                      ? 'Approved'
                      : s === 'REJECTED'
                      ? 'Rejected'
                      : 'Returned'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Pill 2: Employee Status */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setEmpStatusDropdownOpen(!empStatusDropdownOpen);
                setStatusDropdownOpen(false);
                setModuleDropdownOpen(false);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:border-slate-400 shadow-2xs"
            >
              <span className="text-slate-400">Employee Status :</span>
              <span className="font-semibold text-slate-800">
                {empStatusFilter === 'ACTIVE' ? 'All Active Employee Requests' : 'All Requests'}
              </span>
              <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>
            {empStatusDropdownOpen && (
              <div className="absolute left-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmpStatusFilter('ACTIVE');
                    setEmpStatusDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                    empStatusFilter === 'ACTIVE' ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  All Active Employee Requests
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmpStatusFilter('ALL');
                    setEmpStatusDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                    empStatusFilter === 'ALL' ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  All Requests (Including Exited)
                </button>
              </div>
            )}
          </div>

          {/* Filter Pill 3: Request Type / Module */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setModuleDropdownOpen(!moduleDropdownOpen);
                setStatusDropdownOpen(false);
                setEmpStatusDropdownOpen(false);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-medium text-slate-700 hover:border-slate-400 shadow-2xs"
            >
              <span className="text-slate-400">Type :</span>
              <span className="font-semibold text-slate-800">
                {moduleFilter === 'ALL'
                  ? 'All Types'
                  : moduleFilter === 'LEAVE'
                  ? 'Leave Requests'
                  : 'Configuration Changes'}
              </span>
              <ChevronDown size={13} className="text-slate-400 ml-1" />
            </button>
            {moduleDropdownOpen && (
              <div className="absolute left-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setModuleFilter('ALL');
                    setModuleDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                    moduleFilter === 'ALL' ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  All Types
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModuleFilter('LEAVE');
                    setModuleDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                    moduleFilter === 'LEAVE' ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  Leave Requests
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModuleFilter('CONFIG');
                    setModuleDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-50 transition-colors ${
                    moduleFilter === 'CONFIG' ? 'font-bold text-[#0088ff] bg-blue-50/50' : 'text-slate-700'
                  }`}
                >
                  Configuration Changes
                </button>
              </div>
            )}
          </div>

          {/* Reset Filters Button */}
          {(statusFilter !== 'PENDING' || empStatusFilter !== 'ACTIVE' || moduleFilter !== 'ALL' || searchQuery) && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('PENDING');
                setEmpStatusFilter('ACTIVE');
                setModuleFilter('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-[#0088ff] hover:underline font-medium px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>

        {/* Batch Action Buttons (Zoho People Multi-Select Controls) */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 animate-fadeIn">
            <span className="text-xs font-semibold text-slate-700 bg-slate-200 px-2.5 py-1 rounded-md">
              {selectedIds.length} Selected
            </span>
            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => handleBatchAction('APPROVE')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0088ff] hover:bg-blue-600 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            >
              <Check size={14} className="stroke-[2.5]" />
              Approve
            </button>
            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => handleBatchAction('REJECT')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
            >
              <X size={14} className="stroke-[2.5]" />
              Reject
            </button>
          </div>
        )}
      </div>

      {/* 3. Main Approvals Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <RefreshCw size={28} className="animate-spin mb-3 text-[#0088ff]" />
            <p className="text-sm font-medium">Loading approval requests...</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-80 bg-white rounded-xl border border-slate-200 shadow-2xs p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-[#0088ff] mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">No Pending Approvals</h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4">
              All employee requests matching your filter criteria have been processed. New requests will appear here
              in real time.
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setModuleFilter('ALL');
              }}
              className="px-4 py-2 bg-[#0088ff] text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors shadow-2xs"
            >
              View Historical Approvals
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === approvals.length && approvals.length > 0}
                      onChange={handleSelectAll}
                      className="rounded text-[#0088ff] focus:ring-[#0088ff] cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Request Info</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Submitted On</th>
                  <th className="py-3 px-4">Stage / Approver</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">SLA / Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {approvals.map((item) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isPending = item.status === 'PENDING';

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        isSelected ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="rounded text-[#0088ff] focus:ring-[#0088ff] cursor-pointer"
                        />
                      </td>

                      {/* Request Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="font-bold text-slate-800 hover:text-[#0088ff] cursor-pointer" onClick={() => setDetailModalItem(item)}>
                              {item.requestId}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight uppercase ${
                                item.module === 'LEAVE'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              {item.module}
                            </span>
                          </div>
                          <span className="text-slate-600 font-medium text-[11px] line-clamp-1">
                            {item.title}
                          </span>
                          {item.details?.reason && (
                            <span className="text-slate-400 text-[10px] italic mt-0.5 line-clamp-1">
                              Reason: {item.details.reason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Employee Initiator */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#191f3a] text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                            {item.initiator.firstName?.[0] || 'U'}
                            {item.initiator.lastName?.[0] || ''}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 leading-tight">
                              {item.initiator.name}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {item.initiator.employeeNumber} · {item.initiator.departmentName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Submitted On */}
                      <td className="py-3.5 px-4 text-slate-600 font-medium">
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>

                      {/* Stage / Approver */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium text-[11px]">
                        {item.stageTitle || 'Maker-Checker Approval'}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{getStatusBadge(item.status)}</td>

                      {/* Due Date / SLA */}
                      <td className="py-3.5 px-4">
                        {item.dueDate ? (
                          <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                            <Clock size={12} className="text-slate-400" />
                            {new Date(item.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Normal SLA</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSingleAction(item, 'APPROVE')}
                                title="Approve Request"
                                className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white rounded-md transition-colors"
                              >
                                <Check size={14} className="stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActionModalItem(item);
                                  setActionType('REJECT');
                                  setActionComments('');
                                }}
                                title="Reject Request"
                                className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md transition-colors"
                              >
                                <X size={14} className="stroke-[2.5]" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailModalItem(item)}
                                title="View Details"
                                className="p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                              >
                                <FileText size={14} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDetailModalItem(item)}
                              className="text-xs text-[#0088ff] hover:underline font-semibold"
                            >
                              View Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Request Details Modal Drawer */}
      {detailModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-end animate-fadeIn">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col justify-between animate-slideLeft">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-800 text-base">{detailModalItem.requestId}</span>
                <span className="text-xs text-slate-400">·</span>
                {getStatusBadge(detailModalItem.status)}
              </div>
              <button
                type="button"
                onClick={() => setDetailModalItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Initiator Card */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-[#191f3a] text-white flex items-center justify-center font-bold text-sm">
                  {detailModalItem.initiator.firstName?.[0]}
                  {detailModalItem.initiator.lastName?.[0]}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{detailModalItem.initiator.name}</h4>
                  <p className="text-xs text-slate-500">
                    {detailModalItem.initiator.employeeNumber} · {detailModalItem.initiator.designationName}
                  </p>
                  <p className="text-xs text-slate-400">{detailModalItem.initiator.departmentName}</p>
                </div>
              </div>

              {/* Request Details Breakdown */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">Request Information</h5>
                <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                  <div className="p-3 flex justify-between">
                    <span className="text-slate-500 font-medium">Type</span>
                    <span className="font-semibold text-slate-800">{detailModalItem.title}</span>
                  </div>
                  <div className="p-3 flex justify-between">
                    <span className="text-slate-500 font-medium">Submitted Date</span>
                    <span className="text-slate-700">
                      {detailModalItem.submittedAt ? new Date(detailModalItem.submittedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                  {detailModalItem.details?.startDate && (
                    <div className="p-3 flex justify-between">
                      <span className="text-slate-500 font-medium">Leave Period</span>
                      <span className="font-semibold text-slate-800">
                        {detailModalItem.details.startDate} to {detailModalItem.details.endDate} ({detailModalItem.details.workingDaysDeducted} days)
                      </span>
                    </div>
                  )}
                  {detailModalItem.details?.reason && (
                    <div className="p-3">
                      <span className="text-slate-500 font-medium block mb-1">Reason / Notes</span>
                      <p className="text-slate-800 bg-slate-50 p-2.5 rounded border border-slate-200">
                        {detailModalItem.details.reason}
                      </p>
                    </div>
                  )}
                  {detailModalItem.details?.definitionName && (
                    <div className="p-3 flex justify-between">
                      <span className="text-slate-500 font-medium">Workflow Rule</span>
                      <span className="font-semibold text-slate-800">{detailModalItem.details.definitionName}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Microsoft 365 Shared Calendar & Mail Notice */}
              {detailModalItem.module === 'LEAVE' && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 flex items-start gap-2">
                  <Shield size={16} className="text-[#0088ff] flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Microsoft 365 App-Only Sync:</span>
                    <p className="mt-0.5 text-[11px] text-blue-700">
                      Upon approval, an informational All-Day event will sync automatically to the department's Outlook
                      shared calendar (without touching personal mailboxes or OOO settings).
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setDetailModalItem(null)}
                className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              {detailModalItem.status === 'PENDING' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActionModalItem(detailModalItem);
                      setActionType('REJECT');
                      setActionComments('');
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSingleAction(detailModalItem, 'APPROVE');
                      setDetailModalItem(null);
                    }}
                    className="px-4 py-2 bg-[#0088ff] hover:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Approve Request
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. Reject / Return Comments Dialog Modal */}
      {actionModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="font-bold text-slate-800 text-base mb-2">
              {actionType === 'REJECT' ? 'Reject Request' : 'Return Request for Edit'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Please provide a reason for {actionType.toLowerCase()}ing request{' '}
              <span className="font-semibold text-slate-700">{actionModalItem.requestId}</span>. This will be
              recorded in the audit trail.
            </p>
            <textarea
              rows={3}
              value={actionComments}
              onChange={(e) => setActionComments(e.target.value)}
              placeholder="Enter reason or comments (required)..."
              className="w-full text-xs p-3 border border-slate-300 rounded-lg focus:outline-none focus:border-[#0088ff] mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionModalItem(null)}
                className="px-3 py-1.5 border border-slate-300 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!actionComments.trim() || actionInProgress}
                onClick={() => handleSingleAction(actionModalItem, actionType, actionComments)}
                className={`px-4 py-1.5 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 ${
                  actionType === 'REJECT' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Confirm {actionType === 'REJECT' ? 'Rejection' : 'Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
