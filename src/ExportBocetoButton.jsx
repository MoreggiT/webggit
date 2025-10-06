// src/ExportBocetoButton.jsx
import React from "react";

/**
 * Botón flotante “Descargar boceto”
 * - Muestra un botón fijo arriba-derecha.
 * - Llama al método exportPDF() que expone Viewer3D vía ref.
 *
 * Uso:
 *   <ExportBocetoButton onClick={() => viewerApiRef.current?.exportPDF()} />
 */
export default function ExportBocetoButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Descargar PDF con 4 vistas"
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 9999,
        padding: "10px 14px",
        fontWeight: 700,
        borderRadius: 12,
        border: "1px solid #2563eb",
        background: "#3b82f6",
        color: "#fff",
        boxShadow: "0 8px 22px rgba(37,99,235,.25)",
        cursor: "pointer",
        lineHeight: 1.1
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#2563eb")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f6")}
    >
      Descargar boceto
    </button>
  );
}
