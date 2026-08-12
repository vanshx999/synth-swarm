import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#05060a',
        abyss: '#0a0d16',
        panel: '#0d1220',
        edge: '#1a2340',
        neon: {
          cyan: '#22d3ee',
          violet: '#a78bfa',
          green: '#34d399',
          amber: '#fbbf24',
          pink: '#f472b6',
          red: '#f87171',
        },
      },
      fontFamily: {
        tech: ['var(--font-space-grotesk)', 'ui-monospace', 'monospace'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(34, 211, 238, 0.25), 0 0 60px rgba(34, 211, 238, 0.1)',
        'neon-violet': '0 0 20px rgba(167, 139, 250, 0.25), 0 0 60px rgba(167, 139, 250, 0.1)',
        'neon-green': '0 0 20px rgba(52, 211, 153, 0.2), 0 0 60px rgba(52, 211, 153, 0.08)',
        'card-glow': '0 8px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.03)',
        'card-glow-hover':
          '0 8px 50px rgba(34, 211, 238, 0.15), 0 0 0 1px rgba(34, 211, 238, 0.4)',
      },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)' },
          '33%': { transform: 'translate3d(4%, -3%, 0) rotate(3deg) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%, 3%, 0) rotate(-3deg) scale(0.95)' },
        },
        'orb-float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-16px)' },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        'grid-pan': {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 48px' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'aurora-drift': 'aurora-drift 18s ease-in-out infinite',
        'orb-float': 'orb-float 6s ease-in-out infinite',
        'scanline': 'scanline 4s linear infinite',
        'grid-pan': 'grid-pan 2.4s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spin-slow': 'spin-slow 12s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;