import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Base
        'base':     '#0A0B0D',
        'surface':  '#111318',
        'elevated': '#181C24',
        'border':   '#1E2330',
        'border-hover': '#2D3548',

        // Text
        'text-primary':   '#E8EAF0',
        'text-secondary': '#7A8499',
        'text-muted':     '#3D4659',

        // Accent ambre
        'accent':      '#F59B23',
        'accent-soft': 'rgba(245, 155, 35, 0.08)',
        'accent-hover':'#F5AB3F',

        // Statuts
        'status-draft':     '#7A8499',
        'status-published': '#22C55E',
        'status-review':    '#F59E0B',
        'status-archived':  '#3D4659',

        // Sévérité alertes
        'sev-low':      '#3B82F6',
        'sev-medium':   '#F59E0B',
        'sev-high':     '#EF4444',
        'sev-critical': '#DC2626',

        // Phases onboarding
        'phase-day1':   '#818CF8',
        'phase-week1':  '#34D399',
        'phase-month1': '#F59B23',
      },
      fontFamily: {
        'display': ['Instrument Serif', 'serif'],
        'mono':    ['JetBrains Mono', 'monospace'],
        'sans':    ['Geist', 'sans-serif'],
      },
      backgroundImage: {
        'node-grid': `
          linear-gradient(rgba(30,35,48,0.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(30,35,48,0.4) 1px, transparent 1px)
        `,
        'gradient-radial-accent': 'radial-gradient(circle at 50% 0%, rgba(245,155,35,0.08) 0%, transparent 60%)',
      },
      backgroundSize: {
        'grid': '24px 24px',
      },
      boxShadow: {
        'node':       '0 0 0 1px rgba(30,35,48,1), 0 4px 24px rgba(0,0,0,0.4)',
        'node-hover': '0 0 0 1px rgba(245,155,35,0.3), 0 4px 32px rgba(245,155,35,0.08)',
        'node-active':'0 0 0 2px rgba(245,155,35,0.6), 0 8px 40px rgba(245,155,35,0.15)',
        'glow-accent':'0 0 20px rgba(245,155,35,0.4)',
      },
      animation: {
        'pulse-dot':    'pulse-dot 2s ease-in-out infinite',
        'slide-in-up':  'slide-in-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in':      'fade-in 0.2s ease-out',
        'connect-line': 'connect-line 0.4s ease-out forwards',
        'number-tick':  'number-tick 0.3s ease-out',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':      { opacity: '0.5', transform: 'scale(0.8)' },
        },
        'slide-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'connect-line': {
          from: { 'stroke-dashoffset': '100' },
          to:   { 'stroke-dashoffset': '0' },
        },
      },
    },
  },
  plugins: [],
}
export default config