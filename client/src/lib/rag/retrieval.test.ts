import { describe, expect, it } from 'vitest'
import { retrieve, composeAnswer, inForceOn } from './retrieval'
import { CORPUS } from '@/data/generate/documents'

/**
 * The as-of behaviour is the whole reason this module exists, so it is the thing
 * tested. A retrieval system that returns today's rule for a question about last year
 * is not merely imprecise - for a compiler reconstructing a published figure it is
 * actively wrong, and wrong in a way that looks right.
 */
describe('as-of dated retrieval', () => {
  const QUESTION = 'What is the passenger service fee for domestic departing passengers?'

  it('returns the 2024 determination for a date before the supersession', () => {
    const r = retrieve(QUESTION, '2026-02-15')
    expect(r.hits.length).toBeGreaterThan(0)
    const answer = composeAnswer(r).answer
    expect(answer).toContain('160')
    expect(answer).not.toContain('185')
    expect(r.hits.some((h) => h.chunk.docId === 'AERA/2026/PSF/03')).toBe(false)
  })

  it('returns the 2026 determination for a date after it', () => {
    const r = retrieve(QUESTION, '2026-09-27')
    const answer = composeAnswer(r).answer
    expect(answer).toContain('185')
    expect(r.hits.some((h) => h.chunk.docId === 'AERA/2024/PSF/07')).toBe(false)
  })

  it('excludes an instrument that had not yet been issued', () => {
    // The 2026 order takes effect on 1 April 2026; on 31 March it does not exist.
    const chunk = CORPUS.find((c) => c.id === 'aera-2026-psf-01')!
    expect(inForceOn(chunk, '2026-03-31')).toBe(false)
    expect(inForceOn(chunk, '2026-04-01')).toBe(true)
  })

  it('reports what it dropped rather than silently changing its answer', () => {
    const r = retrieve(QUESTION, '2026-09-27')
    expect(r.excludedBySupersession.some((c) => c.docId === 'AERA/2024/PSF/07')).toBe(true)
  })

  it('scores a specific question above an unrelated one', () => {
    const relevant = retrieve('chain drift in a chained bilateral index', '2026-09-27')
    expect(relevant.hits[0]!.chunk.docId).toBe('ILO/CPI/MANUAL/2020')
    expect(relevant.hits[0]!.score).toBeGreaterThan(0.1)
  })

  it('declines to answer when nothing matches', () => {
    const r = retrieve('zzzz qqqq wwww', '2026-09-27')
    const composed = composeAnswer(r)
    expect(composed.confidence).toBe('none')
    expect(r.hits).toHaveLength(0)
  })

  it('finds the geometric mean recommendation from a question about formulae', () => {
    const r = retrieve('which elementary aggregation formula is recommended', '2026-09-27')
    expect(r.hits.some((h) => h.chunk.text.includes('geometric mean'))).toBe(true)
  })
})
