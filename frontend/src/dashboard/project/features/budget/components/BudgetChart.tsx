#!/usr/bin/env node
import fs from "fs";
import path from "path";

// ----------------------
// Helpers
// ----------------------
function splitWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camel bumps
    .replace(/[^a-zA-Z0-9]+/g, " ") // dashes, underscores, etc
    .trim()
    .split(/\s+/)
    .map(w => w.toLowerCase());
}

function toPascalCase(name) {
  return splitWords(name)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function toCamelCase(name) {
  const words = splitWords(name);
  return (
    words[0] +
    words
      .slice(1)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
  );
}

function toKebabCase(name) {
  return splitWords(name).join("-");
}

// ----------------------
// Rename Rule Engine
// ----------------------
function getTargetName(file) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  let newBase = base;

  if (ext === ".tsx" || ext === ".ts") {
    if (base.startsWith("use")) {
      newBase = toCamelCase(base); // hooks
    } else if (/types$/i.test(base)) {
      newBase = toPascalCase(base.replace(/types$/i, "")) + "Types";
    } else if (/constants$/i.test(base)) {
      newBase = toCamelCase(base.replace(/constants$/i, "")) + "Constants";
    } else {
      newBase = toPascalCase(base); // components
    }
  } else if (ext === ".css") {
    newBase = toKebabCase(base);
  }

  return newBase + ext;
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
// Load TS path aliases
// ----------------------
const ALIAS_MAP: Record<string, string> = {};
try {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "tsconfig.json"), "utf8"));
  const paths = tsconfig.compilerOptions?.paths || {};
  for (const [alias, targets] of Object.entries(paths)) {
    const cleanAlias = alias.replace(/\*$/, "");
    const cleanTarget = (targets as string[])[0].replace(/\*$/, "");
    ALIAS_MAP[cleanAlias] = path.resolve(process.cwd(), cleanTarget);
  }
  console.log("Loaded TS path aliases:", ALIAS_MAP);
} catch {
  console.warn("⚠️ No tsconfig.json or no compilerOptions.paths found.");
}

// ----------------------
// Import resolver
// ----------------------
function tryResolveImport(fromFile, importSpec) {
  // Relative imports
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
      return alias + relPath.replace(/\\/g, "/");
    }
  }
  return null;
}

// ----------------------
// Main
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

const planned = [];
walkDir(srcPath, file => {
  const dir = path.dirname(file);
  const fileName = path.basename(file);
  const newName = getTargetName(fileName);
  if (fileName !== newName) {
    planned.push({ from: file, to: path.join(dir, newName) });
  }
});

// ----------------------
// Import rewriting
// ----------------------
function rewriteImports(file, renames, dryRun) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) return;
  let content = fs.readFileSync(file, "utf8");
  let changed = false;

  content = content.replace(/from\s+["']([^"']+)["']/g, (m, spec) => {
    const resolved = tryResolveImport(file, spec);
    if (resolved) {
      const match = renames.find(r => path.resolve(r.from) === resolved);
      if (match) {
        const newAbs = match.to;
        const aliasSpec = toAliasIfPossible(newAbs);
        let newSpec;
        if (aliasSpec) {
          newSpec = aliasSpec.replace(/\.(ts|tsx|css)$/, "");
        } else {
          const fromDir = path.dirname(file);
          newSpec = path.relative(fromDir, newAbs).replace(/\\/g, "/").replace(/\.(ts|tsx|css)$/, "");
          if (!newSpec.startsWith(".")) newSpec = "./" + newSpec;
        }
        changed = true;
        return `from "${newSpec}"`;
      }
    }
    return m;
  });

  if (changed) {
    if (dryRun) {
      console.log(` - would rewrite imports in ${file}`);
    } else {
      fs.writeFileSync(file, content, "utf8");
      console.log(` ✏️  Rewrote imports in ${file}`);
    }
  }
}

// ----------------------
// Execution
// ----------------------
if (planned.length === 0) {
  console.log("No renames needed 🎉");
  process.exit(0);
}

console.log("Planned renames:");
planned.forEach(r => console.log(` - ${r.from} → ${r.to}`));

if (apply) {
  planned.forEach(r => fs.renameSync(r.from, r.to));
  console.log("✅ Renames applied.");

  // Fix imports after renames
  walkDir(srcPath, file => rewriteImports(file, planned, false));
} else {
  console.log("(DRY RUN) No changes written.");
  walkDir(srcPath, file => rewriteImports(file, planned, true));
}









