// src/components/TextPanel.jsx
import React, { useMemo, useState, useEffect } from "react";

const PRESETS = [
  { label: "Título", size: 140, weight: 900, lineHeight: 1.1 },
  { label: "Subtítulo", size: 96, weight: 800, lineHeight: 1.15 },
  { label: "Cuerpo", size: 64, weight: 700, lineHeight: 1.25 },
];

const FONTS = [
  'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  '"Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  '"Bebas Neue", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  '"Oswald", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
];

export default function TextPanel({
  open,
  onClose,
  onCreateText,
  initial = {},
}) {
  const [text, setText] = useState(initial.text ?? "TU TEXTO AQUÍ");
  const [fontSize, setFontSize] = useState(initial.fontSize ?? 128);
  const [fontFamily, setFontFamily] = useState(
    initial.fontFamily ?? FONTS[0]
  );
  const [color, setColor] = useState(initial.color ?? "#000000");
  const [strokeColor, setStrokeColor] = useState(
    initial.strokeColor ?? "#ffffff"
  );
  const [strokeWidth, setStrokeWidth] = useState(initial.strokeWidth ?? 0);
  const [align, setAlign] = useState(initial.align ?? "center"); // 'left'|'center'|'right'
  const [lineHeight, setLineHeight] = useState(initial.lineHeight ?? 1.2);
  const [padding, setPadding] = useState(initial.padding ?? 32);
  const [maxWidth, setMaxWidth] = useState(initial.maxWidth ?? 1400);

  useEffect(() => {
    if (!open) return;
    // Escape para cerrar
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const valid = useMemo(() => String(text).trim().length > 0, [text]);

  const applyPreset = (p) => {
    setFontSize(p.size);
    setLineHeight(p.lineHeight);
  };

  if (!open) return null;

  return (
    <aside className="right-drawer" role="dialog" aria-label="Texto sobre el 3D">
      <header className="rd-header">
        <div className="rd-title">
          <span className="emoji">📝</span>
          <div>
            <div className="h1">Texto sobre el modelo</div>
            <div className="sub">Se coloca como sticker plano, no 3D</div>
          </div>
        </div>
        <button className="icon-btn" title="Cerrar" onClick={onClose} aria-label="Cerrar panel">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="rd-body">
        <div className="form-block">
          <label className="lbl">Texto</label>
          <textarea
            className="inp textarea"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribí tu texto…"
          />
        </div>

        <div className="form-row">
          <div className="form-block">
            <label className="lbl">Tamaño (px)</label>
            <input
              className="inp"
              type="number"
              min={8}
              max={360}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </div>
          <div className="form-block">
            <label className="lbl">Interlineado</label>
            <input
              className="inp"
              type="number"
              step="0.05"
              min="0.8"
              max="2.0"
              value={lineHeight}
              onChange={(e) => setLineHeight(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-block">
          <label className="lbl">Fuente</label>
          <select
            className="inp"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
          >
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f.split(",")[0].replace(/"/g, "")}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <div className="form-block">
            <label className="lbl">Color</label>
            <input
              className="inp color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="Color del texto"
            />
          </div>
          <div className="form-block">
            <label className="lbl">Borde</label>
            <div className="row-actions">
              <input
                className="inp color"
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
                aria-label="Color del borde"
              />
              <input
                className="inp"
                type="number"
                min={0}
                max={40}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                title="Grosor"
                style={{ width: 90 }}
              />
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-block">
            <label className="lbl">Padding (px)</label>
            <input
              className="inp"
              type="number"
              min={0}
              max={200}
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
            />
          </div>
          <div className="form-block">
            <label className="lbl">Ancho máx. (px)</label>
            <input
              className="inp"
              type="number"
              min={200}
              max={4000}
              value={maxWidth}
              onChange={(e) => setMaxWidth(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="form-block">
          <label className="lbl">Alineación</label>
          <div className="chip" role="group" aria-label="Alineación">
            <button
              className="btn"
              aria-pressed={align === "left"}
              onClick={() => setAlign("left")}
              style={{
                borderRadius: "999px 0 0 999px",
                background: align === "left" ? "var(--accent)" : "var(--pill-bg)",
                color: align === "left" ? "#fff" : "inherit",
                borderColor: "var(--pill-br)",
              }}
            >
              Izq
            </button>
            <button
              className="btn"
              aria-pressed={align === "center"}
              onClick={() => setAlign("center")}
              style={{
                background: align === "center" ? "var(--accent)" : "var(--pill-bg)",
                color: align === "center" ? "#fff" : "inherit",
                borderColor: "var(--pill-br)",
              }}
            >
              Centro
            </button>
            <button
              className="btn"
              aria-pressed={align === "right"}
              onClick={() => setAlign("right")}
              style={{
                borderRadius: "0 999px 999px 0",
                background: align === "right" ? "var(--accent)" : "var(--pill-bg)",
                color: align === "right" ? "#fff" : "inherit",
                borderColor: "var(--pill-br)",
              }}
            >
              Der
            </button>
          </div>
        </div>

        <div className="form-block">
          <label className="lbl">Presets rápidos</label>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="btn"
                onClick={() => applyPreset(p)}
                title={`${p.label} · ${p.size}px`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className="rd-footer">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button
          className="btn-primary"
          disabled={!valid}
          onClick={() =>
            onCreateText?.({
              text,
              fontSize,
              fontFamily,
              color,
              strokeColor,
              strokeWidth,
              align,
              lineHeight,
              padding,
              maxWidth,
            })
          }
        >
          Agregar texto
        </button>
      </footer>
    </aside>
  );
}
