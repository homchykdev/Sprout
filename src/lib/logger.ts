// On-device app journal: facts about how the app runs and what fails, so the
// user can export one text file from Settings instead of hooking up logcat
// or browser dev tools. Entries live in a memory ring buffer and flush to
// localStorage. Privacy rules: never log keys, prompts or chat contents —
// only facts (status, duration, model, route) with secrets redacted.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  ts: number;
  level: LogLevel;
  /** Short module marker, e.g. "app", "ai", "backup", "voice". */
  tag: string;
  message: string;
  /** Optional extra facts, already serialized and redacted. */
  data?: string;
}

interface LogEnvelope {
  v: 1;
  /** Verbose logging on — debug entries are kept. */
  debug: boolean;
  entries: LogEntry[];
}

const STORAGE_KEY = "pulse.logs";
const MAX_ENTRIES = 300;
const MESSAGE_LIMIT = 2000;
const DATA_LIMIT = 1000;
const FLUSH_DELAY_MS = 1500;

const SECRET_PATTERNS: [RegExp, string][] = [
  [/AIza[0-9A-Za-z_-]{15,}/g, "AIza…"],
  [/sk-[A-Za-z0-9_-]{8,}/g, "sk-…"],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, "Bearer …"],
  [/ghp_[A-Za-z0-9]{10,}/g, "ghp_…"],
  // Anything that looks like a long opaque token (base64-ish / hex), 45+ chars.
  [/\b[A-Za-z0-9_-]{45,}\b/g, "…(long token)"],
];

/** Masks known secret shapes so they never reach the exported file. */
export function redact(text: string): string {
  let out = text;
  for (const [re, mask] of SECRET_PATTERNS) out = out.replace(re, mask);
  return out;
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Errors keep message + stack + cause chain (like server-side describeError). */
function describeValue(value: unknown): string {
  if (value instanceof Error) {
    const parts = [value.stack ?? `${value.name}: ${value.message}`];
    let cause: unknown = value.cause;
    for (let i = 0; i < 3 && cause instanceof Error; i++) {
      parts.push(`caused by: ${cause.stack ?? `${cause.name}: ${cause.message}`}`);
      cause = cause.cause;
    }
    return parts.join("\n");
  }
  return typeof value === "string" ? value : safeStringify(value);
}

function state(): LogEnvelope {
  let box = mem;
  if (!box) {
    let saved: LogEnvelope | undefined;
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<LogEnvelope> | null;
          if (parsed && Array.isArray(parsed.entries))
            saved = { v: 1, debug: !!parsed.debug, entries: parsed.entries as LogEntry[] };
        }
      }
    } catch {
      // Corrupt or unavailable storage — start fresh, memory only.
    }
    box = mem = saved ?? { v: 1, debug: false, entries: [] };
  }
  return box;
}

let mem: LogEnvelope | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flushNow(): void {
  flushTimer = undefined;
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state()));
  } catch {
    // Quota/unavailable — journal stays in memory until next attempt.
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined || typeof setTimeout !== "function") return;
  flushTimer = setTimeout(flushNow, FLUSH_DELAY_MS);
}

function push(entry: LogEntry): void {
  const s = state();
  s.entries.push(entry);
  if (s.entries.length > MAX_ENTRIES) s.entries.splice(0, s.entries.length - MAX_ENTRIES);
  scheduleFlush();
}

function log(level: LogLevel, tag: string, message: string, data?: unknown): void {
  if (level === "debug" && !isDebug()) return;
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    tag,
    message: truncate(redact(message), MESSAGE_LIMIT),
  };
  if (data !== undefined) {
    const extra = truncate(
      redact(data instanceof Error ? describeValue(data) : safeStringify(data)),
      DATA_LIMIT,
    );
    if (extra) entry.data = extra;
  }
  push(entry);
}

export const logDebug = (tag: string, message: string, data?: unknown) =>
  log("debug", tag, message, data);
export const logInfo = (tag: string, message: string, data?: unknown) =>
  log("info", tag, message, data);
export const logWarn = (tag: string, message: string, data?: unknown) =>
  log("warn", tag, message, data);
export const logError = (tag: string, message: string, data?: unknown) =>
  log("error", tag, message, data);

export function getLogs(): LogEntry[] {
  return state().entries;
}

export function clearLogs(): void {
  state().entries = [];
  flushNow();
}

export function isDebug(): boolean {
  return state().debug;
}

export function setDebug(on: boolean): void {
  state().debug = on;
  flushNow();
}

/** pulse-logs-YYYY-MM-DD.txt */
export function logsFileName(day = new Date().toISOString().slice(0, 10)): string {
  return `pulse-logs-${day}.txt`;
}

/** Stable human-readable export, one entry per line. */
export function formatLogs(entries: LogEntry[] = getLogs()): string {
  const header = `Журнал Пульс · ${new Date().toISOString()} · записей: ${entries.length}`;
  const lines = [...entries].map((e) => {
    const head = `${new Date(e.ts).toISOString()} [${e.level}] ${e.tag}: ${e.message}`;
    return e.data ? `${head}\n    ${e.data}` : head;
  });
  return [header, ...lines].join("\n");
}

/**
 * Wires the client's global failure sources into the journal: console.warn /
 * console.error, uncaught errors and unhandled rejections. Idempotent, runs
 * only in the browser (this app is SSR'd by TanStack Start, not in tests).
 */
export function installJournal(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  // Session marker: once per app run, minimal facts only.
  const where = `screen ${window.screen.width}x${window.screen.height} · ${navigator.language}`;
  logInfo("app", "Session started", where);

  const wrap = (name: "warn" | "error") => {
    const original = console[name].bind(console);
    console[name] = (...args: unknown[]) => {
      try {
        log(name, "console", args.map(describeValue).join(" "));
      } catch {
        // Never let journaling break real logging.
      }
      original(...args);
    };
  };
  wrap("warn");
  wrap("error");

  window.addEventListener("error", (event) => {
    if (event.error) logError("window", "Uncaught error", event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    logError("window", "Unhandled rejection", (event as PromiseRejectionEvent).reason);
  });

  // Flush synchronously when the app goes to background or closes.
  for (const evt of ["pagehide", "visibilitychange"] as const) {
    window.addEventListener(evt, () => {
      if (evt === "visibilitychange" && document.visibilityState !== "hidden") return;
      if (flushTimer !== undefined) flushNow();
    });
  }
}

let installed = false;
