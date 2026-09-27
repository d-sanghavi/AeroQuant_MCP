import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'
import { AppRouter } from './app/router'
import { TooltipProvider } from './components/ui/primitives'
import { bootstrapTheme, useApp } from './data/store'

bootstrapTheme()

// Keep the motion preference live: a viewer can change it mid-session, and the charts
// read it on every render.
if (typeof matchMedia === 'function') {
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', (e) => useApp.getState().setReducedMotion(e.matches))
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element is missing from index.html')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <TooltipProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:border focus:border-accent focus:bg-surface focus:px-3 focus:py-2 focus:text-xs focus:text-ink"
      >
        Skip to content
      </a>
      <AppRouter />
    </TooltipProvider>
  </React.StrictMode>,
)
