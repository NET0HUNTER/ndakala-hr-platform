import React from 'react';
import { Check, AlertTriangle, Info, X } from './Icons';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const isError = toast.type === 'error';
  const isWarning = toast.type === 'warning';

  // Top-center confirmation pill toast
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 animate-fadeIn">
      <div
        className={`flex items-center shadow-lg rounded-md overflow-hidden border text-xs font-medium min-w-[260px] max-w-md ${
          isError
            ? 'bg-rose-50 border-rose-300 text-rose-900'
            : isWarning
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-[#e6f9f0] border-[#6ee7b7] text-[#065f46]'
        }`}
      >
        <div
          className={`w-9 h-9 flex items-center justify-center flex-shrink-0 text-white ${
            isError ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-[#10b981]'
          }`}
        >
          {isError || isWarning ? <AlertTriangle size={16} /> : <Check size={16} strokeWidth={2.5} />}
        </div>
        <div className="px-3.5 py-2 flex-1 leading-snug">
          {toast.message || toast.title || 'Record added successfully.'}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-2 text-slate-400 hover:text-slate-700 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
