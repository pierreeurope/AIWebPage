/**
 * Agent tools for component and screen manipulation.
 * These are internal functions that the agent "calls" through structured decisions.
 */

import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import type { Component, Screen, ToolResult, ScreenLayout } from '../types';
import { 
  upsertComponent, 
  updateScreen, 
  getComponent, 
  listComponents as listComponentsFromState,
  resetSession as resetSessionState,
  getSession
} from '../state';
import { ComponentHtmlOutputSchema } from './schemas';

// Lazy-load OpenAI client to avoid build-time errors when API key is not set
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _openai;
}

function getModel(): string {
  // gpt-4o-mini is much faster and cheaper while still being capable
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

// Cache for generated images to avoid regenerating the same images
export const imageCache = new Map<string, string>();

/**
 * Generate an image using DALL-E 3.
 * Uses caching to avoid regenerating identical images.
 * Exported for use by the image generation API endpoint.
 */
export async function generateImage(
  prompt: string,
  size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024'
): Promise<string> {
  // Check cache first
  const cacheKey = `${prompt}-${size}`;
  if (imageCache.has(cacheKey)) {
    console.log(`📦 Image cache hit for: ${prompt.slice(0, 30)}...`);
    return imageCache.get(cacheKey)!;
  }

  console.log(`🎨 Generating image with DALL-E: ${prompt.slice(0, 50)}...`);
  
  try {
    const response = await getOpenAI().images.generate({
      model: 'dall-e-3',
      prompt: `Professional, high-quality image for a modern website. Style: clean, polished, commercial-grade. Subject: ${prompt}. Requirements: No text, no watermarks, no logos, photorealistic or high-quality illustration style.`,
      n: 1,
      size,
      quality: 'standard',
    });

    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL in response');
    }

    // Cache the result
    imageCache.set(cacheKey, imageUrl);
    console.log(`✅ Image generated successfully`);
    return imageUrl;
  } catch (error) {
    console.error('DALL-E generation failed:', error);
    // Fallback to Unsplash with better keywords
    const keywords = encodeURIComponent(prompt.split(' ').slice(0, 3).join(','));
    return `https://source.unsplash.com/800x600/?${keywords}`;
  }
}

/**
 * Process HTML to replace [IMG:description] placeholders with loading placeholders.
 * Images will be loaded progressively by the frontend via the /api/generate-image endpoint.
 * This allows the HTML to render immediately while images load in the background.
 */
function processImagesForProgressiveLoading(html: string): string {
  // Find img tags with [IMG:description] in the src
  // This regex matches: src="[IMG:description]"
  const imgSrcRegex = /src="?\[IMG:([^\]]+)\]"?/g;
  
  let processedHtml = html.replace(imgSrcRegex, (match, description) => {
    // Create a unique ID for this image
    const imageId = `ai-img-${Math.random().toString(36).slice(2, 11)}`;
    // Encode the description for use in data attribute
    const encodedDesc = description.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    
    // Create an SVG placeholder with "Generating AI image..." text
    const placeholderSvg = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3Cdefs%3E%3ClinearGradient id='g${imageId}' x1='0%25' y1='0%25' x2='100%25' y2='0%25'%3E%3Cstop offset='0%25' stop-color='%23374151'%3E%3Canimate attributeName='stop-color' values='%23374151;%234b5563;%23374151' dur='1.5s' repeatCount='indefinite'/%3E%3C/stop%3E%3Cstop offset='50%25' stop-color='%234b5563'%3E%3Canimate attributeName='stop-color' values='%234b5563;%23374151;%234b5563' dur='1.5s' repeatCount='indefinite'/%3E%3C/stop%3E%3Cstop offset='100%25' stop-color='%23374151'%3E%3Canimate attributeName='stop-color' values='%23374151;%234b5563;%23374151' dur='1.5s' repeatCount='indefinite'/%3E%3C/stop%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g${imageId})' width='400' height='300'/%3E%3Ctext x='200' y='145' text-anchor='middle' fill='%239ca3af' font-family='system-ui' font-size='13'%3EGenerating AI image...%3C/text%3E%3Ctext x='200' y='165' text-anchor='middle' fill='%236b7280' font-family='system-ui' font-size='10'%3E${encodeURIComponent(description.slice(0, 30))}%3C/text%3E%3C/svg%3E`;
    
    // Return src with placeholder AND the data attributes for progressive loading
    return `src="${placeholderSvg}" data-ai-prompt="${encodedDesc}" data-ai-image-id="${imageId}"`;
  });
  
  return processedHtml;
}

