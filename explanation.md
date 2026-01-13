# Architecture Explanation

This document provides a comprehensive explanation of how this application addresses the different requirements.

## Table of Contents

1. [Key Requirement: Component-Based Generation](#key-requirement-component-based-generation)
2. [Agent Decision-Making: Regenerate vs Update](#agent-decision-making-regenerate-vs-update)
3. [Tool Design for the Agent](#tool-design-for-the-agent)
4. [Data Models](#data-models)
5. [Conversation Flow &amp; Context](#conversation-flow--context)
6. [End-to-End Flow](#end-to-end-flow)
7. [Beyond the Requirements](#beyond-the-requirements)
8. [Walkthroughs](#walkthroughs)

---

## Key Requirement: Component-Based Generation

> *"Screens must be composed of reusable components. When generating a screen, the agent should break it into logical components and store each separately."*

### How We Solve This

**1. Screen Decomposition**

When the user asks for a page, the agent first decides what components are needed:

```typescript
// Agent decision for "Create a SaaS landing page"
{
  "action": "REGENERATE_SCREEN",
  "regenerateSpecs": [
    { "name": "Hero Section", "description": "...", "requirements": "..." },
    { "name": "Features Grid", "description": "...", "requirements": "..." },
    { "name": "Pricing Table", "description": "...", "requirements": "..." },
    { "name": "Footer", "description": "...", "requirements": "..." }
  ],
  "layout": { "type": "stack" }
}
```

The agent autonomously decides the component breakdown based on:

- The type of page requested
- Common UI patterns (landing pages have heroes, dashboards have sidebars)
- User-specified sections

**2. Independent Component Storage**

Each component is stored separately with its own ID:

```typescript
interface Component {
  id: string;           // "c1a2b3c4-..."
  name: string;         // "Hero Section"
  description: string;  // "A compelling intro..."
  html: string;         // Full HTML with Tailwind
  lastUpdatedAt: Date;
}
```

Components are stored in a `Map<string, Component>` keyed by ID. This enables:

- O(1) lookup by ID
- Independent updates
- Flexible reordering

**3. Screen as Composition**

The screen is simply an ordered list of component IDs plus layout metadata:

```typescript
interface Screen {
  componentIds: string[];  // ["uuid-1", "uuid-2", "uuid-3"]
  layout: 'stack' | 'sidebar-left' | 'sidebar-right' | 'holy-grail' | 'grid-2' | 'grid-3';
  layoutConfig?: {
    headerComponentId?: string;
    sidebarComponentId?: string;
    footerComponentId?: string;
  };
}
```

**Rendering** combines components based on layout:

```typescript
// Stack layout: vertical stacking
const html = screen.componentIds
  .map(id => components.get(id)?.html)
  .join('\n');

// Sidebar layout: flexbox with sidebar
const sidebarHtml = components.get(layoutConfig.sidebarComponentId)?.html;
const mainHtml = mainComponentIds.map(id => components.get(id)?.html).join('\n');
// Rendered with: <div class="flex"><aside>{sidebar}</aside><main>{main}</main></div>
```

---

## Agent Decision-Making: Regenerate vs Update

> *"On follow-up prompts, the agent must decide: Does this require regenerating the whole screen? Or can I update just one or a few components?"*

### The Decision Flow

```
                    User Prompt
                         │
                         ▼
            ┌────────────────────────┐
            │   Agent Analyzes:      │
            │   - Current components │
            │   - Message history    │
            │   - User intent        │
            └────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           ▼                           ▼
   REGENERATE_SCREEN           UPDATE_COMPONENTS
   (start from scratch)        (targeted changes)
           │                           │
           ▼                           ▼
   • Clear all components      • Update specific components
   • Create new set            • Add new components  
   • New layout                • Reorder screen
```

### When to REGENERATE_SCREEN

The agent chooses full regeneration when:

1. **No existing components** (first request)
2. **Explicit user intent** - detected via keywords in the agent's rationale:
   ```javascript
   const explicitRegenKeywords = [
     'delete everything', 'start over', 'start fresh', 'completely new',
     'new page', 'different page', 'replace everything', 'from scratch',
     'completely different', 'total redesign', 'create a new', 'build a new'
   ];
   ```
3. **Completely different page type** - e.g., switching from dashboard to landing page

### When to UPDATE_COMPONENTS

The agent chooses targeted updates when:

1. **User references existing components**: "make the header darker"
2. **User wants additions**: "add a testimonials section"
3. **User wants reordering**: "move pricing above FAQ"
4. **Style changes**: "use a blue color scheme"

### Protection Against Accidental Deletion

We implement a safety mechanism to prevent the LLM from accidentally regenerating when it should update:

```typescript
function normalizeDecision(decision: AgentDecision, hasExistingComponents: boolean): AgentDecision {
  // Check if user EXPLICITLY asked for regeneration
  const isExplicitRegen = explicitRegenKeywords.some(kw => 
    decision.rationale.toLowerCase().includes(kw)
  );
  
  // If REGENERATE but no explicit intent, convert to UPDATE
  if (hasExistingComponents && decision.action === 'REGENERATE_SCREEN' && !isExplicitRegen) {
    console.log('⚠️ PROTECTION: Converting REGENERATE_SCREEN to UPDATE_COMPONENTS');
    return {
      action: 'UPDATE_COMPONENTS',
      newComponents: decision.regenerateSpecs,  // Add as new instead of replacing
      // ...
    };
  }
  
  return decision;
}
```

### Branching: A Third Option

We added `createBranch: true` for when users want a **variant** without modifying the original:

```typescript
// "Create a version with a dark theme"
{
  "action": "UPDATE_COMPONENTS",
  "createBranch": true,  // Create copy, then apply changes
  "updates": [{ "componentId": "Header", "changeDescription": "Dark theme" }]
}
```

---

## Tool Design for the Agent

> *"How you design tools for the agent"*

### Tool Architecture

The agent doesn't directly call functions. Instead, it returns a **structured decision** that the orchestrator executes:

```
Agent (LLM) → Structured JSON Decision → Orchestrator → Tools → State
```

### Available Tools

**1. createComponent**

```typescript
async function createComponent(
  sessionId: string,
  name: string,
  description: string,
  requirements: string,
  styleHints?: string
): Promise<ToolResult<Component>>
```

- Calls LLM to generate HTML
- Creates UUID
- Stores in session
- Returns created component

**2. updateComponent**

```typescript
async function updateComponent(
  sessionId: string,
  componentId: string,
  changeRequest: string
): Promise<ToolResult<Component>>
```

- Retrieves existing component
- Sends existing HTML + change request to LLM
- LLM returns modified HTML
- Updates in session

**3. composeScreen**

```typescript
function composeScreen(
  sessionId: string,
  componentIds: string[],
  layout: ScreenLayout,
  layoutConfig?: LayoutConfig
): ToolResult<Screen>
```

- Validates all component IDs exist
- Sets screen composition order
- Sets layout type and config
- **No LLM call** - purely compositional

**4. findComponentByName**

```typescript
function findComponentByName(
  sessionId: string,
  nameQuery: string
): ToolResult<Component[]>
```

- Case-insensitive partial matching
- Resolves "the header" → actual component

### Tool Result Pattern

All tools return a consistent result:

```typescript
interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

### Parallel Execution

For speed, component generation runs in parallel:

```typescript
// Generate all components simultaneously
const results = await Promise.all(
  specs.map(spec => createComponent(sessionId, spec.name, ...))
);
```

This reduces generation time from ~75s (sequential) to ~15s (parallel) for 5 components.

---

## Data Models

> *"How you model components and their relationship to screens"*

### Type Hierarchy

```
SessionState
    ├── messages: Message[]           # Conversation history
    ├── components: Map<string, Component>  # Component storage
    ├── screen: Screen | null         # Current composition
    └── decisionHistory: DecisionHistoryEntry[]  # Audit trail

Component
    ├── id: string (UUID)
    ├── name: string
    ├── description: string
    ├── html: string
    └── lastUpdatedAt: Date

Screen
    ├── componentIds: string[]        # Ordered references
    ├── layout: ScreenLayout          # Layout type
    └── layoutConfig?: {...}          # Layout-specific config

DesignFrame (Frontend)
    ├── id: string
    ├── name: string
    ├── screen: Screen
    ├── components: Component[]       # SNAPSHOT for independence
    ├── position: { x, y }
    ├── size: { width, height }
    └── parentFrameId?: string        # For branching
```

### Key Design Decisions

**1. Components stored by ID, not embedded in screen**

- Enables independent updates
- Enables sharing across screens (future feature)
- Enables reordering without regeneration

**2. Screen is just metadata**

- No HTML in screen object
- Composition happens at render time
- Order changes are instant

**3. Frame snapshots for independence**

- Each design frame stores its own component copies
- Updating one frame doesn't affect others
- Enables branching without shared state issues

---

## Conversation Flow & Context

> *"How you handle the conversation flow across multiple prompts"*

### Message History

Every user prompt and agent response is stored:

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}
```

### Context Window

The agent receives the last 6 messages plus current state:

```typescript
function formatStateForDecision(
  userPrompt: string,
  messageHistory: Message[],
  components: Component[],
  screenOrderNames: string[],
  currentLayout?: string
): string {
  // Build context string with:
  // 1. Current components and their descriptions
  // 2. Current screen order
  // 3. Current layout type
  // 4. Recent conversation (last 6 messages)
  // 5. The new user prompt
}
```

### Reference Resolution

When the agent says "update the Header", we resolve the reference:

```typescript
function resolveComponentId(sessionId: string, reference: string): string | null {
  // If it's already a UUID, return it
  if (reference.match(/^[0-9a-f-]{36}$/i)) {
    return reference;
  }
  
  // Otherwise, search by name
  const result = findComponentByName(sessionId, reference);
  if (result.success && result.data.length > 0) {
    return result.data[0].id;
  }
  
  return null;
}
```

### Decision History

We track all agent decisions for transparency:

```typescript
interface DecisionHistoryEntry {
  id: string;
  prompt: string;
  decision: AgentDecision;
  timestamp: Date;
  componentsAffected: string[];
}
```

This is displayed in the sidebar's "History" tab.

---

## End-to-End Flow

### Request Flow

```
1. User types prompt in PromptBox
         │
2. POST /api/generate { prompt, sessionId }
         │
3. Agent retrieves/creates session
         │
4. Agent formats context + calls LLM
         │
5. LLM returns structured AgentDecision (JSON)
         │
6. normalizeDecision() fixes any inconsistencies
         │
7. Execute decision:
   ├── REGENERATE: Clear → Create all → Compose
   └── UPDATE: Update specific → Add new → Recompose
         │
8. Record decision in history
         │
9. Return serialized session
         │
10. Frontend updates frames/components state
         │
11. Canvas re-renders affected DesignFrame(s)
         │
12. Iframe loads HTML → Triggers image generation
```

### Image Generation Flow

```
1. Component HTML contains: src="[IMG:description]"
         │
2. processImagesForProgressiveLoading() converts to:
   src="placeholder.svg" data-ai-prompt="description"
         │
3. Iframe renders with shimmer placeholders
         │
4. Iframe JavaScript finds all data-ai-prompt
         │
5. For each: POST /api/generate-image { prompt }
         │
6. DALL-E generates image → Returns URL
         │
7. JavaScript swaps src, adds fade-in animation
```

---

## Beyond the Requirements

We implemented several features beyond the basic spec:

### 1. Figma-like Canvas

- Infinite canvas with zoom (toward cursor) and pan
- Multiple design frames side-by-side
- Frame selection, renaming, deletion

### 2. Design Branching

- Duplicate any design to create a variant
- "Create a version with..." triggers automatic branching
- Each frame stores independent component snapshots

### 3. Spatial Layouts

- Not just vertical stacking
- Sidebar layouts for dashboards
- Grid layouts for galleries
- Holy-grail for complex pages

### 4. AI-Generated Images

- DALL-E 3 integration
- Progressive loading with shimmer effect
- Image caching to avoid regeneration

### 5. Enhanced Loading UX

- Step-by-step progress indicator
- Elapsed time counter
- Helpful tips during wait

### 6. Session Persistence

- Global store survives Next.js hot reloads
- No data loss during development

---

## Walkthroughs

### Walkthrough 1: Initial Generation

**User**: "Create a SaaS landing page with hero, features, and pricing"

```
1. Session: New (no components)
2. Decision: REGENERATE_SCREEN
3. regenerateSpecs: [Hero Section, Features Grid, Pricing Table, Footer]
4. layout: { type: "stack" }
5. Execute: Create 4 components in parallel (~15s)
6. Compose: Screen with 4 component IDs
7. UI: New frame appears on canvas
```

### Walkthrough 2: Targeted Update

**User**: "Make the header use a dark theme"

```
1. Session: Has 4 components
2. Agent sees: "header" + "darker" → targeted update
3. Decision: UPDATE_COMPONENTS
4. updates: [{ componentId: "Hero Section", changeDescription: "dark theme" }]
5. Execute: updateComponent() with existing HTML + change
6. UI: Same frame updates, only Hero Section HTML changed
```

### Walkthrough 3: Adding Components

**User**: "Add a testimonials section before the footer"

```
1. Session: Has 4 components
2. Decision: UPDATE_COMPONENTS
3. newComponents: [{ name: "Testimonials", ... }]
4. screenOrder: ["Hero", "Features", "Pricing", "Testimonials", "Footer"]
5. Execute: createComponent() for Testimonials
6. Compose: Reorder screen
7. UI: Frame now has 5 components
```

### Walkthrough 4: Reordering

**User**: "Move pricing above the features"

```
1. Session: Has 5 components
2. Decision: UPDATE_COMPONENTS
3. updates: [] (no content changes)
4. screenOrder: ["Hero", "Pricing", "Features", "Testimonials", "Footer"]
5. Execute: Only composeScreen() - no LLM calls!
6. UI: Instant reorder
```

### Walkthrough 5: Branching

**User**: "Create a version with bigger images"

```
1. Detected: "create a version" → createBranch: true
2. Decision: UPDATE_COMPONENTS with createBranch: true
3. Frontend: Creates new frame as copy
4. Backend: Updates session components
5. New frame receives updates
6. Original frame: Unchanged (has own snapshot)
```

### Walkthrough 6: Complete Redesign

**User**: "Delete everything and create a portfolio for a designer"

```
1. Detected: "delete everything" → explicit regeneration
2. Decision: REGENERATE_SCREEN
3. normalizeDecision: Allows because explicit intent detected
4. Execute: Clear all components, create new set
5. Frontend: Clears all frames, creates new frame
6. UI: Fresh canvas with portfolio design
```

---

## Summary

This implementation demonstrates:

| Requirement                             | Implementation                                          |
| --------------------------------------- | ------------------------------------------------------- |
| **Component-based generation**    | Components stored independently with UUIDs              |
| **Screen composition**            | Screen = ordered list of component IDs + layout         |
| **Regenerate vs Update decision** | LLM decides based on context, protected by safety layer |
| **Tool design**                   | Structured decisions → orchestrator → typed tools     |
| **Conversation context**          | Message history + component state provided to LLM       |

**Key architectural choices:**

1. **Structured output over free-form**: Zod schemas enforce predictable LLM responses
2. **Orchestrator pattern**: Agent returns decisions, separate code executes them
3. **Snapshot isolation**: Each frame owns its components to prevent cross-contamination
4. **Parallel execution**: Components generated simultaneously for speed
5. **Progressive enhancement**: Images load after HTML for perceived performance

The design prioritizes **clarity and correctness** while maintaining the patterns needed for a production system.
