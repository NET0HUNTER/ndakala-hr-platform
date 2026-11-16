import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Check,
  CheckCircle,
  Settings,
  Sliders,
  HelpCircle,
  Info,
  ChevronRight,
  Globe,
  RefreshCw,
  Edit,
  Plus,
  Shield,
  Layers,
  Award,
} from '../components/Icons';
import { apiGet, apiPut } from '../utils/api';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function computeOkrQuarterCycle(startMonth) {
  const startIndex = Math.max(0, MONTH_NAMES.indexOf(startMonth));
  const q = (quarterNum, offsetMonths) => {
    const s = MONTH_NAMES[(startIndex + offsetMonths) % 12];
    const e = MONTH_NAMES[(startIndex + offsetMonths + 2) % 12];
    return `Q${quarterNum}-${s}-${e}`;
  };
  return `${q(1, 0)} | ${q(2, 3)} | ${q(3, 6)} | ${q(4, 9)}`;
}

const DEFAULT_OKR_STATUS_RANGES = [
  { id: 'yet_to_start', name: 'Yet to Start', color: '#94a3b8', isRange: false, staticValue: '-' },
  { id: 'on_track', name: 'On Track', color: '#10b981', isRange: true, min: 1, max: 10 },
  { id: 'need_attention', name: 'Need Attention', color: '#f59e0b', isRange: true, min: 11, max: 50 },
  { id: 'at_risk', name: 'At Risk', color: '#f97316', isRange: true, min: 51, max: 80 },
  { id: 'off_track', name: 'Off Track', color: '#ef4444', isRange: true, min: 81, max: 100 },
  { id: 'completed', name: 'Completed', color: '#3b82f6', isRange: false, staticValue: '100%' },
];