/**
 * Generates HTML for a component using the LLM.
 */
async function generateComponentHtml(
  name: string,
  description: string,
  requirements: string,
  styleHints?: string,
  existingHtml?: string,
  changeRequest?: string
): Promise<{ html: string; description: string }> {
  const isUpdate = !!existingHtml && !!changeRequest;
  
  const systemPrompt = `You are an expert UI designer and developer. Create stunning, modern, production-quality HTML components using Tailwind CSS.

DESIGN PRINCIPLES:
- Create visually impressive, polished designs that look professionally crafted
- Use rich color palettes with gradients, not flat boring colors
- Add depth with shadows (shadow-lg, shadow-xl), borders, and layered backgrounds
- Include smooth transitions and hover states for interactive elements
- Use modern typography with proper hierarchy (text-4xl for headings, etc.)
- Ensure generous whitespace and padding (py-16, px-8, etc.)
- Add visual interest with icons (use emoji or SVG placeholders), badges, and decorative elements

COLOR & STYLE GUIDELINES:
- Use vibrant gradient backgrounds: bg-gradient-to-r from-indigo-600 to-purple-600
- Dark themes: zinc-900, slate-900 backgrounds with light text
- Light themes: white/gray-50 backgrounds with colored accents
- Add accent colors strategically: amber, cyan, emerald, rose for highlights
- Use backdrop-blur for glass effects on overlays

LAYOUT RULES:
- Use container classes with max-w-7xl mx-auto for centering
- Responsive grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Flexbox for alignment: flex items-center justify-between
- Section padding: py-12 px-6 for proper vertical rhythm
- Each component should be self-contained with proper padding
- Components should have appropriate height - NOT too tall, NOT too short
- For cards/metrics, use compact sizing: p-6, not p-16
- For hero sections, use moderate height: py-16 to py-24
- For sidebars, use py-4 to py-6 with proper item spacing

IMAGES - CRITICAL SIZING AND FORMAT RULES:
- For ALL images, use this special placeholder format: [IMG:description]
- The description should be clear and specific (5-15 words)

IMAGE SIZING IS CRITICAL - FOLLOW THESE RULES EXACTLY:
1. ALWAYS wrap images in a container div with fixed dimensions
2. ALWAYS use aspect-ratio classes: aspect-video (16:9), aspect-square (1:1), aspect-[4/3], aspect-[3/2]
3. ALWAYS use object-cover to prevent distortion
4. ALWAYS set max-width constraints: max-w-xs, max-w-sm, max-w-md, max-w-lg, max-w-xl
5. NEVER let images grow to their natural size - always constrain them

CORRECT IMAGE PATTERNS (USE THESE EXACTLY):

Hero/Banner (full width, constrained height):
<div class="w-full aspect-video max-h-96 overflow-hidden rounded-xl">
  <img src="[IMG:modern office team collaboration]" alt="Hero" class="w-full h-full object-cover">
</div>

Product Card Image (fixed size):
<div class="w-full aspect-square overflow-hidden rounded-lg">
  <img src="[IMG:white sneaker product photo]" alt="Product" class="w-full h-full object-cover">
</div>

Team Member Photo (avatar/headshot):
<div class="w-24 h-24 rounded-full overflow-hidden flex-shrink-0">
  <img src="[IMG:professional headshot smiling woman]" alt="Team member" class="w-full h-full object-cover">
</div>

Gallery Image (in a grid):
<div class="aspect-[4/3] overflow-hidden rounded-lg">
  <img src="[IMG:product lifestyle shot]" alt="Gallery" class="w-full h-full object-cover">
</div>

Background Image (section background):
<div class="relative h-96 overflow-hidden">
  <img src="[IMG:abstract gradient background]" alt="" class="absolute inset-0 w-full h-full object-cover">
  <div class="relative z-10"><!-- content here --></div>
</div>

FORBIDDEN PATTERNS (NEVER DO THIS):
❌ <img src="[IMG:...]" class="w-full"> (no height constraint)
❌ <img src="[IMG:...]"> (no sizing at all)
❌ <img src="[IMG:...]" style="height: 400px"> (inline styles)

The images will load progressively - they start as loading placeholders and real images appear as they're generated.

TECHNICAL REQUIREMENTS:
- Output valid, self-contained HTML
- Use only Tailwind CSS classes (no inline styles)
- Ensure mobile-responsive with breakpoint prefixes
- Include realistic content (real company names, realistic metrics, professional copy)

Output JSON:
{
  "html": "your HTML here",
  "description": "brief description"
}`;

  const userPrompt = isUpdate
    ? `Update this existing component:

Component Name: ${name}
Current Description: ${description}
Change Requested: ${changeRequest}
Style Hints: ${styleHints || 'Maintain the existing design aesthetic while applying the change'}

Current HTML:
${existingHtml}

Apply the requested change. Maintain visual quality and consistency.`
    : `Create a stunning new component:

Component Name: ${name}
Description: ${description}
Requirements: ${requirements}
Style Hints: ${styleHints || 'Modern, premium feel with gradients, shadows, and sophisticated color palette. Make it look like a $10,000 website.'}

Generate beautiful, production-quality HTML.`;

  const response = await getOpenAI().chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No content in LLM response');
  }

  const parsed = JSON.parse(content);
  const validated = ComponentHtmlOutputSchema.parse(parsed);
  
  // Process image placeholders for progressive loading (non-blocking)
  // Images will be loaded by the frontend via /api/generate-image
  const processedHtml = processImagesForProgressiveLoading(validated.html);
  
  return {
    html: processedHtml,
    description: validated.description,
  };
}

