'use client';

/**
 * ScreenRenderer - Renders the generated screen HTML in a sandboxed, non-interactive canvas.
 * Supports multiple layout types: stack, sidebar-left/right, holy-grail, grid.
 */

import { useMemo } from 'react';
import type { Component, Screen } from '@/lib/types';

interface ScreenRendererProps {
  components: Component[];
  screen: Screen | null;
  onExampleClick?: (prompt: string) => void;
}

export function ScreenRenderer({ components, screen, onExampleClick }: ScreenRendererProps) {
  // Build the complete HTML document for the iframe
  const iframeSrcDoc = useMemo(() => {
    if (!screen || screen.componentIds.length === 0 || components.length === 0) {
      return null;
    }

    const componentMap = new Map(components.map(c => [c.id, c]));
    const layout = screen.layout || 'stack';
    const config = screen.layoutConfig;

    // Get components by their role
    const getComponent = (id: string | undefined) => id ? componentMap.get(id) : undefined;
    
    const headerComp = getComponent(config?.headerComponentId);
    const sidebarComp = getComponent(config?.sidebarComponentId);
    const footerComp = getComponent(config?.footerComponentId);
    
    // Main content = all components except header, sidebar, footer
    const specialIds = new Set([
      config?.headerComponentId,
      config?.sidebarComponentId,
      config?.footerComponentId
    ].filter(Boolean));
    
    const mainComponents = screen.componentIds
      .map(id => componentMap.get(id))
      .filter((c): c is Component => c !== undefined && !specialIds.has(c.id));

    // Build HTML based on layout type
    let bodyContent: string;

    switch (layout) {
      case 'sidebar-left':
        bodyContent = buildSidebarLayout(sidebarComp, mainComponents, 'left', headerComp, footerComp);
        break;
      case 'sidebar-right':
        bodyContent = buildSidebarLayout(sidebarComp, mainComponents, 'right', headerComp, footerComp);
        break;
      case 'holy-grail':
        bodyContent = buildHolyGrailLayout(headerComp, sidebarComp, mainComponents, footerComp);
        break;
      case 'grid-2':
        bodyContent = buildGridLayout(mainComponents, 2, headerComp, footerComp);
        break;
      case 'grid-3':
        bodyContent = buildGridLayout(mainComponents, 3, headerComp, footerComp);
        break;
      case 'stack':
      default:
        // Simple vertical stack of all components in order
        bodyContent = screen.componentIds
          .map(id => componentMap.get(id)?.html)
          .filter(Boolean)
          .join('\n');
        break;
    }

    if (!bodyContent.trim()) {
      return null;
    }
    
    return buildIframeDocument(bodyContent);
  }, [components, screen]);

  // Show empty state when no content
  if (!iframeSrcDoc) {
    return <EmptyState onExampleClick={onExampleClick} />;
  }

  return (
    <div className="h-full bg-white rounded-lg overflow-hidden border border-zinc-700/30 shadow-lg relative">
      <iframe
        srcDoc={iframeSrcDoc}
        title="Generated Page Preview (Read-Only Canvas)"
        className="w-full h-full border-0"
        sandbox="allow-scripts"
        style={{ display: 'block' }}
      />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-zinc-900/90 backdrop-blur text-[10px] text-zinc-400 font-medium pointer-events-none">
        Preview Mode — Links Disabled
      </div>
    </div>
  );
}

function buildSidebarLayout(
  sidebar: Component | undefined,
  mainComponents: Component[],
  position: 'left' | 'right',
  header?: Component,
  footer?: Component
): string {
  const sidebarHtml = sidebar?.html || '<div class="p-4 text-gray-400">No sidebar</div>';
  const mainHtml = mainComponents.map(c => c.html).join('\n') || '<div class="p-8 text-gray-400">Main content area</div>';
  
  const sidebarFirst = position === 'left';
  
  return `
    ${header ? header.html : ''}
    <div class="flex min-h-screen">
      ${sidebarFirst ? `
        <aside class="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200">
          ${sidebarHtml}
        </aside>
        <main class="flex-1 overflow-auto">
          ${mainHtml}
        </main>
      ` : `
        <main class="flex-1 overflow-auto">
          ${mainHtml}
        </main>
        <aside class="w-64 flex-shrink-0 bg-gray-50 border-l border-gray-200">
          ${sidebarHtml}
        </aside>
      `}
    </div>
    ${footer ? footer.html : ''}
  `;
}

function buildHolyGrailLayout(
  header: Component | undefined,
  sidebar: Component | undefined,
  mainComponents: Component[],
  footer: Component | undefined
): string {
  const headerHtml = header?.html || '';
  const sidebarHtml = sidebar?.html || '<div class="p-4 text-gray-400">Sidebar</div>';
  const mainHtml = mainComponents.map(c => c.html).join('\n') || '<div class="p-8 text-gray-400">Main content</div>';
  const footerHtml = footer?.html || '';

  return `
    <div class="min-h-screen flex flex-col">
      ${headerHtml ? `<header>${headerHtml}</header>` : ''}
      <div class="flex flex-1">
        <aside class="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200">
          ${sidebarHtml}
        </aside>
        <main class="flex-1 overflow-auto">
          ${mainHtml}
        </main>
      </div>
      ${footerHtml ? `<footer>${footerHtml}</footer>` : ''}
    </div>
  `;
}

function buildGridLayout(
  components: Component[],
  cols: number,
  header?: Component,
  footer?: Component
): string {
  const gridHtml = components.map(c => `<div>${c.html}</div>`).join('\n');
  
  return `
    ${header ? header.html : ''}
    <div class="grid grid-cols-${cols} gap-4 p-4">
      ${gridHtml}
    </div>
    ${footer ? footer.html : ''}
  `;
}

function buildIframeDocument(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <base target="_blank">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      background: white;
      color: #1f2937;
    }
    img { max-width: 100%; height: auto; display: block; }
    a, button, [onclick], input[type="submit"], input[type="button"] {
      cursor: default !important;
    }
  </style>
</head>
<body>
${bodyContent}
<script>
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a, button, input[type="submit"], input[type="button"], [onclick]');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);
  document.addEventListener('submit', function(e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, true);
</script>
</body>
</html>`;
}

interface ExamplePrompt {
  label: string;
  prompt: string;
}

const EXAMPLE_PROMPTS: ExamplePrompt[] = [
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

function EmptyState({ onExampleClick }: { onExampleClick?: (prompt: string) => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-zinc-900/50 rounded-lg border border-zinc-800/50">
      <div className="text-center max-w-lg px-8">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center">
          <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-zinc-200 mb-2">Ready to Create</h3>
        <p className="text-sm text-zinc-500 mb-6">
          Describe the web page you want to build, or click an example to get started:
        </p>
        <div className="space-y-2">
          {EXAMPLE_PROMPTS.map((example, i) => (
            <button
              key={i}
              onClick={() => onExampleClick?.(example.prompt)}
              className="w-full text-left px-4 py-3 rounded-lg bg-zinc-800/30 border border-zinc-700/30 
                         hover:bg-zinc-800/50 hover:border-amber-500/30 transition-colors group cursor-pointer"
            >
              <span className="text-xs font-medium text-amber-500 mb-1 block">{example.label}</span>
              <span className="text-sm text-zinc-400 group-hover:text-zinc-300 line-clamp-2">{example.prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export { EXAMPLE_PROMPTS };
