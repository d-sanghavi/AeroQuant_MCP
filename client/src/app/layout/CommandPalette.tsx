import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Search } from 'lucide-react'
import { ALL_NAV } from '../navigation'
import { ROUTES } from '@/data/master/routes'
import { useApp } from '@/data/store'
import { cn } from '@/lib/utils'

interface Command {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly group: string
  readonly run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.ReactElement {
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [active, setActive] = React.useState(0)
  const setSelectedRoutes = useApp((s) => s.setSelectedRoutes)
  const setDisableScraped = useApp((s) => s.setDisableScraped)
  const disableScraped = useApp((s) => s.disableScraped)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const resetRange = useApp((s) => s.resetRange)

  const commands: Command[] = React.useMemo(() => {
    const nav: Command[] = ALL_NAV.map((item) => ({
      id: `nav:${item.to}`,
      label: item.label,
      hint: item.description,
      group: 'Go to',
      run: () => navigate(item.to),
    }))

    const routes: Command[] = ROUTES.map((r) => ({
      id: `route:${r.id}`,
      label: `${r.origin} → ${r.destination}`,
      hint: `${r.originAirport.city} to ${r.destinationAirport.city} · ${r.distanceKm} km`,
      group: 'Routes',
      run: () => {
        setSelectedRoutes([r.id])
        navigate(`/routes?route=${r.id}`)
      },
    }))

    const actions: Command[] = [
      {
        id: 'action:scraped',
        label: disableScraped ? 'Re-enable scraped sources' : 'Disable all scraped sources',
        hint: 'Recompute the index using only licensed API and public sources',
        group: 'Actions',
        run: () => {
          setDisableScraped(!disableScraped)
          navigate('/compliance')
        },
      },
      {
        id: 'action:theme',
        label: 'Toggle light / dark theme',
        hint: 'The terminal is designed dark first',
        group: 'Actions',
        run: toggleTheme,
      },
      {
        id: 'action:reset',
        label: 'Reset the period window',
        hint: 'Back to the full 24 months',
        group: 'Actions',
        run: resetRange,
      },
    ]

    return [...nav, ...actions, ...routes]
  }, [navigate, setSelectedRoutes, setDisableScraped, disableScraped, toggleTheme, resetRange])

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 12)
    const scored = commands
      .map((c) => {
        const label = c.label.toLowerCase()
        const hint = c.hint.toLowerCase()
        let score = -1
        if (label.startsWith(q)) score = 0
        else if (label.includes(q)) score = 1
        else if (hint.includes(q)) score = 2
        return { c, score }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
    return scored.slice(0, 20).map((x) => x.c)
  }, [query, commands])

  React.useEffect(() => {
    setActive(0)
  }, [query])

  React.useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const runAt = (i: number): void => {
    const c = results[i]
    if (!c) return
    onOpenChange(false)
    c.run()
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-x-3 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-lg border border-line-strong bg-surface shadow-pop sm:inset-x-6"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              runAt(active)
            }
          }}
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Dialog.Description className="sr-only">
            Jump to a screen, select a route, or run an action
          </Dialog.Description>

          <div className="flex items-center gap-2.5 border-b border-line px-3.5">
            <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a screen, a route, or an action"
              aria-label="Search"
              className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
            />
          </div>

          <ul className="max-h-[52vh] overflow-y-auto py-1.5" role="listbox">
            {results.length === 0 ? (
              <li className="px-3.5 py-6 text-center text-xs text-faint">No matches</li>
            ) : (
              results.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => runAt(i)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors',
                      i === active ? 'bg-elevated' : 'hover:bg-elevated/60',
                    )}
                  >
                    <span className="w-16 shrink-0 text-2xs uppercase tracking-wide text-faint">
                      {c.group}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink">
                        {c.label}
                      </span>
                      <span className="block truncate text-2xs text-faint">{c.hint}</span>
                    </span>
                    {i === active ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
