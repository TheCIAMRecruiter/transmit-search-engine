// src/lib/scoring/engine.ts
// 12-factor scoring rubric — produces a 0–100 score per candidate

import type { RawCandidate, ScoredCandidate, ScoreBreakdown, SearchParams } from '../types'

// ─── Weight Configuration ──────────────────────────────────────────────────
const WEIGHTS = {
  github: Number(process.env.WEIGHT_GITHUB) || 25,
  skills: Number(process.env.WEIGHT_SKILLS) || 20,
  experience: Number(process.env.WEIGHT_EXPERIENCE) || 20,
  openSource: Number(process.env.WEIGHT_OPENSOURCE) || 15,
  community: Number(process.env.WEIGHT_COMMUNITY) || 10,
  recency: Number(process.env.WEIGHT_RECENCY) || 10,
}

// ─── Individual Factor Scorers ─────────────────────────────────────────────

/**
 * GitHub signal score (0–100)
 * Factors: followers, stars, forks, contribution activity
 */
function scoreGitHub(candidate: RawCandidate): number {
  const gh = candidate.githubStats
  if (!gh) return 0

  // Followers: log scale, caps at 100 pts at ~10k followers
  const followerScore = Math.min(100, Math.log10(gh.followers + 1) * 25)

  // Stars: log scale
  const starScore = Math.min(100, Math.log10(gh.totalStars + 1) * 30)

  // Contribution activity: how many days active in last year
  const activityScore = Math.min(100, (gh.contributionDays / 365) * 100)

  // Repo count: diminishing returns after 50
  const repoScore = Math.min(100, Math.sqrt(gh.publicRepos) * 10)

  // Hireable bonus
  const hireableBonus = gh.hireable === true ? 10 : 0

  return Math.min(100, (followerScore * 0.35 + starScore * 0.3 + activityScore * 0.25 + repoScore * 0.1) + hireableBonus)
}

/**
 * Skills match score (0–100)
 * How well the candidate's skills match the search query
 */
function scoreSkills(candidate: RawCandidate, query: string): number {
  if (!candidate.skills?.length) return 20

  const queryTerms = query.toLowerCase().split(/\s+/)
  const skills = candidate.skills.map(s => s.toLowerCase())

  // Direct skill matches
  let directMatches = 0
  for (const skill of skills) {
    for (const term of queryTerms) {
      if (skill.includes(term) || term.includes(skill)) {
        directMatches++
        break
      }
    }
  }

  // Skill breadth bonus (having >5 skills = senior signal)
  const breadthBonus = Math.min(20, candidate.skills.length * 4)

  const matchScore = Math.min(80, (directMatches / Math.max(queryTerms.length, 1)) * 80)
  return Math.min(100, matchScore + breadthBonus)
}

/**
 * Experience score (0–100)
 * Years of experience with sweet-spot curve (8–15 years = peak)
 */
function scoreExperience(candidate: RawCandidate): number {
  const yoe = candidate.yearsOfExperience
  if (!yoe) return 40  // Unknown = assume mid-level

  // Curve: 0→0, 3→50, 7→80, 10→95, 15→100, 25→90 (too senior = less mobile)
  if (yoe < 1) return 10
  if (yoe < 3) return 30 + yoe * 7
  if (yoe < 7) return 50 + (yoe - 3) * 8
  if (yoe < 12) return 82 + (yoe - 7) * 3
  if (yoe < 20) return Math.min(100, 97 + (yoe - 12) * 0.5)
  return Math.max(70, 100 - (yoe - 20) * 2)
}

/**
 * Open source contribution score (0–100)
 * GitHub forks, SO accepted answers, HF model downloads
 */
function scoreOpenSource(candidate: RawCandidate): number {
  let score = 0

  if (candidate.githubStats) {
    const { totalForks, totalStars } = candidate.githubStats
    score += Math.min(60, Math.log10(totalForks + 1) * 20)
    score += Math.min(40, Math.log10(totalStars + 1) * 15)
  }

  if (candidate.stackOverflowStats) {
    const { acceptedAnswers, reputation } = candidate.stackOverflowStats
    score += Math.min(30, acceptedAnswers * 3)
    score += Math.min(30, Math.log10(reputation + 1) * 10)
  }

  // HuggingFace signals from rawData
  if (candidate.sourceId === 'huggingface' || candidate.rawData?.totalDownloads) {
    const downloads = Number(candidate.rawData?.totalDownloads) || 0
    score += Math.min(40, Math.log10(downloads + 1) * 10)
  }

  return Math.min(100, score)
}

