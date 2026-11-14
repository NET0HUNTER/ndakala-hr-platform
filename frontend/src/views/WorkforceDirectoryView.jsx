import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Maximize,
  Minimize,
  Filter,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  X,
  Search,
  Upload,
  Download,
  Plus,
  Check,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiPatch, apiDelete, apiDownload, apiRequest, unwrapList } from '../utils/api';

const AVAILABLE_VIEW_COLUMNS = [
  'Additional Information',
  'Official Email',
  'Current Salary',
  'Photo',
  'Experience',
  'Permanent address',
  'Phone',
  'Department',
  'Email ID',
  'Onboarding Status',
  'Last name',
  'Tentative Joining Date',
  'Skill Set',
  'Source of Hire',
  'Present address',
  'Title',
  'Location',
  'First name',
  'Highest Qualification',
  'Gender',
  'AboutMe',
  'Marital status',
  'Citizenship',
  'Nick Name',
  'Date of joining',
  'Ask me about/Expertise',
];

const DEFAULT_DIRECTORY_COLUMNS = [
  'First name',
  'Last name',
  'Email ID',
  'Official Email',
  'Onboarding Status',
  'Department',
  'Source of Hire',
  'Gender',
  'Marital status',
];

function getDirectoryCellValue(row, col) {
  const emp = row.rawEmployee || {};
  switch (col) {
    case 'First name': return row.firstName;
    case 'Last name': return row.lastName;
    case 'Email ID': return row.email || '-';
    case 'Official Email': return row.officialEmail || '-';
    case 'Onboarding Status': return row.onboardingStatus || '-';
    case 'Department': return row.department || '-';
    case 'Source of Hire': return row.sourceOfHire || 'Direct';
    case 'Gender': return row.gender || '-';
    case 'Marital status': return row.maritalStatus || 'Single';
    case 'Phone': return emp.phoneNumber || '-';
    case 'Title': return row.jobTitle || '-';
    case 'Location': return row.location || 'Nairobi';
    case 'Date of joining':
    case 'Tentative Joining Date':
      return emp.startDate ? String(emp.startDate).slice(0, 10) : '-';
    case 'Current Salary': return emp.employeeNumber || row.employeeNumber || '-';
    case 'Photo': return `${(row.firstName || 'E')[0]}${(row.lastName || 'N')[0]}`;
    case 'Citizenship': return emp.citizenship || 'Kenyan';
    case 'Highest Qualification': return emp.highestQualification || '-';
    case 'Permanent address':
    case 'Present address':
      return emp.residentialAddress || row.location || 'Nairobi';
    default:
      return emp[col] || row.status || '-';
  }
}

