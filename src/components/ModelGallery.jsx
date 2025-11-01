// src/components/ModelGallery.jsx
import React, { useEffect, useState } from "react";
import ModelThumb from "./ModelThumb";
import "./modelgallery.css";

export default function ModelGallery({
  open,
  category,
  models,
  onClose,
  onSelect,
  isCategoryGallery = false,
}) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setVisible(true);
      setClosing(false);
    } else {
      setClosing(true);
      const timer = setTimeout(() => setVisible(false), 300); // Duración de la animación
      return () => clearTimeout(timer);
    }
  }, [open]);

  if (!visible) return null;

  const handleSelect = (item) => {
    if (isCategoryGallery) {
      onSelect(item);
    } else {
      const modelUrl = `/moldes/${encodeURIComponent(category)}/${encodeURIComponent(item)}`;
      onSelect(modelUrl, item);
    }
  };

  const getIconUrl = (categoryName) => {
    const formattedName = String(categoryName)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return `/iconos/${formattedName}.svg`;
  };

  return (
    <div className={`gallery-modal ${closing ? "closing" : ""}`}>
      <div className="gallery-backdrop" onClick={onClose}></div>
      <div className="gallery-content">
        <div className="gallery-header">
          <h2>{category}</h2>
          <button className="close-btn" onClick={onClose} aria-label="Cerrar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="gallery-grid">
          {models.length > 0 ? (
            models.map((item) =>
              isCategoryGallery ? (
                <button key={item} className="category-btn" onClick={() => handleSelect(item)}>
                  <img src={getIconUrl(item)} alt={item} className="category-icon" />
                  <span className="category-name">{item}</span>
                </button>
              ) : (
                <ModelThumb
                  key={item}
                  modelUrl={`/moldes/${encodeURIComponent(category)}/${encodeURIComponent(item)}`}
                  fileName={item}
                  onClick={() => handleSelect(item)}
                />
              )
            )
          ) : (
            <div className="gallery-empty">
              No hay {isCategoryGallery ? "categorías" : "modelos"} disponibles.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}