import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  CheckCircle,
  X,
  MessageSquare,
  Trophy,
} from '../components/Icons';
import { apiGet, apiPost, unwrapList } from '../utils/api';

const RATING_META = [
  { score: 1, label: '1 — Strongly Disagree' },
  { score: 2, label: '2 — Disagree' },
  { score: 3, label: '3 — Neutral' },
  { score: 4, label: '4 — Agree' },
  { score: 5, label: '5 — Strongly Agree' },
];

export default function EmployeeEngagementView({
  topContextTab = 'engagement',
  setTopContextTab,
  currentUser,
  onShowToast,
}) {
  const activeSubTab = topContextTab === 'surveys' ? 'surveys' : 'mydata';

  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});

  const roles = new Set((currentUser?.roles || []).map((r) => String(r).toLowerCase()));
  const perms = new Set(currentUser?.permissions || []);
  const canLaunchSurvey =
    roles.has('system_admin') ||
    roles.has('managing_partner') ||
    roles.has('operations_director') ||
    roles.has('head_of_hr') ||
    roles.has('hr_manager') ||
    perms.has('config.manage') ||
    perms.has('employees.view');

  const [surveyForm, setSurveyForm] = useState({
    title: '',
    description: '',
    closingDate: '2026-12-31',
    anonymous: true,
  });

  const loadSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/api/v1/workspace/surveys').catch(() => ({ items: [] }));
      setSurveys(unwrapList(res));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSurveys();
  }, [loadSurveys]);

  const handleLaunchSurvey = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost('/api/v1/workspace/surveys', {
        title: surveyForm.title.trim(),
        description: surveyForm.description.trim(),
        closingDate: surveyForm.closingDate,
        anonymous: Boolean(surveyForm.anonymous),
      });
      onShowToast?.('Employee pulse survey launched.');
      setLaunchModalOpen(false);
      setSurveyForm({ title: '', description: '', closingDate: '2026-12-31', anonymous: true });
      await loadSurveys();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to launch survey', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitResponse = async (surveyId) => {
    const draft = responseDrafts[surveyId] || { overallRating: 5, comment: '' };
    try {
      await apiPost(`/api/v1/workspace/surveys/${surveyId}/respond`, {
        overallRating: Number(draft.overallRating) || 5,
        comment: (draft.comment || '').trim() || undefined,
      });
      onShowToast?.('Anonymous pulse response recorded. Thank you!');
      setResponseDrafts((m) => ({ ...m, [surveyId]: { overallRating: 5, comment: '' } }));
      await loadSurveys();
    } catch (err) {
      onShowToast?.(err?.message || 'Failed to submit response', 'error');
    }
  };

  // Compute firm-wide eNPS & Satisfaction KPIs
  const totalResponses = surveys.reduce((s, sv) => s + Number(sv.responseCount || 0), 0);
  const weightedSum = surveys.reduce(
    (s, sv) => s + Number(sv.avgRating || 0) * Number(sv.responseCount || 0),
    0
  );
  const overallAvg = totalResponses > 0 ? Number((weightedSum / totalResponses).toFixed(2)) : 0;
  // Standard eNPS proxy on 5-point scale: 4.5-5 => +60..+100, 4 => +35, 3 => 0
  const estimatedEnps = totalResponses > 0 ? Math.round(((overallAvg - 3) / 2) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[#edf1f7] overflow-hidden text-xs">
      {/* Sub-Tab Bar */}
      <div className="h-[44px] bg-white border-b border-slate-200 px-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-6 h-full">
          {[
            { id: 'engagement', match: 'mydata', label: 'My Data (Assigned Surveys)', icon: MessageSquare },
            { id: 'surveys', match: 'surveys', label: 'Surveys & eNPS Dashboard', icon: Trophy },
          ].map((t) => {
            const IconComp = t.icon;
            const active = activeSubTab === t.match;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopContextTab && setTopContextTab(t.id)}
                className={`relative h-full flex items-center gap-1.5 font-medium transition-colors ${
                  active ? 'text-[#0088ff] font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <IconComp size={13} />
                <span>{t.label}</span>
                {active && <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#0088ff] rounded-t" />}
              </button>
            );
          })}
        </div>

        {canLaunchSurvey && (
          <button
            type="button"
            onClick={() => setLaunchModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1.5"
          >
            <Plus size={13} />
            <span>Launch Pulse Survey</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* eNPS & Engagement KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Firm eNPS Score</div>
            <div className={`text-lg font-bold mt-1 ${estimatedEnps >= 30 ? 'text-emerald-600' : estimatedEnps >= 0 ? 'text-[#0088ff]' : 'text-rose-600'}`}>
              {estimatedEnps >= 0 ? `+${estimatedEnps}` : estimatedEnps}
            </div>
            <div className="text-[10px] text-slate-400">Range: -100 to +100</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Avg Satisfaction</div>
            <div className="text-lg font-bold text-slate-800 mt-1">{overallAvg.toFixed(1)} / 5.0</div>
            <div className="text-[10px] text-slate-400">Weighted across active polls</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Total Responses</div>
            <div className="text-lg font-bold text-[#0088ff] mt-1">{totalResponses}</div>
            <div className="text-[10px] text-slate-400">Privacy-safe anonymous collection</div>
          </div>
          <div className="bg-white rounded-md border border-slate-200 p-4">
            <div className="text-[10px] font-bold uppercase text-slate-400">Active Surveys</div>
            <div className="text-lg font-bold text-slate-800 mt-1">{surveys.length}</div>
            <div className="text-[10px] text-slate-400">Pulse &amp; quarterly engagement</div>
          </div>
        </div>

        {/* Surveys List / Collector */}
        {loading ? (
          <div className="bg-white rounded-md border border-slate-200 p-10 text-center text-slate-400">
            Loading employee engagement surveys...
          </div>
        ) : surveys.length === 0 ? (
          <div className="bg-white rounded-md border border-slate-200 p-10 text-center text-slate-500">
            No active pulse surveys yet. {canLaunchSurvey && 'Click "Launch Pulse Survey" to publish one.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {surveys.map((sv) => {
              const draft = responseDrafts[sv.id] || { overallRating: 5, comment: '' };
              const pct = Math.min(100, Math.round((Number(sv.avgRating || 0) / 5) * 100));
              return (
                <div key={sv.id} className="bg-white rounded-md border border-slate-200 p-5 space-y-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 text-xs">{sv.title}</h4>
                        {sv.anonymous && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
                            Anonymous
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">{sv.description}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap">
                      Closes: {sv.closingDate}
                    </span>
                  </div>

                  {/* Score Progress Bar */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Users size={12} className="text-[#0088ff]" />
                        <span>{sv.responseCount || 0} Responses</span>
                      </span>
                      <span className="font-mono font-bold text-[#0088ff]">
                        Avg: {Number(sv.avgRating || 0).toFixed(1)} / 5.0
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-[#0088ff]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  {/* Anonymous Response Collector */}
                  {activeSubTab === 'mydata' && !sv.hasResponded ? (
                    <div className="pt-2 border-t border-slate-100 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="font-semibold text-slate-700">Your Rating (1–5):</label>
                        <select
                          value={draft.overallRating}
                          onChange={(e) =>
                            setResponseDrafts((m) => ({
                              ...m,
                              [sv.id]: { ...draft, overallRating: Number(e.target.value) },
                            }))
                          }
                          className="px-2.5 py-1 border border-slate-300 rounded bg-white text-xs"
                        >
                          {RATING_META.map((r) => (
                            <option key={r.score} value={r.score}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={2}
                        value={draft.comment}
                        onChange={(e) =>
                          setResponseDrafts((m) => ({
                            ...m,
                            [sv.id]: { ...draft, comment: e.target.value },
                          }))
                        }
                        placeholder="Optional anonymous feedback or suggestions..."
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleSubmitResponse(sv.id)}
                          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded flex items-center gap-1.5"
                        >
                          <CheckCircle size={13} />
                          <span>Submit Response</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-emerald-700 font-semibold">
                        {sv.hasResponded ? '✓ You have already responded to this survey' : 'Live eNPS & Pulse Aggregation'}
                      </span>
                      <span className="text-slate-400">Status: {sv.status || 'OPEN'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Launch Pulse Survey Modal */}
      {launchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#191f3a] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-xs font-bold">Launch Employee Pulse Survey</h3>
              <button type="button" onClick={() => setLaunchModalOpen(false)} className="text-slate-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleLaunchSurvey} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Survey Title *</label>
                <input
                  required
                  value={surveyForm.title}
                  onChange={(e) => setSurveyForm({ ...surveyForm, title: e.target.value })}
                  placeholder="e.g. Q4 2026 Workplace Engagement & eNPS Pulse"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description / Prompt *</label>
                <textarea
                  rows={3}
                  required
                  value={surveyForm.description}
                  onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })}
                  placeholder="How likely are you to recommend working here to a colleague?"
                  className="w-full px-3 py-2 border border-slate-300 rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Closing Date *</label>
                  <input
                    type="date"
                    required
                    value={surveyForm.closingDate}
                    onChange={(e) => setSurveyForm({ ...surveyForm, closingDate: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded"
                  />
                </div>
                <label className="inline-flex items-center gap-2 pt-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={surveyForm.anonymous}
                    onChange={(e) => setSurveyForm({ ...surveyForm, anonymous: e.target.checked })}
                  />
                  <span className="font-semibold text-slate-700">Anonymous Mode</span>
                </label>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLaunchModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded"
                >
                  {submitting ? 'Launching...' : 'Publish Survey'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
