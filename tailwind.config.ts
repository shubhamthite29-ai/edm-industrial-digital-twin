import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "Barlow", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Mono", "Consolas", "monospace"],
      },
      colors: {
        plant: {
          void: "#05070b",
          deck: "#0b1018",
          panel: "#101722",
          rail: "#182233",
          line: "#273244",
          text: "#d9e3ee",
          muted: "#8291a5",
          cyan: "#28d7ff",
          amber: "#f4b24d",
          green: "#51d88a",
          red: "#ff5168",
          violet: "#a78bfa",
        },
      },
      boxShadow: {
        glow: "0 0 24px rgb(40 215 255 / 18%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
