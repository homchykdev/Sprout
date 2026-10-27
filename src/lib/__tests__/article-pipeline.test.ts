import { beforeEach, describe, expect, it, vi } from "vitest";

const askWithKeys = vi.fn();
vi.mock("../ai.functions", () => ({ askWithKeys: (...a: unknown[]) => askWithKeys(...a) }));

// Import AFTER the mock so the server fn does not need a real runtime.
import { cleanArticleText, parseArticleResponse } from "../article";

// The handler's body minus the server-fn wrapper is what we replicate here:
// fetch (mocked) → cleanArticleText → askWithKeys (mocked) → parseArticleResponse.
// This is exactly the composition article.functions.ts performs.

const ARTICLE_URL =
  "https://fitstars.ru/blog/workout/uprazhneniya-doma-dlya-rombovidnyh-myshc-spiny-glavnyh-myshc-rovnoj-osanki";

describe("article pipeline (composition of the real handler steps)", () => {
  beforeEach(() => {
    askWithKeys.mockReset();
  });

  it("extract → ai → parse end-to-end against the real fitstars markup pattern", async () => {
    const html = `<body><h2>Комплекс</h2>
      <h4>1. Округление спины</h4>
      <div><iframe src="https://kinescope.io/embed/AAA"></iframe></div>
      <ul><li>Сидя на стуле, округлите спину.</li></ul>
      <h4>2. Подтягивания</h4>
      <p>Упражнение отлично прокачивает спину.</p>
      <nav>реклама</nav></body>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(html, { status: 200 })),
    );
    const { media, text } = cleanArticleText(html, ARTICLE_URL);
    expect(media.map((m) => m.kind)).toEqual(["kinescope"]);
    // Model (canned) returns exercise 1 w/ its video, exercise 2 w/o media.
    askWithKeys.mockResolvedValue({
      text: JSON.stringify({
        exercises: [
          {
            media: [1],
            name: "Округление спины",
            muscles: ["upper-back"],
            category: "strength",
            mode: "reps",
            reps: 10,
            steps: ["Сидя на стуле, округлите спину"],
          },
          { media: [], name: "Подтягивания" },
        ],
      }),
      keyIndex: 0,
    });
    const { text: modelText, keyIndex } = await askWithKeys(
      "gemini",
      ["k"],
      undefined,
      "m",
      "s",
      "p",
    );
    void text;
    const exercises = parseArticleResponse(modelText, media);
    expect(keyIndex).toBe(0);
    expect(exercises[0]!.videoUrl).toBe("https://kinescope.io/embed/AAA");
    expect(exercises[1]!.videoUrl).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

export {};
