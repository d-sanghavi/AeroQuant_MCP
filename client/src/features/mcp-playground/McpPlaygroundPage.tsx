import * as React from 'react'
import { Play, Terminal } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import {
  Badge,
  Button,
  ErrorState,
  Panel,
  PanelHeader,
  PageHeader,
  Segmented,
} from '@/components/ui/primitives'
import { FadeIn, Readout } from '@/components/ui/numbers'
import { useFilter } from '@/data/hooks'
import {
  defaultArgs,
  jsonRpcRequest,
  TOOLS,
  TOOL_CATEGORIES,
  type ToolDef,
} from './tools'
import { cn } from '@/lib/utils'

/**
 * MCP Playground.
 *
 * Sixteen tools, each of which resolves to the same worker call the corresponding
 * screen makes. That is the point of the screen and it is stated on it: an agent
 * calling `aq.index.compare_methods` gets the divergence the Method Lab is plotting,
 * from the same function, because there is only one implementation. A product where
 * the chat interface and the chart can disagree has two sources of truth and therefore
 * none.
 *
 * The response streams in rather than appearing, which is cosmetic but not arbitrary -
 * an MCP tool result really does arrive incrementally, and a reader who has never seen
 * one should see the shape of that. Under prefers-reduced-motion it simply appears.
 */

type Mode = 'tools' | 'conversation'

interface CallState {
  readonly status: 'idle' | 'running' | 'done' | 'error'
  readonly request: string
  readonly response: string
  readonly shown: number
  readonly ms: number
  readonly error: string | null
  readonly highlights: { label: string; value: string }[]
}

const IDLE: CallState = {
  status: 'idle',
  request: '',
  response: '',
  shown: 0,
  ms: 0,
  error: null,
  highlights: [],
}

/**
 * The scripted conversation.
 *
 * Three turns that walk the demo's argument: the headline diverges from a naive
 * average, the carrier cut shows part of why, and the provenance tool resolves it to
 * a raw payload. Each turn is a real tool call, not a transcript.
 */
const SCRIPT: { question: string; tool: string; args: Record<string, unknown>; gloss: string }[] = [
  {
    question: 'How fast are Indian domestic airfares actually rising?',
    tool: 'aq.index.compare_methods',
    args: {},
    gloss:
      'The agent does not answer from memory. It calls the comparison tool, gets six formulae on one cube, and reports the gap between the naive average and the constant-quality index.',
  },
  {
    question: 'Which carriers is that sample made of?',
    tool: 'aq.carrier.breakdown',
    args: {},
    gloss:
      'Composition is the reason the two numbers differ, so the next call is the carrier cut - shares of observed quotes, and each carrier’s fare premium with the route network held fixed.',
  },
  {
    question: 'Show me a raw quote behind that, with its hash.',
    tool: 'aq.provenance.observation',
    args: { index: 1000 },
    gloss:
      'The chain ends at a single collected payload with its SHA-256, parser version and ingestion run - the same object the Lineage drawer opens from any number on the terminal.',
  },
]

