// src/components/ColorsPanel.jsx
import React from "react";
import "./colors-panel.css"; // Importamos sus estilos

export default function ColorsPanel({
  open,
  onClose,
  isMobile,
  editMode,
  setEditMode,
  selectedDesign,
  globalLayers,
  visiblePieces,
  selectedKey,
  togglePiece,
  openPaletteForLayer,
  currentHexFor, // ¡Función helper pasada como prop!
}) {

  const content = (
    <>
      <div className="colorhub__header">
        <div className="colorhub__title">
          <span className="emoji">🎨</span>
          <div className="titles">
            <div className="h1">Seleccionar color</div>
            <div className="sub">Modo: <strong>{editMode === "global" ? "general" : "por pieza"}</strong></div>
          </div>
        </div>
        <div className="chip" role="group">
          <button className="btn" onClick={() => setEditMode("global")} aria-pressed={editMode === "global"}>General</button>
          <button className="btn" onClick={() => setEditMode("per-piece")} aria-pressed={editMode === "per-piece"}>Por pieza</button>
        </div>
      </div>
      <div className="objpane flat">
        {!selectedDesign ? (
          <div className="objpane-empty big">Elegí un <strong>diseño</strong> para ver opciones.</div>
        ) : editMode === "global" ? (
          globalLayers.length === 0 ? (
            <div className="objpane-empty">No se detectaron capas de “diseño”.</div>
          ) : (
            <div className="layer-list">
              {globalLayers.map((L) => (
                <button key={L.name} className="layer-row" onClick={(e) => openPaletteForLayer(e, { mode: "global", layerName: L.name, refs: L.refs })} title={`Cambiar ${L.name}`}>
                  <span className="row-left">
                    <span className="swatch-lg" style={{ background: L.hex || "#000000" }} />
                    <span className="layer-name">{L.name}</span>
                  </span>
                  <span className="row-hex">{(L.hex || "#000000").toUpperCase()}</span>
                </button>
              ))}
            </div>
          )
        ) : visiblePieces.length === 0 ? (
          <div className="objpane-empty">Este diseño no tiene SVG asignado.</div>
        ) : (
          visiblePieces.map((p) => {
            const objects = p.objects || [];
            const isOpen = selectedKey === p.nameBase;
            return (
              <div key={p.nameBase} className="piece-block">
                <button className={`piece-toggle ${isOpen ? "is-open" : ""}`} onClick={() => togglePiece(p.nameBase)} title={`Pieza: ${p.nameBase}`}>
                  <span className="piece-toggle__name">{p.nameBase}</span>
                  <svg className={`chev ${isOpen ? "up" : "down"}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    {isOpen ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
                  </svg>
                </button>
                {isOpen && objects.length > 0 && (
                  <div className="layer-list">
                    {objects.map((o) => {
                      // Usamos la función helper pasada por props
                      const currentHex = currentHexFor(p, o); 
                      return (
                        <button key={`${p.nameBase}::${o.objectId}`} className="layer-row" onClick={(e) => openPaletteForLayer(e, { mode: "per-piece", pieceKey: p.nameBase, objectId: o.objectId })} title={`Color: ${currentHex}`}>
                          <span className="row-left">
                            <span className="swatch-lg" style={{ background: currentHex }} />
                            <span className="layer-name">{o.objectName}</span>
                          </span>
                          <span className="row-hex">{currentHex}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );

  // En modo escritorio, es una sección fija
  if (!isMobile) {
    return (
      <section className="sec colorhub compact">
        {content}
      </section>
    );
  }

  // En modo móvil, es un panel "cajón"
  return (
    <aside className={`colors-panel-modern ${open ? 'is-open' : ''}`}>
      <header className="cp-header">
        <h3>🎨 Colores</h3>
        <button className="cp-close-btn" onClick={onClose} title="Cerrar">✕</button>
      </header>
      <div className="cp-body">
        {content}
      </div>
    </aside>
  );
}