export default function OkrConfigurationView({
  onShowToast,
  onBackToOperations,
  currentUser,
}) {
  const [topOkrTab, setTopOkrTab] = useState('configuration'); // 'operations' | 'configuration' | 'approvals' | 'automation' | 'permissions'
  const [subConfigTab, setSubConfigTab] = useState('general'); // 'general' | 'objectives' | 'keyresults'

  // OKR Cycle Settings
  const [startMonth, setStartMonth] = useState('Jan');

  // OKR Status & Deviation Ranges
  const [statusRanges, setStatusRanges] = useState(DEFAULT_OKR_STATUS_RANGES);

  // Location based OKRs
  const [locationBasedOkrs, setLocationBasedOkrs] = useState(false);

  // Objectives and Key Results configs
  const [maxObjectives, setMaxObjectives] = useState(6);
  const [krCheckInFrequency, setKrCheckInFrequency] = useState('Bi-weekly');
  const [allowCustomMetrics, setAllowCustomMetrics] = useState(true);

  // Persistence status
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const toast = (msg, type = 'success') => onShowToast && onShowToast(msg, type);

  // Calculate dynamic cycle string
  const calculatedCycle = useMemo(() => computeOkrQuarterCycle(startMonth), [startMonth]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiGet('/api/v1/workspace/ui-config?key=OKR_CONFIG');
        if (!active) return;
        const saved = res?.configs?.OKR_CONFIG || res?.value;
        if (saved && typeof saved === 'object') {
          if (saved.startMonth && MONTH_NAMES.includes(saved.startMonth)) {
            setStartMonth(saved.startMonth);
          }
          if (Array.isArray(saved.statusRanges) && saved.statusRanges.length > 0) {
            setStatusRanges(saved.statusRanges);
          }
          if (typeof saved.locationBasedOkrs === 'boolean') {
            setLocationBasedOkrs(saved.locationBasedOkrs);
          }
          if (saved.maxObjectives) setMaxObjectives(Number(saved.maxObjectives) || 6);
          if (saved.krCheckInFrequency) setKrCheckInFrequency(saved.krCheckInFrequency);
          if (typeof saved.allowCustomMetrics === 'boolean') setAllowCustomMetrics(saved.allowCustomMetrics);
        }
      } catch {
        // Non-blocking fetch
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const payload = {
        startMonth,
        statusRanges,
        locationBasedOkrs,
        maxObjectives,
        krCheckInFrequency,
        allowCustomMetrics,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser?.email || 'Admin',
      };
      await apiPut('/api/v1/workspace/ui-config', {
        key: 'OKR_CONFIG',
        scope: 'ORG',
        value: payload,
      });
      toast('OKR configuration saved successfully.');
    } catch (err) {
      toast(err?.message || 'Failed to save OKR configuration', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setStartMonth('Jan');
    setStatusRanges(DEFAULT_OKR_STATUS_RANGES);
    setLocationBasedOkrs(false);
    setMaxObjectives(6);
    setKrCheckInFrequency('Bi-weekly');
    setAllowCustomMetrics(true);
    toast('Reset to default Zoho OKR configuration parameters.');
  };

  const handleRangeChange = (id, field, value) => {
    const num = Math.max(0, Math.min(100, Number(value) || 0));
    setStatusRanges((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: num } : item))
    );
  };

  return (
    <div className="flex-1 bg-[#edf1f7] flex flex-col min-h-0 overflow-hidden text-xs">
      {/* Top OKR Zoho-style Header */}
      <div className="h-[48px] bg-[#18223c] px-4 flex items-center justify-between flex-shrink-0 select-none text-white shadow-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-wide text-white">OKR</span>
          </div>

          <div className="flex items-center gap-1">
            {[
              { id: 'operations', label: 'OKR' },
              { id: 'configuration', label: 'Configuration' },
              { id: 'approvals', label: 'Approvals' },
              { id: 'automation', label: 'Automation' },
              { id: 'permissions', label: 'Permissions' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === 'operations' && onBackToOperations) {
                    onBackToOperations();
                  } else {
                    setTopOkrTab(tab.id);
                  }
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  topOkrTab === tab.id
                    ? 'bg-[#0088ff] text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToOperations}
            className="px-3 py-1 border border-slate-600 hover:border-slate-400 text-slate-200 hover:text-white rounded text-xs transition-colors flex items-center gap-1.5"
          >
            <span>Go to Operations</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Subtabs Bar for Configuration */}
      {topOkrTab === 'configuration' && (
        <div className="h-[40px] bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0 select-none">
          <div className="flex items-center gap-6">
            {[
              { id: 'general', label: 'General' },
              { id: 'objectives', label: 'Objectives' },
              { id: 'keyresults', label: 'Key Results' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSubConfigTab(st.id)}
                className={`h-[40px] px-1 border-b-2 font-medium text-xs flex items-center transition-all ${
                  subConfigTab === st.id
                    ? 'border-[#0088ff] text-[#0088ff]'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToOperations}
              className="text-xs text-[#0088ff] hover:underline font-medium"
            >
              Go to Operations
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {topOkrTab === 'configuration' && subConfigTab === 'general' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn">
            {/* OKR Cycle Section */}
            <div className="bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">OKR cycle</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Select the start month to define your organization's OKR cycle for timely progress tracking
                </p>
              </div>

              <div className="pt-2 max-w-sm space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  OKR cycle Start Month
                </label>
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs text-slate-700 bg-white focus:outline-none focus:border-[#0088ff]"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Calculated dynamic cycle display banner */}
              <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-md text-xs text-slate-700 flex items-center gap-2">
                <span className="font-semibold text-slate-800">OKR cycle :</span>
                <span className="font-mono text-[#0088ff] tracking-wide font-medium">
                  {calculatedCycle}
                </span>
              </div>
            </div>

            {/* OKR Status & Deviation Ranges Section */}
            <div className="bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">OKR status</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Deviation is the difference between planned progress and actual progress. An objective or key result with a deviation of 100% indicates no progress, while a deviation of 0% is on track.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-md">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-2.5 px-4 w-32">Color Code</th>
                      <th className="py-2.5 px-4">Status name</th>
                      <th className="py-2.5 px-4 w-60">Deviation range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statusRanges.map((st) => (
                      <tr key={st.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block shadow-2xs"
                              style={{ backgroundColor: st.color }}
                            />
                            <span className="font-mono text-[11px] text-slate-400 uppercase">
                              {st.color}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800">
                          {st.name}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {st.isRange ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400 font-medium">%</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={st.min}
                                onChange={(e) => handleRangeChange(st.id, 'min', e.target.value)}
                                className="w-14 px-2 py-1 border border-slate-200 rounded text-center text-xs focus:outline-none focus:border-[#0088ff]"
                              />
                              <span className="text-slate-400">-</span>
                              <span className="text-slate-400 font-medium">%</span>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={st.max}
                                onChange={(e) => handleRangeChange(st.id, 'max', e.target.value)}
                                className="w-14 px-2 py-1 border border-slate-200 rounded text-center text-xs focus:outline-none focus:border-[#0088ff]"
                              />
                            </div>
                          ) : (
                            <span className="font-medium text-slate-500 px-2 py-0.5 bg-slate-100 rounded text-[11px]">
                              {st.staticValue || '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Location based OKRs Section */}
            <div className="bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Location based OKRs</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Allows you to set OKRs based on employees' work locations
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium text-slate-700">
                    {locationBasedOkrs ? 'Enabled' : 'Enable'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLocationBasedOkrs(!locationBasedOkrs)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      locationBasedOkrs ? 'bg-[#0088ff]' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        locationBasedOkrs ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Save / Reset Action Bar */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-medium rounded text-xs transition-colors"
              >
                Reset to Default
              </button>

              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-5 py-2 bg-[#0088ff] hover:bg-[#0073d9] text-white font-medium rounded text-xs shadow-2xs transition-colors flex items-center gap-2"
              >
                {saving && <RefreshCw size={13} className="animate-spin" />}
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </div>
        )}

        {topOkrTab === 'configuration' && subConfigTab === 'objectives' && (
          <div className="max-w-4xl mx-auto bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-800">Objective Governance & Rules</h3>
            <p className="text-xs text-slate-500">
              Configure bounds, weightings, and maker-checker signoffs for organization objectives.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Maximum Objectives per Sheet
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxObjectives}
                  onChange={(e) => setMaxObjectives(Number(e.target.value) || 6)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-[#0088ff]"
                />
                <span className="text-[11px] text-slate-400">
                  Ndakala Advisory standardized SMART sheet is 6 objectives totaling 100% weight.
                </span>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-2 bg-[#0088ff] text-white font-medium rounded text-xs"
              >
                Save Objective Rules
              </button>
            </div>
          </div>
        )}

        {topOkrTab === 'configuration' && subConfigTab === 'keyresults' && (
          <div className="max-w-4xl mx-auto bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-800">Key Results Measurement & Frequency</h3>
            <p className="text-xs text-slate-500">
              Configure progress check-in cadence and allowable measurement metrics for Key Results.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Default Check-In Frequency
                </label>
                <select
                  value={krCheckInFrequency}
                  onChange={(e) => setKrCheckInFrequency(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded text-xs bg-white"
                >
                  <option value="Weekly">Weekly</option>
                  <option value="Bi-weekly">Bi-weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  Allow Custom Metric Units
                </label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="allowCustomMetrics"
                    checked={allowCustomMetrics}
                    onChange={(e) => setAllowCustomMetrics(e.target.checked)}
                    className="rounded border-slate-300 text-[#0088ff]"
                  />
                  <label htmlFor="allowCustomMetrics" className="text-xs text-slate-600">
                    Enable custom units (e.g. KES, Deals, Audits completed, %)
                  </label>
                </div>
              </div>
            </div>
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="px-4 py-2 bg-[#0088ff] text-white font-medium rounded text-xs"
              >
                Save Key Result Rules
              </button>
            </div>
          </div>
        )}

        {topOkrTab === 'approvals' && (
          <div className="max-w-4xl mx-auto bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-800">OKR Approvals Workflow</h3>
            <p className="text-xs text-slate-500">
              Multi-tiered sign-off workflow for organization and departmental OKRs.
            </p>
            <div className="p-4 bg-slate-50 rounded border border-slate-100 space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <CheckCircle size={15} className="text-emerald-500" />
                <span>Line Manager Signoff Mandatory</span>
              </div>
              <p className="text-slate-500 text-[11px] pl-6">
                Goal sheets cannot be reviewed during appraisals until signed off by the direct Line Manager.
              </p>
            </div>
            <div className="p-4 bg-slate-50 rounded border border-slate-100 space-y-2">
              <div className="flex items-center gap-2 text-slate-700 font-medium">
                <CheckCircle size={15} className="text-emerald-500" />
                <span>HR & Operations Final Verification</span>
              </div>
              <p className="text-slate-500 text-[11px] pl-6">
                Objective weights must sum to exactly 100% before approval is unlocked.
              </p>
            </div>
          </div>
        )}

        {topOkrTab === 'automation' && (
          <div className="max-w-4xl mx-auto bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-800">OKR Automated Notifications & Reminders</h3>
            <p className="text-xs text-slate-500">
              Automate reminders for quarter-end progress updates and deviation triggers.
            </p>
            <div className="p-4 bg-slate-50 rounded border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">Quarterly Check-In Reminder</p>
                  <p className="text-slate-500 text-[11px]">Notify employees 7 days before quarter closing to update actual KR progress.</p>
                </div>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-medium rounded text-[11px]">Active</span>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">At Risk / Off Track Alert</p>
                  <p className="text-slate-500 text-[11px]">Send escalation notification to Line Manager when deviation exceeds 50%.</p>
                </div>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-medium rounded text-[11px]">Active</span>
              </div>
            </div>
          </div>
        )}

        {topOkrTab === 'permissions' && (
          <div className="max-w-4xl mx-auto bg-white rounded-md border border-slate-200 p-6 shadow-2xs space-y-4 animate-fadeIn">
            <h3 className="text-sm font-semibold text-slate-800">OKR Access & Role-Based Permissions</h3>
            <p className="text-xs text-slate-500">
              Manage view, edit, approve, and configure privileges across user tiers.
            </p>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded">
              {[
                { role: 'Managing Partner / Operations Director', perm: 'Full Configuration & Organization-wide Override' },
                { role: 'HR Lead', perm: 'Cycle Admin, Deviation Table Configuration, Moderation' },
                { role: 'Line Manager', perm: 'Departmental Goal Review, KR Deviation Tracking' },
                { role: 'Employee', perm: 'My Goal Sheets, Weekly/Bi-weekly Progress Check-Ins' },
              ].map((r) => (
                <div key={r.role} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                  <span className="font-medium text-slate-800">{r.role}</span>
                  <span className="text-slate-500 text-[11px]">{r.perm}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zoho People Help / Widget Footer */}
      <div className="h-[28px] bg-slate-100 border-t border-slate-200 px-4 flex items-center justify-between text-[11px] text-slate-500 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span>Welcome to Zoho People Help widget</span>
        </div>
        <div className="flex items-center gap-4">
          <span>English</span>
        </div>
      </div>
    </div>
  );
}