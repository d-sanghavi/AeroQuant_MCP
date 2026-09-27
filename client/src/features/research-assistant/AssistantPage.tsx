import * as React from 'react'
import { ArrowUp, FileText, History } from 'lucide-react'
import {
  Badge,
  Button,
  EmptyState,
  Panel,
  PanelHeader,
  PageHeader,
  Tip,
} from '@/components/ui/primitives'
import { FadeIn, Readout } from '@/components/ui/numbers'
import { composeAnswer, retrieve, type RetrievalResult } from '@/lib/rag/retrieval'
import { CORPUS, DOCUMENTS, type DocChunk } from '@/data/generate/documents'
import { COLLECTION_END, WINDOW_START } from '@/data/master/calendar'
import { fmtDate, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Research Assistant.
 *
 * This is a retrieval interface wearing a chat interface's clothes, and it says so on
 * the screen. There is no language model: the answer is assembled from the sentences
 * that actually matched, each one attributed to the instrument it came from. Nothing
 * is paraphrased, because a paraphrase of a regulatory provision is a new provision.
 *
 * The as-of date is the feature. Ask what the passenger service fee is with the date
 * set to February 2026 and you get Rs 160; move the date past 1 April 2026 and you get
 * Rs 185, because the 2024 order was superseded. A compiler reconstructing a published
 * figure needs the rule that was in force at the time, not the rule now, and an
 * assistant that cannot make that distinction is worse than no assistant.
 */

interface Turn {
  readonly id: number
  readonly question: string
  readonly asOf: string
  readonly result: RetrievalResult
  readonly answer: ReturnType<typeof composeAnswer>
}

const SUGGESTIONS = [
  'What is the passenger service fee for domestic departing passengers?',
  'Which elementary aggregation formula is recommended, and why not Carli?',
  'What is chain drift and how does it differ from time reversal failure?',
  'May we collect fares from a site whose terms prohibit automated access?',
  'How should booking horizons be sampled for an airfare index?',
  'How is the confidence interval on the published index estimated?',
]

/** The supersession the as-of picker exists to demonstrate. */
const PIVOT = '2026-04-01'

export default function AssistantPage(): React.ReactElement {
  const [asOf, setAsOf] = React.useState(COLLECTION_END)
  const [draft, setDraft] = React.useState('')
  const [turns, setTurns] = React.useState<Turn[]>([])
  const nextId = React.useRef(1)
  const endRef = React.useRef<HTMLDivElement>(null)

  const ask = React.useCallback(
    (question: string, date = asOf) => {
      const q = question.trim()
      if (q.length === 0) return
      const result = retrieve(q, date)
      const answer = composeAnswer(result)
      setTurns((prev) => [...prev, { id: nextId.current++, question: q, asOf: date, result, answer }])
      setDraft('')
    },
    [asOf],
  )

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns.length])

  /** Re-run the last question at the other side of the supersession. */
  const lastQuestion = turns[turns.length - 1]?.question
  const eligible = React.useMemo(() => retrieve('', asOf).eligibleChunks, [asOf])

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Interfaces"
        title="Research Assistant"
        description="Retrieval over the regulatory corpus by TF-IDF and cosine similarity, computed in your browser. No language model, no network call, and no paraphrase - answers are the sentences that matched, with the instrument each came from."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="asof" className="label-caps whitespace-nowrap">
              As of
            </label>
            <input
              id="asof"
              type="date"
              value={asOf}
              min={WINDOW_START}
              max={COLLECTION_END}
              onChange={(e) => setAsOf(e.target.value)}
              className="tap h-8 rounded border border-line bg-surface px-2 text-xs text-ink"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Ask the corpus"
            subtitle={`${fmtNumber(eligible)} chunks in force on ${fmtDate(asOf)} · ${DOCUMENTS.length} documents`}
            info="Only instruments that had taken effect by the as-of date and had not been superseded by it are searchable. Change the date and the eligible set changes with it."
            actions={
              turns.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setTurns([])}
                  className="tap text-2xs text-faint hover:text-accent"
                >
                  Clear
                </button>
              ) : null
            }
          />

          <div className="flex max-h-[34rem] min-h-[18rem] flex-col gap-3 overflow-y-auto p-3 sm:p-4">
            {turns.length === 0 ? (
              <EmptyState
                title="Nothing asked yet"
                detail="Pick a question below, or type one. The passenger service fee question is the one to try twice, with the as-of date on either side of 1 April 2026."
              />
            ) : (
              turns.map((turn) => <TurnBlock key={turn.id} turn={turn} />)
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line p-3 sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                ask(draft)
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor="q" className="sr-only">
                Question
              </label>
              <textarea
                id="q"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    ask(draft)
                  }
                }}
                rows={2}
                placeholder="Ask about a levy, a method, or a compliance rule..."
                className="min-h-[2.75rem] flex-1 resize-none rounded border border-line bg-surface px-2.5 py-2 text-xs leading-relaxed text-ink placeholder:text-faint"
              />
              <Button type="submit" variant="primary" disabled={draft.trim().length === 0}>
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">Ask</span>
              </Button>
            </form>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="tap rounded border border-line px-2 py-1 text-left text-2xs text-muted transition-colors hover:border-accent/50 hover:text-accent"
                >
                  {s}
                </button>
              ))}
            </div>

            {lastQuestion ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <History className="h-3.5 w-3.5 text-faint" aria-hidden />
                <span className="text-2xs text-faint">Ask the same question as of</span>
                {['2026-02-15', '2026-09-27'].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={asOf === d ? 'primary' : 'default'}
                    onClick={() => {
                      setAsOf(d)
                      ask(lastQuestion, d)
                    }}
                  >
                    {fmtDate(d)}
                  </Button>
                ))}
                <span className="text-2xs text-faint">
                  &mdash; either side of the AERA supersession on {fmtDate(PIVOT)}
                </span>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Corpus"
            subtitle="Synthetic instruments written for this prototype"
            info="These documents do not exist. They are written in the register and structure of the real instruments they stand in for, so that the retrieval has something of the right shape to work on. The retrieval itself is real."
          />
          <div className="flex max-h-[34rem] flex-col gap-2 overflow-y-auto p-3 sm:p-4">
            {DOCUMENTS.map((docId) => {
              const chunks = CORPUS.filter((c) => c.docId === docId)
              const head = chunks[0]!
              const superseded = head.supersededOn !== null && head.supersededOn <= asOf
              const notYet = head.publishedOn > asOf
              return (
                <div
                  key={docId}
                  className={cn(
                    'rounded border border-line bg-elevated/40 p-2.5',
                    (superseded || notYet) && 'opacity-55',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-2xs font-medium leading-relaxed text-ink">
                      {head.title}
                    </p>
                    {superseded ? (
                      <Badge tone="negative">superseded</Badge>
                    ) : notYet ? (
                      <Badge tone="neutral">not yet issued</Badge>
                    ) : (
                      <Badge tone="positive">in force</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-2xs text-faint">{head.issuer}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num text-2xs text-muted">{docId}</span>
                    <span className="text-2xs text-faint">
                      {chunks.length} {chunks.length === 1 ? 'chunk' : 'chunks'}
                    </span>
                    <span className="text-2xs text-faint">
                      eff. {fmtDate(head.publishedOn)}
                    </span>
                  </div>
                  {head.supersededBy ? (
                    <p className="mt-1.5 text-2xs text-warn">
                      Superseded {fmtDate(head.supersededOn!)} by{' '}
                      <span className="num">{head.supersededBy}</span>
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="How this answers" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">Retrieval, not generation.</span> Each chunk is
            scored by cosine similarity between its TF-IDF vector and the query&rsquo;s,
            with the document frequencies recomputed for the eligible set at your as-of
            date. The answer is then the highest-scoring sentence from each of the top
            chunks, quoted rather than rewritten.
          </p>
          <p>
            <span className="text-ink">Dating is not a filter bolted on top.</span> The
            inverse document frequency is computed over the documents in force on the
            chosen date, so a term that is rare among those documents scores as rare.
            Filtering a today-built index after the fact would rank on the wrong
            statistics.
          </p>
          <p>
            <span className="text-ink">It declines.</span> Below a similarity floor the
            assistant says nothing matched rather than returning the least bad chunk. An
            interface that always produces a confident paragraph teaches its reader to
            stop checking, which is the failure mode that matters in this setting.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function TurnBlock({ turn }: { turn: Turn }): React.ReactElement {
  const { answer, result } = turn
  return (
    <FadeIn className="flex flex-col gap-2">
      <div className="self-end rounded-lg rounded-br-sm border border-accent/30 bg-accent/10 px-3 py-2">
        <p className="text-xs leading-relaxed text-ink">{turn.question}</p>
        <p className="mt-1 text-2xs text-faint">as of {fmtDate(turn.asOf)}</p>
      </div>

      <div className="rounded-lg rounded-bl-sm border border-line bg-elevated/50 px-3 py-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <Badge
            tone={
              answer.confidence === 'high'
                ? 'positive'
                : answer.confidence === 'moderate'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {answer.confidence === 'none' ? 'no match' : `${answer.confidence} confidence`}
          </Badge>
          <span className="text-2xs text-faint">
            {result.eligibleChunks} chunks searched &middot; {result.hits.length} retrieved
          </span>
        </div>

        <p className="text-xs leading-relaxed text-ink">{answer.answer}</p>

        {result.hits.length > 0 ? (
          <>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {result.hits.map((hit) => (
                <CitationChip key={hit.chunk.id} chunk={hit.chunk} score={hit.score} />
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-3 border-t border-line pt-2">
              <Readout label="Top score" value={result.hits[0]!.score.toFixed(3)} />
              <Readout
                label="Margin"
                value={
                  result.hits.length > 1
                    ? (result.hits[0]!.score - result.hits[1]!.score).toFixed(3)
                    : '—'
                }
                info="How far the best chunk beat the runner-up. A thin margin means the corpus has two comparable answers and the ranking between them is not meaningful."
              />
              <Readout
                label="Matched terms"
                value={result.hits[0]!.matchedTerms.slice(0, 4).join(', ') || '—'}
                mono={false}
              />
            </div>
          </>
        ) : null}
      </div>
    </FadeIn>
  )
}

function CitationChip({ chunk, score }: { chunk: DocChunk; score: number }): React.ReactElement {
  return (
    <Tip
      content={
        <span className="block">
          <span className="block text-2xs font-medium">{chunk.title}</span>
          <span className="mt-1 block text-2xs text-faint">
            {chunk.issuer} &middot; {chunk.section}
          </span>
          <span className="mt-1.5 block text-2xs leading-relaxed">{chunk.text}</span>
        </span>
      }
    >
      <span className="tap inline-flex cursor-help items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-muted transition-colors hover:border-accent/50 hover:text-accent">
        <FileText className="h-3 w-3" aria-hidden />
        <span className="num">{chunk.reference}</span>
        <span className="text-faint">{score.toFixed(2)}</span>
      </span>
    </Tip>
  )
}
