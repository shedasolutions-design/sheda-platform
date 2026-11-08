const { default: plugin } = require("tailwindcss");

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      '@babel/plugin-transform-export-namespace-from',
      // Strip console.log in production builds for performance + security
      ...(process.env.NODE_ENV === 'production'
        ? ['transform-remove-console']
        : []),
      'react-native-worklets/plugin', // must be last plugin (react-native-reanimated 4 delegates its Babel transform here)
    ],
  };
};