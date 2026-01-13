/**
 * Main agent logic that orchestrates the decision-making and execution.
 * This is the core of the agent architecture.
 */

import OpenAI from 'openai';
import { 
  getOrCreateSession, 
  addMessage, 
  serializeSession,
  getScreenComponents,
  getSession,
  addDecisionToHistory
} from '../state';
import { AgentDecisionSchema, type AgentDecision, type NewComponentSpec } from './schemas';
import { 
  createComponent, 
  updateComponent, 
  composeScreen,
  findComponentByName
} from './tools';
import { DECISION_SYSTEM_PROMPT, formatStateForDecision, JSON_CORRECTION_PROMPT } from './prompts';
import type { SerializedSessionState, Component, ScreenLayout, LayoutSpec } from '../types';

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

/**
 * Result of running the agent.
 */
interface AgentResult {
  success: boolean;
  session: SerializedSessionState;
  rationale?: string;
  error?: string;
  decision?: AgentDecision;
}

/**
 * Normalizes the agent decision to handle LLM inconsistencies.
 * Also enforces business logic to prevent unwanted regeneration.
 * 
 * CRITICAL: This function MUST prevent accidental deletion of user's work!
 */
function normalizeDecision(decision: AgentDecision, hasExistingComponents: boolean, userPrompt: string): AgentDecision {
  console.log(`🔄 normalizeDecision called: action=${decision.action}, hasExisting=${hasExistingComponents}`);
  
  // Handle misplaced specs (LLM put specs in wrong field)
  if (decision.action === 'REGENERATE_SCREEN') {
    if ((!decision.regenerateSpecs || decision.regenerateSpecs.length === 0) 
        && decision.newComponents && decision.newComponents.length > 0) {
      console.log('   Fixing misplaced specs: moving newComponents to regenerateSpecs');
      decision = {
        ...decision,
        regenerateSpecs: decision.newComponents,
        newComponents: [],
      };
    }
  }

  // ==========================================================
  // BRANCHING DETECTION: Force createBranch when user asks for a copy/version
  // The LLM often fails to set this, so we detect it ourselves
  // ==========================================================
  const branchKeywords = [
    'new version', 'another version', 'different version', 'create a version',
    'branch', 'create a branch',
    'copy', 'duplicate', 'clone',
    'variant', 'alternative',
    'keep the original', 'without changing the original',
    'try a different', 'experiment with',
    'make a copy', 'create a copy'
  ];
  
  const promptLC = userPrompt.toLowerCase();
  const rationaleLC = decision.rationale.toLowerCase();
  
  // Check both the user's prompt AND the rationale for branching intent
  const hasBranchingIntent = branchKeywords.some(kw => 
    promptLC.includes(kw) || rationaleLC.includes(kw)
  );
  
  // If branching intent detected but createBranch not set, fix it
  if (hasExistingComponents && hasBranchingIntent && !decision.createBranch) {
    console.log('🌿 BRANCHING DETECTED: Forcing createBranch=true');
    console.log(`   Detected keywords in prompt or rationale`);
    decision = {
      ...decision,
      createBranch: true,
    };
  }

  // ==========================================================
  // REGENERATION PROTECTION
  // ==========================================================
  
  // Check if user EXPLICITLY asked for complete regeneration
  // These keywords indicate intentional deletion of existing work
  const explicitRegenKeywords = [
    'delete everything', 'start over', 'start fresh', 'completely new',
    'new page', 'different page', 'replace everything', 'from scratch',
    'completely different', 'total redesign', 'create a new', 'build a new'
  ];
  
  const isExplicitRegen = explicitRegenKeywords.some(kw => rationaleLC.includes(kw));
  
  // If REGENERATE with explicit intent, allow it
  if (hasExistingComponents && decision.action === 'REGENERATE_SCREEN' && isExplicitRegen) {
    console.log('✅ Allowing REGENERATE_SCREEN - user explicitly requested complete redesign');
    console.log(`   Rationale indicates: ${decision.rationale.substring(0, 100)}...`);
    return decision;
  }
  
  // PROTECTION: Block accidental REGENERATE when user seems to want updates
  if (hasExistingComponents && decision.action === 'REGENERATE_SCREEN' && !isExplicitRegen) {
    const specs = decision.regenerateSpecs || [];
    console.log('⚠️  PROTECTION: Converting REGENERATE_SCREEN to UPDATE_COMPONENTS');
    console.log(`   Rationale did not indicate explicit delete intent`);
    console.log(`   New components to add: ${specs.map(s => s.name).join(', ')}`);
    
    // Build a screen order that preserves existing components + adds new ones
    const existingNames = decision.screenOrder || [];
    const newNames = specs.map(s => s.name);
    const combinedOrder = [...existingNames, ...newNames.filter(n => !existingNames.includes(n))];
    
    return {
      action: 'UPDATE_COMPONENTS',
      rationale: `[PROTECTED] ${decision.rationale}. Adding new components while preserving existing ones.`,
      createBranch: decision.createBranch,  // Preserve branching intent
      newComponents: specs,
      updates: decision.updates || [],
      screenOrder: combinedOrder.length > 0 ? combinedOrder : undefined,
      layout: decision.layout,
    };
  }

  return decision;
}

