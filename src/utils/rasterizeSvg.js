// src/utils/rasterizeSvg.js

/**
 * Rasteriza un SVG a canvas respetando transparencia.
 * - mode: "fitHeight" (default), "fitWidth", "contain", "cover", "stretch"
 * - Mantiene la firma original para no romper llamadas existentes.
 */
export async function rasterizeSvgToCanvasSafe(svgXml, outW, outH, mode = "fitHeight") {
  try {
    // ===== 0) Clamp defensivo del tamaño de salida (evita picos de memoria)
    const MAX_TEX = 4096;
    outW = clampInt(outW || 2048, 2, MAX_TEX);
    outH = clampInt(outH || 2048, 2, MAX_TEX);

    // ===== 1) Sanitización
    let cleaned = sanitizeSvg(svgXml);

    // (Opcional futuro) Incrustar <image href="http(s)://..."> como data:URI para evitar CORS
    // cleaned = await inlineExternalImages(cleaned);

    // ===== 2) Asegurar root <svg>
    const hasRoot = /<\s*svg[\s>]/i.test(cleaned);
    const payload = hasRoot
      ? cleaned
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">${cleaned}</svg>`;

    // ===== 3) Crear Blob → Image (evita taint del canvas)
    const blob = new Blob([payload], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = await loadImage(url);
    try { URL.revokeObjectURL(url); } catch {}

    // ===== 4) Canvas destino
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    // Mejor nitidez
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // ===== 5) Dibujo según modo
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    switch (mode) {
      case "fitHeight": {
        const s = outH / ih;
        const dw = Math.round(iw * s);
        const dh = outH;
        const dx = Math.round((outW - dw) / 2);
        ctx.clearRect(0, 0, outW, outH);
        ctx.drawImage(img, dx, 0, dw, dh);
        break;
      }
      case "fitWidth": {
        const s = outW / iw;
        const dw = outW;
        const dh = Math.round(ih * s);
        const dy = Math.round((outH - dh) / 2);
        ctx.clearRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, dy, dw, dh);
        break;
      }
      case "contain":
      case "cover": {
        const s = mode === "contain" ? Math.min(outW / iw, outH / ih) : Math.max(outW / iw, outH / ih);
        const dw = Math.round(iw * s), dh = Math.round(ih * s);
        const dx = Math.round((outW - dw) / 2), dy = Math.round((outH - dh) / 2);
        ctx.clearRect(0, 0, outW, outH);
        ctx.drawImage(img, dx, dy, dw, dh);
        break;
      }
      case "stretch":
      default: {
        ctx.clearRect(0, 0, outW, outH);
        ctx.drawImage(img, 0, 0, outW, outH);
        break;
      }
    }

    return c;
  } catch (err) {
    console.error("❌ Error rasterizando SVG:", err);
    return null;
  }
}

/* ===================== Helpers ===================== */

function clampInt(v, min, max) {
  v = Math.floor(Number(v) || 0);
  return Math.max(min, Math.min(max, v));
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = (e) => rej(e);
    im.src = url;
  });
}

/**
 * Remueve:
 *  - Comentarios <!-- ... -->
 *  - <g> con id/clase "background"/"fondo" o con style="display:none"
 *  - <rect> que cubren todo el SVG (100% x 100%)
 *  - <rect> que coinciden con el viewBox (x≈0, y≈0, width≈vw, height≈vh)
 *  - style="background: ..." en el root <svg>
 * Mantiene lo demás.
 */
function sanitizeSvg(svgText) {
  if (!svgText) return svgText;
  let s = String(svgText);

  // Quitar comentarios (evita falsos positivos en parseo posterior)
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Remover grupos típicos de fondo
  s = s.replace(
    /<g\b[^>]*?(id|class)\s*=\s*(['"])[^'"]*(background|fondo)[^'"]*\2[^>]*>[\s\S]*?<\/g>/gi,
    ""
  );

  // Remover grupos con display:none (no aportan al render)
  s = s.replace(
    /<g\b[^>]*style\s*=\s*(['"])[^'"]*\bdisplay\s*:\s*none\b[^'"]*\1[^>]*>[\s\S]*?<\/g>/gi,
    ""
  );

  // Quitar rects 100% × 100% (cualquier orden)
  s = s.replace(/<rect\b[^>]*\bwidth\s*=\s*(['"])100%\1[^>]*\bheight\s*=\s*(['"])100%\2[^>]*\/?>/gi, "");
  s = s.replace(/<rect\b[^>]*\bheight\s*=\s*(['"])100%\1[^>]*\bwidth\s*=\s*(['"])100%\2[^>]*\/?>/gi, "");

  // Si hay viewBox, quitar rects del tamaño exacto del viewBox
  const vb = readViewBox(s); // {x,y,w,h} | null
  if (vb) {
    const tol = 0.01;
    s = s.replace(/<rect\b[^>]*>/gi, (m) => {
      const x = pickNumber(m, /\bx\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const y = pickNumber(m, /\by\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const w = pickNumber(m, /\bwidth\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const h = pickNumber(m, /\bheight\s*=\s*['"]([\d.+-eE]+)['"]/i);
      if (x == null || y == null || w == null || h == null) return m; // no es numérico
      const isBg =
        Math.abs(x - vb.x) <= tol &&
        Math.abs(y - vb.y) <= tol &&
        Math.abs(w - vb.w) <= tol &&
        Math.abs(h - vb.h) <= tol;
      return isBg ? "" : m;
    });
  }

  // Quitar style="background: ..." en el <svg> root (preserva transparencia)
  s = s.replace(/(<svg[^>]*?)\sstyle\s*=\s*(['"][^'"]*\bbackground\s*:[^'"]*['"])/i, "$1");

  return s;
}

function readViewBox(s) {
  const m = /<svg[^>]*\bviewBox\s*=\s*['"]\s*([\d.+-eE]+)\s+([\d.+-eE]+)\s+([\d.+-eE]+)\s+([\d.+-eE]+)\s*['"][^>]*>/i.exec(s);
  if (!m) return null;
  const x = parseFloat(m[1]), y = parseFloat(m[2]), w = parseFloat(m[3]), h = parseFloat(m[4]);
  if ([x, y, w, h].some(v => !isFinite(v))) return null;
  return { x, y, w, h };
}

function pickNumber(str, re) {
  const m = re.exec(str);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) ? v : null;
}

/* ========= Opcional: incrustar imágenes externas como data:URI =========
async function inlineExternalImages(svgText) {
  // Busca <image href="http..."> y las reemplaza por data:URIs
  // Requiere permisos CORS válidos o que los recursos permitan fetch.
  const hrefRe = /<image\b[^>]*\b(?:href|xlink:href)\s*=\s*['"]([^'"]+)['"][^>]*>/gi;
  const tasks = [];
  const seen = new Map();

  let match;
  while ((match = hrefRe.exec(svgText))) {
    const url = match[1];
    if (/^data:/i.test(url)) continue;
    if (!seen.has(url)) seen.set(url, null);
  }
  for (const [url] of seen) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const data = await blobToDataURL(blob);
      seen.set(url, data);
    } catch {
      // si falla el fetch, se deja tal cual
      seen.set(url, null);
    }
  }
  for (const [url, data] of seen) {
    if (data) {
      const esc = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(\\b(?:href|xlink:href)\\s*=\\s*['"])${esc}(['"])`, "g");
      svgText = svgText.replace(re, `$1${data}$2`);
    }
  }
  return svgText;
}
function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
======================================================================= */
