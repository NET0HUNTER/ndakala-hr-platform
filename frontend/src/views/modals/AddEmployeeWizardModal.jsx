import React, { useState } from 'react';
import {
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Mail,
  Building,
  ShieldCheck,
  Calendar,
  AlertCircle,
} from '../../components/Icons';

export default function AddEmployeeWizardModal({
  isOpen,
  onClose,
  onSubmit,
  employees = [],
  departments = [],
  onShowToast,
}) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const orgDomain =
    employees.find((e) => e.workEmail?.includes('@'))?.workEmail?.split('@')[1] ||
    employees[0]?.email?.split('@')[1] ||
    'domain.com';

  // Form State
  const [wizardForm, setWizardForm] = useState({
    // Step 1: Provisioning Mode
    provisioningMode: 'MICROSOFT_365', // 'DIRECT_INVITE', 'MICROSOFT_365', 'GOOGLE_WORKSPACE'
    
    // Step 2: Account Creation
    employeeNumber: `NDA-2026-000${employees.length + 1}`,
    autoGenerateNumber: true,
    firstName: '',
    middleName: '',
    lastName: '',
    workEmail: '',
    personalEmail: '',
    phone: '',

    // Step 3: Work Data
    departmentId: departments[0]?.id || '',
    departmentName: departments[0]?.name || 'Advisory & Strategy Consulting',
    designation: 'Senior Associate',
    location: 'Nairobi HQ - 246 Owashika Rd',
    managerId: employees[0]?.id || '',
    employmentCategory: 'PERMANENT',
    dateOfJoining: '2026-12-01',
    probationMonths: '3',

    // Step 4: Alerts & Welcome
    sendWelcomeEmail: true,
    notifyManager: true,
    syncM365Calendar: true,
  });

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 2) {
      if (!wizardForm.firstName.trim() || !wizardForm.lastName.trim()) {
        onShowToast && onShowToast('Please provide both First Name and Last Name', 'error');
        return;
      }
      if (!wizardForm.workEmail.trim() || !wizardForm.workEmail.includes('@')) {
        onShowToast && onShowToast('Please provide a valid Work Email', 'error');
        return;
      }
    }
    setStep((prev) => Math.min(prev + 1, 4));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit(wizardForm);
      }
      onShowToast && onShowToast(`Employee ${wizardForm.firstName} ${wizardForm.lastName} created successfully!`);
      onClose();
    } catch (err) {
      onShowToast && onShowToast(err?.message || 'Failed to create employee', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const stepsMeta = [
    { num: 1, title: 'Selection', desc: 'Provisioning & Quota' },
    { num: 2, title: 'Account Creation', desc: 'Identity & Credentials' },
    { num: 3, title: 'Work Data', desc: 'Role, Dept & Manager' },
    { num: 4, title: 'Alerts & Dispatch', desc: 'M365 Welcome & Review' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Wizard Top Header */}
        <div className="bg-[#191f3a] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#0088ff] flex items-center justify-center">
              <UserPlus size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Add Employee Wizard</h3>
              <p className="text-[11px] text-slate-300">4-Step Zoho People 5.0 Onboarding & Provisioning</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Step Progress Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
          <div className="grid grid-cols-4 gap-2">
            {stepsMeta.map((s) => {
              const isPast = step > s.num;
              const isCurr = step === s.num;
              return (
                <div key={s.num} className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      isPast
                        ? 'bg-emerald-500 text-white'
                        : isCurr
                        ? 'bg-[#0088ff] text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isPast ? <Check size={13} /> : s.num}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-[11px] font-semibold truncate ${isCurr ? 'text-[#0088ff]' : 'text-slate-700'}`}>
                      {s.title}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 text-xs text-slate-700 space-y-4">
          {/* STEP 1: Selection & Quota */}
          {step === 1 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-800">Enterprise License Allocation</span>
                  <span className="font-bold text-[#0088ff]">
                    {employees.length} of 50 Licenses Allocated ({50 - employees.length} Available)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0088ff] rounded-full transition-all"
                    style={{ width: `${Math.min((employees.length / 50) * 100, 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-800 mb-2">
                  Select User Provisioning & Authentication Method
                </label>
                <div className="space-y-2.5">
                  {[
                    {
                      id: 'MICROSOFT_365',
                      title: 'Microsoft 365 / Entra ID Integration (Recommended)',
                      desc: 'Auto-provisions SharePoint dual-write vault, Outlook Shared Calendar, and link-only notifications.',
                      badge: 'Native Dual-Write',
                    },
                    {
                      id: 'DIRECT_INVITE',
                      title: 'Direct Platform Invitation',
                      desc: 'Generates secure temporary password and sends an automated invite link to the employee.',
                      badge: 'Zero-Trust',
                    },
                    {
                      id: 'GOOGLE_WORKSPACE',
                      title: 'Google Workspace Single Sign-On',
                      desc: 'Authorizes login via verified Google Workspace corporate identity.',
                      badge: 'SSO Ready',
                    },
                  ].map((mode) => (
                    <label
                      key={mode.id}
                      className={`block p-3.5 border rounded-lg cursor-pointer transition-all ${
                        wizardForm.provisioningMode === mode.id
                          ? 'border-[#0088ff] bg-blue-50/30 ring-1 ring-[#0088ff]'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="provisioningMode"
                          value={mode.id}
                          checked={wizardForm.provisioningMode === mode.id}
                          onChange={(e) =>
                            setWizardForm({ ...wizardForm, provisioningMode: e.target.value })
                          }
                          className="mt-0.5 text-[#0088ff] focus:ring-[#0088ff]"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{mode.title}</span>
                            <span className="px-2 py-0.5 bg-blue-100 text-[#0088ff] rounded text-[10px] font-semibold">
                              {mode.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{mode.desc}</p>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Account Creation */}
          {step === 2 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    First Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={wizardForm.firstName}
                    onChange={(e) => {
                      const val = e.target.value;
                      const genEmail =
                        val && wizardForm.lastName
                          ? `${val.toLowerCase().replace(/\s+/g, '')}.${wizardForm.lastName.toLowerCase().replace(/\s+/g, '')}@${orgDomain}`
                          : wizardForm.workEmail;
                      setWizardForm({ ...wizardForm, firstName: val, workEmail: genEmail });
                    }}
                    placeholder="e.g. Kelvin"
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Last Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={wizardForm.lastName}
                    onChange={(e) => {
                      const val = e.target.value;
                      const genEmail =
                        wizardForm.firstName && val
                          ? `${wizardForm.firstName.toLowerCase().replace(/\s+/g, '')}.${val.toLowerCase().replace(/\s+/g, '')}@${orgDomain}`
                          : wizardForm.workEmail;
                      setWizardForm({ ...wizardForm, lastName: val, workEmail: genEmail });
                    }}
                    placeholder="e.g. Mwangi"
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">
                  Official Work Email <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={wizardForm.workEmail}
                  onChange={(e) => setWizardForm({ ...wizardForm, workEmail: e.target.value })}
                  placeholder="name@domain.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Personal Email</label>
                  <input
                    type="email"
                    value={wizardForm.personalEmail}
                    onChange={(e) => setWizardForm({ ...wizardForm, personalEmail: e.target.value })}
                    placeholder="personal@gmail.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">
                    Phone (+254) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={wizardForm.phone}
                    onChange={(e) => setWizardForm({ ...wizardForm, phone: e.target.value })}
                    placeholder="+254 712 345 678"
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-600 font-medium">Employee Number (ID)</label>
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={wizardForm.autoGenerateNumber}
                      onChange={(e) =>
                        setWizardForm({
                          ...wizardForm,
                          autoGenerateNumber: e.target.checked,
                          employeeNumber: e.target.checked
                            ? `NDA-2026-000${employees.length + 1}`
                            : wizardForm.employeeNumber,
                        })
                      }
                      className="rounded text-[#0088ff]"
                    />
                    <span>Auto-generate sequence</span>
                  </label>
                </div>
                <input
                  type="text"
                  disabled={wizardForm.autoGenerateNumber}
                  value={wizardForm.employeeNumber}
                  onChange={(e) => setWizardForm({ ...wizardForm, employeeNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded bg-slate-50 font-mono text-slate-700 disabled:opacity-75 focus:outline-none focus:border-[#0088ff]"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Work Data */}
          {step === 3 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Department</label>
                  <select
                    value={wizardForm.departmentName}
                    onChange={(e) => setWizardForm({ ...wizardForm, departmentName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="Advisory & Strategy Consulting">Advisory & Strategy Consulting</option>
                    <option value="Audit & Assurance">Audit & Assurance</option>
                    <option value="Tax & Regulatory Compliance">Tax & Regulatory Compliance</option>
                    <option value="Operations & Support">Operations & Support</option>
                    <option value="Executive Management">Executive Management</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Designation / Title</label>
                  <input
                    type="text"
                    value={wizardForm.designation}
                    onChange={(e) => setWizardForm({ ...wizardForm, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Work Location</label>
                  <input
                    type="text"
                    value={wizardForm.location}
                    onChange={(e) => setWizardForm({ ...wizardForm, location: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Reporting Manager</label>
                  <select
                    value={wizardForm.managerId}
                    onChange={(e) => setWizardForm({ ...wizardForm, managerId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    {employees.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.firstName} {m.lastName} ({m.employeeNumber || 'MGR'})
                      </option>
                    ))}
                    {employees.length === 0 && <option value="">Managing Partner (Default)</option>}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Employment Category</label>
                  <select
                    value={wizardForm.employmentCategory}
                    onChange={(e) => setWizardForm({ ...wizardForm, employmentCategory: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="PERMANENT">Permanent Full-Time</option>
                    <option value="CONTRACT">Fixed-Term Contract</option>
                    <option value="PROBATION">Probationary Period</option>
                    <option value="INTERNSHIP">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Date of Joining</label>
                  <input
                    type="date"
                    value={wizardForm.dateOfJoining}
                    onChange={(e) => setWizardForm({ ...wizardForm, dateOfJoining: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:border-[#0088ff]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Probation Period</label>
                  <select
                    value={wizardForm.probationMonths}
                    onChange={(e) => setWizardForm({ ...wizardForm, probationMonths: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded bg-white focus:outline-none focus:border-[#0088ff]"
                  >
                    <option value="0">None (Direct Confirmation)</option>
                    <option value="3">3 Months</option>
                    <option value="6">6 Months</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Alerts & Welcome Dispatch */}
          {step === 4 && (
            <div className="space-y-4 animate-fadeIn">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <h4 className="font-bold text-slate-800 text-xs mb-2">New Employee Summary Review</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                  <div>
                    <span className="text-slate-400">Full Name:</span>{' '}
                    <span className="font-semibold text-slate-800">
                      {wizardForm.firstName} {wizardForm.lastName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Employee ID:</span>{' '}
                    <span className="font-mono font-semibold text-slate-800">
                      {wizardForm.employeeNumber}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Work Email:</span>{' '}
                    <span className="font-mono text-slate-800">{wizardForm.workEmail}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Department:</span>{' '}
                    <span className="font-semibold text-slate-800">{wizardForm.departmentName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Designation:</span>{' '}
                    <span className="text-slate-800">{wizardForm.designation}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Joining Date:</span>{' '}
                    <span className="text-slate-800">{wizardForm.dateOfJoining}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={wizardForm.sendWelcomeEmail}
                    onChange={(e) => setWizardForm({ ...wizardForm, sendWelcomeEmail: e.target.checked })}
                    className="mt-0.5 rounded text-[#0088ff] focus:ring-[#0088ff]"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">Dispatch Welcome Email with secure access link</p>
                    <p className="text-[11px] text-slate-500">
                      Sends onboarding login instructions and password initialization link to {wizardForm.workEmail}.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={wizardForm.notifyManager}
                    onChange={(e) => setWizardForm({ ...wizardForm, notifyManager: e.target.checked })}
                    className="mt-0.5 rounded text-[#0088ff] focus:ring-[#0088ff]"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">Notify Reporting Manager</p>
                    <p className="text-[11px] text-slate-500">
                      Alerts manager to prepare onboarding roadmap, orientation schedules, and workstation.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={wizardForm.syncM365Calendar}
                    onChange={(e) => setWizardForm({ ...wizardForm, syncM365Calendar: e.target.checked })}
                    className="mt-0.5 rounded text-[#0088ff] focus:ring-[#0088ff]"
                  />
                  <div>
                    <p className="font-semibold text-slate-800">Provision Microsoft 365 Shared Calendar & SharePoint Vault</p>
                    <p className="text-[11px] text-slate-500">
                      Dual-write integration will synchronize leave events and document vaults to SharePoint.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-3.5 flex items-center justify-between flex-shrink-0">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
              >
                <ChevronLeft size={14} />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-5 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <span>Continue</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-60"
              >
                <Check size={14} />
                <span>{submitting ? 'Creating Employee...' : 'Submit & Create Employee'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
