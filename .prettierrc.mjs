/** @type {import("prettier").Config & import("prettier-plugin-tailwindcss").PluginOptions} */
const config = {
  printWidth: 100,
  // The Tailwind plugin must be the last plugin.
  plugins: ["prettier-plugin-tailwindcss"],
  // Tailwind v4: the CSS entry that holds @theme, so custom utilities sort correctly.
  tailwindStylesheet: "./src/styles/globals.css",
  tailwindFunctions: ["cn", "cva", "clsx"],
};

export default config;