/**
 * Community reputation score (0–100)
 * SO reputation, GitHub followers, citations
 */
function scoreCommunity(candidate: RawCandidate): number {
  let score = 0

  if (candidate.stackOverflowStats) {
    const rep = candidate.stackOverflowStats.reputation
    score += Math.min(50, Math.log10(rep + 1) * 15)
    score += candidate.stackOverflowStats.badgeGold * 5
    score += candidate.stackOverflowStats.badgeSilver * 2
  }

  if (candidate.githubStats) {
    score += Math.min(40, Math.log10(candidate.githubStats.followers + 1) * 12)
  }

  // Scholar citations
  const citations = Number(candidate.rawData?.totalCitations) || 0
  if (citations > 0) {
    score += Math.min(30, Math.log10(citations + 1) * 10)
  }

  return Math.min(100, score)
}

/**
 * Recency score (0–100)
 * How recently the candidate was active
 */
function scoreRecency(candidate: RawCandidate): number {
  // GitHub: contribution activity in last year
  if (candidate.githubStats) {
    const days = candidate.githubStats.contributionDays
    return Math.min(100, (days / 180) * 100)
  }

  // Fallback for other sources
  return 60
}

// ─── Main Scoring Function ─────────────────────────────────────────────────

export function scoreCandidate(
  candidate: RawCandidate,
  params: SearchParams
): ScoredCandidate {
  const breakdown: ScoreBreakdown = {
    github: Math.round(scoreGitHub(candidate)),
    skills: Math.round(scoreSkills(candidate, params.query)),
    experience: Math.round(scoreExperience(candidate)),
    openSource: Math.round(scoreOpenSource(candidate)),
    community: Math.round(scoreCommunity(candidate)),
    recency: Math.round(scoreRecency(candidate)),
  }

  // Weighted average
  const score = Math.round(
    (breakdown.github * WEIGHTS.github +
      breakdown.skills * WEIGHTS.skills +
      breakdown.experience * WEIGHTS.experience +
      breakdown.openSource * WEIGHTS.openSource +
      breakdown.community * WEIGHTS.community +
      breakdown.recency * WEIGHTS.recency) /
    (WEIGHTS.github + WEIGHTS.skills + WEIGHTS.experience +
      WEIGHTS.openSource + WEIGHTS.community + WEIGHTS.recency)
  )

  // Dedupe key: normalized name
  const dedupeKey = candidate.name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return {
    ...candidate,
    score: Math.min(99, Math.max(1, score)),
    scoreBreakdown: breakdown,
    dedupeKey,
  }
}

// ─── Deduplication ─────────────────────────────────────────────────────────

export function deduplicateCandidates(candidates: ScoredCandidate[]): ScoredCandidate[] {
  const seen = new Map<string, ScoredCandidate>()

  for (const candidate of candidates) {
    const existing = seen.get(candidate.dedupeKey)
    if (!existing || candidate.score > existing.score) {
      seen.set(candidate.dedupeKey, candidate)
    }
  }

  return Array.from(seen.values())
}

// ─── Autonomous Re-Ranking ─────────────────────────────────────────────────
// After initial scoring, apply a second-pass quality filter

export function reRankCandidates(
  candidates: ScoredCandidate[],
  topN: number
): ScoredCandidate[] {
  // Sort by score descending
  const sorted = [...candidates].sort((a, b) => b.score - a.score)

  // Apply diversity boost: ensure at least 30% from non-GitHub sources
  const nonGH = sorted.filter(c => c.sourceId !== 'github')
  const gh = sorted.filter(c => c.sourceId === 'github')

  const diverseTarget = Math.ceil(topN * 0.3)
  const ghTarget = topN - diverseTarget

  const result = [
    ...gh.slice(0, ghTarget),
    ...nonGH.slice(0, diverseTarget),
  ].sort((a, b) => b.score - a.score)

  return result.slice(0, topN)
}
