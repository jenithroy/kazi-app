// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // The files under scripts/ are Node CLI utilities, not app code — they run
    // under Node directly (`node scripts/…`), so they get the Node globals.
    files: ["scripts/**"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        process: "readonly",
        console: "readonly",
        module: "writable",
        require: "readonly",
        exports: "writable",
        global: "readonly",
      },
    },
  },
  {
    ignores: ["dist/*"],
  }
]);
