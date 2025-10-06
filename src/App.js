// src/App.js
import React, { useRef, useState, useEffect } from "react";
import Viewer3D from "./Viewer3D";
import { extractSvgColors, replaceColorTokenEverywhere } from "./utils/svgColors";
import { rasterizeSvgToCanvasSafe } from "./utils/rasterizeSvg";
import ExportBocetoButton from "./ExportBocetoButton";
import PreviewModal from "./PreviewModal";
import "./index.css";

const stripAccents = (s)=> String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const baseName = (s)=> stripAccents(String(s||"").trim()).replace(/[\s\-]+/g,"_").replace(/_\d+$/,"").toUpperCase();

/** Paleta amplia (Material 300/500/700 + blancos/negros) */
const MATERIAL_PALETTE = [
  ["#ffffff","#000000"],
  ["#E57373","#F44336","#D32F2F"],
  ["#F06292","#E91E63","#C2185B"],
  ["#BA68C8","#9C27B0","#7B1FA2"],
  ["#9575CD","#673AB7","#512DA8"],
  ["#7986CB","#3F51B5","#303F9F"],
  ["#64B5F6","#2196F3","#1976D2"],
  ["#4FC3F7","#03A9F4","#0288D1"],
  ["#4DD0E1","#00BCD4","#0097A7"],
  ["#4DB6AC","#009688","#00796B"],
  ["#81C784","#4CAF50","#388E3C"],
  ["#AED581","#8BC34A","#689F38"],
  ["#DCE775","#CDDC39","#AFB42B"],
  ["#FFF176","#FFEB3B","#FBC02D"],
  ["#FFD54F","#FFC107","#FFA000"],
  ["#FFB74D","#FF9800","#F57C00"],
  ["#FF8A65","#FF5722","#E64A19"],
  ["#A1887F","#795548","#5D4037"],
  ["#E0E0E0","#9E9E9E","#616161"],
  ["#90A4AE","#607D8B","#455A64"],
];
const FLAT_PALETTE = MATERIAL_PALETTE.flat();

