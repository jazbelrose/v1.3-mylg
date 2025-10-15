#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// ----------------------
// Initialisms to preserve (extend as needed)
// ----------------------
const INITIALISMS = new Set([
  "API","APP","AWS","CI","CD","CSS","CSV","DB","DM","DOM","DTO","ENV","FAQ","GIF",
  "GPU","HTTP","HTTPS","ID","IO","IPC","IP","JSON","JWT","KPI","PDF","PNG","QA",
  "RAM","REST","RPC","SDK","SEO","SQL","SSO","SVG","TCP","TLS","TS","TTL","UI","URI",
  "URL","USB","UX","UUID","VM","VPN","XML","XSS"
]);

// ----------------------
// Word utils
// ----------------------
function splitWords(name) {
  return name
    // split camelCase bumps
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // split ALLCAPS followed by PascalCase (e.g., "DMConversation" -> "DM Conversation")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // replace non-alphanumerics with spaces
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function transformWords(words, mode /* 'pascal' | 'camel' */) {
  return words
    .map((w, i) => {
      const wl = w.toLowerCase();
      if (INITIALISMS.has(w.toUpperCase())) {
        // In camelCase, first token initialism should be lower (e.g., id -> id, api -> api)
        if (mode === "camel" && i === 0) return wl;
        return w.toUpperCase();
      }
      const cap = w.charAt(0).toUpperCase() + wl.slice(1);
      if (mode === "camel") {
        return i === 0 ? wl : cap;
      }
      return cap; // pascal
    })
    .join("");
}

function toPascalCase(name) {
  return transformWords(splitWords(name), "pascal");
}

function toCamelCase(name) {
  return transformWords(splitWords(name), "camel");
}

function toKebabCase(name) {
  return splitWords(name).map(w => w.toLowerCase()).join("-");
}

// ----------------------
// Base/suffix splitter for test/spec/d
// ----------------------
function splitBaseAndSuffix(rawBase) {
  // Handle .d.ts specially by stripping trailing ".d" from base
  // e.g. base "index.d" -> ["index", "d"]
  const suffixes = ["test", "spec", "d"];
  for (const s of suffixes) {
    const suffixDot = "." + s;
    if (rawBase.toLowerCase().endsWith(suffixDot)) {
      return [rawBase.slice(0, -suffixDot.length), s];
    }
  }
  return [rawBase, null];
}

// ----------------------
// Rename Rule Engine
// ----------------------
function getTargetName(fileName) {
  // Recognize .d.ts files
  const isDts = fileName.toLowerCase().endsWith(".d.ts");
  const ext = isDts ? ".ts" : path.extname(fileName).toLowerCase();
  const baseRaw = isDts
    ? path.basename(fileName, ".ts") // "index.d"
    : path.basename(fileName, ext);  // e.g. "authcontext"

  const [coreBase, suffix] = splitBaseAndSuffix(baseRaw);
  let newBase = coreBase;

  if (ext === ".tsx" || ext === ".ts") {
    // Hooks: start with "use" (case-insensitive)
    if (/^use/.test(coreBase)) {
      newBase = toCamelCase(coreBase);
    } else if (/types$/i.test(coreBase)) {
      newBase = toPascalCase(coreBase.replace(/types$/i, "")) + "Types";
    } else if (/constants$/i.test(coreBase)) {
      newBase = toCamelCase(coreBase.replace(/constants$/i, "")) + "Constants";
    } else {
      newBase = toPascalCase(coreBase);
    }

    if (suffix) newBase += "." + suffix;   // .test / .spec / .d
    if (isDts && !/\.d$/i.test(newBase)) newBase += ".d"; // ensure .d for .d.ts

  } else if (ext === ".css") {
    // Kebab-case for all CSS, including *.module.css
    newBase = toKebabCase(baseRaw); // keep any ".module" in base and kebab it
  } else {
    // For other extensions, keep original
    newBase = baseRaw;
  }

  // Add back extension
  return newBase + (isDts ? ".ts" : ext);
}

// ----------------------
// Walk directory
// ----------------------
function walkDir(dir, callback) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  });
}

