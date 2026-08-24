/**
 * Moved to `@/components/world/Glyphs` — the in-world label system is a
 * platform primitive rather than a Rate Lab detail, and the Sugar Line cabinet
 * uses it too. Re-exported here so existing imports keep working.
 */
export { default, glyphTexture, writeGlyph, hideGlyph } from '@/components/world/Glyphs'
export type { GlyphStyle } from '@/components/world/Glyphs'
