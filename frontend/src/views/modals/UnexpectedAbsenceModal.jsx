import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from '../../components/Icons';

export function UnexpectedAbsenceModal({
  isOpen,
  onClose,
  onSubmit,
  employees = [],
  absenceForm,
  setAbsenceForm,
}) {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  async function handleFormSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(absenceForm);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting && onClose) onClose(); }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Report Unexpected Absence</h3>
              <p className="text-[11px] text-slate-500">Notify line manager & HR of unplanned absence before 8:00 AM</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Employee</label>
            <select
              value={absenceForm.employeeId || ''}
              onChange={(e) => setAbsenceForm({ ...absenceForm, employeeId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800 bg-white"
            >
              <option value="">-- Myself (Logged-in Employee) --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.firstName} {emp.lastName} ({emp.employeeNumber || 'Staff'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Start Date <span className="text-rose-500">*</span></label>
              <input
                type="date"
                value={absenceForm.startDate || ''}
                onChange={(e) => setAbsenceForm({ ...absenceForm, startDate: e.target.value })}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Expected Return Date</label>
              <input
                type="date"
                value={absenceForm.endDate || absenceForm.startDate || ''}
                onChange={(e) => setAbsenceForm({ ...absenceForm, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Reason Category</label>
              <select
                value={absenceForm.reasonCategory || 'SICKNESS'}
                onChange={(e) => setAbsenceForm({ ...absenceForm, reasonCategory: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800 bg-white"
              >
                <option value="SICKNESS">Sickness / Medical</option>
                <option value="FAMILY_EMERGENCY">Family Emergency</option>
                <option value="MEDICAL_APPOINTMENT">Medical Appointment</option>
                <option value="UNNOTIFIED">Unnotified Absence</option>
                <option value="OTHER">Other Emergency</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Notification Channel</label>
              <select
                value={absenceForm.contactChannel || 'PHONE'}
                onChange={(e) => setAbsenceForm({ ...absenceForm, contactChannel: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800 bg-white"
              >
                <option value="PHONE">Direct Phone Call</option>
                <option value="EMAIL">Corporate Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
                <option value="RELATIVE">Family / Relative</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Coverage & Handover Notes</label>
            <textarea
              value={absenceForm.notes || ''}
              onChange={(e) => setAbsenceForm({ ...absenceForm, notes: e.target.value })}
              rows={2}
              placeholder="Urgent tasks or client meetings needing coverage today..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus-ring text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              {submitting ? 'Submitting...' : 'Submit Absence Notification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UnexpectedAbsenceModal;
