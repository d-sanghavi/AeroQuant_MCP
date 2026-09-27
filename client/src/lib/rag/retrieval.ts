import { CORPUS, type DocChunk } from '@/data/generate/documents'

/**
 * Retrieval over the regulatory corpus.
 *
 * TF-IDF with cosine similarity, computed here, in the browser, over the twenty-one
 * chunks in `documents.ts`. There is no model and no network call, and the screen that
 * uses this says so - a "chat" interface that quietly requires an API key is the one
 * thing this prototype is not allowed to be.
 *
 * The part that matters for official statistics is `asOf`. A compiler's question is
 * almost never "what is the rule" - it is "what was the rule in March 2026, when the
 * fare I am trying to explain was quoted". So the index is built against a date, and a
 * chunk is eligible only if it had taken effect by that date and had not yet been
 * superseded. Retrieval over the current corpus would confidently return the wrong
 * passenger service fee for any question about a period before April 2026.
 */

export interface RetrievalHit {
  readonly chunk: DocChunk
  readonly score: number
  /** Which query terms this chunk actually matched, for the citation chip. */
  readonly matchedTerms: string[]
}

export interface RetrievalResult {
  readonly hits: RetrievalHit[]
  readonly asOf: string
  readonly eligibleChunks: number
  readonly excludedBySupersession: DocChunk[]
  readonly queryTerms: string[]
}

/**
 * A deliberately small stop list. Aggressive stopword removal hurts here: "not",
 * "shall" and "no" carry the meaning in regulatory text, and dropping them makes a
 * prohibition retrieve the same as a permission.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'at', 'by', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these',
  'those', 'as', 'from', 'which', 'what', 'how', 'do', 'does', 'did', 'i', 'we',
  'you', 'me', 'my', 'our',
])

/**
 * Stemming, of a sort.
 *
 * A real stemmer would be Porter's algorithm. This is the small subset that matters
 * for this corpus: plurals and a few verb endings, so that "index" matches "indices"
 * and "supersede" matches "superseded". Anything more would be machinery without a
 * corresponding gain on twenty-one chunks.
 */
function stem(word: string): string {
  if (word.length <= 3) return word
  if (word === 'indices') return 'index'
  if (word === 'fees') return 'fee'
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1)
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3)
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2)
  return word
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem)
}

function termFrequency(tokens: readonly string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  // Sub-linear scaling. A chunk that says "fare" nine times is not nine times more
  // about fares than one that says it once.
  for (const [k, v] of tf) tf.set(k, 1 + Math.log(v))
  return tf
}

interface IndexedChunk {
  readonly chunk: DocChunk
  readonly tf: Map<string, number>
  readonly norm: number
  readonly weights: Map<string, number>
}

/** Whether a chunk was in force on a given date. */
export function inForceOn(chunk: DocChunk, asOf: string): boolean {
  if (chunk.publishedOn > asOf) return false
  if (chunk.supersededOn !== null && chunk.supersededOn <= asOf) return false
  return true
}

/**
 * Build the TF-IDF index over the chunks in force on `asOf`.
 *
 * The IDF is recomputed for each as-of date rather than computed once over the whole
 * corpus. That is the more expensive choice and the correct one: document frequency is
 * a property of the collection being searched, and a term that is rare among the
 * documents in force is a more discriminating term than one that looks rare only
 * because of documents that had not yet been issued.
 */
function buildIndex(asOf: string): IndexedChunk[] {
  const eligible = CORPUS.filter((c) => inForceOn(c, asOf))
  const N = eligible.length
  const df = new Map<string, number>()

  const tfs = eligible.map((chunk) => {
    const tokens = tokenize(`${chunk.title} ${chunk.section} ${chunk.text}`)
    const tf = termFrequency(tokens)
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)
    return { chunk, tf }
  })

  return tfs.map(({ chunk, tf }) => {
    const weights = new Map<string, number>()
    let sumSq = 0
    for (const [term, f] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1
      const w = f * idf
      weights.set(term, w)
      sumSq += w * w
    }
    return { chunk, tf, weights, norm: Math.sqrt(sumSq) || 1 }
  })
}

