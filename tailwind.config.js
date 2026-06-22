/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-dark': '#0F0F11',
        'bg-panel': 'rgba(22, 22, 26, 0.7)',
        'bg-card': 'rgba(30, 30, 36, 0.4)',
        'border-light': 'rgba(255, 255, 255, 0.08)',
        'orange-primary': '#FF6B00',
        'orange-hover': '#FF9F40',
        'cyan-primary': '#06b6d4',
        'violet-primary': '#8b5cf6',
      }
    },
  },
  plugins: [],
}
