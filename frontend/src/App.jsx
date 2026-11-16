import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';
import LoginView from './views/LoginView';
import MyWorkspaceView from './views/MyWorkspaceView';
import TaskInboxView from './views/TaskInboxView';
import WorkforceDirectoryView from './views/WorkforceDirectoryView';
import PayrollView from './views/PayrollView';
import PerformanceView from './views/PerformanceView';
import GovernanceView from './views/GovernanceView';
import IntegrationsSecurityView from './views/IntegrationsSecurityView';
import ReportsView from './views/ReportsView';
import LeaveRequestModal, {
  findOverlappingLeaveRequests,
  getNextAvailableLeaveWindow,
} from './views/modals/LeaveRequestModal';
import UnexpectedAbsenceModal from './views/modals/UnexpectedAbsenceModal';
import WhistleblowerModal from './views/modals/WhistleblowerModal';
import PayslipModal from './views/modals/PayslipModal';
import { apiGet, apiPost, apiPatch, apiDownload, unwrapList, setCsrfToken, setAuthToken } from './utils/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);

  const [activeTab, setActiveTab] = useState('workspace');
  const [topContextTab, setTopContextTab] = useState('myspace');
  const [subViewHint, setSubViewHint] = useState(null);

  const [toast, setToast] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Domain Data State
  const [employees, setEmployees] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLedger, setLeaveLedger] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [payPeriods, setPayPeriods] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [salaryStructures, setSalaryStructures] = useState([]);
  const [performanceCycles, setPerformanceCycles] = useState([]);
  const [appraisals, setAppraisals] = useState([]);
  const [pips, setPips] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [erCases, setErCases] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);

  // Modals State
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveTypeCode: 'ANNUAL',
    startDate: '2026-11-16',
    endDate: '2026-11-18',
    isHalfDay: false,
    halfDayType: 'MORNING',
    handoverNotes: '',
    handoverEmployeeId: '',
    evidenceDocumentId: '',
    evidenceFileName: '',
    editingRequestId: null,
    linkedAbsenceId: null,
    targetEmployeeId: '',
  });
  const [absenceModalOpen, setAbsenceModalOpen] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({
    employeeId: '',
    startDate: '2026-11-13',
    endDate: '2026-11-13',
    reasonCategory: 'SICKNESS',
    contactChannel: 'PHONE',
    notes: '',
  });
  const [whistleblowerModalOpen, setWhistleblowerModalOpen] = useState(false);
  const [wbSubmissionResult, setWbSubmissionResult] = useState(null);
  const [wbTrackingResult, setWbTrackingResult] = useState(null);
  const [payslipModalOpen, setPayslipModalOpen] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  // MFA Setup Modal State
  const [mfaModalOpen, setMfaModalOpen] = useState(false);
  const [mfaSetupData, setMfaSetupData] = useState(null);
  const [mfaCodeInput, setMfaCodeInput] = useState('');

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  const handleSelectModule = (nextTab, nextTopTab = null, nextSubView = null) => {
    const normalizedTab = nextTab === 'leave' ? 'inbox' : nextTab;
    setActiveTab(normalizedTab);
    setSubViewHint(nextSubView || null);
    const defaultTopMap = {
      workspace: 'myspace',
      directory: 'onboarding',
      inbox: 'mydata',
      timetracker: 'mydata',
      attendance: 'mydata',
      performance: 'gettingstarted',
      okr: 'appraisals',
      payroll: 'compensation',
      hrletters: 'addressproof',
      admin: 'files',
      engagement: 'engagement',
      travel: 'travel',
      tasks: 'tasks',
      operations: 'operations',
      reports: 'myreports',
      hardening: 'orgsettings',
    };
    const resolvedTop = nextTopTab || defaultTopMap[normalizedTab];
    if (resolvedTop) {
      setTopContextTab(resolvedTop);
    }
  };

  const fetchAllData = useCallback(async (userOverride = null) => {
    const perms = new Set(userOverride?.permissions || []);
    const canViewEmployees =
      perms.size === 0 || perms.has('employees.view') || perms.has('employees.view_team');
    const canViewPayrollRuns = perms.size === 0 || perms.has('payroll.reports.view');
    const endpoints = [
      ...(canViewEmployees ? [['/api/v1/employees?limit=100', setEmployees]] : []),
      ['/api/v1/leave/balances', setLeaveBalances],
      ['/api/v1/leave/requests', setLeaveRequests],
      ['/api/v1/leave/ledger', setLeaveLedger],
      ['/api/v1/leave/holidays', setHolidays],
      ['/api/v1/absences', setAbsences],
      ['/api/v1/tasks/inbox', setTasks],
      ['/api/v1/notifications', setNotifications],
      ['/api/v1/payroll/periods', setPayPeriods],
      ...(canViewPayrollRuns ? [['/api/v1/payroll/runs', setPayrollRuns]] : []),
      ['/api/v1/payroll/slips/me', setPayslips],
      ['/api/v1/payroll/pay-groups', setSalaryStructures],
      ['/api/v1/performance/cycles', setPerformanceCycles],
      ['/api/v1/performance/appraisals', setAppraisals],
      ['/api/v1/performance/pips', setPips],
      ['/api/v1/governance/policies', setPolicies],
      ['/api/v1/governance/training/my-assignments', setTrainings],
      ['/api/v1/er/cases', setErCases],
      ['/api/v1/audit-logs?limit=100', setAuditLogs],
    ];

    const results = await Promise.all(
      endpoints.map(async ([url, setter]) => {
        try {
          const data = await apiGet(url);
          const list = unwrapList(data);
          setter(list);
          return [url, list];
        } catch (_e) {
          return [url, []];
        }
      })
    );

    const empResult = results.find(([u]) => u.startsWith('/api/v1/employees'));
    const empList = empResult ? empResult[1] : [];
    const balResult = results.find(([u]) => u.startsWith('/api/v1/leave/balances'));
    const balList = balResult ? balResult[1] : [];
    const reqResult = results.find(([u]) => u.startsWith('/api/v1/leave/requests'));
    const reqList = reqResult ? reqResult[1] : [];
    setCurrentUser((prev) => {
      const target = userOverride || prev;
      if (!target) return target;
      const matched = empList.find(
        (emp) => emp.workEmail?.toLowerCase() === target.email?.toLowerCase()
      );
      if (matched) {
        return {
          ...target,
          employeeId: matched.id,
          fullName: matched.fullName || `${matched.firstName} ${matched.lastName}`,
        };
      }
      const inferredEmpId =
        target.employeeId || balList[0]?.employeeId || reqList[0]?.employeeId || null;
      return inferredEmpId ? { ...target, employeeId: inferredEmpId } : target;
    });
  }, []);

  const hydrateSession = useCallback(async () => {
    setAuthChecking(true);
    try {
      const me = await apiGet('/api/v1/auth/me');
      if (!me?.user) {
        setCurrentUser(null);
        setAuthToken(null);
        setCsrfToken(null);
        return;
      }
      if (me?.csrfToken) setCsrfToken(me.csrfToken);
      const userObj = {
        ...me.user,
        fullName: me.user?.name || me.user?.email,
        role: me.roles?.[0] || 'EMPLOYEE',
        roles: me.roles || [],
        permissions: me.permissions || [],
      };
      setCurrentUser(userObj);
      await fetchAllData(userObj);
    } catch (_err) {
      setCurrentUser(null);
      setAuthToken(null);
      setCsrfToken(null);
    } finally {
      setAuthChecking(false);
    }
  }, [fetchAllData]);

  useEffect(() => {
    hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    const onUnauthorized = () => {
      setAuthToken(null);
      setCsrfToken(null);
      setCurrentUser((prev) => {
        if (prev) {
          showToast(
            'Your session expired — please sign in again. Your draft has been saved locally.',
            'error',
          );
        }
        return null;
      });
    };
    window.addEventListener('ndakala:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ndakala:unauthorized', onUnauthorized);
  }, [showToast]);

  const handleLogin = async (emailArg, passwordArg, mfaCodeArg) => {
    if (emailArg && typeof emailArg === 'object' && emailArg.preventDefault) {
      emailArg.preventDefault();
    }
    const targetEmail = (typeof emailArg === 'string' ? emailArg : loginEmail).trim();
    const targetPassword = typeof passwordArg === 'string' ? passwordArg : loginPassword;
    const targetMfa = typeof mfaCodeArg === 'string' ? mfaCodeArg.trim() : undefined;

    if (!targetEmail || !targetPassword) {
      setLoginError('Please enter both your email address and password.');
      return { ok: false };
    }

    setLoginEmail(targetEmail);
    setLoginPassword(targetPassword);
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await apiPost('/api/v1/auth/login', {
        email: targetEmail,
        password: targetPassword,
        ...(targetMfa ? { mfaCode: targetMfa } : {}),
      });
      if (data.mfaRequired) {
        return { mfaRequired: true };
      }
      if (data.token) setAuthToken(data.token);
      if (data.csrfToken) setCsrfToken(data.csrfToken);
      setLoginPassword('');
      await hydrateSession();
      showToast('Signed in to Ndakala Advisory LLP Portal.');
      return { ok: true };
    } catch (err) {
      const msg = err?.message || 'Invalid email or password';
      setLoginError(msg);
      showToast(msg, 'error');
      return { ok: false, error: msg };
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiPost('/api/v1/auth/logout', {});
    } catch (_err) {
      // Ignore if session already expired
    }
    setAuthToken(null);
    setCsrfToken(null);
    setCurrentUser(null);
    setLoginEmail('');
    setLoginPassword('');
    setLoginError('');
    setEmployees([]);
    setLeaveRequests([]);
    showToast('Signed out cleanly.');
  };

  const handleOpenLeaveModal = (prefill = null) => {
    const isDomEvent = prefill && typeof prefill.preventDefault === 'function';
    const override = !isDomEvent && prefill && typeof prefill === 'object' ? prefill : null;
    if (override) {
      setLeaveForm((prev) => ({
        ...prev,
        leaveTypeCode: override.leaveTypeCode || 'ANNUAL',
        startDate: override.startDate || prev.startDate,
        endDate: override.endDate || prev.endDate,
        isHalfDay: Boolean(override.isHalfDay),
        halfDayType: override.halfDayType || 'MORNING',
        handoverNotes: override.handoverNotes || '',
        handoverEmployeeId: override.handoverEmployeeId || '',
        evidenceDocumentId: override.evidenceDocumentId || '',
        evidenceFileName: override.evidenceFileName || '',
        editingRequestId: override.editingRequestId || null,
        linkedAbsenceId: override.linkedAbsenceId || null,
        targetEmployeeId: override.targetEmployeeId || '',
      }));
      setLeaveModalOpen(true);
      return;
    }

    const targetEmployeeId = currentUser?.employeeId || employees[0]?.id;
    const overlaps = findOverlappingLeaveRequests(
      leaveRequests,
      targetEmployeeId,
      leaveForm.startDate,
      leaveForm.endDate
    );
    const nextWindow =
      overlaps.length > 0
        ? getNextAvailableLeaveWindow(leaveRequests, targetEmployeeId, leaveForm.startDate)
        : null;
    setLeaveForm((prev) => ({
      ...prev,
      ...(nextWindow ? { startDate: nextWindow.startDate, endDate: nextWindow.endDate } : {}),
      isHalfDay: false,
      halfDayType: 'MORNING',
      evidenceDocumentId: '',
      evidenceFileName: '',
      editingRequestId: null,
      linkedAbsenceId: null,
      targetEmployeeId: '',
    }));
    setLeaveModalOpen(true);
  };

  const handleSubmitLeave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    try {
      const targetEmployeeId =
        leaveForm.targetEmployeeId || currentUser?.employeeId || employees[0]?.id;
      const fallbackColleague = employees.find((emp) => emp.id !== targetEmployeeId)?.id;
      const isSingleDay = leaveForm.startDate === leaveForm.endDate;
      const effectiveHalfDay = Boolean(leaveForm.isHalfDay && isSingleDay);

      if (leaveForm.editingRequestId) {
        await apiPost(`/api/v1/leave/requests/${leaveForm.editingRequestId}/resubmit`, {
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          isHalfDay: effectiveHalfDay,
          halfDayType: effectiveHalfDay ? leaveForm.halfDayType || 'MORNING' : null,
          reason: leaveForm.handoverNotes || 'Revised leave application via portal',
          handoverNotes: leaveForm.handoverNotes || undefined,
          handoverEmployeeId: leaveForm.handoverEmployeeId || fallbackColleague || undefined,
          ...(leaveForm.evidenceDocumentId
            ? { evidenceDocumentId: leaveForm.evidenceDocumentId }
            : {}),
        });
        setLeaveModalOpen(false);
        showToast('Leave request revised and resubmitted.');
      } else {
        const submitted = await apiPost('/api/v1/leave/requests', {
          ...(targetEmployeeId ? { employeeId: targetEmployeeId } : {}),
          leaveTypeCode: leaveForm.leaveTypeCode || 'ANNUAL',
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          isHalfDay: effectiveHalfDay,
          halfDayType: effectiveHalfDay ? leaveForm.halfDayType || 'MORNING' : null,
          reason: leaveForm.handoverNotes || 'Leave application via portal',
          handoverNotes: leaveForm.handoverNotes || undefined,
          handoverEmployeeId: leaveForm.handoverEmployeeId || fallbackColleague || undefined,
          ...(leaveForm.evidenceDocumentId
            ? { evidenceDocumentId: leaveForm.evidenceDocumentId }
            : {}),
          ...(leaveForm.linkedAbsenceId
            ? {
                isRetrospective: true,
                retrospectiveReason: leaveForm.handoverNotes || 'Converted from unexpected absence',
              }
            : {}),
          replaceOverlapping: true,
        });

        if (leaveForm.linkedAbsenceId && submitted?.request?.id) {
          await apiPost(`/api/v1/absences/${leaveForm.linkedAbsenceId}/review`, {
            status: 'RETROSPECTIVE_LEAVE_REQUESTED',
            linkedLeaveRequestId: submitted.request.id,
            notes: `Linked to ${submitted.request.requestNumber}`,
          }).catch(() => {});
        }
        setLeaveModalOpen(false);
        showToast('Leave request submitted successfully.');
      }

      const nextWindow = getNextAvailableLeaveWindow(
        [
          ...leaveRequests,
          {
            employeeId: targetEmployeeId,
            status: 'PENDING_APPROVAL',
            startDate: leaveForm.startDate,
            endDate: leaveForm.endDate,
          },
        ],
        targetEmployeeId,
        leaveForm.startDate
      );
      setLeaveForm((prev) => ({
        ...prev,
        startDate: nextWindow.startDate,
        endDate: nextWindow.endDate,
        isHalfDay: false,
        halfDayType: 'MORNING',
        handoverNotes: '',
        evidenceDocumentId: '',
        evidenceFileName: '',
        editingRequestId: null,
        linkedAbsenceId: null,
        targetEmployeeId: '',
      }));
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to submit leave request', 'error');
    }
  };

  const handleReviewLeave = async (id, decision, customComments = '') => {
    try {
      const defaultComments =
        decision === 'APPROVE'
          ? 'Approved via portal'
          : decision === 'RETURN'
          ? 'Returned for updates via portal'
          : 'Rejected via portal';
      await apiPost(`/api/v1/leave/requests/${id}/review`, {
        decision,
        comments: (customComments || '').trim().length >= 3 ? customComments.trim() : defaultComments,
      });
      const verb =
        decision === 'APPROVE' ? 'approved' : decision === 'RETURN' ? 'returned' : 'rejected';
      showToast(`Leave request ${verb}.`);
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Unable to review leave request', 'error');
    }
  };

  const handleCreateHoliday = async (holidayPayload) => {
    try {
      await apiPost('/api/v1/leave/holidays', holidayPayload);
      showToast('Public holiday registered.');
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to register holiday', 'error');
    }
  };

  const handleCreateEmployee = async (payload) => {
    try {
      await apiPost('/api/v1/employees', payload);
      showToast('Employee profile created.');
      await fetchAllData();
      return true;
    } catch (err) {
      showToast(err?.message || 'Failed to create employee', 'error');
      return false;
    }
  };

  const handleConfirmProbation = async (
    probationId,
    decision = 'CONFIRMED',
    decisionReason = 'Completed probation evaluation in HR portal',
  ) => {
    try {
      await apiPost(`/api/v1/employees/probation/${probationId}/decision`, {
        decision,
        decisionReason: (decisionReason || '').trim().length >= 5
          ? decisionReason.trim()
          : 'Completed probation evaluation in HR portal',
      });
      showToast(`Probation ${decision.toLowerCase()} recorded.`);
      await fetchAllData();
      return true;
    } catch (err) {
      showToast(err?.message || 'Failed to submit probation decision', 'error');
      return false;
    }
  };

  const handleTransitionEmployeeStatus = async (employeeId, newStatus, reason = 'Status updated by HR Admin') => {
    try {
      await apiPost(`/api/v1/employees/${employeeId}/status`, {
        newStatus,
        reason,
      });
      showToast(`Employee transitioned to ${newStatus}.`);
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to transition employee status', 'error');
    }
  };

  const handleSubmitAbsence = async (form) => {
    try {
      await apiPost('/api/v1/absences', {
        employeeId: form.employeeId || currentUser?.employeeId || employees[0]?.id,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        reasonCategory: form.reasonCategory || 'SICKNESS',
        contactChannel: form.contactChannel || 'PHONE',
        notes: form.notes || undefined,
      });
      setAbsenceModalOpen(false);
      showToast('Unexpected absence logged and manager notified.');
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to record unexpected absence', 'error');
    }
  };

  const handleSubmitWhistleblower = async (form) => {
    try {
      const payload = {
        title: form.title,
        allegationSummary: form.allegationSummary,
        ...(form.policyClausesCited ? { policyClausesCited: form.policyClausesCited } : {}),
        ...(form.voluntaryContactName ? { voluntaryContactName: form.voluntaryContactName } : {}),
        ...(form.voluntaryContactEmail ? { voluntaryContactEmail: form.voluntaryContactEmail } : {}),
      };
      const res = await apiPost('/api/v1/er/cases/whistleblower/anonymous', payload);
      setWbSubmissionResult(res);
      showToast('Confidential disclosure submitted.');
    } catch (err) {
      showToast(err?.message || 'Failed to submit whistleblower report', 'error');
    }
  };

  const handleTrackWhistleblower = async (token) => {
    try {
      const res = await apiGet(`/api/v1/er/cases/whistleblower/track/${encodeURIComponent(token.trim())}`);
      setWbTrackingResult(res);
    } catch (err) {
      showToast(err?.message || 'Invalid or unknown tracking token', 'error');
    }
  };

  const handleAcknowledgePolicy = async (ackId) => {
    try {
      await apiPost(`/api/v1/governance/policies/acknowledgements/${ackId}/acknowledge`, {});
      showToast('Policy formally acknowledged.');
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to acknowledge policy', 'error');
    }
  };

  const handleCompleteTraining = async (assignmentId) => {
    try {
      await apiPost(`/api/v1/governance/training/assignments/${assignmentId}/complete`, { scorePercent: 100, passed: true });
      showToast('Training module marked complete.');
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to complete training', 'error');
    }
  };

  const handleMarkNotificationRead = async (id) => {
    try {
      await apiPatch(`/api/v1/notifications/${id}/read`, {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
      );
    } catch (err) {
      showToast(err?.message || 'Failed to mark notification read', 'error');
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const unread = notifications.filter((n) => !n.readAt);
    await Promise.all(
      unread.map((n) => apiPatch(`/api/v1/notifications/${n.id}/read`, {}).catch(() => null))
    );
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
  };

  const handleRetryNotification = async (id) => {
    try {
      await apiPost(`/api/v1/notifications/${id}/retry`, {});
      showToast('Notification queued for retry.');
      await fetchAllData();
    } catch (err) {
      showToast(err?.message || 'Failed to retry notification', 'error');
    }
  };

  const handleOpenMfaSetup = async () => {
    setMfaModalOpen(true);
    setMfaCodeInput('');
    try {
      const setup = await apiPost('/api/v1/auth/mfa/setup', {});
      setMfaSetupData(setup);
    } catch (err) {
      showToast(err?.message || 'Unable to initiate MFA setup', 'error');
    }
  };

  const handleActivateMfa = async (e) => {
    e.preventDefault();
    try {
      await apiPost('/api/v1/auth/mfa/activate', {
        secret: mfaSetupData?.secret,
        code: mfaCodeInput.trim(),
      });
      showToast('Two-Factor Authentication (TOTP MFA) enabled.');
      setMfaModalOpen(false);
      await hydrateSession();
    } catch (err) {
      showToast(err?.message || 'Invalid MFA verification code', 'error');
    }
  };

  if (authChecking) {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center bg-[#07221a] text-emerald-100 gap-3"
        style={{
          background: 'linear-gradient(135deg, #06281e 0%, #0b3b2c 45%, #07221a 100%)',
        }}
      >
        <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-emerald-100/85 font-medium">Restoring Ndakala People session...</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <LoginView
          loginEmail={loginEmail}
          setLoginEmail={setLoginEmail}
          loginPassword={loginPassword}
          setLoginPassword={setLoginPassword}
          onLogin={handleLogin}
          loading={loginLoading}
          loginError={loginError}
          setLoginError={setLoginError}
          onShowToast={showToast}
          onOpenWhistleblower={() => setWhistleblowerModalOpen(true)}
        />
        <WhistleblowerModal
          isOpen={whistleblowerModalOpen}
          onClose={() => setWhistleblowerModalOpen(false)}
          onSubmitReport={handleSubmitWhistleblower}
          onTrackReport={handleTrackWhistleblower}
          submissionResult={wbSubmissionResult}
          setSubmissionResult={setWbSubmissionResult}
          trackingResult={wbTrackingResult}
          setTrackingResult={setWbTrackingResult}
        />
      </>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#edf1f7] text-slate-800 antialiased">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <Sidebar activeTab={activeTab} setActiveTab={handleSelectModule} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Header
          activeTab={activeTab}
          setActiveTab={handleSelectModule}
          topContextTab={topContextTab}
          setTopContextTab={setTopContextTab}
          employees={employees}
          policies={policies}
          notifications={notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onRetryNotification={handleRetryNotification}
          onOpenLeaveModal={handleOpenLeaveModal}
          onOpenAbsenceModal={() => setAbsenceModalOpen(true)}
          onOpenMfaModal={handleOpenMfaSetup}
          currentUser={currentUser}
          onLogout={handleLogout}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'workspace' && (
            <MyWorkspaceView
              currentUser={currentUser}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              subViewHint={subViewHint}
              employees={employees}
              leaveBalances={leaveBalances}
              leaveRequests={leaveRequests}
              leaveLedger={leaveLedger}
              absences={absences}
              payslips={payslips}
              policies={policies}
              trainings={trainings}
              holidays={holidays}
              tasks={tasks}
              onOpenLeaveModal={handleOpenLeaveModal}
              onOpenAbsenceModal={() => setAbsenceModalOpen(true)}
              onOpenPayslipModal={(ps) => {
                setSelectedPayslip(ps);
                setPayslipModalOpen(true);
              }}
              onAcknowledgePolicy={handleAcknowledgePolicy}
              onCompleteTraining={handleCompleteTraining}
              onApproveLeave={(id) => handleReviewLeave(id, 'APPROVE')}
              onRejectLeave={(id) => handleReviewLeave(id, 'REJECT')}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
              setActiveTab={handleSelectModule}
            />
          )}

          {activeTab === 'directory' && (
            <WorkforceDirectoryView
              employees={employees}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              subViewHint={subViewHint}
              currentUser={currentUser}
              onCreateEmployee={handleCreateEmployee}
              onConfirmProbation={handleConfirmProbation}
              onTransitionEmployeeStatus={handleTransitionEmployeeStatus}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
              salaryStructures={salaryStructures}
            />
          )}

          {activeTab === 'inbox' && (
            <TaskInboxView
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              currentUser={currentUser}
              leaveBalances={leaveBalances}
              leaveRequests={leaveRequests}
              leaveLedger={leaveLedger}
              holidays={holidays}
              absences={absences}
              tasks={tasks}
              employees={employees}
              onOpenLeaveModal={handleOpenLeaveModal}
              onOpenAbsenceModal={() => setAbsenceModalOpen(true)}
              onApproveLeave={(id, reason) => handleReviewLeave(id, 'APPROVE', reason)}
              onRejectLeave={(id, reason) => handleReviewLeave(id, 'REJECT', reason)}
              onReturnLeave={(id, reason) => handleReviewLeave(id, 'RETURN', reason)}
              onCreateHoliday={handleCreateHoliday}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
            />
          )}

          {(activeTab === 'performance' || activeTab === 'okr') && (
            <PerformanceView
              activeTab={activeTab}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              subViewHint={subViewHint}
              setActiveTab={handleSelectModule}
              currentUser={currentUser}
              performanceCycles={performanceCycles}
              appraisals={appraisals}
              pips={pips}
              employees={employees}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'payroll' && (
            <PayrollView
              currentUser={currentUser}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              payPeriods={payPeriods}
              payrollRuns={payrollRuns}
              payslips={payslips}
              salaryStructures={salaryStructures}
              employees={employees}
              onOpenPayslipModal={(ps) => {
                setSelectedPayslip(ps);
                setPayslipModalOpen(true);
              }}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
            />
          )}

          {(activeTab === 'timetracker' ||
            activeTab === 'attendance' ||
            activeTab === 'hrletters' ||
            activeTab === 'admin' ||
            activeTab === 'engagement' ||
            activeTab === 'travel' ||
            activeTab === 'tasks') && (
            <GovernanceView
              activeTab={activeTab}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              subViewHint={subViewHint}
              currentUser={currentUser}
              employees={employees}
              policies={policies}
              trainings={trainings}
              erCases={erCases}
              auditLogs={auditLogs}
              tasks={tasks}
              onAcknowledgePolicy={handleAcknowledgePolicy}
              onCompleteTraining={handleCompleteTraining}
              onOpenWhistleblowerModal={() => setWhistleblowerModalOpen(true)}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              currentUser={currentUser}
              employees={employees}
              onShowToast={showToast}
            />
          )}

          {(activeTab === 'operations' || activeTab === 'hardening') && (
            <IntegrationsSecurityView
              activeTab={activeTab}
              topContextTab={topContextTab}
              setTopContextTab={setTopContextTab}
              setActiveTab={handleSelectModule}
              currentUser={currentUser}
              employees={employees}
              departments={[]}
              holidays={holidays}
              auditLogs={auditLogs}
              onRefreshAll={fetchAllData}
              onShowToast={showToast}
            />
          )}
        </main>
      </div>

      <LeaveRequestModal
        isOpen={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
        leaveForm={leaveForm}
        setLeaveForm={setLeaveForm}
        onSubmit={handleSubmitLeave}
        leaveBalances={leaveBalances}
        leaveRequests={leaveRequests}
        employees={employees}
        currentEmployeeId={currentUser?.employeeId}
        targetEmployeeId={leaveForm.targetEmployeeId || currentUser?.employeeId || employees[0]?.id}
        onShowToast={showToast}
      />

      <UnexpectedAbsenceModal
        isOpen={absenceModalOpen}
        onClose={() => setAbsenceModalOpen(false)}
        absenceForm={absenceForm}
        setAbsenceForm={setAbsenceForm}
        onSubmit={handleSubmitAbsence}
        employees={employees}
        currentEmployeeId={currentUser?.employeeId}
      />

      <WhistleblowerModal
        isOpen={whistleblowerModalOpen}
        onClose={() => setWhistleblowerModalOpen(false)}
        onSubmitReport={handleSubmitWhistleblower}
        onTrackReport={handleTrackWhistleblower}
        submissionResult={wbSubmissionResult}
        setSubmissionResult={setWbSubmissionResult}
        trackingResult={wbTrackingResult}
        setTrackingResult={setWbTrackingResult}
      />

      <PayslipModal
        isOpen={payslipModalOpen}
        onClose={() => setPayslipModalOpen(false)}
        slip={selectedPayslip}
        onDownloadPdf={(slipId) =>
          apiDownload(`/api/v1/payroll/slips/${slipId}`, `payslip-${slipId}.json`)
        }
      />

      {mfaModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Two-Factor Authentication (TOTP MFA)</h3>
                <p className="text-[11px] text-slate-500">Status: {currentUser?.mfaEnabled ? 'Enabled' : 'Not Active'}</p>
              </div>
              <button onClick={() => setMfaModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">
                Close
              </button>
            </div>
            {mfaSetupData ? (
              <form onSubmit={handleActivateMfa} className="space-y-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <div className="text-[10px] font-bold uppercase text-slate-400">Authenticator Secret</div>
                  <div className="font-mono font-bold text-slate-800 break-all">{mfaSetupData.secret}</div>
                  {mfaSetupData.otpauthUrl && (
                    <div className="text-[10px] text-slate-500 break-all mt-1">{mfaSetupData.otpauthUrl}</div>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">6-Digit TOTP Code</label>
                  <input
                    type="text"
                    required
                    value={mfaCodeInput}
                    onChange={(e) => setMfaCodeInput(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setMfaModalOpen(false)} className="px-3 py-1.5 border border-slate-300 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-1.5 bg-[#0088ff] text-white font-semibold rounded-lg">
                    Activate MFA
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-slate-500">Generating TOTP secret...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
