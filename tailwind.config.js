/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf4f0',
          100: '#fbe5d8',
          200: '#f6c9af',
          300: '#efa67d',
          400: '#e87a48',
          500: '#e25a26',
          600: '#d4411b',
          700: '#af3018',
          800: '#8d281a',
          900: '#722419',
          950: '#3d0f0a',
        },
        cream: {
          50:  '#fefdf9',
          100: '#fdf8ed',
          200: '#faefd5',
          300: '#f5e0ab',
          400: '#efca77',
          500: '#e8b24a',
          600: '#d4932e',
          700: '#b07524',
          800: '#8e5e22',
          900: '#744e1e',
        },
        dark: {
          900: '#0f0e0a',
          800: '#1a1916',
          700: '#252420',
          600: '#312f2a',
          500: '#3d3b35',
          400: '#504e47',
          300: '#6b6860',
          200: '#908d84',
          100: '#bbb8b0',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
