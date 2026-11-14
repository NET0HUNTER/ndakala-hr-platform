import React, { useState, useEffect } from 'react';
import { X, Shield, Search, CheckCircle } from '../../components/Icons';

export function WhistleblowerModal({
  isOpen,
  onClose,
  onSubmitReport,
  onTrackReport,
  trackingResult,
  setTrackingResult,
  submissionResult,
  setSubmissionResult,
}) {
  const [tab, setTab] = useState('submit'); // 'submit' | 'track'
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: '',
    allegationSummary: '',
    policyClausesCited: '',
    voluntaryContactName: '',
    voluntaryContactEmail: '',
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  async function handleReportSubmit(e) {
    e.preventDefault();
    if (!onSubmitReport) return;
    setLoading(true);
    try {
      await onSubmitReport(form);
      setForm({
        title: '',
        allegationSummary: '',
        policyClausesCited: '',
        voluntaryContactName: '',
        voluntaryContactEmail: '',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleTokenLookup(e) {
    e.preventDefault();
    if (!tokenInput.trim() || !onTrackReport) return;
    setLoading(true);
    try {
      await onTrackReport(tokenInput.trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading && onClose) onClose(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#4271b8] text-white flex items-center justify-center">
              <Shield size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Ethics & Whistleblower Portal</h3>
              <p className="text-[11px] text-slate-400">Confidential disclosure intake & status tracking</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => { setTab('submit'); if (setSubmissionResult) setSubmissionResult(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              tab === 'submit'
                ? 'border-[#4271b8] text-[#4271b8]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Submit Confidential Report
          </button>
          <button
            onClick={() => { setTab('track'); if (setTrackingResult) setTrackingResult(null); }}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition ${
              tab === 'track'
                ? 'border-[#4271b8] text-[#4271b8]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Track Existing Report
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs">
          {tab === 'submit' ? (
            submissionResult ? (
              <div className="space-y-4 text-center py-6">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle size={28} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Disclosure Submitted</h4>
                  <p className="text-slate-500 mt-1">Your report has been logged with the Whistleblowing Committee.</p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Case Tracking Token
                  </span>
                  <div className="font-mono text-sm font-bold text-[#4271b8] bg-white p-2.5 rounded-lg border border-slate-300 break-all select-all">
                    {submissionResult.trackingToken || submissionResult.caseNumber}
                  </div>
                  <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200">
                    Save this token to check investigation updates anonymously at any time.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      const tok = submissionResult.trackingToken || '';
                      if (setSubmissionResult) setSubmissionResult(null);
                      setTab('track');
                      setTokenInput(tok);
                    }}
                    className="px-4 py-2 bg-[#4271b8] text-white font-semibold rounded-lg text-xs"
                  >
                    Track Status
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReportSubmit} className="space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Subject / Nature of Concern <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    minLength={5}
                    placeholder="e.g. Financial irregularity, safety hazard, harassment..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Detailed Description <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={form.allegationSummary}
                    onChange={(e) => setForm({ ...form, allegationSummary: e.target.value })}
                    required
                    minLength={10}
                    rows={4}
                    placeholder="Provide dates, individuals or departments involved, and factual details..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Policy or Legal Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.policyClausesCited}
                    onChange={(e) => setForm({ ...form, policyClausesCited: e.target.value })}
                    placeholder="e.g. Whistle-Blowing Policy §2.3, Code of Conduct..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
                  />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="font-semibold text-slate-700 block">Optional Contact Details</span>
                  <p className="text-[11px] text-slate-500">
                    Leave blank to submit 100% anonymously.
                  </p>
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <input
                      type="text"
                      value={form.voluntaryContactName}
                      onChange={(e) => setForm({ ...form, voluntaryContactName: e.target.value })}
                      placeholder="Name (optional)"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
                    />
                    <input
                      type="email"
                      value={form.voluntaryContactEmail}
                      onChange={(e) => setForm({ ...form, voluntaryContactEmail: e.target.value })}
                      placeholder="Email (optional)"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800 bg-white"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-[#4271b8] hover:bg-[#335994] text-white rounded-lg font-semibold shadow-sm transition disabled:opacity-50"
                  >
                    {loading ? 'Submitting...' : 'Submit Disclosure'}
                  </button>
                </div>
              </form>
            )
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleTokenLookup} className="flex gap-2">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Enter your tracking token..."
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs focus-ring text-slate-800"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-[#4271b8] hover:bg-[#335994] text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Search size={14} />
                  <span>{loading ? 'Checking...' : 'Check Status'}</span>
                </button>
              </form>

              {trackingResult && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                    <span className="font-bold text-slate-900 text-sm">
                      Case #{trackingResult.caseNumber || trackingResult.report?.reportNumber || 'WB-CASE'}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 text-[#4271b8] font-bold text-[10px] rounded-full uppercase">
                      {trackingResult.status || trackingResult.report?.status || 'RECEIVED'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">Logged Date:</span>
                      <span className="font-semibold text-slate-700">
                        {new Date(trackingResult.createdAt || trackingResult.report?.createdAt || Date.now()).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Protection Status:</span>
                      <span className="font-semibold text-emerald-700">Protected Disclosure</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WhistleblowerModal;
