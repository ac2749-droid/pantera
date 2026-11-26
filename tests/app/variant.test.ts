import assert from 'node:assert/strict';
import test from 'node:test';

const { addTestVariant } = require('../../plugins/with-test-variant');

const gradle = `android {
    signingConfigs {
        debug {
            storePassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;

test('debug builds and trial releases get their own app id; real releases do not', () => {
  const out = addTestVariant(gradle);
  const types = out.slice(out.indexOf('buildTypes {'));
  assert.ok(types.includes('applicationIdSuffix ".test"'));
  assert.ok(!out.slice(0, out.indexOf('buildTypes {')).includes('applicationIdSuffix'));
  assert.equal(out.match(/applicationIdSuffix "\.test"/g)!.length, 1);
  // A release gets the beta id only when asked for with -PpanteraBeta
  assert.ok(out.includes("if (findProperty('panteraBeta')) {"));
  assert.ok(out.includes('applicationIdSuffix ".beta"'));
  assert.ok(out.includes('versionNameSuffix "-beta"'));
});

test('plain HTTP is allowed in a release only for local testing, when asked for', () => {
  const out = addTestVariant(gradle);
  const block = out.slice(out.indexOf("if (findProperty('panteraLocalHttp'))"));
  assert.ok(block.startsWith("if (findProperty('panteraLocalHttp'))"));
  assert.ok(block.includes("android.sourceSets.release.manifest.srcFile 'src/panteraHttp/AndroidManifest.xml'"));
});

test('applying it twice changes nothing, and unknown files are refused', () => {
  const once = addTestVariant(gradle);
  assert.equal(addTestVariant(once), once);
  assert.throws(() => addTestVariant('android { }'), /buildTypes/);
});
