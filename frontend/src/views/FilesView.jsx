import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Folder,
  Filter,
  Upload,
  Download,
  Eye,
  Plus,
  X,
  Lock,
  Layers,
  Check,
  Edit,
  Search,
  RefreshCw,
  ArrowLeft,
  MoreHorizontal,
  Bell,
  Settings,
} from '../components/Icons';
import { apiGet, apiPost, apiDownload, unwrapList } from '../utils/api';
import InlineDocumentViewerModal from './modals/InlineDocumentViewerModal';

function formatDateNice(val) {
  if (!val) return '-';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FilesView({
  currentUser,
  employees = [],
  onShowToast,
}) {
  const userPermissions = new Set(currentUser?.permissions || []);
  const userRoles = new Set(
    (currentUser?.roles || (currentUser?.role ? [currentUser.role] : [])).map((r) => String(r).toLowerCase()),
  );
  const canManageFiles =
    userPermissions.has('documents.upload') ||
    userPermissions.has('org.manage') ||
    userRoles.has('ict_admin') ||
    userRoles.has('system_admin') ||
    userRoles.has('managing_partner') ||
    userRoles.has('head_of_hr') ||
    userRoles.has('operations_director');

  // Navigation State matching Zoho People Files tabs:
  // 'org' (Organization Files) | 'employee' (Employee Files) | 'templates' (HR Forms & Templates) | 'shared_with_me' | 'shared_with_role'
  const [navMode, setNavMode] = useState('org');
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const activeScopeTab = navMode;

  const [files, setFiles] = useState([]);
  const [folders, setFolders] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selection & Bulk actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState('');
  const [moveModalMode, setMoveModalMode] = useState(null); // 'MOVE' | 'COPY' | null

  // Modals & Drawers
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [foldersModalOpen, setFoldersModalOpen] = useState(false);
  const [addFileModalOpen, setAddFileModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [templateModal, setTemplateModal] = useState(null);
  const [templateValues, setTemplateValues] = useState({});
  const [templateEmployeeId, setTemplateEmployeeId] = useState('');

  // Filter Drawer State
  const initialFilters = {
    fileName: '',
    fileFormat: 'ALL',
    folderId: 'ALL',
    fileAccess: 'ACTIVE',
    locationId: 'ALL',
    departmentId: 'ALL',
    updatedFrom: '',
    updatedTo: '',
    expiryFrom: '',
    expiryTo: '',
  };
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);

  // New Folder & Add Organization File forms
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [uploadForm, setUploadForm] = useState({
    fileName: '',
    mimeType: 'application/pdf',
    fileBase64: '',
    description: '',
    category: 'ORGANISATION',
    securityClassification: 'INTERNAL',
    folderId: '',
    locationId: '',
    departmentId: '',
    shareScope: 'ORG',
    sharedRoleKeysText: '',
    expiryDate: '',
    employeeId: '',
  });

  const toast = (msg, type = 'success') => onShowToast && onShowToast(msg, type);

  const loadMetadata = useCallback(async () => {
    try {
      const [fl, lo, dp, tp] = await Promise.all([
        apiGet('/api/v1/files/folders').catch(() => []),
        apiGet('/api/v1/locations').catch(() => []),
        apiGet('/api/v1/departments').catch(() => []),
        apiGet('/api/v1/files/templates').catch(() => []),
      ]);
      setFolders(unwrapList(fl));
      setLocations(unwrapList(lo));
      setDepartments(unwrapList(dp));
      setTemplates(unwrapList(tp));
    } catch {
      // handled gracefully
    }
  }, []);

  const loadFiles = useCallback(async () => {
    if (activeScopeTab === 'templates') return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tab', activeScopeTab);
      if (appliedFilters.fileName) params.set('fileName', appliedFilters.fileName);
      if (appliedFilters.fileFormat && appliedFilters.fileFormat !== 'ALL') params.set('fileFormat', appliedFilters.fileFormat);
      if (appliedFilters.folderId && appliedFilters.folderId !== 'ALL') params.set('folderId', appliedFilters.folderId);
      if (appliedFilters.fileAccess) params.set('fileAccess', appliedFilters.fileAccess);
      if (appliedFilters.locationId && appliedFilters.locationId !== 'ALL') params.set('locationId', appliedFilters.locationId);
      if (appliedFilters.departmentId && appliedFilters.departmentId !== 'ALL') params.set('departmentId', appliedFilters.departmentId);
      if (appliedFilters.updatedFrom) params.set('updatedFrom', appliedFilters.updatedFrom);
      if (appliedFilters.updatedTo) params.set('updatedTo', appliedFilters.updatedTo);
      if (appliedFilters.expiryFrom) params.set('expiryFrom', appliedFilters.expiryFrom);
      if (appliedFilters.expiryTo) params.set('expiryTo', appliedFilters.expiryTo);

      const res = await apiGet(`/api/v1/files?${params.toString()}`);
      setFiles(unwrapList(res));
      setSelectedIds([]);
    } catch (err) {
      toast(err?.message || 'Failed to load files', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeScopeTab, appliedFilters]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(files.map((f) => f.id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleBulkAction = async (action, targetFolderId = null) => {
    if (selectedIds.length === 0) return;
    try {
      const res = await apiPost('/api/v1/files/bulk', {
        action,
        documentIds: selectedIds,
        ...(targetFolderId !== null ? { targetFolderId: targetFolderId || null } : {}),
      });
      toast(`${action} completed cleanly (${res.affected} file(s)).`);
      setMoveModalMode(null);
      setSelectedIds([]);
      loadFiles();
      loadMetadata();
    } catch (err) {
      toast(err?.message || `${action} blocked`, 'error');
    }
  };

  const handleConfirmExport = async () => {
    try {
      const res = await apiPost('/api/v1/files/export', {
        tab: activeScopeTab,
        ...appliedFilters,
      });
      const blob = new Blob([res.csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.fileName || 'ndakala_files_export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
      toast(`Exported ${res.rowCount} file record(s) matching current view & filters.`);
    } catch (err) {
      toast(err?.message || 'Export failed', 'error');
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await apiPost('/api/v1/files/folders', {
        name: newFolderName.trim(),
        scope: activeScopeTab === 'employee' ? 'EMPLOYEE' : 'ORG',
        description: newFolderDesc.trim() || undefined,
      });
      setNewFolderName('');
      setNewFolderDesc('');
      toast('Folder created.');
      loadMetadata();
    } catch (err) {
      toast(err?.message || 'Could not create folder', 'error');
    }
  };

  const handlePickUploadFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result || '').split(',')[1] || '';
      setUploadForm((prev) => ({
        ...prev,
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        fileBase64: b64,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitOrganizationFile = async (e) => {
    e.preventDefault();
    if (!uploadForm.fileBase64) {
      toast('Please select a file to upload.', 'warning');
      return;
    }
    try {
      const roleKeys = uploadForm.sharedRoleKeysText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isEmpTab = activeScopeTab === 'employee' || uploadForm.category === 'EMPLOYEE';
      const res = await apiPost('/api/v1/files/organization', {
        fileName: uploadForm.fileName,
        mimeType: uploadForm.mimeType,
        fileBase64: uploadForm.fileBase64,
        description: uploadForm.description || undefined,
        category: isEmpTab ? 'EMPLOYEE' : uploadForm.category,
        securityClassification: uploadForm.securityClassification,
        folderId: uploadForm.folderId || null,
        locationId: uploadForm.locationId || null,
        departmentId: uploadForm.departmentId || null,
        shareScope: isEmpTab ? 'EMPLOYEE' : uploadForm.shareScope,
        sharedRoleKeys: roleKeys.length ? roleKeys : undefined,
        expiryDate: uploadForm.expiryDate || null,
        employeeId: uploadForm.employeeId || null,
      });
      setAddFileModalOpen(false);
      setUploadForm({
        fileName: '',
        mimeType: 'application/pdf',
        fileBase64: '',
        description: '',
        category: 'ORGANISATION',
        securityClassification: 'INTERNAL',
        folderId: '',
        locationId: '',
        departmentId: '',
        shareScope: 'ORG',
        sharedRoleKeysText: '',
        expiryDate: '',
        employeeId: '',
      });
      toast(
        res.sharepointSynced
          ? `Encrypted to local AES-256 vault & dual-written to SharePoint (${res.fileName}).`
          : `Encrypted and saved to AES-256 vault (${res.fileName}).`,
      );
      loadFiles();
      loadMetadata();
    } catch (err) {
      toast(err?.message || 'File upload failed', 'error');
    }
  };

  const handleOpenTemplateForm = (tpl) => {
    const initialVals = {};
    for (const f of tpl.fields || []) {
      initialVals[f.key] = f.defaultValue || '';
    }
    setTemplateValues(initialVals);
    setTemplateEmployeeId('');
    setTemplateModal(tpl);
  };

  const handleCompileTemplatePdf = async (e) => {
    e.preventDefault();
    if (!templateModal) return;
    try {
      const res = await apiPost(`/api/v1/files/templates/${templateModal.id}/generate-pdf`, {
        formValues: templateValues,
        employeeId: templateEmployeeId || null,
      });
      setTemplateModal(null);
      toast(`Compiled PDF cleanly (${res.fileName}).`);
      loadMetadata();
      loadFiles();
      setViewerDoc({
        id: res.documentId,
        fileName: res.fileName,
        mimeType: 'application/pdf',
        securityClassification: templateEmployeeId ? 'CONFIDENTIAL' : 'INTERNAL',
      });
    } catch (err) {
      toast(err?.message || 'Could not compile PDF', 'error');
    }
  };

  const handleDownloadRow = async (doc) => {
    try {
      const tok = await apiPost(`/api/v1/files/${doc.id}/token`, {});
      await apiDownload(tok.downloadUrl || `/api/v1/documents/download?token=${tok.downloadToken}`, doc.fileName);
      toast(`Downloaded ${doc.fileName} securely.`);
    } catch (err) {
      toast(err?.message || 'Download failed', 'error');
    }
  };

  const activeFilterCount = Object.entries(appliedFilters).filter(
    ([k, v]) => v && v !== 'ALL' && !(k === 'fileAccess' && v === 'ACTIVE'),
  ).length;

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Zoho-Style Sub-Header Bar (Matches Uploaded Reference Exactly) */}
      <div className="bg-[#18223c] text-white px-4 h-12 flex items-center justify-between flex-shrink-0 border-b border-white/10">
        <div className="flex items-center space-x-6 h-full">
          {/* Files Back Button */}
          <button
            type="button"
            onClick={() => setNavMode('org')}
            className="bg-[#0088ff] hover:bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-1.5 font-semibold text-xs transition-colors shadow-sm"
          >
            <ArrowLeft size={14} className="stroke-[2.5]" />
            <span>Files</span>
          </button>

          {/* Primary Zoho Tabs */}
          <div className="flex items-center space-x-6 h-full">
            {[
              { id: 'org', label: 'Organization Files' },
              { id: 'employee', label: 'Employee Files' },
              { id: 'templates', label: 'HR Forms & Templates' },
            ].map((t) => {
              const selected = activeScopeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setNavMode(t.id)}
                  className={`relative h-full flex items-center text-[13px] font-medium transition-colors ${
                    selected ? 'text-white font-semibold' : 'text-[#a3aed0] hover:text-white'
                  }`}
                >
                  <span>{t.label}</span>
                  {selected && (
                    <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0088ff] rounded-t" />
                  )}
                </button>
              );
            })}

            {/* More '...' dropdown menu */}
            <div className="relative h-full flex items-center">
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`relative h-full flex items-center px-1 text-[13px] font-medium transition-colors ${
                  activeScopeTab === 'shared_with_me' || activeScopeTab === 'shared_with_role'
                    ? 'text-white font-semibold'
                    : 'text-[#a3aed0] hover:text-white'
                }`}
                title="More views"
              >
                <MoreHorizontal size={16} />
                {(activeScopeTab === 'shared_with_me' || activeScopeTab === 'shared_with_role') && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0088ff] rounded-t" />
                )}
              </button>
              {moreMenuOpen && (
                <div className="absolute top-11 left-0 w-48 bg-white text-slate-800 rounded-md shadow-lg border border-slate-200 py-1.5 z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setNavMode('shared_with_me');
                      setMoreMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center justify-between ${
                      activeScopeTab === 'shared_with_me' ? 'text-[#0088ff] font-semibold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>Shared with Me</span>
                    {activeScopeTab === 'shared_with_me' && <Check size={13} className="text-[#0088ff]" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNavMode('shared_with_role');
                      setMoreMenuOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center justify-between ${
                      activeScopeTab === 'shared_with_role' ? 'text-[#0088ff] font-semibold bg-blue-50/50' : 'text-slate-700'
                    }`}
                  >
                    <span>Shared with My Role</span>
                    {activeScopeTab === 'shared_with_role' && <Check size={13} className="text-[#0088ff]" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Header Right Action Icons */}
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={() => {
              setUploadForm((prev) => ({
                ...prev,
                category: activeScopeTab === 'employee' ? 'EMPLOYEE' : 'ORGANISATION',
                shareScope: activeScopeTab === 'employee' ? 'EMPLOYEE' : 'ORG',
              }));
              setAddFileModalOpen(true);
            }}
            className="w-7 h-7 bg-[#0088ff] hover:bg-blue-600 text-white rounded flex items-center justify-center transition-colors shadow-sm"
            title="Add File"
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="p-1.5 text-[#a3aed0] hover:text-white transition-colors"
            title="Search / Filter"
          >
            <Search size={15} />
          </button>
          <div className="p-1.5 text-[#a3aed0] hover:text-white transition-colors cursor-pointer" title="Notifications">
            <Bell size={15} />
          </div>
          <div className="p-1.5 text-[#a3aed0] hover:text-white transition-colors cursor-pointer" title="Settings">
            <Settings size={15} />
          </div>
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase border border-white/20">
            {currentUser?.name ? currentUser.name.charAt(0) : 'U'}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Toolbar: Action Buttons (Organization / Employee / Shared views) */}
        {activeScopeTab !== 'templates' && (
          <div className="bg-white rounded-md border border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center flex-wrap gap-2">
              {selectedIds.length > 0 && canManageFiles ? (
                <>
                  <span className="px-2 py-1 bg-blue-50 text-[#0088ff] font-semibold rounded">
                    {selectedIds.length} Selected
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('DELETE')}
                    className="px-2.5 py-1 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded font-medium"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('ARCHIVE')}
                    className="px-2.5 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('UNARCHIVE')}
                    className="px-2.5 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium"
                  >
                    Unarchive
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveTargetFolderId('');
                      setMoveModalMode('COPY');
                    }}
                    className="px-2.5 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMoveTargetFolderId('');
                      setMoveModalMode('MOVE');
                    }}
                    className="px-2.5 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium"
                  >
                    Move
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-slate-600">
                  <span className="font-semibold text-slate-800">
                    {activeScopeTab === 'shared_with_me'
                      ? 'Shared with Me'
                      : activeScopeTab === 'shared_with_role'
                      ? 'Shared with My Role & Department'
                      : activeScopeTab === 'employee'
                      ? 'Employee Files'
                      : 'Organization Files'}
                  </span>
                  <span className="text-slate-400">({files.length})</span>
                  {appliedFilters.folderId !== 'ALL' && (
                    <span className="px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded font-medium flex items-center gap-1">
                      <Folder size={11} />
                      {folders.find((f) => f.id === appliedFilters.folderId)?.name || 'Folder'}
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...appliedFilters, folderId: 'ALL' };
                          setAppliedFilters(next);
                          setDraftFilters(next);
                        }}
                        className="ml-1 text-slate-500 hover:text-slate-800"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFoldersModalOpen(true)}
                className="px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium flex items-center gap-1.5"
              >
                <Folder size={13} className="text-amber-500" /> Folders ({folders.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(appliedFilters);
                  setFilterDrawerOpen(true);
                }}
                className={`px-3 py-1.5 border rounded font-medium flex items-center gap-1.5 ${
                  activeFilterCount > 0
                    ? 'border-[#0088ff] bg-blue-50 text-[#0088ff]'
                    : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Filter size={13} /> Filter {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
              </button>
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                className="px-3 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium flex items-center gap-1.5"
              >
                <Download size={13} /> Export
              </button>
              {canManageFiles && (
                <button
                  type="button"
                  onClick={() => {
                    setUploadForm((prev) => ({
                      ...prev,
                      category: activeScopeTab === 'employee' ? 'EMPLOYEE' : 'ORGANISATION',
                      shareScope: activeScopeTab === 'employee' ? 'EMPLOYEE' : 'ORG',
                    }));
                    setAddFileModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-blue-600 text-white rounded font-medium flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  {activeScopeTab === 'employee' ? 'Add Employee File' : 'Add Organization Files'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB: HR FORMS & TEMPLATES (Matches Uploaded Screenshot Exactly) */}
        {activeScopeTab === 'templates' && (
          <div className="bg-white rounded border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f4f7fa] border-b border-slate-200 text-slate-600 font-semibold text-xs">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">
                    <input type="checkbox" className="rounded border-slate-300 w-4 h-4 text-[#0088ff] focus:ring-0" />
                  </th>
                  <th className="py-3 px-4 w-1/3">Name</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((tpl) => (
                  <tr key={tpl.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-3.5 px-4 text-center">
                      <input type="checkbox" className="rounded border-slate-300 w-4 h-4 text-[#0088ff] focus:ring-0" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-start gap-3">
                        <div className="p-1 text-[#0088ff] mt-0.5 flex-shrink-0">
                          <FileText size={18} />
                        </div>
                        <div>
                          <button
                            type="button"
                            onClick={() => handleOpenTemplateForm(tpl)}
                            className="font-medium text-sm text-slate-800 hover:text-[#0088ff] text-left transition-colors"
                          >
                            {tpl.name}
                          </button>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Created on {formatDateNice(tpl.createdAt)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 leading-relaxed">{tpl.description}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenTemplateForm(tpl)}
                          className="px-2.5 py-1 text-xs text-[#0088ff] hover:bg-blue-50 rounded font-medium inline-flex items-center gap-1 transition-colors"
                          title="Fill form and compile"
                        >
                          <Edit size={12} /> Fill
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TABLE: Organization Files / Employee Files / Shared with Me / Shared with My Role */}
        {activeScopeTab !== 'templates' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-10 text-center text-slate-500">Loading secured documents...</div>
            ) : files.length === 0 ? (
              <div className="p-12 text-center space-y-3 max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-[#0088ff] flex items-center justify-center mx-auto">
                  <Folder size={22} />
                </div>
                <h4 className="font-semibold text-sm text-slate-800">No organization file added</h4>
                <p className="text-slate-500 leading-relaxed">
                  Upload important common files such as policies or company handbooks that can be shared across the
                  entire organization or for selected business entities, locations, departments, etc.
                </p>
                {canManageFiles && (
                  <button
                    type="button"
                    onClick={() => setAddFileModalOpen(true)}
                    className="px-4 py-2 bg-[#0088ff] hover:bg-blue-600 text-white rounded font-medium inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Organization Files
                  </button>
                )}
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#e8edf5] border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={files.length > 0 && selectedIds.length === files.length}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                    </th>
                    <th className="py-2.5 px-4">Name</th>
                    <th className="py-2.5 px-4">Shared with</th>
                    <th className="py-2.5 px-4">Folder</th>
                    <th className="py-2.5 px-4">Updated on</th>
                    <th className="py-2.5 px-4">Expiry</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {files.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(doc.id)}
                          onChange={() => toggleSelectRow(doc.id)}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-start gap-2.5">
                          <div className="p-1.5 rounded bg-blue-50 text-[#0088ff] mt-0.5">
                            <FileText size={15} />
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setViewerDoc(doc)}
                              className="font-semibold text-slate-800 hover:text-[#0088ff] text-left"
                            >
                              {doc.fileName}
                            </button>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                              <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-semibold">
                                {doc.fileFormat}
                              </span>
                              <span>{Math.max(1, Math.round((doc.fileSizeBytes || 0) / 1024))} KB</span>
                              {doc.externalProvider === 'DUAL_WRITE_SHAREPOINT' && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold">
                                  SharePoint Synced
                                </span>
                              )}
                              {doc.externalProvider === 'SHAREPOINT_ARCHIVE' && (
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded font-semibold">
                                  Cold Archived (SharePoint)
                                </span>
                              )}
                              {doc.isArchived && (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded font-semibold">
                                  Archived
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{doc.sharedWith}</td>
                      <td className="py-3 px-4 text-slate-600">{doc.folderName}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDateNice(doc.updatedAt)}</td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {doc.expiryDate ? formatDateNice(doc.expiryDate) : 'No Expiry'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() => setViewerDoc(doc)}
                          className="px-2 py-1 border border-blue-200 bg-blue-50 text-[#0088ff] hover:bg-blue-100 rounded font-medium inline-flex items-center gap-1"
                        >
                          <Eye size={12} /> Preview Inline
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadRow(doc)}
                          className="px-2 py-1 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded font-medium inline-flex items-center gap-1"
                        >
                          <Download size={12} /> Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* FILTER DRAWER (Exact Zoho Filter Spec) */}
      {filterDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
          <div className="bg-white w-full max-w-sm h-full flex flex-col shadow-2xl border-l border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-semibold text-sm text-slate-800">Filter</h4>
              <button type="button" onClick={() => setFilterDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
              <div>
                <label className="block font-medium text-slate-700 mb-1">File name</label>
                <input
                  type="text"
                  value={draftFilters.fileName}
                  onChange={(e) => setDraftFilters({ ...draftFilters, fileName: e.target.value })}
                  placeholder="Enter the file name"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">File format</label>
                <select
                  value={draftFilters.fileFormat}
                  onChange={(e) => setDraftFilters({ ...draftFilters, fileFormat: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">All</option>
                  <option value="PDF">PDF</option>
                  <option value="DOCX">DOCX</option>
                  <option value="XLSX">XLSX</option>
                  <option value="CSV">CSV</option>
                  <option value="PNG">PNG</option>
                  <option value="JPEG">JPEG</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Folder</label>
                <select
                  value={draftFilters.folderId}
                  onChange={(e) => setDraftFilters({ ...draftFilters, folderId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">Select</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.documentCount})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">File access</label>
                <div className="space-y-1.5">
                  {[
                    { value: 'ACTIVE', label: 'Active files' },
                    { value: 'ARCHIVED', label: 'Archived Files' },
                    { value: 'ALL', label: 'All files' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="fileAccessFilter"
                        checked={draftFilters.fileAccess === opt.value}
                        onChange={() => setDraftFilters({ ...draftFilters, fileAccess: opt.value })}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Location</label>
                <select
                  value={draftFilters.locationId}
                  onChange={(e) => setDraftFilters({ ...draftFilters, locationId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">All</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Department</label>
                <select
                  value={draftFilters.departmentId}
                  onChange={(e) => setDraftFilters({ ...draftFilters, departmentId: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ALL">All</option>
                  {departments.filter((d) => d.id).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Updated on (Between)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={draftFilters.updatedFrom}
                    onChange={(e) => setDraftFilters({ ...draftFilters, updatedFrom: e.target.value })}
                    className="px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                  <input
                    type="date"
                    value={draftFilters.updatedTo}
                    onChange={(e) => setDraftFilters({ ...draftFilters, updatedTo: e.target.value })}
                    className="px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Expiry (Between)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={draftFilters.expiryFrom}
                    onChange={(e) => setDraftFilters({ ...draftFilters, expiryFrom: e.target.value })}
                    className="px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                  <input
                    type="date"
                    value={draftFilters.expiryTo}
                    onChange={(e) => setDraftFilters({ ...draftFilters, expiryTo: e.target.value })}
                    className="px-2.5 py-1.5 border border-slate-300 rounded"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftFilters(initialFilters);
                  setAppliedFilters(initialFilters);
                  setFilterDrawerOpen(false);
                }}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded font-medium"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppliedFilters(draftFilters);
                  setFilterDrawerOpen(false);
                }}
                className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPORT CONFIRMATION MODAL (Exact Prompt Text) */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-sm text-slate-800">Export organization file ?</h4>
              <button type="button" onClick={() => setExportModalOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <p className="text-slate-600">All files in the current view or filter will be exported.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 rounded font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOLDERS MODAL */}
      {foldersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-md shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-sm text-slate-800">Folders & SharePoint Mapping</h4>
              <button type="button" onClick={() => setFoldersModalOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded">
              <button
                type="button"
                onClick={() => {
                  const next = { ...appliedFilters, folderId: 'ALL' };
                  setAppliedFilters(next);
                  setDraftFilters(next);
                  setFoldersModalOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between"
              >
                <span className="font-medium text-slate-800">All Folders</span>
                <span className="text-slate-500">View Everything</span>
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    const next = { ...appliedFilters, folderId: f.id };
                    setAppliedFilters(next);
                    setDraftFilters(next);
                    setFoldersModalOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Folder size={14} className="text-amber-500" />
                    <div>
                      <p className="font-medium text-slate-800">{f.name}</p>
                      {f.description && <p className="text-[10px] text-slate-400">{f.description}</p>}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold">
                    {f.documentCount}
                  </span>
                </button>
              ))}
            </div>
            {canManageFiles && (
              <form onSubmit={handleCreateFolder} className="pt-2 border-t border-slate-100 space-y-2">
                <p className="font-semibold text-slate-700">Create New Folder</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="Folder name (e.g. Board Resolutions)"
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded"
                  />
                  <button type="submit" className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                    Create
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MOVE / COPY TARGET FOLDER MODAL */}
      {moveModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-sm text-slate-800">
                {moveModalMode === 'MOVE' ? 'Move Selected Files' : 'Copy Selected Files'} ({selectedIds.length})
              </h4>
              <button type="button" onClick={() => setMoveModalMode(null)}>
                <X size={15} />
              </button>
            </div>
            <select
              value={moveTargetFolderId}
              onChange={(e) => setMoveTargetFolderId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              <option value="">Root (No Folder)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveModalMode(null)}
                className="px-3 py-1.5 border border-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleBulkAction(moveModalMode, moveTargetFolderId || null)}
                className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Confirm {moveModalMode}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD ORGANIZATION FILE MODAL */}
      {addFileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleSubmitOrganizationFile}
            className="bg-white rounded-md shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-sm text-slate-800">
                {uploadForm.category === 'EMPLOYEE' ? 'Add Employee File' : 'Add Organization Files'}
              </h4>
              <button type="button" onClick={() => setAddFileModalOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">Select File (PDF, DOCX, XLSX, PNG, JPEG, CSV) *</label>
              <input type="file" onChange={handlePickUploadFile} className="w-full text-xs border border-slate-300 rounded p-1.5" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={uploadForm.category}
                  onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="ORGANISATION">Organization File</option>
                  <option value="POLICY">Company Policy</option>
                  <option value="COMPLIANCE">Compliance Record</option>
                  <option value="EMPLOYEE">Employee File</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Classification</label>
                <select
                  value={uploadForm.securityClassification}
                  onChange={(e) => setUploadForm({ ...uploadForm, securityClassification: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="INTERNAL">INTERNAL</option>
                  <option value="PUBLIC">PUBLIC</option>
                  <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                  <option value="RESTRICTED">RESTRICTED</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Folder</label>
                <select
                  value={uploadForm.folderId}
                  onChange={(e) => setUploadForm({ ...uploadForm, folderId: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">Root</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Expiry Date (Optional)</label>
                <input
                  type="date"
                  value={uploadForm.expiryDate}
                  onChange={(e) => setUploadForm({ ...uploadForm, expiryDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                />
              </div>
            </div>

            {uploadForm.category === 'EMPLOYEE' ? (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Employee *</label>
                <select
                  required
                  value={uploadForm.employeeId}
                  onChange={(e) => setUploadForm({ ...uploadForm, employeeId: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.firstName} {em.lastName} ({em.employeeNumber})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Shared Scope</label>
                    <select
                      value={uploadForm.shareScope}
                      onChange={(e) => setUploadForm({ ...uploadForm, shareScope: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="ORG">Entire Organization</option>
                      <option value="SPECIFIC">Dept / Location</option>
                      <option value="ROLE">Specific Roles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Department</label>
                    <select
                      value={uploadForm.departmentId}
                      onChange={(e) => setUploadForm({ ...uploadForm, departmentId: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="">All Depts</option>
                      {departments.filter((d) => d.id).map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Location</label>
                    <select
                      value={uploadForm.locationId}
                      onChange={(e) => setUploadForm({ ...uploadForm, locationId: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      <option value="">All Locations</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {uploadForm.shareScope === 'ROLE' && (
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">
                      Target Role Keys (comma-separated, e.g. hr.lead, line.manager)
                    </label>
                    <input
                      type="text"
                      value={uploadForm.sharedRoleKeysText}
                      onChange={(e) => setUploadForm({ ...uploadForm, sharedRoleKeysText: e.target.value })}
                      placeholder="hr.lead, managing.partner"
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAddFileModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium flex items-center gap-1.5"
              >
                <Upload size={13} /> Save & Encrypt File
              </button>
            </div>
          </form>
        </div>
      )}

      {/* NATIVE REACT HR TEMPLATE -> BACKEND PDF GENERATOR MODAL */}
      {templateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCompileTemplatePdf}
            className="bg-white rounded-md shadow-xl border border-slate-200 max-w-lg w-full p-5 space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <h4 className="font-semibold text-sm text-slate-800">{templateModal.name}</h4>
                <p className="text-[11px] text-slate-500">Compiles natively to PDF (Word Online bypassed)</p>
              </div>
              <button type="button" onClick={() => setTemplateModal(null)}>
                <X size={15} />
              </button>
            </div>

            {templateModal.category !== 'HANDBOOK' && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Subject Employee (Optional)</label>
                <select
                  value={templateEmployeeId}
                  onChange={(e) => setTemplateEmployeeId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                >
                  <option value="">General Organization Document</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.firstName} {em.lastName} ({em.employeeNumber})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {(templateModal.fields || []).map((field) => (
                <div key={field.key}>
                  <label className="block font-medium text-slate-700 mb-1">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      rows={3}
                      value={templateValues[field.key] || ''}
                      onChange={(e) => setTemplateValues({ ...templateValues, [field.key]: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                  ) : (
                    <input
                      type="text"
                      value={templateValues[field.key] || ''}
                      onChange={(e) => setTemplateValues({ ...templateValues, [field.key]: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTemplateModal(null)}
                className="px-3.5 py-1.5 border border-slate-300 rounded"
              >
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">
                Compile to PDF & Preview Inline
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ZERO-TRUST INLINE VIEWER */}
      {viewerDoc && (
        <InlineDocumentViewerModal
          doc={viewerDoc}
          onClose={() => setViewerDoc(null)}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
}
