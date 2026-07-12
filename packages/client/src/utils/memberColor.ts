// Stable, scalable per-member color assignment.
//
// We spread hues using the GOLDEN ANGLE (137.50776°). This is the same trick
// matplotlib/d3 use to keep successive colors as far apart as possible on the
// color wheel. After we lap the wheel (~3 members), we step saturation up and
// lightness down ("lightness banding") so even a repeated hue is clearly a
// different shade.
//
// Crucially, a member's color is a PURE FUNCTION of their stable position in a
// *sorted* member-ID list, so it never changes between renders and never
// depends on API ordering. Pass the full member list once; get a lookup.

export interface MemberColor {
  /** raw hue, for debugging */
  hue: number;
  /** light tint — used as the badge background */
  bg: string;
  /** mid — used as the badge border + avatar fill */
  border: string;
  /** dark — used as the badge text */
  text: string;
}

const GOLDEN_ANGLE = 137.50776;

function band(index: number): MemberColor {
  const hue = (index * GOLDEN_ANGLE) % 360;
  const lap = Math.floor((index * GOLDEN_ANGLE) / 360);

  // Lightness/saturation banding that stretches over ~15 laps (≈45 members)
  // before clamping, so the palette keeps diverging instead of collapsing.
  // Background stays light (readable), border/text darken per lap.
  const L = Math.min(lap, 15);
  const bgL = 94 - L * 0.8;
  const bgS = 40 + L * 2.2;
  const borderL = 56 - L * 0.9;
  const borderS = 60 + L * 2;
  const textL = Math.max(22, 32 - L * 0.7);
  const textS = borderS + 5;

  const h = hue.toFixed(1);
  return {
    hue,
    bg: `hsl(${h}, ${bgS}%, ${bgL}%)`,
    border: `hsl(${h}, ${borderS}%, ${borderL}%)`,
    text: `hsl(${h}, ${textS}%, ${textL}%)`,
  };
}

/** Deterministic index for an unknown id (falls back without crashing). */
function fallbackIndex(id: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % Math.max(mod, 1);
}

/**
 * Build a stable id -> color lookup from an ordered list of member IDs.
 * The list is sorted internally so colors are independent of API ordering.
 */
export function createMemberColorMap(memberIds: string[]): (id: string) => MemberColor {
  const sorted = [...memberIds].sort();
  const indexById = new Map<string, number>();
  sorted.forEach((id, i) => indexById.set(id, i));

  return (id: string): MemberColor => {
    const idx = indexById.has(id) ? indexById.get(id)! : fallbackIndex(id, sorted.length);
    return band(idx);
  };
}
