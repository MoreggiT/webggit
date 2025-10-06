// src/PreviewModal.jsx
import React from "react";

/**
 * Modal de previsualización del boceto
 * Muestra las 4 vistas capturadas (frente, espalda, izquierda, derecha)
 * y un botón para descargar el PDF.
 */
export default function PreviewModal({ images, onClose, onDownload }) {
  if (!images) return null;

  const views = [
    { label: "Frente", key: "front" },
    { label: "Espalda", key: "back" },
    { label: "Izquierda", key: "left" },
    { label: "Derecha", key: "right" },
  ];

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Previsualización del boceto</h2>

        <div style={styles.grid}>
          {views.map(v => (
            <div key={v.key} style={styles.cell}>
              <div style={styles.caption}>{v.label}</div>
              <img
                src={images[v.key]}
                alt={v.label}
                style={styles.image}
              />
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <button onClick={onDownload} style={styles.btnPrimary}>📄 Descargar PDF</button>
          <button onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 99999,
    backdropFilter: "blur(6px)",
  },
  modal: {
    background: "#fff",
    borderRadius: 16,
    padding: "24px 28px",
    maxWidth: "960px",
    width: "90%",
    boxShadow: "0 12px 32px rgba(0,0,0,.25)",
    color: "#111",
  },
  title: {
    textAlign: "center",
    marginBottom: 18,
    fontSize: 22,
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 14,
    marginBottom: 24,
  },
  cell: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 10,
  },
  caption: {
    fontWeight: 600,
    marginBottom: 8,
  },
  image: {
    maxWidth: "100%",
    borderRadius: 8,
    objectFit: "contain",
    background: "transparent",
  },
  actions: {
    display: "flex",
    justifyContent: "center",
    gap: 12,
  },
  btnPrimary: {
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(37,99,235,0.25)",
  },
  btnSecondary: {
    background: "#e5e7eb",
    color: "#111",
    fontWeight: 600,
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    cursor: "pointer",
  },
};
