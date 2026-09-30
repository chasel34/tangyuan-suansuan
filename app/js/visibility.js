// Conservative bounds: only reject a sprite when none of it can be visible.
// In rounded holes, use the central rectangle so corner pixels are never culled.
export function spriteVisible(x, y, radius, width, height, holes = []) {
  if (x + radius < 0 || y + radius < 0 || x - radius > width || y - radius > height) return false;
  for (const h of holes) {
    const inset = h.rad || 0;
    if (x - radius >= h.l + inset && x + radius <= h.r - inset &&
        y - radius >= h.t + inset && y + radius <= h.b - inset) return false;
  }
  return true;
}
