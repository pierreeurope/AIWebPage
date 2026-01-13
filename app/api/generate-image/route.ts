import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/agent/tools';

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json();
    
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // Generate image using DALL-E (with caching)
    const imageUrl = await generateImage(prompt);
    
    return NextResponse.json({ 
      success: true, 
      imageUrl 
    });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to generate image',
        // Fallback to Unsplash
        imageUrl: `https://source.unsplash.com/800x600/?abstract`
      },
      { status: 500 }
    );
  }
}
