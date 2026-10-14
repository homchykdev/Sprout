---
name: ui-quality
description: Use when designing a new screen, redesigning, or polishing UI and animation. Covers design tokens, hierarchy, motion recipes, and a screenshot-based self-review list.
---

# UI quality playbook

## 1. Tokens first (before any screen)
In `index.css` / Tailwind theme define: 1 primary + 1 accent (optional) + neutral ramp + semantic (success/warning/danger), light and dark.
Type scale (max 2 families, 5-6 sizes), spacing scale (4/8 base), radii (2-3 values), shadows (2-3), motion durations (fast 150ms, base 220ms, slow 320ms) and one easing.
Take them from docs/BRIEF.md. If BRIEF says "you choose", choose a distinctive, coherent set and state it in one line.

## 2. Layout and hierarchy
- One primary action per screen; make it obvious. Group by proximity, not by borders everywhere.
- Strong size/weight contrast between title, section, body, meta. Generous whitespace; consistent rhythm from the spacing scale.
- Content-first: real labels, real numbers, real empty-state copy with a next step.

## 3. Component polish
- Hover, focus-visible, active, disabled, loading states on every interactive element.
- Skeletons match the final layout. Empty states have an illustration or icon plus an action.
- Icons from one set (lucide). Consistent stroke and size.

## 4. Motion recipes (motion library)
- Section/page enter: opacity 0->1 + y 8->0, 220ms ease-out, stagger children 40-60ms.
- List add/remove: layout animation (`layout`, `AnimatePresence`), 200ms.
- Buttons/cards: hover lift or tint 150ms; press scale 0.97.
- Dialogs/sheets: fade + slight scale or slide, 200-250ms; backdrop fades.
- Numbers/progress: animate value changes (count-up or spring), never jump.
- Only transform/opacity. Handle `prefers-reduced-motion` (`useReducedMotion`). Nothing over 400ms except hero moments.

## 5. Anti-slop list (fix on sight)
Default purple/blue gradient hero, emoji as icons, everything centered, identical 3-card grid, gray-on-gray low contrast,
inconsistent radii, random shadows, lorem ipsum, a spinner where a skeleton belongs.

## 6. Screenshot self-review (do this before reporting)
For each screen at 390px and 1440px check: alignment to grid, spacing consistency, text overflow/truncation, contrast, focus order,
tap target size, dark theme parity, no layout shift during animation. Write the issues found, fix, re-screenshot.
