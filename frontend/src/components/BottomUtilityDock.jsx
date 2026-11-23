import React, { useState, useEffect } from 'react';
import {
  Pin,
  MessageSquare,
  Users,
  HelpCircle,
  X,
  Search,
  ExternalLink,
  Plus,
  Trash2,
  Globe,
  Check,
} from './Icons';

export default function BottomUtilityDock({
  employees = [],
  currentUser,
  onNavigateTab,
}) {
  const corporateDomain =
    currentUser?.email?.split('@')[1] ||
    employees[0]?.workEmail?.split('@')[1] ||
    employees[0]?.email?.split('@')[1] ||
    'domain.com';
  const supportEmail = `support@${corporateDomain}`;
  const [activeDrawer, setActiveDrawer] = useState(null); // 'pins', 'chats', 'contacts', 'support', null
  const [language, setLanguage] = useState('English');
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  // My Pins State (persisted in localStorage)
  const [pins, setPins] = useState(() => {
    try {
      const saved = localStorage.getItem('ndakala_my_pins');
      return saved
        ? JSON.parse(saved)
        : [
            { id: '1', title: 'Advisory Project Milestones Q4', tag: 'High Priority', time: 'Pinned Today' },
            { id: '2', title: 'Kenyan SHIF & Housing Levy Guidelines', tag: 'Compliance', time: 'Pinned Yesterday' },
          ];
    } catch {
      return [];
    }
  });
  const [newPinTitle, setNewPinTitle] = useState('');

  // Support Search
  const [supportQuery, setSupportQuery] = useState('');
  const [contactQuery, setContactQuery] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem('ndakala_my_pins', JSON.stringify(pins));
    } catch {
      // silent
    }
  }, [pins]);

  const handleAddPin = (e) => {
    e.preventDefault();
    if (!newPinTitle.trim()) return;
    const newEntry = {
      id: String(Date.now()),
      title: newPinTitle.trim(),
      tag: 'Quick Note',
      time: 'Just now',
    };
    setPins([newEntry, ...pins]);
    setNewPinTitle('');
  };

  const handleDeletePin = (id) => {
    setPins(pins.filter((p) => p.id !== id));
  };

  const supportFaqs = [
    {
      q: 'How are Kenyan statutory deductions calculated?',
      a: 'PAYE uses progressive KRA bands, NSSF follows Tier I/II ceiling, SHIF is 2.75% of gross pay, and Affordable Housing Levy is 1.5% with dual employer matching.',
    },
    {
      q: 'How does leave carry-over work?',
      a: 'Statutory annual leave allows up to 5 days carry-over with manager approval, expiring after 180 days per Kenyan Employment Act 2007.',
    },
    {
      q: 'How does Microsoft 365 SharePoint dual-write work?',
      a: 'All employee documents and HR letters are written simultaneously to the AES-256 local vault and the firm’s encrypted SharePoint document library.',
    },
    {
      q: 'Where do I find my digital payslip?',
      a: 'Go to Compensation > Payroll & Payslips or My Space > Overview > Files to preview and download certified PDF payslips.',
    },
  ];

  const filteredFaqs = supportFaqs.filter(
    (f) =>
      f.q.toLowerCase().includes(supportQuery.toLowerCase()) ||
      f.a.toLowerCase().includes(supportQuery.toLowerCase())
  );

  const filteredContacts = employees.filter((emp) => {
    const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.toLowerCase();
    const email = (emp.workEmail || '').toLowerCase();
    const dept = (emp.department?.name || emp.department || '').toLowerCase();
    const q = contactQuery.toLowerCase();
    return fullName.includes(q) || email.includes(q) || dept.includes(q);
  });

  return (
    <>
      {/* ==================== PINNED BOTTOM UTILITY BAR (28px) ==================== */}
      <footer className="h-7 bg-[#191f3a] text-slate-300 text-[11px] border-t border-[#12172d] px-4 flex items-center justify-between flex-shrink-0 z-40 select-none">
        {/* Left: Language Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangDropdownOpen(!langDropdownOpen)}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors"
          >
            <Globe size={13} className="text-[#0088ff]" />
            <span>{language}</span>
          </button>

          {langDropdownOpen && (
            <div className="absolute bottom-8 left-0 w-32 bg-white text-slate-800 rounded shadow-xl border border-slate-200 py-1 z-50 animate-fadeIn">
              {['English', 'Kiswahili'].map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    setLanguage(lang);
                    setLangDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between ${
                    language === lang ? 'bg-blue-50 text-[#0088ff] font-semibold' : 'hover:bg-slate-50'
                  }`}
                >
                  <span>{lang}</span>
                  {language === lang && <Check size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Utility dock items matching Zoho People */}
        <div className="flex items-center space-x-5">
          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'pins' ? null : 'pins')}
            className={`flex items-center gap-1.5 transition-colors ${
              activeDrawer === 'pins' ? 'text-amber-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Pin size={12} className="text-amber-400" />
            <span>My Pins</span>
            {pins.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded-full text-[10px]">
                {pins.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'chats' ? null : 'chats')}
            className={`flex items-center gap-1.5 transition-colors ${
              activeDrawer === 'chats' ? 'text-[#0088ff] font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare size={12} className="text-[#0088ff]" />
            <span>Chats</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'contacts' ? null : 'contacts')}
            className={`flex items-center gap-1.5 transition-colors ${
              activeDrawer === 'contacts' ? 'text-emerald-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users size={12} className="text-emerald-400" />
            <span>Contacts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveDrawer(activeDrawer === 'support' ? null : 'support')}
            className={`flex items-center gap-1.5 transition-colors ${
              activeDrawer === 'support' ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle size={12} className="text-cyan-400" />
            <span>Support Hub</span>
          </button>
        </div>
      </footer>

      {/* ==================== SLIDE-OVER DRAWERS ==================== */}

      {/* 1. Support Hub Drawer (Zoho People Help Widget) */}
      {activeDrawer === 'support' && (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slideLeft">
          <div className="p-4 bg-[#191f3a] text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded bg-[#0088ff] flex items-center justify-center font-bold text-xs">
                NP
              </div>
              <div>
                <h3 className="text-xs font-bold">Welcome to Zoho People Help widget</h3>
                <p className="text-[10px] text-slate-300">Ndakala Advisory Knowledge & Support</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={supportQuery}
                onChange={(e) => setSupportQuery(e.target.value)}
                placeholder="Search FAQs, Kenya statutory policies..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#0088ff]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div>
              <h4 className="font-semibold text-slate-800 mb-2 uppercase text-[10px] tracking-wider text-slate-400">
                Frequently Asked Questions
              </h4>
              <div className="space-y-2.5">
                {filteredFaqs.map((faq, i) => (
                  <div key={i} className="p-3 border border-slate-200 rounded-lg hover:border-blue-200 transition-colors">
                    <p className="font-semibold text-slate-900 mb-1">{faq.q}</p>
                    <p className="text-slate-600 leading-relaxed text-[11px]">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-lg">
              <h5 className="font-bold text-[#0088ff] mb-1">Direct HR Support Desk</h5>
              <p className="text-slate-600 text-[11px] mb-2">
                Need urgent assistance with payroll reconciliation, M365 authentication, or leave disputes?
              </p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold text-slate-800">
                  {supportEmail}
                </span>
                <span className="text-[10px] text-slate-500">• 08:30 - 17:30 EAT</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. My Pins Drawer */}
      {activeDrawer === 'pins' && (
        <div className="fixed inset-y-0 right-0 w-[380px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slideLeft">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pin size={16} className="text-amber-500" />
              <h3 className="text-xs font-bold text-slate-800">My Pins & Quick Notes</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleAddPin} className="p-3 bg-white border-b border-slate-100 flex gap-2">
            <input
              type="text"
              value={newPinTitle}
              onChange={(e) => setNewPinTitle(e.target.value)}
              placeholder="Pin a quick note or task..."
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#0088ff]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-[#0088ff] text-white rounded text-xs font-medium hover:bg-[#0073d9]"
            >
              <Plus size={14} />
            </button>
          </form>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {pins.map((pin) => (
              <div
                key={pin.id}
                className="p-3 border border-slate-200 rounded-lg bg-amber-50/30 flex items-start justify-between group hover:border-amber-300 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-800 mb-1">{pin.title}</p>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
                      {pin.tag}
                    </span>
                    <span>{pin.time}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePin(pin.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 p-1 transition-opacity"
                  title="Remove Pin"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {pins.length === 0 && (
              <div className="py-12 text-center text-slate-400 text-xs">No pinned notes yet.</div>
            )}
          </div>
        </div>
      )}

      {/* 3. Contacts Drawer */}
      {activeDrawer === 'contacts' && (
        <div className="fixed inset-y-0 right-0 w-[400px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slideLeft">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-emerald-500" />
              <h3 className="text-xs font-bold text-slate-800">Firm Directory & Contacts</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Search colleagues by name, email, department..."
                className="w-full pl-9 pr-3 py-1.5 border border-slate-300 rounded text-xs focus:outline-none focus:border-[#0088ff]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs">
            {filteredContacts.map((emp) => (
              <div key={emp.id} className="p-3 hover:bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">
                    {emp.firstName} {emp.lastName}
                  </p>
                  <p className="text-[11px] text-slate-500">{emp.jobTitle || emp.position?.title || 'Team Member'}</p>
                  <p className="font-mono text-[10px] text-[#0088ff]">{emp.workEmail || '-'}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {emp.department?.name || emp.department || 'Advisory'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Chats Drawer */}
      {activeDrawer === 'chats' && (
        <div className="fixed inset-y-0 right-0 w-[380px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-slideLeft">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-[#0088ff]" />
              <h3 className="text-xs font-bold text-slate-800">Team Wall & Direct Pings</h3>
            </div>
            <button
              type="button"
              onClick={() => setActiveDrawer(null)}
              className="text-slate-400 hover:text-slate-700 p-1"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 p-4 flex flex-col items-center justify-center text-center text-xs text-slate-500">
            <MessageSquare size={36} className="text-slate-300 mb-2" />
            <p className="font-medium text-slate-700">Team Wall Active</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[240px]">
              Use Team Space Wall to publish announcements, share kudos, or review partner updates.
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveDrawer(null);
                onNavigateTab?.('workspace', 'team');
              }}
              className="mt-3 px-3 py-1.5 bg-[#0088ff] text-white rounded font-medium hover:bg-[#0073d9]"
            >
              Go to Team Space Wall →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
