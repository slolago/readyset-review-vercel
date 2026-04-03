import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        frame: {
          bg: '#08080f',
          sidebar: '#0e0e18',
          card: '#13131f',
          cardHover: '#1a1a28',
          border: '#22223a',
          borderLight: '#2e2e4a',
          accent: '#7a00df',
          accentHover: '#9120f0',
          accentSubtle: '#7a00df1a',
          green: '#00d084',
          red: '#f05252',
          yellow: '#f59e0b',
          textPrimary: '#ffffff',
          textSecondary: '#9090b0',
          textMuted: '#55556a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'rs-gradient': 'linear-gradient(135deg, #0693e3 0%, #7a00df 100%)',
        'rs-gradient-subtle': 'linear-gradient(135deg, rgba(6,147,227,0.15) 0%, rgba(122,0,223,0.15) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in': 'slideIn 0.25s ease-out',
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
      },
    },
  },
  plugins: [],
};

export default config;
