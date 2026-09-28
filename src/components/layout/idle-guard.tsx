"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const KEY = "mishmarot:lastActivity";
const WARN_SECONDS = 60;
const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

function read(): number {
  try {
    return Number(localStorage.getItem(KEY)) || Date.now();
  } catch {
    return Date.now();
  }
}

function write(at: number) {
  try {
    localStorage.setItem(KEY, String(at));
  } catch {
    // private mode: the timer still works in this tab
  }
}

/**
 * Logs out after `minutes` without the user touching the app, in any open tab. Screens that
 * refresh by themselves (attendance) don't count as activity. A warning shows a minute before.
 */
export function IdleGuard({ minutes, onIdle }: { minutes: number; onIdle: () => Promise<void> }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const last = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    last.current = Date.now();
    write(last.current);
    let throttled = 0;
    const mark = () => {
      const now = Date.now();
      if (now - throttled < 5000) return;
      throttled = now;
      last.current = now;
      write(now);
    };
    for (const e of EVENTS) window.addEventListener(e, mark, { passive: true });
    const timer = setInterval(() => {
      if (done.current) return;
      const at = Math.max(last.current, read());
      const left = Math.round((at + minutes * 60_000 - Date.now()) / 1000);
      if (left <= 0) {
        done.current = true;
        void onIdle();
      } else {
        setSecondsLeft(left <= WARN_SECONDS ? left : null);
      }
    }, 1000);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, mark);
      clearInterval(timer);
    };
  }, [minutes, onIdle]);

  const stay = () => {
    last.current = Date.now();
    write(last.current);
    setSecondsLeft(null);
  };

  return (
    <Dialog
      open={secondsLeft !== null}
      onClose={stay}
      size="sm"
      title="עדיין כאן?"
      description={`מטעמי אבטחה, תנותקו מהמערכת בעוד ${secondsLeft ?? 0} שניות בגלל חוסר פעילות.`}
      footer={<Button onClick={stay}>להישאר מחובר/ת</Button>}
    >
      <span />
    </Dialog>
  );
}
