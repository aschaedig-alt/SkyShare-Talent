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
        },
        // Compliments by SkyShare — company value colors (handoff §3).
        // Each value has a DEFAULT (accent bars / bar fills), a `light` tint
        // (tag + avatar backgrounds) and a `dark` shade (text on the tint).
        value: {
          teamwork: { DEFAULT: "#1d9e75", light: "#e7f5ef", dark: "#0f5e45" },
          innovation: { DEFAULT: "#378add", light: "#e6f0fb", dark: "#1e5694" },
          leadership: { DEFAULT: "#ba7517", light: "#f7efe0", dark: "#7a4d0f" },
          customerFocus: { DEFAULT: "#d85a30", light: "#fbeae3", dark: "#8f3a1c" },
          growthMindset: { DEFAULT: "#7f77dd", light: "#ecebfa", dark: "#4a43a0" },
          integrity: { DEFAULT: "#888780", light: "#efefee", dark: "#56554f" }
        }
      },
      borderRadius: {
        // Site standard: crisp 4px corners everywhere (matches the jobs page).
        // The full scale is collapsed to 4px so every rounded-* class is uniform;
        // rounded-full (circles) and rounded-none are untouched.
        sm: "2px",
        DEFAULT: "4px",
        md: "4px",
        lg: "4px",
        xl: "4px",
        "2xl": "4px",
        "3xl": "6px",
        card: "4px",
        element: "4px"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(13, 44, 67, 0.10)",
        // Gold hover glow — the "you're interacting" cue, used app-wide.
        glow: "0 0 0 1px rgba(234, 170, 0, 0.85), 0 0 18px 3px rgba(234, 170, 0, 0.55)",
        "glow-soft": "0 0 0 1px rgba(234, 170, 0, 0.5), 0 0 10px 1px rgba(234, 170, 0, 0.3)"
      }
    }
  },
  plugins: []
};

export default config;
