// Tailwind v4 uses CSS importing natively, but if needed for VSCode Intellisense or specific toolings:

import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist)'],
        mono: ['var(--font-dm-mono)'],
        headline: ['Space Grotesk', 'sans-serif'],
      },
      colors: {
        surface: 'var(--surface)',
        'surface-container-lowest': 'var(--surface-container-lowest)',
        'surface-container-low': 'var(--surface-container-low)',
        'surface-container': 'var(--surface-container)',
        'surface-container-high': 'var(--surface-container-high)',
        'surface-container-highest': 'var(--surface-container-highest)',
        'on-surface': 'var(--on-surface)',
        'on-surface-variant': 'var(--on-surface-variant)',
        'outline-variant': 'var(--outline-variant)',
        primary: 'var(--primary)',
        'primary-fixed': '#7df4ff',
        'primary-fixed-dim': '#00dbe9',
        error: 'var(--error)',
        'error-container': 'var(--error-container)',
        tertiary: '#fff3f1',
        'tertiary-container': '#ffcec7',
      },
      borderRadius: {
        DEFAULT: '0px',
        lg: '0px',
        xl: '0px',
        full: '9999px',
      },
    },
  },
  plugins: [],
}

export default config
