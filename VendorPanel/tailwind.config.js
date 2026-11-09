/**
 * Same design tokens as SocialPanel (template.html), with the Vendor Panel's purple brand.
 * Components keep the `azea-*` class names, so only the values below change the theme.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Poppins', 'sans-serif'] },
      colors: {
        azea: {
          purple: '#7c3aed',
          purpleDark: '#6d28d9',
          purpleLight: '#ede9fe',
          sidebar: '#2e1065',
          text: '#2c2c2c',
          muted: '#878a9e',
          bg: '#f5f3fb',
          green: '#16a34a',
          orange: '#e5484d',
          blue: '#7c3aed',
          cyan: '#a78bfa',
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
