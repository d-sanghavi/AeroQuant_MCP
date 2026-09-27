import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The primitive layer.
 *
 * Small, unstyled-by-default building blocks in the shadcn spirit. Two rules run
 * through all of them and both come from the brief:
 *
 *  - Touch targets clear 44px on coarse pointers, enforced by the `tap` utility
 *    rather than by hoping the padding is enough.
 *  - Numbers are monospaced with tabular figures, so an animated value does not
 *    reflow the layout under it.
 */

// --- Panel -----------------------------------------------------------------

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <section className={cn('panel flex min-w-0 flex-col', className)} {...props}>
      {children}
    </section>
  )
}

export function PanelHeader({
  title,
  subtitle,
  actions,
  info,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  info?: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <header className={cn('panel-header', className)}>
      <div className="min-w-0 max-w-full">
        <div className="flex items-center gap-1.5">
          <h2 className="truncate text-[0.8125rem] font-semibold tracking-tight text-ink">
            {title}
          </h2>
          {info ? <InfoTip>{info}</InfoTip> : null}
        </div>
        {subtitle ? (
          <p className="mt-0.5 truncate text-2xs text-faint">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">{actions}</div>
      ) : null}
    </header>
  )
}

// --- Tooltip ---------------------------------------------------------------

export function TooltipProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      {children}
    </TooltipPrimitive.Provider>
  )
}

export function Tip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}): React.ReactElement {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 max-w-[min(20rem,calc(100vw-2rem))] rounded-md border border-line bg-elevated px-2.5 py-2 text-xs leading-relaxed text-ink shadow-pop"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[rgb(var(--aq-elevated))]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export function InfoTip({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Tip content={children}>
      <button
        type="button"
        aria-label="More information"
        className="tap inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-accent focus-visible:text-accent"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
    </Tip>
  )
}

// --- Buttons ---------------------------------------------------------------

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  default:
    'border border-line bg-elevated text-ink hover:border-line-strong hover:bg-surface',
  primary:
    'border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 hover:border-accent/60',
  ghost: 'border border-transparent text-muted hover:bg-elevated hover:text-ink',
  danger: 'border border-neg/40 bg-neg/10 text-neg hover:bg-neg/20',
}

export const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant
    size?: 'sm' | 'md'
  }
>(function Button({ className, variant = 'default', size = 'md', ...props }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'tap inline-flex items-center justify-center gap-1.5 rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2 text-2xs' : 'h-8 px-3 text-xs',
        BUTTON_STYLES[variant],
        className,
      )}
      {...props}
    />
  )
})

// --- Segmented control -----------------------------------------------------

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode; title?: string }[]
  size?: 'sm' | 'md'
  className?: string
  ariaLabel: string
}): React.ReactElement {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(v) => {
        if (v) onChange(v as T)
      }}
      className={cn(
        'inline-flex max-w-full overflow-x-auto rounded border border-line bg-surface p-0.5 no-scrollbar',
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroupPrimitive.Item
          key={o.value}
          value={o.value}
          title={o.title}
          className={cn(
            'tap whitespace-nowrap rounded-sm px-2.5 font-medium transition-colors',
            size === 'sm' ? 'h-6 text-2xs' : 'h-7 text-xs',
            'text-muted hover:text-ink data-[state=on]:bg-elevated data-[state=on]:text-accent',
          )}
        >
          {o.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  )
}

// --- Switch ----------------------------------------------------------------

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  id?: string
}): React.ReactElement {
  const generated = React.useId()
  const switchId = id ?? generated
  return (
    <div className="flex items-start gap-2.5">
      <SwitchPrimitive.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onChange}
        className={cn(
          'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent/60 bg-accent/35' : 'border-line bg-elevated',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block h-3 w-3 rounded-full transition-transform',
            checked ? 'translate-x-[15px] bg-accent' : 'translate-x-[2px] bg-faint',
          )}
        />
      </SwitchPrimitive.Root>
      <label htmlFor={switchId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-xs font-medium text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-2xs leading-relaxed text-faint">{description}</span>
        ) : null}
      </label>
    </div>
  )
}

// --- Badge -----------------------------------------------------------------

type BadgeTone = 'neutral' | 'accent' | 'positive' | 'warning' | 'negative'

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'border-line bg-elevated text-muted',
  accent: 'border-accent/35 bg-accent/10 text-accent',
  positive: 'border-pos/35 bg-pos/10 text-pos',
  warning: 'border-warn/35 bg-warn/10 text-warn',
  negative: 'border-neg/35 bg-neg/10 text-neg',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-2xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

// --- Loading ---------------------------------------------------------------

export function Skeleton({ className }: { className?: string }): React.ReactElement {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function ChartSkeleton({ height = 260 }: { height?: number }): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 p-3 sm:p-4" style={{ height }}>
      <Skeleton className="h-3 w-28" />
      <Skeleton className="flex-1" />
    </div>
  )
}

export function ProgressBar({
  value,
  className,
}: {
  value: number
  className?: string
}): React.ReactElement {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-elevated', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// --- Empty and error states ------------------------------------------------

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string
  detail?: React.ReactNode
  action?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-xs font-medium text-ink">{title}</p>
      {detail ? <p className="max-w-sm text-2xs leading-relaxed text-faint">{detail}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 p-8 text-center">
      <Badge tone="negative">Could not compute</Badge>
      <p className="max-w-md text-2xs leading-relaxed text-muted">{message}</p>
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

// --- Layout helpers --------------------------------------------------------

export function PageHeader({
  title,
  kicker,
  description,
  actions,
}: {
  title: string
  kicker?: string
  description?: React.ReactNode
  actions?: React.ReactNode
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker ? <p className="label-caps mb-1">{kicker}</p> : null}
        <h1 className="text-lg font-semibold tracking-tight text-ink sm:text-xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** Responsive tile grid: 2-up on phones, 4-up from the laptop band. */
export function TileGrid({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  )
}
