// src/utils/svgColors.js

/** =========================
 *  MODO LEGADO (por tokens)
 *  ========================= */
export function extractSvgColors(svgText){
  const found = new Map();

  const attrRe = /(fill|stroke|stop-color)\s*=\s*("([^"]+)"|'([^']+)')/gi;
  let m;
  while((m = attrRe.exec(svgText))){
    const val = (m[3] ?? m[4] ?? "").trim();
    const color = firstCssColor(val);
    if (color) found.set(color, (found.get(color)||0)+1);
  }

  const styleAttrRe = /style\s*=\s*("([^"]+)"|'([^']+)')/gi;
  while((m = styleAttrRe.exec(svgText))){
    const style = (m[2] ?? m[3] ?? "");
    const decls = style.split(";");
    for (const d of decls){
      const [prop, raw] = d.split(":").map(s=>s && s.trim());
      if (!prop || !raw) continue;
      if (/^(fill|stroke|stop-color)$/i.test(prop)){
        const color = firstCssColor(raw);
        if (color) found.set(color, (found.get(color)||0)+1);
      }
    }
  }

  const styleBlockRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let sb;
  while((sb = styleBlockRe.exec(svgText))){
    const css = sb[1];
    const rules = css.split("}");
    for (const r of rules){
      const i = r.indexOf("{"); if (i<0) continue;
      const body = r.slice(i+1);
      const decls = body.split(";");
      for (const d of decls){
        const [prop, raw] = d.split(":").map(s=>s && s.trim());
        if (!prop || !raw) continue;
        if (/^(fill|stroke|stop-color)$/i.test(prop)){
          const color = firstCssColor(raw);
          if (color) found.set(color, (found.get(color)||0)+1);
        }
      }
    }
  }

  const out=[];
  for (const [token,count] of found.entries()){
    const hex = cssTokenToHex(token);
    if (hex) out.push({token, hex, count});
  }
  out.sort((a,b)=>b.count-a.count);
  return out;
}

export function replaceColorTokenEverywhere(svgText, token, newHex){
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(token)){
    const hex6 = normalizeHex6(token), hex3 = toHex3(hex6);
    const re6 = new RegExp(escapeRegExp(hex6), "gi");
    const re3 = new RegExp(escapeRegExp(hex3), "gi");
    return svgText.replace(re6, newHex).replace(re3, newHex);
  }
  if (/^(rgba?|hsla?)\(/i.test(token)){
    const norm = normalizeFunctionalColor(token);
    const re = new RegExp(escapeRegExp(norm), "g");
    return normalizeFunctionalColorsInText(svgText).replace(re, newHex);
  }
  const reName = new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi");
  return svgText.replace(reName, newHex);
}

/** =========================================
 *  NUEVO MODO: por OBJETO/CAPA dentro de “diseño”
 *  ========================================= */

/**
 * Extrae objetos/capas dentro del grupo “diseño/diseno”.
 * Devuelve: [{ objectId, objectName, artboard, colorHex, strokeHex, tag }]
 */
export function extractSvgObjects(svgText, opts = {}){
  const groupNames = normalizeGroupNames(opts.groupNames || ["diseño", "diseno"]);
  const doc = parseSvgDom(svgText);
  if (!doc) return [];

  const roots = findDesignRoots(doc, groupNames);
  if (roots.length === 0) return [];

  const items = [];
  for (const root of roots){
    const artboard = guessArtboardName(root) || "ARTBOARD";
    // Caminamos elementos gráficos típicos
    const elements = root.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line, g, text");
    elements.forEach(el=>{
      // ignorar contenedores <g> vacíos y estilos
      if (el.tagName.toLowerCase()==="g" && !hasPaint(el)) return;

      const objectId = ensureObjectId(el);
      const objectName = displayNameFor(el);
      const { fillHex, strokeHex } = readInlinePaint(el);

      items.push({
        objectId,
        objectName,
        artboard,
        colorHex: fillHex || "#000000",  // por defecto negro si no hay fill
        strokeHex: strokeHex || null,
        tag: el.tagName.toLowerCase(),
      });
    });
  }
  return items;
}

/**
 * Igual a extractSvgObjects pero agrupado por artboard:
 * { [artboardName]: Array<item> }
 */
export function extractDesignObjectsByArtboard(svgText, opts = {}){
  const list = extractSvgObjects(svgText, opts);
  const map = {};
  for (const it of list){
    if (!map[it.artboard]) map[it.artboard] = [];
    map[it.artboard].push(it);
  }
  return map;
}

/**
 * Cambia el color SOLO de un objeto (por id) y devuelve el SVG resultante.
 * - target: 'fill' | 'stroke'
 * Estrategia: fuerza estilo inline (style="fill:#...") que tiene alta precedencia.
 */
export function setObjectColor(svgText, objectId, newHex, { target = "fill" } = {}){
  const doc = parseSvgDom(svgText);
  if (!doc) return svgText;

  const el = doc.getElementById(String(objectId));
  if (!el) return svgText;

  const hex = cssTokenToHex(newHex) || newHex;
  // 1) Normalizamos style inline
  const style = styleStringToObject(el.getAttribute("style"));
  style[target] = hex;
  el.setAttribute("style", styleObjectToString(style));

  // 2) Opcional: quitar atributos conflictivos de presentación si querés forzar inline
  // (no es obligatorio, pero evita confusiones)
  if (target === "fill") el.removeAttribute("fill");
  if (target === "stroke") el.removeAttribute("stroke");

  return serializeSvgDom(doc);
}

