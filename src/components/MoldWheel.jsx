// src/components/MoldWheel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./moldwheel.css";

export default function MoldWheel({
  categories = [],
  selected = null,
  onSelect,
  centerLabel = "MOLDES",
  visibleSlots = 5,
  arcDeg = 200,
  ringRadius = 180,
  thickness = 140,
  centerSize = 128,
  bottomOffset = 0,
  gapDeg = 5,
  textLift = 0.24,
  iconBias = 0.02,
  defaultOpen = true,
  animMs = 260,
  iconFollowSlot = true,

  /** 🔽 NUEVO: config de iconos */
  iconBasePath = "/iconos",        // carpeta dentro de /public
  iconSize = 80,                   // tamaño del ícono en px dentro del slot
  iconMap = null,                  // { "Basquet": "basketball.svg", "Futbol": "soccer.svg" }
}) {
  const SLOTS = clamp(visibleSlots, 5, 7);

  const items = useMemo(() => {
    const a = categories.slice(0, SLOTS);
    while (a.length < SLOTS) a.push(null);
    return a;
  }, [categories, SLOTS]);

  const [offset, setOffset] = useState(0);
  const midIndex = Math.floor(SLOTS / 2);
  useEffect(() => {
    if (!selected) return;
    const i = items.findIndex((x) => x === selected);
    if (i < 0) return;
    let off = (midIndex - i) % SLOTS;
    if (off < 0) off += SLOTS;
    setOffset(off);
  }, [selected, items, SLOTS, midIndex]);

  const [open, setOpen] = useState(!!defaultOpen);

  const rootRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onWheel = (e) => {
      if (!open) return;
      const d =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!d) return;
      e.preventDefault();
      setOffset((o) => ((o + Math.sign(d)) % SLOTS + SLOTS) % SLOTS);
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    let sx = 0,
      sy = 0,
      moved = false;
    const ts = (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      moved = false;
    };
    const tm = () => {
      moved = true;
    };
    const te = (e) => {
      if (!open || !moved) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      const mag = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(mag) > 24)
        setOffset((o) => ((o + Math.sign(-dx || -dy)) % SLOTS + SLOTS) % SLOTS);
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: true });
    el.addEventListener("touchend", te, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
    };
  }, [SLOTS, open]);

  // Geometría
  const outerR = ringRadius + thickness / 2;
  const innerR = ringRadius - thickness / 2;
  const startDeg = 90 + arcDeg / 2;
  const stepDeg = arcDeg / SLOTS;

  // 🔽 NUEVO: resolver ruta del ícono
  const resolveIconHref = useMemo(() => {
    return (item) => {
      if (!item) return null;
      if (iconMap && iconMap[item]) {
        return joinUrl(iconBasePath, iconMap[item]);
      }
      const slug = slugify(String(item));
      return joinUrl(iconBasePath, `${slug}.svg`);
    };
  }, [iconBasePath, iconMap]);

  const slots = useMemo(() => {
    const halfGap = gapDeg / 2;
    return Array.from({ length: SLOTS }, (_, visIndex) => {
      const srcIndex = (visIndex - offset + SLOTS) % SLOTS;
      const item = items[srcIndex];

      const rawStart = startDeg - visIndex * stepDeg;
      const rawEnd = rawStart - stepDeg;
      const segStart = rawStart - halfGap;
      const segEnd = rawEnd + halfGap;

      const centerDeg = (segStart + segEnd) / 2;
      const centerA = degToRad(centerDeg);

      const rCenter =
        innerR + (outerR - innerR) * (0.5 + clamp(iconBias, -0.2, 0.2));
      const iconX = Math.cos(centerA) * rCenter;
      const iconY = -Math.sin(centerA) * rCenter;
      const iconRot = iconFollowSlot ? centerDeg - 90 : 0;

      const iconHref = item ? resolveIconHref(item) : null;

      return {
        item,
        visIndex,
        srcIndex,
        path: straightSlicePath(innerR, outerR, segStart, segEnd),
        iconX,
        iconY,
        iconRot,
        iconHref,
      };
    });
  }, [
    items,
    offset,
    SLOTS,
    startDeg,
    stepDeg,
    innerR,
    outerR,
    gapDeg,
    iconBias,
    iconFollowSlot,
    resolveIconHref,
  ]);

  // Medidas y “liberar espacio” cuando está cerrado
  const w = outerR * 2 + 40;
  const hOpen = outerR + centerSize * 0.7;
  const hClosed = centerSize + 24;
  const viewBox = `-${w / 2} -${hOpen} ${w} ${hOpen}`;
  const hubR = centerSize / 2;
  const rootHeight = open ? hOpen : hClosed;

  function handleClick(item) {
    if (item) onSelect?.(item);
  }
  function toggleOpen() {
    setOpen((o) => !o);
  }

  const svgPointer = open ? "auto" : "none";

  return (
    <div
      className="mw-root"
      ref={rootRef}
      style={{ height: rootHeight }}
      aria-label="Selector radial"
    >
      <div
        className="mw-stage"
        style={{ left: "50%", bottom: bottomOffset, transform: "translateX(-50%)" }}
      >
        <svg
          className="mw-fan"
          width={w}
          height={hOpen}
          viewBox={viewBox}
          style={{ pointerEvents: svgPointer }}
        >
          <g
            className="mw-slots"
            style={{
              pointerEvents: open ? "auto" : "none",
              opacity: open ? 1 : 0,
              transform: open
                ? "translateY(0px) scale(1)"
                : "translateY(22px) scale(0.92)",
              transformOrigin: "50% 100%",
              transition: `transform ${animMs}ms ease, opacity ${animMs}ms ease`,
            }}
          >
            {slots.map((s, i) => {
              const isSelected =
                open && s.item && s.item === selected && i === Math.floor(SLOTS / 2);
              const isEmpty = !s.item;

              return (
                <g
                  key={`segbtn-${i}`}
                  className={`mw-segbtn ${isSelected ? "is-selected" : ""} ${
                    isEmpty ? "is-empty" : ""
                  }`}
                  onClick={() => handleClick(s.item)}
                  role="button"
                >
                  <path className="seg-surface" d={s.path} />
                  <g
                    className="mw-icon"
                    transform={`translate(${s.iconX} ${s.iconY}) rotate(${s.iconRot})`}
                  >
                    {isEmpty ? (
                      <PlusIcon />
                    ) : (
                      <>
                        {/* Fallback por detrás */}
                        <MiniJersey />
                        {/* Ícono externo SVG centrado */}
                        <image
                          href={s.iconHref}
                          width={iconSize}
                          height={iconSize}
                          x={-iconSize / 2}
                          y={-iconSize / 2}
                          className="mw-icon-img"
                          onError={(e) => {
                            // si no se carga, ocultamos la imagen y queda el fallback
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </>
                    )}
                  </g>
                </g>
              );
            })}
          </g>

          {/* HUB — SIEMPRE CLICKEABLE AUN CUANDO EL SVG ESTÁ pointer-events:none */}
          <g
            className="mw-hub-btn"
            onClick={toggleOpen}
            role="button"
            aria-label={open ? "Ocultar opciones" : "Mostrar opciones"}
            style={{ pointerEvents: "auto", cursor: "pointer" }}
          >
            <circle className="mw-hub" cx="0" cy="0" r={hubR} />
            <path
              d={open ? "M -8,-2 L 0,6 L 8,-2 Z" : "M -8,2 L 0,-6 L 8,2 Z"}
              transform={`translate(0 ${-hubR * 0.55})`}
              fill="#9aa7b6"
            />
            <text className="mw-hub-label" x="0" y={-hubR * textLift}>
              {centerLabel}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ===== Helpers ===== */
function degToRad(d) {
  return (d * Math.PI) / 180;
}

function straightSlicePath(rIn, rOut, startDeg, endDeg) {
  const a0 = degToRad(startDeg);
  const a1 = degToRad(endDeg);
  const delta = ((startDeg - endDeg) % 360 + 360) % 360;
  const large = delta > 180 ? 1 : 0;

  const x0 = Math.cos(a0) * rOut,
    y0 = -Math.sin(a0) * rOut;
  const x1 = Math.cos(a1) * rOut,
    y1 = -Math.sin(a1) * rOut;
  const xi1 = Math.cos(a1) * rIn,
    yi1 = -Math.sin(a1) * rIn;
  const xi0 = Math.cos(a0) * rIn,
    yi0 = -Math.sin(a0) * rIn;

  return [
    `M ${x0} ${y0}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${x1} ${y1}`,
    `L ${xi1} ${yi1}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${xi0} ${yi0}`,
    `L ${x0} ${y0}`,
    `Z`,
  ].join(" ");
}

/* ===== Iconos centrados en 0,0 ===== */
function PlusIcon() {
  return (
    <g transform="translate(-11 -11)" aria-hidden>
      <rect x="0" y="0" width="22" height="22" fill="none" />
      <path
        d="M11 4v14M4 11h14"
        stroke="#9aa7b6"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  );
}
function MiniJersey() {
  return (
    <g transform="translate(-20 -20)" aria-hidden>
      <rect x="0" y="0" width="40" height="40" fill="none" />
      <path
        d="M8 8l8-3 8 3 4 6-3 1-1 18H12L11 15l-3-1 4-6Z"
        fill="#eef2f7"
        stroke="#cbd5e1"
        strokeWidth="1.6"
      />
      <rect
        x="12"
        y="16"
        width="16"
        height="18"
        rx="3"
        fill="#ffffff"
        stroke="#e5e7eb"
      />
    </g>
  );
}

/* Utils */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/* 🔽 Helpers para íconos */
function slugify(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
function joinUrl(base, path) {
  if (!base) return path || "";
  if (!path) return base;
  return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}
