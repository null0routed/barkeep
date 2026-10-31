/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind v4 PostCSS plugin (replaces the bare `tailwindcss` v3 plugin).
    // Vendor prefixing is handled internally — autoprefixer is no longer needed.
    "@tailwindcss/postcss": {},
  },
};

export default config;