export function retrieve(query: string, asOf: string, k = 4): RetrievalResult {
  const index = buildIndex(asOf)
  const queryTerms = tokenize(query)
  const qtf = termFrequency(queryTerms)

  // The query is weighted by the same IDF the documents were, which is what makes the
  // cosine a comparison of two vectors in one space rather than two.
  const N = index.length
  const df = new Map<string, number>()
  for (const item of index) for (const term of item.tf.keys()) df.set(term, (df.get(term) ?? 0) + 1)

  const qWeights = new Map<string, number>()
  let qSumSq = 0
  for (const [term, f] of qtf) {
    const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1
    const w = f * idf
    qWeights.set(term, w)
    qSumSq += w * w
  }
  const qNorm = Math.sqrt(qSumSq) || 1

  const hits: RetrievalHit[] = index
    .map(({ chunk, weights, norm }) => {
      let dot = 0
      const matched: string[] = []
      for (const [term, qw] of qWeights) {
        const dw = weights.get(term)
        if (dw === undefined) continue
        dot += qw * dw
        matched.push(term)
      }
      return { chunk, score: dot / (qNorm * norm), matchedTerms: matched }
    })
    .filter((h) => h.score > 0.02)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  return {
    hits,
    asOf,
    eligibleChunks: index.length,
    // Surfaced so the interface can say WHY an answer differs at a different date,
    // rather than silently returning a different one.
    excludedBySupersession: CORPUS.filter(
      (c) => c.supersededOn !== null && c.supersededOn <= asOf,
    ),
    queryTerms: [...qWeights.keys()],
  }
}

/**
 * Compose an answer from retrieved chunks.
 *
 * Templated, extractive and deliberately dull. The answer is assembled from the
 * sentences that actually matched, each attributed to the instrument it came from. It
 * does not paraphrase, because a paraphrase of a regulatory provision is a new
 * provision, and it does not answer when nothing was retrieved.
 */
export function composeAnswer(result: RetrievalResult): {
  answer: string
  confidence: 'high' | 'moderate' | 'none'
  sentences: { text: string; chunkId: string }[]
} {
  if (result.hits.length === 0) {
    return {
      answer:
        'Nothing in the corpus in force on this date matches that question closely enough to answer it. Try naming the instrument, the levy or the method you are asking about.',
      confidence: 'none',
      sentences: [],
    }
  }

  const top = result.hits[0]!
  const sentences: { text: string; chunkId: string }[] = []

  for (const hit of result.hits.slice(0, 3)) {
    const best = bestSentence(hit.chunk.text, result.queryTerms)
    if (best) sentences.push({ text: best, chunkId: hit.chunk.id })
  }

  return {
    answer: sentences.map((s) => s.text).join(' '),
    // The gap between the top hit and the runner-up says more about confidence than
    // the top score alone: a decisive match is one that beat the alternatives.
    confidence:
      top.score > 0.28 && (result.hits.length === 1 || top.score > result.hits[1]!.score * 1.35)
        ? 'high'
        : 'moderate',
    sentences,
  }
}

/** The sentence in a chunk carrying the most query terms, by weight of rarity. */
function bestSentence(text: string, queryTerms: readonly string[]): string | null {
  const wanted = new Set(queryTerms)
  const sentences = text.split(/(?<=\.)\s+/).filter((s) => s.trim().length > 0)
  let best: string | null = null
  let bestScore = -1
  for (const s of sentences) {
    const tokens = tokenize(s)
    let score = 0
    for (const t of tokens) if (wanted.has(t)) score++
    // Normalise so a long sentence does not win by containing everything.
    const normalised = score / Math.sqrt(Math.max(1, tokens.length))
    if (normalised > bestScore) {
      bestScore = normalised
      best = s.trim()
    }
  }
  return bestScore > 0 ? best : sentences[0]?.trim() ?? null
}
