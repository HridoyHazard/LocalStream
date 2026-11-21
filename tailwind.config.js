/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0d0d0e",
          900: "#0f0f10",
          850: "#121213",
          800: "#151516",
          700: "#1c1c1e",
          600: "#262629",
          500: "#333338",
        },
        accent: {
          DEFAULT: "#e50914",
          50: "#fff1f2",
          100: "#ffe0e2",
          200: "#ffc2c7",
          300: "#ff9299",
          400: "#f65f69",
          500: "#e50914",
          600: "#c40710",
          700: "#a1050d",
          800: "#7d040a",
          900: "#5c0307",
        },
        line: "rgba(255, 255, 255, 0.08)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
      fontFamily: {
        sans: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 18px 40px -22px rgba(0, 0, 0, 0.85)",
        lift: "0 28px 60px -22px rgba(0, 0, 0, 0.95)",
        glow: "0 0 0 1px rgba(255, 255, 255, 0.08), 0 24px 70px -30px rgba(229, 9, 20, 0.5)",
        inset: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        nav: "0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.22)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translate3d(0, 18px, 0)" },
          "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.97)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translate3d(0, 24px, 0)" },
          "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-up": "slide-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
