import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { askWithKeys } from "./ai.functions";
import { articlePrompt, ARTICLE_SYSTEM, cleanArticleText, parseArticleResponse } from "./article";

const ArticleInput = z.object({
  provider: z.enum(["gemini", "openai"]),
  keys: z.array(z.string().min(4)).min(1).max(10),
  baseUrl: z.string().url().optional().or(z.literal("")),
  model: z.string().min(1),
  /** The page must be public — this flow cannot do logins or paywalls. */
  url: z.string().url().max(2000),
});

const FETCH_TIMEOUT_MS = 15000;
const MAX_HTML_BYTES = 3_000_000;

/**
 * Fetches an article page (server-side, so CORS can't block it and the real
 * user agent ties this flow to the browser app), extracts clean text with
 * numbered media markers and asks the AI to split it into exercises.
 * Media stays as links: kinescope/youtube iframes and images are never downloaded.
 */
export const fetchArticle = createServerFn({ method: "POST" })
  .validator((d) => ArticleInput.parse(d))
  .handler(async ({ data }) => {
    let res: Response;
    try {
      res = await fetch(data.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "TimeoutError")
        throw new Error(`Сайт не ответил за ${FETCH_TIMEOUT_MS / 1000} секунд. Попробуйте позже.`);
      throw new Error("Не удалось открыть ссылку. Проверьте адрес и подключение.");
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403)
        throw new Error("Сайт запрещает автоматическое чтение статей. Попробуйте другой источник.");
      if (res.status === 404) throw new Error("Страница не найдена (404). Проверьте ссылку.");
      throw new Error(`Сайт ответил ошибкой ${res.status}.`);
    }
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const article = cleanArticleText(html, data.url);
    if (!article.text)
      throw new Error(
        "Не удалось прочитать статью: страница пуста или собрана скриптами. Попробуйте другой источник.",
      );
    const { text, keyIndex } = await askWithKeys(
      data.provider,
      data.keys,
      data.baseUrl || undefined,
      data.model,
      ARTICLE_SYSTEM,
      articlePrompt(article.text),
    );
    return {
      exercises: parseArticleResponse(text, article.media),
      media: article.media,
      keyIndex,
    };
  });
