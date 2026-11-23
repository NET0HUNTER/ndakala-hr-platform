import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  X,
  CheckCircle,
  Award,
  Target,
  Users,
  MessageSquare,
  Trash2,
} from '../components/Icons';

const KRA_STORAGE_KEY = 'ndakala_perf_kra_v1';
const SKILL_STORAGE_KEY = 'ndakala_perf_skills_v1';
const COMP_STORAGE_KEY = 'ndakala_perf_competencies_v1';
const FEEDBACK_STORAGE_KEY = 'ndakala_perf_feedback360_v1';

const DEFAULT_KRAS = [
  {
    id: 'kra-1',
    title: 'Client Advisory Delivery & SLA Adherence',
    category: 'Client Delivery',
    weightage: 35,
    target: '≥ 95% on-time advisory engagement delivery',
    selfRating: 4.5,
    managerRating: 4.4,
  },
  {
    id: 'kra-2',
    title: 'Billable Utilization & Revenue Realization',
    category: 'Commercial',
    weightage: 25,
    target: '≥ 80% billable utilization across active retainers',
    selfRating: 4.2,
    managerRating: 4.0,
  },
  {
    id: 'kra-3',
    title: 'Statutory & Regulatory Quality Assurance',
    category: 'Compliance',
    weightage: 20,
    target: 'Zero audit findings on KRA / NSSF / SHIF / legal filings',
    selfRating: 4.8,
    managerRating: 4.7,
  },
  {
    id: 'kra-4',
    title: 'Team Mentorship & Knowledge Contribution',
    category: 'People & Culture',
    weightage: 20,
    target: '2 internal workshops & structured associate coaching',
    selfRating: 4.0,
    managerRating: 4.2,
  },
];

const DEFAULT_SKILLS = [
  'Financial Modeling',
  'Tax & Statutory Advisory',
  'Corporate Governance',
  'Client Engagement',
  'Risk & Compliance',
  'Data Analytics',
];