/**
 * Makes a decision about how to handle the user's prompt.
 * Forces structured JSON output and validates with Zod.
 */
async function makeDecision(
  userPrompt: string,
  sessionId: string
): Promise<AgentDecision> {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Prepare context for the decision
  const components = Array.from(session.components.values());
  const hasExistingComponents = components.length > 0;
  const screenOrder = session.screen?.componentIds.map(id => {
    const comp = session.components.get(id);
    return comp?.name || id;
  }) || [];

  // DEBUG: Log session state
  console.log(`📋 Session state for decision: ${components.length} components, hasExisting=${hasExistingComponents}`);
  if (hasExistingComponents) {
    console.log(`   Existing components: ${components.map(c => c.name).join(', ')}`);
  }

  const messageHistory = session.messages.slice(-10).map(m => ({
    role: m.role,
    content: m.content,
  }));

  const userMessage = formatStateForDecision(
    userPrompt,
    messageHistory,
    components,
    screenOrder
  );

  // First attempt
  let response = await getOpenAI().chat.completions.create({
    model: getModel(),
    messages: [
      { role: 'system', content: DECISION_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  let content = response.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in decision response');
  }

  // Try to parse and validate
  try {
    const parsed = JSON.parse(content);
    const validated = AgentDecisionSchema.parse(parsed);
    return normalizeDecision(validated, hasExistingComponents, userPrompt);
  } catch (firstError) {
    // Retry with correction prompt
    console.log('First parse attempt failed, retrying with correction...');
    
    response = await getOpenAI().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: DECISION_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: content },
        { role: 'user', content: JSON_CORRECTION_PROMPT },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in retry response');
    }

    try {
      const parsed = JSON.parse(content);
      const validated = AgentDecisionSchema.parse(parsed);
      return normalizeDecision(validated, hasExistingComponents, userPrompt);
    } catch (secondError) {
      throw new Error(
        `Failed to parse agent decision after retry: ${secondError instanceof Error ? secondError.message : 'Unknown error'}`
      );
    }
  }
}

/**
 * Resolves component references to IDs.
 * Handles cases where user refers to "the header" instead of actual ID.
 */
function resolveComponentId(sessionId: string, reference: string): string | null {
  // If it looks like a UUID, return it directly
  if (reference.match(/^[0-9a-f-]{36}$/i)) {
    return reference;
  }

  // Try to find by name
  const result = findComponentByName(sessionId, reference);
  if (result.success && Array.isArray(result.data) && result.data.length > 0) {
    return (result.data[0] as Component).id;
  }

  return null;
}

/**
 * Resolves a component name to its ID from a list of components.
 */
function resolveComponentIdFromList(
  components: Component[],
  name: string
): string | undefined {
  const comp = components.find(
    c => c.name.toLowerCase() === name.toLowerCase()
  );
  return comp?.id;
}

/**
 * Executes the REGENERATE_SCREEN action.
 * Components are generated in PARALLEL for faster execution.
 */
async function executeRegenerate(
  sessionId: string,
  specs: NewComponentSpec[],
  layout?: LayoutSpec
): Promise<{ components: Component[]; error?: string }> {
  console.log(`⚡ Generating ${specs.length} components in parallel...`);
  
  // Generate all components in parallel for speed
  const results = await Promise.all(
    specs.map(spec => 
      createComponent(
        sessionId,
        spec.name,
        spec.description,
        spec.requirements,
        spec.styleHints
      )
    )
  );

  // Check for errors and collect successful components
  const createdComponents: Component[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result.success) {
      console.log(`⚠️ Failed to create ${specs[i].name}: ${result.error}`);
      // Continue with other components instead of failing entirely
      continue;
    }
    createdComponents.push(result.data as Component);
  }

  if (createdComponents.length === 0) {
    return { 
      components: [], 
      error: 'Failed to create any components' 
    };
  }

  console.log(`✅ Successfully created ${createdComponents.length}/${specs.length} components`);

  // Compose the screen with layout
  const componentIds = createdComponents.map(c => c.id);
  const layoutType: ScreenLayout = layout?.type || 'stack';
  
  // Build layout config by resolving component names to IDs
  const layoutConfig = layout ? {
    sidebarComponentId: layout.sidebarComponent 
      ? resolveComponentIdFromList(createdComponents, layout.sidebarComponent)
      : undefined,
    headerComponentId: layout.headerComponent
      ? resolveComponentIdFromList(createdComponents, layout.headerComponent)
      : undefined,
    footerComponentId: layout.footerComponent
      ? resolveComponentIdFromList(createdComponents, layout.footerComponent)
      : undefined,
  } : undefined;

  const screenResult = composeScreen(sessionId, componentIds, layoutType, layoutConfig);
  
  if (!screenResult.success) {
    return { 
      components: createdComponents, 
      error: `Failed to compose screen: ${screenResult.error}` 
    };
  }

  return { components: createdComponents };
}

