/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/src/**/*.{js,jsx,ts,tsx}",
    "./public/index.html",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4271b8',
          hover: '#335994',
          light: '#eef4fb',
          dark: '#1e3a6a',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        maiandra: ['"Maiandra GD"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