const DEFAULT_COMPETENCIES = [
  {
    id: 'comp-1',
    name: 'Strategic Advisory & Problem Solving',
    cluster: 'Core Consulting',
    expectedLevel: 4,
    selfRating: 4,
    managerRating: 4,
    notes: 'Structures ambiguous client challenges into actionable roadmaps.',
  },
  {
    id: 'comp-2',
    name: 'Kenyan Statutory & Regulatory Rigor',
    cluster: 'Technical Excellence',
    expectedLevel: 4,
    selfRating: 5,
    managerRating: 5,
    notes: 'Maintains mastery of Employment Act 2007, KRA PAYE, SHIF, and Housing Levy updates.',
  },
  {
    id: 'comp-3',
    name: 'Executive Communication & Presence',
    cluster: 'Leadership',
    expectedLevel: 4,
    selfRating: 4,
    managerRating: 3,
    notes: 'Clear board-level memos; continue sharpening concise executive summaries.',
  },
  {
    id: 'comp-4',
    name: 'People Leadership & Delegation',
    cluster: 'Leadership',
    expectedLevel: 3,
    selfRating: 4,
    managerRating: 4,
    notes: 'Coaches associates effectively and conducts timely 1:1 reviews.',
  },
  {
    id: 'comp-5',
    name: 'Ethical Governance & Confidentiality',
    cluster: 'Firm Values',
    expectedLevel: 5,
    selfRating: 5,
    managerRating: 5,
    notes: 'Strict adherence to zero-trust document handling and client confidentiality.',
  },
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

const PROFICIENCY_LABELS = {
  1: { label: '1 - Novice', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  2: { label: '2 - Developing', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  3: { label: '3 - Proficient', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  4: { label: '4 - Advanced', cls: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
  5: { label: '5 - Expert', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

/* ==================== 1. KRA WEIGHTING TABLE ==================== */
export function KraWeightingPanel({ onShowToast }) {
  const [kras, setKras] = useState(() => readJson(KRA_STORAGE_KEY, DEFAULT_KRAS));
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    category: 'Client Delivery',
    weightage: 10,
    target: '',
  });

  const totalWeight = kras.reduce((s, k) => s + Number(k.weightage || 0), 0);
  const weightedScore = kras.reduce(
    (s, k) => s + (Number(k.managerRating || 0) * Number(k.weightage || 0)) / 100,
    0
  );

  const saveKras = (next) => {
    setKras(next);
    writeJson(KRA_STORAGE_KEY, next);
  };

  const handleAddKra = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const next = [
      ...kras,
      {
        id: `kra-${Date.now()}`,
        title: form.title.trim(),
        category: form.category,
        weightage: Number(form.weightage) || 10,
        target: form.target.trim() || 'Meets quarterly benchmark',
        selfRating: 4.0,
        managerRating: 4.0,
      },
    ];
    saveKras(next);
    setForm({ title: '', category: 'Client Delivery', weightage: 10, target: '' });
    setAddOpen(false);
    onShowToast?.('KRA added to weighting table.');
  };

  return (
    <div className="space-y-4">
      {/* KPI Header Bar */}
      <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <Target size={15} className="text-[#0088ff]" />
            <span>Key Result Areas (KRA) Weighting Table</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Define weighted role outcomes and compare Self vs. Manager appraisal scores.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${
              totalWeight === 100
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            Total Weightage: {totalWeight}% {totalWeight === 100 ? '✓ Balanced' : '(Target: 100%)'}
          </span>
          <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-[#0088ff] border border-blue-200">
            Weighted Score: {weightedScore.toFixed(2)} / 5.00
          </span>
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white rounded font-semibold flex items-center gap-1"
          >
            <Plus size={13} />
            <span>Add KRA</span>
          </button>
        </div>
      </div>

      {addOpen && (
        <form
          onSubmit={handleAddKra}
          className="bg-white rounded-md border border-blue-200 p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        >
          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 mb-1">KRA Title *</label>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Digital Transformation Advisory Growth"
              className="w-full px-3 py-1.5 border border-slate-300 rounded"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded bg-white"
            >
              <option>Client Delivery</option>
              <option>Commercial</option>
              <option>Compliance</option>
              <option>People &amp; Culture</option>
              <option>Innovation</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Weightage (%)</label>
            <input
              type="number"
              min="5"
              max="100"
              value={form.weightage}
              onChange={(e) => setForm({ ...form, weightage: Number(e.target.value) })}
              className="w-full px-3 py-1.5 border border-slate-300 rounded font-mono"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block font-semibold text-slate-700 mb-1">Success Target / KPI</label>
            <input
              value={form.target}
              onChange={(e) => setForm({ ...form, target: e.target.value })}
              placeholder="Quantifiable success criteria..."
              className="w-full px-3 py-1.5 border border-slate-300 rounded"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 px-3.5 py-1.5 bg-[#0088ff] text-white font-semibold rounded hover:bg-[#0073d9]"
            >
              Save KRA
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="px-3 py-1.5 border border-slate-300 rounded text-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* KRA Table */}
      <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2.5 px-4 font-semibold">Key Result Area</th>
              <th className="py-2.5 px-3 font-semibold">Category</th>
              <th className="py-2.5 px-3 font-semibold text-center">Weightage (%)</th>
              <th className="py-2.5 px-3 font-semibold text-center">Self Score (1–5)</th>
              <th className="py-2.5 px-3 font-semibold text-center">Manager Score (1–5)</th>
              <th className="py-2.5 px-3 font-semibold text-center">Weighted</th>
              <th className="py-2.5 px-3 font-semibold text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kras.map((k) => {
              const contrib = ((Number(k.managerRating || 0) * Number(k.weightage || 0)) / 100).toFixed(2);
              return (
                <tr key={k.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">{k.title}</div>
                    <div className="text-[11px] text-slate-500">{k.target}</div>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                      {k.category}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={k.weightage}
                      onChange={(e) =>
                        saveKras(
                          kras.map((x) => (x.id === k.id ? { ...x, weightage: Number(e.target.value) } : x))
                        )
                      }
                      className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-mono font-semibold"
                    />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={k.selfRating}
                      onChange={(e) =>
                        saveKras(
                          kras.map((x) => (x.id === k.id ? { ...x, selfRating: Number(e.target.value) } : x))
                        )
                      }
                      className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-mono"
                    />
                  </td>
                  <td className="py-3 px-3 text-center">
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="5"
                      value={k.managerRating}
                      onChange={(e) =>
                        saveKras(
                          kras.map((x) => (x.id === k.id ? { ...x, managerRating: Number(e.target.value) } : x))
                        )
                      }
                      className="w-16 px-2 py-1 border border-blue-200 bg-blue-50/40 rounded text-center font-mono font-semibold text-[#0088ff]"
                    />
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{contrib}</td>
                  <td className="py-3 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        saveKras(kras.filter((x) => x.id !== k.id));
                        onShowToast?.('KRA removed.');
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1"
                      title="Remove KRA"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== 2. SKILL SET MATRIX ==================== */
export function SkillSetMatrixPanel({ employees = [], currentUser, onShowToast }) {
  const [scope, setScope] = useState('ORGANIZATION'); // ORGANIZATION | REPORTEES
  const [search, setSearch] = useState('');
  const [ratings, setRatings] = useState(() => readJson(SKILL_STORAGE_KEY, {}));

  const getRating = (empId, skillIdx) => {
    const key = `${empId}::${skillIdx}`;
    if (ratings[key]) return ratings[key];
    // Deterministic baseline proficiency (3-5)
    const seed = (empId.charCodeAt(empId.length - 1) + skillIdx * 3) % 3;
    return 3 + seed;
  };

  const cycleRating = (empId, skillIdx) => {
    const current = getRating(empId, skillIdx);
    const nextVal = current >= 5 ? 1 : current + 1;
    const nextMap = { ...ratings, [`${empId}::${skillIdx}`]: nextVal };
    setRatings(nextMap);
    writeJson(SKILL_STORAGE_KEY, nextMap);
    onShowToast?.(`Updated ${DEFAULT_SKILLS[skillIdx]} proficiency to Level ${nextVal}.`);
  };

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (scope === 'REPORTEES' && currentUser?.employeeId) {
      const direct = employees.filter((e) => e.managerId === currentUser.employeeId);
      list = direct.length > 0 ? direct : employees.slice(0, 4);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
          (e.employeeNumber || '').toLowerCase().includes(q) ||
          (e.jobTitle || '').toLowerCase().includes(q)
      );
    }
    return list.slice(0, 15);
  }, [employees, scope, search, currentUser?.employeeId]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <Users size={15} className="text-[#0088ff]" />
            <span>Skill Set Matrix (Organization vs. Reportees)</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Click any proficiency cell to calibrate employee capability ratings (1 = Novice to 5 = Expert).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded border border-slate-200 bg-slate-50 p-0.5">
            {[
              { id: 'ORGANIZATION', label: 'Organization' },
              { id: 'REPORTEES', label: 'Reportees' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setScope(s.id)}
                className={`px-3 py-1 rounded text-xs font-semibold ${
                  scope === s.id ? 'bg-[#0088ff] text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter employee or role..."
              className="pl-8 pr-3 py-1.5 border border-slate-300 rounded text-xs w-52"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-md border border-slate-200 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="py-2.5 px-4 font-semibold min-w-[200px] border-r border-slate-200">Employee</th>
              {DEFAULT_SKILLS.map((sk) => (
                <th key={sk} className="py-2.5 px-3 font-semibold text-center min-w-[125px]">
                  {sk}
                </th>
              ))}
              <th className="py-2.5 px-3 font-semibold text-center">Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEmployees.map((emp) => {
              const scores = DEFAULT_SKILLS.map((_, idx) => getRating(emp.id, idx));
              const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
              return (
                <tr key={emp.id} className="hover:bg-slate-50/40">
                  <td className="py-2.5 px-4 border-r border-slate-200">
                    <div className="font-semibold text-slate-800">
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {emp.employeeNumber} • {emp.jobTitle || 'Associate'}
                    </div>
                  </td>
                  {DEFAULT_SKILLS.map((_, idx) => {
                    const val = scores[idx];
                    const meta = PROFICIENCY_LABELS[val] || PROFICIENCY_LABELS[3];
                    return (
                      <td key={idx} className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => cycleRating(emp.id, idx)}
                          className={`px-2 py-1 rounded border text-[10px] font-semibold transition-transform hover:scale-105 ${meta.cls}`}
                          title="Click to cycle proficiency rating (1–5)"
                        >
                          {meta.label}
                        </button>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0088ff]">{avg}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== 3. COMPETENCY FRAMEWORK ==================== */
export function CompetencyFrameworkPanel({ onShowToast }) {
  const [comps, setComps] = useState(() => readJson(COMP_STORAGE_KEY, DEFAULT_COMPETENCIES));

  const updateComp = (id, patch) => {
    const next = comps.map((c) => (c.id === id ? { ...c, ...patch } : c));
    setComps(next);
    writeJson(COMP_STORAGE_KEY, next);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-md border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-800 flex items-center gap-2">
            <Award size={15} className="text-[#0088ff]" />
            <span>Competency Framework Ratings</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Behavioral and technical competencies benchmarked against expected grade proficiency.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            writeJson(COMP_STORAGE_KEY, comps);
            onShowToast?.('Competency framework ratings saved.');
          }}
          className="px-3.5 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded flex items-center gap-1.5"
        >
          <CheckCircle size={13} />
          <span>Save Ratings</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {comps.map((c) => {
          const gap = Number(c.managerRating) - Number(c.expectedLevel);
          const gapBadge =
            gap > 0
              ? { text: `Exceeds (+${gap})`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
              : gap === 0
              ? { text: 'Meets Benchmark', cls: 'bg-blue-50 text-[#0088ff] border-blue-200' }
              : { text: `Dev Gap (${gap})`, cls: 'bg-amber-50 text-amber-800 border-amber-200' };

          return (
            <div key={c.id} className="bg-white rounded-md border border-slate-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {c.cluster}
                  </span>
                  <h5 className="font-semibold text-slate-800 text-xs">{c.name}</h5>
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${gapBadge.cls}`}>
                  {gapBadge.text}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">{c.notes}</p>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                <div>
                  <span className="block text-slate-400 text-[10px]">Expected</span>
                  <span className="font-mono font-bold text-slate-700">Level {c.expectedLevel} / 5</span>
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px]">Self Rating</label>
                  <select
                    value={c.selfRating}
                    onChange={(e) => updateComp(c.id, { selfRating: Number(e.target.value) })}
                    className="mt-0.5 px-2 py-1 border border-slate-200 rounded bg-white font-mono text-xs"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px]">Manager Rating</label>
                  <select
                    value={c.managerRating}
                    onChange={(e) => updateComp(c.id, { managerRating: Number(e.target.value) })}
                    className="mt-0.5 px-2 py-1 border border-blue-200 bg-blue-50/40 rounded font-mono font-semibold text-[#0088ff] text-xs"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} / 5
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== 4. 360-DEGREE PROVIDE FEEDBACK DRAWER ==================== */
export function ProvideFeedbackDrawer({ isOpen, onClose, employees = [], currentUser, onShowToast }) {
  const [history, setHistory] = useState(() =>
    readJson(FEEDBACK_STORAGE_KEY, [
      {
        id: 'fb-1',
        recipientName: 'Amina Ochieng (NDA-2026-0005)',
        type: 'Positive / Kudos',
        tag: 'Client Delivery',
        visibility: 'Shared with Employee & Manager',
        comment: 'Outstanding statutory audit preparation and clear client presentation during Q3 review.',
        author: 'Managing Partner',
        createdAt: '2026-11-20',
      },
    ])
  );

  const [form, setForm] = useState({
    recipientId: employees[0]?.id || '',
    type: 'Positive / Kudos',
    tag: 'Client Delivery',
    visibility: 'Shared with Employee & Manager',
    comment: '',
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.comment.trim()) {
      onShowToast?.('Please enter feedback details before submitting.', 'error');
      return;
    }
    const rec = employees.find((emp) => emp.id === (form.recipientId || employees[0]?.id));
    const entry = {
      id: `fb-${Date.now()}`,
      recipientName: rec ? `${rec.firstName} ${rec.lastName} (${rec.employeeNumber})` : 'Team Colleague',
      type: form.type,
      tag: form.tag,
      visibility: form.visibility,
      comment: form.comment.trim(),
      author:
        form.visibility === 'Anonymous'
          ? 'Anonymous Peer'
          : currentUser?.email?.split('@')[0] || 'Reviewer',
      createdAt: new Date().toISOString().slice(0, 10),
    };
    const next = [entry, ...history];
    setHistory(next);
    writeJson(FEEDBACK_STORAGE_KEY, next);
    setForm({ ...form, comment: '' });
    onShowToast?.('360-degree peer feedback submitted.');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col">
        <div className="px-5 py-4 bg-[#191f3a] text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#0088ff] flex items-center justify-center">
              <MessageSquare size={15} />
            </div>
            <div>
              <h3 className="text-xs font-bold">Provide 360-Degree Feedback</h3>
              <p className="text-[10px] text-slate-300">Continuous peer recognition &amp; constructive coaching</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 border-b border-slate-200 space-y-3 text-xs flex-shrink-0">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Recipient Employee *</label>
            <select
              value={form.recipientId || employees[0]?.id || ''}
              onChange={(e) => setForm({ ...form, recipientId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.firstName} {e.lastName} ({e.employeeNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Feedback Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
              >
                <option>Positive / Kudos</option>
                <option>Constructive Coaching</option>
                <option>360 Peer Review</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Competency / KRA Tag</label>
              <select
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                className="w-full px-2.5 py-2 border border-slate-300 rounded bg-white"
              >
                <option>Client Delivery</option>
                <option>Technical Excellence</option>
                <option>People Leadership</option>
                <option>Ethical Governance</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Visibility</label>
            <select
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded bg-white"
            >
              <option>Shared with Employee &amp; Manager</option>
              <option>Manager Only (Confidential)</option>
              <option>Anonymous</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Feedback Comments *</label>
            <textarea
              rows={3}
              required
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Share specific observations, impact, and actionable guidance..."
              className="w-full px-3 py-2 border border-slate-300 rounded"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-600"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-[#0088ff] hover:bg-[#0073d9] text-white font-semibold rounded"
            >
              Submit Feedback
            </button>
          </div>
        </form>

        {/* Recent 360 Feedback Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 text-xs bg-slate-50">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Recent 360 Feedback ({history.length})
          </h4>
          {history.map((item) => (
            <div key={item.id} className="p-3 bg-white border border-slate-200 rounded-md space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{item.recipientName}</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0088ff] text-[10px] font-semibold">
                  {item.type}
                </span>
              </div>
              <p className="text-slate-600 leading-relaxed">{item.comment}</p>
              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                <span>
                  {item.tag} • {item.visibility}
                </span>
                <span>{item.createdAt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
