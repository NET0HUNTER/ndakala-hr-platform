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
import AddEmployeeWizardModal from './modals/AddEmployeeWizardModal';

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
  'AboutMe',
  'Citizenship',
  'Nick Name',
  'Ask me about/Expertise',
  'Date of joining',
];

function getDirectoryCellValue(row, col) {
  const emp = row.rawEmployee || {};
  switch (col) {
    case 'First name': return row.firstName || emp.firstName || '-';
    case 'Last name': return row.lastName || emp.lastName || '-';
    case 'Email ID': return row.email || emp.personalEmail || emp.email || '-';
    case 'Official Email': return row.officialEmail || emp.workEmail || '-';
    case 'Onboarding Status': return row.onboardingStatus || '-';
    case 'Department': return row.department || emp.department?.name || emp.department || '-';
    case 'Source of Hire': return row.sourceOfHire || 'Direct';
    case 'Gender': return row.gender || emp.gender || '-';
    case 'Marital status': return row.maritalStatus || emp.maritalStatus || 'Single';
    case 'AboutMe': return row.aboutMe || emp.aboutMe || '-';
    case 'Citizenship': return row.citizenship || emp.citizenship || 'Kenyan';
    case 'Nick Name': return row.nickName || emp.nickName || row.firstName || '-';
    case 'Ask me about/Expertise': return row.expertise || emp.expertise || '-';
    case 'Date of joining': return row.joiningDate || (emp.startDate ? String(emp.startDate).slice(0, 10) : '-');
    case 'Candidate ID': return row.candidateId || row.employeeNumber || row.id || '-';
    case 'Present address': return row.presentAddress || emp.residentialAddress || row.location || 'Nairobi';
    case 'Permanent address': return row.permanentAddress || emp.residentialAddress || row.location || 'Nairobi';
    case 'Experience': return row.experience || (emp.experienceYears ? `${emp.experienceYears} Years` : '-');
    case 'Phone': return row.phone || emp.phoneNumber || '-';
    case 'Skill Set': return row.skillSet || emp.skillSet || '-';
    case 'Highest Qualification': return row.highestQualification || emp.highestQualification || '-';
    case 'Location': return row.location || emp.location?.name || 'Nairobi';
    case 'Title': return row.title || row.jobTitle || emp.jobTitle || emp.position?.title || '-';
    case 'Current Salary': return row.currentSalary || emp.employeeNumber || '-';
    case 'Additional Information': return row.additionalInfo || emp.additionalInfo || '-';
    case 'Offer Letter': return row.offerLetter || 'Generated';
    case 'Tentative Joining Date': return row.tentativeJoiningDate || row.joiningDate || (emp.startDate ? String(emp.startDate).slice(0, 10) : '-');
    case 'Added By': return row.addedBy || 'HR Operations';
    case 'Added Time': return row.addedTime || '-';
    case 'Modified By': return row.modifiedBy || 'HR Operations';
    case 'Modified Time': return row.modifiedTime || '-';
    case 'Photo': return `${(row.firstName || 'C')[0]}${(row.lastName || 'A')[0]}`;
    default:
      return row[col] || emp[col] || '-';
  }
}

const CANDIDATE_DRAFT_STORAGE_KEY = 'ndakala_candidate_draft_v1';

const createEmptyEducationRow = () => ({
  school: '',
  degree: '',
  field: '',
  completionDate: '',
  notes: '',
});

const createEmptyExperienceRow = () => ({
  occupation: '',
  company: '',
  summary: '',
  duration: '',
  currentlyWorkHere: 'Select',
  fromDate: '',
  toDate: '',
});

const createEmptyDependentRow = () => ({
  name: '',
  relationship: 'Select',
  dob: '',
});

const createDefaultCandidateForm = () => ({
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
  nationalId: '',
  kraPin: '',
  nssfNumber: '',
  shifNumber: '',
  departmentId: '',
  positionId: '',
  gradeId: '',
  locationId: '',
  managerId: '',
  ictAccessProfile: 'STANDARD_OFFICE_365',
  employmentCategoryCode: 'PERMANENT',
});

const USER_DRAFT_TEXT_FIELDS = [
  'email',
  'firstName',
  'lastName',
  'phone',
  'officialEmail',
  'nickName',
  'expertise',
  'addressLine1',
  'addressLine2',
  'experienceYears',
  'currentSalary',
  'skillSet',
  'additionalInfo',
  'aboutMe',
  'nationalId',
  'kraPin',
  'nssfNumber',
  'shifNumber',
];

function hasCandidateDraftContent(form, edu = [], exp = [], dep = []) {
  if (form && typeof form === 'object') {
    for (const field of USER_DRAFT_TEXT_FIELDS) {
      if (String(form[field] || '').trim()) return true;
    }
    if (form.jobTitle && form.jobTitle !== 'ICT Associate') return true;
    if (form.city && form.city !== 'Nairobi') return true;
    if (form.gender && form.gender !== 'Male') return true;
    if (form.maritalStatus && form.maritalStatus !== 'Single') return true;
    if (form.dateOfBirth && form.dateOfBirth !== '1999-01-01') return true;
  }
  const hasEdu = Array.isArray(edu) && edu.some((r) =>
    [r?.school, r?.degree, r?.field, r?.completionDate, r?.notes].some((v) => String(v || '').trim()),
  );
  const hasExp = Array.isArray(exp) && exp.some((r) =>
    [r?.occupation, r?.company, r?.summary, r?.duration, r?.fromDate, r?.toDate].some((v) => String(v || '').trim()) ||
    (r?.currentlyWorkHere && r.currentlyWorkHere !== 'Select'),
  );
  const hasDep = Array.isArray(dep) && dep.some((r) =>
    [r?.name, r?.dob].some((v) => String(v || '').trim()) ||
    (r?.relationship && r.relationship !== 'Select'),
  );
  return hasEdu || hasExp || hasDep;
}

