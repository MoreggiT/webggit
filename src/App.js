// src/App.js
import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Viewer3D from "./Viewer3D";
import { extractSvgObjects, setObjectColor } from "./utils/svgColors";
import { rasterizeSvgToCanvasSafe } from "./utils/rasterizeSvg";
import PreviewModal from "./PreviewModal";
import "./index.css";

import MoldWheel from "./components/MoldWheel";
import ModelGallery from "./components/ModelGallery";
import TextPanel from "./components/TextPanel";
import BottomNav from "./components/BottomNav";
import { useMediaQuery } from "./hooks/useMediaQuery";

// --- COMPONENTES EXTERNOS REFRACTORIZADOS ---
import DesignsPanel from "./components/DesignsPanel";
import ColorsPanel from "./components/ColorsPanel";
// ------------------------------------------

/* ========== helpers de nombres ========== */
const stripAccents = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const baseName = (s) =>
  stripAccents(String(s || "").trim())
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_\d+$/, "")
    .toUpperCase();

/* ========== paleta ========== */
const MATERIAL_PALETTE = [
  ["#ffffff", "#000000"],
  ["#E57373", "#F44336", "#D32F2F"],
  ["#F06292", "#E91E63", "#C2185B"],
  ["#BA68C8", "#9C27B0", "#7B1FA2"],
  ["#9575CD", "#673AB7", "#512DA8"],
  ["#7986CB", "#3F51B5", "#303F9F"],
  ["#64B5F6", "#2196F3", "#1976D2"],
  ["#4FC3F7", "#03A9F4", "#0288D1"],
  ["#4DD0E1", "#00BCD4", "#0097A7"],
  ["#4DB6AC", "#009688", "#00796B"],
  ["#81C784", "#4CAF50", "#388E3C"],
  ["#AED581", "#8BC34A", "#689F38"],
  ["#DCE775", "#CDDC39", "#AFB42B"],
  ["#FFF176", "#FFEB3B", "#FBC02D"],
  ["#FFD54F", "#FFC107", "#FFA000"],
  ["#FFB74D", "#FF9800", "#F57C00"],
  ["#FF8A65", "#FF5722", "#E64A19"],
  ["#A1887F", "#795548", "#5D4037"],
  ["#E0E0E0", "#9E9E9E", "#616161"],
  ["#90A4AE", "#607D8B", "#455A64"],
];
const FLAT_PALETTE = MATERIAL_PALETTE.flat();

/* ========== normalización de color desde SVG (fallback) ========== */
const _colorCanvas =
  typeof document !== "undefined" ? document.createElement("canvas") : null;
if (_colorCanvas) _colorCanvas.width = _colorCanvas.height = 1;

function cssColorToHex(input) {
  if (!input || input === "none") return null;
  const s = String(input).trim();
  const hexMatch = s.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    let h = hexMatch[0].toUpperCase();
    if (h.length === 4) h = "#" + [...h.slice(1)].map((c) => c + c).join("");
    if (h.length === 5) h = "#" + [...h.slice(1, 4)].map((c) => c + c).join("");
    if (h.length === 9) h = h.slice(0, 7);
    return h;
  }
  if (!_colorCanvas) return null;
  try {
    const ctx = _colorCanvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillStyle = s;
    const out = ctx.fillStyle;
    if (/^#[0-9a-f]{6}$/i.test(out)) return out.toUpperCase();
    const m = out.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) {
      const r = Number(m[1]).toString(16).padStart(2, "0");
      const g = Number(m[2]).toString(16).padStart(2, "0");
      const b = Number(m[3]).toString(16).padStart(2, "0");
      return ("#" + r + g + b).toUpperCase();
    }
  } catch {}
  return null;
}
function getObjectColorFromXml(svgXml, objectId) {
  if (!svgXml || !objectId) return null;
  const re = new RegExp(`<[^>]*\\bid=["']${objectId}["'][^>]*>`, "i");
  const m = svgXml.match(re);
  if (!m) return null;
  const tag = m[0];

  const styleMatch = tag.match(/\bstyle=["']([^"']+)["']/i);
  let fill = null,
    stroke = null;
  if (styleMatch) {
    const style = styleMatch[1];
    const fm = style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
    const sm = style.match(/(?:^|;)\s*stroke\s*:\s*([^;]+)/i);
    fill = fm ? fm[1].trim() : null;
    stroke = sm ? sm[1].trim() : null;
  }
  if (!fill) {
    const fm = tag.match(/\bfill=["']([^"']+)["']/i);
    fill = fm ? fm[1].trim() : null;
  }
  if (!stroke) {
    const sm = tag.match(/\bstroke=["']([^"']+)["']/i);
    stroke = sm ? sm[1].trim() : null;
  }
  const chosen =
    (fill && fill !== "none" && fill) ||
    (stroke && stroke !== "none" && stroke) ||
    null;
  return cssColorToHex(chosen);
}
const currentHexFor = (piece, o) =>
  (
    o.colorHex ||
    o.strokeHex ||
    getObjectColorFromXml(piece?.svg?.xml, o.objectId) ||
    "#000000"
  ).toUpperCase();

