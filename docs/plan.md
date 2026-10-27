# Plan: "Из статьи" — 4th add-exercise flow (site-agnostic)

## Goal
Add a 4th import button "Из статьи" next to «Своё / Из YouTube / ИИ» on the library screen.
User pastes ANY article/blog URL (test article: fitstars.ru rhomboid workout blog). The app
fetches the page server-side, splits it into exercises, attaches each exercise's own
photo/video/gif, and inserts them into the library. Media is embedded **as links
(iframe/img), never downloaded** — zero device storage (per user request).

## Why the current "Web Fetch" error happens
The AI button (`aiCreateExercise` → `askAi` in `src/lib/ai.functions.ts`) has **no web
access at all**: it sends prompt text to Gemini/OpenAI and nothing more. A pasted URL is
treated as prompt content; nothing can fetch it. Fix = dedicated flow that fetches the
page in a server function, then lets the AI structure the already-fetched text.

## Core design constraint (user): not fitstars-specific
The page markup differs per site, so splitting relies on the AI, not on site-specific CSS.
Code does only structure-neutral work: fetch, clean HTML, collect media, number it.
Then the model works with plain text that looks the same for every site.

## Pipeline (per article)
1. **Fetch** (server fn): validate https URL, fetch with UA, 15 s timeout, ~2 MB size cap.
   Friendly Russian errors for 403/timeout/too big.
2. **Clean + extract** (`src/lib/article.ts`, pure, unit-tested):
   - strip `<script>/<style>/<noscript>`, `<nav>/<header>/<footer>/<aside>/<form>`,
     hidden elements, Why: anything not main content;
   - walk remaining DOM in document order and build one text stream where text keeps
     headings (so structure like "1. Название" survives) and every media element
     (`iframe`, `video`, `img`) is replaced by an inline marker like `[[медиа-1]]`;
     for each marker store `{ url, kind: youtube|vimeo|kinescope|vk|image|direct-video|iframe }`;
   - collapse whitespace; if the resulting text is tiny → "не удалось прочитать статью".
3. **AI split** (existing `askAi`, user's keys): prompt with the marker-numbered text →
   JSON `[{media?: number[], name, muscles (из MUSCLE_LIST, первая — основная), category,
   mode, reps, seconds, equipment, description, steps[], mistakes[]}]`;
   non-exercise sections skip → no media and no entry.
4. **Merge** (deterministic):
   - zod-validate; `media` indexes outside the real list are dropped (hallucination guard);
   - if exercise has no media but article had unused media → optional "nearest marker in
     text to the exercise's source position" heuristic? — NO: without it, exercises simply
     get no media (emoji fallback). User explicitly wants *correct* media, not random ones.
   - `videoUrl` = resolved url (kinescope → `kinescope.io/embed/{id}` → LinkMedia iframe
     kind; youtube → native kind; direct image/gif URL → image kind). No `mediaId`, no clips.

## Files
| File | Change |
|---|---|
| `package.json` | + `node-html-parser` (small pure-JS HTML parser; server has no DOMParser, regex parsing too fragile) |
| `src/lib/article.ts` (new) | `cleanArticleText(html) → { text: string; media: MediaRef[] }`; `MediaRef = { url: string; kind }` |
| `src/lib/article.functions.ts` (new) | Server fn `fetchArticle(url)`: fetch → clean → askAi → zod-parse → merge |
| `src/lib/clients.ts` | Client wrapper `aiImportArticle(url)` + ARTICLE prompt schema (русская атмосфера как у соседних промптов) |
| `src/lib/embed.ts` | `posterFromUrl`: kinescope → `kinescope.io/{id}/poster.svg` (verified 200 image/jpeg); youtube → existing `ytThumb` |
| `src/components/game/ExerciseThumb.tsx` | kinescope/iframe links → poster before emoji fallback |
| `src/components/game/LinkMedia.tsx` | kinescope iframe: 16:9 aspect + `allowfullscreen`; generic iframe fallback stays |
| `src/components/game/ArticleImportTab.tsx` (new) | URL input → states: loading skeleton / error / result. Result: per-exercise cards with poster, name, muscle chips; checkbox (all on); "добавить выбранные" and "сохранить как тренировку" like the AiYoutubeTab pattern; already-existing names unchecked + marked |
| `src/routes/library.tsx` | 4th button "Из статьи" (Globe icon, needsKeys) + ArticleDialog wrapper |

## Store payload (no schema change, no migration)
`id: ai-{uid()}`, `source: "ai"`, `videoUrl: <link>` — nothing else; zero IndexedDB usage.

## Steps
1. `node-html-parser` + `posterFromUrl` (embed.ts) + unit tests.
2. `src/lib/article.ts` + `src/lib/__tests__/article.test.ts`: fixtures —
   (a) the actual fitstars test page markup snippet (hard copy),
   (b) a synthetic different-site structure (h2 headings, `<video>` tag, unnumbered blocks),
   (c) noisy page (nav/footer/TOC excluded → empty text case).
3. `article.functions.ts` + `clients.ts` wrapper + ai.test for zod-merge (bad indexes dropped).
4. `ArticleImportTab` + `ArticleDialog` + button in library.tsx (loading/error/empty states,
   tokens only, motion per UI rules, touch targets ≥44px).
5. LinkMedia/ExerciseThumb kinescope handling.
6. `bun typecheck && bun lint && bun test && bun build`.

## Manual verification (definition of done)
- Dev server + Playwright: paste the fitstars article URL → 9 exercises, each with its own
  distinct video (8 videos; "Подтягивания" without media gets emoji fallback);
  add all → check each plays in the workout player via iframe.
- Console zero errors; screenshots at 390px and 1440px; reduced-motion respected.
- States: invalid URL, offline/403 host, article without exercises (clear empty state),
  very long exercise names.
- Bonus regression check: old 3 buttons still work.

## Risks
- **Extraction quality varies per site** → AI does the splitting; preview list lets the
  user see/fix before saving; empty/corrupt extraction → clear error, no junk saved.
- **AI mislabels media refs** → indexes zod-checked, invalid dropped; exercise then simply
  has no media instead of a wrong one.
- **Sites blocking server fetch** (403/timeout) → friendly error.
- **Kinescope has no clip loop** (plain iframe) — acceptable; exercises still watchable.
- **AI costs**: whole article text may be long → cap ~12k chars, instruct model to skip
  marketing blocks, trimming obviously.
