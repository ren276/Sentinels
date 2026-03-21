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
      },
      colors: {
        background: 'var(--bg-base)',
        foreground: 'var(--text-primary)',
        muted: 'var(--text-muted)',
      },
    },
  },
  plugins: [],
}

export default config
