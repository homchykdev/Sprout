import { useRef } from "react";

interface PressHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Long-press (touch hold / mouse hold) gesture.
 * Fires `cb` once after `delay` ms without moving >12px.
 * The caller must ignore the click that follows the fire —
 * see `longPressGuard()` below.
 */
export function useLongPress(cb: () => void, delay = 500): PressHandlers {
  const t = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const clear = () => {
    if (t.current !== null) {
      window.clearTimeout(t.current);
      t.current = null;
    }
  };
  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      t.current = window.setTimeout(() => {
        t.current = null;
        fired.current = true;
        try {
          navigator.vibrate?.(10);
        } catch {
          /* ignore */
        }
        cbRef.current();
      }, delay);
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) {
        clear();
        start.current = null;
      }
    },
    onPointerUp: () => {
      clear();
      start.current = null;
    },
    onPointerLeave: () => {
      clear();
      start.current = null;
    },
    onPointerCancel: () => {
      clear();
      start.current = null;
    },
    onContextMenu: (e) => {
      // Swallow the menu that Android/desktop shows after a hold.
      if (fired.current) {
        e.preventDefault();
        fired.current = false;
      }
    },
  };
}

/**
 * Click guard: long-press is always followed by a click — the handler
 * that opens items must skip it. Usage: `markLongPress()` in the
 * long-press callback, `consumeLongPress()` first line of onTap.
 */
let lastFire = 0;
export const markLongPress = () => {
  lastFire = Date.now();
};
export const consumeLongPress = (windowMs = 600): boolean => {
  if (Date.now() - lastFire < windowMs) {
    lastFire = 0;
    return true;
  }
  return false;
};
