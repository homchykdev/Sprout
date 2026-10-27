import { describe, expect, it } from "vitest";
import { ARTICLE_SYSTEM, articlePrompt, cleanArticleText, parseArticleResponse } from "../article";

const BASE = "https://fitstars.ru/blog/test";

/** Hard copy of the real fitstars.ru article markup pattern (quill-rendered). */
const FITSTARS_LIKE = `<html><head><title>Упражнения для спины</title></head><body>
<script>var a = 1;</script>
<nav><a href="/programs">Программы</a> <a href="/courses">Курсы</a></nav>
<header>Логотип сайта</header>
<h2 id="upr">Упражнения для ромбовидных мышц в домашних условиях</h2>
<h4 id="1_okruglenie"><span style="font-size: 24px;">1. Округление спины и сведение лопаток</span></h4>
<div style="position: relative; padding-top: 56.25%; width: 100%;"><iframe src="https://kinescope.io/embed/scUFPHj8pKdZcUkk6etQbx" frameborder="0" allowfullscreen=""></iframe></div>
<p><br></p><ul><li><p>Движение на раскрытие грудного отдела. Сидя на стуле, спина ровная.</p></li><li><p>Упражнение выполняйте плавно, в замедленном темпе.</p></li></ul>
<a href="https://redirect.appmetrica.yandex.com/serve/123"><img src="https://fitstars.ru/storage/app/media/uploaded-files/banner.jpg"></a>
<h4>2. «Снежный ангел» у стены</h4>
<div style="position: relative; padding-top: 56.25%;"><iframe src="https://kinescope.io/embed/pX3frjK947qzdHnqpYsU6K"></iframe></div>
<ul><li>Исходное положение: стоя у стены.</li><li>Поднимите прямые руки над головой.</li></ul>
<div style="display:none">скрытый блок</div>
<aside>Похожие статьи</aside>
<footer>© FitStars</footer>
</body></html>`;

describe("cleanArticleText", () => {
  it("extracts headings, bullets and numbered media from a fitstars-like article", () => {
    const { text, media } = cleanArticleText(FITSTARS_LIKE, BASE);
    expect(text).toContain("## Упражнения для ромбовидных мышц");
    expect(text).toContain("## 1. Округление спины и сведение лопаток");
    expect(text).toContain("• Движение на раскрытие грудного отдела");
    expect(text).toContain("[[media-1]]");
    expect(text).toContain("[[media-2]]");
    expect(text).not.toContain("скрытый блок");
    expect(text).not.toContain("Логотип сайта");
    expect(text).not.toContain("© FitStars");
    expect(media[0]).toEqual({
      url: "https://kinescope.io/embed/scUFPHj8pKdZcUkk6etQbx",
      kind: "kinescope",
    });
    expect(media[1]).toEqual({
      url: "https://fitstars.ru/storage/app/media/uploaded-files/banner.jpg",
      kind: "image",
    });
    expect(media[2]).toEqual({
      url: "https://kinescope.io/embed/pX3frjK947qzdHnqpYsU6K",
      kind: "kinescope",
    });
  });

  it("parses a structurally different article (h2 + <video> + unnumbered)", () => {
    const html = `<body>
      <h1>Тренировка дома</h1>
      <h2>Приседания</h2>
      <video controls><source src="videos/squat.mp4" type="video/mp4"></video>
      <p>Опуститесь вниз, колени по линии стоп.</p>
      <h2>Планка</h2>
      <img src="https://cdn.example.com/plank.gif" alt="">
      <p>Держите корпус в одной линии.</p>
    </body>`;
    const { text, media } = cleanArticleText(html, "https://example.com/post/1");
    expect(text).toMatch(/## Приседания[\s\S]*\[\[media-1\]\]/);
    expect(text).toMatch(/## Планка[\s\S]*\[\[media-2\]\]/);
    expect(media[0]).toEqual({
      url: "https://example.com/post/videos/squat.mp4",
      kind: "video",
    });
    expect(media[1]).toEqual({
      url: "https://cdn.example.com/plank.gif",
      kind: "image",
    });
  });

  it("deduplicates repeated media urls", () => {
    const html = `<body><h2>A</h2><iframe src="https://kinescope.io/embed/abc"></iframe><h2>B</h2><iframe src="https://kinescope.io/embed/abc"></iframe></body>`;
    const { text, media } = cleanArticleText(html, "https://x.ru");
    expect(media).toHaveLength(1);
    expect(text).toContain("[[media-1]]");
    expect(text.match(/\[\[media-1\]\]/g)?.length).toBe(2);
  });

  it("gives up on boilerplate-only pages", () => {
    const html = `<body><nav><p>menu</p><img src="/x.gif"></nav><footer>copyright</footer></body>`;
    expect(cleanArticleText(html, "https://x.ru")).toEqual({ text: "", media: [] });
  });

  it("truncates very long articles", () => {
    const html = `<body><h2>A</h2>${"<p>длинный текст подряд </p>".repeat(2000)}</body>`;
    const { text } = cleanArticleText(html, "https://x.ru", 500);
    expect(text.length).toBeLessThanOrEqual(501);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("parseArticleResponse", () => {
  const media: MediaRef[] = [
    { url: "https://kinescope.io/embed/one", kind: "kinescope" },
    { url: "https://kinescope.io/embed/two", kind: "kinescope" },
    { url: "https://fitstars.ru/img/prilozhenie.jpg", kind: "image" },
  ];

  it("maps valid media indexes to links and drops invalid ones", () => {
    const out = parseArticleResponse(
      JSON.stringify({
        exercises: [
          { media: [1, 99], name: "Округление спины", mode: "reps", reps: 8, steps: ["сделай"] },
          { media: [2], name: "Снежный ангел", mode: "time", seconds: 60 },
          { media: [], name: "Подтягивания" },
        ],
      }),
      media,
    );
    expect(out[0]!.videoUrl).toBe("https://kinescope.io/embed/one");
    expect(out[0]!.mode).toBe("reps");
    expect(out[1]!.videoUrl).toBe("https://kinescope.io/embed/two");
    expect(out[1]!.mode).toBe("time");
    expect(out[2]!.videoUrl).toBeUndefined();
  });

  it("tolerates code fences", () => {
    const out = parseArticleResponse(
      '```json\n' + JSON.stringify({ exercises: [{ name: "Кошка", media: [3] }] }) + "\n```",
      media,
    );
    expect(out[0]!.videoUrl).toBe("https://fitstars.ru/img/prilozhenie.jpg");
  });

  it("throws on broken model output", () => {
    expect(() => parseArticleResponse("not json", media)).toThrow(/неверном формате/);
    expect(() => parseArticleResponse('{"exercises":"нет"}', media)).toThrow(/неверном формате/);
  });
});

describe("prompt", () => {
  it("explains markers and bounds the muscle list", () => {
    const p = articlePrompt("[[media-1]] ## Приседания");
    expect(p).toContain("[[media-N]]");
    expect(p).toContain("upper-back");
    expect(ARTICLE_SYSTEM).toContain("JSON");
  });
});