export default function App(){
  // Estado modelo / visor
  const [status, setStatus] = useState("Elegí una carpeta en Moldes →");
  const [progress, setProgress] = useState(0);
  const [hasModel, setHasModel] = useState(false);

  // Previsualización PDF
  const [previewImages, setPreviewImages] = useState(null); // {front, back, left, right} o null
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  // PIEZAS (SVG/colores)
  const [pieces, setPieces] = useState(new Map());
  const [selectedKey, setSelectedKey] = useState(null);
  const [openToken, setOpenToken] = useState(null);

  // 🔒 Configuración fija (no editable por el usuario)
  const texSize = 4096;
  const fitMode = "fitHeight";

  // Moldes (navegación por carpetas/archivos)
  const [folders, setFolders] = useState([]);             // ["futbol", "basket", ...]
  const [selectedFolder, setSelectedFolder] = useState(""); 
  const [folderFiles, setFolderFiles] = useState([]);     // [{name:"Mateando", file:"mateando.glb"}, ...]

  const viewerApiRef = useRef(null);
  const pieceInputRefs = useRef({});

  // === Cargar índice de carpetas (public/moldes/index.json) ===
  useEffect(() => {
    const url = "/moldes/index.json";
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(j => {
        const arr = Array.isArray(j.folders) ? j.folders : [];
        setFolders(arr);
      })
      .catch(err => {
        console.error("❌ Error leyendo carpetas de moldes:", err.message);
        setFolders([]);
        setStatus("No se pudieron cargar las carpetas de moldes.");
      });
  }, []);

  // === Cuando elijo una carpeta, leer sus archivos (public/moldes/<carpeta>/index.json) ===
  async function handleSelectFolder(folderName){
    setSelectedFolder(folderName);
    setFolderFiles([]);
    setStatus(`Leyendo moldes de: ${folderName}…`);
    try{
      const url = `/moldes/${folderName}/index.json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const files = Array.isArray(j.files) ? j.files : [];
      setFolderFiles(files);
      setStatus(`Elegí un .glb de "${folderName}"`);
    }catch(err){
      console.error("❌ Error leyendo archivos de carpeta:", err.message);
      setStatus(`No se pudieron leer los moldes de "${folderName}"`);
    }
  }

  // === Cargar GLB desde carpeta/archivo seleccionado ===
  async function handleLoadGlbFromFolder(fileEntry){
    if (!selectedFolder) return;
    const fileName = fileEntry?.file || "";
    if (!fileName) return;
    const modelUrl = `/moldes/${selectedFolder}/${fileName}`;

    setProgress(0);
    setStatus(`Cargando ${fileName}…`);

    viewerApiRef.current?.loadModelFromUrl(
      modelUrl,
      {
        onStart: () => setProgress(5),
        onProgress: (p) => setProgress(p),
        onDone: () => {
          setProgress(100);
          setStatus(`Modelo: ${fileEntry.name || fileName}`);
        },
        onClear: () => {
          setPieces(new Map());
          setSelectedKey(null);
          setOpenToken(null);
          setHasModel(false);
          setPreviewImages(null);
        }
      }
    );
  }

  // === Callbacks desde el visor al terminar de cargar ===
  const onModelReady = (meshesFlat) => {
    const map = new Map();
    for (const m of meshesFlat) {
      if (!m.hasUV) continue;
      const b = baseName(m.name);
      const entry = map.get(b) || { nameBase: b, meshes: [], svg: null };
      entry.meshes.push({ mesh: m.ref, uMin: m.uMin, uMax: m.uMax, vMin: m.vMin, vMax: m.vMax, overlayMat: null });
      map.set(b, entry);
    }
    setPieces(map);
    setSelectedKey(null);
    setOpenToken(null);
    setHasModel(true);
  };

  const onProgress = (p) => setProgress(p);

  const onClear = () => {
    setPieces(new Map());
    setSelectedKey(null);
    setOpenToken(null);
    setStatus("Elegí una carpeta en Moldes →");
    setProgress(0);
    setHasModel(false);
    setPreviewImages(null);
  };

  // === SVG por pieza ===
  async function handleSvgForPiece(key, file){
    if (!file) return;
    const svgText = await file.text();
    const colors = extractSvgColors(svgText);

    const next = new Map(pieces);
    const piece = next.get(key);
    if (!piece) return;

    piece.svg = { xml: svgText, colors };
    next.set(key, piece);
    setPieces(next);

    for (const m of piece.meshes) {
      const canvas = await rasterizeSvgToCanvasSafe(svgText, texSize, texSize, fitMode);
      if (!canvas) continue;
      viewerApiRef.current?.applyOverlayTexture(m, canvas);
    }

    setSelectedKey(key);
    setOpenToken(null);

    const input = pieceInputRefs.current[key];
    if (input) input.value = "";
  }

  // === Cambio de color instantáneo ===
  async function applyColorChangeInstant(token, newHex){
    if (!selectedKey) return;
    const next = new Map(pieces);
    const piece = next.get(selectedKey);
    if (!piece?.svg) return;

    piece.svg.xml = replaceColorTokenEverywhere(piece.svg.xml, token, newHex);
    piece.svg.colors = extractSvgColors(piece.svg.xml);
    next.set(selectedKey, piece);
    setPieces(next);

    // preview rápida
    const lowSize = Math.min(1024, texSize);
    const canvasLow = await rasterizeSvgToCanvasSafe(piece.svg.xml, lowSize, lowSize, fitMode);
    if (canvasLow) {
      for (const m of piece.meshes) {
        viewerApiRef.current?.applyOverlayTexture(m, canvasLow, /*keepRepeatOffset*/true);
      }
    }
    // alta resolución
    setTimeout(async ()=>{
      const canvasHi = await rasterizeSvgToCanvasSafe(piece.svg.xml, texSize, texSize, fitMode);
      if (canvasHi) {
        for (const m of piece.meshes) {
          viewerApiRef.current?.applyOverlayTexture(m, canvasHi, /*keepRepeatOffset*/true);
        }
      }
    }, 0);
  }

  // === UI helpers ===
  function onPieceMainClick(nameBase){
    const rec = pieces.get(nameBase);
    if (!rec) return;
    if (!rec.svg){
      pieceInputRefs.current[nameBase]?.click();
    }
    setSelectedKey(nameBase);
    setOpenToken(null);
  }
  function onChangeSvgClick(nameBase){
    pieceInputRefs.current[nameBase]?.click();
  }

  // === Previsualización / Descarga desde botón flotante ===
  async function handleOpenPreview(){
    if (!hasModel) return;
    try{
      setIsGeneratingPreview(true);
      const images = await viewerApiRef.current?.getBocetoImages({ width: 1600, height: 1200, quality: 0.95 });
      if (!images || !images.front) {
        alert("No se pudo generar la previsualización. ¿Cargaste un modelo?");
        setIsGeneratingPreview(false);
        return;
      }
      setPreviewImages(images);
    } catch(err){
      console.error(err);
      alert("Ocurrió un error al generar la previsualización.");
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  async function handleDownloadFromPreview(){
    if (!previewImages) return;
    try{
      const mod = await import(/* webpackChunkName: "jspdf" */ "jspdf");
      const jsPDF = mod.jsPDF || mod.default;

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const margin = 28;
      const cellW = (pageW - margin*3) / 2;
      const cellH = (pageH - margin*3) / 2;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      const today = new Date();
      const fecha = today.toLocaleDateString();
      pdf.text(`Boceto – Vistas (frente, espalda, izquierda, derecha) · ${fecha}`, margin, margin - 8);

      const place = (img, x, y) => {
        if (!img) return;
        pdf.addImage(img, "PNG", x, y, cellW, cellH, undefined, "FAST");
      };

      place(previewImages.front, margin, margin);
      place(previewImages.back,  margin*2 + cellW, margin);
      place(previewImages.left,  margin, margin*2 + cellH);
      place(previewImages.right, margin*2 + cellW, margin*2 + cellH);

      pdf.save("boceto-vistas.pdf");
      setPreviewImages(null);
    } catch (e) {
      alert("Para exportar a PDF instalá la dependencia:  npm i jspdf");
    }
  }

  return (
    <div className="app">
      {/* Panel izquierdo */}
      <div id="ui">
        {/* --- Selector de carpetas --- */}
        <section className="sec">
          <h3>📁 Moldes</h3>
          {folders.length === 0 ? (
            <div className="small">No hay carpetas. Creá <code>public/moldes/index.json</code> con {"{ folders: [...] }"}.</div>
          ) : (
            <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
              {folders.map(f => (
                <button
                  key={f}
                  className={`btn ${selectedFolder===f ? "btn-primary" : ""}`}
                  onClick={()=>handleSelectFolder(f)}
                  title={`Abrir carpeta "${f}"`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
          <div className="small" style={{marginTop:6}}>{status}</div>
          <div id="bar" style={{marginTop:10}}><span id="barfill" style={{width:`${progress}%`}}/></div>
        </section>

        {/* --- Archivos .glb de la carpeta elegida --- */}
        {selectedFolder && (
          <section className="sec">
            <h3>📦 Archivos en “{selectedFolder}”</h3>
            {folderFiles.length === 0 ? (
              <div className="small">No hay <code>index.json</code> o no contiene archivos.</div>
            ) : (
              <div style={{display:"flex", flexDirection:"column", gap:8}}>
                {folderFiles.map(file => (
                  <button key={file.file} className="btn-primary" onClick={()=>handleLoadGlbFromFolder(file)}>
                    {file.name || file.file}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* --- Piezas y SVG --- */}
        <section className="sec">
          <h3>🧩 Piezas (SVG por pieza)</h3>
          <div id="parts" className="list">
            {pieces.size === 0 ? "—" : (
              Array.from(pieces.values()).map(p => {
                const hasSVG = !!p.svg;
                return (
                  <div key={p.nameBase} className="item" style={{gridTemplateColumns:"1fr auto", gap:10}}>
                    <button
                      className="btn-primary"
                      style={{justifySelf:"start"}}
                      onClick={()=>onPieceMainClick(p.nameBase)}
                      title={hasSVG ? "Seleccionar para editar colores" : "Cargar SVG"}
                    >
                      {hasSVG ? "Seleccionar pieza" : "Cargar SVG"}
                    </button>

                    {hasSVG && (
                      <button onClick={()=>onChangeSvgClick(p.nameBase)} title="Volver a cargar SVG">
                        Cambiar SVG
                      </button>
                    )}

                    <div className="name" style={{gridColumn:"1 / -1"}}>
                      <span className={`dot ${hasSVG ? "ok" : "miss"}`} title={hasSVG ? "SVG aplicado" : "Sin SVG"} />
                      <span style={{fontWeight:700}}>{p.nameBase}</span>
                    </div>

                    <input
                      type="file"
                      accept=".svg"
                      style={{display:"none"}}
                      ref={(el)=>{ if (el) pieceInputRefs.current[p.nameBase] = el; }}
                      onChange={(ev)=>handleSvgForPiece(p.nameBase, ev.target.files?.[0])}
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* --- Colores --- */}
        <section className="sec">
          <h3>🎨 Colores del SVG</h3>
          <div id="colorsWrap" className="swatches">
            {(!selectedKey) ? "—" : (() => {
              const piece = pieces.get(selectedKey);
              if (!piece?.svg) return "Cargá un SVG para esta pieza.";
              const colors = piece.svg.colors || [];
              if (!colors.length) return "No se detectaron colores editables (fill/stroke/stop-color).";

              return colors.map(c => {
                const isOpen = openToken === c.token;
                return (
                  <div key={c.token} style={{display:"flex", flexDirection:"column", gap:6, marginBottom:12}}>
                    <button
                      onClick={()=>setOpenToken(isOpen ? null : c.token)}
                      style={{display:"flex", alignItems:"center", gap:8, background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"6px 8px", cursor:"pointer"}}
                      title="Elegir nuevo color"
                    >
                      <div className="swatch" style={{background:c.hex}} />
                      <div className="token" style={{flex:1, textAlign:"left"}}>{c.token}</div>
                      <div className="small" style={{opacity:.7}}>{c.count} uso(s)</div>
                    </button>

                    {isOpen && (
                      <div className="palette-grid">
                        {FLAT_PALETTE.map(hex => (
                          <button
                            key={hex+selectedKey+c.token}
                            title={hex}
                            className={`palette-btn ${hex.toLowerCase()==="#ffffff" ? "is-white" : ""}`}
                            onClick={()=>applyColorChangeInstant(c.token, hex)}
                            style={{ background: hex }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </section>
      </div>

      {/* Contenedor del visor 3D */}
      <div id="view">
        <Viewer3D
          refApi={(api)=>viewerApiRef.current = api}
          onModelReady={onModelReady}
          onProgress={onProgress}
          onClearAll={onClear}
          log={console.log}
        />
      </div>

      {/* Botón flotante: previsualizar/descargar PDF */}
      <ExportBocetoButton
        onClick={handleOpenPreview}
        disabled={!hasModel || isGeneratingPreview}
      />

      {/* Modal de previsualización */}
      {previewImages && (
        <PreviewModal
          images={previewImages}
          onClose={()=>setPreviewImages(null)}
          onDownload={handleDownloadFromPreview}
        />
      )}
    </div>
  );
}
