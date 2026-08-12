'use client';

import { useState, useEffect, useRef } from 'react';
import { SwarmState, AgentResult } from '@/lib/types';

interface AgentPanelProps {
  result: AgentResult;
  index: number;
}

export function AgentPanel({ result, index }: AgentPanelProps) {
  const statusColors = {
    working: 'bg-yellow-500',
    done: 'bg-green-500',
    failed: 'bg-red-500',
  };
  
  const statusIcons = {
    working: '⟳',
    done: '✓',
    failed: '✕',
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 min-w-[280px] flex-shrink-0">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${statusColors[result.status]}`}>
          {statusIcons[result.status]}
        </div>
        <div>
          <div className="font-mono text-xs text-gray-400">{result.taskId}</div>
          <div className="font-medium capitalize">{result.role}</div>
        </div>
        <div className="ml-auto text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300">
          {result.status}
        </div>
      </div>
      <div className="text-sm text-gray-300 line-clamp-3 font-mono">
        {result.content || (result.status === 'working' ? 'Working...' : result.error || 'Failed')}
      </div>
      {result.completedAt && (
        <div className="mt-2 text-xs text-gray-500">
          {(result.completedAt - result.startedAt) / 1000}s
        </div>
      )}
    </div>
  );
}

export function SwarmVisualization({ state }: { state: SwarmState }) {
  const results = Array.from(state.results.values());
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agent Swarm</h2>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>Loop {state.currentLoop + 1}/{state.maxLoops}</span>
          <span className="px-2 py-0.5 rounded bg-gray-800 capitalize">{state.status}</span>
        </div>
      </div>
      
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
        {results.map((result, i) => (
          <AgentPanel key={result.taskId} result={result} index={i} />
        ))}
        {results.length === 0 && (
          <div className="text-gray-500 text-center py-8 px-4">Waiting for swarm to spawn...</div>
        )}
      </div>
    </div>
  );
}

export function LogFeed({ logs }: { logs: string[] }) {
  return (
    <div className="bg-gray-950 border border-gray-700 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
      {logs.map((log, i) => (
        <div key={i} className="text-gray-300 border-b border-gray-800/50 py-1 last:border-0">
          {log}
        </div>
      ))}
      {logs.length === 0 && <div className="text-gray-500">No activity yet...</div>}
    </div>
  );
}

export function ReportViewer({ report }: { report: string }) {
  return (
    <div className="bg-gray-950 border border-gray-700 rounded-lg p-6 max-h-96 overflow-y-auto prose prose-invert max-w-none">
      {report ? (
        report.split('\n').map((line, i) => (
          <p key={i} className="whitespace-pre-wrap">{line}</p>
        ))
      ) : (
        <p className="text-gray-500">Report will appear here...</p>
      )}
    </div>
  );
}