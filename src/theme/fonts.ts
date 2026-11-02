// UI font styles. The office canvas and the terminal keep their pixel fonts;
// this only changes panels, drawers and settings. Saved per browser, not in
// .jsmhq/config.json, because it's a personal choice, not a team setting.

export type FontStyle = "pixel" | "clean" | "mono";

export const FONT_STYLES: { id: FontStyle; label: string; hint: string }[] = [
  { id: "pixel", label: "Pixel", hint: "Pixelify Sans, the game look" },
  { id: "clean", label: "Clean", hint: "Inter, easiest to read" },
  { id: "mono", label: "Mono", hint: "JetBrains Mono, like a terminal" },
];

const KEY = "jsmhq.font";

export function savedFont(): FontStyle {
  try {
    const v = localStorage.getItem(KEY);
    return FONT_STYLES.some((f) => f.id === v) ? (v as FontStyle) : "pixel";
  } catch {
    return "pixel";
  }
}

export function applyFont(font: FontStyle) {
  if (font === "pixel") delete document.documentElement.dataset.font;
  else document.documentElement.dataset.font = font;
}

export function setFont(font: FontStyle) {
  applyFont(font);
  try {
    localStorage.setItem(KEY, font);
  } catch {
    /* private window: still applies until reload */
  }
}
