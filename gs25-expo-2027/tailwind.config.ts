import type { Config } from 'tailwindcss';

// T0-4 · GS25 브랜드 디자인 토큰
// 메인: 블루 계열 / 포인트: 민트 / 배경: 흰색. 다크모드는 만들지 않는다(PRD 7장 · 50~60대 가독성).
const config: Config = {
  darkMode: [], // 다크모드 비활성
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        gs: {
          blue: 'rgb(var(--gs-blue) / <alpha-value>)',
          'blue-dark': 'rgb(var(--gs-blue-dark) / <alpha-value>)',
          'blue-light': 'rgb(var(--gs-blue-light) / <alpha-value>)',
          mint: 'rgb(var(--gs-mint) / <alpha-value>)',
          'mint-dark': 'rgb(var(--gs-mint-dark) / <alpha-value>)',
          sand: 'rgb(var(--gs-sand) / <alpha-value>)',
          ink: 'rgb(var(--gs-ink) / <alpha-value>)',
          muted: 'rgb(var(--gs-muted) / <alpha-value>)',
          line: 'rgb(var(--gs-line) / <alpha-value>)',
          surface: 'rgb(var(--gs-surface) / <alpha-value>)',
        },
        state: {
          ok: '#43a047',
          warn: '#fbc02d',
          danger: '#f57c00',
          critical: '#e53935',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
      },
      fontSize: {
        // 기본 16px 이상 (PRD 7장 접근성)
        xs: ['0.875rem', { lineHeight: '1.4' }],
        sm: ['0.9375rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.65' }],
        lg: ['1.125rem', { lineHeight: '1.6' }],
        xl: ['1.25rem', { lineHeight: '1.5' }],
        '2xl': ['1.5rem', { lineHeight: '1.35' }],
        '3xl': ['1.875rem', { lineHeight: '1.25' }],
        '4xl': ['2.25rem', { lineHeight: '1.2' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
        '6xl': ['3.75rem', { lineHeight: '1.05' }],
      },
      spacing: {
        // 터치 영역 최소 44px
        touch: '2.75rem',
        'safe-b': 'env(safe-area-inset-bottom)',
      },
      borderRadius: {
        card: '1rem',
        pill: '999px',
      },
      boxShadow: {
        card: '0 2px 12px rgb(15 34 62 / 0.08)',
        lift: '0 10px 30px rgb(15 34 62 / 0.14)',
      },
      keyframes: {
        'stamp-in': {
          '0%': { transform: 'scale(2.4) rotate(-18deg)', opacity: '0' },
          '55%': { transform: 'scale(0.9) rotate(4deg)', opacity: '1' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        'battery-pulse': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        breathing: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.72' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
        'city-glow': {
          '0%,100%': { opacity: '0.25', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.35)' },
        },
      },
      animation: {
        'stamp-in': 'stamp-in 600ms cubic-bezier(.2,1.4,.4,1) both',
        'battery-pulse': 'battery-pulse 0.6s ease-in-out infinite',
        'battery-danger': 'battery-pulse 1.2s ease-in-out infinite',
        'battery-warn': 'breathing 2.4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'city-glow': 'city-glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
