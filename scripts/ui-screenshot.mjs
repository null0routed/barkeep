#!/usr/bin/env node
// Take a quick UI screenshot of the built app (visual checks without opening a browser).
//
//   node scripts/ui-screenshot.mjs [scenario] [outfile.png]
//
// Scenarios:
//   full            whole app shell (character sheet + DM Chat)
//   full-light      ditto, forced light theme
//   settings        with the Chat Settings dialog open
//   settings-light  ditto, forced light theme
//   instructions    first-visit instructions modal (DM Chat tab)
//   sheet-full      seeded character, full sheet (Inventory tab visible — item markdown)
//   sheet-traits    ditto, Traits tab (trait markdown)
//   sheet-spells    ditto, Spells tab (spell markdown)
//   sheet-expanded  ditto, Combat Stats + Spell Slots cards expanded (Speed + Spellcasting)
//   dialog-trait    Add Trait dialog open with a name typed (Generate Details visible)
//   checkpoint-badge  a turn that saved a checkpoint — shield badge clicked, popover open
//
// The sheet-* scenarios seed a `dnd-character` localStorage save with markdown
// descriptions (bold/italic/newlines) so the TODO.MD #13 tab rendering is visible.
//
// Serves the `out/` build on :4173 (run `npm run build` first) or reuses a
// server already running there.
import { spawn } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import { chromium } from "playwright"

const scenario = process.argv[2] ?? "full"
const out = process.argv[3] ?? `barkeep-${scenario}.png`
const BASE = "http://localhost:4173"
const known = [
  "full",
  "settings",
  "settings-light",
  "full-light",
  "instructions",
  "sheet-full",
  "sheet-traits",
  "sheet-spells",
  "sheet-expanded",
  "dialog-trait",
  "checkpoint-badge",
]
if (!known.includes(scenario)) {
  console.error(`Unknown scenario "${scenario}". Try: ${known.join(" | ")}`)
  process.exit(1)
}

