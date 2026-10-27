import assert from "node:assert/strict"
import { test } from "node:test"

import { extractItemFields } from "./item-generator"

// ---------------------------------------------------------------------------
// extractItemFields — model response is messy; the dialog needs flat fields
// ---------------------------------------------------------------------------

test("extractItemFields: a bare JSON object is extracted and normalized", () => {
  const out = extractItemFields(
    '{"name":"  Potion of Healing ","description":"Restores 2d4 + 2 HP when consumed.","rarity":"COMMON","quantity":2}',
  )
  assert.ok(out)
  assert.equal(out.name, "Potion of Healing")
  assert.equal(out.description, "Restores 2d4 + 2 HP when consumed.")
  assert.equal(out.rarity, "common")
  assert.equal(out.quantity, 2)
})

test("extractItemFields: ```json fences and surrounding prose are tolerated", () => {
  const out = extractItemFields(
    'Sure! Here is the item:\n```json\n{"name":"Rod of the Pact","description":"Binds a spirit to its bearer.","rarity":"rare","quantity":1}\n```\nLet me know if you need more!',
  )
  assert.ok(out)
  assert.equal(out.name, "Rod of the Pact")
  assert.equal(out.rarity, "rare")
  assert.equal(out.quantity, 1)
})

test("extractItemFields: legacy wrapper shapes ({loot:[…]}) and top-level arrays unwrap to the first item", () => {
  const wrapped = extractItemFields('{"loot":[{"name":"Bag of Holding","description":"More inside.","rarity":"legendary","quantity":"3"}]}')
  assert.ok(wrapped)
  assert.equal(wrapped.name, "Bag of Holding")
  assert.equal(wrapped.quantity, 3) // numeric string coerced

  const array = extractItemFields('[{"name":"Coin of the Realm","description":"Legal tender in Tethyr.","rarity":"uncommon"}]')
  assert.ok(array)
  assert.equal(array.name, "Coin of the Realm")
})

test("extractItemFields: braces inside string literals do not break the scan", () => {
  const out = extractItemFields(
    '{"name":"Quilled Hat","description":"It is \\"suspiciously\\" {well} tailored, in fact.","rarity":"uncommon","quantity":1}',
  )
  assert.ok(out)
  assert.equal(out.name, "Quilled Hat")
  assert.equal(out.rarity, "uncommon")
})

test("extractItemFields: quantity must be a positive whole number — junk is dropped", () => {
  assert.equal(extractItemFields('{"name":"Coin","description":"d","quantity":0}')?.quantity, undefined)
  assert.equal(extractItemFields('{"name":"Coin","description":"d","quantity":-4}')?.quantity, undefined)
  assert.equal(extractItemFields('{"name":"Coin","description":"d","quantity":"a few"}')?.quantity, undefined)
  assert.equal(extractItemFields('{"name":"Coin","description":"d"}')?.quantity, undefined)
  assert.equal(extractItemFields('{"name":"Coin","description":"d","quantity":2}')?.quantity, 2)
})

test("extractItemFields: unusable or absent content yields null", () => {
  assert.equal(extractItemFields(null), null)
  assert.equal(extractItemFields(42 as unknown), null)
  assert.equal(extractItemFields("no json here at all"), null)
  assert.equal(extractItemFields("```json\nnot json\n```"), null)
  assert.equal(extractItemFields('{"name":"   ","description":""}'), null) // usable fields only
  assert.equal(extractItemFields('{"loot":[]}'), null) // empty loot = nothing
  assert.equal(extractItemFields('{"loot":"not-an-object"}'), null)
  assert.equal(extractItemFields("{ this is not valid json }"), null)
})

test("extractItemFields: unknown fields are ignored, known fields survive", () => {
  const out = extractItemFields('{"name":"Lantern","description":"Glows.","type":"misc","rarity":"common","saves":"+2"}')
  assert.ok(out)
  assert.deepEqual(out, { name: "Lantern", description: "Glows.", rarity: "common" })
})
