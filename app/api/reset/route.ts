/**
 * API route for resetting a session.
 * POST /api/reset - clears all session state
 */

import { NextRequest, NextResponse } from 'next/server';
import { resetSession, getSession, serializeSession } from '@/lib/state';
import type { GenerateResponse } from '@/lib/types';

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    const body = await request.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          session: { id: '', messages: [], components: [], screen: null },
          error: 'Session ID is required',
        },
        { status: 400 }
      );
    }

    const success = resetSession(sessionId);
    
    if (!success) {
      return NextResponse.json(
        {
          success: false,
          session: { id: '', messages: [], components: [], screen: null },
          error: 'Session not found',
        },
        { status: 404 }
      );
    }

    const session = getSession(sessionId);
    
    return NextResponse.json({
      success: true,
      session: session ? serializeSession(session) : {
        id: sessionId,
        messages: [],
        components: [],
        screen: null,
      },
    });
  } catch (error) {
    console.error('Reset API error:', error);
    
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
