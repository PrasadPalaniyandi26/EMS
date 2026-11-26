'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandTitle } from '@/components/shared/brand-title';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, Package, Bot, BadgeCheck, IndianRupee } from 'lucide-react';

// How a job runs through the app, in order
const STAGES = [
  { icon: Package, name: 'Buy', does: 'Expenses and stock', color: 'var(--nav-blue)' },
  { icon: Bot, name: 'Build', does: 'Orders and costing', color: 'var(--nav-orange)' },
  { icon: BadgeCheck, name: 'Approve', does: 'Manager and Finance', color: 'var(--nav-purple)' },
  { icon: IndianRupee, name: 'Earn', does: 'Invoices and margin', color: 'var(--nav-emerald)' },
];

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
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
    <div className="relative flex min-h-screen flex-col" style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)' }}>
      <div aria-hidden className="ledger-grid pointer-events-none absolute inset-0" />

      <main className="relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col items-center justify-center gap-10 px-5 py-10 lg:flex-row lg:justify-between lg:gap-14 lg:px-10 xl:gap-28 xl:px-12">
        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:items-center lg:gap-14">
          <div className="order-1 flex w-full flex-col items-center gap-3 lg:order-none lg:gap-5">
            <BrandTitle className="h-auto w-full max-w-[290px] opacity-80 lg:max-w-[360px]" />
            <p className="text-balance text-center text-[15px] font-medium lg:text-[22px]">Finance and Operations Management System</p>
          </div>
          <ol aria-label="How a job runs" className="order-3 grid w-full max-w-[440px] grid-cols-4 gap-2 lg:order-none lg:max-w-[640px] lg:gap-3 xl:gap-4">
            {STAGES.map(({ icon: Icon, name, does, color }) => (
              <li
                key={name}
                className="stage-tile flex flex-col items-center gap-2 rounded-lg px-1 py-3 text-center lg:gap-3 lg:px-3 lg:py-6"
                style={{ background: `color-mix(in srgb, ${color} 12%, var(--shell-bg))` }}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg lg:h-12 lg:w-12" style={{ background: color, color: 'var(--shell-surface)' }}>
                  <Icon aria-hidden className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold lg:text-[16px]" style={{ color }}>{name}</span>
                  <span className="mt-1 block text-balance text-[12px] leading-snug lg:text-[13px]" style={{ color: 'var(--shell-text-muted)' }}>{does}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="order-2 w-full max-w-[440px] shrink-0 rounded-lg lg:max-w-[360px] xl:max-w-[420px] border p-6 shadow-lg sm:p-10 lg:order-none" style={{ background: 'var(--shell-surface)', borderColor: 'var(--shell-border)' }}>
          <h1 className="text-[28px] font-semibold leading-tight">Sign in</h1>
          <p className="mt-2 text-[14px]" style={{ color: 'var(--shell-text-muted)' }}>
            Use your employee ID or username.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            {error && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2.5 text-[13px] font-medium"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username" className="text-[14px] font-medium">Employee ID or username</Label>
              <Input
                id="username"
                type="text"
                placeholder="NT10001 or username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className="h-12 text-[15px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[14px] font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 pr-11 text-[15px]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
                  style={{ color: 'var(--shell-text-muted)' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} aria-busy={loading} className="h-12 w-full text-[15px] font-medium">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in...</> : 'Sign in'}
            </Button>
          </form>
        </div>
      </main>
      <p className="relative px-5 pb-5 text-center text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
        &copy; {new Date().getFullYear()} NilaTech
      </p>
    </div>
  );
}
