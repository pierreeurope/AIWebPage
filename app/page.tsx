'use client';

/**
 * Main page for the AI Web Page Generator.
 * Features a Figma-like canvas with multiple design frames.
 */

import { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Canvas } from '@/components/Canvas';
import { PromptBox } from '@/components/PromptBox';
import { Sidebar } from '@/components/Sidebar';
import type { 
  Component, 
  Screen, 
  GenerateResponse, 
  DecisionHistoryEntry,
  DesignFrame as DesignFrameType,
  AgentDecision
} from '@/lib/types';

const EXAMPLE_PROMPTS = [
  {
    label: 'SaaS Landing',
    prompt: 'Create a modern SaaS landing page with a hero section, features grid, pricing table, and footer with social links'
  },
  {
    label: 'Dashboard',
    prompt: 'Build a sales analytics dashboard with a sidebar navigation, metrics cards, and charts showing revenue trends'
  },
  {
    label: 'E-commerce',
    prompt: 'Design a product page for sneakers with image gallery, size selector, reviews section, and related products'
  },
  {
    label: 'Portfolio',
    prompt: 'Create a minimalist portfolio page for a designer with header, about section, project gallery, and contact form'
  }
];

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [frames, setFrames] = useState<DesignFrameType[]>([]);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionHistory, setDecisionHistory] = useState<DecisionHistoryEntry[]>([]);

  // Create a new frame from API response
  // IMPORTANT: Stores a SNAPSHOT of components so frames are independent
  const createFrameFromResponse = useCallback((
    screen: Screen,
    newComponents: Component[],
    name: string,
    parentFrameId?: string
  ): DesignFrameType => {
    // Position new frames based on existing ones
    const lastFrame = frames[frames.length - 1];
    const xOffset = lastFrame ? lastFrame.position.x + lastFrame.size.width + 100 : 100;
    
    // Deep clone components to create an independent snapshot
    const componentSnapshot = newComponents.map(c => ({ ...c }));
    
    return {
      id: uuidv4(),
      name,
      screen,
      components: componentSnapshot,  // Store snapshot, not just IDs
      position: { x: xOffset, y: 100 },
      size: { width: 1280, height: 800 }, // Height is dynamic, this is just initial
      createdAt: new Date(),
      parentFrameId,
    };
  }, [frames]);

  const handleSubmit = useCallback(async (prompt: string) => {
    setIsLoading(true);
    setError(null);

    // Determine if this is a follow-up request (editing active frame) or new design
    const isFollowUp = activeFrameId && frames.length > 0;

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, sessionId }),
      });

      const data: GenerateResponse = await response.json();

      if (!data.success) {
        // If session was lost (server restarted), create fresh session
        if (data.error?.includes('Session') || data.error?.includes('not found')) {
          setSessionId(null);
          setError('Session expired. Please try again.');
        } else {
          setError(data.error || 'Generation failed');
        }
        return;
      }

      // Update session state
      setSessionId(data.session.id);
      setComponents(data.session.components);
      setDecisionHistory(data.session.decisionHistory || []);

      // Create or update frame based on the response
      if (data.session.screen) {
        const wasUpdate = data.agentDecision?.action === 'UPDATE_COMPONENTS';
        const wasRegenerate = data.agentDecision?.action === 'REGENERATE_SCREEN';
        const wantsBranch = data.agentDecision?.createBranch === true;
        
        if (wasUpdate && isFollowUp && activeFrameId && !wantsBranch) {
          // UPDATE existing active frame (no branch requested)
          const updatedSnapshot = data.session.components.map(c => ({ ...c }));
          setFrames(prev => prev.map(f => {
            if (f.id === activeFrameId) {
              return {
                ...f,
                screen: data.session.screen!,
                components: updatedSnapshot,
              };
            }
            return f;
          }));
        } else if (wasRegenerate && frames.length > 0) {
          // REGENERATE - Clear ALL existing frames and create fresh
          console.log('🗑️ Clearing all frames for REGENERATE_SCREEN');
          const frameName = generateFrameName(prompt, data.agentDecision);
          const newFrame = createFrameFromResponse(
            data.session.screen,
            data.session.components,
            frameName
          );
          // Position at the start
          newFrame.position.x = 100;
          newFrame.position.y = 100;
          
          setFrames([newFrame]);  // Replace all frames with just this one
          setActiveFrameId(newFrame.id);
        } else {
          // BRANCH or first design - Add a new frame
          const sourceFrame = activeFrameId ? frames.find(f => f.id === activeFrameId) : null;
          const frameName = wantsBranch && sourceFrame
            ? `${sourceFrame.name} (Variant)`
            : generateFrameName(prompt, data.agentDecision);
          
          const newFrame = createFrameFromResponse(
            data.session.screen,
            data.session.components,
            frameName,
            wantsBranch ? activeFrameId || undefined : undefined
          );
          
          // Position next to source frame
          if (sourceFrame) {
            newFrame.position.x = sourceFrame.position.x + sourceFrame.size.width + 100;
            newFrame.position.y = sourceFrame.position.y;
          }

          setFrames(prev => [...prev, newFrame]);
          setActiveFrameId(newFrame.id);
          
          if (wantsBranch) {
            console.log('🌿 Created branch from:', sourceFrame?.name, '→', frameName);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, activeFrameId, frames, createFrameFromResponse]);

  const handleReset = useCallback(async () => {
    setComponents([]);
    setFrames([]);
    setActiveFrameId(null);
    setDecisionHistory([]);
    setError(null);
    
    if (sessionId) {
      try {
        await fetch('/api/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Ignore reset errors
      }
    }
    
    setSessionId(null);
  }, [sessionId]);

  // Frame actions
  const handleFrameSelect = useCallback((frameId: string) => {
    setActiveFrameId(frameId);
  }, []);

  const handleFrameDuplicate = useCallback((frameId: string) => {
    const sourceFrame = frames.find(f => f.id === frameId);
    if (!sourceFrame) return;

    // Deep clone components for the duplicate
    const componentsCopy = sourceFrame.components.map(c => ({ ...c }));

    const newFrame: DesignFrameType = {
      ...sourceFrame,
      id: uuidv4(),
      name: `${sourceFrame.name} (Branch)`,
      components: componentsCopy,  // Independent copy of components
      position: {
        x: sourceFrame.position.x + sourceFrame.size.width + 80,
        y: sourceFrame.position.y,  // Same Y level - no offset
      },
      createdAt: new Date(),
      parentFrameId: frameId,
    };

    setFrames(prev => [...prev, newFrame]);
    setActiveFrameId(newFrame.id);
  }, [frames]);

  const handleFrameDelete = useCallback((frameId: string) => {
    setFrames(prev => prev.filter(f => f.id !== frameId));
    if (activeFrameId === frameId) {
      const remaining = frames.filter(f => f.id !== frameId);
      setActiveFrameId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }, [frames, activeFrameId]);

  const handleFrameRename = useCallback((frameId: string, name: string) => {
    setFrames(prev => prev.map(f => f.id === frameId ? { ...f, name } : f));
  }, []);

  // Get the active frame for the sidebar
  const activeFrame = frames.find(f => f.id === activeFrameId);
  const activeComponents = activeFrame?.components || [];

  return (
    <div className="flex h-screen flex-col bg-[#09090b]">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800/50 px-5 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white">AI Web Page Generator</h1>
            <p className="text-xs text-zinc-500">Figma-like canvas for AI-generated designs</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Frame count */}
          {frames.length > 0 && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
              <span className="text-[11px] font-medium text-violet-400">
                {frames.length} design{frames.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          
          {/* Component count */}
          {components.length > 0 && (
            <div className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] font-medium text-emerald-400">
                {components.length} component{components.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          
          <button
            onClick={handleReset}
            disabled={isLoading || (frames.length === 0 && !sessionId)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 
                       bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-400 
                       hover:border-zinc-600 hover:text-zinc-300
                       disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-red-950/50 border-b border-red-900/30 flex-shrink-0">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-300 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Canvas */}
          <div className="flex-1 overflow-hidden">
            {frames.length === 0 && !isLoading ? (
              <EmptyState onExampleClick={handleSubmit} />
            ) : (
              <Canvas
                frames={frames}
                activeFrameId={activeFrameId}
                onFrameSelect={handleFrameSelect}
                onFrameDuplicate={handleFrameDuplicate}
                onFrameDelete={handleFrameDelete}
                onFrameRename={handleFrameRename}
                isLoading={isLoading}
              />
            )}
          </div>

          {/* Prompt box */}
          <PromptBox onSubmit={handleSubmit} isLoading={isLoading} />
        </div>

        {/* Sidebar */}
        <Sidebar 
          components={activeComponents} 
          screen={activeFrame?.screen || null}
          decisionHistory={decisionHistory}
          frames={frames}
          activeFrameId={activeFrameId}
          onFrameSelect={handleFrameSelect}
        />
      </div>
    </div>
  );
}

// Helper to generate a smart frame name from the prompt and decision
function generateFrameName(prompt: string, decision?: AgentDecision): string {
  // Try to detect the type of design from the prompt
  const promptLower = prompt.toLowerCase();
  
  // Known design patterns
  const patterns = [
    { keywords: ['dashboard', 'analytics', 'admin'], name: 'Dashboard' },
    { keywords: ['landing', 'saas', 'startup'], name: 'Landing Page' },
    { keywords: ['product', 'ecommerce', 'shop', 'store'], name: 'Product Page' },
    { keywords: ['portfolio', 'personal', 'profile'], name: 'Portfolio' },
    { keywords: ['blog', 'article', 'post'], name: 'Blog' },
    { keywords: ['pricing', 'plans', 'subscription'], name: 'Pricing Page' },
    { keywords: ['sneaker', 'shoe', 'footwear'], name: 'Sneaker Store' },
    { keywords: ['contact', 'form'], name: 'Contact Page' },
    { keywords: ['about', 'team'], name: 'About Page' },
  ];
  
  for (const pattern of patterns) {
    if (pattern.keywords.some(k => promptLower.includes(k))) {
      return pattern.name;
    }
  }
  
  // If we have component names from the decision, use those to infer
  if (decision?.regenerateSpecs && decision.regenerateSpecs.length > 0) {
    const firstComp = decision.regenerateSpecs[0].name;
    if (firstComp.toLowerCase().includes('hero')) return 'Landing Page';
    if (firstComp.toLowerCase().includes('sidebar')) return 'Dashboard';
    if (firstComp.toLowerCase().includes('gallery')) return 'Gallery Page';
  }
  
  // Fallback: capitalize first meaningful words
  const stopWords = ['a', 'an', 'the', 'create', 'build', 'make', 'design', 'with', 'for', 'and'];
  const words = prompt.split(' ')
    .filter(w => !stopWords.includes(w.toLowerCase()) && w.length > 2)
    .slice(0, 2);
  
  if (words.length === 0) return 'New Design';
  
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Empty state component
function EmptyState({ onExampleClick }: { onExampleClick: (prompt: string) => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-950">
      <div className="text-center max-w-lg px-8">
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
          <svg className="w-12 h-12 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Create Your First Design</h2>
        <p className="text-zinc-400 mb-8">
          Describe the page you want and watch the AI generate it on a Figma-like canvas.
          <br />
          <span className="text-zinc-500 text-sm">You can create multiple designs and branch them!</span>
        </p>
        
        <div className="grid grid-cols-2 gap-3">
          {EXAMPLE_PROMPTS.map((example, i) => (
            <button
              key={i}
              onClick={() => onExampleClick(example.prompt)}
              className="text-left p-4 rounded-xl bg-zinc-900/50 border border-zinc-800/50 
                         hover:bg-zinc-800/50 hover:border-amber-500/30 transition-all group"
            >
              <span className="text-xs font-semibold text-amber-500 mb-1 block">{example.label}</span>
              <span className="text-sm text-zinc-400 group-hover:text-zinc-300 line-clamp-2">{example.prompt}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800/50">
          <p className="text-[11px] text-zinc-600">
            💡 Tip: Create multiple designs, then branch and iterate on them
          </p>
        </div>
      </div>
    </div>
  );
}
