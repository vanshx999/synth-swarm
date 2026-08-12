import { NextRequest } from 'next/server';
import { SwarmEngine } from '@/lib/engine/swarm';
import { getProvider } from '@/lib/providers/index';
import type { SwarmEvent, SwarmEventCallback } from '@/lib/types';

const KEEPALIVE_INTERVAL_MS = 15_000;

export async function POST(request: NextRequest) {
  let body: { topic?: unknown; provider?: unknown };

  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (!body.topic || typeof body.topic !== 'string' || body.topic.trim() === '') {
    return new Response(JSON.stringify({ error: 'topic is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const topic: string = body.topic;
  const providerChoice: 'demo' | 'groq' =
    body.provider === 'groq' ? 'groq' : body.provider === 'demo' ? 'demo' : 'demo';
  const groqApiKey = process.env.GROQ_API_KEY;

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SwarmEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Keep the connection alive during long operations (15s comment line).
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Stream already closed; the interval is cleared in the finally block.
        }
      }, KEEPALIVE_INTERVAL_MS);

      try {
        const provider = getProvider(providerChoice, groqApiKey);

        const engine = new SwarmEngine(provider, ((event: SwarmEvent) => {
          send(event);
        }) as SwarmEventCallback);

        await engine.run(topic);
      } catch (error) {
        const errorEvent: SwarmEvent = {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        };
        try {
          send(errorEvent);
        } catch {
          // Stream already closed; nothing else to do.
        }
      } finally {
        if (keepAlive) {
          clearInterval(keepAlive);
          keepAlive = null;
        }
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

export async function GET(request: NextRequest) {
  request.nextUrl.searchParams.get('sessionId');
  return new Response(
    JSON.stringify({ status: 'This is an SSE endpoint. Use POST to start a swarm.' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}