import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Edit,
  Filter,
  Plus,
  Search,
  Upload,
  X,
  NdakalaEmptyState,
} from './Icons';
import { apiGet, apiPost, apiPut, apiPatch, unwrapList } from '../utils/api';
import OrgAdminEnterprisePanels from './OrgAdminEnterprisePanels';

const DEPT_STOP_WORDS = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'with']);

function previewDepartmentCode(name, departmentsList = [], editingId = null) {
  const rawWords = String(name || '')
    .replace(/&/g, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (rawWords.length === 0) return '';
  const significant = rawWords.filter((w) => !DEPT_STOP_WORDS.has(w.toLowerCase()));
  const words = significant.length > 0 ? significant : rawWords;
  const base =
    words.length === 1
      ? words[0].slice(0, 4).toUpperCase().padEnd(2, 'X')
      : `${words[0].slice(0, 3).toUpperCase()}-${words[1].slice(0, 3).toUpperCase()}`;

  const taken = new Set(
    (departmentsList || [])
      .filter((d) => d && d.id !== editingId && d.code)
      .map((d) => String(d.code).toUpperCase())
  );
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base.slice(0, 16)}-${suffix}`)) suffix += 1;
  return `${base.slice(0, 16)}-${suffix}`;
}

const ENTERPRISE_ADMIN_TABS = [
  { id: 'users', label: 'Users & RBAC' },
  { id: 'policyengine', label: 'Policy Engine (Maker-Checker)' },
  { id: 'integrations', label: 'Integrations, SIEM & Bank EFT' },
  { id: 'privacy', label: 'Privacy DPA 2019 & Legal Holds' },
  { id: 'systemaudit', label: 'Health, Metrics & Audit Logs' },
];

export default function OrgSettingsPanel({
  orgTabs,
  initialTab = 'details',
  orgDetails,
  setOrgDetails,
  orgPolicyToggles,
  setOrgPolicyToggles,
  departments,
  setDepartments,
  designations,
  setDesignations,
  employees = [],
  onRefreshAll,
  onShowToast,
}) {
  const [orgTab, setOrgTab] = useState(initialTab);
  const [locations, setLocations] = useState([]);
  const [grades, setGrades] = useState([]);
  const [fromAddresses, setFromAddresses] = useState([
    {
      displayName: 'HR Portal',
      email: 'noreply@company.com',
      verified: true,
      authenticated: true,
    },
  ]);

  // Filter & Creation Drawers / Modals
  const [locFilter, setLocFilter] = useState('');
  const [locFilterOpen, setLocFilterOpen] = useState(false);
  const [locModalOpen, setLocModalOpen] = useState(false);
  const [locForm, setLocForm] = useState({
    code: '',
    name: '',
    address: '',
    timezone: 'Africa/Nairobi',
    isHeadOffice: false,
  });

  const [deptFilter, setDeptFilter] = useState('');
  const [deptFilterOpen, setDeptFilterOpen] = useState(false);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [originalDeptName, setOriginalDeptName] = useState('');
  const [deptForm, setDeptForm] = useState({
    code: '',
    name: '',
    headOfDepartmentId: '',
    parentDepartmentId: '',
    sharedM365Mailbox: '',
  });

  const [desigFilter, setDesigFilter] = useState('');
  const [desigFilterOpen, setDesigFilterOpen] = useState(false);
  const [desigModalOpen, setDesigModalOpen] = useState(false);
  const [desigForm, setDesigForm] = useState({
    code: '',
    title: '',
    departmentId: '',
    gradeId: '',
  });
  const [gradeModalOpen, setGradeModalOpen] = useState(false);
  const [gradeForm, setGradeForm] = useState({
    code: '',
    name: '',
    level: 5,
    noticePeriodDays: 30,
  });

  const [fromModalOpen, setFromModalOpen] = useState(false);
  const [fromForm, setFromForm] = useState({ displayName: '', email: '' });
  const [customLogoText, setCustomLogoText] = useState(null);
  const [logoModalOpen, setLogoModalOpen] = useState(false);
  const [logoDraftText, setLogoDraftText] = useState('Ndakala People');
  const [portalDomain, setPortalDomain] = useState('portal.company.com');
  const importInputRef = useRef(null);
  const [pendingImportKind, setPendingImportKind] = useState(null);

  const toast = (msg, type = 'success') => onShowToast && onShowToast(msg, type);

  const loadOrgData = useCallback(async () => {
    try {
      const [org, depts, pos, grds, locs, policyCfg, fromCfg, logoCfg] = await Promise.all([
        apiGet('/api/v1/organisation').catch(() => null),
        apiGet('/api/v1/departments').catch(() => []),
        apiGet('/api/v1/positions').catch(() => []),
        apiGet('/api/v1/grades').catch(() => []),
        apiGet('/api/v1/locations').catch(() => []),
        apiGet('/api/v1/workspace/ui-config?key=ORG_POLICY_TOGGLES').catch(() => null),
        apiGet('/api/v1/workspace/ui-config?key=EMAIL_FROM_ADDRESSES').catch(() => null),
        apiGet('/api/v1/workspace/ui-config?key=ORG_LOGO_LABEL').catch(() => null),
      ]);

      const orgDomain = (org?.email && org.email.includes('@'))
        ? org.email.split('@')[1]
        : (org?.website ? org.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] : 'company.com');

      if (org) {
        setOrgDetails((prev) => ({
          ...prev,
          name: org.legalName || prev.name,
          website: org.website || prev.website,
          contactNumber: org.phone || prev.contactNumber,
          contactEmail: org.email || prev.contactEmail,
          addressLine1: org.address || prev.addressLine1,
        }));
        setPortalDomain((prev) => (!prev || prev === 'portal.company.com' || prev.includes('ndakala')) ? `portal.${orgDomain}` : prev);
      }

      const deptItems = unwrapList(depts);
      if (deptItems.length > 0) {
        setDepartments(
          deptItems.map((d) => ({
            id: d.id,
            name: d.name,
            code: d.code,
            headOfDepartmentId: d.headOfDepartmentId || '',
            parentDepartmentId: d.parentDepartmentId || '',
            parentDepartmentName: d.parentDepartment?.name || '',
            isActive: d.isActive !== false,
            users: d._count?.employees ?? d.employees?.length ?? 0,
            alias: `${(d.code || 'dept').toLowerCase()}@${orgDomain}`,
            lead: d.headOfDepartment
              ? `${d.headOfDepartment.firstName} ${d.headOfDepartment.lastName}`
              : 'Managing Partner',
          }))
        );
        if (!desigForm.departmentId && deptItems[0]?.id) {
          setDesigForm((p) => ({ ...p, departmentId: deptItems[0].id }));
        }
      }

      const posItems = unwrapList(pos);
      if (posItems.length > 0) {
        setDesignations(
          posItems.map((p) => ({
            id: p.id,
            name: p.title,
            code: p.code,
            departmentName: p.department?.name || '-',
            gradeName: p.grade?.name || '-',
            users: p._count?.employees ?? 0,
          }))
        );
      }

      setGrades(unwrapList(grds));
      setLocations(unwrapList(locs));

      const policyVal = policyCfg?.configs?.ORG_POLICY_TOGGLES || policyCfg?.value;
      if (policyVal && typeof policyVal === 'object') {
        setOrgPolicyToggles((prev) => ({ ...prev, ...policyVal }));
      }
      const fromVal = fromCfg?.configs?.EMAIL_FROM_ADDRESSES || fromCfg?.value;
      const fromItems = Array.isArray(fromVal) ? fromVal : Array.isArray(fromVal?.items) ? fromVal.items : [];
      if (fromItems.length > 0) {
        setFromAddresses(fromItems);
      }
      const logoVal = logoCfg?.configs?.ORG_LOGO_LABEL || logoCfg?.value;
      if (logoVal?.label) {
        setCustomLogoText(logoVal.label);
        setLogoDraftText(logoVal.label);
      }
      if (logoVal?.domain) {
        setPortalDomain(logoVal.domain);
      }
    } catch {
      // fallback safely to local initial values
    }
  }, []);

  useEffect(() => {
    loadOrgData();
  }, [loadOrgData]);

  const handleSaveOrgDetails = async () => {
    try {
      const fullAddress = [
        orgDetails.addressLine1,
        orgDetails.addressLine2,
        orgDetails.city,
        orgDetails.state,
        orgDetails.postalCode,
      ]
        .filter(Boolean)
        .join(', ');
      await apiPatch('/api/v1/organisation', {
        legalName: orgDetails.name,
        tradingName: orgDetails.name,
        website: orgDetails.website,
        phone: orgDetails.contactNumber,
        email: orgDetails.contactEmail,
        address: fullAddress || orgDetails.addressLine1,
      });
      toast('Organization details saved to database.');
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      toast(err.message || 'Failed to save organization details', 'error');
    }
  };

  const handleTogglePolicy = async (key) => {
    const next = { ...orgPolicyToggles, [key]: !orgPolicyToggles[key] };
    setOrgPolicyToggles(next);
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'ORG_POLICY_TOGGLES',
        scope: 'ORG',
        value: next,
      });
      toast('Organization policy setting saved.');
    } catch (err) {
      toast(err.message || 'Could not persist policy setting', 'warning');
    }
  };

  const handleCreateLocation = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/locations', locForm);
      setLocModalOpen(false);
      setLocForm({ code: '', name: '', address: '', timezone: 'Africa/Nairobi', isHeadOffice: false });
      toast('Location created.');
      loadOrgData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleOpenAddDepartment = () => {
    setEditingDeptId(null);
    setOriginalDeptName('');
    setDeptForm({ code: '', name: '', headOfDepartmentId: '', parentDepartmentId: '', sharedM365Mailbox: '' });
    setDeptModalOpen(true);
  };

  const handleOpenEditDepartment = (dept) => {
    setEditingDeptId(dept.id);
    setOriginalDeptName(dept.name || '');
    setDeptForm({
      code: dept.code || '',
      name: dept.name || '',
      headOfDepartmentId: dept.headOfDepartmentId || '',
      parentDepartmentId: dept.parentDepartmentId || '',
      sharedM365Mailbox: dept.sharedM365Mailbox || '',
    });
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e) => {
    e.preventDefault();
    try {
      if (editingDeptId) {
        await apiPatch(`/api/v1/departments/${editingDeptId}`, {
          name: deptForm.name,
          headOfDepartmentId: deptForm.headOfDepartmentId || null,
          parentDepartmentId: deptForm.parentDepartmentId || null,
          sharedM365Mailbox: deptForm.sharedM365Mailbox || null,
        });
        toast('Department updated.');
      } else {
        await apiPost('/api/v1/departments', {
          name: deptForm.name,
          ...(deptForm.headOfDepartmentId ? { headOfDepartmentId: deptForm.headOfDepartmentId } : {}),
          ...(deptForm.parentDepartmentId ? { parentDepartmentId: deptForm.parentDepartmentId } : {}),
          ...(deptForm.sharedM365Mailbox ? { sharedM365Mailbox: deptForm.sharedM365Mailbox } : {}),
        });
        toast('Department added.');
      }
      setDeptModalOpen(false);
      setEditingDeptId(null);
      setOriginalDeptName('');
      setDeptForm({ code: '', name: '', headOfDepartmentId: '', parentDepartmentId: '', sharedM365Mailbox: '' });
      loadOrgData();
      if (onRefreshAll) onRefreshAll();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleCreateDesignation = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/positions', {
        code: desigForm.code,
        title: desigForm.title,
        departmentId: desigForm.departmentId,
        ...(desigForm.gradeId ? { gradeId: desigForm.gradeId } : {}),
      });
      setDesigModalOpen(false);
      setDesigForm((p) => ({ ...p, code: '', title: '' }));
      toast('Designation created.');
      loadOrgData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleCreateGrade = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/grades', {
        code: gradeForm.code,
        name: gradeForm.name,
        level: Number(gradeForm.level),
        noticePeriodDays: Number(gradeForm.noticePeriodDays),
      });
      setGradeModalOpen(false);
      setGradeForm({ code: '', name: '', level: 5, noticePeriodDays: 30 });
      toast('Grade added.');
      loadOrgData();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleImportCsvRows = (kind) => {
    setPendingImportKind(kind);
    if (importInputRef.current) {
      importInputRef.current.value = '';
      importInputRef.current.click();
    }
  };

  const handleImportCsvFileChange = async (e) => {
    const file = e.target.files?.[0];
    const kind = pendingImportKind;
    if (!file || !kind) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length < 2) {
        toast('CSV requires a header row and at least one data row (code,name).', 'warning');
        return;
      }
      const endpoint = kind === 'designations' ? 'positions' : kind;
      let createdCount = 0;
      for (const line of lines.slice(1)) {
        const [col1 = '', col2 = '', col3 = ''] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
        if (!col1 || !col2) continue;
        const payload =
          kind === 'locations'
            ? { code: col1, name: col2, address: col3 || 'Nairobi', timezone: 'Africa/Nairobi', isHeadOffice: false }
            : kind === 'departments'
            ? { code: col1, name: col2 }
            : { code: col1, title: col2, departmentId: col3 || departments[0]?.id };
        await apiPost(`/api/v1/${endpoint}`, payload);
        createdCount++;
      }
      toast(`Imported ${createdCount} ${kind} record(s) from CSV.`);
      loadOrgData();
    } catch (err) {
      toast(err.message || 'CSV import failed. Expected format: code,name', 'error');
    }
  };

  const handleAddFromAddress = async (e) => {
    e.preventDefault();
    const updated = [
      ...fromAddresses,
      {
        displayName: fromForm.displayName,
        email: fromForm.email,
        verified: true,
        authenticated: true,
      },
    ];
    setFromAddresses(updated);
    setFromModalOpen(false);
    setFromForm({ displayName: '', email: '' });
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'EMAIL_FROM_ADDRESSES',
        scope: 'ORG',
        value: { items: updated },
      });
      toast('Email From Address added & persisted.');
    } catch (err) {
      toast(err.message, 'warning');
    }
  };

  const filteredLocations = locations.filter(
    (l) => !locFilter || `${l.name} ${l.code} ${l.address || ''}`.toLowerCase().includes(locFilter.toLowerCase())
  );
  const filteredDepartments = departments.filter(
    (d) => !deptFilter || `${d.name} ${d.code}`.toLowerCase().includes(deptFilter.toLowerCase())
  );
  const filteredDesignations = designations.filter(
    (ds) => !desigFilter || `${ds.name} ${ds.code}`.toLowerCase().includes(desigFilter.toLowerCase())
  );

  return (
    <div className="flex flex-1 h-full bg-[#edf1f7] overflow-hidden">
      {/* Left Sub-Sidebar + Enterprise Administration */}
      <input
        ref={importInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportCsvFileChange}
      />
      <div className="w-[235px] bg-[#f8f9fc] border-r border-slate-200 p-2.5 space-y-0.5 flex-shrink-0 select-none overflow-y-auto">
        {orgTabs.map((t) => {
          const active = orgTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setOrgTab(t.id)}
              className={`w-full px-3.5 py-2 rounded-md text-left text-xs transition-colors ${
                active
                  ? 'bg-[#e6e9f4] text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-200/50 font-medium'
              }`}
            >
              {t.label}
            </button>
          );
        })}

        <div className="pt-3 mt-3 border-t border-slate-200 space-y-0.5">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Enterprise Security & Admin
          </p>
          {ENTERPRISE_ADMIN_TABS.map((t) => {
            const active = orgTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setOrgTab(t.id)}
                className={`w-full px-3.5 py-2 rounded-md text-left text-xs transition-colors ${
                  active
                    ? 'bg-[#e6e9f4] text-[#0088ff] font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/50 font-medium'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Content Canvas */}
      <div className="flex-1 overflow-y-auto p-5 text-xs">
        {/* TAB 1: ORGANIZATION DETAILS */}
        {orgTab === 'details' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-4xl">
            <h3 className="text-sm font-semibold text-slate-800 pb-3 mb-6 border-b border-slate-100">
              Basic Details
            </h3>

            <div className="space-y-4 max-w-2xl">
              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">Logo</label>
                <div className="col-span-8">
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDraftText(customLogoText || 'People');
                      setLogoModalOpen(true);
                    }}
                    className="w-48 h-24 border border-slate-200 rounded flex items-center justify-center gap-2.5 relative group bg-white"
                  >
                    <svg viewBox="0 0 36 36" className="w-9 h-9">
                      <circle cx="18" cy="10" r="4.5" fill="#ff5252" />
                      <circle cx="10" cy="15" r="3.5" fill="#ffca28" />
                      <circle cx="26" cy="15" r="3.5" fill="#26a69a" />
                      <path d="M11 27c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="#42a5f5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                    </svg>
                    <div className="text-left leading-tight">
                      <p className="text-xs font-bold text-slate-700">Ndakala</p>
                      <p className="text-base font-extrabold text-slate-900">{customLogoText || 'People'}</p>
                    </div>
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                      <span className="px-3 py-1 bg-[#0088ff] text-white rounded text-xs flex items-center gap-1">
                        <Edit size={12} /> Edit
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={orgDetails.name}
                  onChange={(e) => setOrgDetails({ ...orgDetails, name: e.target.value })}
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">Website</label>
                <input
                  type="text"
                  placeholder="Company Website"
                  value={orgDetails.website}
                  onChange={(e) => setOrgDetails({ ...orgDetails, website: e.target.value })}
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">
                  Type of organization
                </label>
                <select
                  value={orgDetails.orgType}
                  onChange={(e) => setOrgDetails({ ...orgDetails, orgType: e.target.value })}
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded bg-white text-slate-800"
                >
                  <option>Financial Services</option>
                  <option>IT & Advisory</option>
                  <option>Non-Profit</option>
                </select>
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">Contact person</label>
                <input
                  type="text"
                  placeholder="Contact person"
                  value={orgDetails.contactPerson}
                  onChange={(e) =>
                    setOrgDetails({ ...orgDetails, contactPerson: e.target.value })
                  }
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">Contact number</label>
                <input
                  type="text"
                  value={orgDetails.contactNumber}
                  onChange={(e) =>
                    setOrgDetails({ ...orgDetails, contactNumber: e.target.value })
                  }
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 items-center gap-4">
                <label className="col-span-4 text-slate-600 font-medium">
                  Contact email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={orgDetails.contactEmail}
                  onChange={(e) =>
                    setOrgDetails({ ...orgDetails, contactEmail: e.target.value })
                  }
                  className="col-span-8 px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 items-start gap-4">
                <label className="col-span-4 text-slate-600 font-medium pt-2">
                  Primary address
                </label>
                <div className="col-span-8 space-y-2.5">
                  <input
                    type="text"
                    placeholder="Address Line 1"
                    value={orgDetails.addressLine1}
                    onChange={(e) =>
                      setOrgDetails({ ...orgDetails, addressLine1: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    placeholder="Address Line 2"
                    value={orgDetails.addressLine2}
                    onChange={(e) =>
                      setOrgDetails({ ...orgDetails, addressLine2: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      placeholder="City"
                      value={orgDetails.city}
                      onChange={(e) => setOrgDetails({ ...orgDetails, city: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      placeholder="State"
                      value={orgDetails.state}
                      onChange={(e) => setOrgDetails({ ...orgDetails, state: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={orgDetails.country}
                      readOnly
                      className="px-3 py-2 border border-slate-300 rounded bg-slate-50"
                    />
                    <input
                      type="text"
                      placeholder="ZIP/PIN Code"
                      value={orgDetails.postalCode}
                      onChange={(e) =>
                        setOrgDetails({ ...orgDetails, postalCode: e.target.value })
                      }
                      className="px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSaveOrgDetails}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ORGANIZATION POLICY */}
        {orgTab === 'policy' && (
          <div className="space-y-4 max-w-4xl">
            <div className="bg-white rounded-md border border-slate-200 p-6 space-y-4">
              <h4 className="font-semibold text-slate-800 pb-2 border-b border-slate-100">
                Alert & Chat
              </h4>
              {[
                {
                  key: 'notifications',
                  title: 'Notifications',
                  desc: 'Disabling notifications will stop all email communications',
                },
                {
                  key: 'chat',
                  title: 'Chat',
                  desc: 'Specify if you want the chat bar or not',
                },
              ].map((item) => (
                <div key={item.key} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleTogglePolicy(item.key)}
                    className={`mt-0.5 w-9 h-5 rounded-full transition-colors p-0.5 ${
                      orgPolicyToggles[item.key] ? 'bg-[#0088ff]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        orgPolicyToggles[item.key] ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                  <div>
                    <p className="font-semibold text-slate-800">{item.title}</p>
                    <p className="text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-slate-800">Employee personal information</h4>
                <p className="text-slate-500 mt-0.5">
                  Define permissions to give employees the option to share or hide certain personal
                  information in the dashboard with others in the organization.
                </p>
              </div>

              {[
                {
                  key: 'birthday',
                  title: 'Birthday',
                  desc: 'Enable to give employees the choice to share or hide their birthday.',
                },
                {
                  key: 'workAnniversary',
                  title: 'Work Anniversary',
                  desc: 'Enable to give employees the choice to share or hide their work anniversary day.',
                },
                {
                  key: 'mobileNumber',
                  title: 'Mobile number',
                  desc: 'Enable to give employees the choice to share or hide their personal mobile number.',
                },
              ].map((item) => (
                <div key={item.key} className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => handleTogglePolicy(item.key)}
                    className={`mt-0.5 w-9 h-5 rounded-full transition-colors p-0.5 ${
                      orgPolicyToggles[item.key] ? 'bg-[#0088ff]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        orgPolicyToggles[item.key] ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                  <div>
                    <p className="font-semibold text-slate-800">{item.title}</p>
                    <p className="text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: ORGANIZATION STRUCTURE */}
        {orgTab === 'structure' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-4xl">
            <h4 className="font-semibold text-slate-800">Organization Structure</h4>
            <p className="text-slate-500 mt-1 mb-4">
              Configure your organization's hierarchy and maintain the data of multiple dependent
              companies in the same account.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleTogglePolicy('orgStructure')}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  orgPolicyToggles.orgStructure ? 'bg-[#0088ff]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    orgPolicyToggles.orgStructure ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <span className="font-medium text-slate-700">Enable Organization Structure</span>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => setOrgTab('departments')}
                className="px-3 py-1.5 border border-slate-200 rounded hover:border-[#0088ff] text-slate-700"
              >
                Manage Departments ({departments.length})
              </button>
              <button
                type="button"
                onClick={() => setOrgTab('locations')}
                className="px-3 py-1.5 border border-slate-200 rounded hover:border-[#0088ff] text-slate-700"
              >
                Manage Locations ({locations.length})
              </button>
              <button
                type="button"
                onClick={() => setOrgTab('designations')}
                className="px-3 py-1.5 border border-slate-200 rounded hover:border-[#0088ff] text-slate-700"
              >
                Manage Designations & Grades ({designations.length})
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: LOCATIONS */}
        {orgTab === 'locations' && (
          <div className="bg-white rounded-md border border-slate-200 min-h-[420px] flex flex-col">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <span>
                Total Count: <strong className="text-[#0088ff]">{filteredLocations.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                {locFilterOpen && (
                  <input
                    type="text"
                    value={locFilter}
                    onChange={(e) => setLocFilter(e.target.value)}
                    placeholder="Filter locations..."
                    className="px-2.5 py-1 border border-slate-300 rounded"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setLocModalOpen(true)}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white font-medium rounded"
                >
                  Add Location
                </button>
                <button
                  type="button"
                  onClick={() => handleImportCsvRows('locations')}
                  className="px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setLocFilterOpen(!locFilterOpen)}
                  className={`p-1.5 border rounded ${locFilterOpen ? 'border-[#0088ff] text-[#0088ff]' : 'border-slate-200 text-slate-500'}`}
                >
                  <Filter size={13} />
                </button>
              </div>
            </div>
            {filteredLocations.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <NdakalaEmptyState
                  title="No locations added currently. Add all the geographical locations your organization operates from."
                  actionLabel="Add Location"
                  onAction={() => setLocModalOpen(true)}
                />
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-5">Code</th>
                    <th className="py-3 px-5">Location Name</th>
                    <th className="py-3 px-5">Address</th>
                    <th className="py-3 px-5">Timezone</th>
                    <th className="py-3 px-5">HQ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLocations.map((l) => (
                    <tr key={l.id || l.code} className="hover:bg-slate-50">
                      <td className="py-3 px-5 font-mono text-slate-600">{l.code}</td>
                      <td className="py-3 px-5 font-medium text-slate-800">{l.name}</td>
                      <td className="py-3 px-5 text-slate-500">{l.address || '-'}</td>
                      <td className="py-3 px-5 text-slate-500">{l.timezone}</td>
                      <td className="py-3 px-5">
                        {l.isHeadOffice ? (
                          <span className="px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded text-[10px] font-semibold">Head Office</span>
                        ) : 'Branch'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 5: DEPARTMENTS */}
        {orgTab === 'departments' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <span>
                Total Count: <strong className="text-[#0088ff]">{filteredDepartments.length}</strong>
              </span>
              <div className="flex items-center gap-2">
                {deptFilterOpen && (
                  <input
                    type="text"
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value)}
                    placeholder="Filter departments..."
                    className="px-2.5 py-1 border border-slate-300 rounded"
                  />
                )}
                <button
                  type="button"
                  onClick={handleOpenAddDepartment}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white font-medium rounded"
                >
                  Add Department
                </button>
                <button
                  type="button"
                  onClick={() => handleImportCsvRows('departments')}
                  className="px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                >
                  Import
                </button>
                <button
                  type="button"
                  onClick={() => setDeptFilterOpen(!deptFilterOpen)}
                  className={`p-1.5 border rounded ${deptFilterOpen ? 'border-[#0088ff] text-[#0088ff]' : 'border-slate-200 text-slate-500'}`}
                >
                  <Filter size={13} />
                </button>
              </div>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-5">Department Name</th>
                  <th className="py-3 px-5">Code</th>
                  <th className="py-3 px-5">Associated users</th>
                  <th className="py-3 px-5">Mail Alias</th>
                  <th className="py-3 px-5">Department Lead</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDepartments.map((d) => {
                  const leadEmp = d.headOfDepartmentId ? employees.find((e) => e.id === d.headOfDepartmentId) : null;
                  const displayLead = leadEmp
                    ? leadEmp.fullName || `${leadEmp.firstName || ''} ${leadEmp.lastName || ''}`.trim()
                    : d.lead;
                  return (
                    <tr key={d.id || d.code || d.name} className="hover:bg-slate-50">
                      <td className="py-3.5 px-5 text-slate-800">
                        <div className="font-medium">{d.name}</div>
                        {d.parentDepartmentName && (
                          <div className="text-[11px] text-slate-400">Under: {d.parentDepartmentName}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-semibold">
                          {d.code}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-[#0088ff] font-medium">{d.users}</td>
                      <td className="py-3.5 px-5 text-slate-500">{d.sharedM365Mailbox || d.alias || '-'}</td>
                      <td className="py-3.5 px-5 text-slate-600">{displayLead}</td>
                      <td className="py-3.5 px-5 text-right">
                        {d.id && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditDepartment(d)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#0088ff] bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
                          >
                            <Edit size={12} /> Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 6: DESIGNATIONS & GRADES */}
        {orgTab === 'designations' && (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <span>
                  Total Count: <strong className="text-[#0088ff]">{filteredDesignations.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  {desigFilterOpen && (
                    <input
                      type="text"
                      value={desigFilter}
                      onChange={(e) => setDesigFilter(e.target.value)}
                      placeholder="Filter designations..."
                      className="px-2.5 py-1 border border-slate-300 rounded"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setDesigModalOpen(true)}
                    className="px-3.5 py-1.5 bg-[#0088ff] text-white font-medium rounded"
                  >
                    Add Designation
                  </button>
                  <button
                    type="button"
                    onClick={() => setGradeModalOpen(true)}
                    className="px-3 py-1.5 border border-[#0088ff] text-[#0088ff] font-medium rounded"
                  >
                    Add Grade ({grades.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImportCsvRows('designations')}
                    className="px-3 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50"
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesigFilterOpen(!desigFilterOpen)}
                    className={`p-1.5 border rounded ${desigFilterOpen ? 'border-[#0088ff] text-[#0088ff]' : 'border-slate-200 text-slate-500'}`}
                  >
                    <Filter size={13} />
                  </button>
                </div>
              </div>
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-3 px-5">Designation Name</th>
                    <th className="py-3 px-5">Code</th>
                    <th className="py-3 px-5">Department / Grade</th>
                    <th className="py-3 px-5">Associated users</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDesignations.map((ds) => (
                    <tr key={ds.id || ds.code || ds.name} className="hover:bg-slate-50">
                      <td className="py-3.5 px-5 text-slate-800">{ds.name}</td>
                      <td className="py-3.5 px-5 text-slate-500">{ds.code}</td>
                      <td className="py-3.5 px-5 text-slate-500">{ds.departmentName || '-'} {ds.gradeName ? `• ${ds.gradeName}` : ''}</td>
                      <td className="py-3.5 px-5 text-[#0088ff] font-medium">{ds.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 7: DOMAINS AND REBRANDING */}
        {orgTab === 'domains' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-4xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Domains & Portal Rebranding</h3>
                <p className="text-slate-500 mt-0.5">
                  Configure your custom Ndakala People portal URL and corporate emblem identity.
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 font-semibold text-[11px]">
                TLS Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 font-medium mb-1">Portal Custom Domain</label>
                <input
                  type="text"
                  value={portalDomain}
                  onChange={(e) => setPortalDomain(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Workspace Brand Subtitle</label>
                <input
                  type="text"
                  value={logoDraftText}
                  onChange={(e) => setLogoDraftText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={async () => {
                  const trimmedDomain = portalDomain.trim();
                  if (!trimmedDomain || !trimmedDomain.includes('.')) {
                    toast('Enter a valid portal domain (e.g. portal.company.com).', 'error');
                    return;
                  }
                  const trimmedLabel = logoDraftText.trim() || 'People';
                  setCustomLogoText(trimmedLabel);
                  setPortalDomain(trimmedDomain);
                  try {
                    await apiPut('/api/v1/workspace/ui-config', {
                      key: 'ORG_LOGO_LABEL',
                      scope: 'ORG',
                      value: { label: trimmedLabel, domain: trimmedDomain },
                    });
                    toast('Domain and portal branding saved.');
                  } catch (err) {
                    toast(err.message || 'Could not save branding', 'error');
                  }
                }}
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded"
              >
                Save Domain & Branding
              </button>
              <span className="text-[11px] text-slate-400">
                Support contact: {orgDetails.contactEmail || 'hr-support@company.com'}
              </span>
            </div>
          </div>
        )}

        {/* TAB 8: FROM ADDRESSES */}
        {orgTab === 'fromaddresses' && (
          <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setFromModalOpen(true)}
                className="px-3.5 py-1.5 bg-[#0088ff] text-white font-medium rounded"
              >
                Add Email From Address
              </button>
            </div>
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-3 px-5">Display Name</th>
                  <th className="py-3 px-5">Email From address</th>
                  <th className="py-3 px-5">Verification Status</th>
                  <th className="py-3 px-5">Authentication Status</th>
                </tr>
              </thead>
              <tbody>
                {fromAddresses.map((fa, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="py-3.5 px-5 text-slate-800">{fa.displayName}</td>
                    <td className="py-3.5 px-5 text-slate-600">{fa.email}</td>
                    <td className="py-3.5 px-5 text-emerald-600 font-medium">✓ Verified</td>
                    <td className="py-3.5 px-5 text-emerald-600 font-medium">Authenticated</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 9: EMAIL AUTHENTICATION */}
        {orgTab === 'emailauth' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 space-y-5 max-w-4xl">
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4">Domain</th>
                  <th className="py-2.5 px-4">Authentication Status</th>
                </tr>
              </thead>
              <tbody>
                {fromAddresses.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="py-4 text-center text-slate-400">
                      No domains to list
                    </td>
                  </tr>
                ) : (
                  Array.from(new Set(fromAddresses.map((f) => (f.email || '').split('@')[1]).filter(Boolean))).map((dom) => (
                    <tr key={dom} className="border-b border-slate-100">
                      <td className="py-2.5 px-4 font-medium text-slate-800">{dom}</td>
                      <td className="py-2.5 px-4 text-emerald-600 font-medium">✓ DKIM & DMARC Active</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="p-4 rounded border-l-4 border-emerald-500 bg-emerald-50/50 space-y-2 text-slate-700">
              <p className="font-semibold text-slate-800">Important</p>
              <p>
                To enhance the deliverability of your emails, ensure that all email-sending domains
                are DKIM (DomainKeys Identified Mail) authenticated and have an active DMARC
                enforcement policy in place.
              </p>
              <p className="pt-1 font-medium">The domains listed here include:</p>
              <p>i) Domains used by current active users</p>
              <p>
                ii) Verified domains from added 'From' addresses or manually CAPTCHA-verified email
                addresses
              </p>
            </div>
          </div>
        )}

        {/* ENTERPRISE SECURITY & ADMIN PANELS */}
        <OrgAdminEnterprisePanels
          orgTab={orgTab}
          employees={employees}
          onRefreshAll={onRefreshAll}
          onShowToast={onShowToast}
        />
      </div>

      {/* Modals for Location / Department / Designation / Grade / Email From */}
      {locModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
          <form onSubmit={handleCreateLocation} className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-slate-800">Add Location</h4>
              <button type="button" onClick={() => setLocModalOpen(false)}><X size={15} /></button>
            </div>
            <input type="text" required placeholder="Code (e.g. NBO-HQ)" value={locForm.code} onChange={(e) => setLocForm({ ...locForm, code: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <input type="text" required placeholder="Location Name" value={locForm.name} onChange={(e) => setLocForm({ ...locForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <input type="text" placeholder="Street Address" value={locForm.address} onChange={(e) => setLocForm({ ...locForm, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <label className="flex items-center gap-2"><input type="checkbox" checked={locForm.isHeadOffice} onChange={(e) => setLocForm({ ...locForm, isHeadOffice: e.target.checked })} /> Head Office</label>
            <button type="submit" className="w-full py-2 bg-[#0088ff] text-white rounded font-medium">Save Location</button>
          </form>
        </div>
      )}

      {deptModalOpen && (() => {
        const keepExistingCode = editingDeptId && deptForm.name.trim() === originalDeptName.trim();
        const computedCode = keepExistingCode
          ? deptForm.code
          : previewDepartmentCode(deptForm.name, departments, editingDeptId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
            <form onSubmit={handleSaveDepartment} className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <h4 className="font-semibold text-slate-800">{editingDeptId ? 'Edit Department' : 'Add Department'}</h4>
                <button type="button" onClick={() => setDeptModalOpen(false)}><X size={15} /></button>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Department Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tax Advisory"
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-slate-700">Department Code</label>
                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#0088ff] font-semibold text-[10px]">
                    AUTO-GENERATED
                  </span>
                </div>
                <input
                  type="text"
                  readOnly
                  disabled
                  value={computedCode || 'System generates from name'}
                  className="w-full px-3 py-2 border border-slate-200 rounded bg-slate-50 text-slate-600 font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Parent Department</label>
                <select
                  value={deptForm.parentDepartmentId}
                  onChange={(e) => setDeptForm({ ...deptForm, parentDepartmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  <option value="">None (Top-Level Department)</option>
                  {departments
                    .filter((d) => d.id && d.id !== editingDeptId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">Department Lead</label>
                <select
                  value={deptForm.headOfDepartmentId}
                  onChange={(e) => setDeptForm({ ...deptForm, headOfDepartmentId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                >
                  <option value="">Optional Department Lead...</option>
                  {employees.map((em) => (
                    <option key={em.id} value={em.id}>
                      {em.fullName || `${em.firstName || ''} ${em.lastName || ''}`.trim()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Shared M365 Mailbox / Dept Calendar Email
                </label>
                <input
                  type="email"
                  placeholder="e.g. dept@company.com"
                  value={deptForm.sharedM365Mailbox}
                  onChange={(e) => setDeptForm({ ...deptForm, sharedM365Mailbox: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-medium">
                {editingDeptId ? 'Save Changes' : 'Save Department'}
              </button>
            </form>
          </div>
        );
      })()}

      {desigModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
          <form onSubmit={handleCreateDesignation} className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-slate-800">Add Designation</h4>
              <button type="button" onClick={() => setDesigModalOpen(false)}><X size={15} /></button>
            </div>
            <input type="text" required placeholder="Position Code (e.g. SNR-ADV)" value={desigForm.code} onChange={(e) => setDesigForm({ ...desigForm, code: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <input type="text" required placeholder="Designation Title" value={desigForm.title} onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <select required value={desigForm.departmentId} onChange={(e) => setDesigForm({ ...desigForm, departmentId: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded bg-white">
              <option value="">Select Department...</option>
              {departments.filter((d) => d.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={desigForm.gradeId} onChange={(e) => setDesigForm({ ...desigForm, gradeId: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded bg-white">
              <option value="">Optional Grade...</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.code})</option>)}
            </select>
            <button type="submit" className="w-full py-2 bg-[#0088ff] text-white rounded font-medium">Save Designation</button>
          </form>
        </div>
      )}

      {gradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
          <form onSubmit={handleCreateGrade} className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-slate-800">Add Job Grade</h4>
              <button type="button" onClick={() => setGradeModalOpen(false)}><X size={15} /></button>
            </div>
            <input type="text" required placeholder="Grade Code (e.g. G7)" value={gradeForm.code} onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <input type="text" required placeholder="Grade Name (e.g. Senior Manager)" value={gradeForm.name} onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={1} max={20} placeholder="Level" value={gradeForm.level} onChange={(e) => setGradeForm({ ...gradeForm, level: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input type="number" min={7} max={180} placeholder="Notice Days" value={gradeForm.noticePeriodDays} onChange={(e) => setGradeForm({ ...gradeForm, noticePeriodDays: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            </div>
            <button type="submit" className="w-full py-2 bg-[#0088ff] text-white rounded font-medium">Save Grade</button>
          </form>
        </div>
      )}

      {fromModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
          <form onSubmit={handleAddFromAddress} className="bg-white rounded-md shadow-xl border border-slate-200 max-w-md w-full p-5 space-y-3">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-slate-800">Add Email From Address</h4>
              <button type="button" onClick={() => setFromModalOpen(false)}><X size={15} /></button>
            </div>
            <input type="text" required placeholder="Display Name (e.g. HR People)" value={fromForm.displayName} onChange={(e) => setFromForm({ ...fromForm, displayName: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <input type="email" required placeholder="hr@company.com" value={fromForm.email} onChange={(e) => setFromForm({ ...fromForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <button type="submit" className="w-full py-2 bg-[#0088ff] text-white rounded font-medium">Save Email Address</button>
          </form>
        </div>
      )}

      {logoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 text-xs">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const label = logoDraftText.trim() || 'People';
              setCustomLogoText(label);
              setLogoModalOpen(false);
              try {
                await apiPut('/api/v1/workspace/ui-config', {
                  key: 'ORG_LOGO_LABEL',
                  scope: 'ORG',
                  value: { label, domain: portalDomain },
                });
                toast('Organization brand emblem updated.');
              } catch (err) {
                toast(err.message || 'Unable to save emblem', 'error');
              }
            }}
            className="bg-white rounded-md shadow-xl border border-slate-200 max-w-sm w-full p-5 space-y-3"
          >
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="font-semibold text-slate-800">Update Organization Emblem</h4>
              <button type="button" onClick={() => setLogoModalOpen(false)}><X size={15} /></button>
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Emblem Subtitle</label>
              <input
                type="text"
                required
                value={logoDraftText}
                onChange={(e) => setLogoDraftText(e.target.value)}
                placeholder="e.g. People, Advisory HR"
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
            <button type="submit" className="w-full py-2 bg-[#0088ff] text-white rounded font-medium">
              Save Emblem
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
