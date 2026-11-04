/** Design tokens copied verbatim from template.html (the client's chosen design). */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'sans-serif'] },
      colors: {
        azea: {
          purple: '#705ec8',
          purpleDark: '#5c4ac7',
          purpleLight: '#f0eeff',
          text: '#2c2c2c',
          muted: '#9ba2b7',
          bg: '#f2f4f9',
          green: '#2dce89',
          orange: '#ff5b51',
          blue: '#1170e4',
          cyan: '#01b8ff',
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
