import type { Config } from 'tailwindcss'

/**
 * AeroQuant design tokens (PROTOTYPE_SPEC section 6).
 *
 * Dark-first research terminal. Colours are declared as CSS custom properties in
 * styles/globals.css so the light theme is a class swap rather than a second palette
 * defined here. Everything below reads those variables.
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // 8px base grid, plus the half-steps a dense terminal actually needs.
    screens: {
      xs: '400px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
      '3xl': '1680px',
    },
    extend: {
      colors: {
        bg: 'rgb(var(--aq-bg) / <alpha-value>)',
        surface: 'rgb(var(--aq-surface) / <alpha-value>)',
        elevated: 'rgb(var(--aq-elevated) / <alpha-value>)',
        line: 'rgb(var(--aq-border) / <alpha-value>)',
        'line-strong': 'rgb(var(--aq-border-strong) / <alpha-value>)',
        ink: 'rgb(var(--aq-text) / <alpha-value>)',
        muted: 'rgb(var(--aq-muted) / <alpha-value>)',
        faint: 'rgb(var(--aq-faint) / <alpha-value>)',
        accent: 'rgb(var(--aq-accent) / <alpha-value>)',
        warn: 'rgb(var(--aq-warning) / <alpha-value>)',
        neg: 'rgb(var(--aq-negative) / <alpha-value>)',
        pos: 'rgb(var(--aq-positive) / <alpha-value>)',
        // Fixed chart ramp - identical in both themes so screenshots stay comparable.
        series: {
          1: '#4ECDB4',
          2: '#7AA5E8',
          3: '#E0A45E',
          4: '#C98BD9',
          5: '#9AA4B2',
          6: '#E06A5E',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.05rem' }],
        sm: ['0.8125rem', { lineHeight: '1.15rem' }],
      },
      spacing: {
        0.5: '0.125rem',
        1.5: '0.375rem',
        4.5: '1.125rem',
        13: '3.25rem',
        18: '4.5rem',
        88: '22rem',
      },
      maxWidth: {
        content: '1680px',
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '5px',
        md: '6px',
        lg: '9px',
      },
      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.35)',
        pop: '0 12px 32px -8px rgb(0 0 0 / 0.55), 0 0 0 1px rgb(var(--aq-border) / 1)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 240ms cubic-bezier(0, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