/**
 * Executes the UPDATE_COMPONENTS action.
 * Updates and new components are processed in PARALLEL for speed.
 */
async function executeUpdate(
  sessionId: string,
  decision: AgentDecision
): Promise<{ error?: string }> {
  const session = getSession(sessionId);
  if (!session) {
    return { error: 'Session not found' };
  }

  // Prepare all operations
  const updateOps: Promise<void>[] = [];
  const createOps: Promise<Component | null>[] = [];

  // Queue updates to existing components
  if (decision.updates && decision.updates.length > 0) {
    console.log(`⚡ Updating ${decision.updates.length} components in parallel...`);
    for (const update of decision.updates) {
      const componentId = resolveComponentId(sessionId, update.componentId);
      
      if (!componentId) {
        console.warn(`Could not resolve component: ${update.componentId}`);
        continue;
      }

      updateOps.push(
        updateComponent(sessionId, componentId, update.changeDescription)
          .then(result => {
            if (!result.success) {
              console.warn(`Failed to update ${update.componentId}: ${result.error}`);
            }
          })
      );
    }
  }

  // Queue creation of new components
  if (decision.newComponents && decision.newComponents.length > 0) {
    console.log(`⚡ Creating ${decision.newComponents.length} new components in parallel...`);
    for (const spec of decision.newComponents) {
      createOps.push(
        createComponent(sessionId, spec.name, spec.description, spec.requirements, spec.styleHints)
          .then(result => {
            if (result.success) {
              return result.data as Component;
            } else {
              console.warn(`Failed to create ${spec.name}: ${result.error}`);
              return null;
            }
          })
      );
    }
  }

  // Execute all operations in parallel
  const [, createResults] = await Promise.all([
    Promise.all(updateOps),
    Promise.all(createOps)
  ]);

  const newComponents = createResults.filter((c): c is Component => c !== null);
  console.log(`✅ Completed: ${updateOps.length} updates, ${newComponents.length} new components`);

  // Get all components (existing + new) for layout resolution
  const allComponents = [
    ...Array.from(session.components.values()),
    ...newComponents
  ];

  // Determine layout
  const layoutType: ScreenLayout = decision.layout?.type || session.screen?.layout || 'stack';
  const layoutConfig = decision.layout ? {
    sidebarComponentId: decision.layout.sidebarComponent 
      ? resolveComponentIdFromList(allComponents, decision.layout.sidebarComponent)
      : session.screen?.layoutConfig?.sidebarComponentId,
    headerComponentId: decision.layout.headerComponent
      ? resolveComponentIdFromList(allComponents, decision.layout.headerComponent)
      : session.screen?.layoutConfig?.headerComponentId,
    footerComponentId: decision.layout.footerComponent
      ? resolveComponentIdFromList(allComponents, decision.layout.footerComponent)
      : session.screen?.layoutConfig?.footerComponentId,
  } : session.screen?.layoutConfig;

  // Update screen order if specified
  if (decision.screenOrder && decision.screenOrder.length > 0) {
    const orderedIds: string[] = [];
    
    for (const nameOrId of decision.screenOrder) {
      // First check if it's a name of a new component
      const newComp = newComponents.find(
        c => c.name.toLowerCase() === nameOrId.toLowerCase()
      );
      
      if (newComp) {
        orderedIds.push(newComp.id);
        continue;
      }

      // Try to resolve from existing components
      const id = resolveComponentId(sessionId, nameOrId);
      if (id) {
        orderedIds.push(id);
      } else {
        console.warn(`Could not resolve component in order: ${nameOrId}`);
      }
    }

    if (orderedIds.length > 0) {
      composeScreen(sessionId, orderedIds, layoutType, layoutConfig);
    }
  } else if (newComponents.length > 0 && session.screen) {
    // Add new components to the end of existing screen
    const existingIds = session.screen.componentIds;
    const newIds = newComponents.map(c => c.id);
    composeScreen(sessionId, [...existingIds, ...newIds], layoutType, layoutConfig);
  } else if (newComponents.length > 0) {
    // No existing screen, create one with new components
    composeScreen(sessionId, newComponents.map(c => c.id), layoutType, layoutConfig);
  } else if (decision.layout && session.screen) {
    // Just updating layout, no new components
    composeScreen(sessionId, session.screen.componentIds, layoutType, layoutConfig);
  }

  return {};
}

