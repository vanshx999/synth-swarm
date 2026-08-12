import { NextRequest, NextResponse } from 'next/server';
import { createEngine } from '@/lib/engine/swarm';
import { ProviderConfig } from '@/lib/types';

const engines = new Map<string, ReturnType<typeof createEngine>>();

export async function POST(request: NextRequest) {
  try {
    const { topic, sessionId, config } = await request.json();
    
    if (!topic || !sessionId) {
      return NextResponse.json({ error: 'topic and sessionId required' }, { status: 400 });
    }

    const providerConfig: ProviderConfig = {
      demoMode: config?.demoMode ?? true,
      groq: config?.groqApiKey ? { apiKey: config.groqApiKey } : undefined,
      gemini: config?.geminiApiKey ? { apiKey: config.geminiApiKey } : undefined,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const engine = createEngine(providerConfig, (state) => {
          send({ type: 'state', state });
        });

        engines.set(sessionId, engine);

        try {
          send({ type: 'started', topic });
          const report = await engine.run(topic);
          send({ type: 'complete', report });
        } catch (error) {
          send({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error' });
        } finally {
          engines.delete(sessionId);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to start swarm' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  
  const engine = engines.get(sessionId);
  if (!engine) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  
  return NextResponse.json({ state: engine.getState() });
}