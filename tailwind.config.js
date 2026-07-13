/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#071B33',
          900: '#0B3158',
          800: '#10466F',
        },
        brand: {
          600: '#176DB5',
          400: '#5BB8F0',
          50: '#EEF7FF',
        },
      },
      boxShadow: {
        panel: '0 16px 40px rgba(7, 27, 51, 0.10)',
      },
    },
  },
  plugins: [],
}
