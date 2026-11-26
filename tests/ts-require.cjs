// Lets node:test load the app's TypeScript modules, which import each other without file extensions.
const Module = require('module');
const fs = require('fs');
const ts = require('typescript');

for (const ext of ['.ts', '.tsx']) {
  Module._extensions[ext] = (module, file) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext, esModuleInterop: true, resolveJsonModule: true },
      fileName: file,
    });
    module._compile(outputText, file);
  };
}
