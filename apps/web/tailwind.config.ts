import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ─── Core surfaces (darkest → lightest) ──────────────
        terminal: {
          bg: '#080c16',        // page background
          card: '#0f1629',      // card / sidebar / header
          surface: '#141b2d',   // elevated surface inside cards
          'surface-2': '#1a2236', // double-nested surface (inputs, stat boxes)
          border: '#1c2840',    // primary border
          'border-light': '#283650', // lighter border (hover, focus rings)
        },

        // ─── Primary action blue ─────────────────────────────
        primary: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          subtle: '#172554',    // very dark blue tint for backgrounds
          muted: '#1e40af',
        },

        // ─── Text hierarchy ──────────────────────────────────
        text: {
          primary: '#e8edf5',   // headings, values
          secondary: '#8b9dc3', // body text, labels
          muted: '#5a6b87',     // hints, timestamps
          inverse: '#080c16',
        },

        // ─── Semantic status ─────────────────────────────────
        status: {
          green: '#34d399',
          'green-subtle': '#052e16',
          red: '#f87171',
          'red-subtle': '#450a0a',
          yellow: '#fbbf24',
          'yellow-subtle': '#451a03',
          blue: '#60a5fa',
          'blue-subtle': '#172554',
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
          '0 0 0 1px rgba(28, 40, 64, 0.6), 0 4px 24px rgba(0, 0, 0, 0.35)',
        'terminal-lg':
          '0 0 0 1px rgba(28, 40, 64, 0.6), 0 8px 40px rgba(0, 0, 0, 0.5)',
        'glow-blue': '0 0 24px rgba(59, 130, 246, 0.12)',
        'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.03)',
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
      },
    },
  },
  plugins: [],
};

export default config;
