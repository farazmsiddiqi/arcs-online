import { useId, useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
export default function RuleHelp({ info, children, label, className = "" }) {
  const id = useId(),
    trigger = useRef(null),
    panel = useRef(null),
    timer = useRef(null);
  const [open, setOpen] = useState(false),
    [pinned, setPinned] = useState(false),
    [position, setPosition] = useState({ left: 0, top: 0 });
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    if (!pinned) timer.current = setTimeout(() => setOpen(false), 140);
  };
  const close = () => {
    clearTimeout(timer.current);
    setOpen(false);
    setPinned(false);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = trigger.current.getBoundingClientRect(),
        b = panel.current.getBoundingClientRect();
      setPosition({
        left: Math.max(12, Math.min(a.left, innerWidth - b.width - 12)),
        top: Math.max(
          12,
          a.top - b.height - 10 >= 12
            ? a.top - b.height - 10
            : Math.min(a.bottom + 10, innerHeight - b.height - 12),
        ),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, pinned]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if (
        e.type === "pointerdown" &&
        !trigger.current?.contains(e.target) &&
        !panel.current?.contains(e.target)
      )
        close();
    };
    document.addEventListener("keydown", dismiss, true);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss, true);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`rule-help ${className}`}
        aria-label={label ?? `What does ${info.title} do?`}
        aria-describedby={open ? id : undefined}
        aria-expanded={pinned}
        onMouseEnter={show}
        onMouseLeave={leave}
        onFocus={show}
        onBlur={leave}
        onClick={() => {
          clearTimeout(timer.current);
          if (pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
      >
        {children ?? <CircleHelp size={15} />}
      </button>
      {open &&
        createPortal(
          <aside
            ref={panel}
            id={id}
            className="rule-popover"
            role={pinned ? "dialog" : "tooltip"}
            aria-label={pinned ? `${info.title} explained` : undefined}
            style={position}
            onMouseEnter={() => clearTimeout(timer.current)}
            onMouseLeave={leave}
          >
            <div className="rule-popover-top">
              <span>
                FIELD GUIDE · {info.page ? "BASE RULES" : "YOUR PLAY"}
              </span>
              {pinned && (
                <button aria-label="Close explanation" onClick={close}>
                  <X size={15} />
                </button>
              )}
            </div>
            <h3>{info.title}</h3>
            <strong>{info.summary ?? info.subtitle}</strong>
            <p>{info.detail}</p>
            <div className="rule-example">{info.example}</div>
            <small>
              Leader and card abilities can modify these rules. The table offers
              legal choices.
            </small>
          </aside>,
          document.body,
        )}
    </>
  );
}
