/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'm3-surface': '#1A110E',
        'm3-surface-container': '#251814',
        'm3-surface-container-high': '#2F211C',
        'm3-surface-variant': '#52433D',
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
      }
    },
  },
  plugins: [],
}
