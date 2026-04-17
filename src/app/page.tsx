'use client'

import { useState, useRef, useCallback } from 'react'
import type { ScoredCandidate, SearchProgress, SourceId } from '../lib/types'

const SOURCES: { id: SourceId; name: string; color: string }[] = [
  { id: 'github', name: 'GitHub', color: '#e2e8f0' },
  { id: 'linkedin', name: 'LinkedIn', color: '#4cc9f0' },
  { id: 'indeed', name: 'Indeed', color: '#ffd166' },
  { id: 'huggingface', name: 'Hugging Face', color: '#c084fc' },
  { id: 'google', name: 'Google Scholar', color: '#06d6a0' },
  { id: 'stackoverflow', name: 'Stack Overflow', color: '#f97316' },
]

type SortMode = 'score' | 'name' | 'source' | 'experience'
type SearchStatus = 'idle' | 'running' | 'done' | 'error'

export default function TransmitSearch() {
  const [query, setQuery] = useState('Senior ML Engineer')
  const [location, setLocation] = useState('Global / Remote')
  const [topN, setTopN] = useState(100)
  const [candidates, setCandidates] = useState<ScoredCandidate[]>([])
  const [progress, setProgress] = useState<Record<string, SearchProgress>>({})
  const [logs, setLogs] = useState<{ t: string; msg: string; type: string }[]>([
    { t: now(), msg: 'System ready. Configure search parameters above.', type: 'muted' }
  ])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [sortMode, setSortMode] = useState<SortMode>('score')
  const [totalScanned, setTotalScanned] = useState(0)
  const [duration, setDuration] = useState(0)
  const [selected, setSelected] = useState<ScoredCandidate | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function now() {
    return new Date().toLocaleTimeString('en', { hour12: false })
  }

  const addLog = useCallback((msg: string, type = 'info') => {
    setLogs(prev => [...prev.slice(-20), { t: now(), msg, type }])
  }, [])

  const startSearch = useCallback(async () => {
    if (status === 'running') {
      abortRef.current?.abort()
      setStatus('idle')
      return
    }

    setCandidates([])
    setProgress({})
    setTotalScanned(0)
    setDuration(0)
    setStatus('running')
    addLog(`Initiating scan: "${query}"`, 'info')
    addLog(`Target: Top ${topN} candidates worldwide`, 'info')

    abortRef.current = new AbortController()
    const sources = SOURCES.map(s => s.id).join(',')
const url = `/api/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&topN=${String(topN)}&sources=${sources}`
    try {
      const res = await fetch(url, { signal: abortRef.current.signal })
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let event = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6))

            if (event === 'progress') {
              const p = data as SearchProgress
              setProgress(prev => ({ ...prev, [p.sourceId]: p }))
              if (p.status === 'done') {
                addLog(`${p.sourceId}: Found ${p.found} candidates`, 'ok')
              } else if (p.status === 'error') {
                addLog(`${p.sourceId}: ${p.message}`, 'warn')
              } else {
                addLog(p.message, 'info')
              }
            }

            if (event === 'result') {
              setCandidates(data.candidates)
              setTotalScanned(data.totalScanned)
              setDuration(Math.round(data.durationMs / 1000))
              setStatus('done')
              addLog(`Complete. ${data.candidates.length} candidates ranked in ${Math.round(data.durationMs / 1000)}s.`, 'ok')
            }

            if (event === 'error') {
              addLog(`Search error: ${data.message}`, 'warn')
              setStatus('error')
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        addLog(`Fatal error: ${(err as Error).message}`, 'warn')
        setStatus('error')
      }
    }
  }, [query, location, topN, status, addLog])

  const sorted = [...candidates].sort((a, b) => {
    if (sortMode === 'score') return b.score - a.score
    if (sortMode === 'name') return a.name.localeCompare(b.name)
    if (sortMode === 'source') return a.sourceId.localeCompare(b.sourceId)
    if (sortMode === 'experience') return (b.yearsOfExperience || 0) - (a.yearsOfExperience || 0)
    return 0
  })

  const totalFound = Object.values(progress).reduce((s, p) => s + (p.found || 0), 0)
  const progressPct = status === 'done' ? 100 : Math.min(90, (totalFound / topN) * 100)

  return (
    <div style={styles.app}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="9" fill="#0f1629"/>
            <text x="7" y="30" fontFamily="'DM Sans', sans-serif" fontWeight="800" fontSize="24" fill="#e8ecf4">t</text>
            <polygon points="7,9 16,9 11,16" fill="#e63946"/>
          </svg>
          <div>
            <div style={styles.logoName}>
              transmit <span style={styles.logoSub}>search engine</span>
            </div>
            <div style={styles.logoTag}>Autonomous Talent Intelligence</div>
          </div>
        </div>
        <div style={styles.statusBar}>
          <div style={{
            ...styles.statusDot,
            background: status === 'running' ? '#e63946' : status === 'done' ? '#06d6a0' : '#4cc9f0',
            animation: status === 'running' ? 'pulse 0.6s infinite' : 'pulse 2s infinite',
          }}/>
          <span style={styles.statusText}>
            {status === 'idle' ? 'READY' : status === 'running' ? 'SCANNING' : status === 'done' ? 'COMPLETE' : 'ERROR'}
          </span>
        </div>
      </div>

      {/* Search Panel */}
      <div style={styles.searchPanel}>
        <div style={styles.searchFields}>
          <div>
            <label style={styles.label}>Role / Keywords</label>
            <input style={styles.input} value={query} onChange={e => setQuery(e.target.value)} placeholder="e.g. Senior ML Engineer"/>
          </div>
          <div>
            <label style={styles.label}>Location</label>
            <input style={styles.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Global, US, Remote"/>
          </div>
          <div>
            <label style={styles.label}>Top Candidates</label>
            <select style={styles.select} value={topN} onChange={e => setTopN(Number(e.target.value))}>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
            </select>
          </div>
        </div>
        <button style={{
          ...styles.launchBtn,
          background: status === 'running' ? '#c1121f' : '#e63946',
        }} onClick={startSearch}>
          {status === 'running' ? 'Stop' : status === 'done' ? 'Re-Scan' : 'Launch Search'}
        </button>
      </div>

      {/* Main Grid */}
      <div style={styles.mainGrid}>
        {/* Sources Panel */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Sources</div>
          {SOURCES.map(src => {
            const p = progress[src.id]
            const isRunning = p?.status === 'running'
            const isDone = p?.status === 'done'
            const isError = p?.status === 'error'
            return (
              <div key={src.id} style={{
                ...styles.sourceItem,
                borderColor: isDone ? '#e63946' : isRunning ? '#ffd166' : '#2a3560',
              }}>
                <div style={styles.srcLeft}>
                  <div style={{ ...styles.srcIcon, color: src.color }}>
                    {src.id.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={styles.srcName}>{src.name}</span>
                </div>
                <span style={{
                  ...styles.srcCount,
                  color: isError ? '#ef4444' : src.color,
                  background: `${src.color}15`,
                }}>
                  {isError ? 'ERR' : isRunning ? '...' : (p?.found || 0)}
                </span>
              </div>
            )
          })}
          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #2a3560' }}>
            <div style={styles.panelTitle}>Progress</div>
            <div style={styles.progressOuter}>
              <div style={{ ...styles.progressInner, width: `${progressPct}%` }}/>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#6b7899', marginTop: 4 }}>
              {status === 'done'
                ? `${candidates.length} ranked · ${totalScanned} scanned · ${duration}s`
                : `${totalFound} / ${topN} candidates`}
            </div>
          </div>
        </div>

        {/* Results Panel */}
        <div style={styles.panel}>
          <div style={styles.resultsHeader}>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#6b7899' }}>
              Candidates: <span style={{ color: '#e63946' }}>{candidates.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['score', 'name', 'source', 'experience'] as SortMode[]).map(m => (
                <button key={m} style={{
                  ...styles.sortBtn,
                  borderColor: sortMode === m ? '#e63946' : '#2a3560',
                  color: sortMode === m ? '#e63946' : '#6b7899',
                }} onClick={() => setSortMode(m)}>{m}</button>
              ))}
            </div>
          </div>

          <div style={styles.candidatesList}>
            {candidates.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 28, opacity: 0.2 }}>◎</div>
                <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#6b7899' }}>
                  {status === 'running' ? 'Scanning sources...' : 'Configure search and launch'}
                </p>
              </div>
            ) : (
              sorted.map((c, i) => (
                <div key={`${c.sourceId}-${c.externalId}`} style={{
                  ...styles.candRow,
                  borderColor: selected?.externalId === c.externalId ? '#e63946' : '#2a3560',
                }} onClick={() => setSelected(selected?.externalId === c.externalId ? null : c)}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: i < 3 ? '#ffd166' : '#6b7899', textAlign: 'center' }}>
                    #{i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: '#6b7899', fontFamily: 'monospace' }}>
                      {c.headline?.slice(0, 50) || c.skills.slice(0, 3).join(' · ')}
                      {c.yearsOfExperience ? ` · ${c.yearsOfExperience}y` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 3, border: `1px solid ${SOURCES.find(s => s.id === c.sourceId)?.color}40`, color: SOURCES.find(s => s.id === c.sourceId)?.color }}>
                    {c.sourceId.toUpperCase()}
                  </div>
                  <div style={{ width: 70 }}>
                    <div style={styles.scoreBar}>
                      <div style={{ ...styles.scoreFill, width: `${c.score}%` }}/>
                    </div>
                    <div style={{ fontSize: 9, color: '#6b7899', fontFamily: 'monospace', marginTop: 2 }}>
                      {c.skills.slice(0, 2).join(' · ')}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
                    padding: '2px 8px', borderRadius: 10,
                    background: c.score >= 80 ? 'rgba(6,214,160,0.12)' : c.score >= 60 ? 'rgba(255,209,102,0.12)' : 'rgba(230,57,70,0.1)',
                    color: c.score >= 80 ? '#06d6a0' : c.score >= 60 ? '#ffd166' : '#e63946',
                    border: `1px solid ${c.score >= 80 ? 'rgba(6,214,160,0.3)' : c.score >= 60 ? 'rgba(255,209,102,0.3)' : 'rgba(230,57,70,0.25)'}`,
                  }}>{c.score}</span>
                </div>
              ))
            )}
          </div>

          {/* Expanded candidate detail */}
          {selected && (
            <div style={styles.candidateDetail}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</div>
                  <a href={selected.profileUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#4cc9f0', fontFamily: 'monospace' }}>
                    View Profile →
                  </a>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#6b7899', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 10 }}>
                {Object.entries(selected.scoreBreakdown).map(([key, val]) => (
                  <div key={key} style={{ background: '#1a2240', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#6b7899', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 2 }}>{key}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: val >= 70 ? '#06d6a0' : val >= 45 ? '#ffd166' : '#e63946' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selected.skills.map(s => (
                  <span key={s} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(230,57,70,0.1)', color: '#e63946', border: '1px solid rgba(230,57,70,0.25)', fontFamily: 'monospace' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Log */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #2a3560' }}>
            <div style={styles.panelTitle}>Activity Log</div>
            <div style={styles.logPanel}>
              {logs.slice(-3).map((l, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: 'monospace', lineHeight: 1.8, color: l.type === 'ok' ? '#06d6a0' : l.type === 'warn' ? '#ffd166' : l.type === 'info' ? '#4cc9f0' : '#6b7899' }}>
                  [{l.t}] {l.msg}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f1629; font-family: 'DM Sans', sans-serif; }
        input, select { background: #0f1629; border: 1px solid #2a3560; border-radius: 6px; padding: 9px 12px; color: #e8ecf4; font-family: 'DM Sans', sans-serif; font-size: 13px; outline: none; width: 100%; }
        input:focus, select:focus { border-color: #e63946; }
        select option { background: #0f1629; }
        button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: #2a3560; border-radius: 2px; }
      `}</style>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: { display: 'grid', gridTemplateRows: 'auto auto 1fr', minHeight: '100vh', padding: '1.5rem', gap: '1rem', maxWidth: 1100, margin: '0 auto', background: '#0f1629', color: '#e8ecf4', fontFamily: "'DM Sans', sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '1.25rem', borderBottom: '1px solid #2a3560' },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoName: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#e8ecf4' },
  logoSub: { fontSize: 13, fontWeight: 500, color: '#6b7899', letterSpacing: '0.01em' },
  logoTag: { fontSize: 10, fontFamily: 'monospace', color: '#6b7899', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 2 },
  statusBar: { display: 'flex', gap: 8, alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  statusText: { fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.08em', color: '#06d6a0' },
  searchPanel: { background: '#151d38', border: '1px solid #2a3560', borderRadius: 12, padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr auto', gap: '1rem', alignItems: 'end' },
  searchFields: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  label: { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7899', marginBottom: 6, display: 'block', fontFamily: 'monospace' },
  input: {},
  select: {},
  launchBtn: { color: '#fff', border: 'none', borderRadius: 8, padding: '11px 26px', fontWeight: 700, fontSize: 13, letterSpacing: '0.04em', whiteSpace: 'nowrap', transition: 'background .2s' },
  mainGrid: { display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1rem' },
  panel: { background: '#151d38', border: '1px solid #2a3560', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 6 },
  panelTitle: { fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7899', fontFamily: 'monospace', marginBottom: 2 },
  sourceItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 6, border: '1px solid #2a3560', background: '#1a2240', transition: 'border-color .2s' },
  srcLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  srcIcon: { width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, fontFamily: 'monospace', background: '#0f1629' },
  srcName: { fontSize: 12, fontWeight: 500 },
  srcCount: { fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 3 },
  progressOuter: { height: 3, background: '#2a3560', borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  progressInner: { height: '100%', background: 'linear-gradient(90deg, #c1121f, #e63946)', borderRadius: 2, transition: 'width 0.4s ease' },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 10, borderBottom: '1px solid #2a3560' },
  sortBtn: { background: 'transparent', borderRadius: 4, padding: '4px 10px', fontSize: 10, fontFamily: 'monospace', transition: 'all .2s', border: '1px solid' },
  candidatesList: { display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto', maxHeight: 300, paddingRight: 4 },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 150, gap: 8 },
  candRow: { display: 'grid', gridTemplateColumns: '30px 1fr auto auto auto', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, border: '1px solid', background: '#1a2240', cursor: 'pointer', transition: 'border-color .2s' },
  scoreBar: { height: 3, background: '#2a3560', borderRadius: 2, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 2, background: 'linear-gradient(90deg, #c1121f, #e63946)' },
  candidateDetail: { background: '#1a2240', border: '1px solid #2a3560', borderRadius: 8, padding: '12px 14px', marginTop: 6 },
  logPanel: { background: '#0f1629', borderRadius: 6, padding: '8px 10px', minHeight: 56 },
}
