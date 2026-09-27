import * as React from 'react'
import { GripVertical, Plus, X } from 'lucide-react'
import {
  Badge,
  Button,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
  Tip,
} from '@/components/ui/primitives'
import { useFilter, usePivot } from '@/data/hooks'
import { useApp } from '@/data/store'
import { fmtINR, fmtMonth, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PivotDimension, PivotMeasure } from '@/data/worker/protocol'

/**
 * OLAP Workbench.
 *
 * Cross-tabulate the raw panel on any dimension. Two design decisions:
 *
 *  - Dimensions are assigned by drag on a pointer device and by TAP on a touch one.
 *    Drag-and-drop on a phone is a well-known accessibility failure, and this
 *    prototype has to work on a phone, so the touch path is a first-class control
 *    rather than a fallback that nobody tested.
 *
 *  - Every cell carries its observation count, and every cell is clickable through to
 *    the observations behind it. A pivot table that cannot tell you how many
 *    observations a cell rests on is an invitation to over-read a cell of three.
 */

const DIMENSIONS: { value: PivotDimension; label: string; hint: string }[] = [
  { value: 'period', label: 'Month', hint: 'Collection period' },
  { value: 'originState', label: 'Origin state', hint: 'State of the origin airport' },
  { value: 'destinationState', label: 'Destination state', hint: 'State of the destination airport' },
  { value: 'originRegion', label: 'Origin region', hint: 'North, West, South, East, Northeast, Central, Islands' },
  { value: 'airline', label: 'Airline', hint: 'Operating carrier' },
  { value: 'fareFamily', label: 'Fare family', hint: 'Saver, flexi or corporate' },
  { value: 'horizonBand', label: 'Horizon band', hint: 'Last-minute, short, medium or advance' },
  { value: 'season', label: 'Season', hint: 'Peak, shoulder or lean' },
  { value: 'cabin', label: 'Cabin', hint: 'Economy, premium or business' },
  { value: 'source', label: 'Source', hint: 'Which collector produced the quote' },
]

const MEASURES: { value: PivotMeasure; label: string; hint: string }[] = [
  { value: 'geomean', label: 'Geo mean', hint: 'Geometric mean fare - the right central measure for a right-skewed distribution' },
  { value: 'median', label: 'Median', hint: 'Middle fare' },
  { value: 'mean', label: 'Mean', hint: 'Arithmetic mean - pulled upward by the tail' },
  { value: 'p10', label: 'p10', hint: 'Tenth percentile fare' },
  { value: 'p90', label: 'p90', hint: 'Ninetieth percentile fare' },
  { value: 'count', label: 'Count', hint: 'Number of observations' },
]

const DIM_LABEL = new Map(DIMENSIONS.map((d) => [d.value, d.label]))

