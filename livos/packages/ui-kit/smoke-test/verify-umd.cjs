/**
 * verify-umd.cjs - assert window.LivKit shape from dist/umd/livkit.umd.js
 *
 * Runs the UMD bundle inside a Node `vm` context with shimmed `window`,
 * `self`, `globalThis`, `React`, and `ReactDOM` globals (matching what a
 * real browser provides). After execution, asserts every expected named
 * export is present and has the right shape.
 *
 * Usage:
 *   node smoke-test/verify-umd.cjs
 * Exit codes:
 *   0  - all expected exports verified
 *   2  - UMD bundle missing on disk
 *   3  - UMD bundle threw while executing
 *   4  - LivKit global not exposed after execution
 *   5  - shape verification failed (missing/typed-wrong exports)
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const ReactDOM = require("react-dom");

const umdPath = path.resolve(__dirname, "../dist/umd/livkit.umd.js");
if (!fs.existsSync(umdPath)) {
  console.error("MISSING:", umdPath);
  process.exit(2);
}
const code = fs.readFileSync(umdPath, "utf8");

// The UMD prelude is the canonical
//   (function(E,v){
//     typeof exports==="object" && typeof module<"u"   // -> CJS branch (calls require)
//       ? v(exports, require("react"), require("react-dom"))
//       : typeof define==="function" && define.amd
//         ? define(["exports","react","react-dom"], v)
//         : (E = globalThis ?? E ?? self, v(E.LivKit = {}, E.React, E.ReactDOM));
//   })(this, function(E, v, Ge){ ... });
//
// To exercise the UMD-global branch (which is what a real browser hits), we
// must NOT expose `module` / `exports` to the sandbox. Instead we set up
// `globalThis` / `window` / `self` with React + ReactDOM globals.
const sandbox = { console };
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.React = React;
sandbox.ReactDOM = ReactDOM;
sandbox.window.React = React;
sandbox.window.ReactDOM = ReactDOM;

vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: "livkit.umd.js" });
} catch (err) {
  console.error("UMD execution threw:", err && err.stack ? err.stack : err);
  process.exit(3);
}

const LK = sandbox.window.LivKit || sandbox.LivKit;

if (!LK || typeof LK !== "object") {
  console.error("LivKit global not found after UMD execution.");
  console.error("  sandbox keys:", Object.keys(sandbox).slice(0, 40));
  process.exit(4);
}

const requiredComponents = [
  "Button",
  "Card",
  "Pill",
  "Input",
  "PasswordInput",
  "Stepper",
  "CommandBox",
  "Modal",
  "NavBar",
  "ThemeToggle",
  "ToastProvider",
];

const requiredFns = ["useToast", "cn", "applyLivTheme", "readLivTheme"];

const requiredValues = [
  "LIV_THEME_STORAGE_KEY",
  "LIV_THEMES",
  "__ui_kit_version__",
];

const failures = [];

for (const name of requiredComponents) {
  const v = LK[name];
  const t = typeof v;
  // React components are functions; forwardRef/memo-wrapped components are objects with $$typeof.
  if (t !== "function" && t !== "object") {
    failures.push(`${name}: expected component (function/object), got ${t}`);
  } else if (t === "object" && v === null) {
    failures.push(`${name}: expected component, got null`);
  }
}

for (const name of requiredFns) {
  if (typeof LK[name] !== "function") {
    failures.push(`${name}: expected function, got ${typeof LK[name]}`);
  }
}

for (const name of requiredValues) {
  if (LK[name] === undefined) {
    failures.push(`${name}: expected defined value, got undefined`);
  }
}

if (failures.length > 0) {
  console.error("UMD shape verification FAILED:");
  for (const f of failures) console.error("  -", f);
  process.exit(5);
}

const total =
  requiredComponents.length + requiredFns.length + requiredValues.length;

console.log(
  "PASS: " + total + " exports verified from window.LivKit (" + umdPath + ")",
);
console.log("  components (" + requiredComponents.length + "):");
console.log("    " + requiredComponents.join(", "));
console.log("  functions  (" + requiredFns.length + "):");
console.log("    " + requiredFns.join(", "));
console.log("  values     (" + requiredValues.length + "):");
console.log("    " + requiredValues.join(", "));
console.log("  __ui_kit_version__: " + LK.__ui_kit_version__);
