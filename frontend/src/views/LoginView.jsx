import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Lock,
} from '../components/Icons';
import { apiGet, apiPost } from '../utils/api';

const PLATFORM_SLIDES = [
  {
    id: 'directory',
    badge: 'People & Lifecycle',
    title: 'Unified People Directory & Onboarding',
    description:
      'Centralize employee profiles, custom directory views, digital onboarding checklists, probation tracking, and seamless internal transfers.',
    highlights: ['360° Profiles', 'Custom Views', 'Probation & Transfers'],
  },
  {
    id: 'leave-time',
    badge: 'Attendance & Time Off',
    title: 'Smart Leave, Shifts & Attendance',
    description:
      'Track daily check-ins, manage Kenyan public holiday calendars, enforce leave carry-over rules, and coordinate team shift rosters effortlessly.',
    highlights: ['Live Check-In', 'Leave Balances', 'Shift Schedules'],
  },
  {
    id: 'payroll',
    badge: 'Kenyan Statutory Payroll',
    title: 'Compliant PAYE, NSSF, SHIF & AHL',
    description:
      'Run multi-group payroll cycles with real-time statutory tax calculations, salary revision letters, bank EFT exports, and certified payslips.',
    highlights: ['PAYE & SHIF Engine', 'EFT & P9 Ready', 'Revision Letters'],
  },
  {
    id: 'performance-gov',
    badge: 'Performance, Projects & DPA',
    title: 'Appraisals, Timesheets & Governance',
    description:
      'Align 6-objective SMART goal sheets, 9-box talent moderation, billable client timesheets, and Kenya DPA 2019 privacy & TOTP security controls.',
    highlights: ['9-Box & Goals', 'Billable Hours', 'DPA 2019 & MFA'],
  },
];

function LoginBackgroundArt() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden select-none"
      style={{
        background: 'linear-gradient(135deg, #06281e 0%, #0b3b2c 45%, #07221a 100%)',
      }}
      aria-hidden="true"
    >
      {/* Top Canopy Highlight Bar & Ambient Center Glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(34, 197, 94, 0.14) 0%, rgba(11, 59, 44, 0.05) 48%, transparent 75%)',
        }}
      />
      {/* Tropical Botanical Leaf & Vein SVG Overlay (matching MyWorkspaceView top banner) */}
      <svg
        className="w-full h-full opacity-55"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {/* Deep Forest Leaf Fronds Layer */}
        <g fill="#14532d" opacity="0.75">
          <ellipse cx="120" cy="55" rx="165" ry="64" transform="rotate(-18 120 55)" />
          <ellipse cx="420" cy="18" rx="185" ry="62" transform="rotate(12 420 18)" />
          <ellipse cx="780" cy="42" rx="210" ry="68" transform="rotate(-14 780 42)" />
          <ellipse cx="1140" cy="28" rx="190" ry="66" transform="rotate(18 1140 28)" />
          <ellipse cx="1380" cy="95" rx="170" ry="60" transform="rotate(-16 1380 95)" />
        </g>

        {/* Signature #166534 Botanical Leaf Ellipses (Top Canopy, Sides & Corners) */}
        <g fill="#166534">
          <ellipse cx="165" cy="110" rx="145" ry="56" transform="rotate(-18 165 110)" />
          <ellipse cx="385" cy="185" rx="155" ry="60" transform="rotate(14 385 185)" />
          <ellipse cx="690" cy="95" rx="180" ry="58" transform="rotate(-12 690 95)" />
          <ellipse cx="1010" cy="170" rx="165" ry="62" transform="rotate(20 1010 170)" />
          <ellipse cx="1290" cy="85" rx="160" ry="58" transform="rotate(-16 1290 85)" />

          {/* Mid & Lower Botanical Clusters Framing the Split Card */}
          <ellipse cx="95" cy="460" rx="150" ry="55" transform="rotate(22 95 460)" />
          <ellipse cx="1355" cy="480" rx="155" ry="58" transform="rotate(-24 1355 480)" />
          <ellipse cx="180" cy="790" rx="175" ry="64" transform="rotate(-15 180 790)" />
          <ellipse cx="490" cy="855" rx="165" ry="58" transform="rotate(14 490 855)" />
          <ellipse cx="940" cy="845" rx="180" ry="62" transform="rotate(-12 940 845)" />
          <ellipse cx="1275" cy="785" rx="170" ry="64" transform="rotate(19 1275 785)" />
        </g>

        {/* Signature #22c55e Sweeping Botanical Leaf Stems / Veins */}
        <g stroke="#22c55e" strokeWidth="1.5" opacity="0.38" fill="none" strokeLinecap="round">
          <path d="M40,260 Q210,80 390,15" />
          <path d="M290,275 Q460,95 640,18" />
          <path d="M580,265 Q760,75 940,22" />
          <path d="M890,275 Q1070,85 1250,16" />
          <path d="M1130,265 Q1290,95 1425,30" />

          <path d="M20,890 Q190,690 360,595" />
          <path d="M340,895 Q520,720 690,640" />
          <path d="M780,895 Q960,720 1130,635" />
          <path d="M1090,890 Q1260,700 1420,590" />
        </g>
      </svg>
    </div>
  );
}

