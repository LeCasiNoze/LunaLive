import type { Config } from "tailwindcss";

// Tailwind scope a la sous-arbo lovable-imports pour ne pas affecter le reste
// du site. Preflight desactive (sinon il reset les styles existants).
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
