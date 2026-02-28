/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        severity: {
          minor: '#22c55e',
          needs_fix_today: '#eab308',
          immediate_interrupt: '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