/* ========== Popover de color (ajustes para móvil) ========== */
function ColorPopover({ anchorRect, onPick, onClose, palette }) {
  const ref = React.useRef(null);
  const [pos, setPos] = useState({
    left: 0,
    top: 0,
    side: "right",
    arrowTop: 16,
  });

  const COLS = 10,
    BTN = 24,
    GAP = 8,
    PAD = 12;
  const rows = Math.ceil(palette.length / COLS);
  const W = COLS * BTN + (COLS - 1) * GAP + PAD * 2;
  const H = rows * BTN + (rows - 1) * GAP + PAD * 2;

  // 🔒 Fuera-click robusto en móvil:
  // - usamos pointerdown en captura
  // - "armamos" el listener con un pequeño delay para ignorar el toque que abrió
  useEffect(() => {
    let armed = false;
    const arm = () => (armed = true);

    const onPD = (e) => {
      if (!armed) return;
      const node = ref.current;
      if (node && !node.contains(e.target)) onClose();
    };
    const onKey = (e) => e.key === "Escape" && onClose();

    const t = setTimeout(arm, 0);
    window.addEventListener("pointerdown", onPD, true);
    window.addEventListener("keydown", onKey);

    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onPD, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!anchorRect) return;
    const m = 12,
      vw = window.innerWidth,
      vh = window.innerHeight;

    let side = "right";
    let left = Math.min(vw - W - m, anchorRect.right + m);
    if (left + W + m > vw) {
      side = "left";
      left = Math.max(m, anchorRect.left - W - m);
    }
    let top = anchorRect.top + anchorRect.height / 2 - H / 2;
    top = Math.max(m, Math.min(top, vh - H - m));

    const centerY = anchorRect.top + anchorRect.height / 2;
    let arrowTop = centerY - top - 6;
    arrowTop = Math.max(10, Math.min(arrowTop, H - 22));

    setPos({ left, top, side, arrowTop });
  }, [anchorRect, W, H]);

  if (!anchorRect) return null;
  return (
    <div
      ref={ref}
      className={`color-popover ${pos.side === "left" ? "is-left" : "is-right"}`}
      style={{ left: pos.left, top: pos.top, width: W, height: H, zIndex: 1400 }} // ⬅️ sobre bottom-nav
      role="dialog"
      aria-label="Selector de color"
    >
      <div className="color-popover-arrow" style={{ top: pos.arrowTop }} />
      <div className="palette-grid popover-grid">
        {palette.map((hex) => (
          <button
            key={hex}
            className={`palette-btn pop-btn ${hex.toLowerCase() === "#ffffff" ? "is-white" : ""}`}
            title={hex}
            onClick={() => onPick(hex)}
            style={{ background: hex }}
          />
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */

export default function App() {
  const [status, setStatus] = useState("Elegí un molde ↓");
  const [progress, setProgress] = useState(0);
  const [hasModel, setHasModel] = useState(false);

  const [indexData, setIndexData] = useState({ moldes: {}, diseños: {} });
  const [catList, setCatList] = useState([]);
  const [selectedCat, setSelectedCat] = useState("");
  const [moldFiles, setMoldFiles] = useState([]);
  const [designList, setDesignList] = useState([]);
  const [selectedDesign, setSelectedDesign] = useState("");

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [categoryGalleryOpen, setCategoryGalleryOpen] = useState(false);

  const [previewImages, setPreviewImages] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  const [pieces, setPieces] = useState(new Map());
  const [selectedKey, setSelectedKey] = useState(null);

  const [editMode, setEditMode] = useState("global");
  const [palettePopover, setPalettePopover] = useState(null);

  const [designThumbs, setDesignThumbs] = useState({});
  const generatingThumbsRef = useRef(new Set());
  const abortControllersRef = useRef(new Map());

  const isMobile = useMediaQuery('(max-width: 780px)');
  const [mobilePanel, setMobilePanel] = useState(null);

  const MAX_CONC = 3;
  const runningRef = useRef(0);
  const queueRef = useRef([]);
  const pump = useCallback(() => {
    while (runningRef.current < MAX_CONC && queueRef.current.length) {
      const task = queueRef.current.shift();
      runningRef.current++;
      const ric = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
      ric(
        async () => {
          try {
            await task();
          } finally {
            runningRef.current--;
            pump();
          }
        },
        { timeout: 120 }
      );
    }
  }, []);
  const scheduleThumb = useCallback(
    (task) => {
      queueRef.current.push(task);
      pump();
    },
    [pump]
  );

  const TEX_SIZE = 4096;
  const FIT_MODE = "fitHeight";
  const THUMB_TEX = 1024;
  const THUMB_BOC_W = 480;
  const THUMB_BOC_H = 360;

  const viewerApiRef = useRef(null);
  const imageInputRef = useRef(null);

  const historyRef = useRef([]);
  const takeSnapshot = useCallback(() => {
    const p = Array.from(pieces.entries()).map(([k, v]) => ({
      key: k,
      nameBase: v.nameBase,
      svg: v.svg ? { xml: v.svg.xml } : null,
    }));
    const overlays = viewerApiRef.current?.getOverlaysState?.() || [];
    return { pieces: p, selectedDesign, selectedKey, overlays };
  }, [pieces, selectedDesign, selectedKey]);
  const pushSnapshot = useCallback(() => {
    historyRef.current.push(takeSnapshot());
  }, [takeSnapshot]);
  const restoreSnapshot = async (snap) => {
    const next = new Map();
    for (const e of snap.pieces) {
      const prev = pieces.get(e.key);
      const obj = {
        nameBase: e.nameBase,
        meshes: prev?.meshes || [],
        svg: null,
        objects: [],
      };
      if (e.svg?.xml) {
        obj.svg = { xml: e.svg.xml };
        obj.objects = safeExtractObjects(e.svg.xml);
      }
      next.set(e.key, obj);
    }
    setPieces(next);
    setSelectedDesign(snap.selectedDesign || "");
    setSelectedKey(snap.selectedKey || null);

    for (const p of next.values()) {
      if (p.svg?.xml) {
        const canvas = await rasterizeSvgToCanvasSafe(
          p.svg.xml,
          TEX_SIZE,
          TEX_SIZE,
          FIT_MODE
        );
        if (canvas)
          for (const m of p.meshes)
            viewerApiRef.current?.applyOverlayTexture(m, canvas);
      }
    }
    await viewerApiRef.current?.setOverlaysState?.(snap.overlays || []);
  };
  const handleUndo = useCallback(async () => {
    const stack = historyRef.current;
    if (stack.length <= 1) return;
    stack.pop();
    const prev = stack[stack.length - 1];
    await restoreSnapshot(prev);
  }, [restoreSnapshot]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      "--border",
      getComputedStyle(root).getPropertyValue("--border") || "#e5e7eb"
    );
    root.style.setProperty(
      "--accent",
      getComputedStyle(root).getPropertyValue("--accent") || "#2563eb"
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/index.json");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          if (text.trim().startsWith("<!DOCTYPE html>")) {
            throw new Error(
              "El servidor devolvió una página HTML en lugar de /index.json. Esto es un error de configuración del servidor o un archivo faltante (404/fallback)."
            );
          }
          throw e;
        }
        const idx = { moldes: json.moldes || {}, diseños: json.diseños || {} };
        setIndexData(idx);
        const cats = Object.keys(idx.moldes);
        setCatList(cats);
        setStatus(
          cats.length ? "Elegí un molde ↓" : "No hay categorías en index.json"
        );
      } catch (err) {
        console.error("Error leyendo /index.json:", err);
        setStatus(
          `Error al cargar índice: ${err.message || "Verifica tu archivo y configuración de servidor."}`
        );
      }
    })();
  }, []);

  const handleSelectCategory = useCallback(
    async (cat) => {
      setCategoryGalleryOpen(false);
      setSelectedCat(cat);
      setSelectedDesign("");
      setHasModel(false);
      setPieces(new Map());
      setSelectedKey(null);
      setPalettePopover(null);
      setEditMode("global");
      setStatus(`Categoría: ${cat}`);

      for (const [k, ctrl] of abortControllersRef.current.entries()) {
        try {
          ctrl.abort();
        } catch {}
        abortControllersRef.current.delete(k);
      }

      const m = indexData.moldes?.[cat];
      const d = indexData.diseños?.[cat];
      const files = Array.isArray(m?.files) ? m.files : [];
      setMoldFiles(files);
      setDesignList(d ? Object.keys(d) : []);
      setDesignThumbs({});
      setGalleryOpen(true);
    },
    [indexData]
  );

  const handleLoadGlbFromGallery = useCallback(async (modelUrl, fileName) => {
    setGalleryOpen(false);
    setMobilePanel(null);
    setProgress(0);
    setStatus(`Cargando ${fileName}…`);
    viewerApiRef.current?.loadModelFromUrl(modelUrl, {
      onStart: () => setProgress(5),
      onProgress: (p) => setProgress(p),
      onDone: () => {
        setProgress(100);
        setStatus(`Modelo: ${fileName}`);
      },
      onClear: () => {
        setPieces(new Map());
        setSelectedKey(null);
        setHasModel(false);
        setPreviewImages(null);
        setDesignThumbs({});
        setPalettePopover(null);
        historyRef.current = [];
      },
    });
  }, []);

  const [modelKey, setModelKey] = useState("");
  const onModelReady = useCallback(
    (meshesFlat) => {
      const map = new Map();
      for (const m of meshesFlat) {
        if (!m.hasUV) continue;
        const b = baseName(m.name);
        const entry =
          map.get(b) || { nameBase: b, meshes: [], svg: null, objects: [] };
        entry.meshes.push({
          mesh: m.ref,
          uMin: m.uMin,
          uMax: m.uMax,
          vMin: m.vMin,
          vMax: m.vMax,
          overlayMat: null,
          overlayMesh: null,
        });
        map.set(b, entry);
      }
      setPieces(map);
      setSelectedKey(null);
      setHasModel(true);
      historyRef.current = [];
      pushSnapshot();
      const key = Array.from(map.keys()).sort().join("|");
      setModelKey(key);
    },
    [pushSnapshot]
  );

  const onProgress = (p) => setProgress(p);
  const onClear = useCallback(() => {
    setPieces(new Map());
    setSelectedKey(null);
    setStatus("Elegí un molde ↓");
    setProgress(0);
    setHasModel(false);
    setPreviewImages(null);
    setDesignThumbs({});
    setPalettePopover(null);
    setEditMode("global");
    historyRef.current = [];
  }, []);

  function findPieceKeyForFile(piecesMap, fileBase) {
    if (piecesMap.has(fileBase)) return fileBase;
    const tokens = fileBase.split("_").filter(Boolean);
    let best = null,
      bestScore = 0;
    for (const key of piecesMap.keys()) {
      const keyTokens = key.split("_");
      let score = 0;
      for (const t of tokens) if (keyTokens.includes(t)) score++;
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
    return bestScore > 0 ? best : null;
  }

  const THUMB_CACHE_NS = "thumb:v1:";
  const getThumbCacheKey = (cat, design, modelK) =>
    `${THUMB_CACHE_NS}${cat}::${design}::${modelK}`;
  const readThumb = (cat, design, modelK) => {
    try {
      return localStorage.getItem(getThumbCacheKey(cat, design, modelK));
    } catch {}
    return null;
  };
  const writeThumb = (cat, design, modelK, dataUrl) => {
    try {
      localStorage.setItem(getThumbCacheKey(cat, design, modelK), dataUrl);
    } catch {}
  };

  const ensureDesignThumb = useCallback(
    (designName) => {
      if (!hasModel || !selectedCat || !designName) return;
      if (designThumbs[designName]) return;
      const inFlight = generatingThumbsRef.current;
      if (inFlight.has(designName)) return;

      const cached = modelKey ? readThumb(selectedCat, designName, modelKey) : null;
      if (cached) {
        setDesignThumbs((prev) => ({ ...prev, [designName]: cached }));
        return;
      }

      inFlight.add(designName);
      const ac = new AbortController();
      abortControllersRef.current.set(designName, ac);

      scheduleThumb(async () => {
        try {
          if (designThumbs[designName]) return;

          const files = indexData.diseños?.[selectedCat]?.[designName];
          if (!Array.isArray(files) || files.length === 0) {
            setDesignThumbs((prev) => ({ ...prev, [designName]: "__ERR__" }));
            return;
          }

          const touched = [];
          const perFileCanvases = [];

          for (const file of files) {
            if (ac.signal.aborted) return;
            const svgUrl = `/diseños/${encodeURIComponent(
              selectedCat
            )}/${encodeURIComponent(designName)}/${encodeURIComponent(file)}`;
            try {
              const r = await fetch(svgUrl, { signal: ac.signal });
              if (!r.ok) throw new Error(`HTTP ${r.status}`);
              const svgText = await r.text();
              const fileBase = baseName(file);
              const targetKey = findPieceKeyForFile(pieces, fileBase);
              if (!targetKey) continue;
              const piece = pieces.get(targetKey);
              if (!piece) continue;

              const canvas = await rasterizeSvgToCanvasSafe(
                svgText,
                THUMB_TEX,
                THUMB_TEX,
                FIT_MODE
              );
              if (!canvas) continue;

              perFileCanvases.push({ piece, canvas });
            } catch (err) {
              if (ac.signal.aborted) return;
              console.warn("No se pudo cargar/rasterizar SVG (thumb):", svgUrl, err.message);
            }
          }

          try {
            await viewerApiRef.current?.suspendRender?.(true);
          } catch {}
          for (const { piece, canvas } of perFileCanvases) {
            for (const m of piece.meshes) {
              const hadOverlay = !!m.overlayMat;
              const prevImage = hadOverlay ? m.overlayMat?.map?.image || null : null;
              viewerApiRef.current?.applyOverlayTexture(m, canvas, true);
              touched.push({ m, hadOverlay, prevImage });
            }
          }

          if (ac.signal.aborted) return;

          const boc = await viewerApiRef.current?.getBocetoImages?.({
            width: THUMB_BOC_W,
            height: THUMB_BOC_H,
            quality: 0.85,
          });
          const thumb = boc?.front || null;

          for (const rec of touched) {
            const m = rec.m;
            if (rec.hadOverlay) {
              if (m.overlayMat?.map && rec.prevImage) {
                m.overlayMat.map.image = rec.prevImage;
                m.overlayMat.map.needsUpdate = true;
                m.overlayMat.needsUpdate = true;
              }
            } else {
              try {
                if (m.overlayMesh && m.mesh) m.mesh.remove(m.overlayMesh);
                m.overlayMat?.map?.dispose?.();
                m.overlayMat?.dispose?.();
              } catch {}
              m.overlayMat = null;
              m.overlayMesh = null;
            }
          }
          try {
            await viewerApiRef.current?.suspendRender?.(false);
          } catch {}

          if (ac.signal.aborted) return;

          setDesignThumbs((prev) => ({ ...prev, [designName]: thumb || "__ERR__" }));
          if (thumb && modelKey) writeThumb(selectedCat, designName, modelKey, thumb);
        } catch (err) {
          if (ac.signal.aborted) return;
          console.error("Error generando miniatura:", designName, err);
          setDesignThumbs((prev) => ({ ...prev, [designName]: "__ERR__" }));
        } finally {
          inFlight.delete(designName);
          abortControllersRef.current.delete(designName);
        }
      });
    },
    [hasModel, selectedCat, indexData, pieces, designThumbs, modelKey, scheduleThumb, THUMB_TEX, FIT_MODE, THUMB_BOC_W, THUMB_BOC_H]
  );

  const handleSelectDesign = useCallback(
    async (designName) => {
      if (!hasModel || !selectedCat) return;
      setSelectedDesign(designName);
      setMobilePanel(null);
      setStatus(`Aplicando diseño “${designName}”…`);

      const files = indexData.diseños?.[selectedCat]?.[designName];
      if (!Array.isArray(files) || files.length === 0) {
        setStatus(`Diseño “${designName}” no tiene SVGs.`);
        return;
      }

      const next = new Map(pieces);

      for (const file of files) {
        const svgUrl = `/diseños/${encodeURIComponent(
          selectedCat
        )}/${encodeURIComponent(designName)}/${encodeURIComponent(file)}`;
        try {
          const r = await fetch(svgUrl);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const svgText = await r.text();

          const fileBase = baseName(file);
          const targetKey = findPieceKeyForFile(next, fileBase);
          if (!targetKey) continue;

          const piece =
            next.get(targetKey) || { nameBase: targetKey, meshes: [], svg: null, objects: [] };
          piece.svg = { xml: svgText };
          piece.objects = safeExtractObjects(svgText);

          next.set(targetKey, piece);

          const canvas = await rasterizeSvgToCanvasSafe(
            svgText,
            TEX_SIZE,
            TEX_SIZE,
            FIT_MODE
          );
          if (canvas)
            for (const m of piece.meshes)
              viewerApiRef.current?.applyOverlayTexture(m, canvas);
        } catch (err) {
          console.warn("No se pudo cargar SVG:", svgUrl, err.message);
        }
      }

      setPieces(next);
      const firstWithSvg = Array.from(next.values()).find((p) => p.svg?.xml);
      setSelectedKey(firstWithSvg?.nameBase ?? null);
      setStatus(`Diseño “${designName}” aplicado`);
      setEditMode("global");
      pushSnapshot();
    },
    [hasModel, selectedCat, indexData, pieces, pushSnapshot, TEX_SIZE, FIT_MODE]
  );

  const _applyObjectColorChange = useCallback(
    async (pieceKey, objectId, newHex, { silent = false } = {}) => {
      const next = new Map(pieces);
      const piece = next.get(pieceKey);
      if (!piece?.svg?.xml) return;

      const obj = (piece.objects || []).find((o) => o.objectId === objectId);
      const target = obj?.colorHex ? "fill" : "stroke";

      const updatedXml = setObjectColor(piece.svg.xml, objectId, newHex, {
        target,
      });
      piece.svg.xml = updatedXml;
      piece.objects = safeExtractObjects(updatedXml);
      next.set(pieceKey, piece);
      setPieces(next);

      const low = Math.min(1024, TEX_SIZE);
      const canvasLow = await rasterizeSvgToCanvasSafe(
        piece.svg.xml,
        low,
        low,
        FIT_MODE
      );
      if (canvasLow)
        for (const m of piece.meshes)
          viewerApiRef.current?.applyOverlayTexture(m, canvasLow, true);

      setTimeout(async () => {
        const canvasHi = await rasterizeSvgToCanvasSafe(
          piece.svg.xml,
          TEX_SIZE,
          TEX_SIZE,
          FIT_MODE
        );
        if (canvasHi)
          for (const m of piece.meshes)
            viewerApiRef.current?.applyOverlayTexture(m, canvasHi, true);
      }, 0);

      if (!silent) pushSnapshot();
    },
    [pieces, pushSnapshot, TEX_SIZE, FIT_MODE]
  );

  const applyBatchColor = useCallback(
    async (refs, newHex) => {
      for (const r of refs) {
        await _applyObjectColorChange(r.pieceKey, r.objectId, newHex, {
          silent: true,
        });
      }
      pushSnapshot();
    },
    [_applyObjectColorChange, pushSnapshot]
  );

  function safeExtractObjects(svgXml) {
    try {
      const list = extractSvgObjects(svgXml, { groupNames: ["diseño", "diseno"] });
      return Array.isArray(list) ? list : [];
    } catch (e) {
      console.warn("extractSvgObjects falló:", e);
      return [];
    }
  }

  const togglePiece = (nameBase) => {
    setSelectedKey((prev) => (prev === nameBase ? null : nameBase));
    setPalettePopover(null);
    setEditMode("per-piece");
  };

  // 🛠️ FIX: Evitar que el tap de apertura sea leído como “click afuera”
  const openPaletteForLayer = (evt, payload) => {
    evt.preventDefault();
    evt.stopPropagation();
    const rect = evt.currentTarget.getBoundingClientRect();
    const same =
      palettePopover &&
      JSON.stringify({ ...palettePopover, anchorRect: undefined }) ===
        JSON.stringify({ ...payload, anchorRect: undefined });
    if (same) setPalettePopover(null);
    else setPalettePopover({ ...payload, anchorRect: rect });
  };

  const handleOpenPreview = useCallback(async () => {
    if (!hasModel) return;
    try {
      setIsGeneratingPreview(true);
      const images = await viewerApiRef.current?.getBocetoImages({
        width: 1600,
        height: 1200,
        quality: 0.95,
      });
      if (!images || !images.front) {
        alert("No se pudo generar la previsualización.");
        return;
      }
      setPreviewImages(images);
    } finally {
      setIsGeneratingPreview(false);
    }
  }, [hasModel]);

  const allPieces = Array.from(pieces.values());
  const visiblePieces = selectedDesign ? allPieces.filter((p) => p.svg?.xml) : [];

  const globalLayers = useMemo(() => {
    if (!selectedDesign) return [];
    const map = new Map();
    for (const p of visiblePieces) {
      for (const o of p.objects || []) {
        const name = o.objectName || "CAPA";
        const hex = currentHexFor(p, o);
        const entry = map.get(name) || { name, hex, refs: [] };
        entry.refs.push({ pieceKey: p.nameBase, objectId: o.objectId });
        if (!entry.hex || entry.hex === "#000000") entry.hex = hex;
        map.set(name, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "es")
    );
  }, [selectedDesign, visiblePieces]);

  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [editingText, setEditingText] = useState(null);

  const [initialTextForm] = useState({
    text: "TU TEXTO",
    fontFamily: "Inter, system-ui, Arial, sans-serif",
    fontWeight: 800,
    fontStyle: "normal",
    fontSize: 96,
    color: "#111827",
    align: "center",
    strokeColor: "#ffffff",
    strokeWidth: 0,
    padding: 24,
    background: "transparent",
    lineHeight: 1.2,
    opacity: 1,
  });

  const handleAddText = async (textConfig) => {
    if (!hasModel) {
      alert("Cargá un modelo primero.");
      return;
    }
    const api = viewerApiRef.current;
    if (!api?.addTextOverlay) {
      alert("La función addTextOverlay no está disponible.");
      return;
    }
    await api.addTextOverlay({ ...textConfig });
    setStatus("Texto listo: hacé clic sobre el modelo para colocarlo.");
    setTextPanelOpen(false);
    setEditingText(null);
    setMobilePanel(null);
  };

  const handleUpdateText = async (textConfig) => {
    if (!hasModel || !editingText) return;
    const api = viewerApiRef.current;
    if (!api?.updateTextOverlay) return;
    await api.updateTextOverlay({ ...textConfig });
    setEditingText(textConfig);
    setStatus("Texto actualizado.");
  };

  const handleTextSelected = (textData) => {
    setEditingText(textData);
    if (textData) {
      setTextPanelOpen(true);
      if (isMobile) setMobilePanel('text');
    }
  };

  const handleToggleTextPanel = () => {
    const isOpening = !textPanelOpen;
    setTextPanelOpen(isOpening);
    if (isOpening) {
      setEditingText(null);
      viewerApiRef.current?.clearSelectionAll();
    } else {
      setEditingText(null);
      viewerApiRef.current?.clearSelectionAll();
      if (isMobile) setMobilePanel(null);
    }
  };

  const handleCloseTextPanel = () => {
    setTextPanelOpen(false);
    setEditingText(null);
    viewerApiRef.current?.clearSelectionAll();
    if (isMobile) setMobilePanel(null);
  };

  const handleMobilePanelChange = (panelId) => {
    const newPanel = mobilePanel === panelId ? null : panelId;
    setMobilePanel(newPanel);
  
    if (newPanel === 'molds') {
      setCategoryGalleryOpen(true);
    } else {
      setCategoryGalleryOpen(false);
      setGalleryOpen(false);
    }
  
    if (newPanel === 'text') {
      if (!textPanelOpen) handleToggleTextPanel();
    } else {
      if (textPanelOpen && !editingText) handleCloseTextPanel();
    }
  };

  // --- MINICOMPONENTE DE ESTATUS ---
  const StatusSection = () => (
    <section className="sec" style={{ marginTop: 0, padding: isMobile ? '8px 16px' : '20px 24px' }}>
      <div className="small" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span>{status}</span>
        <div className="progress" style={{ width: isMobile ? 120 : 160 }}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );

  return (
    <div className={`app ${isMobile ? "is-mobile" : "is-desktop"}`}>

      {/* --- BARRA LATERAL (SOLO ESCRITORIO) --- */}
      {!isMobile && (
        <aside id="ui" className="sidebar">
            <StatusSection />
            <DesignsPanel
                isMobile={false}
                selectedCat={selectedCat}
                hasModel={hasModel}
                designList={designList}
                designThumbs={designThumbs}
                handleSelectDesign={handleSelectDesign}
                ensureDesignThumb={ensureDesignThumb}
            />
            <ColorsPanel
                isMobile={false}
                editMode={editMode}
                setEditMode={setEditMode}
                selectedDesign={selectedDesign}
                globalLayers={globalLayers}
                visiblePieces={visiblePieces}
                selectedKey={selectedKey}
                togglePiece={togglePiece}
                openPaletteForLayer={openPaletteForLayer}
                currentHexFor={currentHexFor}
            />
        </aside>
      )}

      {/* --- VISOR 3D Y ELEMENTOS ASOCIADOS --- */}
      <main id="view" className="viewport">
        <div className="top-controls">
          <button className="icon-btn" onClick={handleOpenPreview} disabled={!hasModel || isGeneratingPreview} title="Descargar boceto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <button className="icon-btn" onClick={() => imageInputRef.current?.click()} disabled={!hasModel} title="Cargar imagen">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="14" height="14" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M3 14l4-4 3 3 2-2 5 5" /><path d="M19 7v10" />
            </svg>
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) viewerApiRef.current?.addDecalImage(f); e.target.value = ""; }} />
          
          <button className="icon-btn" onClick={handleToggleTextPanel} disabled={!hasModel} title="Añadir o editar texto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path><path d="M12 18V6"></path><path d="M7 12h10"></path>
            </svg>
          </button>

          <button className="icon-btn" onClick={handleUndo} title="Volver atrás">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>

        <Viewer3D
          refApi={(api) => (viewerApiRef.current = api)}
          onModelReady={onModelReady}
          onProgress={onProgress}
          onClearAll={onClear}
          onOverlaysChanged={() => pushSnapshot()}
          onTextSelected={handleTextSelected}
          log={console.log}
        />

        {!isMobile && (
          <MoldWheel
            categories={catList}
            selected={selectedCat}
            onSelect={handleSelectCategory}
            centerLabel="MOLDES"
          />
        )}

        {/* Galerías de Modelos/Categorías (siguen siendo modales/overlays) */}
        <ModelGallery
          open={categoryGalleryOpen}
          isCategoryGallery={true}
          category="Categorías"
          models={catList}
          onClose={() => {
            setCategoryGalleryOpen(false);
            if(isMobile) setMobilePanel(null);
          }}
          onSelect={handleSelectCategory}
        />

        <ModelGallery
          open={galleryOpen}
          category={selectedCat}
          models={moldFiles}
          onClose={() => {
            setGalleryOpen(false);
          }}
          onSelect={handleLoadGlbFromGallery}
        />
      </main>

      {/* --- ÁREA DE PANELES MÓVILES (Slot que empuja el 3D) --- */}
      {isMobile && (
        <div className={`mobile-panel-slot ${mobilePanel && mobilePanel !== 'molds' && mobilePanel !== 'text' ? 'is-open' : ''}`}>
          
          {(mobilePanel === 'designs' || mobilePanel === 'colors') && <StatusSection />}
          
          <DesignsPanel
              isMobile={true}
              open={mobilePanel === 'designs'} 
              onClose={() => setMobilePanel(null)}
              selectedCat={selectedCat}
              hasModel={hasModel}
              designList={designList}
              designThumbs={designThumbs}
              handleSelectDesign={handleSelectDesign}
              ensureDesignThumb={ensureDesignThumb}
          />

          <ColorsPanel
              isMobile={true}
              open={mobilePanel === 'colors'}
              onClose={() => setMobilePanel(null)}
              editMode={editMode}
              setEditMode={setEditMode}
              selectedDesign={selectedDesign}
              globalLayers={globalLayers}
              visiblePieces={visiblePieces}
              selectedKey={selectedKey}
              togglePiece={togglePiece}
              openPaletteForLayer={openPaletteForLayer}
              currentHexFor={currentHexFor}
          />
        </div>
      )}

      {/* --- NAVEGACIÓN INFERIOR (SOLO MÓVIL) --- */}
      {isMobile && <BottomNav activePanel={mobilePanel} onPanelChange={handleMobilePanelChange} />}

      {/* --- MODALES Y POPOVERS GLOBALES --- */}
      {previewImages && <PreviewModal images={previewImages} onClose={() => setPreviewImages(null)} />}
      {palettePopover && (
        <ColorPopover
          anchorRect={palettePopover.anchorRect}
          palette={FLAT_PALETTE}
          onClose={() => setPalettePopover(null)}
          onPick={async (hex) => {
            if (palettePopover.mode === "global") {
              await applyBatchColor(palettePopover.refs, hex);
            } else {
              await _applyObjectColorChange(palettePopover.pieceKey, palettePopover.objectId, hex);
            }
            setPalettePopover(null);
          }}
        />
      )}
      <TextPanel
        open={textPanelOpen && (!isMobile || (isMobile && mobilePanel === 'text'))}
        onClose={handleCloseTextPanel}
        onCreateText={handleAddText}
        onUpdateText={handleUpdateText}
        initialData={initialTextForm}
        editingData={editingText}
      />
    </div>
  );
}