export default function McpPlaygroundPage(): React.ReactElement {
  const filter = useFilter()
  const reduce = useReducedMotion()
  const [mode, setMode] = React.useState<Mode>('tools')
  const [selected, setSelected] = React.useState<ToolDef>(TOOLS[0]!)
  const [args, setArgs] = React.useState<Record<string, unknown>>(() => defaultArgs(TOOLS[0]!))
  const [call, setCall] = React.useState<CallState>(IDLE)
  const [turns, setTurns] = React.useState<{ index: number; state: CallState }[]>([])
  const callId = React.useRef(1)
  const timer = React.useRef<number | null>(null)

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearInterval(timer.current)
    },
    [],
  )

  const pick = (tool: ToolDef): void => {
    setSelected(tool)
    setArgs(defaultArgs(tool))
    setCall(IDLE)
  }

  /** Reveal a completed payload character-block by character-block. */
  const stream = React.useCallback(
    (text: string, onDone?: () => void): void => {
      if (reduce === true) {
        setCall((c) => ({ ...c, shown: text.length }))
        onDone?.()
        return
      }
      if (timer.current !== null) window.clearInterval(timer.current)
      const step = Math.max(12, Math.ceil(text.length / 90))
      timer.current = window.setInterval(() => {
        setCall((c) => {
          const next = Math.min(text.length, c.shown + step)
          if (next >= text.length && timer.current !== null) {
            window.clearInterval(timer.current)
            timer.current = null
            onDone?.()
          }
          return { ...c, shown: next }
        })
      }, 16)
    },
    [reduce],
  )

  const invoke = React.useCallback(
    async (tool: ToolDef, callArgs: Record<string, unknown>): Promise<CallState> => {
      const request = jsonRpcRequest(tool, callArgs, callId.current++)
      const started = performance.now()
      try {
        const payload = await tool.run(callArgs, filter)
        const body = JSON.stringify(
          { jsonrpc: '2.0', id: callId.current - 1, result: { content: payload } },
          null,
          2,
        )
        return {
          status: 'done',
          request,
          response: body,
          shown: 0,
          ms: performance.now() - started,
          error: null,
          highlights: tool.highlights(payload),
        }
      } catch (err) {
        return {
          status: 'error',
          request,
          response: '',
          shown: 0,
          ms: performance.now() - started,
          error: err instanceof Error ? err.message : String(err),
          highlights: [],
        }
      }
    },
    [filter],
  )

  const run = async (): Promise<void> => {
    setCall({ ...IDLE, status: 'running', request: jsonRpcRequest(selected, args, callId.current) })
    const result = await invoke(selected, args)
    setCall(result)
    if (result.status === 'done') stream(result.response)
  }

  const runScript = async (): Promise<void> => {
    setTurns([])
    for (let i = 0; i < SCRIPT.length; i++) {
      const step = SCRIPT[i]!
      const tool = TOOLS.find((t) => t.name === step.tool)!
      const result = await invoke(tool, { ...defaultArgs(tool), ...step.args })
      setTurns((prev) => [...prev, { index: i, state: { ...result, shown: result.response.length } }])
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <PageHeader
        kicker="Interfaces"
        title="MCP Playground"
        description="The sixteen tools an agent would call, answered by the same functions the charts call. There is one implementation of every statistic in this product, so a sentence and a chart cannot disagree about it."
        actions={
          <Segmented
            ariaLabel="Playground mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'tools', label: 'Tools' },
              { value: 'conversation', label: 'Conversation' },
            ]}
          />
        }
      />

      {mode === 'tools' ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-5">
          <Panel className="xl:col-span-2">
            <PanelHeader
              title="Tools"
              subtitle={`${TOOLS.length} advertised by the server`}
              info="Names, descriptions and argument schemas are what an MCP client receives from tools/list before deciding which one to call."
            />
            <div className="flex max-h-[24rem] flex-col gap-3 overflow-y-auto p-3 sm:p-4 xl:max-h-[46rem]">
              {TOOL_CATEGORIES.map((cat) => {
                const tools = TOOLS.filter((t) => t.category === cat.id)
                if (tools.length === 0) return null
                return (
                  <div key={cat.id}>
                    <p className="label-caps mb-1.5">{cat.label}</p>
                    <div className="flex flex-col gap-1">
                      {tools.map((t) => (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => pick(t)}
                          className={cn(
                            'tap rounded border px-2.5 py-1.5 text-left transition-colors',
                            selected.name === t.name
                              ? 'border-accent/50 bg-accent/10'
                              : 'border-transparent hover:bg-elevated',
                          )}
                        >
                          <span
                            className={cn(
                              'num block text-2xs',
                              selected.name === t.name ? 'text-accent' : 'text-ink',
                            )}
                          >
                            {t.name}
                          </span>
                          <span className="mt-0.5 block text-2xs text-faint">{t.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          <div className="flex flex-col gap-3 xl:col-span-3">
            <Panel>
              <PanelHeader
                title={selected.name}
                subtitle={selected.title}
                actions={
                  <Button variant="primary" onClick={() => void run()} disabled={call.status === 'running'}>
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    {call.status === 'running' ? 'Calling' : 'Call tool'}
                  </Button>
                }
              />
              <p className="px-3 pt-3 text-xs leading-relaxed text-muted sm:px-4">
                {selected.description}
              </p>

              <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
                {selected.params.length === 0 ? (
                  <p className="text-2xs text-faint">This tool takes no arguments.</p>
                ) : (
                  selected.params.map((p) => (
                    <div key={p.name}>
                      <label
                        htmlFor={`arg-${p.name}`}
                        className="label-caps mb-1 flex items-center gap-1.5"
                      >
                        {p.name}
                        {p.required ? <Badge tone="accent">required</Badge> : null}
                      </label>
                      {p.type === 'enum' ? (
                        <select
                          id={`arg-${p.name}`}
                          value={String(args[p.name] ?? '')}
                          onChange={(e) => setArgs((a) => ({ ...a, [p.name]: e.target.value }))}
                          className="tap h-8 w-full rounded border border-line bg-surface px-2 text-xs text-ink"
                        >
                          {!p.required ? <option value="">(unset)</option> : null}
                          {p.options?.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : p.type === 'boolean' ? (
                        <select
                          id={`arg-${p.name}`}
                          value={String(args[p.name] ?? false)}
                          onChange={(e) =>
                            setArgs((a) => ({ ...a, [p.name]: e.target.value === 'true' }))
                          }
                          className="tap h-8 w-full rounded border border-line bg-surface px-2 text-xs text-ink"
                        >
                          <option value="false">false</option>
                          <option value="true">true</option>
                        </select>
                      ) : (
                        <input
                          id={`arg-${p.name}`}
                          type={p.type === 'string' ? 'text' : 'number'}
                          value={String(args[p.name] ?? '')}
                          onChange={(e) =>
                            setArgs((a) => ({
                              ...a,
                              [p.name]:
                                p.type === 'string' ? e.target.value : Number(e.target.value),
                            }))
                          }
                          className="tap h-8 w-full rounded border border-line bg-surface px-2 text-xs text-ink"
                        />
                      )}
                      <p className="mt-1 text-2xs leading-relaxed text-faint">{p.description}</p>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel>
              <PanelHeader
                title="Wire format"
                subtitle="What the client sends and what the server returns"
                actions={
                  call.status === 'done' ? (
                    <Badge tone="positive">{call.ms.toFixed(0)}ms</Badge>
                  ) : null
                }
              />
              <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-2">
                <div>
                  <p className="label-caps mb-1.5">Request</p>
                  <pre className="num max-h-56 overflow-auto rounded border border-line bg-surface p-2.5 text-2xs leading-relaxed text-muted">
                    {call.request || jsonRpcRequest(selected, args, callId.current)}
                  </pre>
                </div>
                <div>
                  <p className="label-caps mb-1.5">Response</p>
                  {call.status === 'error' ? (
                    <ErrorState message={call.error ?? 'The tool call failed.'} />
                  ) : (
                    <pre className="num max-h-56 overflow-auto rounded border border-line bg-surface p-2.5 text-2xs leading-relaxed text-muted">
                      {call.status === 'idle'
                        ? '// press Call tool'
                        : call.response.slice(0, call.shown)}
                      {call.status === 'running' || call.shown < call.response.length ? (
                        <span className="text-accent">█</span>
                      ) : null}
                    </pre>
                  )}
                </div>
              </div>

              {call.highlights.length > 0 ? (
                <div className="flex flex-wrap gap-4 border-t border-line p-3 sm:p-4">
                  {call.highlights.map((h) => (
                    <Readout key={h.label} label={h.label} value={h.value} />
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>
        </div>
      ) : (
        <Panel>
          <PanelHeader
            title="A three-turn conversation"
            subtitle="Each turn is a live tool call, not a transcript"
            info="Run it and the answers are computed now, from the window currently selected in the range bar. Change the range and run it again to see the numbers move."
            actions={
              <Button variant="primary" onClick={() => void runScript()}>
                <Terminal className="h-3.5 w-3.5" aria-hidden />
                Run the conversation
              </Button>
            }
          />
          <div className="flex flex-col gap-3 p-3 sm:p-4">
            {turns.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted">
                Three questions an analyst would actually ask, each resolved by a tool
                call into the same engine the screens use. Press the button.
              </p>
            ) : null}
            {turns.map(({ index, state }) => {
              const step = SCRIPT[index]!
              return (
                <FadeIn key={index} delay={index * 0.08}>
                  <div className="rounded border border-line bg-elevated/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="accent">turn {index + 1}</Badge>
                      <p className="text-xs font-medium text-ink">{step.question}</p>
                    </div>
                    <p className="mt-1.5 text-2xs leading-relaxed text-faint">{step.gloss}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="num rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-accent">
                        {step.tool}
                      </span>
                      <span className="text-2xs text-faint">{state.ms.toFixed(0)}ms</span>
                    </div>
                    {state.status === 'error' ? (
                      <p className="mt-2 text-2xs text-neg">{state.error}</p>
                    ) : (
                      <div className="mt-2.5 flex flex-wrap gap-4">
                        {state.highlights.map((h) => (
                          <Readout key={h.label} label={h.label} value={h.value} />
                        ))}
                      </div>
                    )}
                  </div>
                </FadeIn>
              )
            })}
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader title="Why this is not a separate service" />
        <div className="grid gap-3 p-3 text-xs leading-relaxed text-muted sm:grid-cols-3 sm:p-4">
          <p>
            <span className="text-ink">One implementation.</span>{' '}
            <span className="num">aq.index.get</span> calls the same worker function the
            Index Terminal calls. There is no parallel code path to drift, so an agent
            quoting a figure and a screen plotting it are quoting the same computation
            by construction rather than by discipline.
          </p>
          <p>
            <span className="text-ink">The schemas are the contract.</span> An agent
            chooses a tool from the description and argument schema alone. Those are
            written to be chosen correctly &mdash; which is why several of them carry the
            caveat in the description rather than only in the result.
          </p>
          <p>
            <span className="text-ink">The caveats travel with the answer.</span>{' '}
            <span className="num">aq.attribution.decompose</span> returns its
            identification warning inside the payload, and{' '}
            <span className="num">aq.route.forecast</span> returns the statement that its
            coverage property holds only for the generated series. A caveat that lives
            only in the user interface does not reach an agent at all.
          </p>
        </div>
      </Panel>
    </div>
  )
}
