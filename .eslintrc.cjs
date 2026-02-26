/* eslint-env node */
module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "script",
  },
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    ".github/",
  ],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
};
