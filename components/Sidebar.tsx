'use client';

/**
 * Sidebar - Tabbed sidebar with Designs, Components, and History views.
 */

import { useState } from 'react';
import type { Component, Screen, DecisionHistoryEntry, DesignFrame } from '@/lib/types';

interface SidebarProps {
  components: Component[];
  screen: Screen | null;
  decisionHistory: DecisionHistoryEntry[];
  frames: DesignFrame[];
  activeFrameId: string | null;
  onFrameSelect: (frameId: string) => void;
}

export function Sidebar({ 
  components, 
  screen, 
  decisionHistory, 
  frames, 
  activeFrameId,
  onFrameSelect 
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'designs' | 'components' | 'history'>('designs');

  const orderedComponents = screen?.componentIds
    .map(id => components.find(c => c.id === id))
    .filter((c): c is Component => c !== undefined) || [];

  return (
    <aside className="hidden lg:flex h-full w-72 flex-col border-l border-zinc-800/50 bg-zinc-900/30">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800/50">
        <button
          onClick={() => setActiveTab('designs')}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative
            ${activeTab === 'designs' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Designs {frames.length > 0 && `(${frames.length})`}
          {activeTab === 'designs' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('components')}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative
            ${activeTab === 'components' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Components {orderedComponents.length > 0 && `(${orderedComponents.length})`}
          {activeTab === 'components' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors relative
            ${activeTab === 'history' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          History {decisionHistory.length > 0 && `(${decisionHistory.length})`}
          {activeTab === 'history' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'designs' ? (
          <DesignsView 
            frames={frames} 
            activeFrameId={activeFrameId} 
            onFrameSelect={onFrameSelect} 
          />
        ) : activeTab === 'components' ? (
          <ComponentsView components={orderedComponents} />
        ) : (
          <HistoryView history={decisionHistory} />
        )}
      </div>
    </aside>
  );
}

function DesignsView({ 
  frames, 
  activeFrameId, 
  onFrameSelect 
}: { 
  frames: DesignFrame[]; 
  activeFrameId: string | null;
  onFrameSelect: (frameId: string) => void;
}) {
  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
        </div>
        <p className="text-sm text-zinc-400">No designs yet</p>
        <p className="text-xs text-zinc-600 mt-1">Create your first design to see it here</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {frames.map((frame) => (
        <button
          key={frame.id}
          onClick={() => onFrameSelect(frame.id)}
          className={`w-full text-left rounded-lg p-3 transition-all
            ${frame.id === activeFrameId 
              ? 'bg-violet-500/10 border border-violet-500/30 ring-1 ring-violet-500/20' 
              : 'bg-zinc-800/30 border border-zinc-700/20 hover:border-zinc-600/30'
            }`}
        >
          <div className="flex items-start gap-2">
            <div className={`w-8 h-8 rounded flex items-center justify-center flex-shrink-0
              ${frame.id === activeFrameId ? 'bg-violet-500/20' : 'bg-zinc-700/30'}`}>
              <svg className={`w-4 h-4 ${frame.id === activeFrameId ? 'text-violet-400' : 'text-zinc-500'}`} 
                   fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-medium truncate
                  ${frame.id === activeFrameId ? 'text-violet-300' : 'text-zinc-200'}`}>
                  {frame.name}
                </h3>
                {frame.parentFrameId && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-400">
                    branch
                  </span>
                )}
              </div>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {frame.components.length} component{frame.components.length !== 1 ? 's' : ''} • {frame.screen.layout}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ComponentsView({ components }: { components: Component[] }) {
  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <p className="text-sm text-zinc-400">No components</p>
        <p className="text-xs text-zinc-600 mt-1">Select a design to see its components</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2">
      {components.map((component, index) => (
        <div
          key={component.id}
          className="rounded-lg bg-zinc-800/30 border border-zinc-700/20 p-3"
        >
          <div className="flex items-start gap-2 mb-1">
            <span className="flex-shrink-0 w-5 h-5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-bold flex items-center justify-center">
              {index + 1}
            </span>
            <h3 className="text-sm font-medium text-zinc-200 truncate">{component.name}</h3>
          </div>
          <p className="text-[11px] text-zinc-500 line-clamp-2 ml-7">{component.description}</p>
        </div>
      ))}
    </div>
  );
}

function HistoryView({ history }: { history: DecisionHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm text-zinc-400">No history</p>
        <p className="text-xs text-zinc-600 mt-1">Submit prompts to see agent decisions</p>
      </div>
    );
  }

  const sortedHistory = [...history].reverse();

  return (
    <div className="p-3 space-y-2">
      {sortedHistory.map((entry, index) => {
        const isRegenerate = entry.decision.action === 'REGENERATE_SCREEN';
        
        return (
          <div key={entry.id} className="rounded-lg bg-zinc-800/30 border border-zinc-700/20 overflow-hidden">
            <div className="px-3 py-2 bg-zinc-800/50 border-b border-zinc-700/20 flex items-center justify-between">
              <span className="text-[10px] text-zinc-500">#{history.length - index}</span>
              <span className="text-[10px] text-zinc-600">{formatTime(entry.timestamp)}</span>
            </div>
            <div className="p-3 space-y-2">
              <div className="text-xs text-zinc-300 bg-zinc-900/50 rounded px-2 py-1.5 border-l-2 border-amber-500/50">
                "{entry.prompt}"
              </div>
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium
                ${isRegenerate 
                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20' 
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRegenerate ? 'bg-violet-400' : 'bg-emerald-400'}`} />
                {isRegenerate ? 'REGENERATE' : 'UPDATE'}
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {entry.decision.rationale}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}
