// src/lib/types.ts

export type SourceId =
  | 'github'
  | 'linkedin'
  | 'indeed'
  | 'stackoverflow'
  | 'google'
  | 'huggingface'
  | 'twitter'

export interface RawCandidate {
  sourceId: SourceId
  externalId: string        // unique ID within that source
  name: string
  headline?: string
  location?: string
  profileUrl: string
  avatarUrl?: string
  skills: string[]
  yearsOfExperience?: number
  githubStats?: GitHubStats
  stackOverflowStats?: StackOverflowStats
  rawData: Record<string, unknown>
}

export interface GitHubStats {
  followers: number
  publicRepos: number
  totalStars: number
  totalForks: number
  contributionDays: number   // active days in last year
  topLanguages: string[]
  hireable: boolean | null
}

export interface StackOverflowStats {
  reputation: number
  answersCount: number
  acceptedAnswers: number
  badgeGold: number
  badgeSilver: number
}

export interface ScoredCandidate extends RawCandidate {
  score: number              // 0–100
  scoreBreakdown: ScoreBreakdown
  dedupeKey: string          // normalized name+email hash
}

export interface ScoreBreakdown {
  github: number
  skills: number
  experience: number
  openSource: number
  community: number
  recency: number
}

export interface SearchParams {
  query: string              // role / keywords
  location: string
  topN: number               // 25 | 50 | 100
  sources: SourceId[]
  minScore?: number
}

export interface SearchResult {
  params: SearchParams
  candidates: ScoredCandidate[]
  totalScanned: number
  durationMs: number
  errors: SourceError[]
}

export interface SourceError {
  sourceId: SourceId
  message: string
}

export interface SearchProgress {
  sourceId: SourceId
  status: 'pending' | 'running' | 'done' | 'error'
  found: number
  message: string
}
