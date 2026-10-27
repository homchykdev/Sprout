# План: Welcome-онбординг (первый запуск)

## Цель
Многошаговое приветственное меню, которое показывается **один раз** при первом
запуске (не появляется после обновления / перезагрузки). Настройка: имя
пользователя, аватар, AI-ключи. Каждый шаг можно пропустить, из всей настройки
можно выйти целиком. В шагах с ключами — короткая инструкция, где и как их
получить.

## Существующие факты (по коду)
- Store: один flat zustand persist `pulse-fit-v1`, версия 9, `migrateState` в
  `src/lib/store.ts`. Флага «первый запуск» нет. Имя — `name`, AI-ключи —
  `ai: { provider, keys[], baseUrl, model }`.
- Аватар хранится в IndexedDB (`src/lib/media.ts`, `AVATAR_ID = "avatar"`,
  `setAvatarPhoto`), не в zustand — wizard просто вызывает `setAvatarPhoto`.
- Идеальная точка входа: `AppShell` (`src/components/game/AppShell.tsx`) —
  уже рендерит mascot-loader до `mounted`, `since` ставится в `Chrome`.
  Пока `!mounted` — можно показать wizard вместо Chrome.
- Настройки UI уже реализованы: `ProfileGroup.tsx` (имя), `AiGroup.tsx`
  (провайдер + ключи + инструкция к `checkAiKeys`), аватар на `profile.tsx`.
  Компоненты `SectionCard`, классы `field`/`selectField`, `TapButton`,
  `Mascot` (Огонёк), `card-soft`.
- i18n нет — тексты инлайн по-русски (следуем конвенции).
- Тесты: Vitest + RTL; e2e — Playwright.

## Дизайн решения

### Флаг первого запуска
- Новое поле в store: `onboarded: boolean`, `initialState`: `false`.
- Persist: bump версии 9 → 10; в `migrateState`: `if (from < 10)
  out.onboarded = true` — **у всех существующих пользователей wizard уже не
  покажется** (это и есть «не появляется после обновления»). Новые установки
  приходят с `initialState`, т.е. `false`.
- `resetAll()` выставляет `onboarded: false` — «Сброс данных» возвращает
  приветствие (осознанное решение: полный сброс = знакомство заново).
- Флаг ставится в `true` при: завершении шага «Готово», кнопке «Пропустить всё»
  или выходе (крестик/«позже»). Один раз пишется — повторно не показывается.

### UX wizard
- Полноэкранный оверлей (не route — не должен появляться в истории/таббаре).
  Рендерится в `AppShell` вместо `Chrome` при `mounted && !onboarded`.
- Шаги (Stepper с точками сверху, прогресс):
  1. **Приветствие** — маскот Огонёк, коротко что это за приложение,
     кнопка «Начать».
  2. **Имя** — input («Как тебя зовут?»), подсказка «Можно пропустить».
  3. **Аватар** — выбор фото (input file → `setAvatarPhoto`), превью,
     кнопка «Пропустить».
  4. **AI-ключ** — выбор провайдера (gemini/openai), поле пароля для ключа,
     кнопка «Проверить» (`checkAiKeys` — рабочая функция, состояние
     loading/ok/error). Здесь же свернутая инструкция «Как получить ключ»:
     - Gemini: ссылка https://aistudio.google.com/apikey, 3 коротких шага.
     - OpenAI-совместимый: where to create key + что вписать в baseUrl/model.
  5. **Готово** — «Всё, можешь менять в Настройках», кнопка «Начать».
- На каждом шаге: «Пропустить» → следующий шаг без данных; крестик/«Закрыть»
  (в шапке, со confirm-мини-диалогом «Выйти из настройки? Данные можно будет
  настроить позже в разделе Настройки») → флаг ставится, wizard закрывается,
  попадаем на `/`. Ставить ключ можно и позже, т.к. AI-функции требуют ключ.
- Черновик (имя, провайдер, ключ) держится локально в wizard-стейте; пишется в
  zustand в `onboarded=true` одним `set` (без FloatingSaveBar — не нужно).
- Motion: переходы шагов transform/opacity 200ms ease-out; уважает
  `prefers-reduced-motion` (уже есть утилита/подход в проекте).

### Файлы
| Файл | Действие |
|---|---|
| `src/lib/store.ts` | + `onboarded`, bump v9→v10, migrate, resetAll |
| `src/components/game/onboarding/Onboarding.tsx` | новый: оверлей-шаги, Stepper, черновик, логика пропуска/выхода |
| `src/components/game/onboarding/StepIntroduce.tsx` | новый: приветствие + маскот |
| `src/components/game/onboarding/StepName.tsx` | новый: имя |
| `src/components/game/onboarding/StepAvatar.tsx` | новый: аватар (IndexedDB) |
| `src/components/game/onboarding/StepAiKey.tsx` | новый: провайдер + ключ + «Как получить» |
| `src/components/game/onboarding/StepDone.tsx` | новый: финал |
| `src/components/game/AppShell.tsx` | рендер `<Onboarding/>` после mounted, когда `!onboarded` |
| `tests/…` (vitest) | unit: migrate sets onboarded=true; wizard`: завершение/пропуск/выход ставит флаг один раз; шаги пропускаются |

Каждый шаг ≤ ~150 строк; общая логика в `Onboarding.tsx`.

## Риски / заметки
- Миграция: все существующие пользователи автоматически получают
  `onboarded: true` — wizard появится только на чистых профилях. Если
  наоборот (показать и старым) — скажите, поменяем миграцию.
- Открытый вопрос: показывать wizard при `resetAll()` — я решил «да».
- В wizard копируется логика из `AiGroup`/`ProfileGroup`, а не реюз напрямую
  (те компоненты привязаны к Draft-паттерну настроек); вынос общих инпутов в
  подкомпоненты при написании, чтобы не дублировать markup дважды.

## Шаги внедрения
1. Store: поле + миграция (commit `feat: onboarding flag v10`).
2. Skeleton wizard (оверлей, шаги, навигация, пропуск/выход) — тест.
3. Шаги Имя + Аватар.
4. Шаг AI-ключ + инструкция + «Проверить».
5. Привязка в `AppShell`; полный прогон typecheck/lint/test/build; проверка в
   браузере (свежий профиль + существующий профиль после «обновления»),
   скриншоты 390/1440px.
