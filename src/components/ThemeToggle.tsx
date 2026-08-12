'use client';

import { useEffect, useState } from 'react';

type ThemePreference = 'light' | 'dark' | 'system';

function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme') as ThemePreference | null;
    const next = stored === 'light' || stored === 'dark' ? stored : 'system';
    setPreference(next);
    setDark(next === 'dark' || (next === 'system' && systemIsDark()));
  }, []);

  const toggle = () => {
    const next: ThemePreference = dark ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.classList.toggle('light', next === 'light');
    localStorage.setItem('theme', next);
    setPreference(next);
    setDark(next === 'dark');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Theme: ${preference}`}
      className="rounded-full border border-black/10 dark:border-white/10 bg-surface/70 px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

export default ThemeToggle;
