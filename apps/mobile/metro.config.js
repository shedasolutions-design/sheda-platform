const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const {
  wrapWithReanimatedMetroConfig,
} = require("react-native-reanimated/metro-config");

module.exports = async () => {
  const config = await getDefaultConfig(__dirname);

  // SVG support
  config.transformer.babelTransformerPath = require.resolve(
    "react-native-svg-transformer"
  );
  config.resolver.assetExts = config.resolver.assetExts.filter(
    (ext) => ext !== "svg"
  );
  config.resolver.sourceExts.push("svg");

  // Add Node.js polyfills for crypto libraries
  config.resolver.alias = {
    ...config.resolver.alias,
    crypto: require.resolve("./shims/crypto.js"),
    stream: "readable-stream",
    buffer: "buffer",
  };

  // Disable package exports to avoid node: prefix issues
  config.resolver.unstable_enablePackageExports = false;

  // Custom resolver to prevent node: prefix issues and patch @noble/hashes/crypto
  const nobleHashesCryptoShim = require.resolve("./shims/noble-hashes-crypto.js");
  const originalResolveRequest = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    // Redirect @noble/hashes/crypto to our shim that ensures globalThis.crypto exists
    if (moduleName === '@noble/hashes/crypto') {
      return {
        filePath: nobleHashesCryptoShim,
        type: 'sourceFile',
      };
    }

    // Remove 'node:' prefix if present
    if (moduleName.startsWith('node:')) {
      const cleanModuleName = moduleName.replace(/^node:/, '');
      try {
        return context.resolveRequest(context, cleanModuleName, platform);
      } catch (e) {
        // If resolution fails, continue with original resolver
      }
    }

    if (originalResolveRequest) {
      return originalResolveRequest(context, moduleName, platform);
    }

    return context.resolveRequest(context, moduleName, platform);
  };

  // Apply reanimatedMetroConfiq and NativeWind
  return wrapWithReanimatedMetroConfig(
    withNativeWind(config, { input: "./global.css" })
  );
};
