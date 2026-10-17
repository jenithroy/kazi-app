// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// `assets/html2canvas.min.js.txt` is vendored browser JavaScript that gets read
// off disk and injected into the document WebView (to rasterise a document to
// PNG). It must reach the app as a FILE, not as a module Metro tries to bundle,
// hence the `.txt` extension and this line.
config.resolver.assetExts.push('txt');

module.exports = config;
