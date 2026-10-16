# AGENTS.md

Fixed-stack web app. Read `docs/BRIEF.md` first: it defines what we build and the visual direction.
If BRIEF.md is empty or a field that changes UX/data is missing, ask me (one batch of questions) before writing code.

## Stack (do not substitute without asking)
- Vite + React + TypeScript (strict), Tailwind CSS, shadcn/ui (Radix), lucide-react icons
- Animation: `motion` (framer-motion). Server state: TanStack Query. Forms: react-hook-form + zod
- Client state: Zustand only when props/context are not enough
- Tests: Vitest + React Testing Library; Playwright for e2e
- Use the package manager and library versions already in the repo (check the lockfile). Never mix managers.

## Workflow
- Small fix: just do it. New feature, or a change touching 3+ files: write `docs/plan.md` (steps, files, risks) and wait for my OK.
- Work in small steps. **Commit after each working step (`feat:`, `fix:`, `refactor:`) using commands: git status - then git add . - and then git commit -m "A brief summary of the changes you made to the project". Never commit a failing build.**
- Do not ask permission for anything covered in this file. Ask only when a requirement is ambiguous in a way that changes UX, data, or scope.

## Definition of done (all of it, every task that touches UI or logic)
1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass (adapt to the repo's scripts).
2. Start the dev server and drive the real app with the browser tools (Playwright / Chrome DevTools MCP).
   Walk the main flow, take screenshots at 390px and 1440px width, read the console. Zero errors and warnings.
3. Check states: loading, empty, error, very long text, no data.
4. Look at your own screenshots critically (alignment, spacing, hierarchy, contrast). Fix, re-check. Max 3 fix rounds per issue, then stop and report what you tried.
5. Final report: what changed, what you verified and how, what you could NOT verify, known gaps.
   Never write "works" or "done" for something you did not run.

## UI rules (always on)
- Tokens only: colors, radii, spacing, shadows, durations come from CSS variables / Tailwind theme (`index.css`). No hardcoded hex or arbitrary px in components.
- Define tokens BEFORE building screens. Light and dark theme unless BRIEF says otherwise.
- shadcn/ui first (add via the shadcn MCP/CLI). Do not hand-roll primitives it already provides.
- Mobile-first, responsive. Touch targets >= 44px. Semantic HTML, visible focus, labels, WCAG AA contrast.
- Every screen has loading (skeleton), empty, and error states. Realistic copy and data, never lorem ipsum.
- Motion is part of the design, not decoration: 150-300 ms, ease-out, animate only transform/opacity. Cover: page/section transitions, list item enter, hover/press feedback, state changes. Respect `prefers-reduced-motion`. Never block input.
- Avoid the generic look: default purple-blue gradients, emoji as icons, centered-everything layouts, identical card grids. Make deliberate choices.
- For deeper design work (new screen, redesign, polish) load the `ui-quality` skill.

## Code rules (only what differs from defaults)
- No `any`, no `@ts-ignore`, no `eslint-disable` without a one-line reason.
- No new dependency without stating why in one line. Prefer what is installed.
- Components stay small (~150 lines); extract hooks and subcomponents.
- Data goes through a thin layer behind an interface, so mocks can be swapped for a real backend. Mark any fake data clearly.

## Boundaries
- Never: `rm -rf`, force push, commit secrets or `.env`, hand-edit lockfiles or generated files, edit `opencode.json`, weaken or delete a test to make it pass.
- Ask first: adding backend/auth/payments, changing a DB schema, deleting files outside the task, adding a heavy dependency.

## Communication
- Reply to me in Russian. Code, identifiers, commits, and file names in English.
- Be concise. If you do not know something, say so and give your best guess labeled as a guess. Check library docs before using an API you are unsure about.


## Architecture
- All user data lives on-device in a zustand persist store (`src/lib/store.ts`), with JSON export/import in Settings — user wanted no server and portable backups.
- AI (Gemini / OpenAI-compatible) uses the user's own keys from Settings, proxied via server functions in `src/lib/*.functions.ts` — avoids CORS, keys never stored server-side.
- Gamification/schedule logic is pure functions in `src/lib/game.ts` — missed planned days roll forward within the same week; vacations freeze streak.
- Backups export one JSON file per section (`src/lib/backup.ts` v2, v1 import; multi-file import merges); keys opt-in — user wants each data type in its own file.
- Muscle keys = `react-body-highlighter` muscles; legacy keys go through `normalizeMuscles` + store `migrate` — the library renders the load map.
- Voice uses browser `speechSynthesis` + Web Audio beeps (`src/lib/voice.ts`) — free and offline, user's choice.
- User photos/videos stored in IndexedDB via `src/lib/media.ts` (not the zustand store) with their own per-album archive export — too large for localStorage/JSON backups.
- Link media (YouTube/Vimeo/file/iframe) rendered by `LinkMedia` with `parseLink`/`parseClips` in `src/lib/embed.ts`; YouTube clips loop via IFrame API polling — one player for exercises and albums.
- Per-exercise tempo (`Exercise.bpm`) drives the metronome; uploaded exercise media stored in IndexedDB album "exercise" via `mediaId`, previewed by `ExerciseThumb`.
