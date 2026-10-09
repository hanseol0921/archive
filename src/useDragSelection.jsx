import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./styles/DragSelection.css";
export default function useDragSelection({ selected, onChange, disabled = false }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const frame = useRef(0);
  const [box, setBox] = useState(null);
  useEffect(() => () => { cancelAnimationFrame(frame.current); }, []);
  function stop(event) {
    if (!drag.current) return;
    cancelAnimationFrame(frame.current);
    drag.current = null;
    setBox(null);
    if (ref.current?.hasPointerCapture(event.pointerId)) ref.current.releasePointerCapture(event.pointerId);
  }
  function start(event) {
    if (disabled || event.button !== 0 || event.pointerType === "touch" || event.target.closest("input,button,select,textarea,a,label,summary,video,.crop-preview,[data-no-drag-select]")) return;
    const root = ref.current;
    if (!root.querySelector("[data-drag-select-id]")) return;
    event.preventDefault();
    root.setPointerCapture(event.pointerId);
    const scroll = getComputedStyle(root).overflowY.match(/auto|scroll/) ? root : document.scrollingElement;
    const current = { x: event.clientX, y: event.clientY, endX: event.clientX, endY: event.clientY, scroll, scrollTop: scroll.scrollTop, base: event.ctrlKey || event.metaKey || event.shiftKey ? selected : [], active: false };
    drag.current = current;
    function tick() {
      if (drag.current !== current) return;
      const bounds = scroll === root ? root.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      if (current.active) {
        const speed = current.endY < bounds.top + 36 ? -12 : current.endY > bounds.bottom - 36 ? 12 : 0;
        scroll.scrollTop += speed;
        const originY = current.y - (scroll.scrollTop - current.scrollTop);
        const area = { left: Math.min(current.x,current.endX), top: Math.min(originY,current.endY), right: Math.max(current.x,current.endX), bottom: Math.max(originY,current.endY) };
        const hits = [...root.querySelectorAll("[data-drag-select-id]")].filter((node) => { const r = node.getBoundingClientRect(); return r.right > area.left && r.left < area.right && r.bottom > area.top && r.top < area.bottom; }).map((node) => node.dataset.dragSelectId);
        const next = [...new Set([...current.base, ...hits])];
        const signature = JSON.stringify(next);
        if (signature !== current.lastSelection) { onChange(next); current.lastSelection = signature; }
        setBox({ left: area.left, top: Math.max(bounds.top,area.top), width: area.right-area.left, height: Math.max(0,Math.min(bounds.bottom,area.bottom)-Math.max(bounds.top,area.top)) });
      }
      frame.current = requestAnimationFrame(tick);
    }
    frame.current = requestAnimationFrame(tick);
  }
  function move(event) {
    const current = drag.current;
    if (!current) return;
    current.endX = event.clientX; current.endY = event.clientY;
    if (Math.hypot(current.endX-current.x,current.endY-current.y) > 5) current.active = true;
  }
  return { ref, onPointerDown: start, onPointerMove: move, onPointerUp: stop, onPointerCancel: stop, onLostPointerCapture: stop, overlay: box ? createPortal(<div className="drag-selection-box" style={box} />, document.body) : null };
}
