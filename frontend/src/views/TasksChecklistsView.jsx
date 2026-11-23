import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle,
  Plus,
  Search,
  X,
  Trash2,
  List,
  Clock,
  Users,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, apiDelete, unwrapList } from '../utils/api';

const CHECKLIST_STORAGE_KEY = 'ndakala_operational_checklists_v1';

const DEFAULT_CHECKLISTS = [
  {
    id: 'chk-onb',
    title: 'New Hire Onboarding Milestone Checklist',
    stage: 'Onboarding',
    owner: 'People & Operations',
    items: [
      { id: 'c1', text: 'Verify National ID, KRA PIN, NSSF & SHIF enrollment', done: true },
      { id: 'c2', text: 'Provision Microsoft 365 account & SharePoint AES-256 employee vault', done: true },
      { id: 'c3', text: 'Execute signed Employment Agreement & Confidentiality NDA', done: true },
      { id: 'c4', text: 'Assign 90-Day Probation SMART Objectives with Line Manager', done: false },
      { id: 'c5', text: 'Complete Company Handbook & Data Protection policy acknowledgement', done: false },
    ],
  },
  {
    id: 'chk-off',
    title: 'Employee Separation & Offboarding Clearance Checklist',
    stage: 'Offboarding',
    owner: 'HR & IT Security',
    items: [
      { id: 'o1', text: 'Collect corporate laptop, access badge & encrypted storage tokens', done: true },
      { id: 'o2', text: 'Revoke Microsoft 365 SSO session & archive mailbox per retention policy', done: false },
      { id: 'o3', text: 'Compute final prorated salary, accrued leave encashment & P9A tax form', done: false },
      { id: 'o4', text: 'Issue Certificate of Service (Kenyan Employment Act 2007 Section 51)', done: false },
    ],
  },
  {
    id: 'chk-pay',
    title: 'Monthly Statutory Payroll Close Checklist (Kenya)',
    stage: 'Payroll & Compliance',
    owner: 'Finance & Managing Partner',
    items: [
      { id: 'p1', text: 'Lock attendance regularization & approved leave/overtime inputs', done: true },
      { id: 'p2', text: 'Verify KRA PAYE, NSSF Tier I/II, SHIF 2.75% & Housing Levy 1.5%', done: true },
      { id: 'p3', text: 'Maker-Checker Managing Partner sign-off & KBA Bank EFT export', done: false },
      { id: 'p4', text: 'Dispatch zero-PII link-only payslip notifications via M365 Graph', done: false },
    ],
  },
];

function readChecklists() {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CHECKLISTS;
  } catch {
    return DEFAULT_CHECKLISTS;
  }
}

