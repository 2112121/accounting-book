/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'Noto Sans TC', 'sans-serif'],
        heading: ['Quicksand', 'Noto Sans TC', 'sans-serif'],
      },
      colors: {
        'custom': {
          'primary': '#A487C3',
          'secondary': '#FFF3E0',
          'accent': '#FAC6CD',
          'green': '#B8E3C9',
          'primary-light': '#C6B2DD',
          'secondary-light': '#FFF9F0',
          'accent-light': '#FFE2E5',
          'green-light': '#D4F0DF',
        },
        'elora': {
          'purple': '#A487C3',
          'purple-light': '#C6B2DD',
          'pink': '#FAC6CD',
          'pink-light': '#FFE2E5',
          'cream': '#FFF3E0',
          'cream-light': '#FFF9F0',
          'mint': '#B8E3C9',
          'mint-light': '#D4F0DF',
        },
        'pastel-blue': {
          50: '#C6B2DD',
          100: '#B9A0D5',
          200: '#A487C3',
          300: '#9678B6',
          400: '#8669A9',
          500: '#765A9C',
          600: '#664B8F',
          DEFAULT: '#A487C3',
        },
        'pastel-pink': {
          50: '#FFF9F0',
          100: '#FFF3E0',
          200: '#FFE2E5',
          300: '#FAC6CD',
          400: '#F5B1BA',
          500: '#F09CA7',
          600: '#EB8794',
          DEFAULT: '#FAC6CD',
        },
        'rank': {
          'gold': '#FAC6CD',
          'silver': '#FFF3E0',
          'bronze': '#A487C3',
          'bg': '#FFF9F0',
        }
      },
      boxShadow: {
        'soft': '0 4px 10px rgba(164, 135, 195, 0.1)',
        'medium': '0 6px 15px rgba(164, 135, 195, 0.15)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1.5rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-in-out',
      },
    },
  },
  plugins: [],
}

