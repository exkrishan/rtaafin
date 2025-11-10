/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand color used for primary actions and active states
        brand: '#3F51FF',
        // Surface color for page backgrounds
        surface: '#F8FAFB',
        // Panel background for cards and containers
        'panel-bg': '#FFFFFF',
        // Soft border color for subtle dividers
        'border-soft': '#E9EEF3',
        // Muted text color for secondary content
        'text-muted': '#6B7280',
        // Success color for positive indicators (e.g., relevance pills)
        success: '#16A34A',
        // Warning color for alerts
        warning: '#F59E0B',
      },
      fontSize: {
        // Consistent typography scale
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['14px', { lineHeight: '20px' }],
        'base': ['14px', { lineHeight: '20px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '28px' }],
        '3xl': ['24px', { lineHeight: '32px' }],
      },
      spacing: {
        // Consistent spacing scale
        '18': '4.5rem',
        '22': '5.5rem',
      },
      borderRadius: {
        // Large border radius for main cards and panels
        lg: '12px',
        // Pill shape for badges and chips
        pill: '9999px',
      },
      boxShadow: {
        // Card shadow for elevated panels and containers
        card: '0 8px 20px rgba(15,23,42,0.06)',
      },
    },
  },
  plugins: [],
}

