import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#ba0c2f",
          cloudDancer: "#f0eee9",
          gold: "#eaaa00",
          sweet: "#a6c9e7",
          eden: "#466481",
          lea: "#0d2c43",
          grey: "#76787b",
          black: "#302f31"
        }
      },
      boxShadow: {
        panel: "0 18px 45px rgba(13, 44, 67, 0.10)"
      }
    }
  },
  plugins: []
};

export default config;
