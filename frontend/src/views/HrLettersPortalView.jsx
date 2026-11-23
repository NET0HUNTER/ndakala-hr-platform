import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  CheckCircle,
  X,
  Download,
  Star,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch } from '../utils/api';

const LETTER_TABS = [
  {
    id: 'addressproof',
    letterType: 'ADDRESS_PROOF',
    label: 'Address Proof',
    subtitle: 'Official employment & residential address verification for banking, utilities, or tenancy.',
    reasons: ['Opening a Bank Account', 'Broadband Connection', 'Gas Connection', 'Tenancy / Lease', 'Others'],
    detailsLabel: 'Present Address / Change Details',
    detailsPlaceholder: 'Plot / Apartment, Street, City, Postal Code...',
  },
  {
    id: 'bonafide',
    letterType: 'BONAFIDE',
    label: 'Bonafide Letter',
    subtitle: 'Active employment confirmation for embassy visa applications, mortgages, or academic enrollment.',
    reasons: [
      'Embassy / Visa Application',
      'Bank Loan / Mortgage',
      'Higher Education Enrollment',
      'Professional Association',
      'Others',
    ],
    detailsLabel: 'Addressed To (Recipient Institution)',
    detailsPlaceholder: 'e.g. The Consular Officer, Embassy of..., Nairobi',
  },
  {
    id: 'experience',
    letterType: 'EXPERIENCE',
    label: 'Experience Letter',
    subtitle: 'Verified statement of professional tenure, role title, and advisory practice contributions.',
    reasons: [
      'Employment Verification',
      'Professional Licensing (ICPAK / LSK / CISA)',
      'Certificate of Service',
      'Others',
    ],
    detailsLabel: 'Role Highlights / Practice Notes (Optional)',
    detailsPlaceholder: 'Key engagements, dates, or specific verification notes...',
  },
];

