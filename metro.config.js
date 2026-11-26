const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The food database (assets/foods.db) ships inside the app
config.resolver.assetExts.push('db');

module.exports = config;
