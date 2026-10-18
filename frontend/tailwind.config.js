/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#0F172A', navy: '#0B132B', brand: { DEFAULT: '#6D28D9', soft: '#EDE9FE' }, cyan2: '#22D3EE' },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [],
};
