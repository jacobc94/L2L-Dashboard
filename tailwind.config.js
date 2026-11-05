/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Pulled from l2lconsultingteam.com: deep teal text/nav + crimson accent
        brand: {
          50: '#eef6f7', 100: '#d5e8eb', 200: '#aed0d6', 300: '#7eb1ba', 400: '#4d8d99',
          500: '#2a6c79', 600: '#1b5562', 700: '#124350', 800: '#0c343d', 900: '#082329',
        },
        crimson: {
          50: '#fdf2f3', 100: '#fbe3e5', 200: '#f6c6ca', 300: '#ee9aa1', 400: '#e0636f',
          500: '#cd3a47', 600: '#b21f29', 700: '#a6131d', 800: '#871219', 900: '#6f1218',
        },
        sand: { 50: '#faf8f5', 100: '#f4f0ea', 200: '#e8e1d6' },
      },
      fontFamily: {
        sans: ['Lato', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Montserrat', 'Lato', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