/** ========= Helpers DOM & Paint ========= */

function parseSvgDom(svgText){
  try{
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    // Si hubo error de parser, el browser mete <parsererror>
    if (doc.querySelector("parsererror")) return null;
    return doc;
  }catch{ return null; }
}
function serializeSvgDom(doc){
  try{
    return new XMLSerializer().serializeToString(doc);
  }catch{ return null; }
}

function normalizeGroupNames(list){
  return list.map(s => String(s||"").toLowerCase());
}

// Busca grupos candidatos a “diseño”: id o class que matchee
function findDesignRoots(doc, groupNames){
  const allGroups = Array.from(doc.querySelectorAll("g[id], g[class]"));
  const roots = allGroups.filter(g=>{
    const id = (g.getAttribute("id")||"").toLowerCase();
    const cls = (g.getAttribute("class")||"").toLowerCase();
    return groupNames.some(gn => id.includes(gn) || cls.includes(gn));
  });
  // Si no hay, fallback: todo el doc (último recurso)
  if (roots.length===0) {
    const svg = doc.querySelector("svg");
    return svg ? [svg] : [];
  }
  return roots;
}

// Heurística: nombre de artboard = id/label del ancestro más cercano
function guessArtboardName(node){
  let el = node;
  while (el && el.nodeType === 1) {
    const id = el.getAttribute?.("id");
    const lbl = el.getAttribute?.("inkscape:label") || el.getAttribute?.("data-name") || el.getAttribute?.("name");
    const candidate = id || lbl;
    if (candidate && !looksLikeAutoId(candidate)) {
      return cleanName(candidate);
    }
    el = el.parentElement;
  }
  return null;
}
function looksLikeAutoId(s){
  // ids tipo "g1234" o "path-1", etc.
  return /^([a-z]+[-_]?)?\d{2,}$/.test(s || "");
}
function cleanName(s){
  return String(s||"").trim();
}

function hasPaint(el){
  const { fillHex, strokeHex } = readInlinePaint(el);
  return !!(fillHex || strokeHex);
}

function readInlinePaint(el){
  const style = styleStringToObject(el.getAttribute("style"));
  const fill = style.fill ?? el.getAttribute("fill");
  const stroke = style.stroke ?? el.getAttribute("stroke");

  const fillHex = firstCssColor(fill) ? (cssTokenToHex(fill) || fill) : null;
  const strokeHex = firstCssColor(stroke) ? (cssTokenToHex(stroke) || stroke) : null;
  return { fillHex, strokeHex };
}

let __uid = 0;
function ensureObjectId(el){
  let id = el.getAttribute("id");
  if (!id){
    id = `obj_${(++__uid)}`;
    el.setAttribute("id", id);
  }
  return id;
}

function displayNameFor(el){
  const id = el.getAttribute("id");
  const lbl = el.getAttribute("inkscape:label") || el.getAttribute("data-name") || el.getAttribute("name");
  const base = lbl || id || el.tagName;
  return String(base);
}

/** ========= Helpers de estilos ========= */
function styleStringToObject(s){
  const obj = {};
  if (!s) return obj;
  for (const part of String(s).split(";")){
    const [k,v] = part.split(":").map(t=>t && t.trim());
    if (!k || !v) continue;
    obj[k.toLowerCase()] = v;
  }
  return obj;
}
function styleObjectToString(obj){
  return Object.entries(obj).map(([k,v])=>`${k}:${v}`).join("; ");
}

/** ========= Helpers de colores (legado reutilizado) ========= */
function firstCssColor(v){
  const s = (v||"").trim();
  if (!s) return null;
  if (/^(none|currentColor|inherit)$/i.test(s)) return null;
  if (/^url\(#/i.test(s)) return null;

  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
  if (/^(rgba?|hsla?)\(/i.test(s)) return normalizeFunctionalColor(s);

  const hex = cssTokenToHex(s);
  return hex ? s : null;
}
function cssTokenToHex(token){
  try{
    const c=document.createElement("canvas"); c.width=1; c.height=1;
    const x=c.getContext("2d");
    x.fillStyle="#000";
    x.fillStyle=token;
    const s=x.fillStyle;
    if (/^#([0-9a-f]{6})$/i.test(s)) return s.toLowerCase();
    const m=/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/i.exec(s);
    if (m){ const [r,g,b]=[+m[1],+m[2],+m[3]]; return "#"+[r,g,b].map(n=>n.toString(16).padStart(2,"0")).join(""); }
    return null;
  }catch(_){ return null; }
}
function normalizeFunctionalColor(token){
  return token.replace(/(rgba?|hsla?)\(\s*([^)]*?)\s*\)/i, (_,fn,args)=>{
    const parts=args.split(",").map(s=>s && s.trim());
    return fn.toLowerCase()+"("+parts.join(", ")+")";
  });
}
function normalizeFunctionalColorsInText(text){
  return text.replace(/(rgba?|hsla?)\(\s*([^)]*?)\s*\)/gi, (_,fn,args)=>{
    const parts=args.split(",").map(s=>s && s.trim());
    return fn.toLowerCase()+"("+parts.join(", ")+")";
  });
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeHex6(h){
  const s=h.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)){ const r=s[1],g=s[2],b=s[3]; return "#"+r+r+g+g+b+b; }
  return s;
}
function toHex3(h6){
  const s = normalizeHex6(h6);
  return "#"+s[1]+s[3]+s[5];
}