export default function WorkforceDirectoryView({
  employees = [],
  topContextTab = 'onboarding',
  setTopContextTab,
  subViewHint = null,
  currentUser,
  onCreateEmployee,
  onTransitionEmployeeStatus,
  onSetProbationObjectives,
  onEvaluateProbation,
  onConfirmProbation,
  onAssignSalaryStructure,
  onRefreshAll,
  onShowToast,
  salaryStructures = [],
}) {
  // Data scope dropdown: 'Reportees + My Data' | "Reportees' Data" | "Direct Reportees' Data" | 'My Data'
  const [dataScope, setDataScope] = useState('Reportees + My Data');
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const photoInputRef = useRef(null);

  // View selector dropdown + Create View drawer (07:28 - 07:40 of hr.webm)
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [createViewOpen, setCreateViewOpen] = useState(false);
  const [customViewName, setCustomViewName] = useState('');
  const [defaultViewChecked, setDefaultViewChecked] = useState(false);
  const [viewPermission, setViewPermission] = useState('ONLY_ME');
  const [selectedViewCols, setSelectedViewCols] = useState([
    'First name',
    'Last name',
    'Email ID',
    'Official Email',
    'Onboarding Status',
    'Department',
    'Source of Hire',
    'Gender',
    'Marital status',
  ]);

  // Full screen mode (08:06 - 08:11 of hr.webm)
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowIds, setSelectedRowIds] = useState([]);

  // Right-side Filter panel (08:15 - 08:19 of hr.webm)
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterSearch, setFilterSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterFields, setFilterFields] = useState([]);

  // Right-side ... More menu (08:26 - 08:28 of hr.webm)
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreRef = useRef(null);

  // Full-Screen "Add Candidate" Modal (07:44 - 08:01 of hr.webm)
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [candidateForm, setCandidateForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phoneCode: '+254',
    phone: '',
    officialEmail: '',
    nickName: '',
    expertise: '',
    addressLine1: '',
    addressLine2: '',
    city: 'Nairobi',
    country: 'Kenya',
    state: 'Nairobi County',
    postalCode: '00100',
    sameAsPresent: true,
    experienceYears: '',
    currentSalary: '',
    sourceOfHire: 'Direct',
    skillSet: '',
    highestQualification: 'BSc',
    additionalInfo: '',
    department: 'IT',
    jobTitle: 'ICT Associate',
    location: 'Nairobi',
    hireDate: '2026-11-13',
    tentativeDate: '2026-11-16',
    gender: 'Male',
    maritalStatus: 'Single',
    aboutMe: '',
    citizenship: 'Kenyan',
    dateOfBirth: '1999-01-01',
    nationalId: '38910293',
    kraPin: 'A012345678Z',
    nssfNumber: '20019283',
    shifNumber: 'SHIF-99182',
    departmentId: '',
    positionId: '',
    gradeId: '',
    locationId: '',
    employmentCategoryCode: 'PERMANENT',
  });
  const [filterStatus, setFilterStatus] = useState('');

  const [educationRows, setEducationRows] = useState([
    { school: '', degree: '', field: '', completionDate: '', notes: '' },
  ]);
  const [experienceRows, setExperienceRows] = useState([
    { occupation: '', company: '', summary: '', duration: '', currentlyWorkHere: 'Select', fromDate: '', toDate: '' },
  ]);
  const [dependentRows, setDependentRows] = useState([
    { name: '', relationship: 'Select', dob: '' },
  ]);

  // Employee 360 / Probation Drawer when clicking a row
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [detailEmployee, setDetailEmployee] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Live Backend Catalogs & Operational Sub-Modules
  const [dirSubMode, setDirSubMode] = useState('records'); // records | ict | requisitions | transfers | separation | setup
  const [departments, setDepartments] = useState([]);
  const [positions, setPositions] = useState([]);
  const [grades, setGrades] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [onboardingTemplates, setOnboardingTemplates] = useState([]);
  const [customViews, setCustomViews] = useState([]);
  const [activeCustomView, setActiveCustomView] = useState(null);

  const [ictRequests, setIctRequests] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [surveyMetrics, setSurveyMetrics] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [separations, setSeparations] = useState([]);
  const [selectedSepDetail, setSelectedSepDetail] = useState(null);
  const [jobsResult, setJobsResult] = useState(null);
  const [probationForms, setProbationForms] = useState([]);

  // Drawer action state
  const [drawerTab, setDrawerTab] = useState('overview'); // overview | onboarding | probation | changes | documents
  const [objInput, setObjInput] = useState({ objective: '', expectedOutput: '', supportRequired: '' });
  const [evalForm, setEvalForm] = useState({
    recommendation: 'CONFIRM',
    recommendationReason: 'Consistently meets Ndakala values and role KPIs',
    supervisorComments: 'Strong performance across engagement deliverables.',
    rating: 'Very Good',
    evidenceComments: 'Demonstrated reliably on client engagements',
  });
  const [decisionForm, setDecisionForm] = useState({
    decision: 'CONFIRMED',
    decisionReason: 'Approved following probation assessment review',
    extendedEndDate: '',
  });
  const [changeForm, setChangeForm] = useState({
    changeType: 'EMPLOYMENT',
    reason: 'Role progression and reporting adjustment',
    jobTitle: '',
    newStatus: 'ACTIVE',
  });
  const [docUploadForm, setDocUploadForm] = useState({ documentType: 'CONTRACT', visibility: 'HR_AND_EMPLOYEE', notes: '' });

  // Forms for ICT, Requisitions, Transfers, Separations, Setup
  const [reqForm, setReqForm] = useState({
    departmentId: '',
    positionTitle: '',
    headcount: 1,
    reason: 'NEW_GROWTH',
    vacancyDuration: 'PERMANENT',
    jobDescription: '',
    keyResponsibilities: '',
    requiredSkills: '',
  });
  const [surveyForm, setSurveyForm] = useState({
    requisitionId: '',
    candidateRef: '',
    roleClarityRating: 5,
    processSpeedRating: 5,
    candidateQualityRating: 5,
    communicationRating: 5,
    overallExperienceRating: 5,
    comments: '',
  });
  const [transferForm, setTransferForm] = useState({
    employeeId: '',
    proposedDepartmentId: '',
    proposedPositionId: '',
    proposedLocationId: '',
    reason: '',
    effectiveDate: '2026-12-01',
    handoverNotes: '',
  });
  const [sepForm, setSepForm] = useState({
    employeeId: '',
    triggerType: 'RESIGNATION',
    reason: '',
    noticeDate: '2026-11-13',
    intendedLastDay: '2026-12-13',
    effectiveDate: '2026-12-14',
    noticeServedDays: 30,
  });
  const [exitInterviewForm, setExitInterviewForm] = useState({
    primaryReason: 'Career Progression',
    cultureRating: 4,
    managementRating: 4,
    compensationRating: 4,
    confidentialComments: '',
  });
  const [catForm, setCatForm] = useState({
    code: '',
    name: '',
    probationApplies: true,
    defaultProbationMonths: 6,
    defaultNoticePeriodDays: 30,
    sourceReference: 'Ndakala HR Policy Manual v2026',
  });
  const [tplForm, setTplForm] = useState({
    code: '',
    name: '',
    sourceReference: 'Ndakala Onboarding SOP',
    itemTitle: 'Signed Employment Contract & NDA',
    ownerType: 'HR',
    dueDaysAfterStart: 3,
  });

  const notify = (msg, type = 'success') => {
    if (onShowToast) onShowToast(msg, type);
  };

  const loadDirectoryData = async () => {
    try {
      const [depts, pos, grds, locs, cats, tpls, pForms, views, dft] = await Promise.all([
        apiGet('/api/v1/departments').catch(() => []),
        apiGet('/api/v1/positions').catch(() => []),
        apiGet('/api/v1/grades').catch(() => []),
        apiGet('/api/v1/locations').catch(() => []),
        apiGet('/api/v1/employee-categories').catch(() => []),
        apiGet('/api/v1/onboarding-templates').catch(() => []),
        apiGet('/api/v1/probation-forms').catch(() => []),
        apiGet('/api/v1/workspace/custom-views?module=DIRECTORY').catch(() => []),
        apiGet('/api/v1/workspace/ui-config?key=CANDIDATE_DRAFT').catch(() => null),
      ]);
      const deptList = unwrapList(depts);
      const posList = unwrapList(pos);
      const grdList = unwrapList(grds);
      const locList = unwrapList(locs);
      const catList = unwrapList(cats);
      setDepartments(deptList);
      setPositions(posList);
      setGrades(grdList);
      setLocations(locList);
      setCategories(catList);
      setOnboardingTemplates(unwrapList(tpls));
      setProbationForms(unwrapList(pForms));
      const parsedViews = unwrapList(views);
      setCustomViews(parsedViews);
      const defView = parsedViews.find((v) => v.isDefault);
      if (defView) setActiveCustomView(defView);
      const draftVal = dft?.configs?.CANDIDATE_DRAFT || dft?.value;
      if (draftVal && typeof draftVal === 'object') {
        if (draftVal.firstName || draftVal.email) {
          setCandidateForm((prev) => ({ ...prev, ...draftVal }));
        }
        if (Array.isArray(draftVal.educationRows) && draftVal.educationRows.length > 0) {
          setEducationRows(draftVal.educationRows);
        }
        if (Array.isArray(draftVal.experienceRows) && draftVal.experienceRows.length > 0) {
          setExperienceRows(draftVal.experienceRows);
        }
        if (Array.isArray(draftVal.dependentRows) && draftVal.dependentRows.length > 0) {
          setDependentRows(draftVal.dependentRows);
        }
      }
      setCandidateForm((prev) => ({
        ...prev,
        departmentId: prev.departmentId || deptList[0]?.id || '',
        department: prev.department || deptList[0]?.name || 'IT',
        positionId: prev.positionId || posList[0]?.id || '',
        gradeId: prev.gradeId || grdList[0]?.id || '',
        locationId: prev.locationId || locList[0]?.id || '',
        employmentCategoryCode: prev.employmentCategoryCode || catList.find((c) => c.status === 'ACTIVE')?.code || catList[0]?.code || 'PERMANENT',
      }));
      setReqForm((prev) => ({ ...prev, departmentId: prev.departmentId || deptList[0]?.id || '' }));
      setTransferForm((prev) => ({
        ...prev,
        employeeId: prev.employeeId || employees[0]?.id || '',
        proposedDepartmentId: prev.proposedDepartmentId || deptList[0]?.id || '',
        proposedPositionId: prev.proposedPositionId || posList[0]?.id || '',
        proposedLocationId: prev.proposedLocationId || locList[0]?.id || '',
      }));
      setSepForm((prev) => ({ ...prev, employeeId: prev.employeeId || employees[0]?.id || '' }));
    } catch {
      // ignore catalog load failure on restricted role
    }
  };

  const loadOperationsTabData = async (mode) => {
    if (mode === 'ict') {
      const list = await apiGet('/api/v1/ict-requests').catch(() => []);
      setIctRequests(unwrapList(list));
    } else if (mode === 'requisitions') {
      const [reqs, met] = await Promise.all([
        apiGet('/api/v1/workforce/requisitions').catch(() => []),
        apiGet('/api/v1/workforce/surveys/metrics').catch(() => null),
      ]);
      setRequisitions(unwrapList(reqs));
      setSurveyMetrics(met);
    } else if (mode === 'transfers') {
      const list = await apiGet('/api/v1/workforce/transfers').catch(() => []);
      setTransfers(unwrapList(list));
    } else if (mode === 'separation') {
      const list = await apiGet('/api/v1/separation').catch(() => []);
      setSeparations(unwrapList(list));
    }
  };

  useEffect(() => {
    loadDirectoryData();
  }, []);

  useEffect(() => {
    if (dirSubMode !== 'records') {
      loadOperationsTabData(dirSubMode);
    }
  }, [dirSubMode]);

  useEffect(() => {
    if (subViewHint === 'separation') {
      setDirSubMode('separation');
    } else if (subViewHint === 'transfers') {
      setDirSubMode('transfers');
    } else if (subViewHint === 'requisitions') {
      setDirSubMode('requisitions');
    } else if (subViewHint === 'ict') {
      setDirSubMode('ict');
    }
  }, [subViewHint]);

  useEffect(() => {
    if (topContextTab === 'probation') {
      setDirSubMode('records');
      setFilterStatus('PROBATION');
    } else if (topContextTab === 'employees') {
      setDirSubMode('records');
      setFilterStatus('');
    } else if (topContextTab === 'onboarding') {
      setDirSubMode('records');
      setFilterStatus('');
    }
  }, [topContextTab]);

  useEffect(() => {
    function handleOutside(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreActionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const openEmployeeDrawer = async (row) => {
    setSelectedRecord(row);
    setDrawerTab('overview');
    setDetailEmployee(null);
    if (!row.rawEmployee) return;
    setDetailLoading(true);
    try {
      const full = await apiGet(`/api/v1/employees/${row.id}`);
      setDetailEmployee(full);
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  // Map live backend employees exclusively
  const mappedBackendRows = employees.map((emp) => {
    const first = emp.firstName || (emp.fullName || 'Employee').split(' ')[0];
    const last = emp.lastName || (emp.fullName || '').split(' ').slice(1).join(' ') || '-';
    return {
      id: emp.id,
      employeeNumber: emp.employeeNumber || '',
      firstName: first,
      lastName: last,
      email: emp.workEmail || emp.email || emp.personalEmail || '',
      officialEmail: emp.workEmail || emp.email || '',
      onboardingStatus: emp.onboardingCompletedAt ? 'Completed' : emp.status === 'PROBATION' ? 'In Progress' : 'Triggered',
      department: emp.department?.name || emp.department || 'Management',
      sourceOfHire: 'Direct',
      gender: emp.gender || 'Male',
      maritalStatus: 'Single',
      jobTitle: emp.jobTitle || emp.position?.title || 'Associate',
      status: emp.status || 'ACTIVE',
      location: emp.location?.name || 'Nairobi',
      rawEmployee: emp,
    };
  });

  const onboardingPool = mappedBackendRows.filter(
    (r) => r.status === 'PROBATION' || !r.rawEmployee?.onboardingCompletedAt
  );
  const mergedRows =
    topContextTab === 'onboarding' && onboardingPool.length > 0 ? onboardingPool : mappedBackendRows;

  // Filter rows based on live Data Scope & search/department/status filters
  const scopedRows = mergedRows.filter((r) => {
    if (dataScope === "Reportees' Data" || dataScope === "Direct Reportees' Data") {
      if (r.rawEmployee?.managerId !== currentUser?.employeeId) return false;
    } else if (dataScope === 'My Data') {
      const myEmail = (currentUser?.email || '').toLowerCase();
      if (r.id !== currentUser?.employeeId && (r.email || '').toLowerCase() !== myEmail) return false;
    }
    const fieldMap = {
      'First name': r.firstName,
      'Last name': r.lastName,
      'Email ID': r.email,
      'Official Email': r.officialEmail,
      'Onboarding Status': r.status,
      Department: r.department,
      'Source of Hire': r.sourceOfHire,
      Gender: r.gender,
      'Marital status': r.maritalStatus,
      AboutMe: r.aboutMe,
      Citizenship: r.citizenship,
      'Nick Name': r.nickName,
      'Current Salary': r.currentSalary,
      'Additional Information': r.additionalInfo,
      'Offer Letter': r.offerLetter,
      'Tentative Joining Date': r.tentativeJoiningDate,
      'Added By': r.addedBy,
      'Added Time': r.addedTime,
    };
    const haystack =
      filterFields.length > 0
        ? filterFields.map((f) => fieldMap[f] || '').join(' ')
        : `${r.firstName} ${r.lastName} ${r.email} ${r.department} ${r.employeeNumber || ''}`;
    const matchesSearch =
      !filterSearch || haystack.toLowerCase().includes(filterSearch.toLowerCase());
    const matchesDept = !filterDept || r.department === filterDept;
    const matchesStatus = !filterStatus || r.status === filterStatus;
    return matchesSearch && matchesStatus && matchesDept;
  });

  const handleCandidateSubmit = async (e, keepOpen = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!candidateForm.firstName || !candidateForm.lastName || !candidateForm.email) {
      notify('First name, Last name, and Email ID are required.', 'error');
      return;
    }

    const chosenDeptId =
      candidateForm.departmentId ||
      departments.find((d) => d.name === candidateForm.department)?.id ||
      departments[0]?.id;

    if (!chosenDeptId) {
      notify('Department catalog not loaded or selected.', 'error');
      return;
    }

    const workEmail = candidateForm.officialEmail || candidateForm.email;
    const rawPhone = `${candidateForm.phoneCode || '+254'}${candidateForm.phone || '712000000'}`.replace(/\s+/g, '');

    const trimmedJobTitle = candidateForm.jobTitle ? candidateForm.jobTitle.trim() : '';
    const trimmedNationalId = candidateForm.nationalId ? candidateForm.nationalId.trim() : '';
    const trimmedKraPin = candidateForm.kraPin ? candidateForm.kraPin.trim() : '';
    const trimmedNssf = candidateForm.nssfNumber ? candidateForm.nssfNumber.trim() : '';
    const trimmedShif = candidateForm.shifNumber ? candidateForm.shifNumber.trim() : '';

    if (onCreateEmployee) {
      const createdOk = await onCreateEmployee({
        firstName: candidateForm.firstName.trim(),
        lastName: candidateForm.lastName.trim(),
        personalEmail: candidateForm.email.trim(),
        workEmail: workEmail.trim(),
        phoneNumber: rawPhone.length >= 8 ? rawPhone : '+254712000000',
        gender: candidateForm.gender || 'Male',
        dateOfBirth: candidateForm.dateOfBirth || undefined,
        nationalId: trimmedNationalId || undefined,
        kraPin: trimmedKraPin || undefined,
        nssfNumber: trimmedNssf || undefined,
        shifNumber: trimmedShif || undefined,
        employmentCategoryCode: candidateForm.employmentCategoryCode || categories.find((c) => c.status === 'ACTIVE')?.code || 'PERMANENT',
        startDate: candidateForm.hireDate || '2026-11-13',
        jobTitle: trimmedJobTitle.length >= 2 ? trimmedJobTitle : 'Associate',
        departmentId: chosenDeptId,
        ...(candidateForm.positionId ? { positionId: candidateForm.positionId } : {}),
        ...(candidateForm.gradeId ? { gradeId: candidateForm.gradeId } : {}),
        ...(candidateForm.locationId ? { locationId: candidateForm.locationId } : {}),
      });
      if (createdOk === false) return;
    }
    if (photoPreview?.base64) {
      await apiPost('/api/v1/documents/upload', {
        fileName: photoPreview.name || 'profile-photo.png',
        mimeType: photoPreview.mimeType || 'image/png',
        category: 'ORGANISATION',
        securityClassification: 'INTERNAL',
        fileBase64: photoPreview.base64,
      }).catch(() => null);
    }
    await apiRequest('/api/v1/workspace/ui-config', {
      method: 'PUT',
      body: { key: 'CANDIDATE_DRAFT', scope: 'USER', value: {} },
    }).catch(() => null);

    if (!keepOpen) {
      setAddCandidateOpen(false);
    } else {
      setCandidateForm({
        ...candidateForm,
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        officialEmail: '',
      });
    }
  };

  const handleSaveCandidateDraft = async () => {
    try {
      await apiRequest('/api/v1/workspace/ui-config', {
        method: 'PUT',
        body: {
          key: 'CANDIDATE_DRAFT',
          scope: 'USER',
          value: {
            ...candidateForm,
            educationRows,
            experienceRows,
            dependentRows,
          },
        },
      });
      notify('Candidate draft saved to workspace storage.');
      setAddCandidateOpen(false);
    } catch (err) {
      notify(err?.message || 'Unable to save candidate draft', 'error');
    }
  };

  const handleSaveCustomView = async () => {
    try {
      const permMap = { only_me: 'ONLY_ME', all: 'EVERYONE', specific: 'ROLE' };
      const normalizedPerm = permMap[viewPermission] || (['ONLY_ME', 'EVERYONE', 'ROLE'].includes(viewPermission) ? viewPermission : 'ONLY_ME');
      const saved = await apiPost('/api/v1/workspace/custom-views', {
        module: 'DIRECTORY',
        name: customViewName || 'Custom Employee View',
        columns: selectedViewCols,
        viewPermission: normalizedPerm,
        isDefault: defaultViewChecked,
      });
      setCustomViews((prev) => [saved, ...prev.filter((v) => v.id !== saved.id)]);
      setActiveCustomView(saved);
      setCreateViewOpen(false);
      notify(`Saved view "${saved.name}".`);
    } catch (err) {
      notify(err?.message || 'Failed to save custom view', 'error');
    }
  };

  const handleDeleteCustomView = async (id) => {
    try {
      await apiDelete(`/api/v1/workspace/custom-views/${id}`);
      setCustomViews((prev) => prev.filter((v) => v.id !== id));
      if (activeCustomView?.id === id) setActiveCustomView(null);
      notify('Custom view deleted.');
    } catch (err) {
      notify(err?.message || 'Failed to delete custom view', 'error');
    }
  };

  const handleExportCsv = () => {
    const headers = ['First name', 'Last name', 'Email ID', 'Official Email', 'Onboarding Status', 'Department', 'Source of Hire'];
    const csvRows = [
      headers.join(','),
      ...scopedRows.map((r) =>
        [r.firstName, r.lastName, r.email, r.officialEmail, r.onboardingStatus, r.department, r.sourceOfHire]
          .map((v) => `"${v || ''}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Ndakala_Workforce_Export.csv';
    a.click();
    URL.revokeObjectURL(url);
    setMoreActionsOpen(false);
  };

  return (
    <div
      className={`flex flex-col bg-[#edf1f7] ${
        isFullScreen ? 'fixed inset-0 z-50' : 'h-full'
      }`}
    >
      {/* People Sub-Header Bar */}
      <div className="h-[48px] bg-white border-b border-slate-200 px-4 flex items-center justify-between flex-shrink-0 select-none">
        {/* Left: Candidate View Dropdown + Edit */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setViewMenuOpen(!viewMenuOpen)}
              className="w-48 px-3 py-1.5 border border-slate-200 rounded bg-white text-xs font-medium text-slate-700 flex items-center justify-between hover:border-slate-300"
            >
              <span>
                {activeCustomView?.name || (topContextTab === 'employees' ? 'Employee View' : 'Candidate View')}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>

            {viewMenuOpen && (
              <div className="absolute left-0 mt-1 w-60 bg-white rounded-md shadow-xl border border-slate-200 py-2 z-40 animate-fadeIn">
                <p className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase">
                  Public Views
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCustomView(null);
                    setViewMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs ${
                    !activeCustomView ? 'bg-blue-50/70 text-[#0088ff] font-medium' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {topContextTab === 'employees' ? 'Employee View' : 'Candidate View'}
                </button>
                {customViews.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-1.5 hover:bg-slate-50">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCustomView(v);
                        setViewMenuOpen(false);
                      }}
                      className={`text-left text-xs flex-1 ${
                        activeCustomView?.id === v.id ? 'text-[#0088ff] font-medium' : 'text-slate-700'
                      }`}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomView(v.id)}
                      className="text-slate-400 hover:text-rose-500 p-0.5"
                      title="Delete View"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <div className="px-3 pt-2 mt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setViewMenuOpen(false);
                      setCreateViewOpen(true);
                    }}
                    className="w-full py-1.5 text-center text-xs font-medium text-[#0088ff] border border-[#0088ff] rounded hover:bg-blue-50"
                  >
                    Create View
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCreateViewOpen(true)}
            className="text-xs text-[#0088ff] hover:underline font-medium"
          >
            Edit
          </button>

          {/* Workforce Operations Mode Pills */}
          <div className="hidden xl:flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
            {[
              { id: 'records', label: 'Records' },
              { id: 'ict', label: 'ICT Provisioning' },
              { id: 'requisitions', label: 'Requisitions & Surveys' },
              { id: 'transfers', label: 'Transfers' },
              { id: 'separation', label: 'Separations' },
              { id: 'setup', label: 'Setup & Jobs' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setDirSubMode(m.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                  dirSubMode === m.id
                    ? 'bg-blue-50 text-[#0088ff] border border-blue-200'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: View All Data | Reportees + My Data | Add Candidate | Full screen | Filter | ... */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setDataScope('Reportees + My Data')}
            className="text-xs text-[#0088ff] hover:underline font-medium mr-1"
          >
            View All Data
          </button>

          {/* Scope Dropdown (07:18 of hr.webm) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setScopeDropdownOpen(!scopeDropdownOpen)}
              className="px-3 py-1.5 border border-slate-200 rounded bg-white text-xs text-slate-700 flex items-center gap-3 hover:border-slate-300"
            >
              <span>{dataScope}</span>
              <ChevronDown size={13} className="text-slate-400" />
            </button>

            {scopeDropdownOpen && (
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-md shadow-xl border border-slate-200 py-1 z-40 animate-fadeIn">
                {[
                  'Reportees + My Data',
                  "Reportees' Data",
                  "Direct Reportees' Data",
                  'My Data',
                ].map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => {
                      setDataScope(sc);
                      setScopeDropdownOpen(false);
                    }}
                    className={`w-full px-3.5 py-2 text-left text-xs ${
                      dataScope === sc
                        ? 'bg-blue-50/70 text-[#0088ff] font-medium'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sc}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Blue Add Candidate Button */}
          <button
            type="button"
            onClick={() => setAddCandidateOpen(true)}
            className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs transition-colors"
          >
            {topContextTab === 'employees' ? 'Add Employee' : 'Add Candidate'}
          </button>

          {/* Full Screen View Icon (08:06 of hr.webm) */}
          <button
            type="button"
            onClick={() => setIsFullScreen(!isFullScreen)}
            title={isFullScreen ? 'Exit full screen view' : 'Full screen view'}
            className="p-1.5 border border-slate-200 rounded bg-white text-slate-500 hover:text-slate-800"
          >
            {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>

          {/* Filter Funnel Icon (08:14 of hr.webm) */}
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            title="Filter"
            className={`p-1.5 border rounded transition-colors ${
              filterOpen
                ? 'border-[#0088ff] text-[#0088ff] bg-blue-50/40'
                : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800'
            }`}
          >
            <Filter size={14} />
          </button>

          {/* ... More Menu (Import / Export / History Export / Bulk File Upload) */}
          <div className="relative" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreActionsOpen(!moreActionsOpen)}
              className="p-1.5 border border-slate-200 rounded bg-white text-slate-500 hover:text-slate-800"
            >
              <MoreHorizontal size={14} />
            </button>

            {moreActionsOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-md shadow-xl border border-slate-200 py-1.5 z-40 text-xs animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setAddCandidateOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Download size={13} className="text-slate-400 rotate-180" />
                  <span>Import</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Upload size={13} className="text-slate-400" />
                  <span>Export</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Upload size={13} className="text-slate-400" />
                  <span>History Export</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setAddCandidateOpen(true);
                  }}
                  className="w-full px-3.5 py-2 text-left text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                >
                  <Upload size={13} className="text-slate-400" />
                  <span>Bulk File Upload</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: Table + Optional Right Filter Panel */}
      <div className="flex-1 p-3.5 overflow-hidden flex flex-col relative">
        {dirSubMode === 'records' ? (() => {
          const activeColumns =
            activeCustomView?.columns?.length > 0
              ? activeCustomView.columns
              : DEFAULT_DIRECTORY_COLUMNS;
          const totalRecords = scopedRows.length;
          const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
          const safePage = Math.min(currentPage, totalPages);
          const startIdx = (safePage - 1) * pageSize;
          const paginatedRows = scopedRows.slice(startIdx, startIdx + pageSize);
          const allSelected =
            paginatedRows.length > 0 && paginatedRows.every((r) => selectedRowIds.includes(r.id));

          return (
        <div className="flex-1 bg-white rounded-md border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          {/* Table Header + Body */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#f8fafc] border-b border-slate-200 text-slate-600 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRowIds(paginatedRows.map((r) => r.id));
                        } else {
                          setSelectedRowIds([]);
                        }
                      }}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <th className="py-3 px-2 w-8" />
                  {activeColumns.map((col, cIdx) => (
                    <th
                      key={col}
                      className={`py-3 px-4 font-medium ${cIdx < activeColumns.length - 1 ? 'border-r border-slate-100' : ''}`}
                    >
                      {col} <span className="text-slate-400 ml-1">⇅</span>
                    </th>
                  ))}
                </tr>
              </thead>

              {paginatedRows.length > 0 ? (
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openEmployeeDrawer(row)}
                      className="group hover:bg-blue-50/30 cursor-pointer transition-colors"
                    >
                      <td
                        className="py-3 px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRowIds.includes(row.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRowIds((prev) => Array.from(new Set([...prev, row.id])));
                            } else {
                              setSelectedRowIds((prev) => prev.filter((id) => id !== row.id));
                            }
                          }}
                          className="rounded border-slate-300"
                        />
                      </td>
                      <td className="py-3 px-2 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal size={14} />
                      </td>
                      {activeColumns.map((col, cIdx) => (
                        <td
                          key={col}
                          className={`py-3 px-4 text-slate-700 ${cIdx < activeColumns.length - 1 ? 'border-r border-slate-100' : ''}`}
                        >
                          {getDirectoryCellValue(row, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ) : null}
            </table>

            {/* Empty State when no records match scope or filter */}
            {scopedRows.length === 0 && (
              <div className="py-16">
                <NdakalaEmptyState
                  title="No matching employee or onboarding records"
                  subtitle="Add new hires to trigger pre-onboarding paperwork, assign probation objectives, or adjust your Data Scope and Filter criteria."
                />
              </div>
            )}
          </div>

          {/* Sticky Bottom Record Count & Pagination Bar (07:05 of hr.webm) */}
          <div className="h-[42px] bg-white border-t border-slate-200 px-4 flex items-center justify-between text-xs text-slate-600 flex-shrink-0">
            <div>
              Total Record Count :{' '}
              <span className="text-[#0088ff] font-semibold">{totalRecords}</span>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-2 py-1 border border-slate-200 rounded bg-white text-xs text-slate-700"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <div className="flex items-center gap-1.5 text-slate-500">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 hover:text-slate-800 disabled:opacity-30"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-medium text-slate-700">
                  {totalRecords === 0 ? 0 : startIdx + 1} - {Math.min(startIdx + pageSize, totalRecords)}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 hover:text-slate-800 disabled:opacity-30"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
          );
        })() : (
        <div className="flex-1 bg-white rounded-md border border-slate-200 shadow-2xs overflow-y-auto p-5 space-y-5 text-xs">
          {dirSubMode === 'ict' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">ICT Joiner & Leaver Access Provisioning</h3>
                  <p className="text-slate-500">Fulfil Microsoft 365, VPN, and endpoint deactivation tickets generated by employee lifecycle events.</p>
                </div>
                <button type="button" onClick={() => loadOperationsTabData('ict')} className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50">Refresh</button>
              </div>
              {ictRequests.length === 0 ? (
                <p className="text-slate-500 py-8 text-center">No ICT provisioning requests queued.</p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Profile</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ictRequests.map((req) => (
                      <tr key={req.id}>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {req.employee?.firstName} {req.employee?.lastName} ({req.employee?.employeeNumber})
                        </td>
                        <td className="py-2.5 px-3">{req.requestType}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">{req.accessProfile}</td>
                        <td className="py-2.5 px-3">{req.status}</td>
                        <td className="py-2.5 px-3 text-right space-x-1.5">
                          {req.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/ict-requests/${req.id}`, {
                                    status: 'COMPLETED',
                                    completionNotes: 'Access provisioned and verified by ICT',
                                  });
                                  notify('ICT ticket marked completed.');
                                  loadOperationsTabData('ict');
                                } catch (err) {
                                  notify(err?.message || 'Unable to update ICT ticket', 'error');
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium"
                            >
                              Fulfil Ticket
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {dirSubMode === 'requisitions' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-3 border border-slate-200 rounded p-4">
                <h3 className="text-sm font-semibold text-slate-800">Staff Requisition (Form 1)</h3>
                <div className="grid grid-cols-2 gap-2">
                  <select value={reqForm.departmentId} onChange={(e) => setReqForm({ ...reqForm, departmentId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <input type="text" placeholder="Position Title" value={reqForm.positionTitle} onChange={(e) => setReqForm({ ...reqForm, positionTitle: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                </div>
                <textarea rows={2} placeholder="Job Description (min 5 chars)" value={reqForm.jobDescription} onChange={(e) => setReqForm({ ...reqForm, jobDescription: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Key Responsibilities" value={reqForm.keyResponsibilities} onChange={(e) => setReqForm({ ...reqForm, keyResponsibilities: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  <input type="text" placeholder="Required Skills" value={reqForm.requiredSkills} onChange={(e) => setReqForm({ ...reqForm, requiredSkills: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/api/v1/workforce/requisitions', {
                        ...reqForm,
                        headcount: Number(reqForm.headcount) || 1,
                      });
                      notify('Staff requisition submitted.');
                      loadOperationsTabData('requisitions');
                    } catch (err) {
                      notify(err?.message || 'Failed to create requisition', 'error');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                >
                  Submit Requisition
                </button>

                <div className="pt-3 border-t border-slate-100 space-y-2">
                  {requisitions.map((r) => (
                    <div key={r.id} className="p-2.5 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{r.positionTitle} ({r.department?.name})</div>
                        <div className="text-[11px] text-slate-500">Status: {r.status} • Headcount: {r.headcount}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPost(`/api/v1/workforce/requisitions/${r.id}/review`, {
                              stage: 'HR',
                              decision: 'APPROVE',
                              comments: 'Approved via Workforce Operations',
                            });
                            notify('Requisition HR approval recorded.');
                            loadOperationsTabData('requisitions');
                          } catch (err) {
                            notify(err?.message || 'Approval failed', 'error');
                          }
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                      >
                        Approve Stage
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border border-slate-200 rounded p-4">
                <h3 className="text-sm font-semibold text-slate-800">Post-Recruitment Manager Survey (Form 2)</h3>
                {surveyMetrics && (
                  <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded text-[11px] text-slate-700">
                    Responses: <b>{surveyMetrics.totalResponses ?? 0}</b> • Avg Overall: <b>{surveyMetrics.averages?.overallExperience ?? '-'}</b>
                  </div>
                )}
                <input type="text" placeholder="Candidate Reference (optional)" value={surveyForm.candidateRef} onChange={(e) => setSurveyForm({ ...surveyForm, candidateRef: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-slate-600">Overall Rating (1-5)<input type="number" min="1" max="5" value={surveyForm.overallExperienceRating} onChange={(e) => setSurveyForm({ ...surveyForm, overallExperienceRating: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded" /></label>
                  <label className="text-slate-600">Process Speed (1-5)<input type="number" min="1" max="5" value={surveyForm.processSpeedRating} onChange={(e) => setSurveyForm({ ...surveyForm, processSpeedRating: Number(e.target.value) })} className="w-full mt-1 px-2.5 py-1.5 border border-slate-300 rounded" /></label>
                </div>
                <textarea rows={2} placeholder="Feedback comments" value={surveyForm.comments} onChange={(e) => setSurveyForm({ ...surveyForm, comments: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/api/v1/workforce/surveys', {
                        ...surveyForm,
                        requisitionId: surveyForm.requisitionId || undefined,
                      });
                      notify('Post-recruitment survey submitted.');
                      loadOperationsTabData('requisitions');
                    } catch (err) {
                      notify(err?.message || 'Survey submission failed', 'error');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 text-white rounded font-medium"
                >
                  Submit Survey
                </button>
              </div>
            </div>
          )}

          {dirSubMode === 'transfers' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Internal Transfer Request (With Leave Carry-Over Check)</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <select value={transferForm.employeeId} onChange={(e) => setTransferForm({ ...transferForm, employeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
                  </select>
                  <select value={transferForm.proposedDepartmentId} onChange={(e) => setTransferForm({ ...transferForm, proposedDepartmentId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={transferForm.proposedPositionId} onChange={(e) => setTransferForm({ ...transferForm, proposedPositionId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                  <input type="date" value={transferForm.effectiveDate} onChange={(e) => setTransferForm({ ...transferForm, effectiveDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                </div>
                <input type="text" placeholder="Transfer justification (min 5 chars)" value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/api/v1/workforce/transfers', {
                        ...transferForm,
                        proposedLocationId: transferForm.proposedLocationId || undefined,
                      });
                      notify('Employee transfer requested.');
                      loadOperationsTabData('transfers');
                    } catch (err) {
                      notify(err?.message || 'Transfer request failed', 'error');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                >
                  Request Transfer
                </button>
              </div>
              <div className="space-y-2">
                {transfers.map((tr) => (
                  <div key={tr.id} className="p-3 border border-slate-200 rounded flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{tr.employee?.firstName} {tr.employee?.lastName} • {tr.status}</div>
                      <div className="text-[11px] text-slate-500">Effective: {String(tr.effectiveDate).slice(0, 10)} • {tr.reason}</div>
                    </div>
                    {tr.status === 'PENDING' && (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiPost(`/api/v1/workforce/transfers/${tr.id}/review`, { decision: 'APPROVE', comments: 'Approved transfer' });
                              notify('Transfer approved.');
                              loadOperationsTabData('transfers');
                            } catch (err) {
                              notify(err?.message || 'Approval blocked', 'error');
                            }
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiPost(`/api/v1/workforce/transfers/${tr.id}/review`, { decision: 'REJECT', comments: 'Rejected transfer' });
                              notify('Transfer rejected.');
                              loadOperationsTabData('transfers');
                            } catch (err) {
                              notify(err?.message || 'Action failed', 'error');
                            }
                          }}
                          className="px-2.5 py-1 border border-rose-300 text-rose-600 rounded text-[11px]"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {dirSubMode === 'separation' && (
            <div className="space-y-4">
              <div className="border border-slate-200 rounded p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Initiate Offboarding / Separation</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <select value={sepForm.employeeId} onChange={(e) => setSepForm({ ...sepForm, employeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
                  </select>
                  <select value={sepForm.triggerType} onChange={(e) => setSepForm({ ...sepForm, triggerType: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {['RESIGNATION', 'CONTRACT_EXPIRY', 'MUTUAL_AGREEMENT', 'REDUNDANCY', 'RETIREMENT', 'DISMISSAL'].map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="date" value={sepForm.noticeDate} onChange={(e) => setSepForm({ ...sepForm, noticeDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  <input type="date" value={sepForm.effectiveDate} onChange={(e) => setSepForm({ ...sepForm, effectiveDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                </div>
                <input type="text" placeholder="Separation reason (min 5 chars)" value={sepForm.reason} onChange={(e) => setSepForm({ ...sepForm, reason: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost('/api/v1/separation/initiate', sepForm);
                      notify('Separation process initiated and clearance checklist generated.');
                      loadOperationsTabData('separation');
                    } catch (err) {
                      notify(err?.message || 'Failed to initiate separation', 'error');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                >
                  Initiate Separation
                </button>
              </div>
              <div className="space-y-2">
                {separations.map((s) => (
                  <div key={s.id} className="p-3 border border-slate-200 rounded space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-slate-800">{s.employee?.firstName} {s.employee?.lastName} • {s.triggerType} ({s.status})</div>
                        <div className="text-[11px] text-slate-500">Effective: {s.effectiveDate} • {s.reason}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={async () => {
                            const detail = await apiGet(`/api/v1/separation/${s.id}`).catch(() => s);
                            setSelectedSepDetail(detail);
                          }}
                          className="px-2.5 py-1 border border-slate-300 rounded text-[11px]"
                        >
                          View Clearance & Exit
                        </button>
                        {s.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/separation/${s.id}/finalize`, {});
                                notify('Separation finalized and Certificate of Service issued.');
                                loadOperationsTabData('separation');
                              } catch (err) {
                                notify(err?.message || 'Cannot finalize yet', 'error');
                              }
                            }}
                            className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                          >
                            Finalize & Issue CoS
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {selectedSepDetail && (
                <div className="p-4 border border-blue-200 bg-blue-50/30 rounded space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Clearance Checklist & Exit Interview</h4>
                    <button type="button" onClick={() => setSelectedSepDetail(null)} className="text-slate-500 hover:text-slate-800"><X size={14} /></button>
                  </div>
                  {(selectedSepDetail.clearanceItems || []).map((ci) => (
                    <div key={ci.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded">
                      <span>{ci.department}: {ci.itemDescription}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPatch(`/api/v1/separation/${selectedSepDetail.id}/clearance/${ci.id}`, {
                              isCompleted: !ci.isCompleted,
                              notes: 'Verified by owner department',
                            });
                            const refreshed = await apiGet(`/api/v1/separation/${selectedSepDetail.id}`);
                            setSelectedSepDetail(refreshed);
                            notify('Clearance item updated.');
                          } catch (err) {
                            notify(err?.message || 'Update failed', 'error');
                          }
                        }}
                        className={`px-2 py-1 rounded text-[11px] ${ci.isCompleted ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-700'}`}
                      >
                        {ci.isCompleted ? 'Cleared' : 'Mark Cleared'}
                      </button>
                    </div>
                  ))}
                  <div className="p-3 bg-white border border-slate-200 rounded space-y-2">
                    <h5 className="font-semibold text-slate-700">Conduct Confidential Exit Interview</h5>
                    <input type="text" placeholder="Primary reason" value={exitInterviewForm.primaryReason} onChange={(e) => setExitInterviewForm({ ...exitInterviewForm, primaryReason: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                    <textarea rows={2} placeholder="Confidential HR partner comments (min 5 chars)" value={exitInterviewForm.confidentialComments} onChange={(e) => setExitInterviewForm({ ...exitInterviewForm, confidentialComments: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/separation/${selectedSepDetail.id}/exit-interview`, exitInterviewForm);
                          notify('Exit interview securely recorded.');
                          const refreshed = await apiGet(`/api/v1/separation/${selectedSepDetail.id}`);
                          setSelectedSepDetail(refreshed);
                        } catch (err) {
                          notify(err?.message || 'Failed to save exit interview', 'error');
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                    >
                      Save Exit Interview
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {dirSubMode === 'setup' && (
            <div className="space-y-5">
              <div className="p-4 border border-slate-200 rounded flex items-center justify-between bg-slate-50">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Automated Lifecycle Jobs & Escalations</h3>
                  <p className="text-slate-500">Run document expiry scan, probation reminder dispatch, and overdue onboarding escalation batch.</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await apiPost('/api/v1/lifecycle-jobs/run', {});
                      setJobsResult(res);
                      notify('Lifecycle background scan executed.');
                    } catch (err) {
                      notify(err?.message || 'Job execution denied', 'error');
                    }
                  }}
                  className="px-4 py-2 bg-[#0088ff] text-white rounded font-medium"
                >
                  Run Lifecycle Jobs Now
                </button>
              </div>
              {jobsResult && (
                <pre className="p-3 bg-slate-900 text-emerald-300 rounded text-[11px] overflow-x-auto">
                  {JSON.stringify(jobsResult, null, 2)}
                </pre>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="p-4 border border-slate-200 rounded space-y-3">
                  <h4 className="font-semibold text-slate-800">Employment Categories (Maker-Checker)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="CODE e.g. FIXED_TERM" value={catForm.code} onChange={(e) => setCatForm({ ...catForm, code: e.target.value.toUpperCase() })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input type="text" placeholder="Display Name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost('/api/v1/employee-categories', catForm);
                        notify('Draft employment category created.');
                        loadDirectoryData();
                      } catch (err) {
                        notify(err?.message || 'Category creation failed', 'error');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                  >
                    Draft Category
                  </button>
                  <div className="space-y-1.5">
                    {categories.map((c) => (
                      <div key={c.id} className="p-2 border border-slate-100 rounded flex items-center justify-between">
                        <span><b>{c.code}</b> — {c.name} ({c.status})</span>
                        <div className="flex gap-1">
                          {c.status === 'DRAFT' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPost(`/api/v1/employee-categories/${c.id}/activate`, {});
                                  notify('Category activated.');
                                  loadDirectoryData();
                                } catch (err) {
                                  notify(err?.message || 'Activation blocked (maker-checker)', 'error');
                                }
                              }}
                              className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px]"
                            >
                              Activate
                            </button>
                          )}
                          {c.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPost(`/api/v1/employee-categories/${c.id}/deactivate`, { reason: 'Replaced by updated policy' });
                                  notify('Category deactivated.');
                                  loadDirectoryData();
                                } catch (err) {
                                  notify(err?.message || 'Deactivation failed', 'error');
                                }
                              }}
                              className="px-2 py-0.5 border border-slate-300 rounded text-[11px]"
                            >
                              Deactivate
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 border border-slate-200 rounded space-y-3">
                  <h4 className="font-semibold text-slate-800">Onboarding Templates (Maker-Checker)</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="CODE e.g. ONB-CORP" value={tplForm.code} onChange={(e) => setTplForm({ ...tplForm, code: e.target.value.toUpperCase() })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                    <input type="text" placeholder="Template Name" value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost('/api/v1/onboarding-templates', {
                          code: tplForm.code,
                          name: tplForm.name,
                          sourceReference: tplForm.sourceReference,
                          items: [{ title: tplForm.itemTitle, ownerType: tplForm.ownerType, dueDaysAfterStart: Number(tplForm.dueDaysAfterStart) }],
                        });
                        notify('Onboarding template drafted.');
                        loadDirectoryData();
                      } catch (err) {
                        notify(err?.message || 'Template creation failed', 'error');
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                  >
                    Draft Template
                  </button>
                  <div className="space-y-1.5">
                    {onboardingTemplates.map((t) => (
                      <div key={t.id} className="p-2 border border-slate-100 rounded flex items-center justify-between">
                        <span><b>{t.code}</b> — {t.name} ({t.status})</span>
                        {t.status === 'DRAFT' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/onboarding-templates/${t.id}/activate`, {});
                                notify('Template activated.');
                                loadDirectoryData();
                              } catch (err) {
                                notify(err?.message || 'Maker-checker blocked activation', 'error');
                              }
                            }}
                            className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[11px]"
                          >
                            Activate
                          </button>
                        ) : t.status === 'ACTIVE' ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/onboarding-templates/${t.id}/deactivate`, {});
                                notify('Template deactivated.');
                                loadDirectoryData();
                              } catch (err) {
                                notify(err?.message || 'Deactivation failed', 'error');
                              }
                            }}
                            className="px-2 py-0.5 border border-slate-300 rounded text-[11px]"
                          >
                            Deactivate
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="pt-3 border-t border-slate-100">
                    <h5 className="text-[11px] font-semibold text-slate-600 mb-1">
                      Active Probation Assessment Forms ({probationForms.length})
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {probationForms.map((pf) => (
                        <span key={pf.id} className="px-2 py-0.5 bg-blue-50 text-[#0088ff] rounded text-[10px] font-medium">
                          {pf.name || pf.code}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Right-Side Filter Panel (08:15 - 08:19 of hr.webm) */}
        {filterOpen && (
          <div className="absolute right-3.5 top-3.5 bottom-3.5 w-72 bg-white border border-slate-200 rounded-md shadow-xl flex flex-col z-20 animate-fadeIn">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">Filter</span>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder="Search"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:border-[#0088ff]"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5 text-xs">
              <p className="font-semibold text-slate-700">▾ Fields</p>
              {[
                'First name',
                'Last name',
                'Email ID',
                'Official Email',
                'Onboarding Status',
                'Department',
                'Source of Hire',
                'Gender',
                'Marital status',
                'AboutMe',
                'Citizenship',
                'Nick Name',
                'Current Salary',
                'Additional Information',
                'Offer Letter',
                'Tentative Joining Date',
                'Added By',
                'Added Time',
              ].map((field) => (
                <label key={field} className="flex items-center gap-2.5 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterFields.includes(field)}
                    onChange={() =>
                      setFilterFields((prev) =>
                        prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
                      )
                    }
                    className="rounded border-slate-300 text-[#0088ff]"
                  />
                  <span>{field}</span>
                </label>
              ))}
            </div>
            <div className="p-3 border-t border-slate-200 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCurrentPage(1);
                  setFilterOpen(false);
                }}
                className="px-3.5 py-1.5 bg-[#0088ff] text-white text-xs font-medium rounded"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterSearch('');
                  setFilterDept('');
                  setFilterStatus('');
                  setFilterFields([]);
                  setCurrentPage(1);
                }}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== "CREATE VIEW" SLIDE-OVER DRAWER ==================== */}
      {createViewOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="w-full max-w-4xl bg-[#edf1f7] h-full shadow-2xl flex flex-col animate-fadeIn">
            <div className="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Create View</h3>
              <button
                type="button"
                onClick={() => setCreateViewOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              <div className="bg-white rounded-md border border-slate-200 p-5 space-y-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">
                    Specify View Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={customViewName}
                    onChange={(e) => setCustomViewName(e.target.value)}
                    placeholder="Enter View Name"
                    className="w-72 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultViewChecked}
                    onChange={(e) => setDefaultViewChecked(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Set as default view</span>
                </label>

                <div>
                  <p className="font-semibold text-slate-700 mb-2">View Permission</p>
                  <div className="space-y-2 text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={viewPermission === 'ONLY_ME'}
                        onChange={() => setViewPermission('ONLY_ME')}
                      />
                      <span>Only to me</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={viewPermission === 'EVERYONE'}
                        onChange={() => setViewPermission('EVERYONE')}
                      />
                      <span>Allow all employees to access this custom view</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={viewPermission === 'ROLE'}
                        onChange={() => setViewPermission('ROLE')}
                      />
                      <span>Share this view to specific users, departments, roles or locations</span>
                    </label>
                  </div>
                </div>

                {/* Dual-Column Select Columns Shuttle (07:34 of hr.webm) */}
                <div>
                  <p className="font-semibold text-slate-700 mb-2">Select Columns</p>
                  <div className="grid grid-cols-11 gap-3 items-center max-w-2xl">
                    <div className="col-span-5 border border-slate-200 rounded h-60 overflow-y-auto p-2 space-y-1.5 bg-slate-50/40">
                      {AVAILABLE_VIEW_COLUMNS.map((col) => (
                        <div
                          key={col}
                          onClick={() => {
                            if (!selectedViewCols.includes(col)) {
                              setSelectedViewCols([...selectedViewCols, col]);
                            }
                          }}
                          className="px-3 py-2 bg-white border border-slate-200 rounded cursor-pointer hover:border-[#0088ff] text-slate-700"
                        >
                          {col}
                        </div>
                      ))}
                    </div>
                    <div className="col-span-1 flex flex-col items-center gap-2">
                      <button
                        type="button"
                        title="Add all available columns"
                        onClick={() =>
                          setSelectedViewCols(
                            Array.from(new Set([...selectedViewCols, ...AVAILABLE_VIEW_COLUMNS]))
                          )
                        }
                        className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:border-[#0088ff] hover:text-[#0088ff]"
                      >
                        »
                      </button>
                      <button
                        type="button"
                        title="Add next available column"
                        onClick={() => {
                          const next = AVAILABLE_VIEW_COLUMNS.find(
                            (c) => !selectedViewCols.includes(c)
                          );
                          if (next) setSelectedViewCols([...selectedViewCols, next]);
                        }}
                        className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:border-[#0088ff] hover:text-[#0088ff]"
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        title="Remove last selected column"
                        onClick={() => {
                          if (selectedViewCols.length > 1) {
                            setSelectedViewCols(selectedViewCols.slice(0, -1));
                          }
                        }}
                        className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:border-rose-400 hover:text-rose-500"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        title="Reset selected columns to minimum"
                        onClick={() => setSelectedViewCols([selectedViewCols[0] || 'First name'])}
                        className="p-1.5 border border-slate-200 rounded bg-white text-slate-600 hover:border-rose-400 hover:text-rose-500"
                      >
                        «
                      </button>
                    </div>
                    <div className="col-span-5 border border-slate-200 rounded h-60 overflow-y-auto p-2 space-y-1.5 bg-white">
                      {selectedViewCols.map((col) => (
                        <div
                          key={col}
                          className="px-3 py-2 bg-blue-50/40 border border-blue-200 rounded flex items-center justify-between text-slate-700"
                        >
                          <span>{col}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedViewCols(selectedViewCols.filter((c) => c !== col))
                            }
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white px-6 py-3 border-t border-slate-200 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSaveCustomView}
                className="px-4 py-1.5 bg-[#0088ff] text-white text-xs font-medium rounded"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setCreateViewOpen(false)}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== FULL-SCREEN "ADD CANDIDATE" MODAL ==================== */}
      {addCandidateOpen && (
        <div className="fixed inset-0 z-50 bg-[#edf1f7] flex flex-col animate-fadeIn">
          {/* Top Header */}
          <div className="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-slate-800">Add Candidate</h2>
            <button
              type="button"
              onClick={() => setAddCandidateOpen(false)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Form Cards */}
          <form
            onSubmit={(e) => handleCandidateSubmit(e, false)}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* 1. Candidate Details Card (07:45 of hr.webm) */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 pb-3 mb-5 border-b border-slate-100">
                  Candidate Details
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-4">
                  {/* Email ID * */}
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      Email ID <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={candidateForm.email}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, email: e.target.value })
                      }
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                    />
                  </div>

                  {/* First name * */}
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      First name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={candidateForm.firstName}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, firstName: e.target.value })
                      }
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                    />
                  </div>

                  {/* Phone * with Kenyan Flag +254 (07:46 of hr.webm) */}
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      Phone <span className="text-rose-500">*</span>
                    </label>
                    <div className="col-span-8 flex items-center gap-2">
                      <div className="px-2.5 py-2 border border-slate-300 rounded bg-slate-50 flex items-center gap-1.5 text-slate-700 font-medium">
                        <span>🇰🇪</span>
                        <span>+254</span>
                      </div>
                      <input
                        type="text"
                        required
                        value={candidateForm.phone}
                        onChange={(e) =>
                          setCandidateForm({ ...candidateForm, phone: e.target.value })
                        }
                        placeholder="712 123456"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                      />
                    </div>
                  </div>

                  {/* Last name * */}
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      Last name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={candidateForm.lastName}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, lastName: e.target.value })
                      }
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                    />
                  </div>

                  {/* Photo Upload Box */}
                  <div className="grid grid-cols-12 items-start gap-3">
                    <label className="col-span-4 text-slate-600 font-medium pt-2">Photo</label>
                    <div className="col-span-8">
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            notify('Photo exceeds 5 MB limit.', 'error');
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            const result = String(reader.result || '');
                            const base64 = result.includes(',') ? result.split(',')[1] : '';
                            setPhotoPreview({
                              name: file.name,
                              mimeType: file.type || 'image/png',
                              base64,
                              url: URL.createObjectURL(file),
                            });
                            notify(`Photo "${file.name}" attached for document vault upload.`);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <div className="border border-dashed border-slate-300 rounded p-4 text-center bg-slate-50/40">
                        {photoPreview ? (
                          <div className="flex items-center justify-center gap-3">
                            <img
                              src={photoPreview.url}
                              alt="Candidate preview"
                              className="w-10 h-10 rounded-full object-cover border border-slate-200"
                            />
                            <div className="text-left">
                              <p className="text-xs font-medium text-slate-700 truncate max-w-[180px]">
                                {photoPreview.name}
                              </p>
                              <button
                                type="button"
                                onClick={() => setPhotoPreview(null)}
                                className="text-[11px] text-rose-600 hover:underline"
                              >
                                Remove photo
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-500">
                            Upload from{' '}
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="text-[#0088ff] cursor-pointer hover:underline font-medium"
                            >
                              Computer
                            </button>{' '}
                            or{' '}
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              className="text-[#0088ff] cursor-pointer hover:underline font-medium"
                            >
                              Ndakala Document Vault
                            </button>
                          </p>
                        )}
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Files supported : JPG, PNG, GIF, JPEG</span>
                        <span>Max. size is 5 MB</span>
                      </div>
                    </div>
                  </div>

                  {/* Official Email */}
                  <div className="grid grid-cols-12 items-center gap-3">
                    <label className="col-span-4 text-slate-600 font-medium">
                      Official Email
                    </label>
                    <input
                      type="email"
                      value={candidateForm.officialEmail}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, officialEmail: e.target.value })
                      }
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Address Details Card (07:53 of hr.webm) */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 pb-3 mb-5 border-b border-slate-100">
                  Address Details
                </h3>
                <div className="grid grid-cols-12 items-start gap-3 max-w-2xl">
                  <label className="col-span-4 text-slate-600 font-medium pt-2">
                    Present address
                  </label>
                  <div className="col-span-8 space-y-2.5">
                    <input
                      type="text"
                      placeholder="Address line 1"
                      value={candidateForm.addressLine1}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, addressLine1: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      placeholder="Address line 2"
                      value={candidateForm.addressLine2}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, addressLine2: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      placeholder="City"
                      value={candidateForm.city}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, city: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                    <label className="flex items-center gap-2 pt-2 text-slate-600">
                      <input
                        type="checkbox"
                        checked={candidateForm.sameAsPresent}
                        onChange={(e) =>
                          setCandidateForm({
                            ...candidateForm,
                            sameAsPresent: e.target.checked,
                          })
                        }
                      />
                      <span>Permanent address same as Present address</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* 3. Education Repeatable Table (07:55 of hr.webm) */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">Education</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setEducationRows([
                        ...educationRows,
                        { school: '', degree: '', field: '', completionDate: '', notes: '' },
                      ])
                    }
                    className="px-3 py-1 bg-blue-50 text-[#0088ff] font-medium rounded hover:bg-blue-100"
                  >
                    Add Row
                  </button>
                </div>
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">School Name</th>
                      <th className="py-2 px-3">Degree/Diploma</th>
                      <th className="py-2 px-3">Field(s) of Study</th>
                      <th className="py-2 px-3">Date of Completion</th>
                      <th className="py-2 px-3">Additional Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {educationRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.school}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx].school = e.target.value;
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.degree}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx].degree = e.target.value;
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.field}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx].field = e.target.value;
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="dd-MMM-yyyy"
                            value={row.completionDate}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx].completionDate = e.target.value;
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.notes}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx].notes = e.target.value;
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. Experience Repeatable Table (07:56 of hr.webm) */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">Experience</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setExperienceRows([
                        ...experienceRows,
                        {
                          occupation: '',
                          company: '',
                          summary: '',
                          duration: '',
                          currentlyWorkHere: 'Select',
                          fromDate: '',
                          toDate: '',
                        },
                      ])
                    }
                    className="px-3 py-1 bg-blue-50 text-[#0088ff] font-medium rounded hover:bg-blue-100"
                  >
                    Add Row
                  </button>
                </div>
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Occupation</th>
                      <th className="py-2 px-3">Company</th>
                      <th className="py-2 px-3">Summary</th>
                      <th className="py-2 px-3">Duration</th>
                      <th className="py-2 px-3">From Date</th>
                      <th className="py-2 px-3">To Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {experienceRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.occupation || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], occupation: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.company || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], company: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.summary || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], summary: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.duration || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], duration: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.fromDate || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], fromDate: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.toDate || ''}
                            onChange={(e) => {
                              const next = [...experienceRows];
                              next[idx] = { ...next[idx], toDate: e.target.value };
                              setExperienceRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 5. Candidate Dependent Details Repeatable Table (07:58 of hr.webm) */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Candidate Dependent Details
                  </h3>
                  <button
                    type="button"
                    onClick={() =>
                      setDependentRows([
                        ...dependentRows,
                        { name: '', relationship: 'Select', dob: '' },
                      ])
                    }
                    className="px-3 py-1 bg-blue-50 text-[#0088ff] font-medium rounded hover:bg-blue-100"
                  >
                    Add Row
                  </button>
                </div>
                <table className="w-full text-left border-collapse border border-slate-200">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Relationship</th>
                      <th className="py-2 px-3">Date of birth</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dependentRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.name || ''}
                            onChange={(e) => {
                              const next = [...dependentRows];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setDependentRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={row.relationship || 'Select'}
                            onChange={(e) => {
                              const next = [...dependentRows];
                              next[idx] = { ...next[idx], relationship: e.target.value };
                              setDependentRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded bg-white"
                          >
                            <option value="Select">Select</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Child">Child</option>
                            <option value="Parent">Parent</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.dob || ''}
                            onChange={(e) => {
                              const next = [...dependentRows];
                              next[idx] = { ...next[idx], dob: e.target.value };
                              setDependentRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 6. Ndakala Employment, Statutory & Payroll Profile */}
              <div className="bg-white rounded-md border border-slate-200 p-6">
                <h3 className="text-sm font-semibold text-slate-800 pb-3 mb-4 border-b border-slate-100">
                  Employment & Kenyan Statutory Identifiers
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">
                      Department <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={candidateForm.departmentId}
                      onChange={(e) => {
                        const dept = departments.find((d) => d.id === e.target.value);
                        setCandidateForm({
                          ...candidateForm,
                          departmentId: e.target.value,
                          department: dept?.name || candidateForm.department,
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Employment Category</label>
                    <select
                      value={candidateForm.employmentCategoryCode}
                      onChange={(e) =>
                        setCandidateForm({ ...candidateForm, employmentCategoryCode: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      {categories.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.status})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Job Title</label>
                    <input
                      type="text"
                      value={candidateForm.jobTitle}
                      onChange={(e) => setCandidateForm({ ...candidateForm, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Position</label>
                    <select
                      value={candidateForm.positionId}
                      onChange={(e) => setCandidateForm({ ...candidateForm, positionId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="">Optional Position</option>
                      {positions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Grade</label>
                    <select
                      value={candidateForm.gradeId}
                      onChange={(e) => setCandidateForm({ ...candidateForm, gradeId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="">Optional Grade</option>
                      {grades.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name} (L{g.level})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Work Location</label>
                    <select
                      value={candidateForm.locationId}
                      onChange={(e) => setCandidateForm({ ...candidateForm, locationId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="">Optional Location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">Start Date</label>
                    <input
                      type="date"
                      value={candidateForm.hireDate}
                      onChange={(e) => setCandidateForm({ ...candidateForm, hireDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">National ID</label>
                    <input
                      type="text"
                      value={candidateForm.nationalId}
                      onChange={(e) => setCandidateForm({ ...candidateForm, nationalId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">KRA PIN</label>
                    <input
                      type="text"
                      value={candidateForm.kraPin}
                      onChange={(e) => setCandidateForm({ ...candidateForm, kraPin: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">NSSF No.</label>
                    <input
                      type="text"
                      value={candidateForm.nssfNumber}
                      onChange={(e) => setCandidateForm({ ...candidateForm, nssfNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">SHIF No.</label>
                    <input
                      type="text"
                      value={candidateForm.shifNumber}
                      onChange={(e) => setCandidateForm({ ...candidateForm, shifNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Bottom Bar: Submit | Submit and New | Save Draft | Cancel (07:59 of hr.webm) */}
            <div className="bg-white px-6 py-3 border-t border-slate-200 flex items-center gap-2.5 flex-shrink-0">
              <button
                type="submit"
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={(e) => handleCandidateSubmit(e, true)}
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
              >
                Submit and New
              </button>
              <button
                type="button"
                onClick={handleSaveCandidateDraft}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => setAddCandidateOpen(false)}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Selected Candidate / Employee Slide-Over Drawer (Full Backend Lifecycle 360) */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-fadeIn">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {selectedRecord.firstName} {selectedRecord.lastName}{' '}
                  {selectedRecord.employeeNumber && (
                    <span className="text-xs font-mono text-[#0088ff] ml-1">({selectedRecord.employeeNumber})</span>
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedRecord.jobTitle} • {selectedRecord.department} • {selectedRecord.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            {selectedRecord.rawEmployee && (
              <div className="px-6 border-b border-slate-200 flex items-center gap-4 text-xs bg-slate-50">
                {[
                  { id: 'overview', label: 'Overview' },
                  { id: 'onboarding', label: 'Onboarding Tasks' },
                  { id: 'probation', label: 'Probation Review & Decision' },
                  { id: 'changes', label: 'Changes & Status' },
                  { id: 'documents', label: 'Documents' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDrawerTab(t.id)}
                    className={`py-2.5 border-b-2 font-medium ${
                      drawerTab === t.id ? 'border-[#0088ff] text-[#0088ff]' : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {detailLoading && <p className="text-slate-400">Loading employee lifecycle record...</p>}

              {drawerTab === 'overview' && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded border border-slate-200">
                  <div>
                    <p className="text-slate-400">Email ID</p>
                    <p className="font-medium text-slate-800 mt-0.5">{selectedRecord.email}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Official Email</p>
                    <p className="font-medium text-slate-800 mt-0.5">{selectedRecord.officialEmail}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Onboarding Status</p>
                    <p className="font-medium text-emerald-600 mt-0.5">{selectedRecord.onboardingStatus}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Location</p>
                    <p className="font-medium text-slate-800 mt-0.5">{selectedRecord.location || 'Nairobi'}</p>
                  </div>
                </div>
              )}

              {selectedRecord.rawEmployee && drawerTab === 'onboarding' && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-800">Assigned Onboarding Checklist</h4>
                  {(detailEmployee?.onboardingTasks || []).length === 0 ? (
                    <p className="text-slate-500">No onboarding tasks assigned.</p>
                  ) : (
                    (detailEmployee?.onboardingTasks || []).map((task) => (
                      <div key={task.id} className="p-3 border border-slate-200 rounded flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-slate-800">{task.taskTitle}</div>
                          <div className="text-[11px] text-slate-500">
                            Owner: {task.ownerType} • Status: {task.status}
                          </div>
                        </div>
                        {task.status !== 'COMPLETED' && task.status !== 'WAIVED' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                    status: 'COMPLETED',
                                    completionNotes: 'Completed in Workforce Directory drawer',
                                  });
                                  notify(`Completed onboarding task: ${task.taskTitle}`);
                                  openEmployeeDrawer(selectedRecord);
                                } catch (err) {
                                  notify(err?.message || 'Unable to complete task', 'error');
                                }
                              }}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px] font-medium"
                            >
                              Complete
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                    status: 'WAIVED',
                                    waiverReason: 'Waived by HR Partner during onboarding verification',
                                  });
                                  notify(`Waived onboarding task: ${task.taskTitle}`);
                                  openEmployeeDrawer(selectedRecord);
                                } catch (err) {
                                  notify(err?.message || 'Unable to waive task', 'error');
                                }
                              }}
                              className="px-2.5 py-1 border border-slate-300 text-slate-600 rounded text-[11px] font-medium"
                            >
                              Waive
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedRecord.rawEmployee && drawerTab === 'probation' && (() => {
                const prob = detailEmployee?.probationRecords?.[0];
                if (!prob) return <p className="text-slate-500">No active probation record for this employee.</p>;
                return (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-slate-800">Probation Status: {prob.status}</span>
                        <div className="text-[11px] text-slate-500">
                          Ends: {prob.probationEndDate ? String(prob.probationEndDate).slice(0, 10) : '-'}
                        </div>
                      </div>
                    </div>

                    {/* Step 1: Set Probation Objectives */}
                    <div className="p-3 border border-slate-200 rounded space-y-2">
                      <h5 className="font-semibold text-slate-700">1. Assign Probation Objectives</h5>
                      <input
                        type="text"
                        placeholder="Objective (min 5 chars)"
                        value={objInput.objective}
                        onChange={(e) => setObjInput({ ...objInput, objective: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <input
                        type="text"
                        placeholder="Expected output (min 5 chars)"
                        value={objInput.expectedOutput}
                        onChange={(e) => setObjInput({ ...objInput, expectedOutput: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPost(`/api/v1/employees/probation/${prob.id}/objectives`, {
                              objectives: [{ objective: objInput.objective, expectedOutput: objInput.expectedOutput }],
                              supportRequired: objInput.supportRequired || undefined,
                            });
                            notify('Probation objectives saved.');
                            openEmployeeDrawer(selectedRecord);
                          } catch (err) {
                            notify(err?.message || 'Failed to save objectives', 'error');
                          }
                        }}
                        className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                      >
                        Save Objectives
                      </button>
                    </div>

                    {/* Step 2: Ndakala 6 Values Probation Assessment */}
                    <div className="p-3 border border-slate-200 rounded space-y-2">
                      <h5 className="font-semibold text-slate-700">2. Ndakala Six Values Evaluation</h5>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={evalForm.recommendation}
                          onChange={(e) => setEvalForm({ ...evalForm, recommendation: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        >
                          <option value="CONFIRM">Recommend CONFIRM</option>
                          <option value="EXTEND">Recommend EXTEND</option>
                          <option value="TERMINATE">Recommend TERMINATE</option>
                        </select>
                        <select
                          value={evalForm.rating}
                          onChange={(e) => setEvalForm({ ...evalForm, rating: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        >
                          {['Excellent', 'Very Good', 'Good', 'Needs Improvement', 'Unacceptable'].map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={evalForm.supervisorComments}
                        onChange={(e) => setEvalForm({ ...evalForm, supervisorComments: e.target.value })}
                        placeholder="Supervisor comments"
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const values = [
                              'Customer First',
                              'Credibility & Trust',
                              'Competitive & Results Oriented',
                              'Inquisitive & Innovative',
                              'Collaborative',
                              'Simple & Agile',
                            ];
                            await apiPost(`/api/v1/employees/probation/${prob.id}/evaluate`, {
                              sixValuesAssessment: values.map((valueName) => ({
                                valueName,
                                rating: evalForm.rating,
                                evidenceComments: evalForm.evidenceComments,
                              })),
                              objectives: [{
                                objective: objInput.objective || 'Core role delivery',
                                expectedOutput: objInput.expectedOutput || 'Timely engagement completion',
                                achievementStatus: 'MET',
                              }],
                              supervisorComments: evalForm.supervisorComments,
                              recommendation: evalForm.recommendation,
                              recommendationReason: evalForm.recommendationReason,
                            });
                            notify('Probation evaluation submitted.');
                            openEmployeeDrawer(selectedRecord);
                          } catch (err) {
                            notify(err?.message || 'Failed to evaluate probation', 'error');
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                      >
                        Submit 6-Values Evaluation
                      </button>
                    </div>

                    {/* Step 3: Final Probation Decision */}
                    <div className="p-3 border border-slate-200 rounded space-y-2">
                      <h5 className="font-semibold text-slate-700">3. Final Probation Decision</h5>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={decisionForm.decision}
                          onChange={(e) => setDecisionForm({ ...decisionForm, decision: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        >
                          <option value="CONFIRMED">CONFIRMED</option>
                          <option value="EXTENDED">EXTENDED</option>
                          <option value="TERMINATION_APPROVED">TERMINATION_APPROVED</option>
                        </select>
                        <input
                          type="text"
                          value={decisionForm.decisionReason}
                          onChange={(e) => setDecisionForm({ ...decisionForm, decisionReason: e.target.value })}
                          className="px-2.5 py-1.5 border border-slate-300 rounded"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => onConfirmProbation && onConfirmProbation(prob.id, decisionForm.decision)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded font-medium"
                      >
                        Record Final Decision
                      </button>
                    </div>
                  </div>
                );
              })()}

              {selectedRecord.rawEmployee && drawerTab === 'changes' && (
                <div className="space-y-4">
                  <div className="p-3 border border-slate-200 rounded space-y-2">
                    <h4 className="font-semibold text-slate-800">Employment Status Transition</h4>
                    <div className="flex gap-2">
                      <select
                        value={changeForm.newStatus}
                        onChange={(e) => setChangeForm({ ...changeForm, newStatus: e.target.value })}
                        className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      >
                        {['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'SUSPENDED', 'RESIGNED', 'TERMINATED'].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          onTransitionEmployeeStatus &&
                          onTransitionEmployeeStatus(selectedRecord.id, changeForm.newStatus, changeForm.reason)
                        }
                        className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                      >
                        Transition Status
                      </button>
                    </div>
                  </div>

                  <div className="p-3 border border-slate-200 rounded space-y-2">
                    <h4 className="font-semibold text-slate-800">Submit Material Employment Change</h4>
                    <input
                      type="text"
                      placeholder="New job title (optional)"
                      value={changeForm.jobTitle}
                      onChange={(e) => setChangeForm({ ...changeForm, jobTitle: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                    <input
                      type="text"
                      placeholder="Reason (min 5 chars)"
                      value={changeForm.reason}
                      onChange={(e) => setChangeForm({ ...changeForm, reason: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/employees/${selectedRecord.id}/changes`, {
                            changeType: changeForm.changeType,
                            changes: { jobTitle: changeForm.jobTitle || selectedRecord.jobTitle },
                            reason: changeForm.reason,
                          });
                          notify('Change request submitted for maker-checker approval.');
                          openEmployeeDrawer(selectedRecord);
                        } catch (err) {
                          notify(err?.message || 'Failed to submit change request', 'error');
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                    >
                      Submit Change Request
                    </button>
                  </div>

                  {(detailEmployee?.changeRequests || []).map((cr) => (
                    <div key={cr.id} className="p-3 border border-slate-200 rounded flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">{cr.changeType} • {cr.status}</div>
                        <div className="text-[11px] text-slate-500">{cr.reason}</div>
                      </div>
                      {cr.status === 'PENDING' && (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/change-requests/${cr.id}/review`, {
                                  decision: 'APPROVE',
                                  comments: 'Approved in HR Directory',
                                });
                                notify('Change request approved.');
                                openEmployeeDrawer(selectedRecord);
                              } catch (err) {
                                notify(err?.message || 'Review blocked', 'error');
                              }
                            }}
                            className="px-2 py-1 bg-emerald-600 text-white rounded text-[11px]"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/change-requests/${cr.id}/review`, {
                                  decision: 'REJECT',
                                  comments: 'Returned for revision',
                                });
                                notify('Change request rejected.');
                                openEmployeeDrawer(selectedRecord);
                              } catch (err) {
                                notify(err?.message || 'Review blocked', 'error');
                              }
                            }}
                            className="px-2 py-1 border border-rose-300 text-rose-600 rounded text-[11px]"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedRecord.rawEmployee && drawerTab === 'documents' && (
                <div className="space-y-4">
                  <div className="p-3 border border-slate-200 rounded space-y-2">
                    <h4 className="font-semibold text-slate-800">Upload & Attach Employee Document</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={docUploadForm.documentType}
                        onChange={(e) => setDocUploadForm({ ...docUploadForm, documentType: e.target.value })}
                        className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      >
                        {['CONTRACT', 'JOB_DESCRIPTION', 'ID_EVIDENCE', 'STATUTORY_FORM', 'QUALIFICATION', 'MEDICAL', 'PROBATION_FORM', 'OTHER'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        type="file"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const fd = new FormData();
                            fd.append('file', file);
                            const uploaded = await apiRequest('/api/v1/documents/upload', { method: 'POST', body: fd });
                            await apiPost(`/api/v1/employees/${selectedRecord.id}/documents`, {
                              documentRecordId: uploaded.id,
                              documentType: docUploadForm.documentType,
                              visibility: docUploadForm.visibility,
                              notes: docUploadForm.notes || file.name,
                            });
                            notify(`Attached document: ${file.name}`);
                            openEmployeeDrawer(selectedRecord);
                          } catch (err) {
                            notify(err?.message || 'Document upload failed', 'error');
                          }
                        }}
                        className="text-[11px]"
                      />
                    </div>
                  </div>
                  {(detailEmployee?.documents || []).map((doc) => (
                    <div key={doc.id} className="p-3 border border-slate-200 rounded flex items-center justify-between">
                      <div>
                        <div className="font-medium text-slate-800">{doc.documentRecord?.fileName || doc.documentType}</div>
                        <div className="text-[11px] text-slate-500">{doc.documentType} • {doc.visibility}</div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await apiPost(`/api/v1/employees/${selectedRecord.id}/documents/${doc.id}/token`, {});
                            if (res?.downloadUrl) {
                              await apiDownload(res.downloadUrl, res.fileName || 'document');
                            }
                          } catch (err) {
                            notify(err?.message || 'Unable to download document', 'error');
                          }
                        }}
                        className="px-2.5 py-1 border border-[#0088ff] text-[#0088ff] rounded text-[11px] font-medium"
                      >
                        Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
