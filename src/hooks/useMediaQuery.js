// src/hooks/useMediaQuery.js
import React from "react";

/**
 * Hook personalizado para detectar si la ventana del navegador
 * coincide con una media query de CSS.
 * @param {string} query - La media query a evaluar (ej: '(max-width: 780px)')
 * @returns {boolean} - `true` si la query coincide, `false` en caso contrario.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    // Obtenemos el objeto de media query y verificamos el estado inicial
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    // Creamos un listener para detectar cambios en el tamaño de la ventana
    const listener = () => {
      setMatches(media.matches);
    };

    // Usamos el nuevo método addEventListener que es más seguro
    media.addEventListener("change", listener);

    // Limpiamos el listener cuando el componente se desmonte
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}