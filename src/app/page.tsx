'use client';

// The SwarmDashboard component is owned by the ui-board worktree and will
// replace this placeholder when it lands. Import and render it here once it
// exposes a default export.
// import SwarmDashboard from '@/components/ui/SwarmDashboard';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-16">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          Synth — Swarm Research Platform
        </h1>
        <p className="text-gray-400 mb-8">
          AI-powered deep research orchestrated by an agent swarm.
        </p>

        <input
          type="text"
          placeholder="Enter a research topic..."
          disabled
          className="w-full px-4 py-3 rounded-lg bg-gray-900/60 border border-gray-700 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 mb-6"
        />

        <p className="text-gray-500 text-sm">Dashboard loading...</p>
      </div>
    </main>
  );
}
