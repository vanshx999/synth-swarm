'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSession, login } from '@/lib/history';
import Swarm3D from '@/components/Swarm3D';
import ThemeToggle from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getSession()) {
      router.replace('/dashboard');
      return;
    }
    setLoading(false);
  }, [router]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    login(email.trim(), name.trim());
    router.replace('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Swarm3D active className="w-56 h-56" />
      </div>
    );
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 relative">
      <div className="absolute top-5 right-5 z-20"><ThemeToggle /></div>
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-center relative overflow-hidden p-12 border-r border-black/5 dark:border-white/10">
        <div className="absolute inset-0 opacity-90">
          <Swarm3D active className="w-full h-full" />
        </div>
        <div className="relative z-10 max-w-md">
          <div className="flex items-center gap-2 mb-6">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep animate-pulse" />
            <span className="font-mono text-sm uppercase tracking-[0.35em] gradient-text font-bold">
              Synth
            </span>
          </div>
          <h1 className="text-5xl font-bold leading-tight tracking-tight">
            Deep research,
            <br />
            <span className="gradient-text">orchestrated.</span>
          </h1>
          <p className="mt-5 text-lg text-muted leading-relaxed">
            A fleet of parallel AI agents plans, researches, synthesizes, and
            loops — until every angle is covered.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              ['6', 'agents / swarm'],
              ['3', 'loop passes'],
              ['1', 'pipeline'],
            ].map(([n, label]) => (
              <div key={label} className="glass rounded-2xl p-4 text-center hover-lift">
                <div className="text-2xl font-bold gradient-text">{n}</div>
                <div className="text-[11px] text-muted uppercase tracking-wider mt-1">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
          <p className="relative z-10 mt-auto font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
          built for the swarm · aoc hackathon
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="w-3 h-3 rounded-full bg-gradient-to-r from-brand-primary to-brand-deep" />
            <span className="font-mono text-sm uppercase tracking-[0.35em] gradient-text font-bold">
              Synth
            </span>
          </div>

          <h2 className="text-2xl font-bold">Welcome back</h2>
          <p className="mt-1 text-sm text-muted">
            Sign in to launch your research swarm.
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-shadow"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
                Name <span className="normal-case text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Builder"
                className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-primary/40 transition-shadow"
              />
            </div>

            <button
              type="submit"
              disabled={!email.trim()}
              className="group relative w-full rounded-xl bg-gradient-to-r from-brand-primary via-brand-highlight to-brand-deep p-px disabled:opacity-40 disabled:cursor-not-allowed btn-3d"
            >
              <span className="flex items-center justify-center gap-2 px-6 py-3 rounded-[11px] bg-surface/90 font-semibold text-sm text-ink transition-colors group-hover:bg-transparent group-hover:text-[#053B36]">
                Launch Console →
              </span>
            </button>

            <p className="text-center text-[11px] text-muted">
              Demo build — any email works, no password required.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
