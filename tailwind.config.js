/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-dark': '#070709',
        'bg-panel': 'rgba(20, 20, 25, 0.6)',
        'bg-card': 'rgba(30, 30, 38, 0.4)',
        'border-light': 'rgba(255, 255, 255, 0.08)',
        'cyan-primary': '#06b6d4',
        'violet-primary': '#8b5cf6',
      }
    },
  },
  plugins: [],
}