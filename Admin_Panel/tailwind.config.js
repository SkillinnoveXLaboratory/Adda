/** Design tokens from Admin_Panel/template.html ("Paces": dark sidebar, blue brand, Public Sans). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Public Sans', 'sans-serif'] },
      colors: {
        sidebar: { bg: '#1e1f29', active: '#272936', text: '#98a6ad', hover: '#2d303e', title: '#50586c' },
        brand: {
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#eff6ff',
          text: '#343a40',
          muted: '#8a969c',
          bg: '#f3f5f9',
          success: '#10b981',
          danger: '#f1556c',
          info: '#2563eb',
          cyan: '#06b6d4',
        },
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'pop-in': { from: { opacity: 0, transform: 'translateY(8px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'toast-in': { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'slide-in-right': 'slide-in-right .22s ease-out',
        'pop-in': 'pop-in .18s ease-out',
        'toast-in': 'toast-in .2s ease-out',
      },
    },
  },
  plugins: [],
};
