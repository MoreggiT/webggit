// src/utils/rasterizeSvg.js

/**
 * Rasteriza un SVG a canvas respetando transparencia y con "fitHeight" por defecto.
 * Incluye una sanitización previa para remover fondos de cobertura total (rectángulos tamaño 100% o tamaño viewBox),
 * de modo que el overlay no pinte toda la pieza de un color sólido cuando solo se quiere cambiar partes del SVG.
 */
export async function rasterizeSvgToCanvasSafe(svgXml, outW, outH, mode = "fitHeight"){
  try{
    // 1) Limpieza preventiva: eliminar comentarios y fondos full-size
    const cleaned = sanitizeSvg(svgXml);

    // 2) Asegurar un <svg> root válido
    const isRoot = /<\s*svg[\s>]/i.test(cleaned);
    const payload = isRoot ? cleaned
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${outW} ${outH}">${cleaned}</svg>`;

    // 3) Crear imagen y esperar carga
    const blob = new Blob([payload], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = (e) => rej(e);
      im.src = url;
    });
    URL.revokeObjectURL(url);

    // 4) Canvas de salida
    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const ctx = c.getContext("2d");

    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;

    // 5) Modo de ajuste
    if (mode === "fitHeight"){
      const s = outH / ih;
      const dw = Math.round(iw * s);
      const dh = outH;
      const dx = Math.round((outW - dw) / 2);
      const dy = 0;
      ctx.clearRect(0,0,outW,outH);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else if (mode === "stretch"){
      ctx.drawImage(img, 0, 0, outW, outH);
    } else if (mode === "contain" || mode === "cover"){
      const s = (mode === "contain") ? Math.min(outW/iw, outH/ih) : Math.max(outW/iw, outH/ih);
      const dw = Math.round(iw * s), dh = Math.round(ih * s);
      const dx = Math.round((outW - dw) / 2), dy = Math.round((outH - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, 0, 0, outW, outH);
    }

    return c;
  }catch(err){
    console.error("❌ Error rasterizando SVG:", err);
    return null;
  }
}

/* ===================== Helpers ===================== */

/**
 * Remueve:
 *  - Comentarios <!-- ... -->
 *  - <g> con id/clase "background"/"fondo" (muy típico de editores)
 *  - <rect> que cubren todo el SVG: width/height="100%" (cualquier orden)
 *  - <rect> que coinciden con el tamaño del viewBox (x≈0, y≈0, width≈vw, height≈vh)
 * Mantiene todo lo demás tal cual.
 */
function sanitizeSvg(svgText){
  if (!svgText) return svgText;

  let s = String(svgText);

  // quitar comentarios (evita falsos positivos)
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // cachear viewBox si existe
  const vb = readViewBox(s); // {x,y,w,h} o null

  // quitar <g ...>...</g> que sean "background" / "fondo"
  s = s.replace(/<g[^>]*?(id|class)\s*=\s*(['"])([^'"]*?)(background|fondo)([^'"]*?)\2[^>]*>[\s\S]*?<\/g>/gi, "");

  // quitar <rect ... width="100%" ... height="100%" ... />
  s = s.replace(/<rect\b[^>]*\bwidth\s*=\s*(['"])100%\1[^>]*\bheight\s*=\s*(['"])100%\2[^>]*\/?>/gi, "");
  s = s.replace(/<rect\b[^>]*\bheight\s*=\s*(['"])100%\1[^>]*\bwidth\s*=\s*(['"])100%\2[^>]*\/?>/gi, "");

  // quitar <rect ...> con tamaño igual al viewBox (si lo tenemos)
  if (vb){
    // tolerancia para floats
    const tol = 0.01;
    // busca rects numéricos: x="0" y="0" width="123" height="456"
    s = s.replace(/<rect\b[^>]*>/gi, (m) => {
      const x = pickNumber(m, /\bx\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const y = pickNumber(m, /\by\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const w = pickNumber(m, /\bwidth\s*=\s*['"]([\d.+-eE]+)['"]/i);
      const h = pickNumber(m, /\bheight\s*=\s*['"]([\d.+-eE]+)['"]/i);

      if (x==null || y==null || w==null || h==null) return m; // no numérico → no tocar
      const isBg =
        Math.abs(x - vb.x) <= tol &&
        Math.abs(y - vb.y) <= tol &&
        Math.abs(w - vb.w) <= tol &&
        Math.abs(h - vb.h) <= tol;

      return isBg ? "" : m; // si coincide con el viewBox → remover
    });
  }

  // Evitar que el <svg> root tenga fill de fondo forzado
  // (si el root tiene style="background: ...", lo quitamos para preservar transparencia)
  s = s.replace(/(<svg[^>]*?)\sstyle\s*=\s*(['"][^'"]*\bbackground\s*:[^'"]*['"])/i, "$1");

  return s;
}

function readViewBox(s){
  const m = /<svg[^>]*\bviewBox\s*=\s*['"]\s*([\d.+-eE]+)\s+([\d.+-eE]+)\s+([\d.+-eE]+)\s+([\d.+-eE]+)\s*['"][^>]*>/i.exec(s);
  if (!m) return null;
  const x = parseFloat(m[1]), y = parseFloat(m[2]), w = parseFloat(m[3]), h = parseFloat(m[4]);
  if ([x,y,w,h].some(v => !isFinite(v))) return null;
  return { x, y, w, h };
}

function pickNumber(str, re){
  const m = re.exec(str);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return isFinite(v) ? v : null;
}
