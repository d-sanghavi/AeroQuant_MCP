import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, ChevronLeft, FileJson, Loader2, ShieldCheck, X } from 'lucide-react'
import { useApp } from '@/data/store'
import { sha256Hex } from '@/data/worker/provenance'
import { fmtDate, fmtHash, fmtINR, fmtNumber } from '@/lib/format'
import { Badge, Button, ErrorState, Skeleton } from '@/components/ui/primitives'
import type { ObservationDto } from '@/data/worker/protocol'
import { cn } from '@/lib/utils'

/**
 * The Lineage drawer.
 *
 * This is the provenance claim made physical. A number on any screen opens this, it
 * lists the observations that produced it, and one of those resolves to the raw
 * payload the collector received, with its hash, its parser version and its ingestion
 * run. The Verify button then recomputes SHA-256 over the bytes displayed above it,
 * in the browser, and reports the match.
 *
 * That last detail is the one that matters. The payload is synthetic, but the
 * verification is not simulated - it is Web Crypto hashing the visible text. A viewer
 * can edit the displayed JSON in devtools and watch the check fail, which is exactly
 * the property a national statistical office needs from a real bronze layer.
 *
 * Responsively it is a right-hand drawer from the tablet band up and a bottom sheet on
 * phones, because a 380px-wide right drawer on a phone is unusable.
 */

type VerifyState = 'idle' | 'checking' | 'match' | 'mismatch'

function VerifyButton({ observation }: { observation: ObservationDto }): React.ReactElement {
  const [state, setState] = React.useState<VerifyState>('idle')
  const [computed, setComputed] = React.useState<string | null>(null)

  React.useEffect(() => {
    setState('idle')
    setComputed(null)
  }, [observation.index])

  const verify = async (): Promise<void> => {
    setState('checking')
    // Hash exactly the bytes rendered in the panel above, not a re-serialisation.
    const hash = await sha256Hex(observation.rawPayload)
    setComputed(hash)
    setState(hash === observation.sha256 ? 'match' : 'mismatch')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant={state === 'match' ? 'primary' : 'default'}
        onClick={() => void verify()}
        disabled={state === 'checking'}
      >
        {state === 'checking' ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : state === 'match' ? (
          <Check className="h-3 w-3" aria-hidden />
        ) : (
          <ShieldCheck className="h-3 w-3" aria-hidden />
        )}
        {state === 'match' ? 'Hash verified' : 'Verify hash'}
      </Button>
      {state === 'match' ? (
        <span className="text-2xs text-pos">
          SHA-256 recomputed in-browser matches the recorded digest.
        </span>
      ) : null}
      {state === 'mismatch' ? (
        <span className="num text-2xs text-neg">Mismatch: {fmtHash(computed ?? '')}</span>
      ) : null}
    </div>
  )
}