// ----------------------
// Load TS path aliases (tsconfig.json)
// ----------------------
let ALIAS_MAP = {};
let BASE_URL = process.cwd();
try {
  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, "utf8"));
  const paths = tsconfig.compilerOptions?.paths || {};
  if (tsconfig.compilerOptions?.baseUrl) {
    BASE_URL = path.resolve(process.cwd(), tsconfig.compilerOptions.baseUrl);
  }
  for (const [alias, targets] of Object.entries(paths)) {
    if (!targets?.length) continue;
    const cleanAlias = alias.replace(/\*$/, "");
    const cleanTarget = targets[0].replace(/\*$/, "");
    ALIAS_MAP[cleanAlias] = path.resolve(BASE_URL, cleanTarget);
  }
  if (Object.keys(ALIAS_MAP).length) {
    console.log("Loaded TS path aliases:", ALIAS_MAP);
  } else {
    console.warn("⚠️ No compilerOptions.paths found.");
  }
} catch (e) {
  console.warn("⚠️ No tsconfig.json or unable to parse path aliases.");
}

// ----------------------
// Import resolver
// ----------------------
function tryResolveImport(fromFile, importSpec) {
  // Relative / absolute (project) imports
  if (importSpec.startsWith(".") || importSpec.startsWith("/")) {
    const fromDir = path.dirname(fromFile);
    const raw = path.resolve(fromDir, importSpec);
    const candidates = [
      raw,
      raw + ".ts",
      raw + ".tsx",
      raw + ".css",
      path.join(raw, "index.ts"),
      path.join(raw, "index.tsx"),
      path.join(raw, "index.css"),
      // also support Index.ts(x/css) after rename
      path.join(raw, "Index.ts"),
      path.join(raw, "Index.tsx"),
      path.join(raw, "Index.css"),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }

  // Alias imports
  for (const [alias, targetBase] of Object.entries(ALIAS_MAP)) {
    if (importSpec.startsWith(alias)) {
      const subPath = importSpec.slice(alias.length);
      const absPath = path.join(targetBase, subPath);
      const candidates = [
        absPath,
        absPath + ".ts",
        absPath + ".tsx",
        absPath + ".css",
        path.join(absPath, "index.ts"),
        path.join(absPath, "index.tsx"),
        path.join(absPath, "index.css"),
        path.join(absPath, "Index.ts"),
        path.join(absPath, "Index.tsx"),
        path.join(absPath, "Index.css"),
      ];
      for (const c of candidates) if (fs.existsSync(c)) return c;
    }
  }

  return null;
}

function toAliasIfPossible(absPath) {
  for (const [alias, targetBase] of Object.entries(ALIAS_MAP)) {
    if (absPath.startsWith(targetBase)) {
      const relPath = path.relative(targetBase, absPath);
      const norm = relPath.replace(/\\/g, "/");
      return alias + (alias.endsWith("/") || norm.startsWith("/") ? "" : "/") + norm;
    }
  }
  return null;
}

// ----------------------
// Args
// ----------------------
const args = process.argv.slice(2);
const srcArg = args.indexOf("--src");
const dryRun = args.includes("--dry-run");
const apply = args.includes("--apply");

if (srcArg === -1) {
  console.error("Usage: node enforce-naming.cjs --src <src_folder> [--dry-run|--apply]");
  process.exit(1);
}

const srcPath = path.resolve(args[srcArg + 1]);
if (!fs.existsSync(srcPath)) {
  console.error(`Source path not found: ${srcPath}`);
  process.exit(1);
}
if (!dryRun && !apply) {
  console.error("Please pass one of: --dry-run or --apply");
  process.exit(1);
}

// ----------------------
// Plan renames
// ----------------------
let planned = [];
walkDir(srcPath, fileAbs => {
  const dir = path.dirname(fileAbs);
  const name = path.basename(fileAbs);
  const newName = getTargetName(name);
  if (name !== newName) {
    planned.push({ from: fileAbs, to: path.join(dir, newName) });
  }
});

// detect collisions on target paths
const collisions = new Map();
for (const r of planned) {
  const key = r.to.toLowerCase();
  if (!collisions.has(key)) collisions.set(key, []);
  collisions.get(key).push(r);
}
const fatal = [];
for (const list of collisions.values()) {
  if (list.length > 1) fatal.push(list.map(x => x.from));
}
if (fatal.length) {
  console.error("❌ Conflicting target filenames detected (case-insensitive):");
  for (const group of fatal) {
    console.error(" - " + group.join("\n   "));
  }
  process.exit(1);
}

if (planned.length === 0) {
  console.log("No renames needed 🎉");
  process.exit(0);
}

console.log("Planned renames:");
planned.forEach(r => console.log(` - ${r.from} → ${r.to}`));

// ----------------------
// Import rewriting (supports from/require/dynamic import/export from)
// ----------------------
const IMPORT_PATTERNS = [
  { re: /\bfrom\s+["']([^"']+)["']/g, replace: (spec, repl) => `from "${repl}"` },
  { re: /\brequire\(\s*["']([^"']+)["']\s*\)/g, replace: (spec, repl) => `require("${repl}")` },
  { re: /\bimport\(\s*["']([^"']+)["']\s*\)/g, replace: (spec, repl) => `import("${repl}")` },
  { re: /\bexport\s+\*\s+from\s+["']([^"']+)["']/g, replace: (spec, repl) => `export * from "${repl}"` },
  { re: /\bexport\s+{[^}]*}\s+from\s+["']([^"']+)["']/g, replace: (spec, repl) => `export { $&`.replace(/\s+from\s+["'][^"']+["']$/, ` from "${repl}"`) },
];

