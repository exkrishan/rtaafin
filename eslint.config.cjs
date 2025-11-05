module.exports = [
  {
    ignores: ["node_modules/**", ".next/**"]
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module"
    },
    rules: {
      "no-unused-vars": "warn"
    }
  }
]
