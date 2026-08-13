import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        brand: {
          primary: 'var(--brand-primary)',
          deep: 'var(--brand-deep)',
          support: 'var(--brand-support)',
          highlight: 'var(--brand-highlight)',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
        },
        'brand-grad': 'linear-gradient(135deg, var(--brand-primary), var(--brand-highlight), var(--brand-deep))',
      },
      fontFamily: {
        tech: ['var(--font-space-grotesk)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 3px rgba(11,15,25,0.06), 0 8px 24px rgba(11,15,25,0.06)',
        lift: '0 4px 12px rgba(11,15,25,0.08), 0 16px 40px rgba(11,15,25,0.12)',
        'brand-glow':
          '0 0 24px rgba(84,186,185,0.35), 0 0 60px rgba(13,115,119,0.25)',
        'card-hover':
          '0 6px 16px rgba(84,186,185,0.16), 0 16px 48px rgba(41,37,34,0.14), 0 0 0 1px rgba(84,186,185,0.35)',
      },
      keyframes: {
        'float-y': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-14px)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(84,186,185,0.45)' },
          '100%': { boxShadow: '0 0 0 20px rgba(84,186,185,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'float-y': 'float-y 6s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 6s ease infinite',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
