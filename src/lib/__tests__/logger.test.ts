import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  clearLogs,
  formatLogs,
  getLogs,
  isDebug,
  logDebug,
  logError,
  logInfo,
  logsFileName,
  redact,
  setDebug,
  logWarn,
  type LogEntry,
} from "../logger";

beforeEach(() => {
  clearLogs();
  if (isDebug()) setDebug(false);
});

describe("ring buffer", () => {
  it("keeps only the newest MAX_ENTRIES entries", () => {
    for (let i = 0; i < 320; i++) logInfo("test", `entry-${i}`);
    const logs = getLogs();
    expect(logs.length).toBe(300);
    expect(logs[0]?.message).toBe("entry-20");
    expect(logs.at(-1)?.message).toBe("entry-319");
  });

  it("clearLogs empties the journal", () => {
    logInfo("test", "bye");
    clearLogs();
    expect(getLogs().length).toBe(0);
  });
});

describe("redaction", () => {
  it("masks Gemini/OpenAI/Bearer/ghp secrets", () => {
    const src =
      "AIza0123456789abcdefghijklmnopqrstu sk-qwertzuiop123 Bearer abc123def45ghij ghp_0123456789abcdef";
    const out = redact(src);
    expect(out).not.toContain("AIza0123456789abcdefghijklmnopqrstu");
    expect(out).toContain("AIza…");
    expect(out).not.toContain("sk-qwertzuiop123");
    expect(out).toContain("sk-…");
    expect(out).not.toContain("Bearer abc123def45ghij");
    expect(out).not.toContain("ghp_0123456789abcdef");
  });

  it("masks long opaque tokens", () => {
    const token = "x".repeat(60);
    expect(redact(`token=${token}`)).toBe("token=…(long token)");
  });

  it("leaves normal text and short ids alone", () => {
    expect(redact("playlist 2026-11-05 id-12345 saved")).toBe("playlist 2026-11-05 id-12345 saved");
  });

  it("applies redaction to logged messages and data", () => {
    logError("ai", "bad key sk-qwertzuiop123", { notes: "Bearer abc123def45ghij" });
    const text = formatLogs();
    expect(text).not.toContain("sk-qwertzuiop123");
    expect(text).not.toContain("Bearer abc123def45ghij");
  });
});

describe("levels", () => {
  it("drops debug entries while verbose mode is off", () => {
    logInfo("test", "hello");
    logDebug("test", "quiet detail");
    expect(getLogs().map((l) => (l as LogEntry).message)).toEqual(["hello"]);
  });

  it("keeps debug entries when verbose mode is on", () => {
    setDebug(true);
    logDebug("test", "verbose detail");
    expect(getLogs().at(-1)?.message).toBe("verbose detail");
  });

  it("marks warn and error levels", () => {
    logWarn("test", "hmm");
    logError("test", "uh");
    expect(getLogs().map((l) => l.level)).toEqual(["warn", "error"]);
  });
});

describe("entries", () => {
  it("expand Error data into message/stack", () => {
    logError("test", "failed", new Error("boom"));
    const last = getLogs().at(-1);
    expect(last?.data).toContain("boom");
  });

  it("describes non-Error data as JSON", () => {
    logInfo("test", "fact", { model: "gemini-2.5-flash", ms: 1300 });
    expect(getLogs().at(-1)?.data).toContain("gemini-2.5-flash");
  });

  it("truncates very long messages", () => {
    logInfo("test", "y".repeat(5000));
    expect(getLogs().at(-1)?.message.length).toBeLessThanOrEqual(2001);
  });
});

describe("export format", () => {
  it("writes an ISO timestamp, level and tag per line", () => {
    logInfo("export-check", "one two");
    const text = formatLogs();
    expect(text).toMatch(/^Журнал Пульс · .+ · записей: 1\n.+export-check: one two$/s);
    expect(text).toMatch(/202\d-.*Z.*\[info\] export-check: one two/s);
  });

  it("uses the pulse-logs file name", () => {
    expect(logsFileName("2026-11-05")).toBe("pulse-logs-2026-11-05.txt");
    expect(logsFileName()).toMatch(/^pulse-logs-\d{4}-\d{2}-\d{2}\.txt$/);
  });
});

describe("persistence", () => {
  it("flushes to localStorage on immediate flushes", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    try {
      logInfo("persist", "kept");
      setDebug(false); // flushNow()
      const saved = JSON.parse(store.get("pulse.logs") ?? "null") as {
        entries: { message: string }[];
      };
      expect(saved.entries.map((e) => e.message)).toContain("kept");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
