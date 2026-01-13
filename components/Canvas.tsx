'use client';

/**
 * Canvas - A Figma-like infinite canvas for viewing and arranging design frames.
 * Supports zoom, pan, and multiple design frames.
 */

import { useState, useRef, useCallback, useEffect, WheelEvent, MouseEvent } from 'react';
import { DesignFrame } from './DesignFrame';
import type { DesignFrame as DesignFrameType, CanvasState } from '@/lib/types';

interface CanvasProps {
  frames: DesignFrameType[];
  activeFrameId: string | null;
  onFrameSelect: (frameId: string) => void;
  onFrameDuplicate: (frameId: string) => void;
  onFrameDelete: (frameId: string) => void;
  onFrameRename: (frameId: string, name: string) => void;
  isLoading: boolean;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_SENSITIVITY = 0.001;

export function Canvas({
  frames,
  activeFrameId,
  onFrameSelect,
  onFrameDuplicate,
  onFrameDelete,
  onFrameRename,
  isLoading,
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<CanvasState>({
    zoom: 0.5,
    panX: 100,
    panY: 50,
  });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Handle mouse wheel for zooming (zoom toward cursor position)
  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom with ctrl/cmd + scroll - zoom toward cursor
      e.preventDefault();
      
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      // Cursor position relative to container
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      setCanvas(prev => {
        const delta = -e.deltaY * ZOOM_SENSITIVITY;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom + delta * prev.zoom));
        const zoomRatio = newZoom / prev.zoom;
        
        // Adjust pan to keep the point under cursor stationary
        // The point under cursor in world coords is: (mouseX - panX) / zoom
        // After zoom, we want the same world point under cursor
        const newPanX = mouseX - (mouseX - prev.panX) * zoomRatio;
        const newPanY = mouseY - (mouseY - prev.panY) * zoomRatio;
        
        return {
          zoom: newZoom,
          panX: newPanX,
          panY: newPanY,
        };
      });
    } else {
      // Pan with regular scroll
      setCanvas(prev => ({
        ...prev,
        panX: prev.panX - e.deltaX * 0.5,
        panY: prev.panY - e.deltaY * 0.5,
      }));
    }
  }, []);

  // Handle mouse down for panning
  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse button or alt+left click
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - canvas.panX, y: e.clientY - canvas.panY });
    }
  }, [canvas.panX, canvas.panY]);

  // Handle mouse move for panning
  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (isPanning) {
      setCanvas(prev => ({
        ...prev,
        panX: e.clientX - panStart.x,
        panY: e.clientY - panStart.y,
      }));
    }
  }, [isPanning, panStart]);

  // Handle mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom controls - zoom toward center of viewport
  const zoomToCenter = useCallback((newZoomFn: (zoom: number) => number) => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    setCanvas(prev => {
      const newZoom = newZoomFn(prev.zoom);
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, newZoom));
      const zoomRatio = clampedZoom / prev.zoom;
      
      return {
        zoom: clampedZoom,
        panX: centerX - (centerX - prev.panX) * zoomRatio,
        panY: centerY - (centerY - prev.panY) * zoomRatio,
      };
    });
  }, []);
  
  const zoomIn = () => zoomToCenter(z => z * 1.2);
  const zoomOut = () => zoomToCenter(z => z / 1.2);
  const zoomReset = () => zoomToCenter(() => 0.5);
  const fitToScreen = useCallback(() => {
    if (frames.length === 0 || !containerRef.current) return;
    
    // Calculate bounding box of all frames
    const bounds = frames.reduce((acc, frame) => ({
      minX: Math.min(acc.minX, frame.position.x),
      minY: Math.min(acc.minY, frame.position.y),
      maxX: Math.max(acc.maxX, frame.position.x + frame.size.width),
      maxY: Math.max(acc.maxY, frame.position.y + frame.size.height),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const contentWidth = bounds.maxX - bounds.minX + 200;
    const contentHeight = bounds.maxY - bounds.minY + 200;
    
    const scaleX = containerRect.width / contentWidth;
    const scaleY = containerRect.height / contentHeight;
    // Clamp to reasonable zoom range and prioritize width for tall designs
    const newZoom = Math.max(MIN_ZOOM, Math.min(scaleX * 0.85, 0.8));
    
    setCanvas({
      zoom: newZoom,
      panX: (containerRect.width - contentWidth * newZoom) / 2 - bounds.minX * newZoom + 100,
      panY: 50, // Start from top for tall designs
    });
  }, [frames]);

  // Fit to screen on initial load
  useEffect(() => {
    if (frames.length > 0) {
      fitToScreen();
    }
  }, [frames.length]); // Only trigger when number of frames changes

  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950">
      {/* Canvas grid background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: `${20 * canvas.zoom}px ${20 * canvas.zoom}px`,
          backgroundPosition: `${canvas.panX}px ${canvas.panY}px`,
        }}
      />

      {/* Canvas content */}
      <div
        ref={containerRef}
        className={`w-full h-full ${isPanning ? 'cursor-grabbing' : 'cursor-default'}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="origin-top-left"
          style={{
            transform: `translate(${canvas.panX}px, ${canvas.panY}px) scale(${canvas.zoom})`,
          }}
        >
          {frames.map((frame) => (
            <DesignFrame
              key={frame.id}
              frame={frame}
              components={frame.components}
              isActive={frame.id === activeFrameId}
              onSelect={() => onFrameSelect(frame.id)}
              onDuplicate={() => onFrameDuplicate(frame.id)}
              onDelete={() => onFrameDelete(frame.id)}
              onRename={(name) => onFrameRename(frame.id, name)}
            />
          ))}
        </div>

        {/* Loading overlay with progress steps */}
        {isLoading && (
          <LoadingOverlay />
        )}

        {/* Empty state */}
        {frames.length === 0 && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/30 flex items-center justify-center">
                <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">No designs yet</p>
              <p className="text-xs text-zinc-600 mt-1">Type a prompt below to create your first design</p>
            </div>
          </div>
        )}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-zinc-900/90 backdrop-blur rounded-lg border border-zinc-700/50 p-1">
        <button
          onClick={zoomOut}
          className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
          </svg>
        </button>
        <button
          onClick={zoomReset}
          className="px-2 py-1 rounded hover:bg-zinc-800 text-xs font-medium text-zinc-400 hover:text-white transition-colors min-w-[50px]"
          title="Reset zoom"
        >
          {Math.round(canvas.zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="w-px h-6 bg-zinc-700/50 mx-1" />
        <button
          onClick={fitToScreen}
          className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          title="Fit to screen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Canvas tips */}
      <div className="absolute bottom-4 right-4 text-[10px] text-zinc-600 bg-zinc-900/50 px-2 py-1 rounded">
        Scroll to pan • Ctrl+scroll to zoom • Alt+drag to pan
      </div>
    </div>
  );
}

// Progress steps with animated transitions
const LOADING_STEPS = [
  { icon: '🤔', text: 'Analyzing your request...', duration: 2000 },
  { icon: '📋', text: 'Planning component structure...', duration: 3000 },
  { icon: '🎨', text: 'Generating UI components...', duration: 15000 },
  { icon: '🖼️', text: 'Creating visual elements...', duration: 20000 },
  { icon: '✨', text: 'Polishing the design...', duration: 10000 },
  { icon: '🔧', text: 'Assembling final layout...', duration: 5000 },
];

function LoadingOverlay() {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    // Timer for elapsed time
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    // Progress animation
    let totalTime = 0;
    const timeouts: NodeJS.Timeout[] = [];
    
    LOADING_STEPS.forEach((step, index) => {
      const timeout = setTimeout(() => {
        setCurrentStep(index);
      }, totalTime);
      timeouts.push(timeout);
      totalTime += step.duration;
    });

    // Smooth progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 0.5, 95)); // Max 95% until complete
    }, 500);

    return () => {
      clearInterval(timer);
      clearInterval(progressInterval);
      timeouts.forEach(t => clearTimeout(t));
    };
  }, []);

  const step = LOADING_STEPS[currentStep];
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md flex items-center justify-center z-50">
      <div className="w-80 max-w-[90%]">
        {/* Animated icon */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-4 animate-bounce">{step.icon}</div>
          <h3 className="text-lg font-medium text-white mb-1">{step.text}</h3>
          <p className="text-sm text-zinc-500">Time elapsed: {formatTime(elapsedTime)}</p>
        </div>

        {/* Progress bar */}
        <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        </div>

        {/* Step indicators */}
        <div className="flex justify-between mb-6">
          {LOADING_STEPS.map((s, i) => (
            <div 
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < currentStep ? 'bg-amber-500' : 
                i === currentStep ? 'bg-amber-500 scale-125' : 
                'bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Tips */}
        <div className="text-center">
          <p className="text-xs text-zinc-600">
            💡 Tip: Complex designs with images take longer to generate
          </p>
        </div>
      </div>
    </div>
  );
}
