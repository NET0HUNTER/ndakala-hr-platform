import React, { useState, useEffect } from 'react';
import { X } from './Icons';

export function PromptModal({
  isOpen,
  title = 'Action Required',
  message,
  inputLabel = 'Comments / Justification',
  placeholder = 'Enter details here...',
  defaultValue = '',
  isTextarea = false,
  confirmLabel = 'Submit',
  cancelLabel = 'Cancel',
  confirmColor = 'bg-[#4271b8] hover:bg-[#335994]',
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setValue(defaultValue);
    setError('');
    setLoading(false);
  }, [isOpen, defaultValue]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading && onCancel) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!value || !value.trim()) {
      setError('Please provide required notes or comments.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onConfirm(value.trim());
    } catch (err) {
      setError(err?.message || 'Operation failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading && onCancel) onCancel(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">{title}</h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {message && (
            <p className="text-xs text-slate-600 leading-relaxed bg-blue-50/60 p-3 rounded-lg border border-blue-100">
              {message}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              {inputLabel} <span className="text-rose-500">*</span>
            </label>
            {isTextarea ? (
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                rows={4}
                required
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus-ring text-slate-800"
              />
            ) : (
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                required
                autoFocus
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus-ring text-slate-800"
              />
            )}
            {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
          </div>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-xs font-medium text-white transition shadow-sm ${confirmColor} ${
                loading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  title = 'Please Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading && onCancel) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, loading, onCancel]);

  if (!isOpen) return null;

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !loading && onCancel) onCancel(); }}
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-800">{title}</h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">{message}</p>

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className={`px-4 py-2 rounded-lg text-xs font-medium text-white transition shadow-sm ${
                isDestructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#4271b8] hover:bg-[#335994]'
              } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