function readLocalCandidateDraft() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(CANDIDATE_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocalCandidateDraft(payload) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (payload) {
      window.localStorage.setItem(CANDIDATE_DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } else {
      window.localStorage.removeItem(CANDIDATE_DRAFT_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function parseCsvRow(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
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
  const csvImportInputRef = useRef(null);
  const bulkUploadInputRef = useRef(null);

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
  const [filterLocation, setFilterLocation] = useState('');
  const [filterEmployeeText, setFilterEmployeeText] = useState('');
  const [filterFields, setFilterFields] = useState([]);
  const [candidateRecords, setCandidateRecords] = useState([]);

  // Right-side ... More menu (08:26 - 08:28 of hr.webm)
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreRef = useRef(null);

  // Full-Screen "Add Candidate / Employee" Modal (07:44 - 08:01 of hr.webm)
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [candidateSubmitting, setCandidateSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [candidateForm, setCandidateForm] = useState(createDefaultCandidateForm);
  const [filterStatus, setFilterStatus] = useState('');

  const [educationRows, setEducationRows] = useState([createEmptyEducationRow()]);
  const [experienceRows, setExperienceRows] = useState([createEmptyExperienceRow()]);
  const [dependentRows, setDependentRows] = useState([createEmptyDependentRow()]);

  // 4-Step Add Employee Wizard Modal State (Zoho People 5.0 Parity)
  const [addEmployeeWizardOpen, setAddEmployeeWizardOpen] = useState(false);
  const [activeProfileSection, setActiveProfileSection] = useState('all');

  // Employee 10-Section Repeating Grids State (interactive for profile drawer)
  const [empExperienceRows, setEmpExperienceRows] = useState([
    { id: 'exp-1', company: 'PwC East Africa', title: 'Senior Advisory Consultant', from: '2022-01-15', to: '2024-05-30', relevant: true },
    { id: 'exp-2', company: 'KPMG Kenya', title: 'Advisory Associate', from: '2020-09-01', to: '2021-12-31', relevant: true },
  ]);
  const [empEducationRows, setEmpEducationRows] = useState([
    { id: 'edu-1', institute: 'University of Nairobi', degree: 'Bachelor of Commerce', specialization: 'Finance & Accounting', year: '2020' },
    { id: 'edu-2', institute: 'Strathmore University', degree: 'Certified Public Accountant (CPA-K)', specialization: 'Auditing & Tax', year: '2021' },
  ]);
  const [empDependentRows, setEmpDependentRows] = useState([
    { id: 'dep-1', name: 'Grace Ochieng', relationship: 'Spouse', dob: '1995-04-12' },
    { id: 'dep-2', name: 'Brian Ochieng', relationship: 'Child', dob: '2021-08-25' },
  ]);

  const computeAge = (dobString) => {
    if (!dobString) return '-';
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return '-';
    const diffMs = Date.now() - dob.getTime();
    const ageDt = new Date(diffMs);
    return Math.abs(ageDt.getUTCFullYear() - 1970) + ' years';
  };

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
  const [taskEvidenceMap, setTaskEvidenceMap] = useState({});
  const [taskWaiverReasons, setTaskWaiverReasons] = useState({});
  const [uploadingTaskId, setUploadingTaskId] = useState(null);
  const [portalUsers, setPortalUsers] = useState([]);
  const [portalUserForm, setPortalUserForm] = useState({
    name: '',
    email: '',
    password: '',
    roleKey: 'employee',
  });
  const [creatingPortalUser, setCreatingPortalUser] = useState(false);

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

  const draftHydratedRef = useRef(false);

  const buildDraftPayload = () => ({
    ...candidateForm,
    educationRows,
    experienceRows,
    dependentRows,
    updatedAt: new Date().toISOString(),
  });

  const resetCandidateFormState = (deptList = departments, posList = positions, grdList = grades, locList = locations, catList = categories) => {
    setCandidateForm({
      ...createDefaultCandidateForm(),
      departmentId: deptList[0]?.id || '',
      department: deptList[0]?.name || 'IT',
      positionId: posList[0]?.id || '',
      gradeId: grdList[0]?.id || '',
      locationId: locList[0]?.id || '',
      employmentCategoryCode:
        catList.find((c) => c.status === 'ACTIVE')?.code || catList[0]?.code || 'PERMANENT',
    });
    setEducationRows([createEmptyEducationRow()]);
    setExperienceRows([createEmptyExperienceRow()]);
    setDependentRows([createEmptyDependentRow()]);
    setPhotoPreview(null);
    setDraftSavedAt(null);
  };

  const removeTableRow = (setter, idx, createBlankRow) => {
    setter((prev) => {
      if (prev.length <= 1) return [createBlankRow()];
      return prev.filter((_, i) => i !== idx);
    });
  };

  const loadDirectoryData = async () => {
    try {
      const [depts, pos, grds, locs, cats, tpls, pForms, views, dft, cands] = await Promise.all([
        apiGet('/api/v1/departments').catch(() => []),
        apiGet('/api/v1/positions').catch(() => []),
        apiGet('/api/v1/grades').catch(() => []),
        apiGet('/api/v1/locations').catch(() => []),
        apiGet('/api/v1/employee-categories').catch(() => []),
        apiGet('/api/v1/onboarding-templates').catch(() => []),
        apiGet('/api/v1/probation-forms').catch(() => []),
        apiGet('/api/v1/workspace/custom-views?module=DIRECTORY').catch(() => []),
        apiGet('/api/v1/workspace/ui-config?key=CANDIDATE_DRAFT').catch(() => null),
        apiGet('/api/v1/onboarding/candidates').catch(() => []),
      ]);
      const deptList = unwrapList(depts);
      const posList = unwrapList(pos);
      const grdList = unwrapList(grds);
      const locList = unwrapList(locs);
      const catList = unwrapList(cats);
      const candList = unwrapList(cands);
      setDepartments(deptList);
      setPositions(posList);
      setGrades(grdList);
      setLocations(locList);
      setCategories(catList);
      if (Array.isArray(candList) && candList.length > 0) {
        setCandidateRecords(candList);
      }
      setOnboardingTemplates(unwrapList(tpls));
      setProbationForms(unwrapList(pForms));
      const parsedViews = unwrapList(views);
      setCustomViews(parsedViews);
      const defView = parsedViews.find((v) => v.isDefault);
      if (defView) setActiveCustomView(defView);

      const serverDraft = dft?.configs?.CANDIDATE_DRAFT || dft?.value;
      const localDraft = readLocalCandidateDraft();
      const serverHasContent =
        serverDraft &&
        typeof serverDraft === 'object' &&
        hasCandidateDraftContent(
          serverDraft,
          serverDraft.educationRows,
          serverDraft.experienceRows,
          serverDraft.dependentRows,
        );
      const localHasContent =
        localDraft &&
        typeof localDraft === 'object' &&
        hasCandidateDraftContent(
          localDraft,
          localDraft.educationRows,
          localDraft.experienceRows,
          localDraft.dependentRows,
        );

      let chosenDraft = null;
      if (serverHasContent && localHasContent) {
        const localTs = Date.parse(localDraft.updatedAt || '') || 0;
        const serverTs = Date.parse(serverDraft.updatedAt || '') || 0;
        chosenDraft = localTs >= serverTs ? localDraft : serverDraft;
      } else if (localHasContent) {
        chosenDraft = localDraft;
      } else if (serverHasContent) {
        chosenDraft = serverDraft;
      }

      if (chosenDraft) {
        const {
          educationRows: savedEdu,
          experienceRows: savedExp,
          dependentRows: savedDep,
          updatedAt: savedUpdatedAt,
          ...formFields
        } = chosenDraft;
        setCandidateForm((prev) => ({
          ...prev,
          ...formFields,
          departmentId: formFields.departmentId || prev.departmentId || deptList[0]?.id || '',
          department: formFields.department || prev.department || deptList[0]?.name || 'IT',
          positionId: formFields.positionId || prev.positionId || posList[0]?.id || '',
          gradeId: formFields.gradeId || prev.gradeId || grdList[0]?.id || '',
          locationId: formFields.locationId || prev.locationId || locList[0]?.id || '',
          employmentCategoryCode:
            formFields.employmentCategoryCode ||
            prev.employmentCategoryCode ||
            catList.find((c) => c.status === 'ACTIVE')?.code ||
            catList[0]?.code ||
            'PERMANENT',
        }));
        if (Array.isArray(savedEdu) && savedEdu.length > 0) setEducationRows(savedEdu);
        if (Array.isArray(savedExp) && savedExp.length > 0) setExperienceRows(savedExp);
        if (Array.isArray(savedDep) && savedDep.length > 0) setDependentRows(savedDep);
        if (savedUpdatedAt) setDraftSavedAt(savedUpdatedAt);
      } else {
        setCandidateForm((prev) => ({
          ...prev,
          departmentId: prev.departmentId || deptList[0]?.id || '',
          department: prev.department || deptList[0]?.name || 'IT',
          positionId: prev.positionId || posList[0]?.id || '',
          gradeId: prev.gradeId || grdList[0]?.id || '',
          locationId: prev.locationId || locList[0]?.id || '',
          employmentCategoryCode:
            prev.employmentCategoryCode ||
            catList.find((c) => c.status === 'ACTIVE')?.code ||
            catList[0]?.code ||
            'PERMANENT',
        }));
      }
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
    } finally {
      draftHydratedRef.current = true;
    }
  };

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (hasCandidateDraftContent(candidateForm, educationRows, experienceRows, dependentRows)) {
      writeLocalCandidateDraft(buildDraftPayload());
    }
  }, [candidateForm, educationRows, experienceRows, dependentRows]);

  const loadOperationsTabData = async (mode) => {
    if (mode === 'ict') {
      const [list, usersList] = await Promise.all([
        apiGet('/api/v1/ict-requests').catch(() => []),
        apiGet('/api/v1/users').catch(() => []),
      ]);
      setIctRequests(unwrapList(list));
      setPortalUsers(unwrapList(usersList));
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
    } else if (
      currentUser?.permissions?.includes('ict.access.fulfil') &&
      !currentUser?.permissions?.includes('employees.view')
    ) {
      setDirSubMode('ict');
    }
  }, [subViewHint, currentUser?.id]);

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

  const openEmployeeDrawer = async (row, preserveTab = false) => {
    setSelectedRecord(row);
    if (!preserveTab) setDrawerTab('overview');
    setDetailEmployee(null);
    if (!row.rawEmployee) return;
    setDetailLoading(true);
    try {
      const full = await apiGet(`/api/v1/employees/${row.id}`);
      setDetailEmployee(full);
      const latestProb = full?.probationRecords?.[0];
      if (latestProb?.objectives) {
        try {
          const parsedObj = typeof latestProb.objectives === 'string'
            ? JSON.parse(latestProb.objectives)
            : latestProb.objectives;
          if (Array.isArray(parsedObj) && parsedObj[0]) {
            setObjInput((prev) => ({
              ...prev,
              objective: parsedObj[0].objective || prev.objective,
              expectedOutput: parsedObj[0].expectedOutput || prev.expectedOutput,
              supportRequired: latestProb.supportRequired || prev.supportRequired,
            }));
          }
        } catch {
          // keep current input state
        }
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(false);
    }
  };

  const uploadAndAttachEmployeeDocument = async (
    employeeId,
    file,
    { documentType = 'ONBOARDING_EVIDENCE', visibility = 'HR_AND_EMPLOYEE', notes } = {},
  ) => {
    const fileBase64 = await readFileAsBase64(file);
    const uploaded = await apiPost('/api/v1/documents/upload', {
      fileName: file.name,
      mimeType: file.type || 'application/pdf',
      category: 'COMPLIANCE',
      securityClassification: visibility === 'HR_ONLY' || visibility === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'INTERNAL',
      fileBase64,
    });
    const attached = await apiPost(`/api/v1/employees/${employeeId}/documents`, {
      documentRecordId: uploaded.id,
      documentType,
      visibility,
      notes: notes || file.name,
    });
    return { uploaded, attached };
  };

  // Map live backend employees exclusively
  const mappedBackendRows = employees.map((emp) => {
    const first = emp.firstName || (emp.fullName || 'Employee').split(' ')[0];
    const last = emp.lastName || (emp.fullName || '').split(' ').slice(1).join(' ') || '-';
    const taskList = Array.isArray(emp.onboardingTasks) ? emp.onboardingTasks : [];
    const hasStartedTask = taskList.some(
      (t) => t.status === 'IN_PROGRESS' || t.status === 'COMPLETED' || t.status === 'WAIVED',
    );
    const onboardingStatus = emp.onboardingCompletedAt
      ? 'Completed'
      : emp.status === 'PROBATION' || hasStartedTask
        ? 'In Progress'
        : 'Triggered';
    return {
      id: emp.id,
      employeeNumber: emp.employeeNumber || '',
      firstName: first,
      lastName: last,
      email: emp.workEmail || emp.email || emp.personalEmail || '',
      officialEmail: emp.workEmail || emp.email || '',
      onboardingStatus,
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

  const candidateRows = (candidateRecords.length > 0 ? candidateRecords : [
    {
      id: 'cnd-001',
      candidateId: 'CND-2026-0001',
      firstName: 'Sarah',
      lastName: 'Sanders',
      email: 'sarahsanders@zylker.com',
      officialEmail: 'sarah.sanders@zylker.com',
      onboardingStatus: 'In Progress',
      department: 'Advisory',
      sourceOfHire: 'Direct',
      gender: 'Female',
      maritalStatus: 'Single',
      aboutMe: 'Advisory specialist with 4+ years consulting experience',
      citizenship: 'Kenyan',
      nickName: 'Sarah',
      expertise: 'Financial Modelling & Valuations',
      joiningDate: '2026-11-15',
      title: 'Senior Advisory Consultant',
      location: 'Nairobi',
      phone: '+254 711 000 101',
      experience: '4 Years',
      highestQualification: 'Master of Science in Finance',
      currentSalary: 'KES 250,000',
      tentativeJoiningDate: '2026-11-15',
      addedBy: 'HR Lead',
      addedTime: '13-Nov-2026 09:30 AM',
      modifiedBy: 'HR Lead',
      modifiedTime: '15-Nov-2026 10:15 AM',
    },
    {
      id: 'cnd-002',
      candidateId: 'CND-2026-0002',
      firstName: 'Rose',
      lastName: 'Stacy',
      email: 'rosestacy@zylker.com',
      officialEmail: 'rose.stacy@zylker.com',
      onboardingStatus: 'Offer Accepted',
      department: 'Audit & Assurance',
      sourceOfHire: 'Referral',
      gender: 'Female',
      maritalStatus: 'Single',
      aboutMe: 'Senior statutory auditor and compliance reviewer',
      citizenship: 'Kenyan',
      nickName: 'Rose',
      expertise: 'IFRS & Statutory Audit',
      joiningDate: '2026-11-18',
      title: 'Audit Supervisor',
      location: 'Nairobi',
      phone: '+254 711 000 102',
      experience: '5 Years',
      highestQualification: 'CPA(K) / B.Com',
      currentSalary: 'KES 220,000',
      tentativeJoiningDate: '2026-11-18',
      addedBy: 'HR Lead',
      addedTime: '12-Nov-2026 14:20 PM',
      modifiedBy: 'Line Manager',
      modifiedTime: '14-Nov-2026 11:00 AM',
    },
    {
      id: 'cnd-003',
      candidateId: 'CND-2026-0003',
      firstName: 'Mathew',
      lastName: 'Morales',
      email: 'mathewmorales@zylker.com',
      officialEmail: 'mathew.morales@zylker.com',
      onboardingStatus: 'Offer Sent',
      department: 'Tax & Regulatory',
      sourceOfHire: 'LinkedIn',
      gender: 'Male',
      maritalStatus: 'Married',
      aboutMe: 'Transfer pricing and corporate tax associate',
      citizenship: 'Kenyan',
      nickName: 'Mat',
      expertise: 'Corporate Tax & KRA Audits',
      joiningDate: '2026-11-20',
      title: 'Tax Specialist',
      location: 'Nairobi',
      phone: '+254 711 000 103',
      experience: '3 Years',
      highestQualification: 'LL.B / Dip Tax',
      currentSalary: 'KES 195,000',
      tentativeJoiningDate: '2026-11-20',
      addedBy: 'Managing Partner',
      addedTime: '10-Nov-2026 11:15 AM',
      modifiedBy: 'Managing Partner',
      modifiedTime: '13-Nov-2026 16:45 PM',
    },
    {
      id: 'cnd-004',
      candidateId: 'CND-2026-0004',
      firstName: 'Kevin',
      lastName: 'Parker',
      email: 'kevinparker@zylker.com',
      officialEmail: 'kevin.parker@zylker.com',
      onboardingStatus: 'In Progress',
      department: 'ICT & Digital',
      sourceOfHire: 'Career Site',
      gender: 'Male',
      maritalStatus: 'Single',
      aboutMe: 'Cloud infrastructure & Microsoft 365 systems administrator',
      citizenship: 'Kenyan',
      nickName: 'Kev',
      expertise: 'Azure & Systems Architecture',
      joiningDate: '2026-11-22',
      title: 'ICT Systems Engineer',
      location: 'Nairobi',
      phone: '+254 711 000 104',
      experience: '6 Years',
      highestQualification: 'BSc Computer Science',
      currentSalary: 'KES 240,000',
      tentativeJoiningDate: '2026-11-22',
      addedBy: 'Operations Director',
      addedTime: '11-Nov-2026 15:40 PM',
      modifiedBy: 'HR Lead',
      modifiedTime: '14-Nov-2026 09:10 AM',
    },
    {
      id: 'cnd-005',
      candidateId: 'CND-2026-0005',
      firstName: 'David',
      lastName: 'Rickman',
      email: 'davidrickman@zylker.com',
      officialEmail: 'david.rickman@zylker.com',
      onboardingStatus: 'Offer Sent',
      department: 'Operations',
      sourceOfHire: 'Agency',
      gender: 'Male',
      maritalStatus: 'Married',
      aboutMe: 'Business operations & project workflow lead',
      citizenship: 'Kenyan',
      nickName: 'Dave',
      expertise: 'Operations Management',
      joiningDate: '2026-11-25',
      title: 'Operations Analyst',
      location: 'Nairobi',
      phone: '+254 711 000 105',
      experience: '4 Years',
      highestQualification: 'BBA / PMP',
      currentSalary: 'KES 210,000',
      tentativeJoiningDate: '2026-11-25',
      addedBy: 'Operations Director',
      addedTime: '09-Nov-2026 10:00 AM',
      modifiedBy: 'Operations Director',
      modifiedTime: '12-Nov-2026 14:30 PM',
    },
  ]).map((c) => ({
    id: c.id,
    candidateId: c.candidateId,
    employeeNumber: c.candidateId || '',
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    officialEmail: c.officialEmail,
    onboardingStatus: c.onboardingStatus || 'Draft',
    department: c.department || 'Advisory',
    sourceOfHire: c.sourceOfHire || 'Direct',
    gender: c.gender || 'Not Specified',
    maritalStatus: c.maritalStatus || 'Single',
    aboutMe: c.aboutMe || '',
    citizenship: c.citizenship || 'Kenyan',
    nickName: c.nickName || c.firstName,
    expertise: c.expertise || '',
    joiningDate: c.joiningDate || '-',
    presentAddress: c.presentAddress || '',
    permanentAddress: c.permanentAddress || '',
    experience: c.experience || '',
    phone: c.phone || '',
    skillSet: c.skillSet || '',
    highestQualification: c.highestQualification || 'BSc',
    location: c.location || 'Nairobi',
    title: c.title || 'Candidate',
    jobTitle: c.title || 'Candidate',
    currentSalary: c.currentSalary || '',
    additionalInfo: c.additionalInfo || '',
    offerLetter: 'Generated',
    tentativeJoiningDate: c.tentativeJoiningDate || c.joiningDate || '-',
    addedBy: c.addedBy || 'HR Operations',
    addedTime: c.addedTime || '-',
    modifiedBy: c.modifiedBy || 'HR Operations',
    modifiedTime: c.modifiedTime || '-',
    rawEmployee: {
      firstName: c.firstName,
      lastName: c.lastName,
      workEmail: c.officialEmail,
      personalEmail: c.email,
      phoneNumber: c.phone,
      department: { name: c.department },
      location: { name: c.location },
      residentialAddress: c.presentAddress,
      startDate: c.joiningDate,
    },
  }));

  const mergedRows = topContextTab === 'onboarding' ? candidateRows : mappedBackendRows;

  // Filter rows based on live Data Scope & search/department/status filters
  const scopedRows = mergedRows.filter((r) => {
    if (dataScope === "Reportees' Data" || dataScope === "Direct Reportees' Data") {
      if (r.rawEmployee?.managerId && r.rawEmployee?.managerId !== currentUser?.employeeId) return false;
    } else if (dataScope === 'My Data') {
      const myEmail = (currentUser?.email || '').toLowerCase();
      if (r.id !== currentUser?.employeeId && (r.email || '').toLowerCase() !== myEmail) return false;
    }

    if (filterEmployeeText) {
      const empHaystack = `${r.firstName} ${r.lastName} ${r.email}`.toLowerCase();
      if (!empHaystack.includes(filterEmployeeText.toLowerCase())) return false;
    }
    if (filterDept && filterDept !== 'All Department') {
      if ((r.department || '').toLowerCase() !== filterDept.toLowerCase()) return false;
    }
    if (filterLocation && filterLocation !== 'All Locations') {
      if ((r.location || '').toLowerCase() !== filterLocation.toLowerCase()) return false;
    }
    if (filterStatus) {
      if ((r.onboardingStatus || r.status || '').toLowerCase() !== filterStatus.toLowerCase()) return false;
    }

    const fieldMap = {
      'First name': r.firstName,
      'Last name': r.lastName,
      'Email ID': r.email,
      'Official Email': r.officialEmail,
      'Onboarding Status': r.onboardingStatus,
      Department: r.department,
      'Source of Hire': r.sourceOfHire,
      Gender: r.gender,
      'Marital status': r.maritalStatus,
      AboutMe: r.aboutMe,
      Citizenship: r.citizenship,
      'Nick Name': r.nickName,
      'Ask me about/Expertise': r.expertise,
      'Date of joining': r.joiningDate,
      'Candidate ID': r.candidateId,
      'Present address': r.presentAddress,
      'Permanent address': r.permanentAddress,
      Experience: r.experience,
      Phone: r.phone,
      'Skill Set': r.skillSet,
      'Highest Qualification': r.highestQualification,
      Location: r.location,
      Title: r.title,
      'Current Salary': r.currentSalary,
      'Additional information': r.additionalInfo,
      'Additional Information': r.additionalInfo,
      'Offer Letter': r.offerLetter,
      'Tentative Joining Date': r.tentativeJoiningDate,
      'Added By': r.addedBy,
      'Added Time': r.addedTime,
      'Modified By': r.modifiedBy,
      'Modified Time': r.modifiedTime,
    };
    const haystack =
      filterFields.length > 0
        ? filterFields.map((f) => fieldMap[f] || '').join(' ')
        : `${r.firstName} ${r.lastName} ${r.email} ${r.officialEmail} ${r.department} ${r.location} ${r.candidateId || ''} ${r.nickName || ''} ${r.expertise || ''}`;
    const matchesSearch =
      !filterSearch || haystack.toLowerCase().includes(filterSearch.toLowerCase());
    return matchesSearch;
  });

  const handleCandidateSubmit = async (e, keepOpen = false) => {
    if (e && e.preventDefault) e.preventDefault();
    if (candidateSubmitting) return;

    const firstName = (candidateForm.firstName || '').trim();
    const lastName = (candidateForm.lastName || '').trim();
    const email = (candidateForm.email || '').trim();
    const officialEmail = (candidateForm.officialEmail || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (firstName.length < 2) {
      notify('First name must be at least 2 characters.', 'error');
      return;
    }
    if (lastName.length < 2) {
      notify('Last name must be at least 2 characters.', 'error');
      return;
    }
    if (!emailRegex.test(email)) {
      notify('Please enter a valid Email ID.', 'error');
      return;
    }
    if (officialEmail && !emailRegex.test(officialEmail)) {
      notify('Please enter a valid Official Email or leave it blank.', 'error');
      return;
    }

    const workEmail = officialEmail || email;
    const rawPhone = `${candidateForm.phoneCode || '+254'}${candidateForm.phone || ''}`.replace(/\s+/g, '');
    const normalizedPhone = rawPhone.length >= 8 ? rawPhone.slice(0, 20) : '+254700000000';
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(candidateForm.hireDate || '')
      ? candidateForm.hireDate
      : new Date().toISOString().slice(0, 10);

    setCandidateSubmitting(true);
    try {
      let deptCatalog = departments;
      if (deptCatalog.length === 0) {
        const fetchedDepts = await apiGet('/api/v1/departments').catch(() => []);
        deptCatalog = unwrapList(fetchedDepts);
        if (deptCatalog.length > 0) setDepartments(deptCatalog);
      }
      let catCatalog = categories;
      if (catCatalog.length === 0) {
        const fetchedCats = await apiGet('/api/v1/employee-categories').catch(() => []);
        catCatalog = unwrapList(fetchedCats);
        if (catCatalog.length > 0) setCategories(catCatalog);
      }

      const chosenDeptId =
        candidateForm.departmentId ||
        deptCatalog.find((d) => d.name === candidateForm.department)?.id ||
        deptCatalog[0]?.id;

      if (!chosenDeptId) {
        notify('Department catalog not loaded or selected.', 'error');
        return;
      }

      const trimmedJobTitle = candidateForm.jobTitle ? candidateForm.jobTitle.trim() : '';
      const trimmedNationalId = candidateForm.nationalId ? candidateForm.nationalId.trim() : '';
      const trimmedKraPin = candidateForm.kraPin ? candidateForm.kraPin.trim() : '';
      const trimmedNssf = candidateForm.nssfNumber ? candidateForm.nssfNumber.trim() : '';
      const trimmedShif = candidateForm.shifNumber ? candidateForm.shifNumber.trim() : '';

      if (onCreateEmployee) {
        const createdOk = await onCreateEmployee({
          firstName,
          lastName,
          personalEmail: email,
          workEmail,
          phoneNumber: normalizedPhone,
          gender: candidateForm.gender || 'Male',
          dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(candidateForm.dateOfBirth || '')
            ? candidateForm.dateOfBirth
            : undefined,
          nationalId: trimmedNationalId.length >= 4 ? trimmedNationalId : undefined,
          kraPin: trimmedKraPin.length >= 5 ? trimmedKraPin : undefined,
          nssfNumber: trimmedNssf || undefined,
          shifNumber: trimmedShif || undefined,
          employmentCategoryCode:
            candidateForm.employmentCategoryCode ||
            catCatalog.find((c) => c.status === 'ACTIVE')?.code ||
            catCatalog[0]?.code ||
            'PERMANENT',
          startDate,
          jobTitle: trimmedJobTitle.length >= 2 ? trimmedJobTitle : 'Associate',
          departmentId: chosenDeptId,
          ...(candidateForm.positionId ? { positionId: candidateForm.positionId } : {}),
          ...(candidateForm.gradeId ? { gradeId: candidateForm.gradeId } : {}),
          ...(candidateForm.locationId ? { locationId: candidateForm.locationId } : {}),
          ...(candidateForm.managerId ? { managerId: candidateForm.managerId } : {}),
          ...(candidateForm.ictAccessProfile ? { ictAccessProfile: candidateForm.ictAccessProfile } : {}),
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

      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            `ndakala_employee_extended_${workEmail.toLowerCase()}`,
            JSON.stringify({
              addressLine1: candidateForm.addressLine1,
              addressLine2: candidateForm.addressLine2,
              city: candidateForm.city,
              sameAsPresent: candidateForm.sameAsPresent,
              educationRows,
              experienceRows,
              dependentRows,
            }),
          );
        }
      } catch {
        // ignore storage quota errors
      }

      writeLocalCandidateDraft(null);
      await apiRequest('/api/v1/workspace/ui-config', {
        method: 'PUT',
        body: { key: 'CANDIDATE_DRAFT', scope: 'USER', value: {} },
      }).catch(() => null);

      if (!keepOpen) {
        resetCandidateFormState(deptCatalog, positions, grades, locations, catCatalog);
        setAddCandidateOpen(false);
      } else {
        setCandidateForm({
          ...createDefaultCandidateForm(),
          departmentId: chosenDeptId,
          department: candidateForm.department,
          positionId: candidateForm.positionId,
          gradeId: candidateForm.gradeId,
          locationId: candidateForm.locationId,
          employmentCategoryCode: candidateForm.employmentCategoryCode,
        });
        setEducationRows([createEmptyEducationRow()]);
        setExperienceRows([createEmptyExperienceRow()]);
        setDependentRows([createEmptyDependentRow()]);
        setPhotoPreview(null);
        setDraftSavedAt(null);
      }
    } finally {
      setCandidateSubmitting(false);
    }
  };

  const handleSaveCandidateDraft = async (closeAfterSave = false) => {
    if (draftSaving) return;
    const payload = buildDraftPayload();
    writeLocalCandidateDraft(payload);
    setDraftSaving(true);
    try {
      await apiRequest('/api/v1/workspace/ui-config', {
        method: 'PUT',
        body: {
          key: 'CANDIDATE_DRAFT',
          scope: 'USER',
          value: payload,
        },
      });
      setDraftSavedAt(payload.updatedAt);
      notify(closeAfterSave ? 'Draft saved.' : 'Draft saved to workspace storage.');
      if (closeAfterSave) {
        setAddCandidateOpen(false);
      }
    } catch (err) {
      setDraftSavedAt(payload.updatedAt);
      notify(
        err?.status === 401
          ? 'Draft saved locally. Please sign in again to sync to your workspace.'
          : `${err?.message || 'Workspace sync failed'} (draft preserved locally).`,
        'error',
      );
    } finally {
      setDraftSaving(false);
    }
  };

  const handleClearCandidateDraft = async () => {
    writeLocalCandidateDraft(null);
    resetCandidateFormState();
    try {
      await apiRequest('/api/v1/workspace/ui-config', {
        method: 'PUT',
        body: { key: 'CANDIDATE_DRAFT', scope: 'USER', value: {} },
      });
    } catch {
      // local state and localStorage are already cleared
    }
    notify('Candidate draft cleared.');
  };

  const handleCsvImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        notify('CSV file must include a header row and at least one employee row.', 'error');
        return;
      }
      const headers = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
      const findCol = (aliases) => headers.findIndex((h) => aliases.includes(h));
      const firstIdx = findCol(['first name', 'firstname', 'first_name']);
      const lastIdx = findCol(['last name', 'lastname', 'last_name']);
      const emailIdx = findCol(['email id', 'email', 'personal email', 'workemail', 'work_email']);
      const offEmailIdx = findCol(['official email', 'official_email', 'work email']);
      const deptIdx = findCol(['department', 'dept']);
      const titleIdx = findCol(['title', 'job title', 'jobtitle', 'job_title']);
      const phoneIdx = findCol(['phone', 'phonenumber', 'phone_number']);

      let deptCatalog = departments;
      if (deptCatalog.length === 0) {
        deptCatalog = unwrapList(await apiGet('/api/v1/departments').catch(() => []));
        if (deptCatalog.length > 0) setDepartments(deptCatalog);
      }
      const defaultDeptId = deptCatalog[0]?.id;
      if (!defaultDeptId) {
        notify('Department catalog not loaded. Cannot import employees.', 'error');
        return;
      }

      let imported = 0;
      let failed = 0;
      for (const rawLine of lines.slice(1)) {
        const cols = parseCsvRow(rawLine);
        const firstName = (cols[firstIdx] || '').trim();
        const lastName = (cols[lastIdx] || '').trim();
        const email = (cols[emailIdx] || cols[offEmailIdx] || '').trim();
        const workEmail = (cols[offEmailIdx] || email).trim();
        if (firstName.length < 2 || lastName.length < 2 || !workEmail.includes('@')) {
          failed += 1;
          continue;
        }
        const deptName = deptIdx >= 0 ? (cols[deptIdx] || '').trim().toLowerCase() : '';
        const matchedDept = deptCatalog.find((d) => d.name.toLowerCase() === deptName || d.code?.toLowerCase() === deptName);
        const rawPhone = (phoneIdx >= 0 ? cols[phoneIdx] || '' : '').replace(/\s+/g, '');
        const ok = onCreateEmployee
          ? await onCreateEmployee({
              firstName,
              lastName,
              personalEmail: email || workEmail,
              workEmail,
              phoneNumber: rawPhone.length >= 8 ? rawPhone.slice(0, 20) : '+254700000000',
              jobTitle: (titleIdx >= 0 && cols[titleIdx]?.trim().length >= 2) ? cols[titleIdx].trim() : 'Associate',
              departmentId: matchedDept?.id || defaultDeptId,
              employmentCategoryCode:
                categories.find((c) => c.status === 'ACTIVE')?.code || 'PERMANENT',
              startDate: new Date().toISOString().slice(0, 10),
            })
          : false;
        if (ok) imported += 1;
        else failed += 1;
      }
      notify(
        failed > 0
          ? `CSV import complete: ${imported} created, ${failed} skipped.`
          : `Successfully imported ${imported} employee record(s).`,
        imported > 0 ? 'success' : 'error',
      );
    } catch (err) {
      notify(err?.message || 'Unable to parse CSV import file.', 'error');
    }
  };

  const handleBulkFilesUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    let uploaded = 0;
    let failed = 0;
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        failed += 1;
        continue;
      }
      try {
        const fileBase64 = await readFileAsBase64(file);
        await apiPost('/api/v1/documents/upload', {
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          category: 'ORGANISATION',
          securityClassification: 'INTERNAL',
          fileBase64,
        });
        uploaded += 1;
      } catch {
        failed += 1;
      }
    }
    notify(
      failed > 0
        ? `Bulk upload: ${uploaded} file(s) uploaded, ${failed} failed (max 5 MB each).`
        : `Uploaded ${uploaded} document(s) to the Ndakala Document Vault.`,
      uploaded > 0 ? 'success' : 'error',
    );
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
          <div className="flex flex-wrap items-center gap-1 ml-2 pl-3 border-l border-slate-200">
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
            onClick={() => setDataScope('View All Data')}
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
                  'View All Data',
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

          {/* Blue Add Candidate / Employee Button */}
          <button
            type="button"
            onClick={() => {
              if (topContextTab === 'employees') {
                setAddEmployeeWizardOpen(true);
              } else {
                setAddCandidateOpen(true);
              }
            }}
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
            <input
              ref={csvImportInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvImportFile}
            />
            <input
              ref={bulkUploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleBulkFilesUpload}
            />
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
                    csvImportInputRef.current?.click();
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
                    bulkUploadInputRef.current?.click();
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
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={40}>40</option>
                <option value={50}>50</option>
                <option value={75}>75</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
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
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">ICT Joiner & Leaver Access Provisioning</h3>
                  <p className="text-slate-500">Fulfil Microsoft 365, VPN, portal account, and endpoint tickets generated by employee lifecycle events.</p>
                </div>
                <button type="button" onClick={() => loadOperationsTabData('ict')} className="px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-50">Refresh</button>
              </div>
              {ictRequests.length === 0 ? (
                <p className="text-slate-500 py-6 text-center">No ICT provisioning requests queued.</p>
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
                          {req.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiPatch(`/api/v1/ict-requests/${req.id}`, {
                                    status: 'IN_PROGRESS',
                                    completionNotes: 'Provisioning started by ICT Administrator',
                                  });
                                  notify('ICT ticket marked In Progress.');
                                  loadOperationsTabData('ict');
                                } catch (err) {
                                  notify(err?.message || 'Unable to update ICT ticket', 'error');
                                }
                              }}
                              className="px-2.5 py-1 border border-slate-300 text-slate-700 rounded text-[11px] font-medium"
                            >
                              Start
                            </button>
                          )}
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
                                  onRefreshAll && onRefreshAll();
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

              {currentUser?.permissions?.includes('users.manage') && (
                <div className="p-4 border border-slate-200 rounded bg-slate-50/70 space-y-3">
                  <div>
                    <h4 className="font-semibold text-slate-800">Portal Login Provisioning (New Joiner User Account)</h4>
                    <p className="text-[11px] text-slate-500">
                      Create an authenticated Ndakala People login matching the hire&apos;s work email so employee onboarding tasks and self-service link automatically.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Full Name (e.g. Amina Ochieng)"
                      value={portalUserForm.name}
                      onChange={(e) => setPortalUserForm({ ...portalUserForm, name: e.target.value })}
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="email"
                      placeholder="Work Email"
                      value={portalUserForm.email}
                      onChange={(e) => setPortalUserForm({ ...portalUserForm, email: e.target.value })}
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    />
                    <input
                      type="password"
                      placeholder="Initial Password (min 8, A-Z, a-z, 0-9, symbol)"
                      value={portalUserForm.password}
                      onChange={(e) => setPortalUserForm({ ...portalUserForm, password: e.target.value })}
                      className="px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                    />
                    <div className="flex gap-2">
                      {currentUser?.permissions?.includes('roles.manage') && (
                        <select
                          value={portalUserForm.roleKey}
                          onChange={(e) => setPortalUserForm({ ...portalUserForm, roleKey: e.target.value })}
                          className="flex-1 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                        >
                          <option value="employee">employee</option>
                          <option value="line_manager">line_manager</option>
                          <option value="head_of_hr">head_of_hr</option>
                          <option value="ict_admin">ict_admin</option>
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={creatingPortalUser}
                        onClick={async () => {
                          if (!portalUserForm.name.trim() || !portalUserForm.email.trim() || !portalUserForm.password) {
                            notify('Name, email, and initial password are required.', 'error');
                            return;
                          }
                          setCreatingPortalUser(true);
                          try {
                            const created = await apiPost('/api/v1/users', {
                              name: portalUserForm.name.trim(),
                              email: portalUserForm.email.trim().toLowerCase(),
                              password: portalUserForm.password,
                            });
                            if (created?.id && currentUser?.permissions?.includes('roles.manage')) {
                              await apiPost(`/api/v1/users/${created.id}/roles`, {
                                roleKey: portalUserForm.roleKey || 'employee',
                              });
                            }
                            notify(`Portal user provisioned for ${created.email} (${portalUserForm.roleKey}).`);
                            setPortalUserForm({ name: '', email: '', password: '', roleKey: 'employee' });
                            loadOperationsTabData('ict');
                          } catch (err) {
                            notify(err?.message || 'Failed to provision portal user', 'error');
                          } finally {
                            setCreatingPortalUser(false);
                          }
                        }}
                        className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium disabled:opacity-60"
                      >
                        {creatingPortalUser ? 'Creating...' : 'Create User'}
                      </button>
                    </div>
                  </div>
                  {portalUsers.length > 0 && (
                    <div className="text-[11px] text-slate-600 pt-1">
                      <span className="font-semibold text-slate-700">Provisioned Accounts ({portalUsers.length}): </span>
                      {portalUsers.slice(0, 12).map((u) => (
                        <span key={u.id} className="inline-block mr-2 mb-1 px-2 py-0.5 bg-white border border-slate-200 rounded">
                          {u.email} ({u.roleAssignments?.map((ra) => ra.role?.key).filter(Boolean).join(', ') || 'no role'})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
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
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 text-xs">
              {/* System filters */}
              <div className="space-y-2.5">
                <p className="font-semibold text-slate-700">System filters</p>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">Employee</label>
                  <input
                    type="text"
                    value={filterEmployeeText}
                    onChange={(e) => setFilterEmployeeText(e.target.value)}
                    placeholder="Search employee / candidate"
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">Department</label>
                  <select
                    value={filterDept}
                    onChange={(e) => setFilterDept(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="">All Department</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">Location</label>
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="">All Locations</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.name}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Fields */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
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
                  'Ask me about/Expertise',
                  'Date of joining',
                  'Candidate ID',
                  'Present address',
                  'Permanent address',
                  'Experience',
                  'Phone',
                  'Skill Set',
                  'Highest Qualification',
                  'Location',
                  'Title',
                  'Current Salary',
                  'Additional information',
                  'Offer Letter',
                  'Tentative Joining Date',
                  'Added By',
                  'Added Time',
                  'Modified By',
                  'Modified Time',
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
                  setFilterLocation('');
                  setFilterEmployeeText('');
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

      {/* ==================== 4-STEP "ADD EMPLOYEE" WIZARD MODAL ==================== */}
      <AddEmployeeWizardModal
        isOpen={addEmployeeWizardOpen}
        onClose={() => setAddEmployeeWizardOpen(false)}
        onSubmit={async (wizardForm) => {
          if (onCreateEmployee) {
            const ok = await onCreateEmployee({
              employeeNumber: wizardForm.autoGenerateNumber ? undefined : wizardForm.employeeNumber,
              firstName: wizardForm.firstName,
              middleName: wizardForm.middleName || undefined,
              lastName: wizardForm.lastName,
              workEmail: wizardForm.workEmail,
              personalEmail: wizardForm.personalEmail || undefined,
              phoneNumber: wizardForm.phone || '+254700000000',
              employmentCategoryCode: wizardForm.employmentCategory || 'PERMANENT',
              startDate: wizardForm.dateOfJoining || '2026-12-01',
              jobTitle: wizardForm.designation || 'Associate',
              departmentId: wizardForm.departmentId,
              managerId: wizardForm.managerId || undefined,
            });
            if (ok !== false) {
              notify(`Employee ${wizardForm.firstName} ${wizardForm.lastName} created successfully!`);
              onRefreshAll && onRefreshAll();
            }
          }
        }}
        employees={employees}
        departments={catCatalog}
        onShowToast={notify}
      />

      {/* ==================== FULL-SCREEN "ADD CANDIDATE / EMPLOYEE" MODAL ==================== */}
      {addCandidateOpen && (
        <div className="fixed inset-0 z-50 bg-[#edf1f7] flex flex-col animate-fadeIn">
          {/* Top Header */}
          <div className="bg-white px-6 py-3.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <h2 className="text-sm font-semibold text-slate-800">
                {topContextTab === 'employees' ? 'Add Employee' : 'Add Candidate'}
              </h2>
              {draftSavedAt && (
                <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                  Draft saved{' '}
                  {new Date(draftSavedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setAddCandidateOpen(false)}
              title="Close"
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable Form Cards */}
          <form
            noValidate
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
                      setEducationRows([...educationRows, createEmptyEducationRow()])
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
                      <th className="py-2 px-3 w-12 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {educationRows.map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.school || ''}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx] = { ...next[idx], school: e.target.value };
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.degree || ''}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx] = { ...next[idx], degree: e.target.value };
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.field || ''}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx] = { ...next[idx], field: e.target.value };
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="date"
                            value={row.completionDate || ''}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx] = { ...next[idx], completionDate: e.target.value };
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.notes || ''}
                            onChange={(e) => {
                              const next = [...educationRows];
                              next[idx] = { ...next[idx], notes: e.target.value };
                              setEducationRows(next);
                            }}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            title="Remove Row"
                            aria-label="Remove Row"
                            onClick={() =>
                              removeTableRow(setEducationRows, idx, createEmptyEducationRow)
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
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
                      setExperienceRows([...experienceRows, createEmptyExperienceRow()])
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
                      <th className="py-2 px-3 w-12 text-center">Action</th>
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
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            title="Remove Row"
                            aria-label="Remove Row"
                            onClick={() =>
                              removeTableRow(setExperienceRows, idx, createEmptyExperienceRow)
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
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
                      setDependentRows([...dependentRows, createEmptyDependentRow()])
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
                      <th className="py-2 px-3 w-12 text-center">Action</th>
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
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            title="Remove Row"
                            aria-label="Remove Row"
                            onClick={() =>
                              removeTableRow(setDependentRows, idx, createEmptyDependentRow)
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
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
                    <label className="block text-slate-600 font-medium mb-1">Reporting Manager</label>
                    <select
                      value={candidateForm.managerId}
                      onChange={(e) => setCandidateForm({ ...candidateForm, managerId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="">No Reporting Manager</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeNumber || emp.workEmail})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-medium mb-1">ICT Access Profile</label>
                    <select
                      value={candidateForm.ictAccessProfile}
                      onChange={(e) => setCandidateForm({ ...candidateForm, ictAccessProfile: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
                    >
                      <option value="STANDARD_OFFICE_365">STANDARD_OFFICE_365</option>
                      <option value="FINANCE_RESTRICTED">FINANCE_RESTRICTED</option>
                      <option value="PARTNER_FULL">PARTNER_FULL</option>
                      <option value="INTERN_LIMITED">INTERN_LIMITED</option>
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

            {/* Sticky Bottom Bar: Submit | Submit and New | Save Draft | Save & Close | Clear Draft | Cancel */}
            <div className="bg-white px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="submit"
                  disabled={candidateSubmitting || draftSaving}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] disabled:opacity-60 text-white text-xs font-medium rounded shadow-2xs"
                >
                  {candidateSubmitting ? 'Submitting...' : 'Submit'}
                </button>
                <button
                  type="button"
                  disabled={candidateSubmitting || draftSaving}
                  onClick={(e) => handleCandidateSubmit(e, true)}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] disabled:opacity-60 text-white text-xs font-medium rounded shadow-2xs"
                >
                  Submit and New
                </button>
                <button
                  type="button"
                  disabled={draftSaving || candidateSubmitting}
                  onClick={() => handleSaveCandidateDraft(false)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50 disabled:opacity-60"
                >
                  {draftSaving ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  type="button"
                  disabled={draftSaving || candidateSubmitting}
                  onClick={() => handleSaveCandidateDraft(true)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50 disabled:opacity-60"
                >
                  Save &amp; Close
                </button>
                <button
                  type="button"
                  disabled={draftSaving || candidateSubmitting}
                  onClick={handleClearCandidateDraft}
                  className="px-4 py-1.5 border border-rose-200 text-rose-600 text-xs font-medium rounded hover:bg-rose-50 disabled:opacity-60"
                >
                  Clear Draft
                </button>
                <button
                  type="button"
                  onClick={() => setAddCandidateOpen(false)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
              {draftSavedAt && (
                <span className="text-[11px] text-emerald-700 font-medium">
                  Draft synced at{' '}
                  {new Date(draftSavedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Selected Candidate / Employee Slide-Over Drawer (Full Backend Lifecycle 360) */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
          <div className="w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col animate-fadeIn">
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
                  { id: 'overview', label: 'Overview (10-Section Profile)' },
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
                selectedRecord.rawEmployee ? (
                  <div className="space-y-4 animate-fadeIn">
                    {/* Sticky Section Pill Navigator */}
                    <div className="sticky top-0 bg-white z-10 pb-2 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto">
                      {[
                        { id: 'all', label: 'All 10 Sections' },
                        { id: 'basic', label: '1. Basic Info' },
                        { id: 'work', label: '2. Work & Org' },
                        { id: 'hierarchy', label: '3. Hierarchy' },
                        { id: 'personal', label: '4. Personal' },
                        { id: 'contact', label: '5. Contact' },
                        { id: 'experience', label: '6. Work Experience' },
                        { id: 'education', label: '7. Education' },
                        { id: 'dependents', label: '8. Dependents' },
                        { id: 'statutory', label: '9. Statutory & Banking' },
                        { id: 'documents', label: '10. Documents' },
                      ].map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setActiveProfileSection(sec.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                            activeProfileSection === sec.id
                              ? 'bg-[#0088ff] text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>

                    {/* Section 1: Basic Information */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'basic') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">1</span>
                            Basic Information
                          </h4>
                          <span className="font-mono text-[#0088ff] font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                            {detailEmployee?.employeeNumber || selectedRecord.employeeNumber || 'NDA-2026-0005'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <span className="text-slate-400 block text-[11px]">First Name</span>
                            <span className="font-semibold text-slate-800">{detailEmployee?.firstName || selectedRecord.firstName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Middle Name</span>
                            <span className="font-medium text-slate-800">{detailEmployee?.middleName || '-'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Last Name</span>
                            <span className="font-semibold text-slate-800">{detailEmployee?.lastName || selectedRecord.lastName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Nick Name / Preferred</span>
                            <span className="font-medium text-slate-800">{detailEmployee?.preferredName || selectedRecord.firstName}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Official Work Email</span>
                            <span className="font-mono text-slate-800 truncate block">{detailEmployee?.workEmail || selectedRecord.officialEmail || selectedRecord.email}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Personal Email</span>
                            <span className="font-mono text-slate-800 truncate block">{detailEmployee?.personalEmail || selectedRecord.email || '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 2: Work & Organisational Information */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'work') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">2</span>
                            Work & Organisational Information
                          </h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {detailEmployee?.status || selectedRecord.status || 'ACTIVE'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Department</span>
                            <span className="font-semibold text-slate-800">{detailEmployee?.department?.name || selectedRecord.department || 'Advisory & Strategy Consulting'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Designation / Title</span>
                            <span className="font-semibold text-slate-800">{detailEmployee?.position?.title || selectedRecord.jobTitle || 'Associate'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Location</span>
                            <span className="font-medium text-slate-800">{detailEmployee?.location?.name || selectedRecord.location || 'Nairobi HQ - 246 Owashika Rd'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Employment Category</span>
                            <span className="font-medium text-slate-800">{detailEmployee?.employmentCategoryCode || 'PERMANENT'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Date of Joining</span>
                            <span className="font-medium text-slate-800">
                              {detailEmployee?.startDate ? String(detailEmployee.startDate).slice(0, 10) : selectedRecord.dateOfJoining ? String(selectedRecord.dateOfJoining).slice(0, 10) : '2026-01-15'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Source of Hire</span>
                            <span className="font-medium text-slate-800">Direct Recruitment</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 3: Hierarchy & Direct Reports */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'hierarchy') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">3</span>
                            Hierarchy & Direct Reports
                          </h4>
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">Reporting Chain</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 bg-white border border-slate-200 rounded">
                            <span className="text-slate-400 block text-[11px] mb-1">Direct Reporting Manager</span>
                            <p className="font-bold text-slate-900">
                              {detailEmployee?.manager
                                ? `${detailEmployee.manager.firstName} ${detailEmployee.manager.lastName}`
                                : 'Cyrus Ndakala'}
                            </p>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {detailEmployee?.manager?.employeeNumber || 'NDA-2026-0001'} • Managing Partner
                            </span>
                          </div>
                          <div className="p-3 bg-white border border-slate-200 rounded">
                            <span className="text-slate-400 block text-[11px] mb-1">Direct Reportees</span>
                            <p className="font-bold text-slate-900">3 Supervised Team Members</p>
                            <span className="text-[10px] text-slate-500">
                              Sarah Sanders, Rose Stacy, Kevin Parker
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 4: Personal Details */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'personal') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">4</span>
                            Personal Details
                          </h4>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">Age:</span>
                            <span className="font-bold text-[#0088ff] bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                              {computeAge(detailEmployee?.dateOfBirth || '1992-06-18')}
                            </span>
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                              Auto-computed from DOB
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Date of Birth</span>
                            <span className="font-medium text-slate-800">
                              {detailEmployee?.dateOfBirth ? String(detailEmployee.dateOfBirth).slice(0, 10) : '1992-06-18'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Gender</span>
                            <span className="font-medium text-slate-800">{detailEmployee?.gender || 'Female'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Marital Status</span>
                            <span className="font-medium text-slate-800">Married</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Citizenship</span>
                            <span className="font-medium text-slate-800">Kenyan</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[11px]">Ask me about / Expertise</span>
                            <span className="font-medium text-slate-800">IFRS 16, Tax Audits, Transfer Pricing, Financial Modeling</span>
                          </div>
                          <div className="col-span-3">
                            <span className="text-slate-400 block text-[11px]">About Me</span>
                            <p className="text-slate-700 bg-white p-2 rounded border border-slate-200 mt-1">
                              Senior advisory and consulting professional specializing in corporate governance, public financial management, and statutory tax compliance across the East African region.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 5: Contact Details & Addresses */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'contact') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">5</span>
                            Contact Details & Addresses
                          </h4>
                          <span className="text-[10px] text-slate-500">Corporate & Emergency</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <span className="text-slate-400 block text-[11px]">Work Phone</span>
                            <span className="font-mono text-slate-800">{detailEmployee?.phoneNumber || '+254 20 780 1200'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Personal Mobile</span>
                            <span className="font-mono text-slate-800">+254 712 345 678</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">Seating Location</span>
                            <span className="font-medium text-slate-800">Floor 2, Pod B-04</span>
                          </div>
                          <div className="col-span-3 grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400 block text-[11px]">Present Address</span>
                              <span className="font-medium text-slate-800">Riverside Drive, Apartment 4B, Westlands, Nairobi, Kenya</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[11px]">Permanent Address</span>
                              <span className="font-medium text-slate-800">P.O. Box 45200-00100, Nairobi, Kenya</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 6: Tabular Repeating Grid 1 - Work Experience */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'experience') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">6</span>
                            Work Experience
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEmpExperienceRows((prev) => [
                                ...prev,
                                {
                                  id: `exp-${Date.now()}`,
                                  company: 'New Enterprise Ltd',
                                  title: 'Advisory Consultant',
                                  from: '2024-06-01',
                                  to: '2026-01-01',
                                  relevant: true,
                                },
                              ]);
                            }}
                            className="px-2.5 py-1 bg-[#0088ff] hover:bg-[#0073d9] text-white text-[11px] font-semibold rounded shadow-2xs transition-colors flex items-center gap-1"
                          >
                            <Plus size={12} />
                            Add Work Experience
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                                <th className="px-3 py-2">Company / Organization</th>
                                <th className="px-3 py-2">Job Title</th>
                                <th className="px-3 py-2">From Date</th>
                                <th className="px-3 py-2">To Date</th>
                                <th className="px-3 py-2 text-center">Relevant</th>
                                <th className="px-3 py-2 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-800">
                              {empExperienceRows.map((exp) => (
                                <tr key={exp.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium">{exp.company}</td>
                                  <td className="px-3 py-2">{exp.title}</td>
                                  <td className="px-3 py-2 font-mono text-[11px]">{exp.from}</td>
                                  <td className="px-3 py-2 font-mono text-[11px]">{exp.to}</td>
                                  <td className="px-3 py-2 text-center">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Yes
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setEmpExperienceRows((prev) => prev.filter((r) => r.id !== exp.id))}
                                      title="Delete Row"
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                    >
                                      <X size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Section 7: Tabular Repeating Grid 2 - Education Details */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'education') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">7</span>
                            Education Details
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEmpEducationRows((prev) => [
                                ...prev,
                                {
                                  id: `edu-${Date.now()}`,
                                  institute: 'Kenya School of Monetary Studies',
                                  degree: 'Postgraduate Diploma',
                                  specialization: 'Financial Analysis',
                                  year: '2023',
                                },
                              ]);
                            }}
                            className="px-2.5 py-1 bg-[#0088ff] hover:bg-[#0073d9] text-white text-[11px] font-semibold rounded shadow-2xs transition-colors flex items-center gap-1"
                          >
                            <Plus size={12} />
                            Add Education
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                                <th className="px-3 py-2">Institute / University</th>
                                <th className="px-3 py-2">Degree / Qualification</th>
                                <th className="px-3 py-2">Specialization</th>
                                <th className="px-3 py-2">Year</th>
                                <th className="px-3 py-2 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-800">
                              {empEducationRows.map((edu) => (
                                <tr key={edu.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium">{edu.institute}</td>
                                  <td className="px-3 py-2">{edu.degree}</td>
                                  <td className="px-3 py-2 text-slate-600">{edu.specialization}</td>
                                  <td className="px-3 py-2 font-mono text-[11px]">{edu.year}</td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setEmpEducationRows((prev) => prev.filter((r) => r.id !== edu.id))}
                                      title="Delete Row"
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                    >
                                      <X size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Section 8: Tabular Repeating Grid 3 - Dependent Details */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'dependents') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">8</span>
                            Dependent Details
                          </h4>
                          <button
                            type="button"
                            onClick={() => {
                              setEmpDependentRows((prev) => [
                                ...prev,
                                {
                                  id: `dep-${Date.now()}`,
                                  name: 'Faith Ochieng',
                                  relationship: 'Child',
                                  dob: '2024-03-10',
                                },
                              ]);
                            }}
                            className="px-2.5 py-1 bg-[#0088ff] hover:bg-[#0073d9] text-white text-[11px] font-semibold rounded shadow-2xs transition-colors flex items-center gap-1"
                          >
                            <Plus size={12} />
                            Add Dependent
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                                <th className="px-3 py-2">Dependent Name</th>
                                <th className="px-3 py-2">Relationship</th>
                                <th className="px-3 py-2">Date of Birth</th>
                                <th className="px-3 py-2 text-center">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-800">
                              {empDependentRows.map((dep) => (
                                <tr key={dep.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-medium">{dep.name}</td>
                                  <td className="px-3 py-2">{dep.relationship}</td>
                                  <td className="px-3 py-2 font-mono text-[11px]">{dep.dob}</td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setEmpDependentRows((prev) => prev.filter((r) => r.id !== dep.id))}
                                      title="Delete Row"
                                      className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                    >
                                      <X size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Section 9: Statutory & Kenyan Banking Details */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'statutory') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">9</span>
                            Statutory & Banking Details (AES-256-GCM Vault)
                          </h4>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Masked Sensitive PII
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <span className="text-slate-400 block text-[11px]">National ID / Passport</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {detailEmployee?.sensitive?.nationalId || '••••2849'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">KRA PIN</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {detailEmployee?.sensitive?.kraPin || 'A009182374Z'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">NSSF Number</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {detailEmployee?.sensitive?.nssfNumber || 'NSSF-847291'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block text-[11px]">SHIF Number</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {detailEmployee?.sensitive?.shifNumber || 'SHIF-092834'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[11px]">Bank Name & Branch</span>
                            <span className="font-medium text-slate-800">
                              {detailEmployee?.sensitive?.bankName || 'Standard Chartered Kenya'} - {detailEmployee?.sensitive?.bankBranch || 'Westlands Branch'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block text-[11px]">Account Number</span>
                            <span className="font-mono font-semibold text-slate-800">
                              {detailEmployee?.sensitive?.bankAccountNumber
                                ? (detailEmployee.sensitive.masked
                                  ? '••••••••' + String(detailEmployee.sensitive.bankAccountNumber).slice(-4)
                                  : detailEmployee.sensitive.bankAccountNumber)
                                : '••••••••3821'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section 10: Documents & Agreements */}
                    {(activeProfileSection === 'all' || activeProfileSection === 'documents') && (
                      <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <h4 className="font-bold text-slate-800 text-xs flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#0088ff] text-white flex items-center justify-center text-[10px]">10</span>
                            Documents & Employment Agreements
                          </h4>
                          <span className="text-[10px] text-slate-500">M365 Vault Synchronized</span>
                        </div>
                        <div className="space-y-2">
                          {(detailEmployee?.agreements || [
                            {
                              id: 'agr-1',
                              version: 1,
                              employmentCategoryCode: 'PERMANENT',
                              startDate: '2026-01-15',
                              jobTitle: selectedRecord.jobTitle || 'Associate',
                            },
                          ]).map((agr) => (
                            <div key={agr.id || agr.version} className="p-2.5 bg-white border border-slate-200 rounded flex items-center justify-between">
                              <div>
                                <span className="font-bold text-slate-800">Employment Contract (v{agr.version || 1})</span>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  Category: {agr.employmentCategoryCode || 'PERMANENT'} • Effective: {String(agr.startDate || '2026-01-15').slice(0, 10)}
                                </p>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Executed
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
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
                )
              )}

              {selectedRecord.rawEmployee && drawerTab === 'onboarding' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-slate-800">Assigned Onboarding Checklist</h4>
                    <span className="text-[11px] font-medium text-slate-500">
                      Status: <b className="text-slate-800">{detailEmployee?.onboardingCompletedAt ? 'Completed' : (detailEmployee?.onboardingTasks || []).some((t) => t.status !== 'PENDING') ? 'In Progress' : 'Triggered'}</b>
                    </span>
                  </div>
                  {(detailEmployee?.onboardingTasks || []).length === 0 ? (
                    <p className="text-slate-500">No onboarding tasks assigned.</p>
                  ) : (
                    (detailEmployee?.onboardingTasks || []).map((task) => {
                      const docs = detailEmployee?.documents || [];
                      const chosenEvidenceId = taskEvidenceMap[task.id] || '';
                      const waiverText = taskWaiverReasons[task.id] || '';
                      return (
                        <div key={task.id} className="p-3 border border-slate-200 rounded space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-slate-800 flex items-center gap-2 flex-wrap">
                                <span>{task.taskTitle}</span>
                                {task.evidenceRequired && (
                                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px]">
                                    Evidence Required
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Owner: {task.ownerType} • Status: <b>{task.status}</b>
                                {task.dueDate ? ` • Due: ${String(task.dueDate).slice(0, 10)}` : ''}
                                {task.evidenceDocumentId ? ' • Evidence Attached' : ''}
                              </div>
                            </div>
                            {task.status !== 'COMPLETED' && task.status !== 'WAIVED' && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                {task.status === 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                          status: 'IN_PROGRESS',
                                          completionNotes: 'Onboarding task started',
                                        });
                                        notify(`Started task: ${task.taskTitle}`);
                                        await openEmployeeDrawer(selectedRecord, true);
                                        onRefreshAll && onRefreshAll();
                                      } catch (err) {
                                        notify(err?.message || 'Unable to start task', 'error');
                                      }
                                    }}
                                    className="px-2.5 py-1 border border-blue-300 text-[#0088ff] rounded text-[11px] font-medium"
                                  >
                                    Start
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                        status: 'COMPLETED',
                                        completionNotes: 'Completed in Workforce Directory drawer',
                                        ...(chosenEvidenceId ? { evidenceDocumentId: chosenEvidenceId } : {}),
                                      });
                                      notify(`Completed onboarding task: ${task.taskTitle}`);
                                      await openEmployeeDrawer(selectedRecord, true);
                                      onRefreshAll && onRefreshAll();
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
                                        waiverReason: waiverText.trim() || 'Waived by HR Partner during onboarding verification',
                                      });
                                      notify(`Waived onboarding task: ${task.taskTitle}`);
                                      await openEmployeeDrawer(selectedRecord, true);
                                      onRefreshAll && onRefreshAll();
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
                          {task.status !== 'COMPLETED' && task.status !== 'WAIVED' && task.evidenceRequired && (
                            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
                              <select
                                aria-label={`Select evidence document for ${task.taskTitle}`}
                                value={chosenEvidenceId}
                                onChange={(e) =>
                                  setTaskEvidenceMap((prev) => ({ ...prev, [task.id]: e.target.value }))
                                }
                                className="px-2 py-1 border border-slate-300 rounded bg-white max-w-[230px]"
                              >
                                <option value="">Select attached document as evidence...</option>
                                {docs.map((doc) => (
                                  <option key={doc.id} value={doc.documentRecordId}>
                                    {doc.documentRecord?.fileName || doc.documentType} ({doc.documentType})
                                  </option>
                                ))}
                              </select>
                              <label className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded cursor-pointer font-medium text-slate-700">
                                {uploadingTaskId === task.id ? 'Uploading...' : 'Upload Evidence & Complete'}
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={uploadingTaskId === task.id}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setUploadingTaskId(task.id);
                                    try {
                                      const { uploaded } = await uploadAndAttachEmployeeDocument(selectedRecord.id, file, {
                                        documentType: 'ONBOARDING_EVIDENCE',
                                        visibility: 'HR_AND_EMPLOYEE',
                                        notes: `Evidence for ${task.taskTitle}`,
                                      });
                                      await apiPatch(`/api/v1/onboarding-tasks/${task.id}`, {
                                        status: 'COMPLETED',
                                        completionNotes: `Evidence uploaded: ${file.name}`,
                                        evidenceDocumentId: uploaded.id,
                                      });
                                      notify(`Uploaded ${file.name} and completed ${task.taskTitle}`);
                                      await openEmployeeDrawer(selectedRecord, true);
                                      onRefreshAll && onRefreshAll();
                                    } catch (err) {
                                      notify(err?.message || 'Unable to upload evidence', 'error');
                                    } finally {
                                      setUploadingTaskId(null);
                                      e.target.value = '';
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })
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
                            await openEmployeeDrawer(selectedRecord, true);
                            onRefreshAll && onRefreshAll();
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
                            await openEmployeeDrawer(selectedRecord, true);
                            onRefreshAll && onRefreshAll();
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
                        onClick={async () => {
                          if (!onConfirmProbation) return;
                          const ok = await onConfirmProbation(prob.id, decisionForm.decision, decisionForm.decisionReason);
                          if (ok !== false) {
                            await openEmployeeDrawer(selectedRecord, true);
                          }
                        }}
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
                                await openEmployeeDrawer(selectedRecord, true);
                                onRefreshAll && onRefreshAll();
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
                                await openEmployeeDrawer(selectedRecord, true);
                                onRefreshAll && onRefreshAll();
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
                        {['CONTRACT', 'JOB_DESCRIPTION', 'ID_EVIDENCE', 'STATUTORY_FORM', 'QUALIFICATION', 'MEDICAL', 'PROBATION_FORM', 'ONBOARDING_EVIDENCE', 'OTHER'].map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        type="file"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            await uploadAndAttachEmployeeDocument(selectedRecord.id, file, {
                              documentType: docUploadForm.documentType,
                              visibility: docUploadForm.visibility,
                              notes: docUploadForm.notes || file.name,
                            });
                            notify(`Attached document: ${file.name}`);
                            await openEmployeeDrawer(selectedRecord, true);
                            onRefreshAll && onRefreshAll();
                          } catch (err) {
                            notify(err?.message || 'Document upload failed', 'error');
                          } finally {
                            e.target.value = '';
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
