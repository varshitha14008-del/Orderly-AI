import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        paypal: {
          blue: "#0070BA",
          darkblue: "#003087",
          navy: "#001C6A",
          gold: "#FFC439",
          light: "#F5F7FA",
        },
      },
    },
  },
  plugins: [],
};

export default config;
