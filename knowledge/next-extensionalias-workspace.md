---
name: next-extensionalias-workspace
description: apps/web/next.config.mjs needs transpilePackages:["@homework/shared"] + a webpack extensionAlias mapping .js→.ts/.tsx, because shared and web lib use NodeNext-style .js import specifiers that webpack won't otherwise resolve to TS source.
metadata:
  type: feedback
---

The web app (`apps/web/next.config.mjs`) must declare:
```js
transpilePackages: ["@homework/shared"],
webpack: (config) => {
  config.resolve.extensionAlias = {
    ".js": [".ts", ".tsx", ".js", ".jsx"],
    ".jsx": [".tsx", ".jsx"],
  };
  return config;
},
```

**Why:** `packages/shared` ships **TS source** (its `package.json` points `main`/`types` at
`src/index.ts`, no build step) and its barrel re-exports with **NodeNext `.js` extensions**
(`export * from "./attention-engine.js"`). Our own `apps/web/src/lib` + hooks do the same
(`from "./use-pref.js"`). `tsc` resolves these fine, but **Next's webpack does not** — it fails the
production build with `Module not found: Can't resolve './attention-engine.js'` /
`'./use-pref.js'` / `'./api.js'`. `transpilePackages` makes Next compile the workspace package;
`extensionAlias` maps the `.js` specifiers onto the actual `.ts`/`.tsx` files.

Symptom signature: `pnpm typecheck` is **green** but `pnpm --filter @homework/web build` fails with
`Module not found` on `.js` imports. (homecal/homenews avoid the alias only because their shared
barrels use extensionless imports; ours use `.js`, so we need it.)

**How to apply:** keep both keys in next.config. If a new workspace package is imported by the web,
add it to `transpilePackages`. Don't "fix" this by rewriting the `.js` specifiers — they're correct
NodeNext and the API/tests rely on them. Related: [[hono-route-conventions]].
