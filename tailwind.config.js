/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Google Sans"', '"Product Sans"', 'Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'm3-surface': '#09090B',
        'm3-surface-container': '#121214',
        'm3-surface-container-high': '#1A1A1E',
        'm3-surface-variant': '#27272A',
        'm3-primary': '#FFB49C',
        'm3-on-primary': '#561D00',
        'm3-primary-container': '#7A2F00',
        'm3-on-primary-container': '#FFDBC8',
        'm3-secondary': '#E6BEB0',
        'm3-secondary-container': '#5D4035',
        'm3-on-secondary-container': '#FFDBC8',
        'm3-tertiary': '#DBC583',
        'm3-tertiary-container': '#534611',
        'm3-on-tertiary-container': '#F8E09C',
        'm3-error': '#FFB4AB',
        'm3-error-container': '#93000A',
        'm3-on-error-container': '#FFDAD6',
        'm3-outline': '#9F8C84',
        'm3-outline-variant': '#52433D',
        'm3-on-surface': '#F0DFD8',
        'm3-on-surface-variant': '#D7C2B9',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.2, 0, 0, 1)',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.2, 0, 0, 1)',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        }
      }
    },
  },
  plugins: [],
}
