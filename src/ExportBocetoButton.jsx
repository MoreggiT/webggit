// src/ExportBocetoButton.jsx
import React, { useRef } from "react";

/**
 * Botón flotante “Descargar boceto” (look glassy).
 * - Fijo arriba-derecha, bajo el header.
 * - Estados: hover, active, disabled y focus visible.
 * - Accesible (aria-label) y navegable con teclado.
 *
 * Uso:
 *  <ExportBocetoButton onClick={handleOpenPreview} disabled={!hasModel} />
 */
export default function ExportBocetoButton({ onClick, disabled }) {
  const ref = useRef(null);

  const baseStyle = {
    position: "fixed",
    top: 10,                  // bajo el header de 56px (el header tiene blur)
    right: 12,
    zIndex: 1100,
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    fontWeight: 800,
    fontSize: 13,
    letterSpacing: ".2px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    color: "#0f172a",
    background: "rgba(255,255,255,.86)",
    boxShadow:
      "0 14px 32px rgba(15,23,42,.18), 0 6px 16px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.8)",
    backdropFilter: "saturate(120%) blur(10px)",

    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    transform: "translateY(0)",
    transition:
      "transform .12s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease",
  };

  function onEnter(e) {
    if (disabled) return;
    e.currentTarget.style.transform = "translateY(-1px)";
    e.currentTarget.style.boxShadow =
      "0 18px 42px rgba(15,23,42,.22), 0 8px 18px rgba(15,23,42,.12), inset 0 1px 0 rgba(255,255,255,.85)";
    e.currentTarget.style.borderColor = "#dbe3ef";
    e.currentTarget.style.background = "rgba(255,255,255,.94)";
  }
  function onLeave(e) {
    if (disabled) return;
    e.currentTarget.style.transform = "translateY(0)";
    e.currentTarget.style.boxShadow =
      "0 14px 32px rgba(15,23,42,.18), 0 6px 16px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.8)";
    e.currentTarget.style.borderColor = "var(--border)";
    e.currentTarget.style.background = "rgba(255,255,255,.86)";
  }
  function onDown(e) {
    if (disabled) return;
    e.currentTarget.style.transform = "translateY(0)";
  }
  function onUp(e) {
    if (disabled) return;
    e.currentTarget.style.transform = "translateY(-1px)";
  }

  function onFocus(e) {
    if (disabled) return;
    e.currentTarget.style.boxShadow =
      "0 18px 42px rgba(37,99,235,.22), 0 8px 18px rgba(37,99,235,.14), 0 0 0 3px rgba(59,130,246,.18), inset 0 1px 0 rgba(255,255,255,.9)";
    e.currentTarget.style.borderColor = "var(--accent)";
  }
  function onBlur(e) {
    if (disabled) return;
    onLeave(e);
  }

  return (
    <button
      ref={ref}
      aria-label="Descargar boceto (PDF con 4 vistas)"
      title="Descargar boceto (PDF con 4 vistas)"
      disabled={disabled}
      onClick={onClick}
      style={baseStyle}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onMouseDown={onDown}
      onMouseUp={onUp}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <DownloadIcon />
      Descargar boceto
    </button>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      <path
        d="M12 3v10m0 0l4-4m-4 4-4-4"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="15"
        width="16"
        height="6"
        rx="2"
        fill="rgba(59,130,246,.10)"
        stroke="var(--accent-100)"
      />
    </svg>
  );
}
