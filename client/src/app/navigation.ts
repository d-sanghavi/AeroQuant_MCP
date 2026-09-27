import {
  Activity,
  AlertTriangle,
  BookOpen,
  Boxes,
  FlaskConical,
  Gauge,
  LineChart,
  Map,
  Plane,
  MessageSquareText,
  PieChart,
  ShieldCheck,
  Terminal,
  Wallet,
  Waves,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  readonly to: string
  readonly label: string
  /** Short form for the phone bottom bar, where 10 characters is the budget. */
  readonly short: string
  readonly icon: LucideIcon
  readonly description: string
  /** Shown in the phone quick-nav. Five destinations, chosen by demo frequency. */
  readonly primary?: boolean
}

export interface NavGroup {
  readonly label: string
  readonly items: readonly NavItem[]
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Index',
    items: [
      {
        to: '/',
        label: 'Index Terminal',
        short: 'Index',
        icon: Activity,
        description: 'The published APIx series, its interval and what moved it',
        primary: true,
      },
      {
        to: '/methods',
        label: 'Method Lab',
        short: 'Methods',
        icon: FlaskConical,
        description: 'Six index formulae on identical data, and why they disagree',
        primary: true,
      },
      {
        to: '/term-structure',
        label: 'Term Structure',
        short: 'Curve',
        icon: Waves,
        description: 'Fare against days to departure: level, slope and curvature',
      },
    ],
  },
  {
    label: 'Explore',
    items: [
      {
        to: '/routes',
        label: 'Route Explorer',
        short: 'Routes',
        icon: Map,
        description: 'Per-route index, distribution, capacity and forecast',
        primary: true,
      },
      {
        to: '/carriers',
        label: 'Carrier Breakdown',
        short: 'Airlines',
        icon: Plane,
        description: 'IndiGo, Air India, Air India Express, Akasa, SpiceJet and Alliance',
        primary: true,
      },
      {
        to: '/workbench',
        label: 'OLAP Workbench',
        short: 'Pivot',
        icon: Boxes,
        description: 'Cross-tabulate the panel on any dimension',
      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      {
        to: '/attribution',
        label: 'Attribution Studio',
        short: 'Drivers',
        icon: LineChart,
        description: 'What is associated with the movement, stated as association',
      },
      {
        to: '/anomalies',
        label: 'Anomaly Console',
        short: 'Alerts',
        icon: AlertTriangle,
        description: 'Flagged movements, with multiplicity correction',
      },
      {
        to: '/portfolio',
        label: 'Portfolio Analytics',
        short: 'Risk',
        icon: PieChart,
        description: 'Routes as correlated assets: factors, frontier, tail risk',
      },
      {
        to: '/budget',
        label: 'Travel Budget',
        short: 'Budget',
        icon: Wallet,
        description: 'Monte Carlo on a planned travel programme',
      },
    ],
  },
  {
    label: 'Governance',
    items: [
      {
        to: '/compliance',
        label: 'Source Registry',
        short: 'Sources',
        icon: ShieldCheck,
        description: 'Every source, its robots and ToS verdict, and the kill switch',
        primary: true,
      },
      {
        to: '/methodology',
        label: 'Methodology',
        short: 'Method',
        icon: BookOpen,
        description: 'How every number on this terminal is produced',
      },
    ],
  },
  {
    label: 'Interfaces',
    items: [
      {
        to: '/assistant',
        label: 'Research Assistant',
        short: 'Ask',
        icon: MessageSquareText,
        description: 'Retrieval over the regulatory corpus, with as-of dating',
      },
      {
        to: '/mcp',
        label: 'MCP Playground',
        short: 'MCP',
        icon: Terminal,
        description: 'The 16 tools an agent would call, answered by the same engine',
      },
    ],
  },
]

export const ALL_NAV: readonly NavItem[] = NAV_GROUPS.flatMap((g) => g.items)

export const PRIMARY_NAV: readonly NavItem[] = ALL_NAV.filter((i) => i.primary)

export { Gauge }
