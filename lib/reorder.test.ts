import assert from "node:assert/strict"
import { test } from "node:test"

import { dropInsertIndex, moveItem, swapSpellNeighbors } from "./reorder"
import type { Spell } from "./types"

test("moveItem: moves an item up and down (splice semantics)", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"])
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"])
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 3), ["b", "c", "d", "a"])
})

test("moveItem: same index returns the SAME array instance; input is never mutated", () => {
  const original = ["a", "b"]
  assert.equal(moveItem(original, 0, 0), original)
  assert.equal(moveItem(original, 1, 1), original)

  const moved = moveItem(original, 0, 1)
  assert.notEqual(moved, original)
  assert.deepEqual(original, ["a", "b"])
})

test("moveItem: empty and single-item arrays are inert", () => {
  assert.deepEqual(moveItem([], 0, 5), [])
  const single = ["a"]
  assert.equal(moveItem(single, 0, 7), single)
})

test("moveItem: out-of-range indices clamp to the ends", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 99, 0), ["c", "a", "b"]) // from clamps to 2 → c goes first
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 99), ["b", "c", "a"]) // to clamps to 2 → a goes last
})

test("dropInsertIndex: before/after survive the slot collapse", () => {
  // source before target
  assert.equal(dropInsertIndex(0, 2, "before"), 1) // [A,x,B] -> insert A at 1 -> [x,A,B]
  assert.equal(dropInsertIndex(0, 2, "after"), 2) //  [A,x,B] -> insert A at 2 -> [x,B,A]
  // source after target
  assert.equal(dropInsertIndex(2, 0, "before"), 0) // [A,x,B] -> insert B at 0 -> [B,A,x]
  assert.equal(dropInsertIndex(2, 0, "after"), 1) //  [A,x,B] -> insert B at 1 -> [A,B,x]
  // adjacent rows: the drop is a no-op, which the clamped insert expresses
  assert.equal(dropInsertIndex(0, 1, "before"), 0) // [A,B] -> before B = same order
  assert.equal(dropInsertIndex(1, 0, "after"), 1) //  [A,B] -> after A = same order
})

function spell(name: string, level: number): Spell {
  return {
    id: name.toLowerCase(),
    name,
    description: "",
    level,
    school: "evocation",
    range: "",
    duration: "",
    castingTime: "",
    verbal: false,
    somatic: false,
    material: false,
    materialComponents: "",
    prepared: false,
  }
}

test("swapSpellNeighbors: swaps within the level group only", () => {
  const spells = [spell("Prestidigitation", 0), spell("Mage Hand", 0), spell("Fire Bolt", 1)]

  // down from the first cantrip -> swaps with the second cantrip, NOT Fire Bolt
  const down = swapSpellNeighbors(spells, "prestidigitation", "down")
  assert.ok(down)
  assert.deepEqual(down.map((s) => s.name), ["Mage Hand", "Prestidigitation", "Fire Bolt"])

  // up from the (now second) cantrip — Prestidigitation — goes back to the top of the group
  const up = swapSpellNeighbors(down, "prestidigitation", "up")
  assert.ok(up)
  assert.deepEqual(up.map((s) => s.name), ["Prestidigitation", "Mage Hand", "Fire Bolt"])

  // Fire Bolt is alone at level 1: both edges are null
  assert.equal(swapSpellNeighbors(spells, "fire bolt", "up"), null)
  assert.equal(swapSpellNeighbors(spells, "fire bolt", "down"), null)
})

test("swapSpellNeighbors: skips other-level spells to find the nearest same-level neighbor", () => {
  // global order interleaves levels: 1st-level Shield, cantrip Guidance, 1st-level Magic Missile
  const spells = [spell("Shield", 1), spell("Guidance", 0), spell("Magic Missile", 1)]

  // Magic Missile's up-neighbor is Shield (Guidance skipped — different level)
  const moved = swapSpellNeighbors(spells, "magic missile", "up")
  assert.ok(moved)
  assert.deepEqual(moved.map((s) => s.name), ["Magic Missile", "Shield", "Guidance"])

  // Shield's down-neighbor is Magic Missile (Guidance skipped)
  const back = swapSpellNeighbors(spells, "shield", "down")
  assert.ok(back)
  assert.deepEqual(back.map((s) => s.name), ["Guidance", "Magic Missile", "Shield"])

  // Guidance has no same-level neighbor at all — both arrows disabled
  assert.equal(swapSpellNeighbors(spells, "guidance", "up"), null)
  assert.equal(swapSpellNeighbors(spells, "guidance", "down"), null)
})

test("swapSpellNeighbors: unknown ids and empty lists are null", () => {
  assert.equal(swapSpellNeighbors([], "nothing", "up"), null)
  assert.equal(swapSpellNeighbors([spell("Shield", 1)], "nope", "down"), null)
})
