---
name: 2026-10-09-adopt-karrot-seed-design
description: Replace the Seoul signage visual system with Karrot's SEED Design tokens.
---

# Adopt Karrot SEED Design

- Status: accepted by the user's explicit request to apply Karrot's design system.
- Context: Mota's web UI used a hand-maintained Seoul signage palette (ink
  actions, no brand accent, Archivo + Pretendard) declared in `design/README.md`.
- Decision: take every colour, type, spacing, radius, shadow and motion value
  from the official `@seed-design/css` package (`base.css`, pinned `3.0.1`), fixed
  to light mode with `data-seed-color-mode="light-only"`. `styles.css` reproduces
  SEED component specs (Action Button, Segmented Control, List, Badge, Callout,
  Skeleton) on the existing markup. Mota keeps only `--mota-control-min` (44px),
  `--mota-route-band` (6px) and Seoul operator route colours outside SEED.
- Alternatives: `@seed-design/react` plus the SEED CLI snippets would replace the
  commute `tablist`, `aria-pressed` rows and Leaflet overlays whose accessibility
  contracts tests and `DESIGN.md` pin; system dark mode would need dark map tiles
  and re-checked route-colour contrast.
- Consequences: brand orange marks only the core action per screen; selection
  uses `bg-brand-weak` with a contrast check icon; secondary text stays at
  `fg-neutral-muted` because `fg-neutral-subtle` misses 4.5:1. SEED's shimmer
  skeleton is replaced by a solid pulse to keep the no-gradient rule. PWA icon,
  manifest and theme colour are unchanged. `design/artboards/` becomes history.
- Evidence: `apps/web/src/styles.css`; `apps/web/src/main.tsx`;
  `apps/web/index.html`; `apps/web/package.json`; `design/README.md`; `DESIGN.md`;
  `apps/web/e2e/transit-design.spec.ts` (44px targets, no horizontal scroll).
