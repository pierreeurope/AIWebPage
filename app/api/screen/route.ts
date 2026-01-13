/**
 * API route for getting the rendered screen HTML.
 * GET /api/screen?sessionId=xxx - returns the composed HTML
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRenderedScreen } from '@/lib/agent';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    );
  }

  const html = getRenderedScreen(sessionId);
  
  return NextResponse.json({ html });
}
