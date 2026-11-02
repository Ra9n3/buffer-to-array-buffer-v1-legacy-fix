// Test-time module hooks (Node ≥ 20.6, `module.register`): the project's TypeScript
// sources are transpiled on the fly with the `typescript` already in devDependencies,
// and `.svelte.ts` modules (the store's runes) are compiled with `svelte/compiler`'s
// compileModule — no new dependency, no build step, no DOM.
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { compileModule } from "svelte/compiler";

const TS_EXTS = [".ts", ".svelte.ts", "/index.ts"];

async function isFile(url) {
  try {
    return (await stat(fileURLToPath(url))).isFile();
  } catch {
    return false;
  }
}

export async function resolve(specifier, context, nextResolve) {
  // Extensionless relative imports inside the project's TS sources (`./store.svelte` means
  // `./store.svelte.ts` — a runes module, Task 3.3 — so only real file extensions are final).
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL && !/\.(m?[jt]s|json|css)$/i.test(specifier)) {
    for (const ext of TS_EXTS) {
      const candidate = new URL(specifier + ext, context.parentURL);
      if (await isFile(candidate)) return { url: candidate.href, shortCircuit: true };
    }
  }
  if (specifier.startsWith("@/")) {
    const base = pathToFileURL(new URL("../src/", import.meta.url).pathname).href;
    for (const ext of ["", ...TS_EXTS]) {
      const candidate = new URL(specifier.slice(2) + ext, base);
      if (await isFile(candidate)) return { url: candidate.href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith(".ts") || url.endsWith(".d.ts")) return nextLoad(url, context);
  const source = await readFile(fileURLToPath(url), "utf8");
  let { outputText } = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: false,
      isolatedModules: true,
      useDefineForClassFields: true,
    },
  });
  if (url.endsWith(".svelte.ts")) {
    outputText = compileModule(outputText, { filename: fileURLToPath(url).replace(/\.ts$/, ".js"), generate: "client" }).js.code;
  }
  return { format: "module", source: outputText, shortCircuit: true };
}
