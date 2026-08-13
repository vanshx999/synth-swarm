import { NextRequest } from 'next/server';
import { SwarmEngine } from '@/lib/engine/swarm';
import { getProvider } from '@/lib/providers/index';
import type { ProviderConfig, SwarmEvent, SwarmEventCallback } from '@/lib/types';

const KEEPALIVE_INTERVAL_MS = 15_000;

export async function POST(request: NextRequest) {
  let body: { topic?: unknown };

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
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY is not configured on the server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const config: ProviderConfig = {
    groqApiKey,
  };

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SwarmEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      // Keep the connection alive during long operations.
      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // Stream already closed; the interval is cleared in the finally block.
        }
      }, KEEPALIVE_INTERVAL_MS);

      try {
        const provider = getProvider(config);

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