/**
 * Main agent entry point.
 * Takes a user prompt and session ID, returns the updated session state.
 */
export async function runAgent(
  prompt: string,
  sessionId?: string
): Promise<AgentResult> {
  try {
    // Get or create session
    console.log(`🚀 runAgent called with sessionId: ${sessionId || 'none'}`);
    const session = getOrCreateSession(sessionId);
    const actualSessionId = session.id;
    const isNewSession = !sessionId || sessionId !== actualSessionId;
    
    console.log(`   Actual session ID: ${actualSessionId}`);
    console.log(`   Is new session: ${isNewSession}`);
    console.log(`   Components in session: ${session.components.size}`);
    if (session.components.size > 0) {
      console.log(`   Component names: ${Array.from(session.components.values()).map(c => c.name).join(', ')}`);
    }

    // Add user message to history
    addMessage(actualSessionId, 'user', prompt);

    // Make decision
    const decision = await makeDecision(prompt, actualSessionId);
    console.log('Agent decision:', JSON.stringify(decision, null, 2));

    // Execute based on decision
    if (decision.action === 'REGENERATE_SCREEN') {
      if (!decision.regenerateSpecs || decision.regenerateSpecs.length === 0) {
        return {
          success: false,
          session: serializeSession(session),
          error: 'REGENERATE_SCREEN requires regenerateSpecs',
        };
      }

      // Clear existing components for regeneration
      // NOTE: normalizeDecision() has already approved this based on explicit user intent
      if (session.components.size > 0) {
        console.log('🗑️  Clearing existing components for REGENERATE_SCREEN (user explicitly requested)');
        console.log(`   Removing: ${Array.from(session.components.values()).map(c => c.name).join(', ')}`);
      }
      session.components.clear();
      session.screen = null;

      const result = await executeRegenerate(actualSessionId, decision.regenerateSpecs, decision.layout);
      
      if (result.error) {
        return {
          success: false,
          session: serializeSession(getSession(actualSessionId)!),
          rationale: decision.rationale,
          error: result.error,
        };
      }
    } else {
      const result = await executeUpdate(actualSessionId, decision);
      
      if (result.error) {
        return {
          success: false,
          session: serializeSession(getSession(actualSessionId)!),
          rationale: decision.rationale,
          error: result.error,
        };
      }
    }

    // Add assistant message summarizing what was done
    const assistantMessage = formatAssistantResponse(decision);
    addMessage(actualSessionId, 'assistant', assistantMessage);

    // Add decision to history
    const componentsAffected = getComponentsAffected(decision);
    addDecisionToHistory(actualSessionId, prompt, decision, componentsAffected);

    return {
      success: true,
      session: serializeSession(getSession(actualSessionId)!),
      rationale: decision.rationale,
      decision,
    };
  } catch (error) {
    console.error('Agent error:', error);
    
    const session = sessionId ? getSession(sessionId) : null;
    
    return {
      success: false,
      session: session ? serializeSession(session) : {
        id: '',
        messages: [],
        components: [],
        screen: null,
        decisionHistory: [],
      },
      error: error instanceof Error ? error.message : 'Unknown agent error',
    };
  }
}

