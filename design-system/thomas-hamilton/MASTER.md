# THOMAS HAMILTON — Design System (MASTER)

> Page files in `pages/` override this file. Curated from ui-ux-pro-max results
> (Parallax Storytelling + Dark Mode styles, "Japanese Elegant" pairing, GSAP Scroll Reveal presets),
> adapted to the brief **"Sumi-e tối sang trọng"**. The generator's first pick (Brutalism, light palette)
> was rejected: it contradicts the brief.

## Concept — 墨 Sumi · 金 Kin · 間 Ma

Ink on black lacquer. Gold leaf used sparingly. Generous negative space (*ma*) instead of decoration.
One red hanko seal per view, never more.

## Colour tokens (`public/css/tokens.css`)

| Token | Hex | Use | Contrast on `--sumi` |
|---|---|---|---|
| `--sumi` | `#0B0A09` | page background | — |
| `--sumi-2` | `#141210` | raised surfaces, cards | — |
| `--sumi-3` | `#1E1B18` | inputs, hover surfaces | — |
| `--line` | `#2E2A25` | hairlines, borders | decorative |
| `--washi` | `#EDE6D8` | primary text | 16.1 : 1 |
| `--washi-2` | `#A79F92` | secondary text | 7.6 : 1 |
| `--kin` | `#C9A45C` | gold accent, CTA fill (text on it = `--sumi`) | 8.6 : 1 |
| `--kin-2` | `#E6C88A` | gold hover | 12 : 1 |
| `--shu` | `#B8322A` | hanko seal, sale badge, errors (decorative/large only) | 3.4 : 1 |
| `--shu-text` | `#E06A5F` | error text | 5.6 : 1 |

## Typography

| Role | Family | Notes |
|---|---|---|
| Display (VI/Latin) | Cormorant Garamond 300/500/600 | Vietnamese subset |
| Display (JA) | Shippori Mincho 400/600 | falls back per glyph after Cormorant |
| Body (VI) | Be Vietnam Pro 300/400/500 | 16px base, line-height 1.7 |
| Body (JA) | Noto Sans JP 400/500 | line-height 1.9 for kana/kanji |
| Kanji ornament | Shippori Mincho | vertical (`writing-mode: vertical-rl`), aria-hidden |

Scale (fluid `clamp`): 12 · 14 · 16 · 20 · 28 · 40 · 64 · 104. Letter-spacing on uppercase eyebrow labels: 0.32em.

## Spacing & layout

Spacious density (3/10): 8 · 16 · 24 · 40 · 64 · 96 · 160. Container 1320px, 12-col grid, 24px gutter
(16px side gutter on mobile). Asymmetric compositions (variance 8/10): images bleed off one edge, text sits
on the opposite third. Corners: 2px max — lacquer, not plastic.

## Signature effects

1. **Ink-bleed hero reveal** — SVG `feTurbulence` + `feDisplacementMap` mask animates the chair photo in like ink on wet paper.
2. **Sumi brush cursor trail** — canvas, pointer-fine devices only, fades in 600ms.
3. **Ensō** — hand-drawn circle path draws with `stroke-dashoffset` scrubbed to scroll.
4. **Shoji page transition** — two paper panels slide shut/open between page loads (≤ 700ms).
5. **Horizontal collection scroll** — one pinned section on home (desktop only).
6. **Gold dust** — sparse canvas particles in hero, paused when off-screen.
7. **Washi grain** — fixed SVG noise overlay at 5% opacity.
8. **Card ink-wash hover** — radial ink gradient follows pointer + subtle 3D tilt.

## Motion rules

- Library: GSAP 3 + ScrollTrigger + SplitText, Lenis smooth scroll (self-hosted from `node_modules`).
- Enter 600–900ms `expo.out`; exit 300–400ms; micro-interactions 180–240ms.
- Max 1 pinned section per page. Parallax only on decorative layers (yPercent ≤ 15).
- `prefers-reduced-motion: reduce` → no Lenis, no pin, no trail/dust, content shown in final state.
- Everything must render and work without JS (progressive enhancement).

## Accessibility & UX checklist

- Text contrast ≥ 4.5:1 (all text tokens above pass AA on `--sumi`).
- Visible focus ring: 2px `--kin` with 3px offset.
- Touch targets ≥ 44×44px; no hover-only affordances.
- SVG icons only (no emoji). Decorative kanji `aria-hidden="true"`.
- Forms: visible labels, errors under the field, server-side validation mirrors client.
- Images: explicit width/height or aspect-ratio boxes (CLS < 0.1), lazy below the fold.

## Anti-patterns

Neon glows, gradients in more than one hue, more than one red element per view, cherry-blossom clip-art,
fake "Japanese-looking" Latin fonts, pinned sections on mobile, autoplaying sound.
