import * as React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './layout/AppShell'
import { BootScreen, LANDING_DWELL_MS } from './BootScreen'
import { useApp } from '@/data/store'
import { ChartSkeleton, ErrorState } from '@/components/ui/primitives'

const IndexTerminal = React.lazy(() => import('@/features/index-terminal/IndexTerminalPage'))
const MethodLab = React.lazy(() => import('@/features/method-lab/MethodLabPage'))
const TermStructure = React.lazy(() => import('@/features/term-structure/TermStructurePage'))
const RouteExplorer = React.lazy(() => import('@/features/route-explorer/RouteExplorerPage'))
const Carriers = React.lazy(() => import('@/features/carriers/CarriersPage'))
const OlapWorkbench = React.lazy(() => import('@/features/olap-workbench/OlapWorkbenchPage'))
const Attribution = React.lazy(() => import('@/features/attribution/AttributionPage'))
const Anomalies = React.lazy(() => import('@/features/anomalies/AnomaliesPage'))
const Portfolio = React.lazy(() => import('@/features/portfolio/PortfolioPage'))
const Budget = React.lazy(() => import('@/features/cfo/BudgetPage'))
const Compliance = React.lazy(() => import('@/features/compliance/CompliancePage'))
const Methodology = React.lazy(() => import('@/features/methodology/MethodologyPage'))
const Assistant = React.lazy(() => import('@/features/research-assistant/AssistantPage'))
const McpPlayground = React.lazy(() => import('@/features/mcp-playground/McpPlaygroundPage'))

function Suspended({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <React.Suspense
      fallback={
        <div className="panel">
          <ChartSkeleton height={320} />
        </div>
      }
    >
      <ErrorBoundary>{children}</ErrorBoundary>
    </React.Suspense>
  )
}

/**
 * A screen that throws should not take the terminal down with it. Each route is
 * wrapped, so a failure in the portfolio optimiser leaves the index still readable.
 */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="panel">
          <ErrorState
            message={this.state.error.message}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      )
    }
    return this.props.children
  }
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Suspended><IndexTerminal /></Suspended> },
      { path: 'methods', element: <Suspended><MethodLab /></Suspended> },
      { path: 'term-structure', element: <Suspended><TermStructure /></Suspended> },
      { path: 'routes', element: <Suspended><RouteExplorer /></Suspended> },
      { path: 'carriers', element: <Suspended><Carriers /></Suspended> },
      { path: 'workbench', element: <Suspended><OlapWorkbench /></Suspended> },
      { path: 'attribution', element: <Suspended><Attribution /></Suspended> },
      { path: 'anomalies', element: <Suspended><Anomalies /></Suspended> },
      { path: 'portfolio', element: <Suspended><Portfolio /></Suspended> },
      { path: 'budget', element: <Suspended><Budget /></Suspended> },
      { path: 'compliance', element: <Suspended><Compliance /></Suspended> },
      { path: 'methodology', element: <Suspended><Methodology /></Suspended> },
      { path: 'assistant', element: <Suspended><Assistant /></Suspended> },
      { path: 'mcp', element: <Suspended><McpPlayground /></Suspended> },
      {
        path: '*',
        element: (
          <div className="panel">
            <ErrorState message="That screen does not exist." />
          </div>
        ),
      },
    ],
  },
])

export function AppRouter(): React.ReactElement {
  const status = useApp((s) => s.status)
  const generate = useApp((s) => s.generate)
  // Generation takes about a second. The landing screen is held for longer than that
  // deliberately, so the provenance statement on it is read rather than flashed; the
  // terminal opens when both the data and the dwell are done.
  const [dwellDone, setDwellDone] = React.useState(false)

  React.useEffect(() => {
    void generate()
    const timer = window.setTimeout(() => setDwellDone(true), LANDING_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [generate])

  if (status !== 'ready' || !dwellDone) return <BootScreen />
  return <RouterProvider router={router} />
}
