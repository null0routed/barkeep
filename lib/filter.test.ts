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

test("filterItems: items without a description never crash and just don't match", () => {
  const noDesc: Array<FilterableItem> = [
    { name: "Dagger" },
    { name: "Oil" },
  ]
  assert.deepEqual(filterItems(noDesc, "smells"), [])
  assert.deepEqual(filterItems(noDesc, "dag").map((i) => i.name), ["Dagger"])
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
