/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        eden: {
          bg: '#f0f2f5',
          surface: '#ffffff',
          border: '#e2e5e9',
          text: '#1a1a2e',
          'text-2': '#6b7280',
          accent: '#e65100',
          'accent-light': '#fff3e0',
          'accent-dark': '#bf360c',
          activity: '#1a1a2e',
          step: '#e65100',
          green: '#10b981',
          'q-bg': '#fffbeb',
          'q-border': '#f59e0b',
          'q-text': '#92400e',
          'cq-bg': '#fef2f2',
          'cq-border': '#ef4444',
          'cq-text': '#991b1b',
        },
      },
      borderRadius: {
        eden: '10px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,.08)',
        'card-hover': '0 4px 12px rgba(0,0,0,.1)',
        modal: '0 12px 36px rgba(0,0,0,.12)',
      },
      backgroundImage: {
        'eden-header': 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)',
      },
    },
  },
  plugins: [],
};
