/* eslint-disable no-restricted-globals */

/**
 * /src/workers/thumbnailGenerator.worker.js
 * * Este script se ejecuta en un hilo separado (Web Worker) para no bloquear la interfaz.
 * Su única tarea es recibir los datos de un diseño y un molde, construir una miniatura
 * ensamblando las piezas SVG en un canvas, y devolver la imagen final.
 */

// --- Funciones de Utilidad (adaptadas para el entorno del Worker) ---

/**
 * Clona un SVG y le aplica nuevos colores.
 * @param {string} svgText - El contenido XML del SVG.
 * @param {Array} colors - Array de colores a reemplazar, ej: [{ from: '#000', to: '#FFF' }]
 * @returns {string} - El nuevo SVG como string con los colores aplicados.
 */
const applySvgColors = (svgText, colors) => {
  // En un worker, no tenemos acceso al DOM, pero sí a DOMParser.
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;

  if (colors && colors.length > 0) {
    colors.forEach(color => {
      const { from, to } = color;
      const paths = svg.querySelectorAll(`[fill="${from}"]`);
      paths.forEach(path => {
        path.setAttribute('fill', to);
      });
    });
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
};

/**
 * Convierte un string SVG en un ImageBitmap, que es una forma eficiente de manejar imágenes en workers.
 * @param {string} svgText - El contenido XML del SVG.
 * @returns {Promise<ImageBitmap>}
 */
const rasterizeSvg = (svgText) => {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    fetch(url)
      .then(response => response.blob())
      .then(blob => createImageBitmap(blob))
      .then(bitmap => {
        URL.revokeObjectURL(url);
        resolve(bitmap);
      })
      .catch(err => {
        URL.revokeObjectURL(url);
        reject(err);
      });
  });
};

// --- Lógica Principal del Worker ---

/**
 * Escucha los mensajes provenientes del hilo principal (App.js).
 */
self.onmessage = async (event) => {
  const { designName, category, molde, colors, cacheKey } = event.data;

  // Si falta información esencial del molde, no podemos continuar.
  if (!molde || !molde.piezas || !molde.layout) {
    self.postMessage({ 
      success: false, 
      error: `La información del 'thumbnail' para el molde es inválida o no existe en index.json.`,
      cacheKey 
    });
    return;
  }

  const { piezas, width, height, layout } = molde;

  try {
    // 1. Preparamos las URLs para todas las piezas SVG que necesitamos.
    const fetchPromises = piezas.map(piezaName => {
      // Usamos `baseName` para normalizar el nombre de la pieza, igual que en App.js
      const fileBase = piezaName.toUpperCase().replace(/[\s-]+/g, "_");
      const svgUrl = `/diseños/${encodeURIComponent(category)}/${encodeURIComponent(designName)}/${encodeURIComponent(fileBase)}.svg`;
      return fetch(svgUrl).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${svgUrl}`);
        return res.text();
      });
    });

    // 2. Cargamos todos los SVGs en paralelo.
    const svgTexts = await Promise.all(fetchPromises);

    // 3. Aplicamos colores (si los hay) y rasterizamos cada pieza, también en paralelo.
    const rasterizePromises = svgTexts.map(svgText => {
      const coloredSvg = applySvgColors(svgText, colors);
      return rasterizeSvg(coloredSvg);
    });
    const imageBitmaps = await Promise.all(rasterizePromises);

    // 4. Creamos un canvas fuera de pantalla (OffscreenCanvas) para ensamblar la miniatura.
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 5. Dibujamos cada pieza en el canvas según su layout.
    imageBitmaps.forEach((bitmap, index) => {
      const piezaName = piezas[index];
      const piezaLayout = layout[piezaName];

      if (piezaLayout) {
        // Usamos las coordenadas y dimensiones del layout definido en index.json
        ctx.drawImage(bitmap, piezaLayout.x, piezaLayout.y, piezaLayout.width, piezaLayout.height);
      } else {
        // Si una pieza no tiene layout, la omitimos para evitar errores.
        console.warn(`No se encontró layout para la pieza: ${piezaName}`);
      }
      bitmap.close(); // Liberamos la memoria del bitmap una vez dibujado.
    });

    // 6. Convertimos el canvas final a un Blob (mucho más eficiente que DataURL).
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });

    // 7. Enviamos el resultado (el Blob y el cacheKey) de vuelta al hilo principal.
    self.postMessage({ success: true, blob, cacheKey });

  } catch (error) {
    console.error('Error en Thumbnail Worker:', error);
    self.postMessage({ success: false, error: error.message, cacheKey });
  }
};