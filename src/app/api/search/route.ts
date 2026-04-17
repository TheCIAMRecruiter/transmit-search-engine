// src/app/api/search/route.ts
// Streaming Server-Sent Events endpoint
// GET /api/search?query=...&location=...&topN=...&sources=...

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { runSearch } from '../../../lib/orchestrator'
import type { SourceId, SearchProgress } from '../../../lib/types'

export const runtime = 'nodejs'
export const maxDuration = 300  // 2 min timeout (Vercel Pro; 60s on free)

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
  location: z.string().default('Global'),
  topN: z.coerce.number().int().min(10).max(100).default(100),
  sources: z.string().default('github,linkedin,stackoverflow,google,huggingface,indeed'),
})

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const parsed = SearchSchema.safeParse(Object.fromEntries(url.searchParams))

  if (!parsed.success) {
    return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { query, location, topN, sources } = parsed.data
  const sourceList = sources.split(',').filter(Boolean) as SourceId[]

  // Set up SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        controller.enqueue(encoder.encode(payload))
      }

      send('start', { query, location, topN, sources: sourceList })

      try {
        const result = await runSearch(
          { query, location, topN, sources: sourceList },
          (progress: SearchProgress) => {
            send('progress', progress)
          }
        )

        send('result', result)
      } catch (err) {
        send('error', {
          message: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
