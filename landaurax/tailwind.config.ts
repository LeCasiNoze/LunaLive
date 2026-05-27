import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/lovable-imports/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
