import React, { useState, useEffect } from 'react';
import { X, Lock, Download, Shield, FileText } from '../../components/Icons';
import { apiPost, apiDownload } from '../../utils/api';

/**
 * Zero-Trust Inline Document Viewer Modal.
 * Enforces App-Only Express RBAC token streaming without ever exposing direct SharePoint URLs
 * or allowing shared-license Word Online edits (preserving individual AuditLog non-repudiation).
 */
export default function InlineDocumentViewerModal({ doc, onClose, onShowToast }) {
  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function issueToken() {
      if (!doc?.id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiPost(`/api/v1/files/${doc.id}/token`, {});
        if (!cancelled) setTokenInfo(res);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to authorize inline preview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    issueToken();
    return () => {
      cancelled = true;
    };
  }, [doc?.id]);

  if (!doc) return null;

  const isPdf =
    (doc.mimeType || '').includes('pdf') ||
    (doc.fileName || '').toLowerCase().endsWith('.pdf');
  const isImage = (doc.mimeType || '').startsWith('image/');

  const handleDownload = async () => {
    try {
      const targetUrl =
        tokenInfo?.downloadUrl || `/api/v1/documents/download?token=${tokenInfo?.downloadToken || tokenInfo?.token}`;
      await apiDownload(targetUrl, doc.fileName || 'document');
      onShowToast && onShowToast(`Downloaded ${doc.fileName} securely via signed token.`);
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Download failed', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 text-xs">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-5xl h-[86vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 bg-[#1f2647] text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText size={16} className="text-blue-300 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{doc.fileName}</p>
              <p className="text-[11px] text-blue-200 flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <Lock size={11} /> Zero-Trust Inline Stream
                </span>
                <span>•</span>
                <span>{doc.securityClassification || 'INTERNAL'}</span>
                <span>•</span>
                <span>Word Online Editing Disabled</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {tokenInfo && (
              <button
                type="button"
                onClick={handleDownload}
                className="px-3 py-1.5 bg-[#0088ff] hover:bg-blue-600 text-white rounded font-medium flex items-center gap-1.5"
              >
                <Download size={13} /> Download Copy
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-white/10 text-white"
              aria-label="Close document preview"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 bg-slate-100 relative flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="text-center space-y-2">
              <div className="w-6 h-6 border-2 border-[#0088ff] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-600 font-medium">Decrypting AES-256 vault & authorizing inline stream...</p>
            </div>
          )}

          {!loading && error && (
            <div className="bg-white border border-rose-200 rounded-md p-6 max-w-md text-center space-y-2">
              <Shield size={24} className="text-rose-500 mx-auto" />
              <p className="font-semibold text-slate-800">Access Restricted</p>
              <p className="text-slate-600">{error}</p>
            </div>
          )}

          {!loading && !error && tokenInfo?.inlineUrl && isPdf && (
            <iframe
              title={doc.fileName}
              src={tokenInfo.inlineUrl}
              className="w-full h-full border-0 bg-white"
            />
          )}

          {!loading && !error && tokenInfo?.inlineUrl && isImage && (
            <img
              src={tokenInfo.inlineUrl}
              alt={doc.fileName}
              className="max-h-full max-w-full object-contain p-4"
            />
          )}

          {!loading && !error && tokenInfo && !isPdf && !isImage && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-lg text-center space-y-3 shadow-sm">
              <Shield size={28} className="text-[#0088ff] mx-auto" />
              <h4 className="font-semibold text-sm text-slate-800">
                Inline Preview Not Supported for {doc.fileFormat || 'Office'} Format
              </h4>
              <p className="text-slate-600 leading-relaxed">
                To enforce individual non-repudiation across shared department Microsoft 365 licenses, browser-based
                <strong> Word Online / Office Cloud editing is disabled</strong>. Download the encrypted copy safely via your
                time-bound personal token below.
              </p>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 bg-[#0088ff] text-white rounded font-semibold inline-flex items-center gap-2"
              >
                <Download size={14} /> Download Signed Copy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
