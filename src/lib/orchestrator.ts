// src/lib/orchestrator.ts
// Runs all scrapers in parallel, scores results, deduplicates, re-ranks
// Uses Server-Sent Events to stream progress back to the UI

import PQueue from 'p-queue'
import { scrapeGitHub } from './scrapers/github'
import { scrapeLinkedIn } from './scrapers/linkedin'
import { scrapeStackOverflow } from './scrapers/stackoverflow'
import { scrapeGoogle } from './scrapers/google'
import { scrapeHuggingFace } from './scrapers/huggingface'
import { scrapeIndeed } from './scrapers/indeed'
import { scoreCandidate, deduplicateCandidates, reRankCandidates } from './scoring/engine'
import type {
  SearchParams,
  SearchResult,
  ScoredCandidate,
  SourceError,
  SearchProgress,
  SourceId,
} from './types'

type ProgressCallback = (progress: SearchProgress) => void

// Each source gets an allocation of the total limit
function allocateLimits(topN: number): Record<SourceId, number> {
  return {
    github: Math.ceil(topN * 0.35),
    linkedin: Math.ceil(topN * 0.25),
    stackoverflow: Math.ceil(topN * 0.15),
    google: Math.ceil(topN * 0.10),
    huggingface: Math.ceil(topN * 0.08),
    indeed: Math.ceil(topN * 0.07),
    twitter: 0, // Reserved — Twitter API now $100/mo minimum
  }
}

export async function runSearch(
  params: SearchParams,
  onProgress?: ProgressCallback
): Promise<SearchResult> {
  const startTime = Date.now()
  const allCandidates: ScoredCandidate[] = []
  const errors: SourceError[] = []
  const limits = allocateLimits(params.topN)

  // Use a queue with concurrency 4 to avoid hammering APIs simultaneously
  const queue = new PQueue({ concurrency: 4 })

  const sources = params.sources.filter(s => s !== 'twitter') // skip Twitter for now

  const tasks = sources.map(sourceId => {
    return queue.add(async () => {
      const limit = limits[sourceId] || 10

      onProgress?.({
        sourceId,
        status: 'running',
        found: 0,
        message: `Scanning ${sourceId}...`,
      })

      try {
        let raw = []

        switch (sourceId) {
          case 'github':
            raw = await scrapeGitHub(params.query, params.location, limit)
            break
          case 'linkedin':
            raw = await scrapeLinkedIn(params.query, params.location, limit)
            break
          case 'stackoverflow':
            raw = await scrapeStackOverflow(params.query, params.location, limit)
            break
          case 'google':
            raw = await scrapeGoogle(params.query, params.location, limit)
            break
          case 'huggingface':
            raw = await scrapeHuggingFace(params.query, params.location, limit)
            break
          case 'indeed':
            raw = await scrapeIndeed(params.query, params.location, limit)
            break
        }

        // Score each candidate immediately
        const scored = raw.map(c => scoreCandidate(c, params))
        allCandidates.push(...scored)

        onProgress?.({
          sourceId,
          status: 'done',
          found: scored.length,
          message: `Found ${scored.length} candidates`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ sourceId, message })

        onProgress?.({
          sourceId,
          status: 'error',
          found: 0,
          message: `Error: ${message}`,
        })
      }
    })
  })

  await Promise.allSettled(tasks)

  // Post-processing
  onProgress?.({
    sourceId: 'github', // placeholder
    status: 'running',
    found: allCandidates.length,
    message: `Deduplicating ${allCandidates.length} candidates...`,
  })

  const deduped = deduplicateCandidates(allCandidates)
  const final = reRankCandidates(deduped, params.topN)

  return {
    params,
    candidates: final,
    totalScanned: allCandidates.length,
    durationMs: Date.now() - startTime,
    errors,
  }
}
