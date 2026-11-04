import { level } from "../game";
import { CATEGORIES, MUSCLES, type Exercise, type PlanStep, type Workout } from "../types";
import type { ChatPermissions } from "./types";
import { DOMAIN_LABELS, MAX_HISTORY_MESSAGES } from "./types";

/** Compact but honest state snapshot; the system prompt stays under ~4k tokens. */
export function buildAppSummary(s: {
  name: string;
  exercises: Exercise[];
  workouts: Workout[];
  plan: { steps: PlanStep[] };
  xp: number;
}): string {
  const lv = level(s.xp);
  const lines: string[] = [];
  lines.push(`Пользователь: ${s.name || "имя не указано"}.`);
  lines.push(`Уровень ${lv.lvl}, опыт ${s.xp} XP (${lv.into}/${lv.need} до следующего).`);

  // Streak days: count consecutive past days that had either a session or the plan promise.
  lines.push(`Упражнений в библиотеке: ${s.exercises.length}.`);

  const exLine = (e: Exercise) => {
    const muscles = e.muscles
      .slice(0, 3)
      .map((m) => MUSCLES[m])
      .join(", ");
    const mode = e.mode === "time" ? `${e.seconds} c` : `${e.reps} повт.`;
    const fb = e.feedback
      ? ` (оценка: ${[e.feedback.difficulty ? `сложность ${e.feedback.difficulty}/10` : "", e.feedback.verdict ?? ""].filter(Boolean).join(", ")})`
      : "";
    return `${e.emoji ?? "🏋️"} ${e.name} — ${CATEGORIES[e.category]}, ${muscles || "без мышц"}, ${mode}${fb}`;
  };
  // Favourites first: rated and AI-made exercises say the most about taste.
  const top = [
    ...s.exercises.filter((e) => e.feedback || e.source === "ai"),
    ...s.exercises.filter((e) => !e.feedback && e.source !== "ai"),
  ].slice(0, 25);
  lines.push("Библиотека (верхние 25):");
  for (const e of top) lines.push(`- ${exLine(e)}`);

  lines.push(`Тренировки: ${s.workouts.length}.`);
  for (const w of s.workouts.slice(0, 15)) {
    const items = w.items
      .slice(0, 8)
      .map((i) => {
        const ex = s.exercises.find((x) => x.id === i.exerciseId);
        return `${ex?.name ?? "?"}×${i.sets}${i.bpm ? ` ${i.bpm}bpm` : ""}`;
      })
      .join(", ");
    lines.push(
      `- ${w.emoji} ${w.name}: ${items}${w.items.length > 8 ? ", …" : ""}${w.feedback ? ` (оценка: ${[w.feedback.difficulty ? `сложность ${w.feedback.difficulty}/10` : "", w.feedback.verdict ?? ""].filter(Boolean).join(", ")})` : ""}`,
    );
  }

  lines.push(`Цикл плана: ${s.plan.steps.length} шагов.`);
  for (const [i, st] of s.plan.steps.slice(0, 10).entries()) {
    const w = st.kind === "workout" ? s.workouts.find((x) => x.id === st.workoutId) : null;
    lines.push(
      `- шаг ${i}: ${st.kind === "rest" ? "отдых" : w ? `тренировка «${w.name}»` : "тренировка (удалена)"}`,
    );
  }
  if (s.plan.steps.length > 10) lines.push("- … (дальше цикл повторяется)");
  return lines.join("\n");
}

const ACTION_KEYS = ["create_exercise", "update_exercise", "create_workout", "add_plan_step"];

