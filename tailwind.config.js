/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary-color)',
          dark: 'var(--primary-dark)',
          light: 'var(--primary-light)'
        },
        text: {
          main: 'var(--text-main)',
          sub: 'var(--text-sub)'
        },
        border: 'var(--border-color)',
        card: 'var(--card-bg)'
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        inner: 'var(--shadow-inset)'
      }
    }
  },
  plugins: [],
}
