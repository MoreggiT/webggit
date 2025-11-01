// src/components/DesignsPanel.jsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import DesignThumbBtn from "./DesignThumbBtn";
import "./designs-panel.css";

/**
 * Panel de Diseños
 * - Desktop: sección fija en sidebar.
 * - Mobile: bottom sheet dentro del slot (usa .designs-panel-modern + .is-open).
 *
 * Props esperadas (ya presentes en tu App):
 *  - isMobile, open, onClose
 *  - selectedCat, hasModel
 *  - designList (string[])
 *  - designThumbs: { [name]: dataUrl | "__ERR__" }
 *  - handleSelectDesign(name)
 *  - ensureDesignThumb(name)
 */
export default function DesignsPanel({
  open,
  onClose,
  isMobile,
  selectedCat,
  hasModel,
  designList,
  designThumbs,
  handleSelectDesign,
  ensureDesignThumb,
}) {
  // === Enhancements de UX ===
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Filtrado suave: ignora tildes y separadores
  const normalize = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_\-.]+/g, " ")
      .toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return designList || [];
    return (designList || []).filter((name) => normalize(name).includes(q));
  }, [designList, q]);

  // Prefetch thumbnails on hover/viewport
  const gridRef = useRef(null);
  useEffect(() => {
    if (!gridRef.current || !hasModel || !selectedCat) return;
    const items = Array.from(gridRef.current.querySelectorAll("[data-design]"));
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  const d = entry.target.getAttribute("data-design");
                  if (d) ensureDesignThumb?.(d);
                }
              });
            },
            { root: gridRef.current, rootMargin: "120px" }
          )
        : null;

    items.forEach((el) => io?.observe?.(el));
    return () => io?.disconnect?.();
  }, [filtered, hasModel, selectedCat, ensureDesignThumb]);

  // Estado vacío
  const EmptyState = ({ text }) => (
    <div className="dp-empty-small" role="status" aria-live="polite">
      {text}
    </div>
  );

  // Header compacto reutilizable
  const PanelHeader = ({ title, subtitle }) => (
    <header className="dp-header">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {subtitle ? (
          <span
            style={{
              fontSize: "0.8rem",
              color: "var(--dp-text-2)",
              fontWeight: 500,
            }}
            aria-label="Categoría actual"
          >
            {subtitle}
          </span>
        ) : null}
      </div>
      {isMobile ? (
        <button className="dp-close-btn" onClick={onClose} title="Cerrar">
          ✕
        </button>
      ) : null}
    </header>
  );

  // Barra de búsqueda (solo si hay diseños)
  const SearchBar = () =>
    (designList?.length || 0) > 8 ? (
      <div style={{ padding: "0 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--dp-pill-bg)",
            border: "1px solid var(--dp-pill-br)",
            borderRadius: 10,
            padding: "8px 10px",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="search"
            placeholder="Buscar diseño…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: "100%",
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: "0.95rem",
              color: "var(--dp-text)",
            }}
            aria-label="Buscar diseño"
          />
          {query && (
            <button
              type="button"
              className="dp-close-btn"
              onClick={() => setQuery("")}
              title="Limpiar"
              aria-label="Limpiar búsqueda"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    ) : null;

  // Grid de items
  const Grid = () => {
    if (!selectedCat || !hasModel)
      return <EmptyState text="Elegí un molde y un modelo para habilitar." />;

    if ((designList?.length || 0) === 0)
      return <EmptyState text="No hay diseños para esta categoría." />;

    if ((filtered?.length || 0) === 0)
      return <EmptyState text="Sin resultados para tu búsqueda." />;

    return (
      <div ref={gridRef} className="design-grid" role="list">
        {filtered.map((d) => {
          const img =
            designThumbs[d] && designThumbs[d] !== "__ERR__"
              ? designThumbs[d]
              : undefined;

          return (
            <div
              key={d}
              data-design={d}
              role="listitem"
              onMouseEnter={() => ensureDesignThumb?.(d)}
            >
              <DesignThumbBtn
                name={d}
                img={img}
                disabled={!hasModel}
                onClick={() => handleSelectDesign(d)}
                ensure={() => ensureDesignThumb?.(d)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  // DESKTOP: sección fija en la sidebar
  if (!isMobile) {
    const count = designList?.length || 0;
    return (
      <section className="sec sec-designs" aria-labelledby="title-designs">
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h3 id="title-designs" style={{ margin: 0 }}>
            📐 Diseños
          </h3>
          <small
            style={{ color: "var(--dp-text-2)", fontWeight: 500 }}
            aria-live="polite"
          >
            {selectedCat ? `${selectedCat} • ${count}` : `${count}`}
          </small>
        </div>

        <SearchBar />
        <div style={{ height: 12 }} />
        <Grid />
      </section>
    );
  }

  // MOBILE: bottom sheet / drawer dentro del slot
  return (
    <aside className={`designs-panel-modern ${open ? "is-open" : ""}`}>
      <PanelHeader
        title="📐 Diseños"
        subtitle={
          selectedCat
            ? `${selectedCat} • ${designList?.length || 0}`
            : undefined
        }
      />
      <div className="dp-body">
        <SearchBar />
        {designList?.length ? <div style={{ height: 8 }} /> : null}
        <Grid />
      </div>
    </aside>
  );
}