function PlatformSlideArt({ slideId }) {
  if (slideId === 'directory') {
    return (
      <svg viewBox="0 0 300 205" className="w-64 h-44 mx-auto animate-float-slow" fill="none" aria-hidden="true">
        <defs>
          <clipPath id="slide-dir-banner-clip">
            <rect x="36" y="28" width="208" height="28" rx="9" />
          </clipPath>
          <linearGradient id="slide-dir-banner-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#06281e" />
            <stop offset="45%" stopColor="#0b3b2c" />
            <stop offset="100%" stopColor="#07221a" />
          </linearGradient>
        </defs>
        <ellipse cx="150" cy="112" rx="112" ry="72" fill="#e8f3ff" />
        {/* Main Directory Window */}
        <rect x="36" y="28" width="208" height="134" rx="9" fill="#ffffff" stroke="#bfdbfe" strokeWidth="1.5" />
        {/* Post-Login Top Botanical Banner Preview */}
        <g clipPath="url(#slide-dir-banner-clip)">
          <rect x="36" y="28" width="208" height="28" fill="url(#slide-dir-banner-grad)" />
          <ellipse cx="72" cy="34" rx="28" ry="11" fill="#166534" opacity="0.7" transform="rotate(-14 72 34)" />
          <ellipse cx="156" cy="48" rx="34" ry="12" fill="#166534" opacity="0.65" transform="rotate(12 156 48)" />
          <ellipse cx="218" cy="35" rx="30" ry="10" fill="#166534" opacity="0.7" transform="rotate(-16 218 35)" />
          <path d="M52,55 Q95,35 138,29" stroke="#22c55e" strokeWidth="0.9" opacity="0.45" fill="none" />
          <path d="M148,55 Q190,36 232,30" stroke="#22c55e" strokeWidth="0.9" opacity="0.45" fill="none" />
        </g>
        <rect x="164" y="37" width="66" height="10" rx="5" fill="#10b981" fillOpacity="0.24" stroke="#34d399" strokeWidth="0.8" />
        <rect x="172" y="40.5" width="50" height="3" rx="1.5" fill="#a7f3d0" />
        {/* Org Rows */}
        <rect x="50" y="64" width="180" height="24" rx="5" fill="#f8fafc" stroke="#e2e8f0" />
        <circle cx="66" cy="76" r="7" fill="#159aff" />
        <text x="66" y="79" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="700">MP</text>
        <rect x="80" y="71" width="66" height="4.5" rx="2" fill="#334155" />
        <rect x="80" y="79" width="44" height="3.5" rx="1.5" fill="#94a3b8" />
        <rect x="180" y="71" width="40" height="10" rx="5" fill="#dcfce7" />

        <rect x="50" y="96" width="180" height="24" rx="5" fill="#f8fafc" stroke="#e2e8f0" />
        <circle cx="66" cy="108" r="7" fill="#10b981" />
        <text x="66" y="111" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="700">HR</text>
        <rect x="80" y="103" width="78" height="4.5" rx="2" fill="#334155" />
        <rect x="80" y="111" width="52" height="3.5" rx="1.5" fill="#94a3b8" />
        <rect x="180" y="103" width="40" height="10" rx="5" fill="#dbeafe" />

        <rect x="50" y="128" width="180" height="24" rx="5" fill="#f8fafc" stroke="#e2e8f0" />
        <circle cx="66" cy="140" r="7" fill="#6366f1" />
        <text x="66" y="143" textAnchor="middle" fill="#ffffff" fontSize="6" fontWeight="700">LM</text>
        <rect x="80" y="135" width="58" height="4.5" rx="2" fill="#334155" />
        <rect x="80" y="143" width="40" height="3.5" rx="1.5" fill="#94a3b8" />
        <rect x="180" y="135" width="40" height="10" rx="5" fill="#e0e7ff" />

        {/* Floating Check-mark Onboarding Card */}
        <g transform="translate(206, 98)">
          <rect x="0" y="0" width="60" height="58" rx="8" fill="#159aff" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="30" cy="22" r="10" fill="#ffffff" fillOpacity="0.22" />
          <polyline points="25 22 28.5 25.5 36 18" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="14" y="38" width="32" height="4" rx="2" fill="#ffffff" />
          <rect x="18" y="45" width="24" height="3" rx="1.5" fill="#bfdbfe" />
        </g>
        <line x1="34" y1="176" x2="266" y2="176" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (slideId === 'leave-time') {
    return (
      <svg viewBox="0 0 300 205" className="w-64 h-44 mx-auto animate-float-slow" fill="none" aria-hidden="true">
        <ellipse cx="150" cy="112" rx="112" ry="72" fill="#ecfdf5" />
        {/* Calendar Card */}
        <rect x="38" y="30" width="168" height="132" rx="9" fill="#ffffff" stroke="#a7f3d0" strokeWidth="1.5" />
        <rect x="38" y="30" width="168" height="28" rx="9" fill="#10b981" />
        <rect x="54" y="40" width="64" height="7" rx="3.5" fill="#ffffff" />
        <rect x="160" y="39" width="32" height="9" rx="4.5" fill="#ffffff" fillOpacity="0.25" />
        {/* Calendar Matrix */}
        {[0, 1, 2, 3].map((col) =>
          [0, 1, 2].map((row) => {
            const active = (row === 1 && col === 1) || (row === 1 && col === 2);
            const hol = row === 2 && col === 3;
            return (
              <rect
                key={`${row}-${col}`}
                x={54 + col * 36}
                y={72 + row * 26}
                width="26"
                height="18"
                rx="4"
                fill={active ? '#159aff' : hol ? '#fef3c7' : '#f1f5f9'}
              />
            );
          })
        )}
        {/* Floating Check-In Timer */}
        <g transform="translate(178, 76)">
          <rect x="0" y="0" width="84" height="78" rx="9" fill="#0f172a" stroke="#ffffff" strokeWidth="2.5" />
          <circle cx="42" cy="24" r="12" stroke="#10b981" strokeWidth="2.5" />
          <polyline points="42 18 42 24 47 27" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <rect x="18" y="44" width="48" height="6" rx="3" fill="#334155" />
          <rect x="20" y="56" width="44" height="12" rx="4" fill="#10b981" />
        </g>
        <line x1="34" y1="176" x2="266" y2="176" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (slideId === 'payroll') {
    return (
      <svg viewBox="0 0 300 205" className="w-64 h-44 mx-auto animate-float-slow" fill="none" aria-hidden="true">
        <ellipse cx="150" cy="112" rx="112" ry="72" fill="#eff6ff" />
        {/* Payslip Statement Sheet */}
        <rect x="44" y="26" width="186" height="138" rx="9" fill="#ffffff" stroke="#bfdbfe" strokeWidth="1.5" />
        <rect x="44" y="26" width="186" height="28" rx="9" fill="#1e293b" />
        <rect x="58" y="37" width="76" height="6" rx="3" fill="#ffffff" />
        <rect x="174" y="35" width="42" height="10" rx="5" fill="#10b981" />

        {/* Statutory Rows */}
        <rect x="58" y="68" width="70" height="5" rx="2.5" fill="#475569" />
        <rect x="166" y="68" width="48" height="5" rx="2.5" fill="#10b981" />
        <rect x="58" y="84" width="54" height="4.5" rx="2" fill="#94a3b8" />
        <rect x="174" y="84" width="40" height="4.5" rx="2" fill="#fb7185" />
        <rect x="58" y="99" width="68" height="4.5" rx="2" fill="#94a3b8" />
        <rect x="174" y="99" width="40" height="4.5" rx="2" fill="#fb7185" />
        <rect x="58" y="114" width="60" height="4.5" rx="2" fill="#94a3b8" />
        <rect x="174" y="114" width="40" height="4.5" rx="2" fill="#fb7185" />

        <line x1="58" y1="130" x2="216" y2="130" stroke="#e2e8f0" strokeWidth="1.2" />
        <rect x="58" y="140" width="52" height="6" rx="3" fill="#0f172a" />
        <rect x="148" y="138" width="68" height="11" rx="4" fill="#dbeafe" />

        {/* Floating KES Stamp Card */}
        <g transform="translate(198, 96)">
          <rect x="0" y="0" width="66" height="54" rx="8" fill="#159aff" stroke="#ffffff" strokeWidth="2.5" />
          <text x="33" y="24" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">KES</text>
          <rect x="14" y="33" width="38" height="4" rx="2" fill="#dbeafe" />
          <rect x="20" y="41" width="26" height="3.5" rx="1.5" fill="#ffffff" fillOpacity="0.8" />
        </g>
        <line x1="34" y1="176" x2="266" y2="176" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 300 205" className="w-64 h-44 mx-auto animate-float-slow" fill="none" aria-hidden="true">
      <ellipse cx="150" cy="112" rx="112" ry="72" fill="#eef2ff" />
      {/* Analytics + Performance Window */}
      <rect x="40" y="28" width="190" height="134" rx="9" fill="#ffffff" stroke="#c7d2fe" strokeWidth="1.5" />
      <rect x="54" y="42" width="68" height="7" rx="3.5" fill="#6366f1" fillOpacity="0.2" />
      <rect x="54" y="42" width="36" height="7" rx="3.5" fill="#6366f1" />
      {/* Bar Chart */}
      <rect x="58" y="102" width="16" height="38" rx="3" fill="#dbeafe" />
      <rect x="82" y="86" width="16" height="54" rx="3" fill="#93c5fd" />
      <rect x="106" y="72" width="16" height="68" rx="3" fill="#159aff" />
      <rect x="130" y="92" width="16" height="48" rx="3" fill="#a5b4fc" />
      <rect x="154" y="64" width="16" height="76" rx="3" fill="#10b981" />
      <line x1="52" y1="142" x2="180" y2="142" stroke="#cbd5e1" strokeWidth="1.4" />
      {/* Floating Security Shield */}
      <g transform="translate(194, 72)">
        <path
          d="M30 2 L54 11 V28 C54 44 43 56 30 62 C17 56 6 44 6 28 V11 L30 2 Z"
          fill="#159aff"
          stroke="#ffffff"
          strokeWidth="2.5"
        />
        <polyline
          points="20 31 27 38 41 23"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <line x1="34" y1="176" x2="266" y2="176" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function LoginView({
  loginEmail = '',
  setLoginEmail,
  loginPassword = '',
  setLoginPassword,
  onLogin,
  onOpenWhistleblower,
  loading,
  loginError,
  setLoginError,
  onShowToast,
}) {
  const [step, setStep] = useState('identify'); // 'identify' | 'password' | 'mfa' | 'forgot'
  const [localEmail, setLocalEmail] = useState(loginEmail || '');
  const [localPassword, setLocalPassword] = useState(loginPassword || '');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [fieldError, setFieldError] = useState('');
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [branding, setBranding] = useState({ orgName: 'Ndakala Advisory LLP', logoLabel: 'People' });
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryNotice, setRecoveryNotice] = useState('');

  const emailValue = setLoginEmail ? loginEmail : localEmail;
  const passwordValue = setLoginPassword ? loginPassword : localPassword;

  const updateEmail = (val) => {
    setFieldError('');
    if (setLoginError) setLoginError('');
    if (setLoginEmail) setLoginEmail(val);
    else setLocalEmail(val);
  };

  const updatePassword = (val) => {
    setFieldError('');
    if (setLoginError) setLoginError('');
    if (setLoginPassword) setLoginPassword(val);
    else setLocalPassword(val);
  };

  useEffect(() => {
    apiGet('/api/v1/auth/branding')
      .then((res) => {
        if (res && (res.logoLabel || res.orgName)) {
          setBranding({
            orgName: res.orgName || 'Ndakala Advisory LLP',
            logoLabel: res.logoLabel || 'People',
          });
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (carouselPaused) return;
    const timer = setInterval(() => {
      setActiveSlide((s) => (s + 1) % PLATFORM_SLIDES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [carouselPaused]);

  const getInitials = (emailStr) => {
    const local = (emailStr || 'ND').split('@')[0];
    const parts = local.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return local.slice(0, 2).toUpperCase();
  };

  const handleIdentifySubmit = (e) => {
    e.preventDefault();
    const trimmed = emailValue.trim().toLowerCase();
    if (!trimmed) {
      setFieldError('Enter your corporate email address.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter a valid email address (e.g. name@ndakalaadvisory.co.ke).');
      return;
    }
    updateEmail(trimmed);
    setStep('password');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordValue) {
      setFieldError('Please enter your password.');
      return;
    }
    const res = await onLogin(emailValue.trim(), passwordValue);
    if (res?.mfaRequired) {
      setMfaCode('');
      setStep('mfa');
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    const cleaned = mfaCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) {
      setFieldError('Enter the 6-digit verification code from your authenticator app.');
      return;
    }
    await onLogin(emailValue.trim(), passwordValue, cleaned);
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    const trimmed = emailValue.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setFieldError('Enter a valid corporate email address for recovery.');
      return;
    }
    setRecoveryLoading(true);
    setFieldError('');
    try {
      const res = await apiPost('/api/v1/auth/forgot-password', { email: trimmed });
      const msg =
        res?.message ||
        'Recovery request logged. Please check with IT & HR Security for temporary credentials.';
      setRecoveryNotice(msg);
      if (onShowToast) onShowToast('Password recovery request logged.');
    } catch (err) {
      setFieldError(err?.message || 'Unable to submit recovery request.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleChangeAccount = () => {
    setFieldError('');
    if (setLoginError) setLoginError('');
    updatePassword('');
    setMfaCode('');
    setRecoveryNotice('');
    setStep('identify');
  };

  return (
    <div
      className="relative h-screen w-screen overflow-y-auto flex flex-col justify-between bg-[#07221a] text-[#111827] px-4 py-6 sm:py-10"
      style={{
        background: 'linear-gradient(135deg, #06281e 0%, #0b3b2c 45%, #07221a 100%)',
      }}
    >
      <LoginBackgroundArt />

      <div className="hidden sm:block relative z-10" />

      {/* Centered Elevated Split Identity Card */}
      <div className="relative z-10 w-full max-w-[930px] mx-auto bg-white rounded-[8px] border border-emerald-950/30 shadow-[0_24px_64px_rgba(2,18,12,0.55)] overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px]">
        {/* LEFT PANE: Adaptive Multi-Step Sign-In Flow */}
        <div className="md:col-span-7 p-7 sm:p-11 flex flex-col justify-between bg-white">
          <div>
            {/* Clean Brand Lockup with Official 3-Person Ndakala People Emblem */}
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-2.5 select-none">
                <div className="w-8 h-8 bg-[#191f3a] rounded-[7px] flex items-center justify-center shadow-xs flex-shrink-0">
                  <svg viewBox="0 0 36 36" className="w-6 h-6">
                    <circle cx="18" cy="10" r="4.5" fill="#ff5252" />
                    <circle cx="10" cy="15" r="3.5" fill="#ffca28" />
                    <circle cx="26" cy="15" r="3.5" fill="#26a69a" />
                    <path d="M11 27c0-3.8 3.1-6.5 7-6.5s7 2.7 7 6.5" stroke="#42a5f5" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                    <path d="M5 28c0-2.6 2-4.6 4.8-4.6" stroke="#ffca28" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <path d="M31 28c0-2.6-2-4.6-4.8-4.6" stroke="#26a69a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </svg>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[18px] font-bold tracking-tight text-slate-900">
                    Ndakala
                  </span>
                  <span className="text-[16px] font-normal text-slate-500">
                    {branding.logoLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Animated Step Content Wrapper */}
            <div key={step} className="animate-step-in">
              {step === 'identify' && (
                <div className="mb-6">
                  <h1 className="text-[23px] font-semibold text-slate-900 tracking-tight">
                    Sign in
                  </h1>
                  <p className="text-[13.5px] text-slate-500 mt-1">
                    to access <span className="font-medium text-slate-700">Ndakala {branding.logoLabel}</span>
                  </p>
                </div>
              )}

              {(step === 'password' || step === 'mfa') && (
                <div className="mb-5">
                  <h1 className="text-[23px] font-semibold text-slate-900 tracking-tight">
                    {step === 'mfa' ? 'Two-factor verification' : 'Sign in'}
                  </h1>
                  <div className="mt-3 inline-flex items-center gap-2 pl-1.5 pr-3 py-1 bg-[#f5f7fa] border border-[#e2e8f0] rounded-full max-w-full">
                    <span className="w-6 h-6 rounded-full bg-[#159aff] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {getInitials(emailValue)}
                    </span>
                    <span className="text-[12.5px] font-medium text-slate-700 truncate">
                      {emailValue}
                    </span>
                    <button
                      type="button"
                      onClick={handleChangeAccount}
                      className="text-[12px] font-medium text-[#159aff] hover:text-[#0584e8] hover:underline ml-1 flex-shrink-0"
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {step === 'forgot' && (
                <div className="mb-5">
                  <h1 className="text-[23px] font-semibold text-slate-900 tracking-tight">
                    Reset password
                  </h1>
                  <p className="text-[13px] text-slate-500 mt-1">
                    Submit an audit-logged password recovery request to HR &amp; IT Security.
                  </p>
                </div>
              )}

              {/* Server Auth Error */}
              {loginError && (
                <div
                  role="alert"
                  className="mb-4 px-3.5 py-2.5 rounded-[5px] bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-[12.5px] flex items-start gap-2"
                >
                  <AlertCircle size={15} className="mt-0.5 flex-shrink-0 text-[#e11d48]" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Inline Validation Error */}
              {fieldError && (
                <div
                  role="alert"
                  className="mb-4 px-3.5 py-2 rounded-[5px] bg-[#fff1f2] border border-[#fecdd3] text-[#be123c] text-[12px] flex items-center gap-2"
                >
                  <AlertCircle size={14} className="flex-shrink-0 text-[#e11d48]" />
                  <span>{fieldError}</span>
                </div>
              )}

              {/* STEP 1: IDENTIFY EMAIL */}
              {step === 'identify' && (
                <form onSubmit={handleIdentifySubmit} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="login-email-input" className="sr-only">
                      Email address
                    </label>
                    <input
                      id="login-email-input"
                      type="email"
                      autoFocus
                      autoComplete="email"
                      value={emailValue}
                      onChange={(e) => updateEmail(e.target.value)}
                      placeholder="Email address or corporate ID"
                      className="w-full h-[45px] px-3.5 rounded-[5px] border border-[#d1d5db] bg-[#f9fafb] focus:bg-white focus:border-[#159aff] focus:ring-2 focus:ring-[#159aff]/15 outline-none text-[14px] text-slate-900 placeholder:text-slate-400 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-[45px] rounded-[5px] bg-[#159aff] hover:bg-[#0584e8] active:bg-[#0273cc] text-white font-semibold text-[14px] transition-colors shadow-[0_2px_6px_rgba(21,154,255,0.28)] cursor-pointer"
                  >
                    Next
                  </button>
                </form>
              )}

              {/* STEP 2: PASSWORD */}
              {step === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
                  <div className="relative">
                    <label htmlFor="login-password-input" className="sr-only">
                      Password
                    </label>
                    <input
                      id="login-password-input"
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      autoComplete="current-password"
                      value={passwordValue}
                      onChange={(e) => updatePassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full h-[45px] pl-3.5 pr-11 rounded-[5px] border border-[#d1d5db] bg-[#f9fafb] focus:bg-white focus:border-[#159aff] focus:ring-2 focus:ring-[#159aff]/15 outline-none text-[14px] text-slate-900 placeholder:text-slate-400 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-[12.5px]">
                    <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={keepSignedIn}
                        onChange={(e) => setKeepSignedIn(e.target.checked)}
                        className="rounded border-slate-300 text-[#159aff] focus:ring-[#159aff]"
                      />
                      <span>Keep me signed in</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setFieldError('');
                        setRecoveryNotice('');
                        setStep('forgot');
                      }}
                      className="font-medium text-[#159aff] hover:text-[#0584e8] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[45px] rounded-[5px] bg-[#159aff] hover:bg-[#0584e8] active:bg-[#0273cc] text-white font-semibold text-[14px] transition-colors shadow-[0_2px_6px_rgba(21,154,255,0.28)] disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    <Lock size={14} />
                    <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                  </button>
                </form>
              )}

              {/* STEP 3: TOTP MFA CHALLENGE */}
              {step === 'mfa' && (
                <form onSubmit={handleMfaSubmit} className="space-y-4" noValidate>
                  <p className="text-[12.5px] text-slate-600 leading-relaxed">
                    Enter the 6-digit verification code from your authenticator app to complete sign-in.
                  </p>
                  <div>
                    <label htmlFor="login-mfa-input" className="sr-only">
                      6-digit verification code
                    </label>
                    <input
                      id="login-mfa-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus
                      value={mfaCode}
                      onChange={(e) => {
                        setFieldError('');
                        setMfaCode(e.target.value.replace(/[^0-9]/g, ''));
                      }}
                      placeholder="6-digit authenticator code"
                      className="w-full h-[45px] px-3.5 rounded-[5px] border border-[#d1d5db] bg-[#f9fafb] focus:bg-white focus:border-[#159aff] focus:ring-2 focus:ring-[#159aff]/15 outline-none text-[15px] font-mono tracking-[0.25em] text-slate-900 placeholder:tracking-normal placeholder:font-sans placeholder:text-slate-400 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-[45px] rounded-[5px] bg-[#159aff] hover:bg-[#0584e8] text-white font-semibold text-[14px] transition-colors disabled:opacity-60"
                  >
                    {loading ? 'Verifying...' : 'Verify & Sign In'}
                  </button>
                </form>
              )}

              {/* RECOVERY MODE: FORGOT PASSWORD */}
              {step === 'forgot' && (
                <form onSubmit={handleForgotSubmit} className="space-y-4" noValidate>
                  <div>
                    <label htmlFor="forgot-email-input" className="sr-only">
                      Corporate email address
                    </label>
                    <input
                      id="forgot-email-input"
                      type="email"
                      autoFocus
                      value={emailValue}
                      onChange={(e) => updateEmail(e.target.value)}
                      placeholder="Enter your corporate email address"
                      className="w-full h-[45px] px-3.5 rounded-[5px] border border-[#d1d5db] bg-[#f9fafb] focus:bg-white focus:border-[#159aff] focus:ring-2 focus:ring-[#159aff]/15 outline-none text-[14px] text-slate-900 transition-all"
                    />
                  </div>

                  {recoveryNotice && (
                    <div className="p-3 rounded-[5px] bg-emerald-50 border border-emerald-200 text-emerald-800 text-[12px] flex items-start gap-2">
                      <CheckCircle size={15} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                      <span>{recoveryNotice}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <button
                      type="submit"
                      disabled={recoveryLoading}
                      className="w-full h-[45px] rounded-[5px] bg-[#159aff] hover:bg-[#0584e8] text-white font-semibold text-[14px] transition-colors disabled:opacity-60"
                    >
                      {recoveryLoading ? 'Submitting request...' : 'Request Password Reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFieldError('');
                        setRecoveryNotice('');
                        setStep(emailValue ? 'password' : 'identify');
                      }}
                      className="w-full py-2 text-[12.5px] font-medium text-slate-600 hover:text-slate-900"
                    >
                      Back to Sign in
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Confidential Whistleblower Channel Link */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[12px]">
            <button
              type="button"
              onClick={onOpenWhistleblower}
              className="text-slate-600 hover:text-[#159aff] font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck size={15} className="text-[#159aff]" />
              <span>Report an Ethics Concern</span>
            </button>
            <span className="text-[11px] text-slate-400">Encrypted Session</span>
          </div>
        </div>

        {/* RIGHT PANE: Smooth Sliding Platform Showcase Carousel */}
        <div
          onMouseEnter={() => setCarouselPaused(true)}
          onMouseLeave={() => setCarouselPaused(false)}
          className="hidden md:flex md:col-span-5 flex-col justify-between p-8 bg-gradient-to-b from-[#fafcff] to-[#f4f8ff] border-l border-[#e8edf5] overflow-hidden"
        >
          {/* Slide Header & Arrow Controls */}
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 text-[10.5px] font-semibold text-[#159aff] bg-[#eff6ff] border border-[#dbeafe] rounded-full transition-colors">
              {PLATFORM_SLIDES[activeSlide].badge}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous platform highlight"
                onClick={() =>
                  setActiveSlide((s) => (s - 1 + PLATFORM_SLIDES.length) % PLATFORM_SLIDES.length)
                }
                className="w-6 h-6 rounded-full border border-slate-200 bg-white hover:border-[#159aff] text-slate-500 hover:text-[#159aff] flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                type="button"
                aria-label="Next platform highlight"
                onClick={() => setActiveSlide((s) => (s + 1) % PLATFORM_SLIDES.length)}
                className="w-6 h-6 rounded-full border border-slate-200 bg-white hover:border-[#159aff] text-slate-500 hover:text-[#159aff] flex items-center justify-center transition-colors"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Smooth Horizontal Track Slider */}
          <div className="overflow-hidden my-auto py-3">
            <div
              className="flex transition-transform duration-500 ease-out"
              style={{ transform: `translateX(-${activeSlide * 100}%)` }}
            >
              {PLATFORM_SLIDES.map((slide) => (
                <div key={slide.id} className="w-full flex-shrink-0 text-center px-1 space-y-4">
                  <PlatformSlideArt slideId={slide.id} />
                  <div className="space-y-2 max-w-[290px] mx-auto">
                    <h2 className="text-[15.5px] font-semibold text-slate-900 leading-snug">
                      {slide.title}
                    </h2>
                    <p className="text-[12.5px] text-slate-500 leading-relaxed">
                      {slide.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                    {slide.highlights.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-[10.5px] font-medium text-slate-600 bg-white border border-slate-200/90 rounded-full shadow-2xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Carousel Dots */}
          <div className="flex items-center justify-center gap-2 pt-2" role="tablist" aria-label="Platform capabilities">
            {PLATFORM_SLIDES.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={activeSlide === idx}
                aria-label={s.title}
                onClick={() => setActiveSlide(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  activeSlide === idx
                    ? 'w-6 bg-[#159aff]'
                    : 'w-1.5 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Legal Footer */}
      <footer className="relative z-10 mt-6 text-center text-[11.5px] text-emerald-100/80 space-y-1">
        <p>
          &copy; 2026 {branding.orgName}. All Rights Reserved. &bull; 246 Owashika Road, Lavington, Nairobi
        </p>
      </footer>
    </div>
  );
}

export default LoginView;
