'use client';

/**
 * PromptBox - Input area for user prompts.
 */

import { useState, KeyboardEvent, useRef, useEffect } from 'react';

interface PromptBoxProps {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}

export function PromptBox({ onSubmit, isLoading }: PromptBoxProps) {
  const [prompt, setPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (prompt.trim() && !isLoading) {
      onSubmit(prompt.trim());
      setPrompt('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [prompt]);

  return (
    <div className="border-t border-zinc-800/50 bg-zinc-900/50 px-4 py-3">
      <div className="max-w-3xl mx-auto flex gap-3 items-end">
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the page you want to create..."
            disabled={isLoading}
            rows={1}
            className="w-full resize-none rounded-xl bg-zinc-800/50 border border-zinc-700/50 
                       px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500
                       focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20
                       disabled:opacity-50 transition-all"
            style={{ minHeight: '44px' }}
          />
          <p className="text-[10px] text-zinc-600 mt-1.5 ml-1">
            Press Enter to submit · Shift+Enter for new line
          </p>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading}
          className="flex-shrink-0 h-11 px-5 rounded-xl font-medium text-sm
                     bg-gradient-to-r from-amber-500 to-orange-500 text-white
                     hover:from-amber-400 hover:to-orange-400
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20"
        >
          {isLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Generating
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate
            </>
          )}
        </button>
      </div>
    </div>
  );
}
