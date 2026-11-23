import React, { useState } from 'react';
import { Search, Download, Eye, FileText } from '../components/Icons';

export const STANDARD_REPORTS_CATALOGUE = [
  // 1. Employee Information (8)
  { id: 'emp-1', category: 'Employee Information', name: 'Headcount Summary', desc: 'Active headcount by department, location, and employment category.', targetDomain: 'workforce' },
  { id: 'emp-2', category: 'Employee Information', name: 'Addition Trend', desc: 'Monthly new hire onboarding velocity and growth rate.', targetDomain: 'workforce' },
  { id: 'emp-3', category: 'Employee Information', name: 'Attrition Trend', desc: 'Voluntary vs. involuntary separations and retention ratios.', targetDomain: 'workforce' },
  { id: 'emp-4', category: 'Employee Information', name: 'Career History', desc: 'Employee promotions, transfers, and grade progression ledger.', targetDomain: 'workforce' },
  { id: 'emp-5', category: 'Employee Information', name: 'Department Distribution', desc: 'Staff allocation across advisory, tax, legal, and operations units.', targetDomain: 'workforce' },
  { id: 'emp-6', category: 'Employee Information', name: 'Workforce Diversity', desc: 'Demographic, gender, and tenure distribution analytics.', targetDomain: 'workforce' },
  { id: 'emp-7', category: 'Employee Information', name: 'Exit Analysis', desc: 'Separation reasons, notice period adherence, and clearance status.', targetDomain: 'workforce' },
  { id: 'emp-8', category: 'Employee Information', name: 'Probation & Tenure Tracker', desc: 'Active probation milestones and upcoming confirmation deadlines.', targetDomain: 'workforce' },

  // 2. Leave Tracker (8)
  { id: 'lv-1', category: 'Leave Tracker', name: 'Daily Leave Status', desc: 'Real-time roster of employees on approved or pending leave today.', targetDomain: 'leave' },
  { id: 'lv-2', category: 'Leave Tracker', name: 'Resource Availability', desc: 'Team availability capacity accounting for approved time off.', targetDomain: 'leave' },
  { id: 'lv-3', category: 'Leave Tracker', name: 'Leave Data for Payroll', desc: 'Monthly approved leave days and unpaid deductions feed for payroll.', targetDomain: 'leave' },
  { id: 'lv-4', category: 'Leave Tracker', name: 'Loss of Pay Details', desc: 'Unpaid leave and unexcused absence days impacting monthly pay.', targetDomain: 'leave' },
  { id: 'lv-5', category: 'Leave Tracker', name: 'Leave Balance Ledger', desc: 'Opening balance, accruals, taken, carry-over, and closing balances.', targetDomain: 'leave' },
  { id: 'lv-6', category: 'Leave Tracker', name: 'Carry-Over Expiry Report', desc: 'Statutory 5-day carry-over balances approaching 180-day expiry.', targetDomain: 'leave' },
  { id: 'lv-7', category: 'Leave Tracker', name: 'Relieving Officer Coverage', desc: 'Handover assignments and relieving officer sign-off audit.', targetDomain: 'leave' },
  { id: 'lv-8', category: 'Leave Tracker', name: 'Holiday Calendar Impact', desc: 'Kenyan gazetted public holidays overlapping leave windows.', targetDomain: 'leave' },

  // 3. Attendance (7)
  { id: 'att-1', category: 'Attendance', name: 'Muster Roll', desc: 'Statutory monthly employee presence register (P / A / L / H / W).', targetDomain: 'leave' },
  { id: 'att-2', category: 'Attendance', name: 'Daily Attendance Status', desc: 'First-in, last-out timestamps and daily check-in compliance.', targetDomain: 'leave' },
  { id: 'att-3', category: 'Attendance', name: 'Presence Hours Breakup', desc: 'Total logged hours vs. payable shift hours and overtime deviation.', targetDomain: 'leave' },
  { id: 'att-4', category: 'Attendance', name: 'Consecutive Absences', desc: 'Early-warning tracker for multi-day unscheduled absences.', targetDomain: 'leave' },
  { id: 'att-5', category: 'Attendance', name: 'Late Arrival & Early Out', desc: 'Shift grace-period deviations and punctuality trends.', targetDomain: 'leave' },
  { id: 'att-6', category: 'Attendance', name: 'Overtime & Deviation Summary', desc: 'Approved extra hours and statutory overtime calculation.', targetDomain: 'leave' },
  { id: 'att-7', category: 'Attendance', name: 'Regularization Audit Trail', desc: 'Missed-punch corrections and manager regularization approvals.', targetDomain: 'leave' },

  // 4. Time Tracker (7)
  { id: 'tt-1', category: 'Time Tracker', name: 'Jobs Status', desc: 'Active client engagement jobs, hours logged, and completion status.', targetDomain: 'timetracker' },
  { id: 'tt-2', category: 'Time Tracker', name: 'Projects Status', desc: 'Portfolio health, budget burn percentage, and delivery timelines.', targetDomain: 'timetracker' },
  { id: 'tt-3', category: 'Time Tracker', name: 'Scheduled vs. Worked Hours', desc: 'Job schedule allocation compared against actual logged timesheets.', targetDomain: 'timetracker' },
  { id: 'tt-4', category: 'Time Tracker', name: 'Timesheet Data for Payroll', desc: 'Approved period-locked hours ready for billing and payroll.', targetDomain: 'timetracker' },
  { id: 'tt-5', category: 'Time Tracker', name: 'Billable Utilization Summary', desc: 'Billable vs. non-billable hours ratio by consultant and practice.', targetDomain: 'timetracker' },
  { id: 'tt-6', category: 'Time Tracker', name: 'Project Budget Burn & Leakage', desc: 'Labor cost vs. engagement budget and non-billable leakage KES.', targetDomain: 'timetracker' },
  { id: 'tt-7', category: 'Time Tracker', name: 'Client Rate Card Realization', desc: 'Effective KES billing rate realization and gross profit margin.', targetDomain: 'timetracker' },

  // 5. Performance (11)
  { id: 'pf-1', category: 'Performance', name: 'Nine-Box Matrix', desc: 'Performance vs. Potential talent calibration across leadership cohorts.', targetDomain: 'performance' },
  { id: 'pf-2', category: 'Performance', name: 'Appraisal Ratings History', desc: 'Multi-cycle employee appraisal ratings and moderation trend.', targetDomain: 'performance' },
  { id: 'pf-3', category: 'Performance', name: 'Score & Rating Summary', desc: 'Cohort distribution across the 1–6 firm rating scale.', targetDomain: 'performance' },
  { id: 'pf-4', category: 'Performance', name: 'Feedback on Appraisal', desc: 'Self-assessment vs. manager commentary and 1:1 meeting notes.', targetDomain: 'performance' },
  { id: 'pf-5', category: 'Performance', name: 'KRA Weighting Attainment', desc: 'Weighted KRA scores and target attainment across roles.', targetDomain: 'performance' },
  { id: 'pf-6', category: 'Performance', name: 'Competency Gap Analysis', desc: 'Expected grade level vs. actual manager competency ratings.', targetDomain: 'performance' },
  { id: 'pf-7', category: 'Performance', name: 'Skill Set Proficiency Matrix', desc: 'Firm-wide capability heatmap across 6 core advisory skills.', targetDomain: 'performance' },
  { id: 'pf-8', category: 'Performance', name: 'Goal Sheet Completion Rate', desc: '6-Objective SMART goal sheet submission and approval status.', targetDomain: 'performance' },
  { id: 'pf-9', category: 'Performance', name: 'PIP Outcome & Clearance', desc: 'Active Performance Improvement Plans, check-ins, and outcomes.', targetDomain: 'performance' },
  { id: 'pf-10', category: 'Performance', name: 'Development Plan Progress', desc: 'CPE hours, certifications, and mentorship milestone completion.', targetDomain: 'performance' },
  { id: 'pf-11', category: 'Performance', name: '360 Peer Feedback Digest', desc: 'Aggregated peer kudos and constructive coaching themes.', targetDomain: 'performance' },

  // 6. Files (2)
  { id: 'fl-1', category: 'Files', name: 'Policy Acknowledgement Receipts', desc: 'Employee handbook & compliance policy digital sign-off register.', targetDomain: 'governance' },
  { id: 'fl-2', category: 'Files', name: 'Consent & Vault Receipts', desc: 'Kenya Data Protection Act consents and AES-256 vault audit.', targetDomain: 'governance' },

  // 7. Compensation (5)
  { id: 'cp-1', category: 'Compensation', name: 'Salary Distribution', desc: 'Gross & net KES pay distribution across departments and bands.', targetDomain: 'payroll' },
  { id: 'cp-2', category: 'Compensation', name: 'Current Salary Register', desc: 'Active basic salary, housing, transport, and allowances ledger.', targetDomain: 'payroll' },
  { id: 'cp-3', category: 'Compensation', name: 'Compensation Trend', desc: 'Month-over-month firm payroll cost and employer statutory burden.', targetDomain: 'payroll' },
  { id: 'cp-4', category: 'Compensation', name: 'Salary Revision History', desc: 'Historical pay increments, promotions, and effective dates.', targetDomain: 'payroll' },
  { id: 'cp-5', category: 'Compensation', name: 'Kenyan Statutory Deductions (PAYE / NSSF / SHIF / AHL)', desc: 'Monthly KRA PAYE, NSSF Tier I/II, SHIF 2.75% & Housing Levy 1.5% schedules.', targetDomain: 'payroll' },

  // 8. OKR (2)
  { id: 'ok-1', category: 'OKR', name: 'Objectives Progress Summary', desc: 'Quarterly objective completion status across On Track / At Risk brackets.', targetDomain: 'performance' },
  { id: 'ok-2', category: 'OKR', name: 'Key Results Variance & Deviation', desc: 'Planned vs. actual KR progress deviation percentages by location.', targetDomain: 'performance' },
];

