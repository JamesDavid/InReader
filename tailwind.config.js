/** @type {import('tailwindcss').Config} */
import typographyPlugin from '@tailwindcss/typography'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'reader-blue': '#2D5A9B',
        'reader-gray': '#F5F5F5',
        'reader-border': '#E5E5E5',
        'reader-text': '#333333',
        'reader-hover': '#EDF3FE',
      },
      spacing: {
        'sidebar': '240px',
      },
    },
  },
  plugins: [
    typographyPlugin,
  ],
}

