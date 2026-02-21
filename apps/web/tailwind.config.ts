import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Core surfaces (darkest → lightest) ──────────────
        terminal: {
          bg: 'var(--terminal-bg)',
          card: 'var(--terminal-card)',
          surface: 'var(--terminal-surface)',
          'surface-2': 'var(--terminal-surface-2)',
          border: 'var(--terminal-border)',
          'border-light': 'var(--terminal-border-light)',
        },

        // ─── Primary action blue ─────────────────────────────
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          subtle: 'var(--primary-subtle)',
          muted: 'var(--primary-muted)',
        },

        // ─── Text hierarchy ──────────────────────────────────
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
        },

        // ─── Semantic status ─────────────────────────────────
        status: {
          green: '#34d399',
          'green-subtle': 'var(--status-green-subtle)',
          red: '#f87171',
          'red-subtle': 'var(--status-red-subtle)',
          yellow: '#fbbf24',
          'yellow-subtle': 'var(--status-yellow-subtle)',
          blue: '#60a5fa',
          'blue-subtle': 'var(--status-blue-subtle)',
        },

        // ─── Accent ──────────────────────────────────────────
        accent: {
          cyan: '#22d3ee',
          purple: '#c084fc',
          orange: '#fb923c',
        },
      },

      fontFamily: {
        sans: [
          'Inter',
          'SF Pro Display',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        xxs: ['0.625rem', { lineHeight: '0.875rem' }],
      },

      borderRadius: {
        terminal: '0.75rem',
      },

      boxShadow: {
        terminal:
          '0 0 0 1px var(--shadow-color), 0 4px 24px var(--shadow-drop)',
        'terminal-lg':
          '0 0 0 1px var(--shadow-color), 0 8px 40px var(--shadow-drop-lg)',
        'glow-blue': '0 0 24px rgba(59, 130, 246, 0.12)',
        'inner-light': 'inset 0 1px 0 0 var(--shadow-inner)',
      },

      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
