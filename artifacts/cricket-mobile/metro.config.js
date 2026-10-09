const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const existingBlockList = config.resolver.blockList;
// Metro watches the monorepo. Vite atomically replaces these cache folders,
// which can otherwise crash Metro's fallback watcher during web restarts.
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /[/\\]node_modules[/\\]\.vite(?:[/\\]|$)/,
];

module.exports = config;
