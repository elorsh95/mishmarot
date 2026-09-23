// Fails if a "use client" file value-imports a server-only module (services, firebase, session).
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const files = execSync("grep -rl --include=*.ts --include=*.tsx '^\"use client\"' src", {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const serverOnly =
  /from "(@\/modules\/[\w-]+\/(service|session|engine)|@\/lib\/firebase\/[\w-]+|@\/lib\/action|firebase-admin[^"]*)"/;
let bad = 0;
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const imports = src.match(/import\s+(?!type\b)[^;]*?from\s+"[^"]+"/gs) ?? [];
  for (const imp of imports) {
    // allow `import { type A, type B } from ...` (all specifiers are types)
    const specifiers = imp.match(/\{([^}]*)\}/s)?.[1];
    const allTypes =
      specifiers !== undefined &&
      !/^import\s+\w/.test(imp.replace(/^import\s+\{/, "import {")) &&
      specifiers.split(",").every((s) => !s.trim() || s.trim().startsWith("type "));
    if (serverOnly.test(imp) && !allTypes) {
      console.error(`${file}: ${imp.replace(/\s+/g, " ")}`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log(`client imports OK (${files.length} client files)`);
