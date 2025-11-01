// src/components/DesignThumbBtn.jsx
import React, { useEffect, useRef } from "react";
import "./design-thumb-btn.css"; // Estilos extraídos

export default function DesignThumbBtn({ name, img, onClick, ensure, disabled }) {
  const btnRef = React.useRef(null);

  useEffect(() => {
    if (!btnRef.current || !ensure) return;
    let observed = true;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && observed) {
            ensure();
            io.unobserve(e.target);
            observed = false;
          }
        });
      },
      { root: null, rootMargin: "200px", threshold: 0.01 }
    );
    io.observe(btnRef.current);
    return () => io.disconnect();
  }, [ensure]);

  return (
    <button
      ref={btnRef}
      className="design-thumb-btn"
      onClick={onClick}
      disabled={disabled}
      title={name}
      aria-label={`Aplicar diseño ${name}`}
    >
      <div className="design-thumb">
        {img ? (
          <img src={img} alt={name} draggable={false} />
        ) : (
          <div className="design-thumb-skel">
            <div className="bar" />
            <div className="bar short" />
          </div>
        )}
      </div>
      <div className="design-caption">{name}</div>
    </button>
  );
}