const STATUS_BADGE = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SUBMITTED: 'bg-blue-50 text-[#0088ff] border-blue-200',
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function HrLettersPortalView({
  topContextTab = 'addressproof',
  setTopContextTab,
  currentUser,
  employees = [],
  onShowToast,
}) {
  const activeTabMeta = LETTER_TABS.find((t) => t.id === topContextTab) || LETTER_TABS[0];

  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pdfPreviewItem, setPdfPreviewItem] = useState(null);

  const roles = new Set((currentUser?.roles || []).map((r) => String(r).toLowerCase()));
  const perms = new Set(currentUser?.permissions || []);
  const canApprove =
    roles.has('system_admin') ||
    roles.has('managing_partner') ||
    roles.has('operations_director') ||
    roles.has('head_of_hr') ||
    roles.has('hr_manager') ||
    roles.has('hr_officer') ||
    perms.has('employees.view') ||
    perms.has('config.manage');

  const [form, setForm] = useState({
    employeeId: '',
    reason: activeTabMeta.reasons[0],
    otherReason: '',
    changeInAddress: false,
    addressDetails: '',
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      reason: activeTabMeta.reasons[0],
      otherReason: '',
      addressDetails: '',
    }));
  }, [activeTabMeta.id]);

  const loadLetters = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set('letterType', activeTabMeta.letterType);
      if (statusFilter !== 'ALL') q.set('status', statusFilter);
      if (search.trim()) q.set('search', search.trim());
      const res = await apiGet(`/api/v1/hr-letters/address-proof?${q.toString()}`);
      setLetters(res?.items || (Array.isArray(res) ? res : []));
    } catch {
      setLetters([]);
    } finally {
      setLoading(false);
    }
  }, [activeTabMeta.letterType, statusFilter, search]);

  useEffect(() => {
    loadLetters();
  }, [loadLetters]);

  const handleSubmitLetter = async (saveAsDraft = false) => {
    if (!form.reason) {
      onShowToast?.('Please select a reason for this letter request.', 'error');
      return;
    }
    if (form.reason === 'Others' && !form.otherReason.trim()) {
      onShowToast?.('Please specify the reason when "Others" is selected.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/api/v1/hr-letters/address-proof', {
        employeeId: form.employeeId || undefined,
        letterType: activeTabMeta.letterType,
        reason: form.reason,
        otherReason: form.otherReason.trim() || undefined,
        changeInAddress: Boolean(form.changeInAddress),
        addressDetails: form.addressDetails.trim() || undefined,
        status: saveAsDraft ? 'DRAFT' : 'SUBMITTED',
      });
      onShowToast?.(
        saveAsDraft
          ? `${activeTabMeta.label} draft saved.`
          : `${activeTabMeta.label} request submitted cleanly.`
      );
      setModalOpen(false);
      await loadLetters();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to save HR letter request', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async (letterId, nextStatus) => {
    try {
      await apiPatch(`/api/v1/hr-letters/address-proof/${letterId}`, { status: nextStatus });
      onShowToast?.(`Letter request marked ${nextStatus}.`);
      await loadLetters();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to update letter status', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Sub-tab Switcher Bar */}
      <div className="h-[44px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-6 h-full">
          {LETTER_TABS.map((t) => {
            const active = activeTabMeta.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopContextTab && setTopContextTab(t.id)}
                className={`relative h-full flex items-center gap-1.5 font-medium transition-colors ${
                  active ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Star size={13} className={active ? 'text-amber-500' : 'text-slate-400'} />
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1.5"
        >
          <Plus size={13} />
          <span>Request {activeTabMeta.label}</span>
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Banner + Filter Bar */}
        <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">{activeTabMeta.label} Portal</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{activeTabMeta.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'SUBMITTED', 'APPROVED', 'DRAFT', 'REJECTED'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  statusFilter === st
                    ? 'bg-[#191f3a] text-white border-[#191f3a]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st === 'ALL' ? 'All' : st}
              </button>
            ))}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search requests..."
                className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-44"
              />
            </div>
          </div>
        </div>

        {/* Requests Table */}
        <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Employee</th>
                <th className="py-2.5 px-3 font-semibold">Letter Type</th>
                <th className="py-2.5 px-3 font-semibold">Purpose / Reason</th>
                <th className="py-2.5 px-3 font-semibold">Details / Addressee</th>
                <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                <th className="py-2.5 px-3 font-semibold">Requested On</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions &amp; PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Loading HR letter requests...
                  </td>
                </tr>
              ) : letters.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No {activeTabMeta.label.toLowerCase()} requests yet. Click{' '}
                    <strong className="text-[#0088ff]">Request {activeTabMeta.label}</strong> to create one.
                  </td>
                </tr>
              ) : (
                letters.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{item.employeeName || 'Staff Member'}</div>
                      <div className="text-[10px] font-mono text-slate-400">{item.employeeNumber}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">
                        {(item.letterType || 'ADDRESS_PROOF').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700">
                      {item.reason}
                      {item.otherReason && <div className="text-[10px] text-slate-500">{item.otherReason}</div>}
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                      {item.addressDetails || '—'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                          STATUS_BADGE[item.status] || STATUS_BADGE.DRAFT
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                      {item.createdAt ? String(item.createdAt).slice(0, 10) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {canApprove && item.status === 'SUBMITTED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReview(item.id, 'APPROVED')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReview(item.id, 'REJECTED')}
                              className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 rounded text-[11px] font-semibold"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setPdfPreviewItem(item)}
                          className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-[#0088ff] hover:bg-blue-100 rounded text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <FileText size={12} />
                          <span>PDF</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Letter Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-[#0088ff]" />
                <h3 className="text-xs font-bold">Request {activeTabMeta.label}</h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {canApprove && employees.length > 0 && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employee</label>
                  <select
                    value={form.employeeId}
                    onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                  >
                    <option value="">Myself ({currentUser?.email})</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.firstName} {e.lastName} ({e.employeeNumber})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Purpose / Reason *</label>
                <select
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  {activeTabMeta.reasons.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {form.reason === 'Others' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Specify Reason *</label>
                  <input
                    type="text"
                    value={form.otherReason}
                    onChange={(e) => setForm({ ...form, otherReason: e.target.value })}
                    placeholder="Enter specific reason..."
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
              )}

              {activeTabMeta.id === 'addressproof' && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.changeInAddress}
                    onChange={(e) => setForm({ ...form, changeInAddress: e.target.checked })}
                  />
                  <span className="font-medium text-slate-700">Is there a change in present residential address?</span>
                </label>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">{activeTabMeta.detailsLabel}</label>
                <textarea
                  rows={3}
                  value={form.addressDetails}
                  onChange={(e) => setForm({ ...form, addressDetails: e.target.value })}
                  placeholder={activeTabMeta.detailsPlaceholder}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmitLetter(true)}
                    className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-50 font-medium"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSubmitLetter(false)}
                    className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1.5"
                  >
                    <CheckCircle size={13} />
                    <span>{submitting ? 'Submitting...' : 'Submit Request'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline PDF Preview Modal */}
      {pdfPreviewItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-xs font-bold">
                  {(pdfPreviewItem.letterType || 'ADDRESS_PROOF').replace('_', ' ')} — {pdfPreviewItem.employeeName}
                </h3>
                <p className="text-[10px] text-slate-300">
                  Compiled Official A4 PDF • Status: {pdfPreviewItem.status}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/v1/hr-letters/requests/${pdfPreviewItem.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <Download size={12} />
                  <span>Open / Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPdfPreviewItem(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <iframe
              title="HR Letter PDF Preview"
              src={`/api/v1/hr-letters/requests/${pdfPreviewItem.id}/pdf`}
              className="flex-1 w-full bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}
