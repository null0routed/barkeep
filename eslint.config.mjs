import nextConfig from "eslint-config-next/core-web-vitals"

// Flat config (ESLint 9+), replacing .eslintrc.json whose only content was
// "extends": "next/core-web-vitals". Next 16 removed `next lint` and
// build-time linting — the lint script runs the ESLint CLI directly
// (package.json "lint": "eslint .").
/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".next/**", "out/**", "node_modules/**"],
  },
  {
    // eslint-config-next 16 turns on the new, opinionated
    // react-hooks/set-state-in-effect rule. Every one of its findings here is an
    // intentional synchronous sync that the static-export architecture (output:
    // export pre-renders client components, so browser APIs must not be touched
    // during render) actually requires:
    //   app/page.tsx        — localStorage hydration (panel split, mounted flag,
    //                         bulk character/chat/config load)
    //   components/add-spell-dialog.tsx  — form reset when the dialog opens
    //   components/pwa-installer.tsx     — standalone display-mode check at mount
    // (owner decision 2026-10-30, Phase E3a)
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]

export default eslintConfig
