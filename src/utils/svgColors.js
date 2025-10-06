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

/* Helpers */
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
