// src/components/DesignsPanel.jsx
import React from "react";
import DesignThumbBtn from "./DesignThumbBtn"; // Importamos el botón
import "./designs-panel.css"; // Importamos sus estilos

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
  
  // En modo escritorio, no es un panel "que se abre",
  // sino una sección fija. No renderizamos el contenedor.
  if (!isMobile) {
    return (
      <section className="sec sec-designs">
        <h3>📐 Diseños</h3>
        {selectedCat && hasModel ? (
          designList.length === 0 ? (
            <div className="small">No hay diseños para esta categoría.</div>
          ) : (
            <div className="design-grid">
              {designList.map((d) => (
                <DesignThumbBtn
                  key={d}
                  name={d}
                  img={designThumbs[d] && designThumbs[d] !== "__ERR__" ? designThumbs[d] : undefined}
                  disabled={!hasModel}
                  onClick={() => handleSelectDesign(d)}
                  ensure={() => ensureDesignThumb(d)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="small">Elegí un molde y un modelo para habilitar.</div>
        )}
      </section>
    );
  }

  // En modo móvil, renderizamos el panel "cajón"
  return (
    <aside className={`designs-panel-modern ${open ? 'is-open' : ''}`}>
      <header className="dp-header">
        <h3>📐 Diseños</h3>
        <button className="dp-close-btn" onClick={onClose} title="Cerrar">✕</button>
      </header>
      <div className="dp-body">
        {selectedCat && hasModel ? (
          designList.length === 0 ? (
            <div className="dp-empty-small">No hay diseños para esta categoría.</div>
          ) : (
            <div className="design-grid">
              {designList.map((d) => (
                <DesignThumbBtn
                  key={d}
                  name={d}
                  img={designThumbs[d] && designThumbs[d] !== "__ERR__" ? designThumbs[d] : undefined}
                  disabled={!hasModel}
                  onClick={() => handleSelectDesign(d)}
                  ensure={() => ensureDesignThumb(d)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="dp-empty-small">Elegí un molde y un modelo para habilitar.</div>
        )}
      </div>
    </aside>
  );
}

