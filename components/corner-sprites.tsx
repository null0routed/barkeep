/**
 * Forged-plate corners for the .corner-plate surfaces (Card, Dialog).
 *
 * One sprite — .spr-corner-thin-tl, the owner's preferred corner — rotated into
 * all four corners; deliberately NOT mirrored and NOT swapped for the -tr art
 * (owner direction). The sprite cell is square (131×131 native), so each
 * rotation about its center keeps it flush in its corner. Scale + rotations
 * live in globals.css scoped to `.corner-plate .spr-corner*`; the placement
 * classes come from public/sprites.css.
 */
export default function CornerSprites() {
  return (
    <>
      <span aria-hidden className="spr spr-corner-thin-tl spr-corner spr-corner-tl" />
      <span aria-hidden className="spr spr-corner-thin-tl spr-corner spr-corner-tr" />
      <span aria-hidden className="spr spr-corner-thin-tl spr-corner spr-corner-br" />
      <span aria-hidden className="spr spr-corner-thin-tl spr-corner spr-corner-bl" />
    </>
  )
}
