/**
 * API route for running the agent.
 * POST /api/generate - processes a user prompt through the agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { runAgent, getRenderedScreen } from '@/lib/agent';
import type { GenerateResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    const body = await request.json();
    const { prompt, sessionId } = body as { prompt?: string; sessionId?: string };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          session: { id: '', messages: [], components: [], screen: null },
          error: 'Prompt is required',
        },
        { status: 400 }
      );
    }

    const result = await runAgent(prompt.trim(), sessionId);

    return NextResponse.json({
      success: result.success,
      session: result.session,
      error: result.error,
      agentRationale: result.rationale,
      agentDecision: result.decision,
    });
  } catch (error) {
    console.error('API error:', error);
    
    return NextResponse.json(
      {
        success: false,
        session: { id: '', messages: [], components: [], screen: null },
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
