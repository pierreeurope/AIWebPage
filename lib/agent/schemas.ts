/**
 * Zod schemas for validating agent LLM outputs.
 * These schemas enforce structured JSON output from the model.
 */

import { z } from 'zod';

/**
 * Schema for describing an update to an existing component.
 */
export const ComponentUpdateSchema = z.object({
  componentId: z.string().describe('ID of the component to update'),
  changeDescription: z.string().describe('Description of what to change'),
});

/**
 * Schema for specifying a new component to create.
 */
export const NewComponentSpecSchema = z.object({
  name: z.string().describe('Name for the component (e.g., Header, Footer, HeroSection)'),
  description: z.string().describe('Brief description of what this component does'),
  requirements: z.string().describe('Detailed requirements for the component'),
  styleHints: z.string().optional().describe('Optional style hints (colors, fonts, spacing)'),
});

/**
 * Schema for layout specification.
 */
export const LayoutSpecSchema = z.object({
  type: z.enum(['stack', 'sidebar-left', 'sidebar-right', 'holy-grail', 'grid-2', 'grid-3']).describe(
    'Layout type: stack (vertical), sidebar-left/right, holy-grail (header+sidebar+footer), grid-2/3'
  ),
  sidebarComponent: z.string().optional().describe('Name of the sidebar component'),
  headerComponent: z.string().optional().describe('Name of the header component'),
  footerComponent: z.string().optional().describe('Name of the footer component'),
});

/**
 * Schema for the agent's decision on how to handle a user prompt.
 * This is the primary output format we force from the LLM.
 */
export const AgentDecisionSchema = z.object({
  action: z.enum(['REGENERATE_SCREEN', 'UPDATE_COMPONENTS']).describe(
    'REGENERATE_SCREEN: Create a new screen from scratch. ' +
    'UPDATE_COMPONENTS: Modify existing components or add new ones to current screen.'
  ),
  rationale: z.string().describe('Explanation of why this action was chosen'),
  createBranch: z.boolean().optional().describe(
    'Set to true if the user wants a NEW VERSION/COPY/BRANCH of the design rather than modifying the original. ' +
    'Keywords: "new version", "branch", "copy", "duplicate", "variant", "alternative", "another version"'
  ),
  updates: z.array(ComponentUpdateSchema).optional().describe(
    'Components to update (only for UPDATE_COMPONENTS action)'
  ),
  newComponents: z.array(NewComponentSpecSchema).optional().describe(
    'New components to add to the existing screen (only for UPDATE_COMPONENTS action)'
  ),
  screenOrder: z.array(z.string()).optional().describe(
    'New ordering of component names if the order should change'
  ),
  regenerateSpecs: z.array(NewComponentSpecSchema).optional().describe(
    'Component specs for full regeneration (only for REGENERATE_SCREEN action)'
  ),
  layout: LayoutSpecSchema.optional().describe(
    'How components should be arranged spatially'
  ),
});

/**
 * Schema for the HTML output when generating a component.
 */
export const ComponentHtmlOutputSchema = z.object({
  html: z.string().describe('The HTML content for this component, using Tailwind CSS classes'),
  description: z.string().describe('Updated description if needed'),
});

/**
 * Type exports inferred from schemas.
 */
export type ComponentUpdate = z.infer<typeof ComponentUpdateSchema>;
export type NewComponentSpec = z.infer<typeof NewComponentSpecSchema>;
export type AgentDecision = z.infer<typeof AgentDecisionSchema>;
export type ComponentHtmlOutput = z.infer<typeof ComponentHtmlOutputSchema>;
