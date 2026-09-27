import * as React from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Menu, Moon, Search, Sun, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp } from '@/data/store'
import { NAV_GROUPS, PRIMARY_NAV } from '../navigation'
import { RangeBar } from './RangeBar'
import { CommandPalette } from './CommandPalette'
import { LineageDrawer } from '@/features/lineage/LineageDrawer'
import { Badge } from '@/components/ui/primitives'

/**
 * The application shell.
 *
 * The responsive contract from PROTOTYPE_SPEC section 6 is implemented here, once, so
 * no individual screen has to think about it:
 *
 *   phone   (<1024) : sidebar becomes a slide-over sheet; a five-destination bottom
 *                     bar covers the demo path; content is single column
 *   laptop  (>=1024): permanent sidebar
 *   display (>=1680): content capped so line lengths stay readable
 *
 * The bottom bar exists because a hamburger alone is a bad phone experience for a
 * tool someone is navigating repeatedly - the five screens a demo actually visits
 * should be one thumb-reach away.
 */

function NavItems({ onNavigate }: { onNavigate?: () => void }): React.ReactElement {
  return (
    <nav className="flex flex-col gap-5 px-2 py-3" aria-label="Sections">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="label-caps px-2 pb-1.5">{group.label}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={onNavigate}
                  title={item.description}
                  className={({ isActive }) =>
                    cn(
                      'tap group flex items-center gap-2.5 rounded px-2 py-1.5 text-xs transition-colors',
                      isActive
                        ? 'bg-elevated text-accent'
                        : 'text-muted hover:bg-elevated/60 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-faint')}
                        aria-hidden
                      />
                      <span className="truncate font-medium">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Wordmark({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded bg-accent/15 text-[0.7rem] font-bold text-accent"
        aria-hidden
      >
        AQ
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink">
          AeroQuant
        </p>
        {!compact ? (
          <p className="truncate text-[0.625rem] text-faint">Airfare price index terminal</p>
        ) : null}
      </div>
    </div>
  )
}

export function AppShell(): React.ReactElement {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const location = useLocation()
  const reduce = useReducedMotion()
  const summary = useApp((s) => s.summary)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const disableScraped = useApp((s) => s.disableScraped)

  React.useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex min-h-full flex-col bg-bg">
      {/* --- top bar ------------------------------------------------------ */}
      <header className="safe-t sticky top-0 z-30 border-b border-line bg-bg/92 backdrop-blur-sm">
        <div className="flex h-13 items-center gap-2 px-3 sm:px-4">
          <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open navigation"
                className="tap -ml-1 grid h-9 w-9 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-ink lg:hidden"
              >
                <Menu className="h-4.5 w-4.5" aria-hidden />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-[fade-up_120ms_ease-out] lg:hidden" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(19rem,86vw)] flex-col border-r border-line bg-surface shadow-pop lg:hidden">
                <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Sections of the AeroQuant Terminal
                </Dialog.Description>
                <div className="flex h-13 shrink-0 items-center justify-between border-b border-line px-3">
                  <Wordmark />
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close navigation"
                      className="tap grid h-9 w-9 place-items-center rounded text-muted hover:bg-elevated hover:text-ink"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <NavItems onNavigate={() => setMenuOpen(false)} />
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="lg:w-[13.5rem] lg:shrink-0">
            <Wordmark compact />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {disableScraped ? (
              <Badge tone="warning" className="hidden sm:inline-flex">
                Scraped sources disabled
              </Badge>
            ) : null}
            {summary ? (
              <span className="num hidden text-2xs text-faint xl:inline">
                seed {summary.seed} &middot; {summary.nObservations.toLocaleString('en-IN')} obs
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search and commands"
              className="tap flex h-8 items-center gap-2 rounded border border-line bg-surface px-2.5 text-2xs text-faint transition-colors hover:border-line-strong hover:text-muted"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-line px-1 py-px text-[0.5625rem] md:inline">
                Ctrl K
              </kbd>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="tap grid h-8 w-8 place-items-center rounded border border-line bg-surface text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Moon className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
          </div>
        </div>
        <RangeBar />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* --- permanent sidebar, laptop and up -------------------------- */}
        <aside className="sticky top-[6.25rem] hidden h-[calc(100vh-6.25rem)] w-[13.5rem] shrink-0 overflow-y-auto border-r border-line lg:block">
          <NavItems />
        </aside>

        {/* --- content --------------------------------------------------- */}
        <main
          id="main"
          className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-4 sm:pb-8 lg:px-6 lg:pt-5"
        >
          <div className="mx-auto w-full max-w-content">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                transition={{ duration: reduce ? 0.12 : 0.24, ease: [0, 0, 0.2, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* --- phone quick-nav ---------------------------------------------- */}
      <nav
        aria-label="Primary"
        className="safe-b fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur-sm lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'tap flex h-14 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium transition-colors',
                    isActive ? 'text-accent' : 'text-faint hover:text-muted',
                  )
                }
              >
                <item.icon className="h-4 w-4" aria-hidden />
                <span>{item.short}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <LineageDrawer />
    </div>
  )
}
