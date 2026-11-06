import test from "node:test"
import assert from "node:assert/strict"

import {
  hasIdb,
  estimateImageBytes,
  isOverImageCap,
  putImage,
  getImage,
  deleteImage,
  clearImages,
  imageStoreFootprint,
  MAX_IMAGE_BYTES,
  type StoredImage,
} from "./image-store"

// Node has no IndexedDB, so these tests lock down the graceful-degradation
// contract (every op resolves to a clean { ok:false, reason:"no-idb" } instead of
// throwing) and the pure sizing helpers. The real put/get round-trip runs only in
// a browser, covered manually (see the TODO.MD #9 plan).
const image: StoredImage = { id: "img-1", alt: "A candlelit tavern", src: "data:image/png;base64,QUJD" }

test("hasIdb is false in Node (no indexedDB global)", () => {
  assert.equal(hasIdb(), false)
})

test("estimateImageBytes: data URL is ~3/4 of its string length", () => {
  // "data:image/png;base64," is 21 chars; the body here adds 3 more.
  const bytes = estimateImageBytes(image.src)
  assert.ok(bytes > 0)
  assert.equal(bytes, Math.floor((image.src.length * 3) / 4))
})

test("estimateImageBytes: a plain URL is counted as its string length", () => {
  const url = "https://images.example/scene.png"
  assert.equal(estimateImageBytes(url), url.length)
})

test("isOverImageCap: small payloads pass, huge data URLs are capped", () => {
  assert.equal(isOverImageCap("https://images.example/scene.png"), false)
  // A data URL long enough to exceed MAX_IMAGE_BYTES of estimated bytes.
  const huge = "data:image/png;base64," + "A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 10)
  assert.equal(isOverImageCap(huge), true)
})

test("putImage reports a clean no-idb result in Node", async () => {
  const result = await putImage(image)
  assert.equal(result.ok, false)
  assert.equal(result.reason, "no-idb")
})

test("getImage reports a clean no-idb result in Node", async () => {
  const result = await getImage("img-1")
  assert.equal(result.ok, false)
  assert.equal(result.reason, "no-idb")
})

test("deleteImage and clearImages report a clean no-idb result in Node", async () => {
  assert.equal((await deleteImage("img-1")).reason, "no-idb")
  assert.equal((await clearImages()).reason, "no-idb")
})

test("imageStoreFootprint reports a clean no-idb result in Node", async () => {
  const result = await imageStoreFootprint()
  assert.equal(result.ok, false)
  assert.equal(result.reason, "no-idb")
})