function ObservationDetail({
  observation,
  onBack,
}: {
  observation: ObservationDto
  onBack: () => void
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="tap -ml-1 flex w-fit items-center gap-1 rounded px-1 text-2xs text-muted transition-colors hover:text-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        Back to contributing observations
      </button>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded border border-line bg-elevated/40 p-3">
        {[
          ['Route', observation.routeId],
          ['Airline', observation.airline],
          ['Booking horizon', `T-${observation.horizon}`],
          ['Cabin', observation.cabin],
          ['Fare family', observation.fareFamily],
          ['Stops', String(observation.stops)],
          ['Collected', fmtDate(observation.collectionDate)],
          ['Departs', fmtDate(observation.departureDate)],
          ['Fare', fmtINR(observation.fare)],
          ['Seats available', fmtNumber(observation.seatsAvailable)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="label-caps truncate">{k}</dt>
            <dd className="num mt-0.5 truncate text-xs text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded border border-line bg-elevated/40 p-3">
        <p className="label-caps">Bronze object</p>
        <p className="num mt-1 break-all text-2xs text-muted">{observation.rawBlobUri}</p>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="label-caps">Parser version</p>
            <p className="num mt-0.5 truncate text-2xs text-ink">{observation.parserVersion}</p>
          </div>
          <div className="min-w-0">
            <p className="label-caps">Ingestion run</p>
            <p className="num mt-0.5 truncate text-2xs text-ink">{observation.ingestionRunId}</p>
          </div>
        </div>
        <div className="mt-2.5">
          <p className="label-caps">SHA-256 recorded at ingestion</p>
          <p className="num mt-0.5 break-all text-2xs text-accent">{observation.sha256}</p>
        </div>
        <div className="mt-3">
          <VerifyButton observation={observation} />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1.5">
          <FileJson className="h-3.5 w-3.5 text-faint" aria-hidden />
          <p className="label-caps">Raw payload as received</p>
        </div>
        <pre className="max-h-80 overflow-auto rounded border border-line bg-bg p-2.5 text-[0.6875rem] leading-relaxed text-muted">
          {observation.rawPayload}
        </pre>
      </div>
    </div>
  )
}

export function LineageDrawer(): React.ReactElement {
  const open = useApp((s) => s.lineageOpen)
  const loading = useApp((s) => s.lineageLoading)
  const lineage = useApp((s) => s.lineage)
  const error = useApp((s) => s.lineageError)
  const close = useApp((s) => s.closeLineage)
  const [selected, setSelected] = React.useState<ObservationDto | null>(null)

  React.useEffect(() => {
    if (!open) setSelected(null)
  }, [open])

  React.useEffect(() => {
    setSelected(null)
  }, [lineage])

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 flex flex-col border-line bg-surface shadow-pop',
            // Phone: bottom sheet. Tablet and up: right-hand drawer.
            'inset-x-0 bottom-0 max-h-[88vh] rounded-t-lg border-t',
            'sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(32rem,92vw)] sm:rounded-none sm:border-l sm:border-t-0',
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold text-ink">
                {lineage?.title ?? 'Provenance'}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 truncate text-2xs text-faint">
                {lineage
                  ? `${lineage.subtitle} · ${lineage.periodLabel} · ${lineage.method}`
                  : 'Resolving this figure to its source observations'}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close provenance"
                className="tap -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded text-muted hover:bg-elevated hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
            {error ? (
              <ErrorState message={error} />
            ) : loading || !lineage ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-4 w-1/3" />
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : selected ? (
              <ObservationDetail observation={selected} onBack={() => setSelected(null)} />
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="rounded border border-line bg-elevated/40 p-3">
                  <p className="label-caps">Aggregate value</p>
                  <p className="num mt-1 text-2xl font-semibold text-ink">
                    {lineage.unit === 'inr'
                      ? fmtINR(lineage.value)
                      : lineage.unit === 'percent'
                        ? `${lineage.value > 0 ? '+' : ''}${lineage.value.toFixed(2)}%`
                        : lineage.unit === 'pp'
                          ? `${lineage.value > 0 ? '+' : ''}${lineage.value.toFixed(2)}pp`
                          : lineage.unit === 'count'
                            ? fmtNumber(Math.round(lineage.value))
                            : lineage.value.toFixed(2)}
                    {lineage.unit === 'index' ? (
                      <span className="ml-1.5 text-xs font-normal text-faint">
                        index points
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-2 text-2xs leading-relaxed text-muted">
                    Computed by <span className="text-ink">{lineage.method}</span> from{' '}
                    <span className="num text-ink">
                      {fmtNumber(lineage.totalContributors)}
                    </span>{' '}
                    observations collected in {lineage.periodLabel}.
                  </p>
                </div>

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="label-caps">Contributing observations</p>
                    {lineage.totalContributors > lineage.contributors.length ? (
                      <Badge tone="neutral">
                        showing {lineage.contributors.length} of{' '}
                        {fmtNumber(lineage.totalContributors)}
                      </Badge>
                    ) : null}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {lineage.contributors.map((o) => (
                      <li key={o.index}>
                        <button
                          type="button"
                          onClick={() => setSelected(o)}
                          className="tap flex w-full items-center gap-2 rounded border border-line bg-elevated/30 px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-elevated"
                        >
                          <span className="num w-16 shrink-0 text-2xs text-muted">
                            {o.routeId}
                          </span>
                          <span className="num w-10 shrink-0 text-2xs text-faint">
                            T-{o.horizon}
                          </span>
                          <span className="num hidden w-10 shrink-0 text-2xs text-faint xs:inline">
                            {o.airline.slice(0, 2)}
                          </span>
                          <span className="num flex-1 truncate text-right text-xs text-ink">
                            {fmtINR(o.fare)}
                          </span>
                          <span className="num hidden w-24 shrink-0 truncate text-right text-2xs text-faint sm:inline">
                            {fmtHash(o.sha256)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-2xs leading-relaxed text-faint">
                    Select any row to open the raw payload it was parsed from and verify
                    its hash in the browser.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
