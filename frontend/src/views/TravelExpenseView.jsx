import React, { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  DollarSign,
  Plus,
  CheckCircle,
  X,
  Calendar,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, unwrapList } from '../utils/api';

const fmtKes = (n) =>
  `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_BADGE = {
  SUBMITTED: 'bg-blue-50 text-[#0088ff] border-blue-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REIMBURSED: 'bg-teal-50 text-teal-800 border-teal-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function TravelExpenseView({
  topContextTab = 'travel',
  setTopContextTab,
  currentUser,
  onShowToast,
}) {
  const activeTab = topContextTab === 'expenses' ? 'expenses' : 'travel';

  const [requests, setRequests] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);

  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const roles = new Set((currentUser?.roles || []).map((r) => String(r).toLowerCase()));
  const perms = new Set(currentUser?.permissions || []);
  const canApprove =
    roles.has('system_admin') ||
    roles.has('managing_partner') ||
    roles.has('operations_director') ||
    roles.has('head_of_hr') ||
    roles.has('hr_manager') ||
    roles.has('hr_officer') ||
    perms.has('config.manage') ||
    perms.has('employees.view');

  const today = new Date().toISOString().slice(0, 10);
  const [reqForm, setReqForm] = useState({
    destination: '',
    purpose: '',
    departureDate: today,
    returnDate: today,
    transportMode: 'FLIGHT',
    perDiemDays: 2,
    estimatedBudgetKes: 45000,
    advanceRequestedKes: 15000,
    billableToClient: true,
    clientName: '',
    notes: '',
  });

  const [expForm, setExpForm] = useState({
    travelRequestId: '',
    category: 'HOTEL',
    expenseDate: today,
    amountKes: 12000,
    billableToClient: true,
    clientName: '',
    receiptRef: '',
    notes: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [trRes, exRes] = await Promise.all([
        apiGet('/api/v1/workspace/travel-requests').catch(() => ({ items: [] })),
        apiGet('/api/v1/workspace/travel-expenses').catch(() => ({ items: [] })),
      ]);
      const reqList = unwrapList(trRes);
      const expList = unwrapList(exRes);
      setRequests(reqList);
      setExpenses(expList);
      if (!expForm.travelRequestId && reqList[0]?.id) {
        setExpForm((f) => ({ ...f, travelRequestId: reqList[0].id }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost('/api/v1/workspace/travel-requests', {
        ...reqForm,
        perDiemDays: Number(reqForm.perDiemDays) || 1,
        estimatedBudgetKes: Number(reqForm.estimatedBudgetKes) || 0,
        advanceRequestedKes: Number(reqForm.advanceRequestedKes) || 0,
      });
      onShowToast?.('Travel request submitted cleanly.');
      setRequestModalOpen(false);
      setReqForm({ ...reqForm, destination: '', purpose: '', clientName: '', notes: '' });
      await loadAll();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to create travel request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost('/api/v1/workspace/travel-expenses', {
        ...expForm,
        amountKes: Number(expForm.amountKes) || 0,
      });
      onShowToast?.('Travel expense logged to reimbursement ledger.');
      setExpenseModalOpen(false);
      setExpForm({ ...expForm, receiptRef: '', notes: '' });
      await loadAll();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to log travel expense', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewRequest = async (id, status, amountKes) => {
    try {
      await apiPatch(`/api/v1/workspace/travel-requests/${id}`, {
        status,
        ...(status === 'REIMBURSED' ? { reimbursementAmountKes: Number(amountKes) || 0 } : {}),
      });
      onShowToast?.(`Travel request marked ${status}.`);
      await loadAll();
    } catch (err) {
      onShowToast?.(err?.message || 'Update failed', 'error');
    }
  };

  const handleReviewExpense = async (id, status) => {
    try {
      await apiPatch(`/api/v1/workspace/travel-expenses/${id}`, { status });
      onShowToast?.(`Travel expense marked ${status}.`);
      await loadAll();
    } catch (err) {
      onShowToast?.(err?.message || 'Expense update failed', 'error');
    }
  };

  const pendingReqCount = requests.filter((r) => r.status === 'SUBMITTED').length;
  const billableTotalKes =
    requests.filter((r) => r.billableToClient).reduce((s, r) => s + Number(r.estimatedBudgetKes || 0), 0) +
    expenses.filter((e) => e.billableToClient).reduce((s, e) => s + Number(e.amountKes || 0), 0);
  const reimbursedTotalKes = expenses
    .filter((e) => e.status === 'REIMBURSED')
    .reduce((s, e) => s + Number(e.amountKes || 0), 0);

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Sub-Tab Bar */}
      <div className="h-[44px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-6 h-full">
          {[
            { id: 'travel', label: `Travel Request (${requests.length})`, icon: Briefcase },
            { id: 'expenses', label: `Travel Expense (${expenses.length})`, icon: DollarSign },
          ].map((t) => {
            const IconComp = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopContextTab && setTopContextTab(t.id)}
                className={`relative h-full flex items-center gap-1.5 font-medium transition-colors ${
                  active ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <IconComp size={13} />
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => (activeTab === 'travel' ? setRequestModalOpen(true) : setExpenseModalOpen(true))}
          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1.5"
        >
          <Plus size={13} />
          <span>{activeTab === 'travel' ? 'New Travel Request' : 'Log Travel Expense'}</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Travel Requests</div>
            <div className="text-lg font-bold text-slate-800 mt-1">{requests.length}</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Pending Approvals</div>
            <div className="text-lg font-bold text-amber-600 mt-1">{pendingReqCount}</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Client-Billable Exposure</div>
            <div className="text-lg font-bold text-[#0088ff] mt-1">{fmtKes(billableTotalKes)}</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Reimbursed Expenses</div>
            <div className="text-lg font-bold text-emerald-600 mt-1">{fmtKes(reimbursedTotalKes)}</div>
          </div>
        </div>

        {/* TAB 1: TRAVEL REQUESTS */}
        {activeTab === 'travel' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Employee</th>
                  <th className="py-2.5 px-3 font-semibold">Destination &amp; Purpose</th>
                  <th className="py-2.5 px-3 font-semibold">Dates &amp; Mode</th>
                  <th className="py-2.5 px-3 font-semibold">Budget / Advance</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Billability</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      Loading travel requests...
                    </td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No travel requests recorded yet. Click <strong className="text-[#0088ff]">New Travel Request</strong> to submit one.
                    </td>
                  </tr>
                ) : (
                  requests.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-800">{r.employeeName}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{r.destination}</div>
                        <div className="text-[11px] text-slate-500">{r.purpose}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        <div className="font-mono text-[11px]">
                          {r.departureDate} → {r.returnDate}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {r.transportMode} • {r.perDiemDays}d per diem
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono font-semibold text-slate-800">{fmtKes(r.estimatedBudgetKes)}</div>
                        {Number(r.advanceRequestedKes) > 0 && (
                          <div className="text-[10px] text-amber-700">Adv: {fmtKes(r.advanceRequestedKes)}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            r.billableToClient
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {r.billableToClient ? r.clientName || 'Client Billable' : 'Internal'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                            STATUS_BADGE[r.status] || STATUS_BADGE.SUBMITTED
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canApprove && r.status === 'SUBMITTED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReviewRequest(r.id, 'APPROVED')}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewRequest(r.id, 'REJECTED')}
                                className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px] font-semibold"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canApprove && r.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => handleReviewRequest(r.id, 'REIMBURSED', r.estimatedBudgetKes)}
                              className="px-2.5 py-1 bg-teal-600 text-white rounded text-[11px] font-semibold"
                            >
                              Mark Reimbursed
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: TRAVEL EXPENSE REIMBURSEMENT LEDGER */}
        {activeTab === 'expenses' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Employee</th>
                  <th className="py-2.5 px-3 font-semibold">Category &amp; Date</th>
                  <th className="py-2.5 px-3 font-semibold">Receipt Ref &amp; Notes</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Amount (KES)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Billable</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      No travel expenses logged yet. Click <strong className="text-[#0088ff]">Log Travel Expense</strong> to submit a reimbursement claim.
                    </td>
                  </tr>
                ) : (
                  expenses.map((ex) => (
                    <tr key={ex.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-semibold text-slate-800">{ex.employeeName}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-800">{ex.category.replace('_', ' ')}</div>
                        <div className="font-mono text-[10px] text-slate-400">{ex.expenseDate}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-[11px] text-slate-700">{ex.receiptRef}</div>
                        {ex.notes && <div className="text-[11px] text-slate-500">{ex.notes}</div>}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800">
                        {fmtKes(ex.amountKes)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            ex.billableToClient
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {ex.billableToClient ? ex.clientName || 'Client Billable' : 'Internal'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                            STATUS_BADGE[ex.status] || STATUS_BADGE.SUBMITTED
                          }`}
                        >
                          {ex.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          {canApprove && ex.status === 'SUBMITTED' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleReviewExpense(ex.id, 'APPROVED')}
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-semibold"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleReviewExpense(ex.id, 'REJECTED')}
                                className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 rounded text-[11px] font-semibold"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {canApprove && ex.status === 'APPROVED' && (
                            <button
                              type="button"
                              onClick={() => handleReviewExpense(ex.id, 'REIMBURSED')}
                              className="px-2.5 py-1 bg-teal-600 text-white rounded text-[11px] font-semibold"
                            >
                              Reimburse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal 1: New Travel Request */}
      {requestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <Calendar size={15} className="text-[#0088ff]" />
                <span>New Travel Request</span>
              </h3>
              <button type="button" onClick={() => setRequestModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destination *</label>
                  <input
                    required
                    value={reqForm.destination}
                    onChange={(e) => setReqForm({ ...reqForm, destination: e.target.value })}
                    placeholder="e.g. Mombasa / Kigali"
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Transport Mode</label>
                  <select
                    value={reqForm.transportMode}
                    onChange={(e) => setReqForm({ ...reqForm, transportMode: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="FLIGHT">Flight</option>
                    <option value="RAIL_SGR">Rail (SGR)</option>
                    <option value="ROAD">Road / Self-Drive</option>
                    <option value="LOCAL_TAXI">Local Taxi / Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Departure Date *</label>
                  <input
                    type="date"
                    required
                    value={reqForm.departureDate}
                    onChange={(e) => setReqForm({ ...reqForm, departureDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Return Date *</label>
                  <input
                    type="date"
                    required
                    value={reqForm.returnDate}
                    onChange={(e) => setReqForm({ ...reqForm, returnDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estimated Budget (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={reqForm.estimatedBudgetKes}
                    onChange={(e) => setReqForm({ ...reqForm, estimatedBudgetKes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cash Advance Requested (KES)</label>
                  <input
                    type="number"
                    min="0"
                    value={reqForm.advanceRequestedKes}
                    onChange={(e) => setReqForm({ ...reqForm, advanceRequestedKes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Business Purpose *</label>
                <input
                  required
                  value={reqForm.purpose}
                  onChange={(e) => setReqForm({ ...reqForm, purpose: e.target.value })}
                  placeholder="Client audit fieldwork, board advisory workshop..."
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center p-3 bg-slate-50 border border-slate-200 rounded">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reqForm.billableToClient}
                    onChange={(e) => setReqForm({ ...reqForm, billableToClient: e.target.checked })}
                  />
                  <span className="font-semibold text-slate-700">Billable to Client</span>
                </label>
                {reqForm.billableToClient && (
                  <input
                    value={reqForm.clientName}
                    onChange={(e) => setReqForm({ ...reqForm, clientName: e.target.value })}
                    placeholder="Client / Engagement Name"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                  />
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded flex items-center gap-1.5"
                >
                  <CheckCircle size={13} />
                  <span>{submitting ? 'Submitting...' : 'Submit Travel Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Log Travel Expense */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold flex items-center gap-2">
                <DollarSign size={15} className="text-emerald-400" />
                <span>Log Travel Expense Claim</span>
              </h3>
              <button type="button" onClick={() => setExpenseModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Category</label>
                  <select
                    value={expForm.category}
                    onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="FLIGHT">Flight / Airfare</option>
                    <option value="HOTEL">Hotel / Accommodation</option>
                    <option value="PER_DIEM">Per Diem Allowance</option>
                    <option value="GROUND_TRANSPORT">Ground Transport / Taxi</option>
                    <option value="MEALS">Meals &amp; Subsistence</option>
                    <option value="CLIENT_ENTERTAINMENT">Client Entertainment</option>
                    <option value="OTHER">Other Travel Expense</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expense Date *</label>
                  <input
                    type="date"
                    required
                    value={expForm.expenseDate}
                    onChange={(e) => setExpForm({ ...expForm, expenseDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (KES) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={expForm.amountKes}
                    onChange={(e) => setExpForm({ ...expForm, amountKes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Receipt / ETR Reference</label>
                  <input
                    value={expForm.receiptRef}
                    onChange={(e) => setExpForm({ ...expForm, receiptRef: e.target.value })}
                    placeholder="e.g. KRA-ETR-994821"
                    className="w-full px-3 py-2 border border-slate-300 rounded font-mono"
                  />
                </div>
              </div>

              {requests.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Linked Travel Request</label>
                  <select
                    value={expForm.travelRequestId}
                    onChange={(e) => setExpForm({ ...expForm, travelRequestId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="">-- Standalone Expense --</option>
                    {requests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.destination} ({r.departureDate}) — {r.employeeName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 items-center p-2.5 bg-slate-50 border border-slate-200 rounded">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expForm.billableToClient}
                    onChange={(e) => setExpForm({ ...expForm, billableToClient: e.target.checked })}
                  />
                  <span className="font-semibold text-slate-700">Billable to Client</span>
                </label>
                {expForm.billableToClient && (
                  <input
                    value={expForm.clientName}
                    onChange={(e) => setExpForm({ ...expForm, clientName: e.target.value })}
                    placeholder="Client Name"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={expForm.notes}
                  onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
                  placeholder="Receipt description or approval notes..."
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded"
                >
                  {submitting ? 'Saving...' : 'Submit Expense Claim'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
