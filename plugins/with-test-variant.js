// Lets trial builds sit beside the installed Pantera instead of replacing it:
//   debug builds            -> com.pantera.nutrition.test  "Pantera Test"
//   release -PpanteraBeta=1 -> com.pantera.nutrition.beta  "Pantera Beta"
//   ordinary release builds are unchanged.
const fs = require('fs');
const path = require('path');
const { withAppBuildGradle, withDangerousMod } = require('expo/config-plugins');

const MARK = '// pantera-test-variant';

function insertInto(gradle, from, block, lines) {
  const start = gradle.indexOf(`${block} {`, from);
  if (start < 0) throw new Error(`No ${block} block under buildTypes in build.gradle`);
  const at = start + block.length + 2;
  return gradle.slice(0, at) + lines + gradle.slice(at);
}

function addTestVariant(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const types = gradle.indexOf('buildTypes {');
  if (types < 0) throw new Error('No buildTypes block in build.gradle');
  let out = insertInto(gradle, types, 'release', `
            ${MARK}
            if (findProperty('panteraBeta')) {
                applicationIdSuffix ".beta"
                versionNameSuffix "-beta"
            }`);
  out = insertInto(out, types, 'debug', `
            ${MARK}
            applicationIdSuffix ".test"`);
  return `${out}
${MARK}
if (findProperty('panteraBeta')) {
    android.sourceSets.release.res.srcDirs += 'src/panteraBeta/res'
}
// Only for testing on this computer against the local search server. Never use for a build you hand out.
if (findProperty('panteraLocalHttp')) {
    android.sourceSets.release.manifest.srcFile 'src/panteraHttp/AndroidManifest.xml'
}
`;
}

/** The name under the icon for each trial build. */
function writeNames(androidDir) {
  const names = { debug: 'Pantera Test', panteraBeta: 'Pantera Beta' };
  for (const [folder, name] of Object.entries(names)) {
    const dir = path.join(androidDir, 'app', 'src', folder, 'res', 'values');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'strings.xml'), `<resources>\n  <string name="app_name">${name}</string>\n</resources>\n`);
  }
  const http = path.join(androidDir, 'app', 'src', 'panteraHttp');
  fs.mkdirSync(http, { recursive: true });
  fs.writeFileSync(path.join(http, 'AndroidManifest.xml'), [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
    '  <application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic" />',
    '</manifest>',
    '',
  ].join('\n'));
}

module.exports = (config) => {
  const gradle = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = addTestVariant(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(gradle, ['android', (mod) => {
    writeNames(mod.modRequest.platformProjectRoot);
    return mod;
  }]);
};
module.exports.addTestVariant = addTestVariant;
module.exports.writeNames = writeNames;
