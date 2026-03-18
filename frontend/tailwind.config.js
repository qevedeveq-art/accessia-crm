/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        sensia: {
          50:  '#f0f4ff',
          100: '#dce6ff',
          200: '#b9ccff',
          300: '#8aa8ff',
          400: '#567bff',
          500: '#2850ff',
          600: '#1233f5',
          700: '#0d26d8',
          800: '#1122ae',
          900: '#132289',
          950: '#0d1453',
        },
      },
    },
  },
  plugins: [],
}
