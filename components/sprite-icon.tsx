import type React from "react"

/**
 * A decorative sprite from the owner's sheet (public/sprites.css), sized for
 * inline button/icon use. `name` is the sprite name without the `spr-` prefix
 * (e.g. "action-trash" → .spr-action-trash). The sheet sprites carry a
 * baked-in dark tile background, so they read as small dark fittings either
 * theme — that is the look the owner chose for these placements.
 *
 * Sizing: native cells are large (94–178px), so `s` is the scale factor
 * (CSS `--s`): e.g. `s={0.16}` on a 100px sprite ≈ 16px. Decorative only —
 * the host button keeps its title/aria-label.
 *
 * `glow` (default on) applies the compact halo from `.spr-glow-sm`
 * (globals.css) so the icon's extent reads against either theme's backdrop —
 * pass `glow={false}` for a placement where you don't want it.
 * `imageRendering: pixelated` keeps the pixel art crisp at non-integer
 * down-scaling (e.g. 100px native → 24px render).
 */
export default function SpriteIcon({
  name,
  s,
  className = "",
  glow = true,
}: {
  name: string
  s: number
  className?: string
  glow?: boolean
}) {
  const style = { "--s": s, imageRendering: "pixelated" } as React.CSSProperties
  const cls = `spr spr-${name}${glow ? " spr-glow-sm" : ""}${className ? " " + className : ""}`
  return <span aria-hidden className={cls} style={style} />
}
