# Plan: настраиваемое перекодирование видео (ffmpeg-api.com)

> Статус: реализовано. Документация ffmpeg-api.com проверена: GPU/NVIDIA нигде не заявлены
> (все примеры — CPU: libx264/crf/preset; биллинг в GB-sec; OpenAPI без упоминаний nvenc/cuda),
> пользователь дополнительно проверил через playground — NVIDIA нет. Поэтому дефолт переключён
> на CPU: `libsvtav1 -crf 38 -preset 6` (1080x1920/60fps, webm). `av1_nvenc` остался опциональным
> пресетом: пробуется как есть, при ошибке облака один ретрай на CPU (см. `cpuFallbackOptions`).
> Ответы пользователя: дефолт+ CPU-замена — да; режимы — оба; контейнер по умолчанию — webm.

## Что делаем
Новая секция в Настройках «Видео: перекодирование»: пользователь задаёт параметры по умолчанию + advanced-режим с ручной командой для `ffmpeg-api.com`. Команда хранится на устройстве, уходит только в транзите через `ffmpeg.functions.ts` (как `ffmpegKey`).

## Дефолт от пользователя (как есть, с рисками)
```
-vf "scale=1080:1920,fps=60" -c:v av1_nvenc -rc vbr -cq 38 -b:v 0 -preset p7 -tune hq -spatial-aq 1 -pix_fmt yuv420p
```
Риски (не блокирую, но фиксирую):
1. `av1_nvenc` требует NVIDIA GPU на стороне облака — если у `ffmpeg-api.com` CPU-сборка, конвертация упадёт. Сейчас в `media.ts` уже есть fallback «сохранить оригинал», тост надо будет уточнить.
2. `scale=1080:1920` ломает aspect (растягивает). Правильно `scale=1080:-2` или `force_original_aspect_ratio`. Оставляю как просишь, но в UI добавлю подсказку.
3. `fps=60` + 1080p увеличивает файл в разы против текущего `480px/10fps/webp` — это противоречит экономии IndexedDB. Принимаю как выбор пользователя.
4. Выход перестанет быть `webp без звука` — надо делать динамические `outName/mime/kind`, иначе галерея (`<video>` vs `<img>`) покажет неверно.

## Шаги
1. `src/lib/store.ts`: `ffmpegOptions: string[]` (argv-массив) + `ffmpegOutExt: string` (напр. `mp4`), `initialState` = дефолт выше, `version 5→6`, `migrate` добивает поля. Вероятно объект `ffmpeg: { options, outExt }` — компактнее, решу при реализации.
2. `src/lib/ffmpeg.functions.ts`: снять лимиты `options max 16×80` → напр. `32×200`, `outName` валидация под `mp4/webm/webp`. Безопасность: только argv-массив, без shell.
3. `src/lib/ffmpeg.ts`: `convertVideoToWebp(file, key)` → `convertVideo(file, key, options, outName)` + парсер строки → argv (кавычки), маппинг `ext→mime/kind`. Старую сигнатуру оставить как враппер или удалить (проверю вызовы).
4. `src/lib/media.ts` `addFiles`: прокинуть `opts { ffmpegKey, ffmpegOptions, outExt }`, по результату класть `kind: video/image` + верный `mime`. Тост «сжато в webp» в `gallery.tsx` → «перекодировано».
5. `src/routes/settings.tsx`: секция «Видео: перекодирование» — поле ключа (как есть) + пресет/простой режим (vf, кодек — текст-инпуты) + `<details>Advanced</details>` с textarea под полную команду + кнопки «Сбросить к дефолту», «Проверить ключ». Валидация: пустая → fallback на дефолт, ошибка парсинга → toast + не сохраняем.
6. `src/lib/backup.ts`: секция `keys` уже включает `ffmpegKey` — добавить новое поле туда же; `countRecords` без изменений (ключи считаются штуками).
7. Тесты: `video-rules`/парсер команды (кавычки, пустые, инъекции с `;|&`), `migrateState v5→v6`, `backup` keys. Обновить существующие `backup.test.ts` ожидания.

## Файлы
- `docs/plan.md` (этот), `src/lib/store.ts`, `src/lib/ffmpeg.ts`, `src/lib/ffmpeg.functions.ts`, `src/lib/media.ts`, `src/routes/settings.tsx`, `src/routes/gallery.tsx` (тексты тостов), `src/lib/backup.ts`, тесты.

## Проверки (DoD)
`pnpm typecheck && lint && test && build` + dev-сервер, прогон загрузки видео с дефолтом и с кастомом, скриншоты 390/1440, консоль без ошибок.

## Вопросы (ответь до старта)
1. Дефолт оставляем буквально `scale=1080:1920 + av1_nvenc` (риск ошибки облака) или сразу чиню на `scale=1080:-2` + `libsvtav1/libx264` fallback? План — буквально как просишь.
2. Простой режим нужен отдельными полями (разрешение/fps/кодек) или достаточно одного Advanced-текста? План — оба: 2-3 простых поля + Advanced textarea.
3. Выходной контейнер по умолчанию какой — `mp4` (играет везде) или `webm`? План — `mp4`.
