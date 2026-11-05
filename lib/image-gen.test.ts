import test from "node:test"
import assert from "node:assert/strict"

import {
  imageTool,
  parseImageResponse,
  generateImage,
  clampImageRate,
  createImageRateLimiter,
  DEFAULT_IMAGE_SIZE,
  IMAGE_TOOL_NAME,
} from "./image-gen"

// A minimal Response stand-in (ok/status/json) so we don't depend on the global
// fetch/Response, and a fake fetch that captures the call and returns a canned body.
function fakeResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}
type Captured = { url: string; init: any }
function makeFetch(body: unknown, status = 200) {
  const calls: Captured[] = []
  const fn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init })
    return fakeResponse(body, status)
  }
  return { fn, calls }
}

test("imageTool is a valid OpenAI function schema with a required prompt", () => {
  assert.equal(imageTool.type, "function")
  assert.equal(imageTool.function.name, IMAGE_TOOL_NAME)
  const params = imageTool.function.parameters
  assert.equal(params.type, "object")
  assert.ok("prompt" in params.properties)
  assert.deepEqual(params.required, ["prompt"])
})

test("parseImageResponse: a url response is used verbatim", () => {
  const result = parseImageResponse({ data: [{ url: "https://img.example/a.png", mime_type: "image/png" }] })
  assert.deepEqual(result, { src: "https://img.example/a.png", mime: "image/png" })
})

test("parseImageResponse: a b64_json response becomes a data URL", () => {
  const result = parseImageResponse({ data: [{ b64_json: "QUJD", mime_type: "image/jpeg" }] })
  assert.equal(result?.src, "data:image/jpeg;base64,QUJD")
})

test("parseImageResponse: url wins over b64_json when both are present", () => {
  const result = parseImageResponse({ data: [{ url: "https://img.example/a.png", b64_json: "QUJD" }] })
  assert.equal(result?.src, "https://img.example/a.png")
})

test("parseImageResponse: null/absent/empty payloads return null", () => {
  assert.equal(parseImageResponse(null), null)
  assert.equal(parseImageResponse({}), null)
  assert.equal(parseImageResponse({ data: [] }), null)
  assert.equal(parseImageResponse({ data: [{ url: "" }] }), null)
})

test("generateImage: sends the default 720p size and parses a url response", async () => {
  const { fn, calls } = makeFetch({ data: [{ url: "https://img.example/a.png" }] })
  const gen = await generateImage({ apiUrl: "https://api.example/v1/images/generations", apiKey: "k" }, "a tavern", fn)
  assert.equal(gen.src, "https://img.example/a.png")
  const init = JSON.parse(calls[0].init.body)
  assert.equal(init.size, DEFAULT_IMAGE_SIZE)
  assert.equal(init.model, undefined) // no model configured
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers.Authorization, "Bearer k")
})

test("generateImage: includes the model when set", async () => {
  const { fn, calls } = makeFetch({ data: [{ b64_json: "QUJD" }] })
  await generateImage({ apiUrl: "https://api.example/img", model: "flux-1" }, "a forest", fn)
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, "flux-1")
})

test("generateImage: a non-2xx response throws", async () => {
  const { fn } = makeFetch({ error: "bad" }, 400)
  await assert.rejects(() => generateImage({ apiUrl: "https://api.example/img" }, "x", fn), /Image API error: 400/)
})

test("generateImage: a body with no usable image throws", async () => {
  const { fn } = makeFetch({ data: [] })
  await assert.rejects(() => generateImage({ apiUrl: "https://api.example/img" }, "x", fn), /no image/)
})

test("clampImageRate bounds values to the 1..1000 range", () => {
  assert.equal(clampImageRate(20), 20)
  assert.equal(clampImageRate(0), 1)
  assert.equal(clampImageRate(-5), 1)
  assert.equal(clampImageRate(9999), 1000)
  assert.equal(clampImageRate(Number.NaN), 20) // falls back to the default
})

test("createImageRateLimiter: first generation is allowed, then gated by the window", () => {
  const limiter = createImageRateLimiter(20)
  assert.equal(limiter.can(5), true)
  limiter.mark(5)
  // Within the 20-message window of the last image → blocked.
  assert.equal(limiter.can(20), false)
  // Once 20 more messages pass → allowed again.
  assert.equal(limiter.can(25), true)
})

test("createImageRateLimiter: reset allows an immediate image", () => {
  const limiter = createImageRateLimiter(20)
  limiter.mark(100)
  assert.equal(limiter.can(100), false)
  limiter.reset()
  assert.equal(limiter.can(100), true)
})
