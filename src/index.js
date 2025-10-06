// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";

// Montaje sin StrictMode para que Three.js no se inicialice dos veces en desarrollo
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
