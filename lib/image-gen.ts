/**
 * AI scene-image generation (TODO.MD #9.1/#9.2/#9.3).
 *
 * A new `generateImage` tool the model can call for major scene/character
 * moments. It POSTs to a user-configured, OpenAI-compatible images endpoint
 * (default `…/v1/images/generations`) and normalizes the response (a `url`
 * from most providers, or a `b64_json` from OpenAI / local models) into a
 * single `src` the renderer can use directly.
 *
 * The pure helpers here are unit-tested in lib/image-gen.test.ts; `generateImage`
 * takes an injectable `fetch` so the request shape, the size default, the parse
 * paths, and the error paths are all exercised without a network.
 */

export const IMAGE_TOOL_NAME = "generateImage"

/** 720p (1280×720) — landscape, matches the bubble's aspect, predictable size. */
export const DEFAULT_IMAGE_SIZE = "1280x720"

/** Rate-limit window in MESSAGES (owner D3: default 20, range 1–1000). */
export const DEFAULT_IMAGE_RATE = 20
export const MIN_IMAGE_RATE = 1
export const MAX_IMAGE_RATE = 1000

export function clampImageRate(value: number): number {
  const n = Number.isFinite(value) ? Math.floor(value) : DEFAULT_IMAGE_RATE
  return Math.min(MAX_IMAGE_RATE, Math.max(MIN_IMAGE_RATE, n))
}

/**
 * The OpenAI-compatible function schema advertised to the model when the feature
 * is enabled. Kept at module scope so its identity is stable across renders (same
 * pattern as CHARACTER_SHEET_TOOL and campaignCheckpointTools).
 */
export const imageTool = {
  type: "function",
  function: {
    name: IMAGE_TOOL_NAME,
    description:
      "Generate an image to set the scene or depict a key character, location, or moment. " +
      "Use sparingly — only for major scene or character introductions — and rely on your " +
      "written narration for everything else. Give a single concise visual description and " +
      "short alt text. The image is shown to the player in the chat; do not re-describe it " +
      "in detail if it is shown.",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "A concise visual description of the scene, character, or moment to depict (subject, setting, mood).",
        },
        alt: {
          type: "string",
          description:
            "Short alt text for accessibility; shown in place of the image if it is unavailable.",
        },
      },
      required: ["prompt"],
    },
  },
}

/** What generateImage returns: a usable image source. */
export interface GeneratedImage {
  /** Data URL (from b64_json) or an http(s) URL (from url). */
  src: string
  mime?: string
}

/** Injectable fetch for tests; defaults to the global fetch. */
export type ImageFetch = (url: string, init: RequestInit) => Promise<Response>

export interface ImageGenConfig {
  apiUrl: string
  apiKey?: string
  /** Optional image model (owner D4). Omitted from the request when blank. */
  model?: string
  /** Requested render size (default DEFAULT_IMAGE_SIZE = 720p). */
  size?: string
  signal?: AbortSignal
}

/**
 * Parse an OpenAI-compatible `/images` response into a source. Accepts
 * `data[0].url` (most providers) or `data[0].b64_json` (OpenAI / local models);
 * returns null when neither is usable so the caller falls back to a text narration.
 */
export function parseImageResponse(body: unknown): GeneratedImage | null {
  if (typeof body !== "object" || body === null) return null
  const record = body as Record<string, unknown>
  const data = Array.isArray(record.data) ? record.data[0] : undefined
  if (typeof data !== "object" || data === null) return null
  const item = data as Record<string, unknown>
  if (typeof item.url === "string" && item.url.length > 0) {
    return { src: item.url, mime: typeof item.mime_type === "string" ? item.mime_type : undefined }
  }
  if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
    const mime = typeof item.mime_type === "string" ? item.mime_type : "image/png"
    return { src: `data:${mime};base64,${item.b64_json}` }
  }
  return null
}

/**
 * Generate one image at the configured endpoint. Throws on a non-2xx response or
 * an unparseable body — the caller catches it and asks the model to describe the
 * scene in words instead. `fetchImpl` is injectable for tests.
 */
export async function generateImage(
  config: ImageGenConfig,
  prompt: string,
  fetchImpl: ImageFetch = (url, init) => fetch(url, init),
): Promise<GeneratedImage> {
  const body: Record<string, unknown> = {
    prompt,
    size: config.size && config.size.length > 0 ? config.size : DEFAULT_IMAGE_SIZE,
  }
  if (config.model && config.model.length > 0) body.model = config.model

  const response = await fetchImpl(config.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey && config.apiKey.length > 0 ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
    signal: config.signal,
  })
  if (!response.ok) throw new Error(`Image API error: ${response.status}`)
  const parsed = parseImageResponse(await response.json())
  if (!parsed) throw new Error("Image API returned no image")
  return parsed
}

/**
 * Message-count rate limiter (owner D3). Allows one image generation per
 * `windowMessages` messages of conversation; `mark` records the message count at
 * which an image was produced. Pure + injectable state so it is unit-tested.
 */
export interface ImageRateLimiter {
  /** Whether an image is allowed given the current message count in the conversation. */
  can(currentMessageCount: number): boolean
  /** Record that an image was generated at this message count. */
  mark(currentMessageCount: number): void
  /** Forget the last timestamp (used when the window or the chat is cleared). */
  reset(): void
}

export function createImageRateLimiter(windowMessages: number): ImageRateLimiter {
  const window = clampImageRate(windowMessages)
  let last = -Infinity
  return {
    can: (currentMessageCount) => currentMessageCount - last >= window,
    mark: (currentMessageCount) => {
      last = currentMessageCount
    },
    reset: () => {
      last = -Infinity
    },
  }
}
