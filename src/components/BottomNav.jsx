// src/components/BottomNav.jsx
import React from 'react';
import './bottomnav.css';

// Íconos SVG simples para los botones. Se definen aquí para mantener el componente autocontenido.
const MoldsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
    <line x1="12" y1="22.08" x2="12" y2="12"></line>
  </svg>
);
const DesignsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);
const ColorsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M12 9a3 3 0 0 0 0 6M20.34 12A8.34 8.34 0 0 1 12 20.34 8.34 8.34 0 0 1 3.66 12 8.34 8.34 0 0 1 12 3.66 8.34 8.34 0 0 1 20.34 12z"></path>
  </svg>
);
const TextIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 7 4 4 20 4 20 7"></polyline>
    <line x1="9" y1="20" x2="15" y2="20"></line>
    <line x1="12" y1="4" x2="12" y2="20"></line>
  </svg>
);


export default function BottomNav({ activePanel, onPanelChange }) {
  const navItems = [
    { id: 'molds', label: 'Moldes', icon: <MoldsIcon /> },
    { id: 'designs', label: 'Diseños', icon: <DesignsIcon /> },
    { id: 'colors', label: 'Colores', icon: <ColorsIcon /> },
    { id: 'text', label: 'Texto', icon: <TextIcon /> },
  ];

  return (
    <nav className="bottom-nav">
      {navItems.map(item => (
        <button
          key={item.id}
          className={`nav-btn ${activePanel === item.id ? 'is-active' : ''}`}
          onClick={() => onPanelChange(item.id)}
          aria-label={item.label}
          title={item.label}
        >
          <div className="nav-icon">{item.icon}</div>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}