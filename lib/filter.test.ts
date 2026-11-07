import test from "node:test"
import assert from "node:assert/strict"

import { filterItems, itemMatches, type FilterableItem } from "./filter"

const items: Array<FilterableItem> = [
  { name: "Mithral Chainmail", description: "Light blue shimmering armor" },
  { name: "Silver Cord", description: "A fine cord, silver-plated" },
  { name: "Lantern", description: "Oiled; smells faintly of fish" },
  { name: "Potion of Healing", description: "Red, fizzy" },
]

test("filterItems: empty or whitespace-only query returns the same list reference", () => {
  assert.equal(filterItems(items, ""), items)
  assert.equal(filterItems(items, "   "), items)
})

test("filterItems: case-insensitive substring match on name, order preserved", () => {
  assert.deepEqual(filterItems(items, "mithral").map((i) => i.name), ["Mithral Chainmail"])
  assert.deepEqual(filterItems(items, "cord").map((i) => i.name), ["Silver Cord"])
  // substring anywhere: "ion" appears in "PoTion"
  assert.deepEqual(filterItems(items, "ion").map((i) => i.name), ["Potion of Healing"])
})

test("filterItems: matches name OR description (a single predictable pass)", () => {
  const gold = [
    { name: "Gold Ring", description: "A simple band" },
    { name: "Amulet", description: "Warm gold glow" },
  ]
  // "gold" hits the name of one AND the description of the other → both surface
  assert.deepEqual(filterItems(gold, "gold").map((i) => i.name), ["Gold Ring", "Amulet"])

  // description-only hits still resolve
  assert.deepEqual(filterItems(items, "fizzy").map((i) => i.name), ["Potion of Healing"])
  assert.deepEqual(filterItems(items, "fish").map((i) => i.name), ["Lantern"])
})

test("itemMatches: items without a description never crash and just don't match", () => {
  const noDesc: Array<FilterableItem> = [
    { name: "Dagger" },
    { name: "Oil" },
  ]
  assert.deepEqual(filterItems(noDesc, "smells"), [])
  assert.deepEqual(filterItems(noDesc, "dag").map((i) => i.name), ["Dagger"])
})

test("filterItems: rarity badges are searchable too (TODO.MD #15)", () => {
  const gear: Array<FilterableItem> = [
    { name: "Rustblight Blade", description: "Never stops humming", rarity: "legendary" },
    { name: "Iron Rations", description: "Stale", rarity: "common" },
    { name: "Wand of Minor Trickery", rarity: "rare" },
    { name: "Plain Dagger" },
  ]
  assert.deepEqual(filterItems(gear, "legendary").map((i) => i.name), ["Rustblight Blade"])
  // "rare" substring-hits the "rare" badge (and would hit "very rare") but not "legendary"
  assert.deepEqual(filterItems(gear, "rare").map((i) => i.name), ["Wand of Minor Trickery"])
  assert.deepEqual(filterItems(gear, "VERY RARE").map((i) => i.name), [])
  // items without a rarity field stay safe
  assert.deepEqual(filterItems(gear, "dagger").map((i) => i.name), ["Plain Dagger"])
})

test("filterItems: spell schools are searchable too (TODO.MD #15)", () => {
  const spells: Array<FilterableItem> = [
    { name: "Fireball", description: "A ball of fire", school: "evocation" },
    { name: "Misty Step", description: "You vanish", school: "conjuration" },
    { name: "Detect Magic", description: "You sense magic", school: "divination" },
    { name: "Cup of Warm Milk", description: "Cozy" },
  ]
  // name/description both miss — only the school field matches
  assert.deepEqual(filterItems(spells, "evocation").map((i) => i.name), ["Fireball"])
  // substring into the school: "conj" only hits conjuration
  assert.deepEqual(filterItems(spells, "conj").map((i) => i.name), ["Misty Step"])
  // case-insensitive, and entries without a school stay safe
  assert.deepEqual(filterItems(spells, "DIVINATION").map((i) => i.name), ["Detect Magic"])
  assert.deepEqual(filterItems(spells, "milk").map((i) => i.name), ["Cup of Warm Milk"])
})

test("filterItems: trims surrounding whitespace from the query", () => {
  assert.deepEqual(filterItems(items, "  lantern  ").map((i) => i.name), ["Lantern"])
})

test("itemMatches: empty query is true; name or description hit; no hit", () => {
  const item: FilterableItem = { name: "Silver Cord", description: "A fine cord" }
  assert.equal(itemMatches(item, "  "), true)
  assert.equal(itemMatches(item, "sil"), true) // name
  assert.equal(itemMatches(item, "FINE"), true) // description
  assert.equal(itemMatches(item, "bronze"), false)
})

test("filterItems: works on the real item shapes (name+description strings)", () => {
  const traits = [
    { id: "1", name: "Keen Eyes", description: "Darkvision 60 feet", source: "Variant elf" },
    { id: "2", name: "Fey Ancestry", description: "Advantage on charm", source: "Elf" },
  ]
  // "charm" lives only in a description
  assert.deepEqual(filterItems(traits, "charm").map((t) => t.id), ["2"])
  // "eye" (inside "Eyes") is a name match
  assert.deepEqual(filterItems(traits, "EYE").map((t) => t.id), ["1"])
})
