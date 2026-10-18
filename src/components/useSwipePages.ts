import { useRef } from "react";
import type { TouchEvent, MouseEvent } from "react";

export default function useSwipePages(onSwipe: (direction: number) => void) {
  const start = useRef<{x:number;y:number}|null>(null);
  const suppressUntil = useRef(0);
  return {
    onTouchStart(e: TouchEvent) {
      start.current = e.touches.length === 1 ? {x:e.touches[0].clientX,y:e.touches[0].clientY} : null;
    },
    onTouchCancel() { start.current = null; },
    onTouchEnd(e: TouchEvent) {
      const origin=start.current;
      start.current=null;
      if (!origin || e.touches.length || !e.changedTouches.length) return;
      const dx=e.changedTouches[0].clientX-origin.x;
      const dy=e.changedTouches[0].clientY-origin.y;
      if (Math.abs(dx)>=40 && Math.abs(dx)>Math.abs(dy)*1.5) {
        suppressUntil.current=Date.now()+500;
        onSwipe(dx<0?1:-1);
      }
    },
    onClickCapture(e: MouseEvent) {
      if(Date.now()<suppressUntil.current) { e.preventDefault(); e.stopPropagation(); }
    },
  };
}
