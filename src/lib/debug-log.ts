/**
 * Debug log: ring buffer (~500 lines) persisted to localStorage.
 * Captures console.log/info/warn/error, window.onerror, unhandledrejection.
 * Restored on startup. Attaches as early as possible (root entry).
 */

export type DebugLogLevel = "log" | "info" | "warn" | "error";

export interface DebugLogEntry {
  ts: number;
  level: DebugLogLevel;
  args: unknown[];
}

const STORAGE_KEY = "sprout.debug-log";
const MAX_ENTRIES = 500;
const FLUSH_DELAY_MS = 2000;

let buffer: DebugLogEntry[] = [];
let restored = false;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let originalConsole: Console | null = null;
let installed = false;

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, entries: buffer }));
  } catch {
    // quota exceeded or unavailable
  }
}

function scheduleFlush(): void {
  if (flushTimer !== undefined) return;
  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    persist();
  }, FLUSH_DELAY_MS);
}

function push(level: DebugLogLevel, args: unknown[]): void {
  buffer.push({ ts: Date.now(), level, args });
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  scheduleFlush();
}

function restore(): void {
  if (restored) return;
  restored = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.v === 1 && Array.isArray(parsed.entries)) {
        buffer = parsed.entries.slice(-MAX_ENTRIES);
      }
    }
  } catch {
    // ignore corrupt storage
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) {
        return `${a.name}: ${a.message}\n${a.stack ?? ""}`;
      }
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

export function getDebugLogs(): DebugLogEntry[] {
  restore();
  return [...buffer];
}

export function clearDebugLogs(): void {
  buffer = [];
  persist();
}

export function exportDebugLogs(): string {
  restore();
  const header = `Sprout Debug Log · ${new Date().toISOString()} · entries: ${buffer.length}`;
  const lines = buffer.map(
    (e) => `${new Date(e.ts).toISOString()} [${e.level.toUpperCase()}] ${formatArgs(e.args)}`,
  );
  return [header, ...lines].join("\n");
}

export function installDebugLog(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  restore();

  // Wrap console methods
  originalConsole = { ...console };
  const levels: DebugLogLevel[] = ["log", "info", "warn", "error"];
  for (const level of levels) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(level, args);
      orig(...args);
    };
  }

  // Global error handlers
  window.addEventListener("error", (event) => {
    push("error", [
      "Uncaught error",
      event.error ?? `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
    ]);
  });

  window.addEventListener("unhandledrejection", (event) => {
    push("error", ["Unhandled rejection", event.reason]);
  });

  // Flush on page hide / visibility change
  for (const evt of ["pagehide", "visibilitychange"] as const) {
    window.addEventListener(evt, () => {
      if (evt === "visibilitychange" && document.visibilityState !== "hidden") return;
      if (flushTimer !== undefined) {
        clearTimeout(flushTimer);
        flushTimer = undefined;
        persist();
      }
    });
  }

  // Session marker
  push("info", [
    "Session start",
    `ua=${navigator.userAgent}`,
    `platform=${navigator.platform}`,
    `screen=${window.screen.width}x${window.screen.height}`,
    `dpr=${window.devicePixelRatio}`,
    `viewport=${window.innerWidth}x${window.innerHeight}`,
  ]);
}

export function getDebugLogStatus(): {
  installed: boolean;
  restored: boolean;
  entries: number;
  bufferSize: number;
} {
  return {
    installed,
    restored,
    entries: buffer.length,
    bufferSize: MAX_ENTRIES,
  };
}
