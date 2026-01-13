/**
 * In-memory session state store.
 * Manages session state for active users.
 * 
 * IMPORTANT: Uses global object to survive Next.js hot reloads in dev mode.
 */

import { v4 as uuidv4 } from 'uuid';
import type { 
  SessionState, 
  SerializedSessionState, 
  Component, 
  Message,
  Screen,
  DecisionHistoryEntry,
  AgentDecision
} from '../types';

// Extend global type for TypeScript
declare global {
  // eslint-disable-next-line no-var
  var __sessions: Map<string, SessionState> | undefined;
}

// Use global object to survive Next.js hot reloads
// In production, this is just a regular Map
// In development, it persists across hot reloads
function getSessionsMap(): Map<string, SessionState> {
  if (process.env.NODE_ENV === 'development') {
    // Use global to survive hot reloads
    if (!global.__sessions) {
      console.log('🔧 Initializing global sessions store (dev mode)');
      global.__sessions = new Map<string, SessionState>();
    }
    return global.__sessions;
  }
  // In production, use module-level variable (it won't hot reload anyway)
  return productionSessions;
}

// Production sessions store
const productionSessions = new Map<string, SessionState>();

// Helper to get the sessions map
const sessions = {
  get(key: string) { return getSessionsMap().get(key); },
  set(key: string, value: SessionState) { return getSessionsMap().set(key, value); },
  has(key: string) { return getSessionsMap().has(key); },
  delete(key: string) { return getSessionsMap().delete(key); },
  get size() { return getSessionsMap().size; },
  values() { return getSessionsMap().values(); },
};

/**
 * Creates a new session with empty state.
 */
export function createSession(): SessionState {
  const id = uuidv4();
  const now = new Date();
  
  const session: SessionState = {
    id,
    messages: [],
    components: new Map(),
    screen: null,
    decisionHistory: [],
    createdAt: now,
    lastActivityAt: now,
  };
  
  sessions.set(id, session);
  return session;
}

/**
 * Gets an existing session or creates a new one.
 */
export function getOrCreateSession(sessionId?: string): SessionState {
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId)!;
    session.lastActivityAt = new Date();
    return session;
  }
  return createSession();
}

/**
 * Gets a session by ID.
 */
export function getSession(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId);
}

/**
 * Adds a message to the session history.
 */
export function addMessage(
  sessionId: string, 
  role: 'user' | 'assistant' | 'system', 
  content: string
): Message | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  const message: Message = {
    role,
    content,
    timestamp: new Date(),
  };
  
  session.messages.push(message);
  session.lastActivityAt = new Date();
  
  return message;
}

/**
 * Adds or updates a component in the session.
 */
export function upsertComponent(sessionId: string, component: Component): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  session.components.set(component.id, component);
  session.lastActivityAt = new Date();
  
  return true;
}

/**
 * Gets a component by ID from a session.
 */
export function getComponent(sessionId: string, componentId: string): Component | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  return session.components.get(componentId);
}

/**
 * Updates the screen composition.
 */
export function updateScreen(sessionId: string, screen: Screen): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  session.screen = screen;
  session.lastActivityAt = new Date();
  
  return true;
}

/**
 * Resets a session to empty state (keeps the session ID).
 */
export function resetSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  
  session.messages = [];
  session.components.clear();
  session.screen = null;
  session.decisionHistory = [];
  session.lastActivityAt = new Date();
  
  return true;
}

/**
 * Adds a decision to the session's history.
 */
export function addDecisionToHistory(
  sessionId: string,
  prompt: string,
  decision: AgentDecision,
  componentsAffected: string[]
): DecisionHistoryEntry | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  const entry: DecisionHistoryEntry = {
    id: uuidv4(),
    prompt,
    decision,
    timestamp: new Date(),
    componentsAffected,
  };
  
  session.decisionHistory.push(entry);
  session.lastActivityAt = new Date();
  
  return entry;
}

/**
 * Deletes a session completely.
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Serializes a session for API response (converts Map to array).
 */
export function serializeSession(session: SessionState): SerializedSessionState {
  return {
    id: session.id,
    messages: session.messages,
    components: Array.from(session.components.values()),
    screen: session.screen,
    decisionHistory: session.decisionHistory,
  };
}

/**
 * Lists all components in a session with their names and descriptions.
 */
export function listComponents(sessionId: string): { id: string; name: string; description: string }[] {
  const session = sessions.get(sessionId);
  if (!session) return [];
  
  return Array.from(session.components.values()).map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));
}

/**
 * Gets the ordered components for the current screen.
 */
export function getScreenComponents(sessionId: string): Component[] {
  const session = sessions.get(sessionId);
  if (!session || !session.screen) return [];
  
  return session.screen.componentIds
    .map(id => session.components.get(id))
    .filter((c): c is Component => c !== undefined);
}