function Chip({
  dim,
  onRemove,
  onDragStart,
  draggable,
}: {
  dim: PivotDimension
  onRemove: () => void
  onDragStart?: (e: React.DragEvent) => void
  draggable?: boolean
}): React.ReactElement {
  return (
    <span
      draggable={draggable}
      onDragStart={onDragStart}
      className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 py-1 pl-1.5 pr-1 text-2xs font-medium text-accent"
    >
      {draggable ? <GripVertical className="h-3 w-3 opacity-60" aria-hidden /> : null}
      {DIM_LABEL.get(dim)}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${DIM_LABEL.get(dim)}`}
        className="tap grid h-4 w-4 place-items-center rounded hover:bg-accent/20"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  )
}

function DropZone({
  title,
  dims,
  onAdd,
  onRemove,
  available,
}: {
  title: string
  dims: PivotDimension[]
  onAdd: (d: PivotDimension) => void
  onRemove: (d: PivotDimension) => void
  available: PivotDimension[]
}): React.ReactElement {
  const [over, setOver] = React.useState(false)
  const [picking, setPicking] = React.useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const d = e.dataTransfer.getData('text/dimension') as PivotDimension
        if (d) onAdd(d)
      }}
      className={cn(
        'min-h-[3.25rem] rounded border border-dashed p-2 transition-colors',
        over ? 'border-accent bg-accent/5' : 'border-line bg-elevated/20',
      )}
    >
      <p className="label-caps mb-1.5">{title}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {dims.map((d) => (
          <Chip key={d} dim={d} onRemove={() => onRemove(d)} />
        ))}
        {available.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="tap inline-flex items-center gap-1 rounded border border-line px-1.5 py-1 text-2xs text-faint transition-colors hover:border-accent/40 hover:text-accent"
            >
              <Plus className="h-3 w-3" aria-hidden />
              Add
            </button>
            {picking ? (
              <>
                <button
                  type="button"
                  aria-label="Close"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setPicking(false)}
                />
                <ul className="absolute left-0 top-full z-20 mt-1 max-h-60 w-56 overflow-y-auto rounded border border-line bg-elevated py-1 shadow-pop">
                  {available.map((d) => (
                    <li key={d}>
                      <button
                        type="button"
                        onClick={() => {
                          onAdd(d)
                          setPicking(false)
                        }}
                        className="tap block w-full px-2.5 py-1.5 text-left text-xs text-ink transition-colors hover:bg-surface"
                      >
                        {DIM_LABEL.get(d)}
                        <span className="mt-0.5 block text-2xs text-faint">
                          {DIMENSIONS.find((x) => x.value === d)?.hint}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function OlapWorkbenchPage(): React.ReactElement {
  const filter = useFilter()
  const openLineage = useApp((s) => s.openLineage)
  const [rows, setRows] = React.useState<PivotDimension[]>(['originRegion'])
  const [cols, setCols] = React.useState<PivotDimension[]>(['horizonBand'])
  const [measure, setMeasure] = React.useState<PivotMeasure>('geomean')

  const spec = React.useMemo(
    () => ({ rows, cols, measure, filter }),
    [rows, cols, measure, filter],
  )
  const { data, loading, error, refresh } = usePivot(spec)

  const used = new Set([...rows, ...cols])
  const available = DIMENSIONS.map((d) => d.value).filter((d) => !used.has(d))

  const isMoney = measure !== 'count'
  const format = (v: number | null): string =>
    v === null ? '--' : isMoney ? fmtINR(v) : fmtNumber(v)

  // Colour scale across the whole table, so a cell's shade means the same thing in
  // every row - a per-row scale would make unrelated cells look comparable.
  const { lo, hi } = React.useMemo(() => {
    if (!data) return { lo: 0, hi: 1 }
    let a = Infinity
    let b = -Infinity
    for (const row of data.values) {
      for (const v of row) {
        if (v === null || !Number.isFinite(v)) continue
        a = Math.min(a, v)
        b = Math.max(b, v)
      }
    }
    return Number.isFinite(a) && Number.isFinite(b) && b > a ? { lo: a, hi: b } : { lo: 0, hi: 1 }
  }, [data])

  const shade = (v: number | null): string => {
    if (v === null || !Number.isFinite(v)) return 'transparent'
    const t = (v - lo) / (hi - lo)
    return `rgb(var(--aq-accent) / ${(0.05 + t * 0.3).toFixed(3)})`
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="OLAP workbench"
        title="Cross-tabulate the panel"
        description={
          <>
            Every cell is computed from the raw observations under the current window and
            source filter, and every cell opens the observations behind it. Counts are
            shown alongside values so a cell resting on three quotes cannot be mistaken
            for one resting on three thousand.
          </>
        }
        actions={
          data ? (
            <Badge tone="neutral">
              {data.rowKeys.length} x {data.colKeys.length} = {fmtNumber(data.nCells)} cells
            </Badge>
          ) : null
        }
      />

      <Panel>
        <PanelHeader
          title="Layout"
          subtitle="Drag a dimension onto rows or columns, or use Add on touch"
          actions={
            <Segmented<PivotMeasure>
              ariaLabel="Measure"
              size="sm"
              value={measure}
              onChange={setMeasure}
              options={MEASURES.map((m) => ({
                value: m.value,
                label: m.label,
                title: m.hint,
              }))}
            />
          }
        />
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div>
            <p className="label-caps mb-1.5">Available dimensions</p>
            <div className="flex flex-wrap gap-1.5">
              {available.map((d) => (
                <Tip key={d} content={DIMENSIONS.find((x) => x.value === d)?.hint}>
                  <span
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/dimension', d)}
                    className="inline-flex cursor-grab items-center gap-1 rounded border border-line bg-elevated px-1.5 py-1 text-2xs text-muted transition-colors hover:border-line-strong hover:text-ink active:cursor-grabbing"
                  >
                    <GripVertical className="h-3 w-3 opacity-50" aria-hidden />
                    {DIM_LABEL.get(d)}
                  </span>
                </Tip>
              ))}
              {available.length === 0 ? (
                <span className="text-2xs text-faint">All dimensions are in use.</span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <DropZone
              title="Rows"
              dims={rows}
              available={available}
              onAdd={(d) => setRows((r) => (r.includes(d) ? r : [...r, d]))}
              onRemove={(d) => setRows((r) => r.filter((x) => x !== d))}
            />
            <DropZone
              title="Columns"
              dims={cols}
              available={available}
              onAdd={(d) => setCols((c) => (c.includes(d) ? c : [...c, d]))}
              onRemove={(d) => setCols((c) => c.filter((x) => x !== d))}
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title={MEASURES.find((m) => m.value === measure)?.label ?? 'Measure'}
          subtitle={MEASURES.find((m) => m.value === measure)?.hint}
          info="Shading runs across the whole table rather than per row, so a shade means the same value wherever it appears."
        />
        {error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : loading || !data ? (
          <ChartSkeleton height={320} />
        ) : data.rowKeys.length === 0 ? (
          <EmptyState
            title="Nothing to tabulate"
            detail="No observations pass the current window and source filter."
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-faint sm:px-4">
                    {rows.map((r) => DIM_LABEL.get(r)).join(' / ') || 'All'}
                  </th>
                  {data.colKeys.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap px-3 py-2 text-right font-medium text-faint"
                    >
                      {c === 'All' ? 'All' : c.startsWith('20') ? fmtMonth(c) : c}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-l border-line px-3 py-2 text-right font-medium text-faint">
                    All
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rowKeys.map((rk, i) => (
                  <tr key={rk} className="border-b border-line/60 last:border-0">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1.5 text-left font-medium text-ink sm:px-4">
                      {rk.startsWith('20') ? fmtMonth(rk) : rk}
                    </th>
                    {data.values[i]!.map((v, j) => (
                      <td
                        key={data.colKeys[j]}
                        className="px-0 py-0 text-right"
                        style={{ background: shade(v) }}
                      >
                        <button
                          type="button"
                          disabled={v === null}
                          onClick={() =>
                            void openLineage({
                              label: `${rk} / ${data.colKeys[j]}`,
                              value: v ?? 0,
                              method: `${MEASURES.find((m) => m.value === measure)?.label} of fares`,
                              unit: isMoney ? 'inr' : 'count',
                              periodIdx: Math.max(0, (filter.periodTo ?? 0) - (filter.periodFrom ?? 0)),
                            })
                          }
                          className={cn(
                            'num block w-full px-3 py-1.5 text-right transition-colors',
                            v === null
                              ? 'cursor-default text-faint'
                              : 'text-ink hover:text-accent',
                          )}
                        >
                          {format(v)}
                          <span className="block text-[0.5625rem] text-faint">
                            n={fmtNumber(data.counts[i]![j]!)}
                          </span>
                        </button>
                      </td>
                    ))}
                    <td className="num border-l border-line px-3 py-1.5 text-right text-muted">
                      {format(data.rowTotals[i] ?? null)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-line-strong bg-elevated/30">
                  <th className="sticky left-0 z-10 bg-elevated px-3 py-1.5 text-left font-medium text-faint sm:px-4">
                    All
                  </th>
                  {data.colTotals.map((v, j) => (
                    <td key={j} className="num px-3 py-1.5 text-right text-muted">
                      {format(v)}
                    </td>
                  ))}
                  <td className="num border-l border-line px-3 py-1.5 text-right text-accent">
                    {format(data.grandTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setRows(['period'])
            setCols(['horizonBand'])
            setMeasure('count')
          }}
        >
          Show the composition drift
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setRows(['airline'])
            setCols(['cabin'])
            setMeasure('geomean')
          }}
        >
          Carrier by cabin
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setRows(['originRegion'])
            setCols(['season'])
            setMeasure('median')
          }}
        >
          Region by season
        </Button>
        <span className="text-2xs text-faint">
          The first preset is the Method Lab&rsquo;s argument in table form: the count of
          quotes shifts toward the last-minute band as the window advances.
        </span>
      </div>
    </div>
  )
}
