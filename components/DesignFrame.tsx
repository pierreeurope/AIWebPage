'use client';

/**
 * DesignFrame - A single design frame on the canvas, like an artboard in Figma.
 * Height is DYNAMIC based on actual content.
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Component, DesignFrame as DesignFrameType } from '@/lib/types';

interface DesignFrameProps {
  frame: DesignFrameType;
  components: Component[];
  isActive: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}

export function DesignFrame({
  frame,
  components,
  isActive,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
}: DesignFrameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(frame.name);
  const [showActions, setShowActions] = useState(false);
  const [contentHeight, setContentHeight] = useState(800); // Default, will be updated
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for height messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'resize' && event.data?.frameId === frame.id) {
        setContentHeight(Math.max(400, event.data.height)); // Min 400px
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frame.id]);

  // Build the iframe content
  const iframeSrcDoc = useMemo(() => {
    const componentMap = new Map(components.map(c => [c.id, c]));
    const screen = frame.screen;
    const layout = screen.layout || 'stack';
    const config = screen.layoutConfig;

    // Get components by role
    const getComp = (id: string | undefined) => id ? componentMap.get(id) : undefined;
    const headerComp = getComp(config?.headerComponentId);
    const sidebarComp = getComp(config?.sidebarComponentId);
    const footerComp = getComp(config?.footerComponentId);

    const specialIds = new Set(
      [config?.headerComponentId, config?.sidebarComponentId, config?.footerComponentId].filter(Boolean)
    );
    const mainComponents = screen.componentIds
      .map(id => componentMap.get(id))
      .filter((c): c is Component => c !== undefined && !specialIds.has(c.id));

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
      default:
        bodyContent = screen.componentIds
          .map(id => componentMap.get(id)?.html)
          .filter(Boolean)
          .join('\n');
    }

    return buildIframeDocument(bodyContent, frame.id);
  }, [components, frame.screen, frame.id]);

  const handleNameSubmit = () => {
    if (editName.trim() && editName !== frame.name) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      className="absolute"
      style={{
        left: frame.position.x,
        top: frame.position.y,
        width: frame.size.width,
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Frame header */}
      <div 
        className={`flex items-center justify-between mb-3 px-2 py-2 rounded-lg transition-colors
          ${isActive ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400 hover:bg-zinc-800/50'}`}
      >
        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            className="bg-zinc-800 text-base px-3 py-1.5 rounded-lg border border-zinc-600 text-white outline-none focus:border-amber-500 font-medium"
          />
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="text-base font-semibold hover:text-amber-400 transition-colors flex items-center gap-2"
          >
            {frame.name}
            {frame.parentFrameId && (
              <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-md font-medium border border-emerald-500/30">
                branch
              </span>
            )}
          </button>
        )}

        {/* Actions */}
        <div className={`flex items-center gap-2 transition-opacity ${showActions || isActive ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={onDuplicate}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 
                       transition-colors flex items-center gap-1.5 text-sm font-medium border border-zinc-700 hover:border-emerald-500/30"
            title="Duplicate (Branch)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Branch
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 
                       transition-colors flex items-center gap-1.5 text-sm font-medium border border-zinc-700 hover:border-red-500/30"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      </div>

      {/* Frame content - DYNAMIC HEIGHT based on content */}
      <div
        onClick={onSelect}
        className={`rounded-xl overflow-hidden shadow-2xl transition-all cursor-pointer
          ${isActive 
            ? 'ring-3 ring-amber-500 ring-offset-4 ring-offset-zinc-950' 
            : 'ring-1 ring-zinc-700/50 hover:ring-zinc-600'
          }`}
        style={{ height: contentHeight }}
      >
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrcDoc}
          title={frame.name}
          className="w-full h-full border-0 pointer-events-none bg-white"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {/* Size indicator */}
      <div className="mt-2 text-xs text-zinc-500 text-center font-medium">
        {frame.size.width} × {contentHeight}
      </div>
    </div>
  );
}

// Layout helper functions with proper spacing and structure
function buildSidebarLayout(
  sidebar: Component | undefined,
  mainComponents: Component[],
  position: 'left' | 'right',
  header?: Component,
  footer?: Component
): string {
  const sidebarHtml = sidebar?.html || '<div class="p-6 text-gray-400">No sidebar</div>';
  const mainHtml = mainComponents.map(c => c.html).join('\n') || '<div class="p-8 text-gray-400">Main content</div>';
  const sidebarFirst = position === 'left';

  return `
    ${header ? `<header>${header.html}</header>` : ''}
    <div class="flex">
      ${sidebarFirst ? `
        <aside class="w-64 flex-shrink-0 bg-slate-50 border-r border-slate-200 min-h-[600px]">
          ${sidebarHtml}
        </aside>
        <main class="flex-1 bg-white">
          ${mainHtml}
        </main>
      ` : `
        <main class="flex-1 bg-white">
          ${mainHtml}
        </main>
        <aside class="w-64 flex-shrink-0 bg-slate-50 border-l border-slate-200 min-h-[600px]">
          ${sidebarHtml}
        </aside>
      `}
    </div>
    ${footer ? `<footer>${footer.html}</footer>` : ''}
  `;
}

function buildHolyGrailLayout(
  header: Component | undefined,
  sidebar: Component | undefined,
  mainComponents: Component[],
  footer: Component | undefined
): string {
  const headerHtml = header?.html || '';
  const sidebarHtml = sidebar?.html || '<div class="p-6 text-gray-400">Sidebar</div>';
  const mainHtml = mainComponents.map(c => c.html).join('\n') || '<div class="p-8 text-gray-400">Main content</div>';
  const footerHtml = footer?.html || '';

  return `
    ${headerHtml ? `<header>${headerHtml}</header>` : ''}
    <div class="flex">
      <aside class="w-64 flex-shrink-0 bg-slate-50 border-r border-slate-200">
        ${sidebarHtml}
      </aside>
      <main class="flex-1 bg-white">
        ${mainHtml}
      </main>
    </div>
    ${footerHtml ? `<footer>${footerHtml}</footer>` : ''}
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
    <div class="grid grid-cols-${cols} gap-6 p-6">
      ${gridHtml}
    </div>
    ${footer ? footer.html : ''}
  `;
}

function buildIframeDocument(bodyContent: string, frameId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
        },
      },
    };
  </script>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { 
      margin: 0; 
      padding: 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
      background: white;
      color: #1f2937;
    }
    img { max-width: 100%; height: auto; display: block; }
    
    /* Loading animation for AI images */
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .ai-image-loading {
      background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    .ai-image-loaded {
      animation: fadeIn 0.3s ease-in;
    }
    @keyframes fadeIn {
      from { opacity: 0.7; }
      to { opacity: 1; }
    }
  </style>
</head>
<body>
<div id="content">
${bodyContent}
</div>
<script>
  // Report actual content height to parent
  function reportHeight() {
    const height = document.getElementById('content').scrollHeight;
    window.parent.postMessage({ 
      type: 'resize', 
      frameId: '${frameId}',
      height: height 
    }, '*');
  }
  
  // Progressive image loading - find all images with data-ai-prompt and load them
  async function loadAIImages() {
    const images = document.querySelectorAll('img[data-ai-prompt]');
    if (images.length === 0) return;
    
    console.log('Found ' + images.length + ' AI images to load');
    
    // Add loading class to all images
    images.forEach(img => {
      img.classList.add('ai-image-loading');
    });
    
    // Load images in parallel (max 3 concurrent)
    const loadImage = async (img) => {
      const prompt = img.dataset.aiPrompt;
      if (!prompt) return;
      
      try {
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt })
        });
        
        const data = await response.json();
        
        if (data.imageUrl) {
          // Preload the image before swapping
          const preload = new Image();
          preload.onload = () => {
            img.src = data.imageUrl;
            img.classList.remove('ai-image-loading');
            img.classList.add('ai-image-loaded');
            img.removeAttribute('data-ai-prompt');
            reportHeight(); // Remeasure after image loads
          };
          preload.src = data.imageUrl;
        }
      } catch (error) {
        console.error('Failed to load image:', error);
        // Keep the placeholder on error
        img.classList.remove('ai-image-loading');
      }
    };
    
    // Load all images (the server handles parallelism)
    await Promise.all(Array.from(images).map(loadImage));
    
    console.log('All AI images loaded');
  }
  
  // Report on load and start loading AI images
  window.addEventListener('load', () => {
    reportHeight();
    setTimeout(reportHeight, 100);
    
    // Start loading AI images after initial render
    setTimeout(loadAIImages, 200);
  });
  
  // Also observe for changes
  const observer = new ResizeObserver(reportHeight);
  observer.observe(document.getElementById('content'));
</script>
</body>
</html>`;
}
