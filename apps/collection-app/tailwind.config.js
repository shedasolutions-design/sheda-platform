/** @type {import('tailwindcss').Config} */
// The same tokens as the rental app, so screens built here drop into it
// later without a restyle. Changing a colour is a change in both places.
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: "#C1272D",
        primaryLight: "#C1272D0A",
        background: "#FFFFFF",
        primaryText: "#000000",
        secondaryText: "#878787",
        cardBackground: "#F5F5F5",
        borderColor: "#D8DADC",
        active: "#FFE6E6",
        // Added here, not in the rental app: a raise needs to say whether a
        // guarantee exists and whether a phase passed. Semantic, kept apart
        // from the brand red so "red" never has to mean two things.
        positive: "#0F7A46",
        positiveLight: "#E4F2EA",
        caution: "#9D5C06",
        cautionLight: "#FAF0DF",
      },
      spacing: { sm: 8, md: 16, lg: 24 },
    },
  },
  plugins: [],
};