function computeNewSpec(file, matchedSpec, renames) {
  const resolved = tryResolveImport(file, matchedSpec);
  if (!resolved) return null;

  // Find if the resolved absolute path is a "from" in our renames
  const match = renames.find(r => path.resolve(r.from) === resolved || path.resolve(r.to) === resolved);
  if (!match) return null;

  const newAbs = match.to;

  // Prefer alias if applicable
  const aliasSpec = toAliasIfPossible(newAbs);
  let newSpec;
  if (aliasSpec) {
    newSpec = aliasSpec;
  } else {
    const fromDir = path.dirname(file);
    newSpec = path.relative(fromDir, newAbs).replace(/\\/g, "/");
    if (!newSpec.startsWith(".")) newSpec = "./" + newSpec;
  }

  // For TS/TSX/JS/JSX: drop extension. For CSS: KEEP extension.
  if (/\.(ts|tsx|js|jsx)$/i.test(newSpec)) {
    newSpec = newSpec.replace(/\.(ts|tsx|js|jsx)$/i, "");
  }
  return newSpec;
}

function rewriteImports(file, renames, dryRunMode) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) return;
  let content = fs.readFileSync(file, "utf8");
  let changed = false;

  for (const { re, replace } of IMPORT_PATTERNS) {
    content = content.replace(re, (m, spec) => {
      const newSpec = computeNewSpec(file, spec, renames);
      if (newSpec && newSpec !== spec) {
        changed = true;
        // Special case: if the original was CSS and we stripped accidentally, ensure .css remains.
        // But computeNewSpec already keeps .css, so nothing else to do here.
        return replace(spec, newSpec);
      }
      return m;
    });
  }

  if (changed) {
    if (dryRunMode) {
      console.log(` - would rewrite imports in ${file}`);
    } else {
      fs.writeFileSync(file, content, "utf8");
      console.log(` ✏️  Rewrote imports in ${file}`);
    }
  }
}

// ----------------------
// Safe rename (handles case-only changes on case-insensitive FS)
// ----------------------
function safeRename(from, to) {
  if (from === to) return;
  const sameDir = path.dirname(from) === path.dirname(to);
  const nameDiffersOnlyByCase =
    sameDir &&
    path.basename(from).toLowerCase() === path.basename(to).toLowerCase() &&
    path.basename(from) !== path.basename(to);

  if (nameDiffersOnlyByCase) {
    const temp = from + ".__renaming__tmp__";
    fs.renameSync(from, temp);
    fs.renameSync(temp, to);
  } else {
    fs.renameSync(from, to);
  }
}

// ----------------------
// Execution
// ----------------------
if (dryRun) {
  console.log("(DRY RUN) No changes written.");
  // Show planned rewrites
  walkDir(srcPath, file => rewriteImports(file, planned, true));
  process.exit(0);
}

// APPLY mode:
// 1) Rewrite imports to point at the *new* names.
// 2) Apply renames (with safe case-only handling).
walkDir(srcPath, file => rewriteImports(file, planned, false));

for (const r of planned) {
  safeRename(r.from, r.to);
}
console.log("✅ Renames applied.");
