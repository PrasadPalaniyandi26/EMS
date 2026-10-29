'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, TrendingUp, ShieldCheck, BarChart3 } from 'lucide-react';

const METRICS = [
  { icon: TrendingUp,   label: 'Smart Approvals',  value: 'Multi-level'  },
  { icon: BarChart3,    label: 'Live Analytics',    value: 'Real-time'    },
  { icon: ShieldCheck,  label: 'Audit Ready',       value: 'Full trail'   },
];

export default function LoginPage() {
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const login  = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ username, password });
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex overflow-hidden" style={{ background: 'linear-gradient(150deg, #09091e 0%, #070a1c 28%, #060c18 55%, #05080d 100%)' }}>

      {/* ── Keyframe animations ──────────────────────────────── */}
      <style>{`
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1);   opacity: 0.55; }
          50%       { transform: scale(1.08); opacity: 0.18; }
        }
        @keyframes ring-pulse-2 {
          0%, 100% { transform: scale(1);   opacity: 0.30; }
          50%       { transform: scale(1.16); opacity: 0.06; }
        }
        @keyframes ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes inr-glow {
          0%, 100% { filter: drop-shadow(0 0 18px rgba(34,211,238,0.55)) drop-shadow(0 0 40px rgba(59,130,246,0.35)); }
          50%       { filter: drop-shadow(0 0 32px rgba(34,211,238,0.85)) drop-shadow(0 0 70px rgba(59,130,246,0.55)); }
        }
        @keyframes chart-draw {
          from { stroke-dashoffset: 600; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes ticker-float {
          0%, 100% { opacity: 0.045; transform: translateY(0px); }
          50%       { opacity: 0.085; transform: translateY(-4px); }
        }
        @keyframes shimmer-pass {
          0%   { left: -100%; }
          100% { left: 200%;  }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .ring-pulse-1 { animation: ring-pulse   3.4s ease-in-out infinite; }
        .ring-pulse-2 { animation: ring-pulse-2 3.4s ease-in-out infinite 1.2s; }
        .ring-spin    { animation: ring-spin    18s  linear    infinite; }
        .inr-glow     { animation: inr-glow     2.8s ease-in-out infinite; }
        .ticker-float { animation: ticker-float 4s   ease-in-out infinite; }
        .fade-up      { animation: fade-up      0.7s ease-out  both; }
        @media (prefers-reduced-motion: reduce) {
          .ring-pulse-1, .ring-pulse-2, .ring-spin, .inr-glow, .ticker-float, .fade-up { animation: none; }
          .fade-up { opacity: 1; }
        }
      `}</style>

      {/* ── Global ambient blobs ──────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-5%] w-[700px] h-[700px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[-15%] left-[15%] w-[550px] h-[550px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 65%)' }} />
        <div className="absolute top-[25%] right-[5%] w-[420px] h-[420px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 65%)' }} />
        <div className="absolute bottom-[10%] right-[-5%] w-[300px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)' }} />
      </div>

      {/* ── Finance atmosphere: subtle chart lines ────────────── */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
        <defs>
          {/* Fine grid */}
          <pattern id="grid" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(96,165,250,0.055)" strokeWidth="0.6"/>
          </pattern>
          {/* Larger grid accent */}
          <pattern id="grid-lg" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(96,165,250,0.09)" strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <rect width="100%" height="100%" fill="url(#grid-lg)" />
        {/* Sparkline — left panel decorative chart */}
        <polyline
          points="40,520 110,480 180,500 250,440 320,460 390,390 460,410 530,350"
          fill="none" stroke="rgba(34,211,238,0.12)" strokeWidth="1.5"
          strokeDasharray="600" style={{ animation: 'chart-draw 3s ease-out 0.5s both' }} />
        <polyline
          points="60,560 140,530 200,545 280,495 360,515 440,465 510,480 580,430"
          fill="none" stroke="rgba(59,130,246,0.08)" strokeWidth="1"
          strokeDasharray="600" style={{ animation: 'chart-draw 3.5s ease-out 1s both' }} />
      </svg>

      {/* ── Floating ticker ghosts ────────────────────────────── */}
      {[
        { t: 'NIFTY +1.24%',   x: '5%',  y: '12%', d: '0s'   },
        { t: 'SENSEX 82,340',  x: '12%', y: '68%', d: '1.1s'  },
        { t: 'Q2 FY26',        x: '6%',  y: '42%', d: '0.5s'  },
        { t: 'BUDGET ₹14.2L',  x: '8%',  y: '85%', d: '1.8s'  },
      ].map((tk) => (
        <div key={tk.t} aria-hidden className="ticker-float absolute pointer-events-none select-none font-mono text-[11px] font-bold tracking-widest"
          style={{ left: tk.x, top: tk.y, color: 'rgba(96,165,250,0.55)', animationDelay: tk.d }}>
          {tk.t}
        </div>
      ))}

      {/* ══════════════════════════════════════════════════════════
          LEFT PANEL — branding (45%)
      ══════════════════════════════════════════════════════════ */}
      <div className="hidden lg:flex flex-col w-[45%] relative shrink-0" style={{ zIndex: 1 }}>

        {/* Left panel background — straight horizontal fade for seamless blend */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to right, rgba(9,9,28,0.72) 0%, rgba(7,9,22,0.55) 40%, rgba(6,9,18,0.22) 72%, transparent 100%)' }} />

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-14">

          {/* NTEMS wordmark */}
          <div className="text-center mb-2 fade-up">
            {/* Geometric accent lines */}
            <div className="flex items-center gap-3 justify-center mb-5">
              <div className="h-px flex-1 max-w-[48px]"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5))' }} />
              <span className="text-[11px] tracking-[0.4em] uppercase font-semibold"
                style={{ color: "rgba(34,211,238,0.8)" }}>Est. 2024</span>
              <div className="h-px flex-1 max-w-[48px]"
                style={{ background: 'linear-gradient(90deg, rgba(34,211,238,0.5), transparent)' }} />
            </div>

            <div className="relative inline-block">
              <h1
                className="font-black leading-none select-none"
                style={{
                  fontSize: 'clamp(38px, 4.8vw, 58px)',
                  fontFamily: 'var(--font-raleway)',
                  background: `linear-gradient(
                    170deg,
                    rgba(210,225,245,0.82)  0%,
                    rgba(180,210,248,0.78) 28%,
                    rgba(96,165,250,0.88)  50%,
                    rgba(34,211,238,0.82)  62%,
                    rgba(148,174,210,0.45) 75%,
                    rgba(100,130,180,0.30) 100%
                  )`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 2px 16px rgba(34,211,238,0.14)) drop-shadow(0 0 32px rgba(59,130,246,0.12))',
                  letterSpacing: '0.36em',
                }}
              >
                NTEMS
              </h1>
              {/* Shimmer sweep */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-sm" aria-hidden>
                <div style={{
                  position: 'absolute', top: 0, bottom: 0, width: '40%',
                  background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)',
                  animation: 'shimmer-pass 4s ease-in-out infinite 2s',
                }} />
              </div>
            </div>

            <p className="text-[11px] tracking-[0.38em] uppercase mt-3 font-semibold"
              style={{ color: "rgba(148,163,184,0.8)", letterSpacing: '0.38em' }}>
              Expense · Management · System
            </p>

            {/* Underline accent */}
            <div className="mx-auto mt-4 h-px w-32"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.4) 30%, rgba(96,165,250,0.6) 50%, rgba(34,211,238,0.4) 70%, transparent)' }} />
          </div>

          {/* ₹ Symbol — dynamic with animated rings */}
          <div className="relative flex items-center justify-center my-10 fade-up" style={{ animationDelay: '0.15s' }}>

            {/* Outermost pulse ring */}
            <div className="ring-pulse-2 absolute rounded-full"
              style={{ width: '240px', height: '240px', border: '1px solid rgba(34,211,238,0.22)' }} />

            {/* Middle pulse ring */}
            <div className="ring-pulse-1 absolute rounded-full"
              style={{ width: '196px', height: '196px', border: '1.5px solid rgba(96,165,250,0.28)' }} />

            {/* Rotating dashed accent ring */}
            <svg className="ring-spin absolute" width="172" height="172" viewBox="0 0 172 172" aria-hidden>
              <circle cx="86" cy="86" r="82"
                fill="none"
                stroke="url(#ring-grad)"
                strokeWidth="1.2"
                strokeDasharray="12 8"
                strokeLinecap="round" />
              <defs>
                <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"   stopColor="rgba(34,211,238,0.6)" />
                  <stop offset="50%"  stopColor="rgba(96,165,250,0.3)" />
                  <stop offset="100%" stopColor="rgba(34,211,238,0.05)" />
                </linearGradient>
              </defs>
            </svg>

            {/* Inner circle */}
            <div className="relative w-36 h-36 rounded-full flex items-center justify-center"
              style={{
                background: 'radial-gradient(circle at 40% 35%, rgba(34,211,238,0.12) 0%, rgba(59,130,246,0.06) 50%, rgba(6,12,24,0.4) 100%)',
                border: '1.5px solid rgba(34,211,238,0.25)',
                boxShadow: '0 0 0 1px rgba(34,211,238,0.08), 0 8px 48px rgba(34,211,238,0.12), inset 0 1px 0 rgba(34,211,238,0.15), inset 0 -1px 0 rgba(59,130,246,0.08)',
              }}>

              {/* ₹ glyph */}
              <span
                className="inr-glow select-none font-black leading-none"
                style={{
                  fontSize: '104px',
                  lineHeight: 1,
                  background: 'linear-gradient(150deg, rgba(255,255,255,0.95) 0%, rgba(34,211,238,0.95) 40%, rgba(96,165,250,0.85) 70%, rgba(34,211,238,0.6) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontFamily: 'serif',
                }}
              >
                ₹
              </span>

              {/* Inner core glow */}
              <div className="absolute inset-0 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 40%, rgba(34,211,238,0.08) 0%, transparent 65%)' }} />
            </div>
          </div>

          {/* Metric chips */}
          <div className="flex items-center gap-3 mt-2 fade-up" style={{ animationDelay: '0.3s' }}>
            {METRICS.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col items-center gap-1 px-3.5 py-2.5 rounded-xl"
                style={{
                  background: 'rgba(34,211,238,0.04)',
                  border: '1px solid rgba(34,211,238,0.1)',
                }}>
                <Icon className="w-3 h-3" style={{ color: "rgba(34,211,238,0.8)" }} />
                <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: "rgba(148,163,184,0.8)" }}>{label}</span>
                <span className="text-[11px] font-semibold" style={{ color: "rgba(34,211,238,0.8)" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 px-14 pb-10 text-center fade-up" style={{ animationDelay: '0.45s' }}>
          <p className="text-[13px] font-semibold tracking-wide mb-1.5"
            style={{ color: "rgba(226,232,240,0.65)" }}>
            Where Innovation Meets Automation
          </p>
          <p className="text-[11px] leading-relaxed"
            style={{ color: "rgba(148,163,184,0.65)" }}>
            Streamlined approvals · Real-time budgets · Financial intelligence
          </p>
        </div>
      </div>

      {/* Subtle vertical accent at panel boundary */}
      <div className="hidden lg:block absolute top-[10%] bottom-[10%] w-px pointer-events-none"
        style={{ left: '45%', zIndex: 2,
          background: 'linear-gradient(to bottom, transparent, rgba(34,211,238,0.12) 30%, rgba(34,211,238,0.12) 70%, transparent)' }} />

      {/* ══════════════════════════════════════════════════════════
          RIGHT PANEL — login (55%)
      ══════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center px-8 py-12 relative" style={{ zIndex: 3 }}>

        <div className="w-full max-w-[460px] fade-up" style={{ animationDelay: '0.2s' }}>

          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-10">
            <span className="text-[34px] font-black tracking-[0.18em]"
              style={{
                fontFamily: 'var(--font-raleway)',
                background: 'linear-gradient(135deg, #fff 0%, #60a5fa 50%, #22d3ee 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
              NTEMS
            </span>
            <p className="text-[11px] mt-2 tracking-[0.28em] uppercase" style={{ color: "rgba(148,163,184,0.75)" }}>
              Expense Management System
            </p>
          </div>

          {/* ── Login card ── */}
          <div
            className="rounded-2xl relative overflow-hidden"
            style={{
              padding: '40px 44px 36px',
              background: 'linear-gradient(145deg, rgba(18,28,52,0.96) 0%, rgba(14,22,42,0.98) 100%)',
              border: '1px solid rgba(34,211,238,0.18)',
              boxShadow: '0 0 0 1px rgba(34,211,238,0.06), 0 48px 96px rgba(0,0,0,0.55), 0 24px 48px rgba(6,12,24,0.4), inset 0 1px 0 rgba(34,211,238,0.12), inset 0 -1px 0 rgba(59,130,246,0.06)',
              backdropFilter: 'blur(32px)',
            }}
          >
            {/* Top glow line */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-56 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.55), rgba(96,165,250,0.4), transparent)' }} />

            {/* Corner decorations */}
            <div className="absolute top-0 left-0 w-16 h-16 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 0% 0%, rgba(34,211,238,0.08) 0%, transparent 70%)' }} />
            <div className="absolute bottom-0 right-0 w-20 h-20 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 100% 100%, rgba(96,165,250,0.06) 0%, transparent 70%)' }} />

            {/* Status indicator */}
            <div className="absolute top-5 right-5 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22d3ee', boxShadow: '0 0 6px rgba(34,211,238,0.8)', animation: 'ring-pulse 2s ease-in-out infinite' }} />
              <span className="text-[11px] tracking-[0.2em] uppercase font-semibold" style={{ color: "rgba(34,211,238,0.75)" }}>Secure</span>
            </div>

            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-px" style={{ background: 'rgba(34,211,238,0.5)' }} />
                <p className="text-[11px] font-bold tracking-[0.28em] uppercase"
                  style={{ color: 'rgba(34,211,238,0.75)' }}>
                  Secure Portal
                </p>
              </div>
              <h2 className="text-[22px] font-bold tracking-tight" style={{ color: 'rgba(241,245,249,0.92)' }}>
                Sign in to your workspace
              </h2>
              <p className="text-[12px] mt-1" style={{ color: "rgba(148,163,184,0.8)" }}>
                Use your Employee ID or username to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div role="alert" className="rounded-xl px-4 py-3 text-[12.5px] font-medium flex items-center gap-2.5"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgb(252,165,165)' }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--danger)] shrink-0" />
                  {error}
                </div>
              )}

              {/* Employee ID */}
              <div className="space-y-2">
                <Label htmlFor="username"
                  className="text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "rgba(148,163,184,0.85)" }}>
                  Employee ID / User Name
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="NT10001 or username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="h-12 text-[13.5px] rounded-xl w-full transition-all duration-200 placeholder:text-[rgba(148,163,184,0.6)]"
                  style={{
                    background: 'rgba(34,211,238,0.04)',
                    border: '1px solid rgba(34,211,238,0.15)',
                    color: 'rgba(241,245,249,0.95)',
                    outline: 'none',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                    e.currentTarget.style.background   = 'rgba(34,211,238,0.07)';
                    e.currentTarget.style.boxShadow    = '0 0 0 3px rgba(34,211,238,0.07), 0 0 16px rgba(34,211,238,0.06)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)';
                    e.currentTarget.style.background   = 'rgba(34,211,238,0.04)';
                    e.currentTarget.style.boxShadow    = 'none';
                  }}
                />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password"
                  className="text-[11px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: "rgba(148,163,184,0.85)" }}>
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="h-12 text-[13.5px] rounded-xl w-full pr-12 transition-all duration-200 placeholder:text-[rgba(148,163,184,0.6)]"
                    style={{
                      background: 'rgba(34,211,238,0.04)',
                      border: '1px solid rgba(34,211,238,0.15)',
                      color: 'rgba(241,245,249,0.95)',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(34,211,238,0.5)';
                      e.currentTarget.style.background   = 'rgba(34,211,238,0.07)';
                      e.currentTarget.style.boxShadow    = '0 0 0 3px rgba(34,211,238,0.07), 0 0 16px rgba(34,211,238,0.06)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(34,211,238,0.15)';
                      e.currentTarget.style.background   = 'rgba(34,211,238,0.04)';
                      e.currentTarget.style.boxShadow    = 'none';
                    }}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-100"
                    style={{ color: "rgba(148,163,184,0.75)" }}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Sign In button */}
              <button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="relative w-full h-12 rounded-xl text-[13.5px] font-bold tracking-wider transition-all duration-200 flex items-center justify-center gap-2.5 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] mt-2"
                style={{
                  background: loading
                    ? 'rgba(34,211,238,0.25)'
                    : 'linear-gradient(135deg, rgba(34,211,238,0.9) 0%, rgba(59,130,246,0.95) 50%, rgba(99,102,241,0.9) 100%)',
                  color: '#fff',
                  boxShadow: loading ? 'none' : '0 8px 32px rgba(34,211,238,0.25), 0 4px 16px rgba(59,130,246,0.3), 0 0 0 1px rgba(34,211,238,0.2)',
                  letterSpacing: '0.06em',
                }}
                onMouseEnter={(e) => {
                  if (!loading) e.currentTarget.style.boxShadow = '0 12px 40px rgba(34,211,238,0.35), 0 6px 20px rgba(59,130,246,0.4), 0 0 0 1px rgba(34,211,238,0.3)';
                }}
                onMouseLeave={(e) => {
                  if (!loading) e.currentTarget.style.boxShadow = '0 8px 32px rgba(34,211,238,0.25), 0 4px 16px rgba(59,130,246,0.3), 0 0 0 1px rgba(34,211,238,0.2)';
                }}
              >
                {/* Shimmer overlay */}
                {!loading && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl" aria-hidden>
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0, width: '35%',
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
                      animation: 'shimmer-pass 2.8s ease-in-out infinite 1s',
                    }} />
                  </div>
                )}
                {loading
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Authenticating...</>
                  : 'Sign In'
                }
              </button>
            </form>

            {/* Card footer */}
            <div className="mt-8 pt-5 flex items-center justify-between"
              style={{ borderTop: '1px solid rgba(34,211,238,0.08)' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22d3ee', boxShadow: '0 0 4px rgba(34,211,238,0.7)' }} />
                <span className="text-[11px] tracking-[0.18em] uppercase font-semibold" style={{ color: "rgba(34,211,238,0.7)" }}>
                  Encrypted
                </span>
              </div>
              <span className="text-[11px] tracking-widest uppercase font-mono" style={{ color: "rgba(148,163,184,0.65)" }}>
                v4.0
              </span>
            </div>
          </div>

          <p className="text-center text-[11px] mt-5 tracking-widest uppercase"
            style={{ color: "rgba(148,163,184,0.6)" }}>
            &copy; {new Date().getFullYear()} Nilatech &mdash; All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
