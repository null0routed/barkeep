#!/usr/bin/env node
// Take a quick UI screenshot of the built app (visual checks without opening a browser).
//
//   node scripts/ui-screenshot.mjs [scenario] [outfile.png]
//
// Scenarios:
//   full            whole app shell (character sheet + DM Chat)
//   settings        with the Chat Settings dialog open
//   settings-light  ditto, forced light theme
//   instructions    first-visit instructions modal (DM Chat tab)
//
// Serves the `out/` build on :4173 (run `npm run build` first) or reuses a
// server already running there.
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { chromium } from "playwright"

const scenario = process.argv[2] ?? "full"
const out = process.argv[3] ?? `barkeep-${scenario}.png`
const BASE = "http://localhost:4173"
const known = ["full", "settings", "settings-light", "full-light", "instructions"]
if (!known.includes(scenario)) {
  console.error(`Unknown scenario "${scenario}". Try: ${known.join(" | ")}`)
  process.exit(1)
}

async function serverUp() {
  try {
    return (await fetch(BASE, { method: "HEAD" })).ok
  } catch {
    return false
  }
}

let server
if (!(await serverUp())) {
  server = spawn("npx", ["serve", "out", "-l", "4173"], { stdio: "ignore", detached: true })
  for (let i = 0; i < 60 && !(await serverUp()); i++) await sleep(250)
  if (!(await serverUp())) throw new Error("could not serve out/ on :4173 — run `npm run build` first")
}

const browser = await chromium.launch()
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // Skip the first-visit instructions modal unless the scenario wants it.
  if (scenario !== "instructions")
    await context.addInitScript(() => localStorage.setItem("barkeep-visited", "true"))
  if (scenario.endsWith("-light")) await context.addInitScript(() => localStorage.setItem("theme", "light"))

  const page = await context.newPage()
  await page.goto(BASE + "/", { waitUntil: "networkidle" })

  if (scenario === "settings" || scenario === "settings-light") {
    await page.getByRole("button", { name: "Chat settings" }).click()
    await page.getByRole("dialog").getByText("Auto-compact context").waitFor()
  }
  if (scenario === "instructions") {
    await page.getByRole("dialog").getByRole("tab", { name: "DM Chat" }).click()
  }

  await page.screenshot({ path: out })
  console.log(`saved ${out}`)
} finally {
  await browser.close()
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM")
    } catch {
      server.kill("SIGTERM")
    }
  }
}
