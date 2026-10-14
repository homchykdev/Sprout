import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  provider: z.enum(["gemini", "openai"]),
  apiKey: z.string().min(4),
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  system: z.string().max(8000),
  prompt: z.string().max(20000),
});

/** Calls the user's own AI provider and returns the model's JSON text. */
export const askAi = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    let res: Response;
    if (data.provider === "gemini") {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(data.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": data.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: data.system }] },
            contents: [{ role: "user", parts: [{ text: data.prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
    } else {
      const base = (data.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.apiKey}` },
        body: JSON.stringify({
          model: data.model,
          messages: [
            { role: "system", content: data.system },
            { role: "user", content: data.prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error("ИИ-ключ не принят. Проверьте его в настройках.");
      if (res.status === 429) throw new Error("Лимит запросов ИИ исчерпан. Попробуйте чуть позже.");
      throw new Error(`ИИ-сервис вернул ошибку ${res.status}: ${text.slice(0, 200)}`);
    }
    const j = JSON.parse(text);
    const out: string =
      data.provider === "gemini"
        ? (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("")
        : (j.choices?.[0]?.message?.content ?? "");
    if (!out) throw new Error("ИИ не вернул ответ.");
    return { text: out };
  });