// A level-3 rogue with markdown in every description the tabs render (TODO.MD #13),
// plus the #14 fields (speed, spell attack/save DC) set to visible values.
const seedCharacter = {
  name: "Renna Vex",
  class: "Rogue",
  race: "Half-elf",
  level: "3",
  background: "Criminal",
  stats: { strength: 10, dexterity: 16, constitution: 12, intelligence: 12, wisdom: 14, charisma: 10 },
  combatStats: { armorClass: 15, currentHp: 22, maxHp: 28, speed: 45 },
  savingThrows: {
    strength: false,
    dexterity: true,
    constitution: false,
    intelligence: false,
    wisdom: false,
    charisma: false,
  },
  skills: [
    { name: "Acrobatics", ability: "dexterity", proficient: false, expertise: false },
    { name: "Animal Handling", ability: "wisdom", proficient: false, expertise: false },
    { name: "Arcana", ability: "intelligence", proficient: false, expertise: false },
    { name: "Athletics", ability: "strength", proficient: false, expertise: false },
    { name: "Deception", ability: "charisma", proficient: false, expertise: false },
    { name: "History", ability: "intelligence", proficient: false, expertise: false },
    { name: "Insight", ability: "wisdom", proficient: false, expertise: false },
    { name: "Intimidation", ability: "charisma", proficient: false, expertise: false },
    { name: "Investigation", ability: "intelligence", proficient: false, expertise: false },
    { name: "Medicine", ability: "wisdom", proficient: false, expertise: false },
    { name: "Nature", ability: "intelligence", proficient: false, expertise: false },
    { name: "Perception", ability: "wisdom", proficient: true, expertise: true },
    { name: "Performance", ability: "charisma", proficient: false, expertise: false },
    { name: "Persuasion", ability: "charisma", proficient: false, expertise: false },
    { name: "Religion", ability: "intelligence", proficient: false, expertise: false },
    { name: "Sleight of Hand", ability: "dexterity", proficient: true, expertise: false },
    { name: "Stealth", ability: "dexterity", proficient: true, expertise: true },
    { name: "Survival", ability: "wisdom", proficient: false, expertise: false },
  ],
  inventory: [
    {
      name: "Sword of the Fox",
      description: [
        "**Bladesong** — the steel hums in the fox's borrowed voice.",
        "",
        "A *silver cord* binds the grip, and it **glows** faintly in the dark.",
      ].join("\n"),
      quantity: 1,
      rarity: "rare",
    },
    {
      name: "Tavern Tokens",
      description: "Three **copper** tokens, worn smooth in the thumb.",
      quantity: 3,
      rarity: "common",
    },
  ],
  equipment: [
    {
      name: "Patched Leather Armor",
      description: "Patched where a *goblin* bit it during a fight over **last call**.",
      equipped: true,
      rarity: "common",
    },
  ],
  proficiencies: [{ id: "p1", name: "Forged Tengu", type: "other" }],
  traits: [
    {
      id: "t1",
      name: "Expertise",
      description: [
        "You have **advantage** on any Ability Check that uses an ability score on which you have expertise.",
        "",
        "*Renna's:* Stealth (Dex) and Perception (Wis).",
      ].join("\n"),
      source: "Rogue, Class Feature",
    },
  ],
  feats: [
    { id: "f1", name: "Lucky", description: "You have **one luck point** per long rest." },
  ],
  spells: [
    {
      id: "s1",
      name: "Faerie Fire",
      description: [
        "Each creature in the area is **outlined** in bismuth light.",
        "",
        "It cannot take *hidden* cover while so outlined.",
      ].join("\n"),
      level: 1,
      school: "evocation",
      range: "60 feet",
      duration: "1 minute",
      castingTime: "1 action",
      verbal: true,
      somatic: true,
      material: false,
      materialComponents: "",
      prepared: true,
    },
  ],
  spellSlots: {
    cantrips: { known: 0 },
    level1: { total: 2, used: [false, false], known: 2 },
    level2: { total: 0, used: [], known: 0 },
    level3: { total: 0, used: [], known: 0 },
    level4: { total: 0, used: [], known: 0 },
    level5: { total: 0, used: [], known: 0 },
    level6: { total: 0, used: [], known: 0 },
    level7: { total: 0, used: [], known: 0 },
    level8: { total: 0, used: [], known: 0 },
    level9: { total: 0, used: [], known: 0 },
  },
  spellcasting: { spellAttack: 5, spellSaveDc: 13 },
}
const sheetScenarios = ["sheet-full", "sheet-traits", "sheet-spells", "sheet-expanded"]

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
  // Sheet scenarios: seed the character save BEFORE first render so the load
  // path (incl. the #14 sanitize merge) runs on this data.
  if (sheetScenarios.includes(scenario)) {
    await context.addInitScript((seed) => localStorage.setItem("dnd-character", JSON.stringify(seed)), seedCharacter)
  }
  // checkpoint-badge: a saved checkpoint in the store + a chat turn that references it
  if (scenario === "checkpoint-badge") {
    await context.addInitScript(() => {
      const checkpoint = {
        id: "cp-1",
        createdAt: "2026-11-07T12:00:00.000Z",
        title: "Lighthouse Approach",
        summary: "The party reached the lighthouse at low tide. The Tollkeeper's key has seven teeth; the door is open.",
      }
      localStorage.setItem("dnd-campaign-checkpoints", JSON.stringify([checkpoint]))
      localStorage.setItem("dnd-chat", JSON.stringify([
        { id: "m1", role: "user", content: "Save a checkpoint and wrap up the scene." },
        {
          id: "m2",
          role: "assistant",
          content:
            "The bell has stopped. The lantern is swinging on the gallery rail. The figure on the rocks is not turning.\n\nThe tide is coming in. What do you do?",
          checkpointsSaved: [{ id: "cp-1", title: "Lighthouse Approach", createdAt: "2026-11-07T12:00:00.000Z" }],
          stats: { promptTokens: 4210, completionTokens: 318, totalTokens: 4528, contextMessages: 12, elapsedMs: 9240, tokensPerSecond: 34.4 },
        },
      ]))
    })
  }

  const page = await context.newPage()
  await page.goto(BASE + "/", { waitUntil: "networkidle" })

  if (scenario === "settings" || scenario === "settings-light") {
    await page.getByRole("button", { name: "Chat settings" }).click()
    await page.getByRole("dialog").getByText("Auto-compact context").waitFor()
  }
  if (scenario === "instructions") {
    await page.getByRole("dialog").getByRole("tab", { name: "DM Chat" }).click()
  }
  if (scenario === "sheet-traits") {
    await page.getByRole("tab", { name: "Traits" }).click()
    await page.getByText("Rogue, Class Feature").waitFor()
  }
  if (scenario === "sheet-spells") {
    await page.getByRole("tab", { name: "Spells" }).click()
    await page.getByText("outlined", { exact: false }).first().waitFor()
  }
  if (scenario === "sheet-expanded") {
    await page.getByRole("button", { name: "Expand combat stats" }).click()
    await page.getByRole("button", { name: "Expand spell slots" }).click()
    await page.getByLabel("Speed (ft)").waitFor()
    await page.getByLabel("Spell Save DC:").waitFor()
  }
  if (scenario === "dialog-trait") {
    await page.getByRole("tab", { name: "Traits" }).click()
    await page.getByRole("button", { name: "Add Trait" }).click()
    await page.getByRole("dialog").getByLabel("Name").fill("Fox Cunning")
    await page.getByRole("button", { name: "Generate Details" }).waitFor()
  }
  if (scenario === "checkpoint-badge") {
    await page.getByRole("button", { name: "View saved checkpoint" }).click()
    await page.getByRole("group", { name: "Saved checkpoints" }).getByText("Checkpoint saved").waitFor()
  }

  await page.screenshot({ path: out, fullPage: sheetScenarios.includes(scenario) })
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