/**
 * Gets the list of components affected by a decision.
 */
function getComponentsAffected(decision: AgentDecision): string[] {
  const affected: string[] = [];
  
  if (decision.updates) {
    affected.push(...decision.updates.map(u => u.componentId));
  }
  if (decision.newComponents) {
    affected.push(...decision.newComponents.map(c => c.name));
  }
  if (decision.regenerateSpecs) {
    affected.push(...decision.regenerateSpecs.map(s => s.name));
  }
  
  return affected;
}

/**
 * Formats a response message for the conversation history.
 */
function formatAssistantResponse(decision: AgentDecision): string {
  if (decision.action === 'REGENERATE_SCREEN') {
    const componentNames = decision.regenerateSpecs?.map(s => s.name).join(', ') || '';
    return `Created a new screen with components: ${componentNames}. ${decision.rationale}`;
  }

  const parts: string[] = [];
  
  if (decision.updates && decision.updates.length > 0) {
    const updated = decision.updates.map(u => u.componentId).join(', ');
    parts.push(`Updated: ${updated}`);
  }
  
  if (decision.newComponents && decision.newComponents.length > 0) {
    const added = decision.newComponents.map(c => c.name).join(', ');
    parts.push(`Added: ${added}`);
  }
  
  if (decision.screenOrder && decision.screenOrder.length > 0) {
    parts.push(`Reordered screen`);
  }

  return parts.length > 0 
    ? `${parts.join('. ')}. ${decision.rationale}`
    : decision.rationale;
}

/**
 * Gets the rendered HTML for the current screen.
 */
export function getRenderedScreen(sessionId: string): string {
  const components = getScreenComponents(sessionId);
  
  if (components.length === 0) {
    return '';
  }

  return components.map(c => c.html).join('\n\n');
}