export default function ReportsCataloguePanel({ onOpenDomain, onExportDomain, onShowToast }) {
  const [catFilter, setCatFilter] = useState('All');
  const [query, setQuery] = useState('');

  const categories = ['All', ...Array.from(new Set(STANDARD_REPORTS_CATALOGUE.map((r) => r.category)))];

  const filtered = STANDARD_REPORTS_CATALOGUE.filter((r) => {
    const matchCat = catFilter === 'All' || r.category === catFilter;
    const q = query.trim().toLowerCase();
    const matchQ = !q || r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q) || r.category.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  return (
    <div className="space-y-4 text-xs">
      {/* Header Banner */}
      <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <FileText size={16} className="text-[#0088ff]" />
            <span>Standard Enterprise Reports Catalogue ({STANDARD_REPORTS_CATALOGUE.length} Reports)</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Complete 8-domain categorized HR, Statutory Payroll, Attendance, Time Tracker, Performance, Files, and OKR report explorer.
          </p>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 50 standard reports..."
            className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-60 bg-white"
          />
        </div>
      </div>

      {/* 8-Domain Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {categories.map((c) => {
          const count = c === 'All' ? STANDARD_REPORTS_CATALOGUE.length : STANDARD_REPORTS_CATALOGUE.filter((r) => r.category === c).length;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                catFilter === c
                  ? 'bg-[#191f3a] text-white border-[#191f3a]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {c} ({count})
            </button>
          );
        })}
      </div>

      {/* Categorized Reports Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filtered.map((rep) => (
          <div
            key={rep.id}
            className="bg-white rounded-md border border-slate-200 p-4 hover:border-[#0088ff] transition-colors flex flex-col justify-between gap-3"
          >
            <div>
              <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[10px] font-semibold">
                {rep.category}
              </span>
              <h4 className="font-bold text-slate-800 text-xs mt-2">{rep.name}</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{rep.desc}</p>
            </div>
            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onOpenDomain?.(rep.targetDomain);
                  onShowToast?.(`Opened ${rep.name} (${rep.category}).`);
                }}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-[#0088ff] border border-blue-200 rounded text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Eye size={12} />
                <span>Open Report</span>
              </button>
              <button
                type="button"
                onClick={() => onExportDomain?.(rep.targetDomain)}
                className="px-2.5 py-1 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1"
              >
                <Download size={12} />
                <span>CSV</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
