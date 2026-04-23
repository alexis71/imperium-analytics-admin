/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ia: {
          bg:      '#0b0a14',
          surface: '#15132a',
          accent:  '#7c3aed', // púrpura confirmado
          'accent-soft': 'rgba(124,58,237,0.15)',
          fg:      '#e2e8f0',
          muted:   '#94a3b8',
        },
      },
    },
  },
  plugins: [],
};