/**
 * Tool: Create a new component.
 */
export async function createComponent(
  sessionId: string,
  name: string,
  description: string,
  requirements: string,
  styleHints?: string
): Promise<ToolResult> {
  try {
    const { html, description: updatedDesc } = await generateComponentHtml(
      name,
      description,
      requirements,
      styleHints
    );

    const component: Component = {
      id: uuidv4(),
      name,
      description: updatedDesc || description,
      html,
      lastUpdatedAt: new Date(),
    };

    const success = upsertComponent(sessionId, component);
    
    if (!success) {
      return { success: false, error: 'Failed to save component to session' };
    }

    return { success: true, data: component };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error creating component' 
    };
  }
}

/**
 * Tool: Update an existing component.
 */
export async function updateComponent(
  sessionId: string,
  componentId: string,
  changeRequest: string,
  styleHints?: string
): Promise<ToolResult> {
  try {
    const existing = getComponent(sessionId, componentId);
    
    if (!existing) {
      return { success: false, error: `Component ${componentId} not found` };
    }

    const { html, description } = await generateComponentHtml(
      existing.name,
      existing.description,
      '',
      styleHints,
      existing.html,
      changeRequest
    );

    const updated: Component = {
      ...existing,
      html,
      description: description || existing.description,
      lastUpdatedAt: new Date(),
    };

    const success = upsertComponent(sessionId, updated);
    
    if (!success) {
      return { success: false, error: 'Failed to save updated component' };
    }

    return { success: true, data: updated };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error updating component' 
    };
  }
}

/**
 * Tool: Compose the screen from an ordered list of component IDs with layout.
 */
export function composeScreen(
  sessionId: string,
  componentIds: string[],
  layout: ScreenLayout = 'stack',
  layoutConfig?: {
    sidebarComponentId?: string;
    headerComponentId?: string;
    footerComponentId?: string;
    mainComponentIds?: string[];
  }
): ToolResult {
  const session = getSession(sessionId);
  
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  // Validate all component IDs exist
  for (const id of componentIds) {
    if (!session.components.has(id)) {
      return { success: false, error: `Component ${id} not found` };
    }
  }

  const screen: Screen = {
    componentIds,
    layout,
    layoutConfig,
  };

  const success = updateScreen(sessionId, screen);
  
  if (!success) {
    return { success: false, error: 'Failed to update screen' };
  }

  return { success: true, data: screen };
}

/**
 * Tool: List all components in the session.
 */
export function listComponents(sessionId: string): ToolResult {
  const components = listComponentsFromState(sessionId);
  return { success: true, data: components };
}

/**
 * Tool: Reset the session.
 */
export function resetSessionTool(sessionId: string): ToolResult {
  const success = resetSessionState(sessionId);
  return { success, data: success ? 'Session reset' : 'Failed to reset session' };
}

/**
 * Tool: Find component by name (case-insensitive partial match).
 * Used to resolve references like "the header" to actual component IDs.
 */
export function findComponentByName(sessionId: string, nameQuery: string): ToolResult {
  const session = getSession(sessionId);
  
  if (!session) {
    return { success: false, error: 'Session not found' };
  }

  const query = nameQuery.toLowerCase();
  const matches = Array.from(session.components.values()).filter(
    c => c.name.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    return { success: false, error: `No component found matching "${nameQuery}"` };
  }

  return { success: true, data: matches };
}