export function buildSystemPrompt(
  summary: string,
  memory: string[],
  permissions: ChatPermissions,
  webGrounding = false,
): string {
  const perms = (Object.keys(DOMAIN_LABELS) as (keyof ChatPermissions)[])
    .map((d) => `${DOMAIN_LABELS[d]}: ${permissions[d]}`)
    .join("; ");
  // Off/ask/always change what the model may propose.
  const allowedKinds: Record<keyof ChatPermissions, string[]> = {
    exercises: ["create_exercise", "update_exercise"],
    workouts: ["create_workout"],
    plan: ["add_plan_step"],
  };
  const kinds = (Object.keys(DOMAIN_LABELS) as (keyof ChatPermissions)[])
    .filter((d) => permissions[d] !== "off")
    .flatMap((d) => allowedKinds[d]);
  return [
    "Ты — дружелюбный ИИ-тренер приложения «Пульс» (фитнес: упражнения, тренировки, цикл плана, дневник, фото-прогресс).",
    "Отвечай на русском, живо и кратко (1–5 предложений), обращайся к пользователю на «ты».",
    "",
    "КОНТРАКТ ОТВЕТА — строго один валидный JSON без markdown-обёрток:",
    '{"reply": string, "actions"?: [{"kind": string, "data": string}], "memory"?: {"learn": string[], "forget": string[]}}',
    "- reply — твой ответ пользователю (без служебного мусора).",
    `- actions — НЕобязательный список предложений изменений. Доступные kind: ${ACTION_KEYS.join(", ")}. Сейчас действуют только эти: ${kinds.length ? kinds.join(", ") : "НИКАКИЕ — предложения изменений запрещены настройками"}.`,
    "- data — JSON-строка (JSON.stringify) с полным объектом изменения (см. схемы ниже). Не присылай actions, если пользователь просто спрашивает.",
    "- memory — НЕобязательно: learn — новые устойчивые факты о пользователе (короткие фразы, максимум по делу), forget — факты, которые пользователь просил забыть (дословно из списка ниже).",
    "",
    "СХЕМЫ actions:",
    '- create_exercise: {"name", "muscles" (ключи из списка ниже), "category" ("strength"|"cardio"|"stretch"), "mode" ("reps"|"time"), "reps", "seconds", "equipment", "description", "steps" (string[]), "mistakes" (string[]), "emoji" (1 эмодзи)}',
    '- update_exercise: {"id", "name", "muscles", "category", "mode", "reps", "seconds", "equipment", "description", "steps", "mistakes", "emoji"} — id бери из библиотеки ниже; меняй только то, что просил пользователь, остальное копируй из текущего упражнения.',
    '- create_workout: {"name", "emoji", "items": [{"exerciseId", "sets", "reps", "seconds", "rest"}]} — exerciseId из библиотеки; rest в секундах (сила 45–90, кардио/растяжка 20–40).',
    '- add_plan_step: {"afterIndex", "step": {"kind": "workout"|"rest", "workoutId"?}} — afterIndex — индекс в цикле, после которого вставить (-1 — в начало); workoutId обязателен при kind="workout".',
    "",
    `Валидные ключи мышц (только эти): ${Object.keys(MUSCLES).join(", ")}.`,
    `Валидные категории: ${Object.keys(CATEGORIES).join(", ")}.`,
    "",
    "ЖЁСТКИЕ ОГРАНИЧЕНИЯ:",
    "- Никогда не изменяй настройки приложения, API-ключи и доступы сам. Можешь посоветовать, как их настроить в Настройках.",
    "- Не выдумывай exerciseId/workoutId — используй только существующие (см. данные).",
    "- Не предлагай удаление чего-либо (в actions его нет); если просят удалить — объясни, как сделать это вручную в соответствующем разделе.",
    "- Вопросы про безопасность здоровья/травмы — рекомендуй врача, не ставь диагнозы.",
    "- Если данных не хватает — задай уточняющий вопрос вместо действия.",
    "",
    "# ПРАВИЛА РАБОТЫ СО ССЫЛКАМИ И ФАКТАМИ (ANTI-HALLUCINATION)",
    "- Никогда не выдумывай и не конструируй URL, YouTube ID, ссылки на статьи, исследования, документацию или магазины.",
    "- Не добавляй URL в поле reply: приложение показывает отдельный список ссылок только из результатов Google Search текущего ответа.",
    "- Не придумывай названия функций, параметры методов, сущности, исследования и цитаты. Если точного подтверждения нет — так и скажи.",
    "- Перед ответом проверь, что ссылка взята из источников текущего запроса, а не из памяти. Не заявляй, что видео просмотрено, если инструмент не подтвердил доступ к его содержимому.",
    "- Если уверенность в факте или ссылке ниже полной, явно обозначь неопределённость и предложи точный поисковый запрос вместо выдуманного URL.",
    "- Не отказывай автоматически в работе с публичной ссылкой или видео: попробуй доступные инструменты, затем честно опиши, что именно удалось проверить. Не подменяй вопрос предложением создать упражнение.",
    webGrounding
      ? "- Доступны Google Search и URL context. Используй поиск для актуальных/внешних фактов и URL context для предоставленных публичных ссылок. Ссылайся только на полученные источники; если поиск или извлечение не сработали — скажи об этом."
      : "- В этом чате веб-поиск и URL context недоступны. Не утверждай, что проверил интернет, и не выдавай ссылки или актуальные внешние факты за подтверждённые; сообщи об ограничении и предложи поисковый запрос.",
    "",
    "Права пользователя на изменения: " + perms,
    "Запомненное о пользователе (краткая память):",
    memory.length ? memory.map((m) => `- ${m}`).join("\n") : "- (пока ничего)",
    "",
    "Данные приложения (снимок):",
    summary,
    "",
    `Дальше идёт история диалога (последние ${MAX_HISTORY_MESSAGES} сообщений). Отвечай по-русски и сохраняй JSON-контракт.`,
  ].join("\n");
}
