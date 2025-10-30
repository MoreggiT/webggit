// src/components/TextPanel.jsx
import React, { useState, useEffect, useCallback } from "react";
// 1. Importaremos un archivo CSS nuevo que te daré en el próximo paso
import "./TextPanel.css"; 

// Definimos las fuentes aquí para que sea fácil agregar más
const FONT_OPTIONS = [
  { name: "Inter", value: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { name: "Montserrat", value: '"Montserrat", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { name: "Poppins", value: '"Poppins", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { name: "Bebas Neue", value: '"Bebas Neue", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { name: "Oswald", value: '"Oswald", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
];

const FONT_WEIGHTS = [
  { name: "Light", value: 300 },
  { name: "Regular", value: 400 },
  { name: "Medium", value: 500 },
  { name: "Semi-Bold", value: 600 },
  { name: "Bold", value: 700 },
  { name: "Extra-Bold", value: 800 },
  { name: "Black", value: 900 },
];

export default function TextPanel({
  open,
  onClose,
  onCreateText,
  onUpdateText,
  initialData,  
  editingData,  
}) {
  
  const [formState, setFormState] = useState(initialData);
  const isEditMode = !!editingData;

  // 2. Sincronizar el estado del formulario cuando cambia la selección
  useEffect(() => {
    if (editingData) {
      setFormState(editingData);
    } else {
      setFormState(initialData);
    }
  }, [editingData, initialData, open]); // 'open' resetea al modo 'crear'

  // 3. Handler genérico para todos los inputs
  // 'value' es procesado (ej. a Número) antes de llamar a esto
  const handleChange = (key, value) => {
    const newState = { ...formState, [key]: value };
    setFormState(newState);
    
    // 4. ¡Actualización en vivo! Si estamos editando,
    // llamamos a onUpdateText inmediatamente.
    if (isEditMode) {
      onUpdateText?.(newState);
    }
  };

  // 5. Handler para el botón principal (Crear)
  const handleSubmit = () => {
    if (!isEditMode) {
      onCreateText?.(formState);
    }
    // En modo edición, el update es en vivo (arriba),
    // así que el botón principal podría solo cerrar el panel.
    // Por ahora, solo lo usaremos para "Crear"
  };

  // --- Helpers de UI ---
  const handleNumChange = (key, e) => {
    handleChange(key, Number(e.target.value));
  };
  const handleTxtChange = (key, e) => {
    handleChange(key, e.target.value);
  };
  const handleToggle = (key, value) => {
    const current = formState[key];
    handleChange(key, current === value ? "normal" : value);
  };

  if (!open) return null;

  return (
    <aside className="text-panel-modern">
      {/* Encabezado */}
      <header className="tp-header">
        <h3>{isEditMode ? "✍️ Editar Texto" : "🅣 Agregar Texto"}</h3>
        <button className="tp-close-btn" onClick={onClose} title="Cerrar">✕</button>
      </header>

      {/* Cuerpo del Panel */}
      <div className="tp-body">
        
        {/* --- Contenido --- */}
        <div className="tp-section">
          <label htmlFor="text-content">Texto</label>
          <textarea
            id="text-content"
            className="tp-textarea"
            rows={4}
            value={formState.text}
            onChange={(e) => handleTxtChange("text", e)}
            placeholder="Escribí tu texto..."
          />
        </div>

        {/* --- Estilo de Fuente --- */}
        <div className="tp-section">
          <label>Fuente</label>
          <select
            className="tp-select"
            value={formState.fontFamily}
            onChange={(e) => handleTxtChange("fontFamily", e)}
          >
            {FONT_OPTIONS.map(f => (
              <option key={f.name} value={f.value} style={{ fontFamily: f.value }}>
                {f.name}
              </option>
            ))}
          </select>
          
          <div className="tp-row">
            <div className="tp-col">
              <label>Peso</label>
              <select
                className="tp-select"
                value={formState.fontWeight}
                onChange={(e) => handleNumChange("fontWeight", e)}
              >
                {FONT_WEIGHTS.map(w => (
                  <option key={w.name} value={w.value}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="tp-col">
              <label>Tamaño (px)</label>
              <input
                className="tp-input-num"
                type="number"
                min={8}
                max={512}
                value={formState.fontSize}
                onChange={(e) => handleNumChange("fontSize", e)}
              />
            </div>
          </div>
        </div>

        {/* --- Color y Apariencia --- */}
        <div className="tp-section">
          <label>Color y Opacidad</label>
          <div className="tp-row">
            <input
              className="tp-color-picker"
              type="color"
              value={formState.color}
              onChange={(e) => handleTxtChange("color", e)}
            />
            <div className="tp-col-grow">
              <input
                className="tp-slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={formState.opacity}
                onChange={(e) => handleNumChange("opacity", e)}
              />
            </div>
            <span className="tp-value-label">
              {Math.round(formState.opacity * 100)}%
            </span>
          </div>
        </div>

        {/* --- Borde --- */}
        <div className="tp-section">
          <label>Borde (Contorno)</label>
          <div className="tp-row">
            <input
              className="tp-color-picker"
              type="color"
              value={formState.strokeColor}
              onChange={(e) => handleTxtChange("strokeColor", e)}
            />
            <div className="tp-col-grow">
              <input
                className="tp-slider"
                type="range"
                min={0}
                max={24}
                step={1}
                value={formState.strokeWidth}
                onChange={(e) => handleNumChange("strokeWidth", e)}
              />
            </div>
            <span className="tp-value-label">
              {formState.strokeWidth}px
            </span>
          </div>
        </div>
        
        {/* --- Formato (Alineación y Estilo) --- */}
        <div className="tp-section">
          <label>Formato</label>
          <div className="tp-btn-group">
            <button
              className={`tp-btn ${formState.align === 'left' ? 'active' : ''}`}
              onClick={() => handleChange("align", "left")}
              title="Alinear Izquierda"
            >
              Izquierda
            </button>
            <button
              className={`tp-btn ${formState.align === 'center' ? 'active' : ''}`}
              onClick={() => handleChange("align", "center")}
              title="Alinear Centro"
            >
              Centro
            </button>
            <button
              className={`tp-btn ${formState.align === 'right' ? 'active' : ''}`}
              onClick={() => handleChange("align", "right")}
              title="Alinear Derecha"
            >
              Derecha
            </button>
            <button
              className={`tp-btn ${formState.fontStyle === 'italic' ? 'active' : ''}`}
              onClick={() => handleToggle("fontStyle", "italic")}
              title="Cursiva"
              style={{ fontStyle: 'italic' }}
            >
              K
            </button>
          </div>
        </div>

        {/* --- 6. LA NUEVA SECCIÓN: Transformar (Escala) --- */}
        <div className="tp-section">
          <label>Transformar</label>
          <div className="tp-row">
            <span className="tp-label-icon">Escala</span>
            <div className="tp-col-grow">
              <input
                className="tp-slider"
                type="range"
                min={0.1} // No dejar que sea 0
                max={5}   // 500%
                step={0.05}
                value={formState.scale || 1} // El 'scale' viene de 'editingData'
                onChange={(e) => handleNumChange("scale", e)}
              />
            </div>
            <span className="tp-value-label">
              {Math.round((formState.scale || 1) * 100)}%
            </span>
          </div>
        </div>
        
      </div>

      {/* Footer (Botón de Crear) */}
      <footer className="tp-footer">
        {!isEditMode && (
          <button
            className="tp-btn-primary"
            onClick={handleSubmit}
            disabled={!formState.text}
          >
            Agregar Texto al 3D
          </button>
        )}
        {isEditMode && (
           <p className="tp-edit-note">
             Editando en vivo. Clic en el modelo para deseleccionar.
           </p>
        )}
      </footer>
    </aside>
  );
}