# Plan: 4 вкладки — пробный вариант (откат: git revert)

> Статус: к реализации. Откат — `git log --oneline` → `git revert <commit…>` или жёсткий возврат
> к коммиту до изменений (пользователь так и просил: «не понравится — вернём с последнего коммита»).
> Поэтому все старые роуты (`/library`, `/gallery`, `/settings`) НЕ удаляются — остаются рабочими
> по прямым ссылкам, из нижнего бара просто убираются.

## Цель
Бар: `Сегодня | Тренировки | Прогресс | Профиль` (4 вместо 5).
- Тренировки = планы + библиотека упражнений (сегмент-переключатель внутри страницы).
- Прогресс = обзор (карта, советы, история) + фото прогресса (альбом `progress`).
- Профиль (новый `/profile`) = кто я: имя/уровень, бейджи, цели фигуры (альбом `goal`), настройки/ключи/бэкап.
- Технический альбом `exercise` из навигации прячется (нужен только как превью).

## Шаги (мелкие, каждый — отдельный коммит)
1. `library.tsx`: выделить `export function LibraryContent()` (всё без `h1`), роут-обёртка остаётся.
2. `plans.tsx`: выделить `export function PlansContent()`, роут `Plans` = `h1 + сегмент [Мои тренировки|Упражнения] + PlansContent/LibraryContent`.
3. `progress.tsx`: выделить `export function ProgressOverview()`; `Badges` ПЕРЕЕЗЖАЮТ в Профиль (из Прогресса убираются), `MonthlyChallenge` остаётся в обоих местах (там компакт, тут полный — уже так).
4. `gallery.tsx`: выделить `export function AlbumView({ album, showSwitcher })`; роут `Gallery` — legacy-обёртка со свитчером (без изменений поведения).
5. `settings.tsx`: выделить `export function SettingsSections()` (все секции без шапки-назад); роут `Settings` — legacy-обёртка.
6. Новый `src/routes/profile.tsx`: карточка пользователя (имя, уровень, streak, XP) + `Badges` + `AlbumView album="goal"` + `SettingsSections`. Файловый роутинг TanStack подхватит `/profile` сам; `routeTree.gen.ts` регенерируется при build.
7. `AppShell.tsx`: TABS=4, `grid-cols-4`, подсветка legacy: `/library→/plans`, `/gallery→/progress`, `/settings→/profile`; шестерёнка настроек из шапки убирается (настройки теперь в Профиле).
8. Проверки по DoD (см. ниже), скриншоты 390/1440, консоль без ошибок.

## Файлы
- `docs/plan.md` (этот)
- `src/routes/library.tsx`, `src/routes/plans.tsx`, `src/routes/progress.tsx`, `src/routes/gallery.tsx`, `src/routes/settings.tsx`
- `src/routes/profile.tsx` (новый)
- `src/components/game/AppShell.tsx`

## Риски
1. `routeTree.gen.ts` — генерируемый; руками не трогаем, при конфликте — перегенерировать build'ом.
2. `AlbumView` зависит от IndexedDB (`useMedia`) — при встраивании в 2 страницы одновременно монтируется только один инстанс, ок.
3. Состояние сегментов — локальный `useState` (без query-параметров): диплинк `/plans?tab=…` не поддерживается в пробной версии. Если понравится — добавим `validateSearch`.
4. В `package.json` НЕТ скриптов `typecheck`/`test` (есть только `lint`, `build:dev`, `build`) — проверки адаптирую: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`.
5. Бейджи уезжают из Прогресса — осознанное изменение, фиксирую здесь.

## Вопросы — закрыты пользователем
4 таба как предложено; пробуем, не понравится — откат с коммита.
