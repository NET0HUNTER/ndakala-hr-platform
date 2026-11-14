import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Check,
  X,
  Plus,
  MoreHorizontal,
  Trophy,
  Target,
  Award,
  NdakalaEmptyState,
} from '../components/Icons';
import { apiGet, apiPost, apiPut, apiPatch, unwrapList } from '../utils/api';

const PERF_SETTINGS_TABS = [
  { id: 'methods', label: 'Performance Methods' },
  { id: 'kra', label: 'KRA' },
  { id: 'goals', label: 'Goals' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'skillset', label: 'Skill Set' },
  { id: 'competency', label: 'Competency' },
  { id: 'salary', label: 'Salary' },
  { id: 'templates', label: 'Appraisal Templates' },
  { id: 'review', label: 'Appraisal Review' },
  { id: 'integration', label: 'Integration' },
  { id: 'continuous', label: 'Continuous Review' },
  { id: 'reports', label: 'Reports' },
  { id: 'renameterms', label: 'Rename Terms' },
  { id: 'esignature', label: 'E-Signature' },
];

export default function PerformanceView({
  activeTab = 'performance',
  topContextTab = 'gettingstarted',
  setTopContextTab,
  subViewHint = null,
  setActiveTab,
  currentUser,
  performanceCycles = [],
  appraisals = [],
  pips = [],
  employees = [],
  onCreateCycle,
  onSetAppraisalObjectives,
  onSubmitSelfAssessment,
  onSubmitManagerRating,
  onCompleteOneOnOne,
  onModerateAppraisal,
  onCreatePip,
  onRefreshAll,
  onShowToast,
}) {
  const [opsSubTab, setOpsSubTab] = useState('appraisals'); // appraisals | cycles | pip | development
  const [ratingScales, setRatingScales] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [cycleMetrics, setCycleMetrics] = useState(null);
  const [formulaConfig, setFormulaConfig] = useState(null);
  const [formulaSimResult, setFormulaSimResult] = useState(null);
  const [selectedAppraisalDetail, setSelectedAppraisalDetail] = useState(null);
  const [actionModal, setActionModal] = useState(null); // null | self | manager | meeting | moderate | peer | createCycle | createPip | createDev

  const [cycleForm, setCycleForm] = useState({
    title: 'Annual Performance Cycle 2026',
    cycleType: 'ANNUAL',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    selfAppraisalDeadline: '2026-11-30',
    managerReviewDeadline: '2026-12-10',
    moderationDeadline: '2026-12-18',
    maxObjectivesGuideline: 6,
    allowPeerFeedback: true,
  });
  const [formulaForm, setFormulaForm] = useState({
    model: 'QUARTERLY_WEIGHTED',
    roundingMethod: 'TWO_DECIMALS',
    q1: 20,
    q2: 20,
    q3: 25,
    q4: 35,
  });
  const [selfForm, setSelfForm] = useState({
    cycleId: '',
    employeeId: '',
    selfAchievements: 'Delivered key advisory engagements and SLA targets ahead of schedule.',
    strength1: 'Technical Advisory Precision',
    strength2: 'Client Communication',
    imp1: 'Delegation under peak workload',
    imp2: 'Cross-functional documentation speed',
    selfChallenges: 'Peak quarter overlapping statutory deadlines.',
  });
  const [mgrForm, setMgrForm] = useState({
    managerRatingCode: 4,
    managerAchievementsComments: 'Verified strong delivery across engagements.',
    s1: 'Analytical rigor',
    s2: 'Reliability',
    i1: 'Executive briefing brevity',
    i2: 'Early risk escalation',
  });
  const [meetingForm, setMeetingForm] = useState({
    meetingDate: '2026-11-20',
    meetingNotes: 'Reviewed strengths, ratings, and 2027 progression roadmap.',
    developmentAgreement: 'Lead Q1 client walkthroughs and mentor junior associates.',
  });
  const [modForm, setModForm] = useState({
    moderatedRatingCode: 4,
    moderationNotes: 'Calibrated across firm cohort distribution.',
  });
  const [peerReqEmpId, setPeerReqEmpId] = useState('');
  const [pipForm, setPipForm] = useState({
    employeeId: '',
    lineManagerId: '',
    triggerReason: 'FIRST_TIME_RATING_2',
    durationMonths: 3,
    startDate: '2026-11-16',
    endDate: '2027-02-15',
    baselineAssessment: 'Requires structured improvement on timely deliverables.',
    targetTitle: '100% On-Time Deliverable Submission',
    targetMeasurement: 'Zero missed client deadlines over 30/60/90 days',
  });
  const [pipCheckInForm, setPipCheckInForm] = useState({
    pipId: '',
    checkInMonth: 1,
    scheduledDate: '2026-12-15',
    managerReviewEvidence: 'Completed weekly checkpoints and improved SLA timeliness.',
    progressStatus: 'SATISFACTORY',
  });
  const [devForm, setDevForm] = useState({
    employeeId: '',
    objective: 'Advanced CISA / Financial Advisory Certification',
    actionDescription: 'Complete 40 CPE hours and shadow senior partner audits',
    targetDate: '2027-03-31',
  });
  const [goalEmployeeId, setGoalEmployeeId] = useState('');
  const [goalCycleId, setGoalCycleId] = useState('');
  const [lastCreatedObjSetId, setLastCreatedObjSetId] = useState('');
  // Getting Started 3-Step Carousel (08:55 - 09:48 of hr.webm)
  const [carouselStep, setCarouselStep] = useState(1);

  // Active sub-tab inside Performance Settings (00:06 - 06:35 of hr2.webm)
  const [settingsTab, setSettingsTab] = useState('methods');
  const [savedIndicator, setSavedIndicator] = useState(false);

  // Performance Methods state (00:12 - 00:18 of hr2.webm)
  const [kraGoalsEnabled, setKraGoalsEnabled] = useState(true);
  const [evalMethodType, setEvalMethodType] = useState('kra_and_goals');
  const [feedbackMethodEnabled, setFeedbackMethodEnabled] = useState(true);
  const [skillSetEnabled, setSkillSetEnabled] = useState(true);
  const [competencyEnabled, setCompetencyEnabled] = useState(true);
  const [summaryEnabled, setSummaryEnabled] = useState(true);

  // Feedback state (00:21 - 01:02 of hr2.webm)
  const [feedbackPerm, setFeedbackPerm] = useState('dept');
  const [peerToPeer, setPeerToPeer] = useState(true);
  const [deg360, setDeg360] = useState(true);
  const [anonFeedback, setAnonFeedback] = useState(true);
  const [requestFeedbackEnabled, setRequestFeedbackEnabled] = useState(true);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [feedbackCategories, setFeedbackCategories] = useState([
    { id: 'pos', label: 'Positive', icon: '👍' },
    { id: 'neg', label: 'Negative', icon: '👎' },
    { id: 'trn', label: 'Training', icon: '🎓' },
    { id: 'obs', label: 'Observation', icon: '📋' },
    { id: 'rew', label: 'Reward', icon: '🏆' },
  ]);
  const [openCatMenuId, setOpenCatMenuId] = useState(null);

  // Skill Set state (01:05 - 01:30 of hr2.webm)
  const [skillApproval, setSkillApproval] = useState(false);
  const [mandateDoc, setMandateDoc] = useState(false);
  const [mandateReason, setMandateReason] = useState(false);
  const [skillWeightEnabled, setSkillWeightEnabled] = useState(true);
  const [skillLevels, setSkillLevels] = useState([
    { level: 1, color: '#e5989b' },
    { level: 2, color: '#f4a261' },
    { level: 3, color: '#8ecae6' },
    { level: 4, color: '#84a59d' },
  ]);

  // Competency state (01:32 - 01:35 of hr2.webm)
  const [compWeightEnabled, setCompWeightEnabled] = useState(true);
  const [kraWeightCapEnabled, setKraWeightCapEnabled] = useState(true);
  const [compWeightCapEnabled, setCompWeightCapEnabled] = useState(true);
  const [attendanceMetricsInReview, setAttendanceMetricsInReview] = useState(true);
  const [okrInReview, setOkrInReview] = useState(false);
  const [skillPermissions, setSkillPermissions] = useState({
    'Employee (for self)': { view: true, tag: false, upgrade: false, del: false },
    'Reporting Manager': { view: true, tag: true, upgrade: true, del: false },
    'Department head': { view: false, tag: false, upgrade: false, del: false },
  });

  // Continuous Review state
  const [continuousEnabled, setContinuousEnabled] = useState(false);
  const [continuousFrequency, setContinuousFrequency] = useState('Monthly');
  const [continuousRatingType, setContinuousRatingType] = useState('Numbers (0 to 5)');
  const [sectionOrder, setSectionOrder] = useState([
    'Custom Section',
    'Goals',
    'KRA',
    'KRA vs Goals',
    'Competency',
    'Review Questions',
  ]);
  const [multiRaterTypes, setMultiRaterTypes] = useState([
    { label: 'Peers', enabled: true },
    { label: 'Manager', enabled: true },
    { label: 'Junior', enabled: false },
    { label: 'Senior', enabled: true },
  ]);
  const [potentialRanges, setPotentialRanges] = useState([
    { label: 'Low', min: 0, max: 40 },
    { label: 'Medium', min: 41, max: 70 },
    { label: 'High', min: 71, max: 100 },
  ]);
  const [appraisalTemplates, setAppraisalTemplates] = useState([
    { id: 'tpl-1', title: 'Yearly Appraisal with Hike', headerBg: 'bg-[#7c69ef]', items: ['Self Appraisal', 'Manager Review'] },
    { id: 'tpl-2', title: 'Yearly Appraisal with Self and Multi-Rater', headerBg: 'bg-[#3b82f6]', items: ['Self Appraisal', 'Multi-Rater', 'Manager Review'] },
    { id: 'tpl-3', title: 'Yearly Appraisal with Self and Review', headerBg: 'bg-[#c28e2c]', items: ['Self Appraisal', 'Manager Review'] },
  ]);
  const [tplModal, setTplModal] = useState(null); // null | { id?, title, itemsText }
  const [amendMode, setAmendMode] = useState(false);
  const [amendSheetId, setAmendSheetId] = useState('');
  const [amendReason, setAmendReason] = useState('Mid-year client priority realignment');

  // Nine Box Matrix state (06:10 - 06:12 of hr2.webm)
  const [nineBoxTerms, setNineBoxTerms] = useState([
    { key: 'Low Performer/High Potential', val: 'Rough Diamond' },
    { key: 'Moderate Performer/High Potential', val: 'Future Star' },
    { key: 'Outstanding Performer/High Potential', val: 'Consistent Star' },
    { key: 'Low Performer/Moderate Potential', val: 'Inconsistent Player' },
    { key: 'Moderate Performer/Moderate Potential', val: 'Key Player' },
    { key: 'Outstanding Performer/Moderate Potential', val: 'Current Star' },
    { key: 'Low Performer/Low Potential', val: 'Talent Risk' },
    { key: 'Moderate Performer/Low Potential', val: 'Solid Professional' },
    { key: 'Outstanding Performer/Low Potential', val: 'High Professional' },
  ]);

  // Rename Terms state (06:14 - 06:17 of hr2.webm)
  const [renameTerms, setRenameTerms] = useState([
    { key: 'KRA', val: 'KRA' },
    { key: 'Goals', val: 'Goals' },
    { key: 'KRA vs Goals', val: 'KRA vs Goals' },
    { key: 'Feedback', val: 'Feedback' },
    { key: 'Skill Set', val: 'Skill Set' },
    { key: 'Competency', val: 'Competency' },
    { key: 'Summary', val: 'Summary' },
    { key: 'Review Questions', val: 'Review Questions' },
    { key: 'Multi-Rater', val: 'Multi-Rater Review' },
    { key: 'Goalsheet', val: 'Goal Sheet' },
    { key: 'Hike', val: 'Hike' },
    { key: 'Salary Hike', val: 'Salary Hike' },
    { key: 'Proposed Hike', val: 'Proposed Hike' },
    { key: 'Allocated Hike', val: 'Allocated Hike' },
    { key: 'Custom Section', val: 'Custom Section' },
  ]);

  // E-Signature state & Confirmation Modal (06:19 - 06:28 of hr2.webm)
  const [eSignChecked, setESignChecked] = useState(false);
  const [eSignConfirmOpen, setESignConfirmOpen] = useState(false);
  const [eSignErrorBanner, setESignErrorBanner] = useState(false);

  // Operational Goal Sheet & Appraisal Modal
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [selectedAppraisal, setSelectedAppraisal] = useState(null);
  const [objectives, setObjectives] = useState([
    { title: 'Deliver Core Departmental Audit & ICT Milestones', weight: 25 },
    { title: 'Maintain 99.9% SLA Compliance & Security Controls', weight: 20 },
    { title: 'Automate Manual Reporting & Operational Workflows', weight: 15 },
    { title: 'Zero High-Severity Compliance Non-Conformities', weight: 15 },
    { title: 'Peer Collaboration & Client Advisory Satisfaction', weight: 15 },
    { title: 'Professional Certification & Capacity Development', weight: 10 },
  ]);

  const notify = (msg, type = 'success') => {
    if (onShowToast) onShowToast(msg, type);
  };

  React.useEffect(() => {
    apiGet('/api/v1/performance/rating-scales')
      .then((res) => setRatingScales(unwrapList(res)))
      .catch(() => null);
    apiGet('/api/v1/workspace/ui-config?key=PERF_SETTINGS')
      .then((cfg) => {
        const v = cfg?.configs?.PERF_SETTINGS || cfg?.value;
        if (v && typeof v === 'object') {
          if (typeof v.kraGoalsEnabled === 'boolean') setKraGoalsEnabled(v.kraGoalsEnabled);
          if (v.evalMethodType) setEvalMethodType(v.evalMethodType);
          if (typeof v.feedbackMethodEnabled === 'boolean') setFeedbackMethodEnabled(v.feedbackMethodEnabled);
          if (typeof v.skillSetEnabled === 'boolean') setSkillSetEnabled(v.skillSetEnabled);
          if (typeof v.competencyEnabled === 'boolean') setCompetencyEnabled(v.competencyEnabled);
          if (typeof v.summaryEnabled === 'boolean') setSummaryEnabled(v.summaryEnabled);
          if (v.feedbackPerm) setFeedbackPerm(v.feedbackPerm);
          if (typeof v.peerToPeer === 'boolean') setPeerToPeer(v.peerToPeer);
          if (typeof v.deg360 === 'boolean') setDeg360(v.deg360);
          if (typeof v.anonFeedback === 'boolean') setAnonFeedback(v.anonFeedback);
          if (typeof v.requestFeedbackEnabled === 'boolean') setRequestFeedbackEnabled(v.requestFeedbackEnabled);
          if (typeof v.compWeightEnabled === 'boolean') setCompWeightEnabled(v.compWeightEnabled);
          if (typeof v.kraWeightCapEnabled === 'boolean') setKraWeightCapEnabled(v.kraWeightCapEnabled);
          if (typeof v.compWeightCapEnabled === 'boolean') setCompWeightCapEnabled(v.compWeightCapEnabled);
          if (typeof v.attendanceMetricsInReview === 'boolean') setAttendanceMetricsInReview(v.attendanceMetricsInReview);
          if (typeof v.okrInReview === 'boolean') setOkrInReview(v.okrInReview);
          if (v.skillPermissions && typeof v.skillPermissions === 'object') setSkillPermissions(v.skillPermissions);
          if (typeof v.continuousEnabled === 'boolean') setContinuousEnabled(v.continuousEnabled);
          if (v.continuousFrequency) setContinuousFrequency(v.continuousFrequency);
          if (v.continuousRatingType) setContinuousRatingType(v.continuousRatingType);
          if (typeof v.eSignChecked === 'boolean') setESignChecked(v.eSignChecked);
          if (Array.isArray(v.nineBoxTerms)) setNineBoxTerms(v.nineBoxTerms);
          if (Array.isArray(v.renameTerms)) setRenameTerms(v.renameTerms);
          if (Array.isArray(v.sectionOrder)) setSectionOrder(v.sectionOrder);
          if (Array.isArray(v.multiRaterTypes)) setMultiRaterTypes(v.multiRaterTypes);
          if (Array.isArray(v.potentialRanges)) setPotentialRanges(v.potentialRanges);
          if (Array.isArray(v.appraisalTemplates)) setAppraisalTemplates(v.appraisalTemplates);
          if (Array.isArray(v.skillLevels)) setSkillLevels(v.skillLevels);
        }
      })
      .catch(() => null);
  }, []);

  React.useEffect(() => {
    if ((activeTab === 'okr' || subViewHint === 'objectives') && topContextTab === 'gettingstarted') {
      setTopContextTab && setTopContextTab('appraisals');
    }
  }, [activeTab, subViewHint]);

  React.useEffect(() => {
    const cId = selectedCycleId || performanceCycles[0]?.id || '';
    const empId = employees[0]?.id || '';
    if (cId && !selectedCycleId) setSelectedCycleId(cId);
    setSelfForm((p) => ({ ...p, cycleId: p.cycleId || cId, employeeId: p.employeeId || empId }));
    setPipForm((p) => ({ ...p, employeeId: p.employeeId || empId, lineManagerId: p.lineManagerId || employees[1]?.id || empId }));
    setDevForm((p) => ({ ...p, employeeId: p.employeeId || empId }));
    setGoalEmployeeId((p) => p || empId);
    setGoalCycleId((p) => p || cId);
  }, [performanceCycles, employees]);

  const persistPerfSettings = async (override = {}) => {
    try {
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'PERF_SETTINGS',
        scope: 'ORG',
        value: {
          kraGoalsEnabled,
          evalMethodType,
          feedbackMethodEnabled,
          skillSetEnabled,
          competencyEnabled,
          summaryEnabled,
          feedbackPerm,
          peerToPeer,
          deg360,
          anonFeedback,
          requestFeedbackEnabled,
          compWeightEnabled,
          kraWeightCapEnabled,
          compWeightCapEnabled,
          attendanceMetricsInReview,
          okrInReview,
          skillPermissions,
          continuousEnabled,
          continuousFrequency,
          continuousRatingType,
          eSignChecked,
          nineBoxTerms,
          renameTerms,
          sectionOrder,
          multiRaterTypes,
          potentialRanges,
          appraisalTemplates,
          skillLevels,
          ...override,
        },
      });
    } catch {
      // ignore if employee view without config.manage permission
    }
  };

  const triggerSaved = (override) => {
    setSavedIndicator(true);
    persistPerfSettings(override);
    setTimeout(() => setSavedIndicator(false), 1800);
  };

  // ==================== 1. GETTING STARTED VIEW (08:54 - 09:52 of hr.webm) ====================
  if (topContextTab === 'gettingstarted') {
    return (
      <div className="flex-1 bg-[#edf1f7] p-6 overflow-y-auto flex items-center justify-center">
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[470px]">
          {/* Left Panel: Performance Service Description & Illustration */}
          <div className="lg:col-span-5 bg-[#f5f8ff] p-8 flex flex-col justify-between border-r border-slate-100">
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-3">Performance Service</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                The Performance Management service helps you assess and enhance employee
                performance accurately with intuitive metrics and employee-centric practices. From
                setting goals to running appraisals, manage performance with ease and step up your
                organization's productivity.
              </p>
            </div>

            {/* Performance Rating Illustration */}
            <div className="mt-6 flex justify-center">
              <svg viewBox="0 0 260 190" className="w-60 h-44">
                <rect x="25" y="15" width="130" height="155" rx="10" fill="#ffffff" stroke="#dbeafe" strokeWidth="2" />
                <rect x="40" y="35" width="75" height="22" rx="5" fill="#fef3c7" />
                <text x="50" y="50" fill="#f59e0b" fontSize="12" fontWeight="bold">★ ★ ★</text>
                <rect x="40" y="70" width="95" height="22" rx="5" fill="#e0f2fe" />
                <text x="50" y="85" fill="#0284c7" fontSize="12" fontWeight="bold">★ ★ ★ ★</text>
                <rect x="40" y="105" width="100" height="22" rx="5" fill="#dcfce7" />
                <text x="50" y="120" fill="#16a34a" fontSize="12" fontWeight="bold">★ ★ ★ ★ ★</text>
                <circle cx="190" cy="105" r="22" fill="#fed7aa" />
                <path d="M160 170 C160 138 220 138 220 170 Z" fill="#fb923c" />
              </svg>
            </div>
          </div>

          {/* Right Panel: 3-Step Carousel */}
          <div className="lg:col-span-7 p-8 flex flex-col justify-between">
            {carouselStep === 1 && (
              <div>
                <h3 className="text-base font-bold text-slate-800 mb-1.5">Review Methods</h3>
                <p className="text-xs text-slate-500 mb-5">
                  A range of performance evaluation methods tailored to enhance employee
                  performance, suitable for organizations of any size and type.
                </p>
                <div className="space-y-3">
                  <div className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                      <Target size={18} />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Key Result Areas (KRA)</p>
                      <p className="text-slate-500 mt-1">
                        KRAs represent areas of responsibility or focus. KRAs can help employees
                        understand their role in the organization.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-blue-50 text-[#0088ff]">
                      <Trophy size={18} />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Goals</p>
                      <p className="text-slate-500 mt-1">
                        Specific, measurable objectives that employees are expected to handle.
                        Goals serve as performance targets.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                      <Award size={18} />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Skill Set & Competency</p>
                      <p className="text-slate-500 mt-1">
                        Skill Sets and Competencies are combinations of abilities that enable
                        employees to perform effectively in a specific role.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {carouselStep === 2 && (
              <div>
                <h3 className="text-base font-bold text-slate-800 mb-1.5">Review Types</h3>
                <p className="text-xs text-slate-500 mb-5">
                  Use different review methods to facilitate a more comprehensive evaluation of
                  employee performance and development needs.
                </p>
                <div className="space-y-3.5">
                  <div className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                      <Award size={18} />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Self Review</p>
                      <p className="text-slate-500 mt-1 leading-relaxed">
                        Employees can assess their own performance, strengths, and areas for
                        improvement. It encourages self-awareness, accountability, and proactive
                        engagement.
                      </p>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-slate-200 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-blue-50 text-[#0088ff]">
                      <Trophy size={18} />
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800">Multi-Rater Review</p>
                      <p className="text-slate-500 mt-1 leading-relaxed">
                        Collect ratings from varied sources, which can include people from the same
                        department, different departments, or complex reporting structures.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {carouselStep === 3 && (
              <div className="flex flex-col items-center justify-center text-center my-auto">
                <h3 className="text-base font-bold text-slate-800 mb-6">
                  How does performance management work in Ndakala People?
                </h3>
                <div className="space-y-4 max-w-md w-full text-left text-xs">
                  <div className="p-4 rounded-lg border border-amber-200 bg-amber-50/30">
                    <p className="font-semibold text-slate-800">Create an appraisal template</p>
                    <p className="text-slate-500 mt-1">
                      Create an appraisal template, include self review, manager review,
                      multi-rater review, normalization and salary hikes.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-rose-200 bg-rose-50/30">
                    <p className="font-semibold text-slate-800">Specify review parameters</p>
                    <p className="text-slate-500 mt-1">
                      Include quantitative and qualitative parameters such as Goals, KRA, Review
                      questions to your review.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTopContextTab && setTopContextTab('settings')}
                    className="px-5 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-xs transition-colors"
                  >
                    Configure Performance Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopContextTab && setTopContextTab('appraisals')}
                    className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded"
                  >
                    Open Appraisals & Cycles
                  </button>
                </div>
              </div>
            )}

            {/* Carousel Footer Navigation */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold tracking-wider">STEP {carouselStep} OF 3</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={carouselStep === 1}
                  onClick={() => setCarouselStep(Math.max(1, carouselStep - 1))}
                  className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    carouselStep < 3
                      ? setCarouselStep(carouselStep + 1)
                      : setTopContextTab && setTopContextTab('settings')
                  }
                  className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== 2. OPERATIONAL APPRAISALS, CYCLES, GOALS & PIPS VIEW ====================
  if (topContextTab === 'appraisals') {
    const loadCycleAnalytics = async (cycleId) => {
      if (!cycleId) return;
      setSelectedCycleId(cycleId);
      const [m, fc] = await Promise.all([
        apiGet(`/api/v1/performance/cycles/${cycleId}/metrics`).catch(() => null),
        apiGet(`/api/v1/performance/cycles/${cycleId}/formula-config`).catch(() => null),
      ]);
      setCycleMetrics(m);
      setFormulaConfig(fc);
    };

    return (
      <div className="flex-1 bg-[#edf1f7] p-5 overflow-y-auto space-y-4 text-xs">
        <div className="bg-white rounded-md border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Appraisal Cycles, 6-Objective Goal Sheets & PIP Governance
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              End-to-end Ndakala performance lifecycle: SMART Objectives, 1-6 Rating Scale, Peer Feedback, Moderation, Annual Formulas & PIPs
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'appraisals', label: `Appraisals (${appraisals.length})` },
              { id: 'cycles', label: `Cycles & Formula (${performanceCycles.length})` },
              { id: 'pip', label: `PIPs (${pips.length})` },
              { id: 'development', label: 'Development Actions' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setOpsSubTab(t.id);
                  if (t.id === 'cycles' && (selectedCycleId || performanceCycles[0]?.id)) {
                    loadCycleAnalytics(selectedCycleId || performanceCycles[0]?.id);
                  }
                }}
                className={`px-3 py-1.5 rounded font-medium ${
                  opsSubTab === t.id ? 'bg-[#0088ff] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setGoalModalOpen(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded"
            >
              + 6-Objective Goal Sheet
            </button>
            <button
              type="button"
              onClick={() => setTopContextTab && setTopContextTab('settings')}
              className="px-3.5 py-1.5 border border-slate-300 text-slate-700 font-medium rounded hover:bg-slate-50"
            >
              Performance Settings
            </button>
          </div>
        </div>

        {opsSubTab === 'appraisals' && (
          <div className="space-y-4">
            {/* Submit Self-Appraisal & Peer Feedback Quick Action Bar */}
            <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">
                Appraisal Rating Scale Reference: {ratingScales.map((s) => `${s.code}-${s.label}`).join(' | ') || '1 (Unacceptable) to 6 (Exceptional)'}
              </span>
              <button
                type="button"
                onClick={() => setActionModal('self')}
                className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Submit Self-Appraisal
              </button>
            </div>

            <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
              {appraisals.length === 0 ? (
                <NdakalaEmptyState
                  title="No Appraisals Initiated Yet"
                  subtitle="Configure your 6-objective goal sheet or submit a self-appraisal to start the evaluation workflow."
                  actionLabel="Set 6 Objectives"
                  onAction={() => setGoalModalOpen(true)}
                />
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Cycle</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Manager Rating</th>
                      <th className="py-3 px-4">Moderated</th>
                      <th className="py-3 px-4 text-right">Workflow Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {appraisals.map((ap) => (
                      <tr key={ap.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {ap.employee ? `${ap.employee.firstName || ap.employee.fullName || ''} ${ap.employee.lastName || ''}`.trim() : ap.employeeId}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{ap.cycle?.title || ap.cycle?.name || 'Annual 2026'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[11px] font-medium">
                            {ap.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">{ap.managerRatingCode ?? ap.managerRating ?? '-'}</td>
                        <td className="py-3 px-4 text-slate-700 font-semibold">{ap.moderatedRatingCode ?? '-'}</td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={async () => {
                              setSelectedAppraisal(ap);
                              const d = await apiGet(`/api/v1/performance/appraisals/${ap.id}`).catch(() => ap);
                              setSelectedAppraisalDetail(d);
                            }}
                            className="text-slate-700 hover:underline font-medium"
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAppraisal(ap);
                              setActionModal('manager');
                            }}
                            className="text-[#0088ff] hover:underline font-medium"
                          >
                            Manager Review
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAppraisal(ap);
                              setActionModal('meeting');
                            }}
                            className="text-indigo-600 hover:underline font-medium"
                          >
                            1:1 Meeting
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAppraisal(ap);
                              setActionModal('moderate');
                            }}
                            className="text-amber-600 hover:underline font-medium"
                          >
                            Moderate
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiPost(`/api/v1/performance/appraisals/${ap.id}/approve`, {});
                                notify('Partner final approval recorded.');
                                onRefreshAll && onRefreshAll();
                              } catch (err) {
                                notify(err?.message || 'Partner approval blocked', 'error');
                              }
                            }}
                            className="text-emerald-600 hover:underline font-medium"
                          >
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedAppraisalDetail && (
              <div className="bg-white rounded-md border border-blue-200 p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h4 className="font-semibold text-slate-800">
                    Appraisal 360 & Peer Feedback — {selectedAppraisalDetail.status}
                  </h4>
                  <button type="button" onClick={() => setSelectedAppraisalDetail(null)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button>
                </div>
                <p className="text-slate-600">Self Achievements: {selectedAppraisalDetail.selfAchievements}</p>
                <div className="flex items-center gap-2 pt-2">
                  <select value={peerReqEmpId} onChange={(e) => setPeerReqEmpId(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    <option value="">Select Peer Employee for 360 Feedback</option>
                    {employees.map((em) => (
                      <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!peerReqEmpId) return;
                      try {
                        await apiPost(`/api/v1/performance/appraisals/${selectedAppraisalDetail.id}/peer-feedback/request`, {
                          peerEmployeeId: peerReqEmpId,
                        });
                        notify('Peer feedback request dispatched.');
                        const refreshed = await apiGet(`/api/v1/performance/appraisals/${selectedAppraisalDetail.id}`);
                        setSelectedAppraisalDetail(refreshed);
                      } catch (err) {
                        notify(err?.message || 'Unable to request peer feedback', 'error');
                      }
                    }}
                    className="px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                  >
                    Request Peer Feedback
                  </button>
                </div>
                {(selectedAppraisalDetail.peerFeedbacks || []).map((pf) => (
                  <div key={pf.id} className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-800">Peer: {pf.peerEmployeeId}</div>
                      <div className="text-slate-600">{pf.feedbackText || 'Awaiting submission...'}</div>
                    </div>
                    {!pf.submittedAt && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await apiPost(`/api/v1/performance/peer-feedback/${pf.id}/submit`, {
                              peerEmployeeId: pf.peerEmployeeId,
                              feedbackText: 'Consistently collaborative, timely delivery and client empathy.',
                              strengths: 'Advisory rigor & teamwork',
                            });
                            notify('Peer feedback submitted.');
                            const refreshed = await apiGet(`/api/v1/performance/appraisals/${selectedAppraisalDetail.id}`);
                            setSelectedAppraisalDetail(refreshed);
                          } catch (err) {
                            notify(err?.message || 'Failed to submit peer feedback', 'error');
                          }
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                      >
                        Submit Peer Input
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {opsSubTab === 'cycles' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-md border border-slate-200 p-5 space-y-3">
              <h4 className="font-semibold text-slate-800">Create Performance Cycle</h4>
              <input type="text" value={cycleForm.title} onChange={(e) => setCycleForm({ ...cycleForm, title: e.target.value })} placeholder="Cycle Title" className="w-full px-3 py-1.5 border border-slate-300 rounded" />
              <div className="grid grid-cols-3 gap-2">
                <select value={cycleForm.cycleType} onChange={(e) => setCycleForm({ ...cycleForm, cycleType: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  <option value="ANNUAL">ANNUAL</option>
                  <option value="QUARTERLY">QUARTERLY</option>
                </select>
                <input type="date" value={cycleForm.periodStart} onChange={(e) => setCycleForm({ ...cycleForm, periodStart: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
                <input type="date" value={cycleForm.periodEnd} onChange={(e) => setCycleForm({ ...cycleForm, periodEnd: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await apiPost('/api/v1/performance/cycles', cycleForm);
                    notify('Performance cycle created.');
                    onRefreshAll && onRefreshAll();
                  } catch (err) {
                    notify(err?.message || 'Cycle creation failed', 'error');
                  }
                }}
                className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Create Cycle
              </button>
              <div className="pt-2 space-y-1.5">
                {performanceCycles.map((c) => (
                  <div key={c.id} className="p-2.5 border border-slate-200 rounded flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{c.title}</div>
                      <div className="text-[11px] text-slate-500">{c.cycleType} • {c.periodStart} to {c.periodEnd}</div>
                    </div>
                    <button type="button" onClick={() => loadCycleAnalytics(c.id)} className="px-2.5 py-1 border border-[#0088ff] text-[#0088ff] rounded text-[11px]">
                      Metrics & Formula
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-5 space-y-3">
              <h4 className="font-semibold text-slate-800">Annual Rating Formula Engine & Cohort Calibration</h4>
              {cycleMetrics && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px]">
                  Total Appraisals: <b>{cycleMetrics.totalAppraisals ?? 0}</b> • Formula Status: <b>{formulaConfig?.status || 'NONE'}</b>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <select value={formulaForm.model} onChange={(e) => setFormulaForm({ ...formulaForm, model: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {['SIMPLE_AVERAGE', 'QUARTERLY_WEIGHTED', 'ANNUAL_ONLY', 'HYBRID_SPLIT'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select value={formulaForm.roundingMethod} onChange={(e) => setFormulaForm({ ...formulaForm, roundingMethod: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {['TWO_DECIMALS', 'NEAREST_HALF', 'NEAREST_INTEGER', 'FLOOR', 'CEIL'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedCycleId) return;
                    try {
                      await apiPost(`/api/v1/performance/cycles/${selectedCycleId}/formula-config`, {
                        model: formulaForm.model,
                        roundingMethod: formulaForm.roundingMethod,
                        weights: { Q1: formulaForm.q1, Q2: formulaForm.q2, Q3: formulaForm.q3, Q4: formulaForm.q4 },
                      });
                      notify('Proposed annual rating formula.');
                      loadCycleAnalytics(selectedCycleId);
                    } catch (err) {
                      notify(err?.message || 'Formula proposal failed', 'error');
                    }
                  }}
                  className="px-3 py-1.5 bg-slate-800 text-white rounded font-medium"
                >
                  Propose Formula
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedCycleId) return;
                    try {
                      await apiPost(`/api/v1/performance/cycles/${selectedCycleId}/formula-config/approve`, {});
                      notify('Annual rating formula approved.');
                      loadCycleAnalytics(selectedCycleId);
                    } catch (err) {
                      notify(err?.message || 'Maker-checker approval blocked', 'error');
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded font-medium"
                >
                  Approve Formula
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedCycleId) return;
                    try {
                      const sim = await apiPost(`/api/v1/performance/cycles/${selectedCycleId}/formula-config/simulate`, {
                        sampleScores: [4, 4, 5, 5],
                        roundingMethod: formulaForm.roundingMethod,
                      });
                      setFormulaSimResult(sim);
                      notify('Formula simulation completed.');
                    } catch (err) {
                      notify(err?.message || 'Simulation failed', 'error');
                    }
                  }}
                  className="px-3 py-1.5 border border-[#0088ff] text-[#0088ff] rounded font-medium"
                >
                  Run Interactive Simulation
                </button>
              </div>
              {formulaSimResult && (
                <pre className="p-2.5 bg-slate-900 text-emerald-300 rounded text-[11px] overflow-x-auto">
                  {JSON.stringify(formulaSimResult, null, 2)}
                </pre>
              )}
            </div>
          </div>
        )}

        {opsSubTab === 'pip' && (
          <div className="space-y-4">
            <div className="bg-white rounded-md border border-slate-200 p-5 space-y-3">
              <h4 className="font-semibold text-slate-800">Initiate 30/60/90-Day Performance Improvement Plan (PIP)</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <select value={pipForm.employeeId} onChange={(e) => setPipForm({ ...pipForm, employeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
                </select>
                <select value={pipForm.lineManagerId} onChange={(e) => setPipForm({ ...pipForm, lineManagerId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {employees.map((em) => <option key={em.id} value={em.id}>Mgr: {em.firstName || em.fullName} {em.lastName || ''}</option>)}
                </select>
                <select value={pipForm.triggerReason} onChange={(e) => setPipForm({ ...pipForm, triggerReason: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {['FIRST_TIME_RATING_2', 'CONSECUTIVE_RATING_2', 'RATING_2_WHILE_ON_PIP', 'RATING_3_INSUFFICIENT_IMPROVEMENT', 'CAPABILITY_DEFICIT'].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <input type="number" min="1" max="3" value={pipForm.durationMonths} onChange={(e) => setPipForm({ ...pipForm, durationMonths: Number(e.target.value) })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              </div>
              <input type="text" value={pipForm.baselineAssessment} onChange={(e) => setPipForm({ ...pipForm, baselineAssessment: e.target.value })} placeholder="Baseline assessment (min 5 chars)" className="w-full px-3 py-1.5 border border-slate-300 rounded" />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await apiPost('/api/v1/performance/pip', {
                      ...pipForm,
                      smartTargets: [{ target: pipForm.targetTitle, measurement: pipForm.targetMeasurement, dueDate: pipForm.endDate }],
                    });
                    notify('PIP initiated with SMART targets.');
                    onRefreshAll && onRefreshAll();
                  } catch (err) {
                    notify(err?.message || 'PIP initiation failed', 'error');
                  }
                }}
                className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Initiate PIP
              </button>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-5 space-y-2.5">
              <h4 className="font-semibold text-slate-800">Active & Historical PIPs</h4>
              {pips.map((p) => (
                <div key={p.id} className="p-3 border border-slate-200 rounded flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-800">{p.employee?.firstName || p.employeeId} • {p.triggerReason} ({p.status})</div>
                    <div className="text-[11px] text-slate-500">{p.startDate} to {p.endDate}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/performance/pip/${p.id}/acknowledge`, { employeeId: p.employeeId, comments: 'Acknowledged SMART targets' });
                          notify('PIP acknowledged.');
                          onRefreshAll && onRefreshAll();
                        } catch (err) {
                          notify(err?.message || 'Acknowledge blocked', 'error');
                        }
                      }}
                      className="px-2.5 py-1 border border-slate-300 rounded text-[11px]"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/performance/pip/${p.id}/check-ins`, {
                            checkInMonth: 1,
                            scheduledDate: '2026-12-15',
                            managerReviewEvidence: pipCheckInForm.managerReviewEvidence,
                            progressStatus: 'SATISFACTORY',
                          });
                          notify('Monthly PIP check-in logged.');
                          onRefreshAll && onRefreshAll();
                        } catch (err) {
                          notify(err?.message || 'Check-in failed', 'error');
                        }
                      }}
                      className="px-2.5 py-1 bg-[#0088ff] text-white rounded text-[11px]"
                    >
                      Log Month-1 Check-In
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiPost(`/api/v1/performance/pip/${p.id}/outcome`, {
                            outcomeRecommendation: 'CLEARANCE',
                            outcomeNotes: 'Met all SMART milestones during PIP period.',
                          });
                          notify('PIP clearance outcome authorized.');
                          onRefreshAll && onRefreshAll();
                        } catch (err) {
                          notify(err?.message || 'Outcome failed', 'error');
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-600 text-white rounded text-[11px]"
                    >
                      Authorize Clearance
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {opsSubTab === 'development' && (
          <div className="bg-white rounded-md border border-slate-200 p-5 space-y-3">
            <h4 className="font-semibold text-slate-800">Record & Complete Development Actions</h4>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              <select value={devForm.employeeId} onChange={(e) => setDevForm({ ...devForm, employeeId: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
              </select>
              <input type="text" value={devForm.objective} onChange={(e) => setDevForm({ ...devForm, objective: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
              <input type="date" value={devForm.targetDate} onChange={(e) => setDevForm({ ...devForm, targetDate: e.target.value })} className="px-2.5 py-1.5 border border-slate-300 rounded" />
            </div>
            <input type="text" value={devForm.actionDescription} onChange={(e) => setDevForm({ ...devForm, actionDescription: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const act = await apiPost('/api/v1/performance/development/actions', devForm);
                    notify(`Recorded development action (${act.id.slice(0, 8)}).`);
                    setLastCreatedObjSetId(act.id);
                  } catch (err) {
                    notify(err?.message || 'Failed to record action', 'error');
                  }
                }}
                className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded font-medium"
              >
                Add Development Action
              </button>
              {lastCreatedObjSetId && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPatch(`/api/v1/performance/development/actions/${lastCreatedObjSetId}/complete`, {
                        evidence: 'Verified CPE certificate uploaded to HR vault',
                      });
                      notify('Development action marked complete.');
                    } catch (err) {
                      notify(err?.message || 'Completion update failed', 'error');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 text-white rounded font-medium"
                >
                  Mark Latest Action Completed
                </button>
              )}
            </div>
          </div>
        )}

        {/* Appraisal Lifecycle Action Modal (Self | Manager | 1:1 Meeting | Moderate) */}
        {actionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-lg w-full p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-sm font-semibold text-slate-800 uppercase">{actionModal} Appraisal Step</h4>
                <button type="button" onClick={() => setActionModal(null)}><X size={15} /></button>
              </div>
              {actionModal === 'self' && (
                <div className="space-y-2">
                  <select value={selfForm.cycleId} onChange={(e) => setSelfForm({ ...selfForm, cycleId: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {performanceCycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <select value={selfForm.employeeId} onChange={(e) => setSelfForm({ ...selfForm, employeeId: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                    {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
                  </select>
                  <textarea rows={2} value={selfForm.selfAchievements} onChange={(e) => setSelfForm({ ...selfForm, selfAchievements: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost('/api/v1/performance/appraisals/self', {
                          cycleId: selfForm.cycleId,
                          employeeId: selfForm.employeeId,
                          selfAchievements: selfForm.selfAchievements,
                          selfStrengths: [selfForm.strength1, selfForm.strength2],
                          selfImprovementAreas: [selfForm.imp1, selfForm.imp2],
                          selfChallenges: selfForm.selfChallenges,
                        });
                        notify('Self-appraisal submitted.');
                        setActionModal(null);
                        onRefreshAll && onRefreshAll();
                      } catch (err) {
                        notify(err?.message || 'Submission failed', 'error');
                      }
                    }}
                    className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                  >
                    Submit Self-Appraisal
                  </button>
                </div>
              )}
              {actionModal === 'manager' && selectedAppraisal && (
                <div className="space-y-2">
                  <label className="block text-slate-600">Rating (1 to 6)</label>
                  <input type="number" min="1" max="6" value={mgrForm.managerRatingCode} onChange={(e) => setMgrForm({ ...mgrForm, managerRatingCode: Number(e.target.value) })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <textarea rows={2} value={mgrForm.managerAchievementsComments} onChange={(e) => setMgrForm({ ...mgrForm, managerAchievementsComments: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost(`/api/v1/performance/appraisals/${selectedAppraisal.id}/manager`, {
                          managerAchievementsComments: mgrForm.managerAchievementsComments,
                          managerStrengths: [mgrForm.s1, mgrForm.s2],
                          managerImprovementAreas: [mgrForm.i1, mgrForm.i2],
                          managerRatingCode: mgrForm.managerRatingCode,
                        });
                        notify('Manager evaluation recorded.');
                        setActionModal(null);
                        onRefreshAll && onRefreshAll();
                      } catch (err) {
                        notify(err?.message || 'Manager review blocked', 'error');
                      }
                    }}
                    className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                  >
                    Submit Manager Rating
                  </button>
                </div>
              )}
              {actionModal === 'meeting' && selectedAppraisal && (
                <div className="space-y-2">
                  <input type="date" value={meetingForm.meetingDate} onChange={(e) => setMeetingForm({ ...meetingForm, meetingDate: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <textarea rows={2} value={meetingForm.meetingNotes} onChange={(e) => setMeetingForm({ ...meetingForm, meetingNotes: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <input type="text" value={meetingForm.developmentAgreement} onChange={(e) => setMeetingForm({ ...meetingForm, developmentAgreement: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost(`/api/v1/performance/appraisals/${selectedAppraisal.id}/meeting`, meetingForm);
                        notify('Formal 1:1 review meeting recorded.');
                        setActionModal(null);
                        onRefreshAll && onRefreshAll();
                      } catch (err) {
                        notify(err?.message || 'Meeting recording failed', 'error');
                      }
                    }}
                    className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                  >
                    Record 1:1 Meeting
                  </button>
                </div>
              )}
              {actionModal === 'moderate' && selectedAppraisal && (
                <div className="space-y-2">
                  <label className="block text-slate-600">Moderated Rating (1 to 6)</label>
                  <input type="number" min="1" max="6" value={modForm.moderatedRatingCode} onChange={(e) => setModForm({ ...modForm, moderatedRatingCode: Number(e.target.value) })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <textarea rows={2} value={modForm.moderationNotes} onChange={(e) => setModForm({ ...modForm, moderationNotes: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-300 rounded" />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiPost(`/api/v1/performance/appraisals/${selectedAppraisal.id}/moderate`, modForm);
                        notify('HR moderation applied.');
                        setActionModal(null);
                        onRefreshAll && onRefreshAll();
                      } catch (err) {
                        notify(err?.message || 'Moderation failed', 'error');
                      }
                    }}
                    className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium"
                  >
                    Save Moderation
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {goalModalOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30">
            <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col animate-fadeIn">
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">
                  6-Objective SMART Goal Sheet (Total Weight: 100%)
                </h3>
                <button
                  type="button"
                  onClick={() => setGoalModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 pt-4 grid grid-cols-2 gap-3 text-xs">
                <select value={goalEmployeeId} onChange={(e) => setGoalEmployeeId(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {employees.map((em) => <option key={em.id} value={em.id}>{em.firstName || em.fullName} {em.lastName || ''}</option>)}
                </select>
                <select value={goalCycleId} onChange={(e) => setGoalCycleId(e.target.value)} className="px-2.5 py-1.5 border border-slate-300 rounded bg-white">
                  {performanceCycles.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-3 text-xs">
                {objectives.map((obj, i) => (
                  <div key={i} className="grid grid-cols-12 gap-3 items-center">
                    <span className="col-span-1 font-semibold text-slate-500">#{i + 1}</span>
                    <input
                      type="text"
                      value={obj.title}
                      onChange={(e) => {
                        const next = [...objectives];
                        next[i].title = e.target.value;
                        setObjectives(next);
                      }}
                      className="col-span-8 px-3 py-2 border border-slate-300 rounded"
                    />
                    <div className="col-span-3 flex items-center gap-1.5">
                      <input
                        type="number"
                        value={obj.weight}
                        onChange={(e) => {
                          const next = [...objectives];
                          next[i].weight = Number(e.target.value);
                          setObjectives(next);
                        }}
                        className="w-full px-2.5 py-2 border border-slate-300 rounded text-right"
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 flex items-center justify-between gap-2.5">
                {(() => {
                  const totalW = objectives.reduce((s, o) => s + Number(o.weight || 0), 0);
                  const validWeight = totalW === 100;
                  return (
                    <>
                      <span className={`text-xs font-semibold ${validWeight ? 'text-emerald-700' : 'text-rose-600'}`}>
                        Total Weight: {totalW}% {validWeight ? '✓' : '(must equal 100%)'}
                      </span>
                      <button
                        type="button"
                        disabled={!validWeight}
                        onClick={async () => {
                          if (!validWeight) return;
                    try {
                      const created = await apiPost('/api/v1/performance/objectives', {
                        employeeId: goalEmployeeId || selectedAppraisal?.employeeId || employees[0]?.id,
                        cycleId: goalCycleId || undefined,
                        title: '2026 Performance Goal Sheet',
                        objectives: objectives.map((o) => ({
                          title: o.title,
                          kpi: 'Measurable engagement KPI attainment',
                          behavioursAndValues: 'Ndakala Six Core Values',
                          expectedDate: '2026-12-31',
                          weightPercent: o.weight,
                          isRealistic: true,
                        })),
                      });
                      await apiPost(`/api/v1/performance/objectives/${created.id}/submit`, {}).catch(() => null);
                      notify('6-Objective SMART Goal Sheet saved & submitted for approval.');
                      setGoalModalOpen(false);
                      onRefreshAll && onRefreshAll();
                    } catch (err) {
                      notify(err?.message || 'Failed to save goal sheet', 'error');
                    }
                  }}
                  className="px-4 py-1.5 bg-[#0088ff] text-white text-xs font-medium rounded disabled:opacity-50"
                >
                  Save & Submit Goal Sheet
                </button>
                    </>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => {
                    const defaultSheet =
                      selectedAppraisalDetail?.objectiveSheetId ||
                      selectedAppraisal?.objectiveSheetId ||
                      appraisals.find((a) => a.objectiveSheetId)?.objectiveSheetId ||
                      '';
                    setAmendSheetId(defaultSheet);
                    setAmendMode((m) => !m);
                  }}
                  className="px-4 py-1.5 bg-amber-600 text-white text-xs font-medium rounded"
                >
                  {amendMode ? 'Hide Amendment Form' : 'Amend Approved Sheet'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAmendMode(false);
                    setGoalModalOpen(false);
                  }}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
                >
                  Cancel
                </button>
              </div>

              {amendMode && (
                <div className="p-3.5 rounded-md border border-amber-200 bg-amber-50/50 space-y-2.5 text-xs">
                  <p className="font-semibold text-amber-900">Amend Approved Objective Sheet</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Objective Sheet ID</label>
                      <input
                        type="text"
                        placeholder="Paste or select Objective Sheet UUID"
                        value={amendSheetId}
                        onChange={(e) => setAmendSheetId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">Amendment Reason (min 5 chars)</label>
                      <input
                        type="text"
                        value={amendReason}
                        onChange={(e) => setAmendReason(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!amendSheetId.trim()) {
                          notify('Objective Sheet ID is required.', 'error');
                          return;
                        }
                        try {
                          await apiPost(`/api/v1/performance/objectives/${amendSheetId.trim()}/amend`, {
                            amendmentReason: amendReason.trim() || 'Mid-year client priority realignment',
                            updatedObjectives: objectives.map((o) => ({
                              title: o.title,
                              kpi: 'Updated engagement KPI attainment',
                              behavioursAndValues: 'Ndakala Six Core Values',
                              expectedDate: '2026-12-31',
                              weightPercent: o.weight,
                              isRealistic: true,
                            })),
                          });
                          notify('Objective sheet amended safely.');
                          setAmendMode(false);
                          setGoalModalOpen(false);
                          onRefreshAll && onRefreshAll();
                        } catch (err) {
                          notify(err?.message || 'Amendment failed', 'error');
                        }
                      }}
                      className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium"
                    >
                      Submit Amendment
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================== 3. NDakala 14-TAB PERFORMANCE SETTINGS ====================
  return (
    <div className="flex flex-1 h-full bg-[#edf1f7] overflow-hidden relative">
      {/* Top-center E-Signature error banner when triggered */}
      {eSignErrorBanner && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-rose-50 border border-rose-300 text-rose-800 rounded-md shadow-lg flex items-center overflow-hidden text-xs">
          <div className="bg-rose-500 text-white px-2.5 py-2.5 font-bold">!</div>
          <span className="px-3.5 py-2 font-medium">
            At least one e-sign application integration must be configured to enable this feature.
          </span>
          <button
            type="button"
            onClick={() => setESignErrorBanner(false)}
            className="px-2.5 py-2 text-rose-400 hover:text-rose-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Left Sub-Sidebar (14 Performance Settings Tabs + Go to Operations) */}
      <div className="w-[225px] bg-[#f8f9fc] border-r border-slate-200 flex flex-col justify-between flex-shrink-0 select-none">
        <div className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
          {PERF_SETTINGS_TABS.map((t) => {
            const active = settingsTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSettingsTab(t.id)}
                className={`w-full px-3.5 py-2.5 rounded-md text-left text-xs transition-colors ${
                  active
                    ? 'bg-[#e6e9f4] text-slate-900 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/50 font-medium'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Bottom "Go to Operations" Button (00:08 & 05:13 of hr2.webm) */}
        <div className="p-3 border-t border-slate-200 bg-[#f8f9fc]">
          <button
            type="button"
            onClick={() => setTopContextTab && setTopContextTab('appraisals')}
            className="w-full py-2 px-3 bg-white border border-slate-300 hover:border-[#0088ff] rounded text-xs font-medium text-slate-700 flex items-center justify-center gap-2 shadow-2xs transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Go to Operations</span>
          </button>
        </div>
      </div>

      {/* Right Main Settings Canvas */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
        {savedIndicator && (
          <div className="fixed right-8 top-16 z-40 bg-emerald-50 border border-emerald-200 text-emerald-700 px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 shadow-xs">
            <Check size={13} />
            <span>Saved</span>
          </div>
        )}

        {/* TAB 1: PERFORMANCE METHODS (00:06 - 00:19 of hr2.webm) */}
        {settingsTab === 'methods' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800">Primary evaluation methods</h3>
              <p className="text-slate-500 mt-1 mb-5">
                Select the methods that you commonly use in your organization to evaluate your
                employees. These are employed during all reviews and impact the final rating
                calculation.
              </p>

              <div className="flex items-start gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !kraGoalsEnabled;
                    setKraGoalsEnabled(nextVal);
                    triggerSaved({ kraGoalsEnabled: nextVal });
                  }}
                  className={`mt-0.5 w-9 h-5 rounded-full transition-colors p-0.5 ${
                    kraGoalsEnabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      kraGoalsEnabled ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <div>
                  <p className="font-semibold text-slate-800">KRA and Goals</p>
                  <p className="text-slate-500 mt-0.5">
                    Select KRA, Goals, or KRA and Goals as independent methods or as a linked
                    method of evaluation using KRA vs Goals
                  </p>
                </div>
              </div>

              {kraGoalsEnabled && (
                <div className="pl-12 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-8 space-y-2.5">
                    <p className="text-slate-600 font-medium mb-2">Choose type</p>
                    {[
                      {
                        id: 'kra',
                        title: 'KRA',
                        desc: 'KRA will be enabled as an independent method',
                      },
                      {
                        id: 'goals',
                        title: 'Goals',
                        desc: 'Goals will be enabled as an independent method',
                      },
                      {
                        id: 'kra_and_goals',
                        title: 'KRA and Goals',
                        desc: 'KRA and Goals will be enabled as independent methods',
                      },
                      {
                        id: 'kra_vs_goals',
                        title: 'KRA vs Goals',
                        desc: 'Goals will be associated with KRAs as a linked method',
                      },
                    ].map((opt) => (
                      <label
                        key={opt.id}
                        onClick={() => {
                          setEvalMethodType(opt.id);
                          triggerSaved({ evalMethodType: opt.id });
                        }}
                        className={`block p-4 rounded-md border cursor-pointer transition-colors ${
                          evalMethodType === opt.id
                            ? 'border-[#0088ff] bg-blue-50/10'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            checked={evalMethodType === opt.id}
                            onChange={() => {
                              setEvalMethodType(opt.id);
                              triggerSaved({ evalMethodType: opt.id });
                            }}
                            className="text-[#0088ff]"
                          />
                          <span className="font-semibold text-slate-800">{opt.title}</span>
                        </div>
                        <p className="text-slate-500 pl-6 mt-1">{opt.desc}</p>
                      </label>
                    ))}
                  </div>

                  {/* Right-Side Yellow Preview Card (00:12 of hr2.webm) */}
                  <div className="lg:col-span-4 border border-amber-200 bg-[#fffdf5] rounded-lg p-5 text-center">
                    <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[11px] font-semibold mb-4">
                      Preview
                    </span>
                    <div className="w-10 h-10 rounded-full border border-amber-300 mx-auto flex items-center justify-center text-amber-600 mb-2">
                      👤
                    </div>
                    <p className="font-semibold text-slate-800 mb-4">User Name</p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="p-2 bg-white border border-slate-200 rounded text-slate-700">
                        KRA 1
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded text-slate-700">
                        Goals 1
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded text-slate-700">
                        KRA 2
                      </div>
                      <div className="p-2 bg-white border border-slate-200 rounded text-slate-700">
                        Goals 2
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Feedback, Skill Set, Competency, Summary Cards (00:17 of hr2.webm) */}
            {[
              {
                key: 'feedbackMethodEnabled',
                label: 'Feedback',
                desc: 'Receive Feedback from employees, managers or peers to aid in the continuous improvement of individuals and your organization as the whole',
                val: feedbackMethodEnabled,
                set: setFeedbackMethodEnabled,
              },
              {
                key: 'skillSetEnabled',
                label: 'Skill Set',
                desc: 'Skill Sets are particular abilities that help an employee perform the job. Examples: accounting, computer languages.',
                val: skillSetEnabled,
                set: setSkillSetEnabled,
              },
              {
                key: 'competencyEnabled',
                label: 'Competency',
                desc: 'Competency is the combination of knowledge, skills, abilities, and personal attributes that contribute to enhanced employee performance. Examples: leadership, problem solving.',
                val: competencyEnabled,
                set: setCompetencyEnabled,
              },
              {
                key: 'summaryEnabled',
                label: 'Summary',
                desc: 'Summary is a questionnaire that the reviewer can respond to about various aspects of their employee’s performance along with a final rating',
                val: summaryEnabled,
                set: setSummaryEnabled,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded-md border border-slate-200 p-5 flex items-start gap-3.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !item.val;
                    item.set(nextVal);
                    triggerSaved({ [item.key]: nextVal });
                  }}
                  className={`mt-0.5 w-9 h-5 rounded-full transition-colors p-0.5 flex-shrink-0 ${
                    item.val ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      item.val ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <div>
                  <p className="font-semibold text-slate-800">{item.label}</p>
                  <p className="text-slate-500 mt-1">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2 & 3: KRA / GOALS */}
        {(settingsTab === 'kra' || settingsTab === 'goals') && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-800 uppercase">{settingsTab}</h3>
            <p className="text-slate-500">
              Configure permissions, weightages (must total 100%), and tagging rules for{' '}
              {settingsTab.toUpperCase()}.
            </p>
            <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={kraWeightCapEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setKraWeightCapEnabled(val);
                  triggerSaved({ kraWeightCapEnabled: val });
                }}
                className="rounded text-[#0088ff]"
              />
              <span className="font-medium text-slate-700">
                Total weightage of tagged {settingsTab.toUpperCase()} must not exceed 100%
              </span>
            </label>
          </div>
        )}

        {/* TAB 4: FEEDBACK (00:20 - 01:03 of hr2.webm) */}
        {settingsTab === 'feedback' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h3 className="text-sm font-semibold text-slate-800">Feedback</h3>
              <p className="text-slate-500 mt-1">
                Receive Feedback from employees, managers or peers to aid in the continuous
                improvement of individuals and your organization as the whole
              </p>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Permissions</h4>
              <p className="text-slate-500 mt-0.5 mb-4">
                Define the level of Feedback allowed in your organization
              </p>
              <p className="text-slate-700 font-medium mb-2.5">
                To whom can an employee give feedback?
              </p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={feedbackPerm === 'dept'}
                    onChange={() => {
                      setFeedbackPerm('dept');
                      triggerSaved({ feedbackPerm: 'dept' });
                    }}
                  />
                  <span>To anyone within the department</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={feedbackPerm === 'org'}
                    onChange={() => {
                      setFeedbackPerm('org');
                      triggerSaved({ feedbackPerm: 'org' });
                    }}
                  />
                  <span>To all in the organization</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6 space-y-4">
              <div>
                <h4 className="font-semibold text-slate-800">Feedback system</h4>
                <p className="text-slate-500 mt-0.5">
                  Define who can share feedback on whom in your organization
                </p>
              </div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={peerToPeer}
                  onChange={() => {
                    const nextVal = !peerToPeer;
                    setPeerToPeer(nextVal);
                    triggerSaved({ peerToPeer: nextVal });
                  }}
                  className="mt-0.5 rounded text-[#0088ff]"
                />
                <div>
                  <p className="font-semibold text-slate-800">Peer-to-Peer</p>
                  <p className="text-slate-500">
                    Employees can share their Feedback on any employee who belongs to the same
                    department or organization, except for employees in higher positions in the
                    organization's hierarchy.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deg360}
                  onChange={() => {
                    const nextVal = !deg360;
                    setDeg360(nextVal);
                    triggerSaved({ deg360: nextVal });
                  }}
                  className="mt-0.5 rounded text-[#0088ff]"
                />
                <div>
                  <p className="font-semibold text-slate-800">360 Degree</p>
                  <p className="text-slate-500">
                    Employees can share their Feedback on any employee who belongs to the same
                    department or organization, including managers and employees in higher
                    positions in the organization's hierarchy.
                  </p>
                </div>
              </label>
            </div>

            {/* Anonymous Feedback (00:38 of hr2.webm) */}
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Anonymous Feedback</h4>
              <p className="text-slate-500 mt-0.5 mb-3">
                Maintain confidentiality by not revealing the name of the employee when submitting
                Feedback
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !anonFeedback;
                    setAnonFeedback(nextVal);
                    triggerSaved({ anonFeedback: nextVal });
                  }}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    anonFeedback ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      anonFeedback ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-slate-700 font-medium">Enable</span>
              </div>
            </div>

            {/* Feedback categories Grid (00:40 - 00:54 of hr2.webm) */}
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Feedback categories</h4>
              <p className="text-slate-500 mt-0.5 mb-4">
                Add relevant categories for employees to use and quickly classify their Feedback
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {/* Add Category Box */}
                <div className="p-3.5 rounded-md border border-slate-200 flex items-center justify-between">
                  {!addingCategory ? (
                    <button
                      type="button"
                      onClick={() => setAddingCategory(true)}
                      className="text-[#0088ff] font-medium hover:underline"
                    >
                      Add Category
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 w-full">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Category name"
                        className="flex-1 px-2.5 py-1 border border-slate-300 rounded"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newCategoryName.trim()) {
                            setFeedbackCategories([
                              ...feedbackCategories,
                              { id: 'cat-' + Date.now(), label: newCategoryName, icon: '⭐' },
                            ]);
                            setNewCategoryName('');
                            setAddingCategory(false);
                            triggerSaved();
                          }
                        }}
                        className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingCategory(false)}
                        className="w-6 h-6 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {feedbackCategories.map((cat) => (
                  <div
                    key={cat.id}
                    className="p-3.5 rounded-md border border-slate-200 flex items-center justify-between relative group"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        {cat.icon}
                      </span>
                      <span className="font-medium text-slate-700">{cat.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenCatMenuId(openCatMenuId === cat.id ? null : cat.id)
                      }
                      className="p-1 text-slate-400 hover:text-slate-700 rounded-full border border-transparent hover:border-slate-200"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {openCatMenuId === cat.id && (
                      <div className="absolute right-3 top-11 w-28 bg-white rounded shadow-lg border border-slate-200 py-1 z-20">
                        <button
                          type="button"
                          onClick={() => {
                            setOpenCatMenuId(null);
                            triggerSaved();
                          }}
                          className="w-full px-3 py-1.5 text-left hover:bg-slate-50 text-slate-700"
                        >
                          Disable
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenCatMenuId(null)}
                          className="w-full px-3 py-1.5 text-left hover:bg-slate-50 text-slate-700"
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Request Feedback Card (00:55 of hr2.webm) */}
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Request Feedback</h4>
              <p className="text-slate-500 mt-0.5 mb-3">
                This option enables sending requests for feedback about employees from any other
                employee in the organization
              </p>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !requestFeedbackEnabled;
                    setRequestFeedbackEnabled(nextVal);
                    triggerSaved({ requestFeedbackEnabled: nextVal });
                  }}
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                    requestFeedbackEnabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform ${
                      requestFeedbackEnabled ? 'translate-x-4' : ''
                    }`}
                  />
                </button>
                <span className="text-slate-700 font-medium">Enable</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SKILL SET (01:04 - 01:30 of hr2.webm) */}
        {settingsTab === 'skillset' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800 mb-1">Access permissions</h4>
              <p className="text-slate-500 mb-4">
                Control who can view, tag, upgrade, and delete Skill Set
              </p>
              <table className="w-full max-w-2xl text-left border-collapse border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4" />
                    <th className="py-2.5 px-4 text-center">View</th>
                    <th className="py-2.5 px-4 text-center">Tag</th>
                    <th className="py-2.5 px-4 text-center">Upgrade</th>
                    <th className="py-2.5 px-4 text-center">Delete</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {['Employee (for self)', 'Reporting Manager', 'Department head'].map((role) => {
                    const rowPerm = skillPermissions[role] || { view: false, tag: false, upgrade: false, del: false };
                    const togglePerm = (permKey) => {
                      const next = {
                        ...skillPermissions,
                        [role]: { ...rowPerm, [permKey]: !rowPerm[permKey] },
                      };
                      setSkillPermissions(next);
                      triggerSaved({ skillPermissions: next });
                    };
                    return (
                      <tr key={role}>
                        <td className="py-3 px-4 font-medium text-slate-700">{role}</td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(rowPerm.view)}
                            onChange={() => togglePerm('view')}
                            className="rounded text-[#0088ff]"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(rowPerm.tag)}
                            onChange={() => togglePerm('tag')}
                            className="rounded text-[#0088ff]"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(rowPerm.upgrade)}
                            onChange={() => togglePerm('upgrade')}
                            className="rounded text-[#0088ff]"
                          />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={Boolean(rowPerm.del)}
                            onChange={() => togglePerm('del')}
                            className="rounded text-[#0088ff]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Skill levels Table (01:23 of hr2.webm) */}
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800 mb-1">Skill levels</h4>
              <p className="text-slate-500 mb-4">
                Skill levels help measure and track employee proficiency in each skill
              </p>
              <table className="w-full max-w-lg text-left border-collapse border border-slate-200 mb-3">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-4">Level</th>
                    <th className="py-2 px-4">Color</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {skillLevels.map((sl) => (
                    <tr key={sl.level}>
                      <td className="py-2.5 px-4 text-slate-700">{sl.level}</td>
                      <td className="py-2.5 px-4">
                        <span
                          className="inline-block w-6 h-6 rounded"
                          style={{ backgroundColor: sl.color }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() => {
                  const next = [
                    ...skillLevels,
                    { level: skillLevels.length + 1, color: '#60a5fa' },
                  ];
                  setSkillLevels(next);
                  triggerSaved({ skillLevels: next });
                }}
                className="px-3 py-1.5 bg-blue-50 text-[#0088ff] font-medium rounded"
              >
                Add Level
              </button>
            </div>

            {/* Potential Ranges Table */}
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-slate-800">Potential</h4>
                <button
                  type="button"
                  onClick={() => triggerSaved({ potentialRanges })}
                  className="px-3 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                >
                  Save Ranges
                </button>
              </div>
              <p className="text-slate-500 mb-4">
                An employee's overall potential is derived from the combined weightage of their
                Skill Set and skill level. Potential is used as the input for the nine-box matrix.
              </p>
              <table className="w-full max-w-xl text-left border-collapse border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4">Potential</th>
                    <th className="py-2.5 px-4">Range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {potentialRanges.map((r, idx) => (
                    <tr key={r.label}>
                      <td className="py-2.5 px-4 text-slate-700 font-medium">{r.label}</td>
                      <td className="py-2.5 px-4 flex items-center gap-2">
                        <input
                          type="number"
                          value={r.min}
                          onChange={(e) => {
                            const next = [...potentialRanges];
                            next[idx] = { ...r, min: Number(e.target.value) };
                            setPotentialRanges(next);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-center"
                        />
                        <span className="text-slate-400">%</span>
                        <input
                          type="number"
                          value={r.max}
                          onChange={(e) => {
                            const next = [...potentialRanges];
                            next[idx] = { ...r, max: Number(e.target.value) };
                            setPotentialRanges(next);
                          }}
                          className="w-16 px-2 py-1 border border-slate-200 rounded text-center ml-2"
                        />
                        <span className="text-slate-400">%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: COMPETENCY (01:32 of hr2.webm) */}
        {settingsTab === 'competency' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Competency</h3>
            <p className="text-slate-500">
              Competency is the combination of knowledge, skills, abilities, and personal
              attributes that contribute to enhanced employee performance
            </p>
            <div className="flex items-start gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const nextVal = !compWeightEnabled;
                  setCompWeightEnabled(nextVal);
                  triggerSaved({ compWeightEnabled: nextVal });
                }}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  compWeightEnabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    compWeightEnabled ? 'translate-x-4' : ''
                  }`}
                />
              </button>
              <div>
                <p className="font-semibold text-slate-800">Weight</p>
                <p className="text-slate-500 mt-0.5">
                  A value that distinguishes the Competency level's importance. Competency with a
                  weight of 90, for instance, is more significant than one with a weight of 30.
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2.5 pt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compWeightCapEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setCompWeightCapEnabled(val);
                  triggerSaved({ compWeightCapEnabled: val });
                }}
                className="rounded text-[#0088ff]"
              />
              <span className="font-medium text-slate-700">
                Total weightage of tagged Competency must not exceed 100%
              </span>
            </label>
          </div>
        )}

        {/* TAB 7: SALARY -> CLICK HERE TO CONFIGURE COMPENSATION MODULE (01:37 - 01:50 of hr2.webm) */}
        {settingsTab === 'salary' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl">
            <h3 className="text-sm font-semibold text-slate-800">Salary</h3>
            <p className="text-slate-500 mt-1 mb-4">
              Salary is the compensation given to employees from the organization for performing
              their job. Manage employee salary in the compensation service.
            </p>
            <p className="text-slate-700">
              <button
                type="button"
                onClick={() => setActiveTab && setActiveTab('payroll')}
                className="text-[#0088ff] hover:underline font-medium mr-1"
              >
                Click here
              </button>
              to configure compensation module
            </p>
          </div>
        )}

        {/* TAB 8: APPRAISAL TEMPLATES */}
        {settingsTab === 'templates' && (
          <div className="space-y-4 max-w-5xl">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setTplModal({ id: '', title: '', itemsText: 'Self Appraisal, Manager Review' })
                }
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded shadow-2xs"
              >
                Create Template
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {appraisalTemplates.map((tpl) => (
                <div
                  key={tpl.id || tpl.title}
                  className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className={`${tpl.headerBg || 'bg-[#3b82f6]'} text-white px-5 py-3 font-semibold text-xs`}>
                      {tpl.title}
                    </div>
                    <div className="p-5 space-y-2.5">
                      {tpl.items.map((it) => (
                        <div key={it} className="flex items-center gap-2 text-slate-700">
                          <span className="w-4 h-4 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-[10px]">
                            ✓
                          </span>
                          <span>{it}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTopContextTab && setTopContextTab('appraisals')}
                        className="px-3 py-1 border border-blue-200 text-[#0088ff] rounded hover:bg-blue-50"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setTplModal({
                            id: tpl.id,
                            title: tpl.title,
                            itemsText: tpl.items.join(', '),
                          })
                        }
                        className="px-3 py-1 border border-blue-200 text-[#0088ff] rounded hover:bg-blue-50"
                      >
                        Edit
                      </button>
                    </div>
                    {appraisalTemplates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = appraisalTemplates.filter((t) => (t.id || t.title) !== (tpl.id || tpl.title));
                          setAppraisalTemplates(next);
                          triggerSaved({ appraisalTemplates: next });
                        }}
                        className="text-[11px] text-rose-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 9: APPRAISAL REVIEW */}
        {settingsTab === 'review' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800 mb-1">Order of sections</h4>
              <p className="text-slate-500 mb-4">
                Arrange the sections in the order you want them to appear during review.
              </p>
              <div className="space-y-2 max-w-md">
                {sectionOrder.map((sec, idx) => (
                  <div
                    key={sec}
                    className="px-3.5 py-2.5 border border-slate-200 rounded bg-white text-slate-700 font-medium flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400">⋮⋮</span>
                      <span>{sec}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px]">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          const next = [...sectionOrder];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          setSectionOrder(next);
                          triggerSaved({ sectionOrder: next });
                        }}
                        className="px-2 py-0.5 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === sectionOrder.length - 1}
                        onClick={() => {
                          const next = [...sectionOrder];
                          [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                          setSectionOrder(next);
                          triggerSaved({ sectionOrder: next });
                        }}
                        className="px-2 py-0.5 border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-slate-800">Multi-Rater types</h4>
                <button
                  type="button"
                  onClick={() => triggerSaved({ multiRaterTypes })}
                  className="px-3 py-1 bg-[#0088ff] text-white rounded text-[11px] font-medium"
                >
                  Save Multi-Rater Types
                </button>
              </div>
              <p className="text-slate-500 mb-4">
                Enter the common types of multi-raters who participate in the appraisal review.
              </p>
              <div className="space-y-2.5 max-w-xl">
                {multiRaterTypes.map((mr, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4">
                    <input
                      type="text"
                      value={mr.label}
                      onChange={(e) => {
                        const next = [...multiRaterTypes];
                        next[idx] = { ...mr, label: e.target.value };
                        setMultiRaterTypes(next);
                      }}
                      className="flex-1 px-3 py-2 border border-slate-200 rounded text-slate-700"
                    />
                    <input
                      type="checkbox"
                      checked={Boolean(mr.enabled)}
                      onChange={(e) => {
                        const next = [...multiRaterTypes];
                        next[idx] = { ...mr, enabled: e.target.checked };
                        setMultiRaterTypes(next);
                        triggerSaved({ multiRaterTypes: next });
                      }}
                      className="rounded text-[#0088ff]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 10: INTEGRATION (05:30 - 05:37 of hr2.webm) */}
        {settingsTab === 'integration' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">
                Attendance and leave metrics in performance review
              </h4>
              <p className="text-slate-500 mt-1 mb-3">
                Enable this option to include attendance and leave metrics while creating a
                performance appraisal cycle.
              </p>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attendanceMetricsInReview}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setAttendanceMetricsInReview(val);
                    triggerSaved({ attendanceMetricsInReview: val });
                  }}
                  className="rounded text-[#0088ff]"
                />
                <span className="font-medium text-slate-700">
                  Attendance and leave metrics in performance
                </span>
              </label>
            </div>
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">OKR data in performance review</h4>
              <p className="text-slate-500 mt-1 mb-3">
                Enable this option to include OKRs as a quantitative parameter in the performance
                appraisal cycle.
              </p>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={okrInReview}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setOkrInReview(val);
                    triggerSaved({ okrInReview: val });
                  }}
                  className="rounded text-[#0088ff]"
                />
                <span className="font-medium text-slate-700">OKR in appraisal cycle</span>
              </label>
            </div>
          </div>
        )}

        {/* TAB 11: CONTINUOUS REVIEW */}
        {settingsTab === 'continuous' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <h4 className="font-semibold text-slate-800">Continuous Review</h4>
              <p className="text-slate-500 mt-1 mb-3">
                A recurring review that can supplement the appraisal cycle with ongoing, year-round
                reviews.
              </p>
              <button
                type="button"
                onClick={() => {
                  const next = !continuousEnabled;
                  setContinuousEnabled(next);
                  triggerSaved({ continuousEnabled: next });
                }}
                className={`w-9 h-5 rounded-full transition-colors p-0.5 ${
                  continuousEnabled ? 'bg-[#0088ff]' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    continuousEnabled ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </div>

            <div className="bg-white rounded-md border border-slate-200 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 space-y-4">
                <h4 className="font-semibold text-slate-800">Configure Review</h4>
                <div>
                  <label className="block text-slate-600 mb-1">
                    How frequently must the review happen?
                  </label>
                  <select
                    value={continuousFrequency}
                    onChange={(e) => {
                      setContinuousFrequency(e.target.value);
                      triggerSaved({ continuousFrequency: e.target.value });
                    }}
                    className="w-64 px-3 py-2 border border-slate-200 rounded bg-white"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Rating type</label>
                  <select
                    value={continuousRatingType}
                    onChange={(e) => {
                      setContinuousRatingType(e.target.value);
                      triggerSaved({ continuousRatingType: e.target.value });
                    }}
                    className="w-64 px-3 py-2 border border-slate-200 rounded bg-white"
                  >
                    <option value="Numbers (0 to 5)">Numbers (0 to 5)</option>
                    <option value="Stars (1 to 6)">Stars (1 to 6)</option>
                  </select>
                </div>
              </div>
              <div className="lg:col-span-5 bg-[#fff8eb] border border-amber-200 rounded-md p-4 space-y-2 text-[11px] text-slate-600">
                <p className="font-semibold text-amber-700">Applicable for Review</p>
                <p>
                  If applicable Goals are set to be fetched from the 1st day of a particular month
                  to the last day, then all Goals created within that month are included for review.
                </p>
                <p className="font-semibold text-amber-700 pt-2">Self Review & Manager Review</p>
                <p>
                  When the review period is set to start on the 6th of every month, reviewers can
                  provide ratings between the 6th and 9th of that month.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 12: REPORTS & NINE BOX MATRIX */}
        {settingsTab === 'reports' && (
          <div className="space-y-4 max-w-5xl">
            <div className="bg-white rounded-md border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-1">
                <h4 className="font-semibold text-slate-800">Nine box matrix</h4>
                <button
                  type="button"
                  onClick={() => triggerSaved({ nineBoxTerms })}
                  className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded text-xs font-medium"
                >
                  Save Matrix Terms
                </button>
              </div>
              <p className="text-slate-500 mb-4">
                A report that represents employee potential and performance in a nine box grid.
                Rename the default category names with familiar terms used in your organization:
              </p>
              <div className="border border-slate-200 rounded divide-y divide-slate-100 max-w-2xl">
                {nineBoxTerms.map((item, idx) => (
                  <div key={item.key} className="grid grid-cols-12 items-center p-2.5 gap-3">
                    <span className="col-span-6 text-slate-600 pl-2">{item.key}</span>
                    <input
                      type="text"
                      value={item.val}
                      onChange={(e) => {
                        const next = [...nineBoxTerms];
                        next[idx].val = e.target.value;
                        setNineBoxTerms(next);
                      }}
                      className="col-span-6 px-3 py-1.5 border border-slate-200 rounded text-slate-800"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 13: RENAME TERMS */}
        {settingsTab === 'renameterms' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl">
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-slate-800">Rename Terms</h4>
              <button
                type="button"
                onClick={() => triggerSaved({ renameTerms })}
                className="px-3.5 py-1.5 bg-[#0088ff] text-white rounded text-xs font-medium"
              >
                Save Term Labels
              </button>
            </div>
            <p className="text-slate-500 mb-4">
              Rename a term with familiar terms used in your organization. All related tab names
              will also be changed.
            </p>
            <div className="border border-slate-200 rounded divide-y divide-slate-100 max-w-xl">
              {renameTerms.map((rt, idx) => (
                <div key={rt.key} className="grid grid-cols-12 items-center p-2.5 gap-3">
                  <span className="col-span-5 text-slate-600 pl-2">{rt.key}</span>
                  <input
                    type="text"
                    value={rt.val}
                    onChange={(e) => {
                      const next = [...renameTerms];
                      next[idx].val = e.target.value;
                      setRenameTerms(next);
                    }}
                    className="col-span-7 px-3 py-1.5 border border-slate-200 rounded text-slate-800"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 14: E-SIGNATURE (06:19 - 06:29 of hr2.webm) */}
        {settingsTab === 'esignature' && (
          <div className="bg-white rounded-md border border-slate-200 p-6 max-w-5xl">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-slate-800">Appraisal letter e-sign flow</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setESignConfirmOpen(true)}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setESignChecked(false)}
                  className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
                >
                  Reset
                </button>
              </div>
            </div>
            <p className="text-slate-500 mb-4">
              Enable or disable e-signature functionality for appraisal letters. This feature
              allows you to configure the e-sign process for appraisal letters when creating the
              appraisal cycle.
            </p>
            <label className="inline-flex items-center gap-2.5 p-3 border border-slate-200 rounded cursor-pointer">
              <input
                type="checkbox"
                checked={eSignChecked}
                onChange={(e) => setESignChecked(e.target.checked)}
                className="rounded text-[#0088ff]"
              />
              <span className="font-medium text-slate-700">E-signature for appraisal letters</span>
            </label>
          </div>
        )}
      </div>

      {/* E-Signature Confirm Dialog (06:24 of hr2.webm) */}
      {eSignConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/30">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 p-6 max-w-md w-full text-center animate-fadeIn">
            <h4 className="text-sm font-semibold text-slate-800 mb-2">
              Enable e-signature for appraisal letters?
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              Note : If a user who is not an e-sign application administrator sends or recalls an
              e-sign document, a token from the integrated e-sign application administrator's
              account will be used.
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setESignConfirmOpen(false);
                  setESignErrorBanner(false);
                  triggerSaved({ eSignChecked });
                  notify(`E-signature workflow ${eSignChecked ? 'enabled' : 'disabled'} and persisted.`);
                }}
                className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white text-xs font-medium rounded"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setESignConfirmOpen(false)}
                className="px-4 py-1.5 border border-slate-300 text-slate-700 text-xs font-medium rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {tplModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 p-5 max-w-md w-full space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-semibold text-slate-800">
                {tplModal.id ? 'Edit Appraisal Template' : 'Create Appraisal Template'}
              </h4>
              <button type="button" onClick={() => setTplModal(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const items = tplModal.itemsText
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean);
                let next;
                if (tplModal.id) {
                  next = appraisalTemplates.map((t) =>
                    t.id === tplModal.id ? { ...t, title: tplModal.title.trim(), items } : t
                  );
                } else {
                  next = [
                    ...appraisalTemplates,
                    {
                      id: `tpl-${Date.now()}`,
                      title: tplModal.title.trim(),
                      headerBg: 'bg-[#0088ff]',
                      items: items.length ? items : ['Self Appraisal', 'Manager Review'],
                    },
                  ];
                }
                setAppraisalTemplates(next);
                triggerSaved({ appraisalTemplates: next });
                setTplModal(null);
              }}
              className="space-y-3"
            >
              <div>
                <label className="block font-medium text-slate-600 mb-1">Template Title</label>
                <input
                  required
                  value={tplModal.title}
                  onChange={(e) => setTplModal({ ...tplModal, title: e.target.value })}
                  placeholder="e.g. Executive Partner Annual Review"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Review Stages (comma-separated)</label>
                <input
                  required
                  value={tplModal.itemsText}
                  onChange={(e) => setTplModal({ ...tplModal, itemsText: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setTplModal(null)} className="px-3.5 py-1.5 border border-slate-300 rounded">Cancel</button>
                <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white rounded font-medium">Save Template</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