const PRIORITY_BADGE = {
  HIGH: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-800 border-amber-200',
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_BADGE = {
  TODO: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_PROGRESS: 'bg-blue-50 text-[#0088ff] border-blue-200',
  DONE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function TasksChecklistsView({
  topContextTab = 'mytasks',
  setTopContextTab,
  currentUser,
  employees = [],
  onShowToast,
}) {
  const activeTab = ['mytasks', 'tracktasks', 'alltasks', 'checklists'].includes(topContextTab)
    ? topContextTab
    : 'mytasks';

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('TOTAL'); // TOTAL | OPEN | COMPLETED
  const [viewMode, setViewMode] = useState('LIST'); // LIST | BOARD
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [checklists, setChecklists] = useState(readChecklists);
  const [newItemText, setNewItemText] = useState({});

  const today = new Date().toISOString().slice(0, 10);
  const [taskForm, setTaskForm] = useState({
    title: '',
    dueDate: today,
    priority: 'MEDIUM',
    assigneeEmployeeId: '',
    notes: '',
  });

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/api/v1/workspace/personal-tasks').catch(() => ({ items: [] }));
      setTasks(unwrapList(res));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;
    setSubmitting(true);
    try {
      await apiPost('/api/v1/workspace/personal-tasks', {
        title: taskForm.title.trim(),
        dueDate: taskForm.dueDate,
        priority: taskForm.priority,
        assigneeEmployeeId: taskForm.assigneeEmployeeId || undefined,
        notes: taskForm.notes.trim() || undefined,
      });
      onShowToast?.('Operational task created.');
      setAddModalOpen(false);
      setTaskForm({ title: '', dueDate: today, priority: 'MEDIUM', assigneeEmployeeId: '', notes: '' });
      await loadTasks();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to create task', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (taskId, nextStatus) => {
    try {
      await apiPatch(`/api/v1/workspace/personal-tasks/${taskId}`, { status: nextStatus });
      onShowToast?.(`Task moved to ${nextStatus.replace('_', ' ')}.`);
      await loadTasks();
    } catch (err) {
      onShowToast?.(err?.message || 'Status update failed', 'error');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await apiDelete(`/api/v1/workspace/personal-tasks/${taskId}`);
      onShowToast?.('Task deleted.');
      await loadTasks();
    } catch (err) {
      onShowToast?.(err?.message || 'Delete failed', 'error');
    }
  };

  const saveChecklists = (next) => {
    setChecklists(next);
    try {
      localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const toggleChecklistItem = (chkId, itemId) => {
    const next = checklists.map((chk) =>
      chk.id === chkId
        ? {
            ...chk,
            items: chk.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
          }
        : chk
    );
    saveChecklists(next);
  };

  const addChecklistItem = (chkId) => {
    const txt = (newItemText[chkId] || '').trim();
    if (!txt) return;
    const next = checklists.map((chk) =>
      chk.id === chkId
        ? { ...chk, items: [...chk.items, { id: `ci-${Date.now()}`, text: txt, done: false }] }
        : chk
    );
    saveChecklists(next);
    setNewItemText((m) => ({ ...m, [chkId]: '' }));
    onShowToast?.('Checklist item added.');
  };

  // Scope tasks by active tab
  const scopedTasks = tasks.filter((t) => {
    if (activeTab === 'mytasks') {
      return (
        !currentUser?.employeeId ||
        t.assigneeEmployeeId === currentUser.employeeId ||
        t.createdById === currentUser.id
      );
    }
    if (activeTab === 'tracktasks') {
      return !currentUser?.id || t.createdById === currentUser.id || t.assigneeEmployeeId !== currentUser.employeeId;
    }
    return true;
  });

  const openCount = scopedTasks.filter((t) => t.status !== 'DONE').length;
  const doneCount = scopedTasks.filter((t) => t.status === 'DONE').length;

  const visibleTasks = scopedTasks.filter((t) => {
    if (statusFilter === 'OPEN' && t.status === 'DONE') return false;
    if (statusFilter === 'COMPLETED' && t.status !== 'DONE') return false;
    const q = search.trim().toLowerCase();
    if (q) {
      return (
        (t.title || '').toLowerCase().includes(q) ||
        (t.assigneeName || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Sub-Tab Switcher Bar */}
      <div className="h-[44px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-6 h-full overflow-x-auto">
          {[
            { id: 'mytasks', label: 'My Tasks' },
            { id: 'tracktasks', label: 'Track Tasks' },
            { id: 'alltasks', label: `All Tasks (${tasks.length})` },
            { id: 'checklists', label: `Checklists (${checklists.length})` },
          ].map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopContextTab && setTopContextTab(t.id)}
                className={`relative h-full flex items-center whitespace-nowrap font-medium transition-colors ${
                  active ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1.5"
        >
          <Plus size={13} />
          <span>Add Task</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {activeTab !== 'checklists' ? (
          <>
            {/* Status Filter Pills (Total / Open / Completed) + Search + View Switch */}
            <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'TOTAL', label: `Total (${scopedTasks.length})` },
                  { id: 'OPEN', label: `Open (${openCount})` },
                  { id: 'COMPLETED', label: `Completed (${doneCount})` },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      statusFilter === f.id
                        ? 'bg-[#191f3a] text-white border-[#191f3a]'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks..."
                    className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-48"
                  />
                </div>
                <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('LIST')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                      viewMode === 'LIST' ? 'bg-[#0088ff] text-white' : 'text-slate-600'
                    }`}
                  >
                    <List size={12} /> List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('BOARD')}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 ${
                      viewMode === 'BOARD' ? 'bg-[#0088ff] text-white' : 'text-slate-600'
                    }`}
                  >
                    <Clock size={12} /> Board
                  </button>
                </div>
              </div>
            </div>

            {/* LIST VIEW */}
            {viewMode === 'LIST' && (
              <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Task</th>
                      <th className="py-2.5 px-3 font-semibold">Assignee</th>
                      <th className="py-2.5 px-3 font-semibold">Due Date</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Priority</th>
                      <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          Loading tasks...
                        </td>
                      </tr>
                    ) : visibleTasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-500">
                          No tasks in this view. Click <strong className="text-[#0088ff]">Add Task</strong> to create an operational action item.
                        </td>
                      </tr>
                    ) : (
                      visibleTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-4">
                            <div className={`font-semibold ${t.status === 'DONE' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                              {t.title}
                            </div>
                            {t.notes && <div className="text-[11px] text-slate-500">{t.notes}</div>}
                          </td>
                          <td className="py-3 px-3 text-slate-700 font-medium">{t.assigneeName || 'Unassigned'}</td>
                          <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{t.dueDate}</td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.MEDIUM}`}>
                              {t.priority}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${STATUS_BADGE[t.status] || STATUS_BADGE.TODO}`}>
                              {t.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              {t.status === 'TODO' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(t.id, 'IN_PROGRESS')}
                                  className="px-2 py-1 bg-blue-50 text-[#0088ff] border border-blue-200 rounded text-[11px] font-semibold"
                                >
                                  Start
                                </button>
                              )}
                              {t.status !== 'DONE' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(t.id, 'DONE')}
                                  className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold"
                                >
                                  Complete
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(t.id, 'TODO')}
                                  className="px-2 py-1 border border-slate-300 text-slate-600 rounded text-[11px] font-medium"
                                >
                                  Reopen
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(t.id)}
                                className="text-slate-400 hover:text-rose-600 p-1"
                                title="Delete Task"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* KANBAN BOARD VIEW */}
            {viewMode === 'BOARD' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: 'TODO', label: 'To Do', hdr: 'border-t-slate-400' },
                  { id: 'IN_PROGRESS', label: 'In Progress', hdr: 'border-t-[#0088ff]' },
                  { id: 'DONE', label: 'Completed', hdr: 'border-t-emerald-500' },
                ].map((col) => {
                  const colItems = visibleTasks.filter((t) => t.status === col.id);
                  return (
                    <div key={col.id} className={`bg-white rounded-md border border-slate-200 border-t-4 ${col.hdr} p-3.5 space-y-2.5`}>
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="font-bold text-slate-800">{col.label}</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {colItems.length}
                        </span>
                      </div>
                      {colItems.length === 0 ? (
                        <p className="text-[11px] text-slate-400 py-4 text-center">No tasks</p>
                      ) : (
                        colItems.map((t) => (
                          <div key={t.id} className="p-3 border border-slate-200 rounded bg-slate-50/40 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-slate-800">{t.title}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${PRIORITY_BADGE[t.priority] || PRIORITY_BADGE.MEDIUM}`}>
                                {t.priority}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center justify-between">
                              <span>{t.assigneeName}</span>
                              <span className="font-mono">{t.dueDate}</span>
                            </div>
                            <div className="pt-1.5 flex items-center gap-1.5">
                              {col.id !== 'IN_PROGRESS' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(t.id, 'IN_PROGRESS')}
                                  className="px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded text-[10px] font-semibold"
                                >
                                  In Progress
                                </button>
                              )}
                              {col.id !== 'DONE' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateStatus(t.id, 'DONE')}
                                  className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-semibold"
                                >
                                  Done
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* OPERATIONAL CHECKLISTS TAB */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {checklists.map((chk) => {
              const completed = chk.items.filter((i) => i.done).length;
              const pct = chk.items.length ? Math.round((completed / chk.items.length) * 100) : 0;
              return (
                <div key={chk.id} className="bg-white rounded-md border border-slate-200 p-4 flex flex-col justify-between gap-3">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#0088ff]">
                          {chk.stage}
                        </span>
                        <h4 className="font-bold text-slate-800 text-xs mt-0.5">{chk.title}</h4>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Users size={11} /> Owner: {chk.owner}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0088ff] font-mono font-bold text-[10px]">
                        {pct}%
                      </span>
                    </div>

                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#0088ff] transition-all" style={{ width: `${pct}%` }} />
                    </div>

                    <div className="space-y-2">
                      {chk.items.map((item) => (
                        <label key={item.id} className="flex items-start gap-2 cursor-pointer text-[11px]">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => toggleChecklistItem(chk.id, item.id)}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <span className={item.done ? 'line-through text-slate-400' : 'text-slate-700'}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex gap-1.5">
                    <input
                      type="text"
                      value={newItemText[chk.id] || ''}
                      onChange={(e) => setNewItemText((m) => ({ ...m, [chk.id]: e.target.value }))}
                      placeholder="Add checklist step..."
                      className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => addChecklistItem(chk.id)}
                      className="px-2.5 py-1.5 bg-[#0088ff] text-white rounded text-[11px] font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Task Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <CheckCircle size={15} className="text-[#0088ff]" />
                <span>Add Operational Task</span>
              </h3>
              <button type="button" onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Task Title *</label>
                <input
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="e.g. Complete Q4 Probation Review Sign-Off"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Priority</label>
                  <select
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>
              {employees.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Assign To</label>
                  <select
                    value={taskForm.assigneeEmployeeId}
                    onChange={(e) => setTaskForm({ ...taskForm, assigneeEmployeeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="">Myself</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName} ({e.employeeNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={taskForm.notes}
                  onChange={(e) => setTaskForm({ ...taskForm, notes: e.target.value })}
                  placeholder="Checklist context or deliverable instructions..."
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded"
                >
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
