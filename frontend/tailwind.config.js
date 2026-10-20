/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#0F172A', navy: '#0B132B', brand: { DEFAULT: '#6D28D9', soft: '#EDE9FE' }, cyan2: '#22D3EE' },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'], display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0) rotate(var(--r,0deg))' }, '50%': { transform: 'translateY(-14px) rotate(var(--r,0deg))' } },
        blob: { '0%,100%': { transform: 'translate(0,0) scale(1)' }, '33%': { transform: 'translate(30px,-40px) scale(1.1)' }, '66%': { transform: 'translate(-20px,20px) scale(0.95)' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        pulseRing: { '0%': { transform: 'scale(.8)', opacity: '.7' }, '100%': { transform: 'scale(2)', opacity: '0' } },
      },
      animation: { float: 'float 6s ease-in-out infinite', blob: 'blob 14s ease-in-out infinite', shimmer: 'shimmer 3s linear infinite', marquee: 'marquee 30s linear infinite', pulseRing: 'pulseRing 2s ease-out infinite' },
    },
  },
  plugins: [],
};
