// src/components/ModelGallery.jsx
import React, { useEffect, useMemo } from "react";
import "./modelgallery.css";
import ModelThumb from "./ModelThumb";

/**
 * Galería de modelos (modal sobre la rueda)
 * - Centrada horizontalmente en el viewport 3D
 * - Cada tarjeta es un botón con preview 3D (sin botón “Usar”)
 *
 * Props:
 *  - open: boolean
 *  - category: string
 *  - models: string[]                      // nombres de archivos .glb
 *  - onClose: ()=>void
 *  - onSelect: (url: string, fileName: string)=>void
 *  - buildUrl?: (file: string)=>string     // opcional
 *  - anchorXPercent?: number               // 0..100, origen X de animación (base); default 50
 */
export default function ModelGallery({
  open = false,
  category = "",
  models = [],
  onClose,
  onSelect,
  buildUrl,
  anchorXPercent = 50,
}) {
  // Hooks SIEMPRE (no condicional) para cumplir reglas
  const makeUrl = useMemo(() => {
    if (typeof buildUrl === "function") return buildUrl;
    return (file) =>
      `/moldes/${encodeURIComponent(category)}/${encodeURIComponent(file)}`;
  }, [buildUrl, category]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const label = category ? `Modelos – ${category}` : "Modelos";
  if (!open) return null;

  return (
    <div className="mg-backdrop" onClick={onClose}>
      <div
        className="mg-modal"
        role="dialog"
        aria-label={label}
        onClick={(e) => e.stopPropagation()} // no cerrar al click interno
        style={{ "--mg-anchor-x": `${anchorXPercent}%` }}
      >
        <div className="mg-header">
          <div className="mg-title">{label}</div>
          <button className="mg-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        <div className="mg-grid">
          {models?.length ? (
            models.map((file) => {
              const url = makeUrl(file);
              return (
                <ModelThumb
                  key={file}
                  modelUrl={url}
                  fileName={file}
                  onUse={() => onSelect?.(url, file)}
                />
              );
            })
          ) : (
            <div className="mg-empty">
              <EmptyIcon />
              <div>No hay modelos en esta categoría.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="6" width="18" height="12" rx="3" stroke="#94a3b8" />
      <path d="M3 9h18" stroke="#94a3b8" />
      <path d="M9 6l1.2 1.6a2 2 0 0 0 1.6.8H21" stroke="#94a3b8" />
    </svg>
  );
}