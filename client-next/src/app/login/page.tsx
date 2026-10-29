'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, EyeOff, GitPullRequestArrow, LineChart, ScrollText } from 'lucide-react';

const POINTS = [
  { icon: GitPullRequestArrow, title: 'Approvals with a clear owner', body: 'Every expense goes to the right manager, then to Finance.' },
  { icon: LineChart, title: 'Budgets as you spend', body: 'See what is used and what is left, per project and category.' },
  { icon: ScrollText, title: 'A full trail', body: 'Who submitted, approved or rejected each request, and when.' },
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
    <div className="flex min-h-screen" style={{ background: 'var(--shell-bg)', color: 'var(--shell-text)' }}>
      {/* Brand panel */}
      <div className="hidden w-[44%] shrink-0 flex-col justify-between border-r p-12 lg:flex" style={{ borderColor: 'var(--shell-border)' }}>
        <span className="text-[22px] font-black tracking-[0.2em]" style={{ color: 'var(--shell-brand)' }}>
          NTEMS
        </span>
        <div className="max-w-sm">
          <h1 className="text-[28px] font-semibold leading-tight">Expense management for your team</h1>
          <ul className="mt-8 space-y-6">
            {POINTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--shell-accent)' }} />
                <div>
                  <p className="text-[14px] font-medium">{title}</p>
                  <p className="mt-0.5 text-[13px]" style={{ color: 'var(--shell-text-muted)' }}>{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[12px]" style={{ color: 'var(--shell-text-muted)' }}>
          &copy; {new Date().getFullYear()} NilaTech
        </p>
      </div>

      {/* Sign-in */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <span className="mb-10 block text-center text-[26px] font-black tracking-[0.2em] lg:hidden" style={{ color: 'var(--shell-brand)' }}>
            NTEMS
          </span>

          <h2 className="text-[22px] font-semibold">Sign in</h2>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--shell-text-muted)' }}>
            Use your employee ID or username.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded-md border px-3 py-2.5 text-[13px] font-medium"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)' }}
              >
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[13px] font-medium">Employee ID or username</Label>
              <Input
                id="username"
                type="text"
                placeholder="NT10001 or username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                autoComplete="username"
                className="h-10 text-[14px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-10 pr-11 text-[14px]"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md hover:bg-[var(--shell-hover)] focus-visible:outline-2 focus-visible:outline-[var(--shell-accent)]"
                  style={{ color: 'var(--shell-text-muted)' }}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} aria-busy={loading} className="h-10 w-full text-[14px] font-medium">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Signing in...</> : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
