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

// ** FUNCIÓN AGREGADA para normalizar nombres igual que en App.js **
const baseName = (s) => {
    const stripped = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return stripped
        .trim()
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[\s-]+/g, "_")
        .replace(/_\d+$/, "")
        .toUpperCase();
};

// --- Lógica Principal del Worker ---

/**
 * Escucha los mensajes provenientes del hilo principal (App.js).
 */
self.onmessage = async (event) => {
  // ** CORRECCIÓN: Leemos la nueva propiedad 'files' **
  const { designName, category, molde, files, colors, cacheKey } = event.data;

  if (!molde || !molde.layout || !Array.isArray(files) || files.length === 0) {
    self.postMessage({ 
      success: false, 
      error: `La información para generar la miniatura es inválida. Molde o archivos no encontrados.`,
      cacheKey 
    });
    return;
  }

  const { width, height, layout } = molde;
  // ** Usamos los nombres de archivo de `files` para saber qué piezas del layout usar **
  const piezaNames = files.map(file => baseName(file));

  try {
    // 1. Preparamos las URLs para todas las piezas SVG que necesitamos, usando la lista 'files'
    const fetchPromises = files.map(fileName => {
      const svgUrl = `/diseños/${encodeURIComponent(category)}/${encodeURIComponent(designName)}/${encodeURIComponent(fileName)}`;
      return fetch(svgUrl).then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${svgUrl}`);
        return res.text();
      });
    });

    const svgTexts = await Promise.all(fetchPromises);

    const rasterizePromises = svgTexts.map(svgText => {
      const coloredSvg = applySvgColors(svgText, colors);
      return rasterizeSvg(coloredSvg);
    });
    const imageBitmaps = await Promise.all(rasterizePromises);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 5. Dibujamos cada pieza en el canvas según su layout.
    imageBitmaps.forEach((bitmap, index) => {
      // ** Usamos los nombres de pieza que calculamos a partir de los archivos **
      const piezaName = piezaNames[index];
      const piezaLayout = layout[piezaName];

      if (piezaLayout) {
        ctx.drawImage(bitmap, piezaLayout.x, piezaLayout.y, piezaLayout.width, piezaLayout.height);
      } else {
        console.warn(`No se encontró layout para la pieza: ${piezaName}`);
      }
      bitmap.close();
    });

    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });

    self.postMessage({ success: true, blob, cacheKey });

  } catch (error) {
    console.error('Error en Thumbnail Worker:', error);
    self.postMessage({ success: false, error: error.message, cacheKey });
  }
};