// src/Viewer3D.jsx
import React, { useEffect, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export default function Viewer3D({
  refApi,
  onModelReady,
  onProgress,
  onClearAll,
  onOverlaysChanged,
  onDesignLayerParsed, // callback existente
  log
}) {
  const mountRef = useRef();
  const rendererRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const controlsRef = useRef();
  const modelRef = useRef(null);
  const fitDataRef = useRef(null);

  const uuidToMeshRef = useRef(new Map());
  const designObjectsRef = useRef([]);

  // ===== Decals (imágenes + texto)
  const overlayMgrRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  // pendingImageRef ahora puede ser: HTMLImageElement o { img: HTMLImageElement, meta: {...} }
  const pendingImageRef = useRef(null);

  const dragRef = useRef({
    active: false,
    mode: null,
    mgr: null,
    id: null,
    startCx: 0, startCy: 0, startDist: 0, startW: 0, startH: 0,
    startAngle: 0, startVecX: 0, startVecY: 0,
    pointerId: null,
    tri: null,
  });

  // Toast
  const toastRef = useRef(null);
  const showToastRef = useRef(null);

  // ====== Editor de texto inline (DOM flotante)
  const inlineEditorRef = useRef(null);
  const inlineEditorCloseRef = useRef(null);
  const inlineEditing = useRef({ mgr: null, ov: null, id: null });

  /* ============ Utilidades de Texto ============ */
  function buildFontString({ fontStyle = "normal", fontWeight = 700, fontSize = 96, fontFamily = "Inter, system-ui, Arial, sans-serif" } = {}) {
    // ctx.font → "italic 700 96px Inter, sans-serif"
    return `${fontStyle || "normal"} ${String(fontWeight || 400)} ${Math.max(4, Number(fontSize || 16))}px ${fontFamily || "Inter, system-ui, Arial, sans-serif"}`;
  }

  function renderTextToCanvas(opts = {}) {
    const {
      text = "TU TEXTO",
      fontFamily = "Inter, system-ui, Arial, sans-serif",
      fontWeight = 800,
      fontStyle = "normal",
      fontSize = 96,
      color = "#111827",
      align = "center", // left|center|right
      strokeColor = null, // p.ej. "#FFFFFF"
      strokeWidth = 0,
      padding = 24, // px
      background = "transparent", // o "#ffffff"
      lineHeight = 1.2,
      maxWidth = null, // si querés wrap manual (opcional)
    } = opts;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    ctx.font = buildFontString({ fontStyle, fontWeight, fontSize, fontFamily });

    // Soporte multilinea simple por "\n"
    const lines = String(text).split("\n");
    const measureLine = (t) => ctx.measureText(t).width;

    let contentWidth = 0;
    if (maxWidth && maxWidth > 0) {
      // Wrap básico: corta por palabras sin romper
      const wrapped = [];
      for (const line of lines) {
        const words = line.split(" ");
        let cur = "";
        for (const w of words) {
          const test = cur ? cur + " " + w : w;
          if (measureLine(test) <= maxWidth) {
            cur = test;
          } else {
            if (cur) wrapped.push(cur);
            cur = w;
          }
        }
        if (cur) wrapped.push(cur);
      }
      lines.length = 0;
      lines.push(...wrapped);
    }
    for (const l of lines) contentWidth = Math.max(contentWidth, measureLine(l));

    const ascent = Math.abs(ctx.measureText("Hg").actualBoundingBoxAscent || fontSize * 0.8);
    const descent = Math.abs(ctx.measureText("pq").actualBoundingBoxDescent || fontSize * 0.2);
    const lineHpx = Math.max(fontSize, Math.round(fontSize * lineHeight));
    const contentHeight = Math.round(lines.length * lineHpx);

    const W = Math.max(8, Math.round(contentWidth + padding * 2));
    const H = Math.max(8, Math.round(contentHeight + padding * 2));
    canvas.width = W;
    canvas.height = H;

    // Redefinir font (porque al cambiar size se resetea el contexto)
    ctx.textBaseline = "alphabetic";
    ctx.font = buildFontString({ fontStyle, fontWeight, fontSize, fontFamily });
    ctx.fillStyle = color || "#111827";
    ctx.lineJoin = "round";
    if (strokeColor && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    }

    if (background && background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = color || "#111827";
    }

    let x;
    if (align === "left") x = padding;
    else if (align === "right") x = W - padding;
    else x = Math.round(W / 2);

    ctx.textAlign = align === "left" ? "left" : align === "right" ? "right" : "center";

    // Dibujar líneas
    let y = padding + ascent;
    for (const l of lines) {
      if (strokeColor && strokeWidth > 0) ctx.strokeText(l, x, y);
      ctx.fillText(l, x, y);
      y += lineHpx;
    }

    return { canvas, width: W, height: H };
  }

  async function canvasToImage(canvas) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = canvas.toDataURL("image/png");
    });
  }

  /* ============ Manager de decals POR MALLA ============ */
  class BitmapOverlayCanvas {
    constructor(mesh) {
      this.mesh = mesh;
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
      this.overlays = []; // cada overlay: {id,img,x,y,w,h,opacity,angle,meta?}
      this._nextId = 1;
      this.selectedId = null;
      this._yPolarity = 0;

      this.canvas.width = 4096;
      this.canvas.height = 4096;

      // ---- Bounds UV ----
      this.uMin = 0; this.uMax = 1; this.vMin = 0; this.vMax = 1; this.du = 1; this.dv = 1;
      const uvs = mesh.geometry?.attributes?.uv;
      if (uvs && uvs.count) {
        let uMin=Infinity, uMax=-Infinity, vMin=Infinity, vMax=-Infinity;
        for (let i=0;i<uvs.count;i++){
          const u = uvs.getX(i), v = uvs.getY(i);
          if (u<uMin) uMin=u; if (u>uMax) uMax=u;
          if (v<vMin) vMin=v; if (v>vMax) vMax=v;
        }
        let du = uMax - uMin, dv = vMax - vMin;
        if (du <= 1e-8) du = 1e-6;
        if (dv <= 1e-8) dv = 1e-6;
        this.uMin=uMin; this.uMax=uMax; this.vMin=vMin; this.vMax=vMax; this.du=du; this.dv=dv;
      } else {
        log?.("⚠️ Mesh sin UV:", mesh.name || mesh.uuid);
      }

      const tex = new THREE.CanvasTexture(this.canvas);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.premultiplyAlpha = true;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 8;
      tex.repeat.set(1/this.du, 1/this.dv);
      tex.offset.set(-this.uMin/this.du, -this.vMin/this.dv);
      tex.needsUpdate = true;
      this.texture = tex;

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        premultipliedAlpha: true,
        toneMapped: false,
        blending: THREE.NormalBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        alphaTest: 0.001
      });

      const overlay = new THREE.Mesh(mesh.geometry, mat);
      overlay.renderOrder = 1001;
      overlay.frustumCulled = false;
      overlay.userData.__decalOverlay = true;
      overlay.userData.__baseMesh = mesh;
      mesh.add(overlay);

      this.overlayMesh = overlay;
      this.overlayMat = mat;

      this._redrawAll();
    }

    setSelected(id) {
      this.selectedId = id ?? null;
      this._redrawAll();
      this._commit();
    }

    _drawHandleBox(ctx, x, y, s, type) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      const r = Math.max(6, Math.round(s*0.18));
      ctx.beginPath();
      ctx.moveTo(x+r, y);
      ctx.lineTo(x+s-r, y);
      ctx.quadraticCurveTo(x+s, y, x+s, y+r);
      ctx.lineTo(x+s, y+s-r);
      ctx.quadraticCurveTo(x+s, y+s, x+s-r, y+s);
      ctx.lineTo(x+r, y+s);
      ctx.quadraticCurveTo(x, y+s, x, y+s-r);
      ctx.lineTo(x, y+r);
      ctx.quadraticCurveTo(x, y, x+r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.save();
      ctx.translate(x + s/2, y + s/2);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;

      if (type === "scale") {
        const a = s*0.28, ah = s*0.12;
        ctx.beginPath(); ctx.moveTo(-a, a); ctx.lineTo(a, -a); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a-ah, -a); ctx.lineTo(a, -a); ctx.lineTo(a, -a+ah); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-a+ah, a); ctx.lineTo(-a, a); ctx.lineTo(-a, a-ah); ctx.stroke();
      } else if (type === "rotate") {
        const rad = s*0.28;
        ctx.beginPath(); ctx.arc(0,0, rad, Math.PI*0.15, Math.PI*1.4); ctx.stroke();
        ctx.beginPath();
        const ax = Math.cos(Math.PI*0.15)*rad, ay = Math.sin(Math.PI*0.15)*rad;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - s*0.14, ay - s*0.04);
        ctx.lineTo(ax - s*0.04, ay - s*0.14);
        ctx.closePath(); ctx.fillStyle = "white"; ctx.fill();
      } else if (type === "delete") {
        ctx.fillStyle = "white"; ctx.strokeStyle = "white"; ctx.lineWidth = 3;
        const w = s*0.44, h = s*0.40;
        ctx.beginPath(); ctx.moveTo(-w*0.6, -h*0.7); ctx.lineTo(w*0.6, -h*0.7); ctx.stroke();
        ctx.beginPath(); ctx.rect(-w/2, -h/2, w, h); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-w*0.18, -h*0.3); ctx.lineTo(-w*0.18, h*0.3);
        ctx.moveTo(0, -h*0.3);        ctx.lineTo(0, h*0.3);
        ctx.moveTo(w*0.18, -h*0.3);   ctx.lineTo(w*0.18, h*0.3);
        ctx.stroke();
      }
      ctx.restore();
    }

    _redrawAll() {
      const { ctx, canvas } = this;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const o of this.overlays) {
        const cx = o.x + o.w/2;
        const cy = o.y + o.h/2;
        ctx.save();
        ctx.translate(cx, cy);
        const ang = o.angle ?? 0;
        if (ang) ctx.rotate(ang);
        ctx.globalAlpha = o.opacity ?? 1;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(o.img, -o.w/2, -o.h/2, o.w, o.h);

        if (this.selectedId === o.id) {
          const HANDLE = Math.max(42, Math.min(120, Math.round(Math.min(o.w, o.h)*0.18)));
          const GAP = Math.max(8, Math.round(HANDLE*0.12));
          const yTop = -o.h/2 - HANDLE - GAP;
          const leftX  = -o.w/2;
          const midX   = -HANDLE/2;
          const rightX =  o.w/2 - HANDLE;
          this._drawHandleBox(ctx, leftX,  yTop, HANDLE, "rotate");
          this._drawHandleBox(ctx, midX,   yTop, HANDLE, "delete");
          this._drawHandleBox(ctx, rightX, yTop, HANDLE, "scale");
        }
        ctx.restore();
      }
    }

    _commit() {
      this.texture.needsUpdate = true;
      this.overlayMat.needsUpdate = true;
    }

    addFromImage(img, opts = {}) {
      return this._addFromImageWithMeta(img, opts, null);
    }

    _addFromImageWithMeta(img, opts = {}, meta = null) {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const scale = opts.scale ?? 1;
      const ov = {
        id: this._nextId++,
        img,
        x: Math.round(opts.x ?? 20),
        y: Math.round(opts.y ?? 20),
        w: Math.round(naturalW * scale),
        h: Math.round(naturalH * scale),
        opacity: opts.opacity ?? 1,
        angle: 0,
        meta: meta ? { ...meta } : null, // meta.kind === "text" ? { textProps:{} } : null
      };
      this.overlays.push(ov);
      this.setSelected(ov.id);
      this._redrawAll();
      this._commit();
      onOverlaysChanged?.("add");
      return ov.id;
    }

    transform(id, t = {}) {
      const o = this.overlays.find(v => v.id === id);
      if (!o) return false;

      if (typeof t.cx === "number" && typeof t.cy === "number") {
        const cx = Math.max(0, Math.min(this.canvas.width,  t.cx));
        const cy = Math.max(0, Math.min(this.canvas.height, t.cy));
        o.x = Math.round(cx - o.w/2);
        o.y = Math.round(cy - o.h/2);
      }

      if (typeof t.addCx === "number" || typeof t.addCy === "number") {
        const cx = o.x + o.w/2;
        const cy = o.y + o.h/2;
        const nx = Math.max(0, Math.min(this.canvas.width,  cx + (t.addCx||0)));
        const ny = Math.max(0, Math.min(this.canvas.height, cy + (t.addCy||0)));
        o.x = Math.round(nx - o.w/2);
        o.y = Math.round(ny - o.h/2);
      }

      if (typeof t.scale === "number") {
        const cx = o.x + o.w/2, cy = o.y + o.h/2;
        const nw = Math.max(8, Math.round((o.img.naturalWidth || o.img.width) * t.scale));
        const nh = Math.max(8, Math.round((o.img.naturalHeight || o.img.height) * t.scale));
        o.w = nw; o.h = nh;
        o.x = Math.round(cx - o.w/2);
        o.y = Math.round(cy - o.h/2);
      }

      if (typeof t.angle === "number") o.angle = t.angle;
      if (typeof t.opacity === "number") o.opacity = t.opacity;

      this._redrawAll();
      this._commit();
      return true;
    }

    replaceImage(id, newImg, keepSize = false) {
      const o = this.overlays.find(v => v.id === id);
      if (!o) return false;
      o.img = newImg;
      if (!keepSize) {
        const w = newImg.naturalWidth || newImg.width;
        const h = newImg.naturalHeight || newImg.height;
        o.w = Math.max(8, Math.round(w));
        o.h = Math.max(8, Math.round(h));
      }
      this._redrawAll();
      this._commit();
      onOverlaysChanged?.("change");
      return true;
    }

    remove(id) {
      const i = this.overlays.findIndex(v => v.id === id);
      if (i === -1) return false;
      this.overlays.splice(i, 1);
      if (this.selectedId === id) this.selectedId = null;
      this._redrawAll();
      this._commit();
      onOverlaysChanged?.("remove");
      return true;
    }

    uvToCanvasPxDown(u, v) {
      const localU = (u - this.uMin) / this.du;
      const localV = (v - this.vMin) / this.dv;
      const px = localU * this.canvas.width;
      const py = (1 - localV) * this.canvas.height;
      return { px, py };
    }
    uvToCanvasPxUp(u, v) {
      const localU = (u - this.uMin) / this.du;
      const localV = (v - this.vMin) / this.dv;
      const px = localU * this.canvas.width;
      const py = localV * this.canvas.height;
      return { px, py };
    }

    handleHitTestFromUV(u, v) {
      if (this._yPolarity === 1) {
        const d = this.uvToCanvasPxDown(u, v);
        let h = this.handleHitTest(d.px, d.py);
        if (h) return h;
        const uo = this.uvToCanvasPxUp(u, v);
        h = this.handleHitTest(uo.px, uo.py);
        if (h) { this._yPolarity = -1; return h; }
        return null;
      }
      if (this._yPolarity === -1) {
        const uo = this.uvToCanvasPxUp(u, v);
        let h = this.handleHitTest(uo.px, uo.py);
        if (h) return h;
        const d = this.uvToCanvasPxDown(u, v);
        h = this.handleHitTest(d.px, d.py);
        if (h) { this._yPolarity = 1; return h; }
        return null;
      }
      const d = this.uvToCanvasPxDown(u, v);
      let h = this.handleHitTest(d.px, d.py);
      if (h) { this._yPolarity = 1; return h; }
      const uo = this.uvToCanvasPxUp(u, v);
      h = this.handleHitTest(uo.px, uo.py);
      if (h) { this._yPolarity = -1; return h; }
      return null;
    }

    _toLocal(o, px, py) {
      const cx = o.x + o.w/2, cy = o.y + o.h/2;
      const dx = px - cx, dy = py - cy;
      const ang = -(o.angle ?? 0);
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const lx =  dx * cos - dy * sin;
      const ly =  dx * sin + dy * cos;
      return { lx, ly, cx, cy };
    }

    handleHitTest(px, py) {
      for (let i = this.overlays.length - 1; i >= 0; i--) {
        const o = this.overlays[i];
        const { lx, ly } = this._toLocal(o, px, py);

        const halfW = o.w/2, halfH = o.h/2;
        const HANDLE = Math.max(42, Math.min(120, Math.round(Math.min(o.w, o.h)*0.18)));
        const GAP = Math.max(8, Math.round(HANDLE*0.12));
        const yTop = -halfH - HANDLE - GAP;
        const leftX  = -halfW;
        const midX   = -HANDLE/2;
        const rightX =  halfW - HANDLE;

        const inLeft  = (lx >= leftX && lx <= leftX+HANDLE && ly >= yTop && ly <= yTop+HANDLE);
        const inMid   = (lx >= midX  && lx <= midX +HANDLE && ly >= yTop && ly <= yTop+HANDLE);
        const inRight = (lx >= rightX && lx <= rightX+HANDLE && ly >= yTop && ly <= yTop+HANDLE);

        if (inLeft)  return { type: "rotate", id: o.id, o };
        if (inMid)   return { type: "delete", id: o.id, o };
        if (inRight) return { type: "scale",  id: o.id, o };

        if (lx >= -halfW && lx <= halfW && ly >= -halfH && ly <= halfH) {
          return { type: "move", id: o.id, o };
        }
      }
      return null;
    }
  }

  const ensureOverlayForMesh = (mesh) => {
    if (!overlayMgrRef.current) overlayMgrRef.current = new Map();
    const key = mesh.uuid;
    if (!overlayMgrRef.current.has(key)) {
      overlayMgrRef.current.set(key, new BitmapOverlayCanvas(mesh));
    }
    return overlayMgrRef.current.get(key);
  };
  const disposeOverlayMgr = () => {
    overlayMgrRef.current?.forEach((mgr) => {
      try { mgr.mesh.remove(mgr.overlayMesh); } catch {}
      mgr.overlayMat?.map?.dispose?.();
      mgr.overlayMat?.dispose?.();
    });
    overlayMgrRef.current?.clear?.();
    overlayMgrRef.current = null;
  };

  const clearSelectionAll = () => {
    if (!overlayMgrRef.current) return;
    for (const mgr of overlayMgrRef.current.values()) mgr.setSelected(null);
  };
  const setSelectionExclusive = (mgr, id) => {
    for (const m of overlayMgrRef.current?.values?.() || []) {
      m.setSelected(m === mgr ? id : null);
    }
  };

  function resolveBaseMesh(obj) {
    let o = obj;
    if (o?.userData?.__decalOverlay && o?.userData?.__baseMesh) return o.userData.__baseMesh;
    while (o && o.userData && o.userData.__decalOverlay) o = o.parent;
    return o;
  }

  function barycentric(p, a, b, c) {
    const v0 = new THREE.Vector3().subVectors(b, a);
    const v1 = new THREE.Vector3().subVectors(c, a);
    const v2 = new THREE.Vector3().subVectors(p, a);
    const d00 = v0.dot(v0);
    const d01 = v0.dot(v1);
    const d11 = v1.dot(v1);
    const d20 = v2.dot(v0);
    const d21 = v2.dot(v1);
    const denom = d00 * d11 - d01 * d01 || 1e-12;
    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    const u = 1 - v - w;
    return { u, v, w };
  }

  /* ================== Setup escena ================== */
  useEffect(() => {
    const mount = mountRef.current;

    // ===== Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe5e7eb);
    sceneRef.current = scene;

    // ===== Cámara + renderer
    const w = mount.clientWidth, h = mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(0.6, 0.9, 1.6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";

    const preventCtx = (e)=> e.preventDefault();
    renderer.domElement.addEventListener("contextmenu", preventCtx);

    // ===== Toast
    mount.style.position = "relative";
    const toast = document.createElement("div");
    toast.style.position = "absolute";
    toast.style.left = "50%";
    toast.style.top = "12px";
    toast.style.transform = "translateX(-50%)";
    toast.style.padding = "8px 12px";
    toast.style.background = "rgba(0,0,0,0.8)";
    toast.style.color = "#fff";
    toast.style.font = "12px/1.2 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,system-ui,sans-serif";
    toast.style.borderRadius = "8px";
    toast.style.pointerEvents = "none";
    toast.style.opacity = "0";
    toast.style.transition = "opacity .18s ease";
    mount.appendChild(toast);
    toastRef.current = toast;
    showToastRef.current = (msg) => {
      if (!toastRef.current) return;
      toastRef.current.textContent = msg;
      toastRef.current.style.opacity = "1";
      clearTimeout(toastRef.current._t);
      toastRef.current._t = setTimeout(() => {
        if (toastRef.current) toastRef.current.style.opacity = "0";
      }, 2200);
    };

    // ===== Entorno PBR
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(new RoomEnvironment(), 0.2).texture;
    scene.environment = env;

    // ===== Controles
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.8;
    controls.screenSpacePanning = false;
    controls.enablePan = false;
    controls.mouseButtons = {
      LEFT: null,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    controlsRef.current = controls;

    // ===== Luces
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b6c0, 0.5);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    // ===== Resize
    const onResize = () => {
      const w2 = mount.clientWidth, h2 = mount.clientHeight;
      renderer.setSize(w2, h2);
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ===== Loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ===== Picking =====
    function pick(ev, forceMesh = null) {
      const dom = renderer.domElement;
      const rect = dom.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      mouseRef.current.set(x, y);
      const ray = raycasterRef.current;
      ray.setFromCamera(mouseRef.current, camera);

      const root = forceMesh || modelRef.current;
      if (!root) return null;

      const hits = ray.intersectObject(root, true);
      if (!hits.length) return null;

      const rawHit = hits[0];
      const obj = resolveBaseMesh(rawHit.object);
      if (!obj?.isMesh || !rawHit.uv) return null;

      let tri = null;
      const geom = obj.geometry;
      const pos = geom.attributes.position;
      const uva = geom.attributes.uv;

      if (rawHit.face && pos && uva) {
        const ia = rawHit.face.a, ib = rawHit.face.b, ic = rawHit.face.c;
        const a = new THREE.Vector3().fromBufferAttribute(pos, ia).applyMatrix4(obj.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(pos, ib).applyMatrix4(obj.matrixWorld);
        const c = new THREE.Vector3().fromBufferAttribute(pos, ic).applyMatrix4(obj.matrixWorld);
        const uvA = new THREE.Vector2().fromBufferAttribute(uva, ia);
        const uvB = new THREE.Vector2().fromBufferAttribute(uva, ib);
        const uvC = new THREE.Vector2().fromBufferAttribute(uva, ic);
        const plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
        tri = { a, b, c, uvA, uvB, uvC, plane };
      }

      const mgr = ensureOverlayForMesh(obj);
      return { mesh: obj, u: rawHit.uv.x, v: rawHit.uv.y, mgr, tri };
    }

    const placeImageRespectingPolarity = (mgr, u, v, img, meta = null) => {
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;

      const mapDown = mgr.uvToCanvasPxDown(u, v);
      const mapUp   = mgr.uvToCanvasPxUp(u, v);
      const useUp = (mgr._yPolarity === -1);
      const { px, py } = useUp ? mapUp : mapDown;

      const id = mgr._addFromImageWithMeta(img, {
        x: Math.round(px - natW / 2),
        y: Math.round(py - natH / 2),
        scale: 1,
        opacity: (meta && typeof meta.opacity === "number") ? meta.opacity : 1,
      }, meta);
      setSelectionExclusive(mgr, id);

      const test = mgr.handleHitTestFromUV(u, v);
      const placedOk = !!(test && test.id === id);
      if (!placedOk) {
        mgr._yPolarity = useUp ? 1 : -1;
        const mapped = (mgr._yPolarity === -1) ? mapUp : mapDown;
        const o = mgr.overlays.find(vv => vv.id === id);
        if (o) {
          o.x = Math.round(mapped.px - o.w / 2);
          o.y = Math.round(mapped.py - o.h / 2);
          mgr._redrawAll(); mgr._commit();
        }
        setSelectionExclusive(mgr, id);
      }
      return id;
    };

    // ===== Interacción =====
    const dom = renderer.domElement;

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();

      const picked = pick(ev);
      if (!picked) { clearSelectionAll(); return; }

      const { mgr, tri, u, v } = picked;

      if (pendingImageRef.current) {
        // Puede ser img o {img,meta}
        const pending = pendingImageRef.current; pendingImageRef.current = null;
        try { dom.setPointerCapture(ev.pointerId); } catch {}
        dragRef.current.pointerId = ev.pointerId;

        let img, meta = null;
        if (pending instanceof Image) img = pending;
        else { img = pending.img; meta = pending.meta || null; }

        placeImageRespectingPolarity(mgr, u, v, img, meta);
        dragRef.current.tri = tri;

        // Al colocar texto: quitar cursor especial
        mount.classList.remove("text-place-mode");

        try { dom.releasePointerCapture(ev.pointerId); } catch {}
        dragRef.current.pointerId = null;
        return;
      }

      const hit = mgr.handleHitTestFromUV(u, v);
      if (!hit) { clearSelectionAll(); return; }

      setSelectionExclusive(mgr, hit.id);
      const o = mgr.overlays.find(v => v.id === hit.id);
      if (!o) return;

      try { dom.setPointerCapture(ev.pointerId); } catch {}
      dragRef.current.pointerId = ev.pointerId;
      dragRef.current.tri = tri;

      controlsRef.current.enabled = false;

      if (hit.type === "delete") {
        if (!ev.shiftKey && !ev.altKey) {
          showToastRef.current?.("Mantené SHIFT o ALT y hacé clic en la papelera para borrar.");
          try { dom.releasePointerCapture(ev.pointerId); } catch {}
          controlsRef.current.enabled = true;
          return;
        }
        mgr.remove(hit.id);
        clearSelectionAll();
        try { dom.releasePointerCapture(ev.pointerId); } catch {}
        controlsRef.current.enabled = true;
        return;
      }

      if (hit.type === "move") {
        dragRef.current.active = true;
        dragRef.current.mode = "move";
        dragRef.current.mgr = mgr;
        dragRef.current.id  = hit.id;

        // Si es texto, cambiamos cursor
        const ov = o;
        if (ov?.meta?.kind === "text") {
          mount.classList.add("text-move-mode");
        }
      } else if (hit.type === "scale") {
        const cx = o.x + o.w/2, cy = o.y + o.h/2;
        const { px: pxd, py: pyd } = (mgr._yPolarity === -1) ? mgr.uvToCanvasPxUp(u, v) : mgr.uvToCanvasPxDown(u, v);
        const dx = pxd - cx, dy = pyd - cy;
        dragRef.current.active = true;
        dragRef.current.mode = "scale";
        dragRef.current.mgr = mgr;
        dragRef.current.id  = hit.id;
        dragRef.current.startCx = cx;
        dragRef.current.startCy = cy;
        dragRef.current.startDist = Math.max(1, Math.hypot(dx, dy));
        dragRef.current.startW = o.w;
        dragRef.current.startH = o.h;
      } else if (hit.type === "rotate") {
        const cx = o.x + o.w/2, cy = o.y + o.h/2;
        const { px: pxd, py: pyd } = (mgr._yPolarity === -1) ? mgr.uvToCanvasPxUp(u, v) : mgr.uvToCanvasPxDown(u, v);
        const dx = pxd - cx, dy = pyd - cy;
        dragRef.current.active = true;
        dragRef.current.mode = "rotate";
        dragRef.current.mgr = mgr;
        dragRef.current.id  = hit.id;
        dragRef.current.startCx = cx;
        dragRef.current.startCy = cy;
        dragRef.current.startAngle = o.angle ?? 0;
        dragRef.current.startVecX = dx;
        dragRef.current.startVecY = dy;
      }
    };

    const eventToCanvasPx = (ev, fallbackTri, mgr) => {
      const hit = pick(ev, mgr?.mesh);
      if (hit) {
        const { u, v } = hit;
        if (mgr._yPolarity === -1) return mgr.uvToCanvasPxUp(u, v);
        return mgr.uvToCanvasPxDown(u, v);
      }

      if (!fallbackTri || !mgr) return null;

      const rect = renderer.domElement.getBoundingClientRect();
      const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      mouseRef.current.set(ndcX, ndcY);
      raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

      const p = new THREE.Vector3();
      if (!raycasterRef.current.ray.intersectPlane(fallbackTri.plane, p)) return null;

      const bc = barycentric(p, fallbackTri.a, fallbackTri.b, fallbackTri.c);
      const U = bc.u * fallbackTri.uvA.x + bc.v * fallbackTri.uvB.x + bc.w * fallbackTri.uvC.x;
      const V = bc.u * fallbackTri.uvA.y + bc.v * fallbackTri.uvB.y + bc.w * fallbackTri.uvC.y;

      if (mgr._yPolarity === -1) return mgr.uvToCanvasPxUp(U, V);
      return mgr.uvToCanvasPxDown(U, V);
    };

    const onPointerMove = (ev) => {
      if (!dragRef.current.active) return;
      if (dragRef.current.pointerId !== ev.pointerId) return;

      const mode = dragRef.current.mode;
      if (!mode) return;

      const mgr = dragRef.current.mgr;
      const id  = dragRef.current.id;
      const o = mgr?.overlays.find(v => v.id === id);
      if (!o) return;

      if (mode === "move") {
        const dom = rendererRef.current.domElement;
        const rw = dom.clientWidth;
        const rh = dom.clientHeight;

        const dxCanvas = (ev.movementX || 0) * (mgr.canvas.width  / rw);
        const dyCanvas = (ev.movementY || 0) * (mgr.canvas.height / rh);

        mgr.transform(id, { addCx: dxCanvas, addCy: dyCanvas });
        return;
      }

      const pxy = eventToCanvasPx(ev, dragRef.current.tri, mgr);
      if (!pxy) return;
      const { px, py } = pxy;

      if (mode === "scale") {
        const cx = dragRef.current.startCx, cy = dragRef.current.startCy;
        const dx = px - cx, dy = py - cy;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const s = Math.max(0.05, dist / dragRef.current.startDist);
        const nw = Math.max(8, Math.round(dragRef.current.startW * s));
        const nh = Math.max(8, Math.round(dragRef.current.startH * s));
        const nx = Math.round(cx - nw/2);
        const ny = Math.round(cy - nh/2);
        o.w = nw; o.h = nh; o.x = nx; o.y = ny;
        mgr._redrawAll(); mgr._commit();
      } else if (mode === "rotate") {
        const cx = dragRef.current.startCx, cy = dragRef.current.startCy;
        const a0 = Math.atan2(dragRef.current.startVecY, dragRef.current.startVecX);
        const a1 = Math.atan2(py - cy, px - cx);
        const da = a1 - a0;
        const newAngle = dragRef.current.startAngle + da;
        mgr.transform(id, { angle: newAngle });
      }
    };

    const endDrag = () => {
      if (dragRef.current.active) {
        dragRef.current.active = false;
        dragRef.current.mode = null;
        dragRef.current.mgr = null;
        dragRef.current.id = null;
        dragRef.current.tri = null;
        controlsRef.current.enabled = true;
        mount.classList.remove("text-move-mode");
        onOverlaysChanged?.("transformEnd");
      }
    };

    // ====== Doble clic para editar TEXTO ======
    const onDblClick = (ev) => {
      const picked = pick(ev);
      if (!picked) return;
      const { mgr, u, v } = picked;
      const hit = mgr.handleHitTestFromUV(u, v);
      if (!hit) return;

      const o = mgr.overlays.find(x => x.id === hit.id);
      if (!o || !(o.meta && o.meta.kind === "text")) return;

      setSelectionExclusive(mgr, o.id);
      openInlineTextEditor(ev.clientX, ev.clientY, mgr, o);
    };

    dom.addEventListener("pointerdown", onPointerDown, { passive:false });
    dom.addEventListener("pointermove", onPointerMove, { passive:false });
    dom.addEventListener("pointerup", endDrag);
    dom.addEventListener("pointercancel", endDrag);
    dom.addEventListener("mouseleave", endDrag);
    dom.addEventListener("dblclick", onDblClick, { passive: true });

    const onKeyDown = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      for (const mgr of overlayMgrRef.current?.values?.() || []) {
        if (mgr.selectedId != null) { mgr.remove(mgr.selectedId); break; }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", endDrag);
      dom.removeEventListener("pointercancel", endDrag);
      dom.removeEventListener("mouseleave", endDrag);
      dom.removeEventListener("dblclick", onDblClick);
      window.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("contextmenu", preventCtx);

      // Cerrar editor si quedó abierto
      closeInlineTextEditor();

      if (toastRef.current) {
        clearTimeout(toastRef.current._t);
        try { mount.removeChild(toastRef.current); } catch {}
        toastRef.current = null;
      }

      try { mount.removeChild(renderer.domElement); } catch {}
      renderer.dispose();
      try { env?.dispose?.(); } catch {}
      try { pmrem?.dispose?.(); } catch {}
      disposeOverlayMgr();
    };
  }, []);

  // ========== Materiales + encuadre ==========
  const _finalizeAndAdd = (gltf, { onDone } = {}) => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;

    if (modelRef.current) {
      scene.remove(modelRef.current);
      modelRef.current.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          if (o.material?.map) o.material.map.dispose?.();
          o.material?.dispose?.();
        }
      });
      modelRef.current = null;
      disposeOverlayMgr();
    }

    modelRef.current = gltf.scene;

    // Limpiar índices previos
    uuidToMeshRef.current.clear();
    designObjectsRef.current = [];

    modelRef.current.traverse((o) => {
      if (!o.isMesh) return;

      // Material base
      const mat = o.material?.clone ? o.material.clone() : o.material;
      if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial)) {
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
          mat.map.flipY = false;
        } else {
          const white = document.createElement("canvas");
          white.width = white.height = 1024;
          const ctx = white.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1024, 1024);
          const base = new THREE.CanvasTexture(white);
          base.flipY = false;
          base.needsUpdate = true;
          mat.map = base;
          mat.needsUpdate = true;
        }
        if (mat.color) mat.color.set(0xffffff);

        if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        if (mat.normalMap) {
          const sx = (mat.normalScale?.x ?? 1), sy = (mat.normalScale?.y ?? 1);
          mat.normalScale = new THREE.Vector2(sx * 1.6, sy * 1.6);
          mat.normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        if ("envMapIntensity" in mat) mat.envMapIntensity = 1.2;
        if ("roughness" in mat && typeof mat.roughness === "number") {
          mat.roughness = Math.min(0.95, Math.max(0.35, mat.roughness));
        }
        mat.side = THREE.FrontSide;
        o.material = mat;
      }

      o.castShadow = false;
      o.receiveShadow = false;

      uuidToMeshRef.current.set(o.uuid, o);
    });

    scene.add(modelRef.current);

    // Encadre + límites de zoom
    const box = new THREE.Box3().setFromObject(modelRef.current);
    const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
    const radius = Math.max(sphere.radius, 1e-6), center = sphere.center;

    const cam = cameraRef.current, ctr = controlsRef.current;
    const fitDist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2);
    const dist = fitDist * 1.1;

    ctr.target.copy(center);
    cam.near = Math.max(radius / 100, 0.01);
    cam.far = radius * 50;
    cam.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.9);
    cam.updateProjectionMatrix(); ctr.update();

    ctr.minDistance = radius * 1.005;
    ctr.maxDistance = fitDist * 1.3;

    fitDataRef.current = { center: center.clone(), radius, fitDist };

    // Detectar objetos “diseño”
    detectDesignLayerObjects();

    onModelReady?.(extractMeshes(modelRef.current));
    onDone?.();
  };

  // ========== Cargar modelos ==========
  const loadModelFromFile = (file, { onStart, onProgress: onProgCb, onDone, onClear } = {}) => {
    if (!file) return;
    onClear?.();

    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);

    onStart?.();

    loader.load(
      url,
      (gltf) => {
        try { URL.revokeObjectURL(url); } catch {}
        _finalizeAndAdd(gltf, { onDone });
      },
      (xhr) => {
        if (xhr.total && onProgCb) onProgCb(Math.round((xhr.loaded / xhr.total) * 100));
      },
      (err) => { log?.("❌ Error al cargar GLB:", err?.message || err); try { URL.revokeObjectURL(url); } catch {} }
    );
  };

  const loadModelFromUrl = (modelUrl, { onStart, onProgress: onProgCb, onDone, onClear } = {}) => {
    if (!modelUrl) return;
    onClear?.();

    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);

    onStart?.();

    loader.load(
      modelUrl,
      (gltf) => {
        _finalizeAndAdd(gltf, { onDone });
      },
      (xhr) => {
        if (xhr.total && onProgCb) onProgCb(Math.round((xhr.loaded / xhr.total) * 100));
      },
      (err) => { log?.("❌ Error al cargar GLB (URL):", err?.message || err, modelUrl); }
    );
  };

  // ===== Extraer meshes para SVG Multiply (flujo existente)
  function extractMeshes(root) {
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.uv) return;
      const uvs = o.geometry.attributes.uv;
      let uMin=Infinity, vMin=Infinity, uMax=-Infinity, vMax=-Infinity;
      for (let i=0;i<uvs.count;i++){
        const u=uvs.getX(i), v=uvs.getY(i);
        if(u<uMin)uMin=u; if(u>uMax)uMax=u; if(v<vMin)vMin=v; if(v>vMax)vMax=v;
      }
      if (!isFinite(uMin)||!isFinite(vMin)||!isFinite(uMax)||!isFinite(vMax)) return;
      meshes.push({ name:o.name||"(sin-nombre)", ref:o, hasUV:true, uMin,uMax,vMin,vMax, overlayMat:null, overlayMesh:null });
    });
    return meshes;
  }

  // ===== Overlay SVG (Multiply — flujo existente)
  function applyOverlayTexture(m, canvas, keepRepeatOffset = false) {
    if (!m.mesh) m.mesh = m.ref;

    let tex;
    if (m.overlayMat?.map) {
      tex = m.overlayMat.map;
      tex.image = canvas;
      tex.needsUpdate = true;
    } else {
      tex = new THREE.CanvasTexture(canvas);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.premultiplyAlpha = true;

      let du = m.uMax - m.uMin, dv = m.vMax - m.vMin;
      if (du <= 0) du = 1e-6; if (dv <= 0) dv = 1e-6;
      tex.repeat.set(1/du, 1/dv);
      tex.offset.set(-m.uMin/du, -m.vMin/dv);

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        premultipliedAlpha: true,
        toneMapped: false,
        blending: THREE.MultiplyBlending,
        depthWrite: false,
        depthTest: true,
        side: THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
        alphaTest: 0.001
      });

      const overlay = new THREE.Mesh(m.mesh.geometry, mat);
      overlay.renderOrder = 999;
      overlay.frustumCulled = false;
      overlay.userData.__decalOverlay = true;
      overlay.userData.__baseMesh = m.mesh;
      m.mesh.add(overlay);

      m.overlayMat = mat;
      m.overlayMesh = overlay;
    }

    if (!keepRepeatOffset && tex) {
      let du = m.uMax - m.uMin, dv = m.vMax - m.vMin;
      if (du <= 0) du = 1e-6; if (dv <= 0) dv = 1e-6;
      tex.repeat.set(1/du, 1/dv);
      tex.offset.set(-m.uMin/du, -m.vMin/dv);
    }
  }

  // ===== Capturas y PDF =====
  function renderToDataURL(width, height, { format = "image/png", quality = 0.95, transparent = false } = {}) {
    const renderer = rendererRef.current;
    const cam = cameraRef.current;
    const scene = sceneRef.current;

    const prevSize = renderer.getSize(new THREE.Vector2());
    const prevPR = renderer.getPixelRatio();
    const prevBG = scene.background;
    const prevClearAlpha = renderer.getClearAlpha();

    if (transparent) {
      scene.background = null;
      renderer.setClearAlpha(0.0);
    }

    renderer.setPixelRatio(1);
    renderer.setSize(width, height);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL(format, quality);

    renderer.setSize(prevSize.x, prevSize.y);
    renderer.setPixelRatio(prevPR);
    if (transparent) {
      scene.background = prevBG;
      renderer.setClearAlpha(prevClearAlpha);
    }

    return url;
  }

  function captureView(dirVec3, opts = {}) {
    const { center, fitDist } = fitDataRef.current || {};
    if (!center || !fitDist) return null;

    const cam = cameraRef.current;
    const ctr = controlsRef.current;

    const oldPos = cam.position.clone();
    const oldTarget = ctr.target.clone();
    const oldUp = cam.up.clone();

    const dir = dirVec3.clone().normalize();
    const dist = fitDist * 1.07;
    const pos = new THREE.Vector3().copy(center).addScaledVector(dir, dist);

    ctr.target.copy(center);
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    ctr.update();

    const url = renderToDataURL(opts.width || 1600, opts.height || 1200, {
      format: "image/png",
      quality: opts.quality ?? 0.95,
      transparent: opts.transparent ?? true,
    });

    ctr.target.copy(oldTarget);
    cam.position.copy(oldPos);
    cam.up.copy(oldUp);
    cam.updateProjectionMatrix();
    ctr.update();

    return url;
  }

  async function getBocetoImages({ width = 1600, height = 1200, quality = 0.95 } = {}) {
    if (!fitDataRef.current) return null;
    const front = captureView(new THREE.Vector3(0, 0, 1), { width, height, quality, transparent: true });
    const back  = captureView(new THREE.Vector3(0, 0,-1), { width, height, quality, transparent: true });
    const left  = captureView(new THREE.Vector3(-1,0, 0), { width, height, quality, transparent: true });
    const right = captureView(new THREE.Vector3( 1,0, 0), { width, height, quality, transparent: true });
    return { front, back, left, right };
  }

  async function exportPDF() {
    let jsPDF;
    try {
      const mod = await import(/* webpackChunkName: "jspdf" */ "jspdf");
      jsPDF = mod.jsPDF || mod.default;
    } catch (e) {
      alert("Instalá la dependencia para PDF:  npm i jspdf");
      return;
    }
    if (!fitDataRef.current) { alert("Cargá un modelo primero."); return; }

    const { front, back, left, right } = await getBocetoImages({});
    const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    const margin = 28;
    const cellW = (pageW - margin*3) / 2;
    const cellH = (pageH - margin*3) / 2;

    pdf.setFont("helvetica", "bold"); pdf.setFontSize(14);
    pdf.text("Boceto – Vistas (frente, espalda, izquierda, derecha)", margin, margin - 8);

    const place = (img, x, y) => { if (!img) return; pdf.addImage(img, "PNG", x, y, cellW, cellH, undefined, "FAST"); };

    place(front, margin, margin);
    place(back,  margin*2 + cellW, margin);
    place(left,  margin, margin*2 + cellH);
    place(right, margin*2 + cellW, margin*2 + cellH);

    pdf.save("boceto-vistas.pdf");
  }

  /* ====== Serialización de OVERLAYS ====== */
  function getOverlaysState() {
    const state = [];
    if (!overlayMgrRef.current) return state;
    for (const [uuid, mgr] of overlayMgrRef.current.entries()) {
      const list = mgr.overlays.map(o => {
        // Para imágenes y texto, guardamos un PNG (src) + meta (si es texto)
        const tmp = document.createElement("canvas");
        tmp.width = o.img.naturalWidth || o.img.width;
        tmp.height = o.img.naturalHeight || o.img.height;
        const c = tmp.getContext("2d");
        c.drawImage(o.img, 0, 0);
        const src = tmp.toDataURL("image/png");
        return { x:o.x, y:o.y, w:o.w, h:o.h, opacity:o.opacity??1, angle:o.angle??0, src, meta: o.meta || null };
      });
      state.push({ meshUUID: uuid, width:mgr.canvas.width, height:mgr.canvas.height, overlays:list, yPolarity:mgr._yPolarity });
    }
    return state;
  }

  async function setOverlaysState(state = []) {
    disposeOverlayMgr();
    if (!modelRef.current) return;

    const uuidToMesh = new Map();
    modelRef.current.traverse(o => { if (o.isMesh) uuidToMesh.set(o.uuid, o); });

    overlayMgrRef.current = new Map();
    for (const s of state) {
      const mesh = uuidToMesh.get(s.meshUUID);
      if (!mesh) continue;
      const mgr = new BitmapOverlayCanvas(mesh);
      mgr.canvas.width = s.width || 4096;
      mgr.canvas.height = s.height || 4096;
      mgr._yPolarity = s.yPolarity || 0;

      for (const ov of s.overlays || []) {
        let img = null;
        if (ov.meta && ov.meta.kind === "text" && ov.meta.textProps) {
          // Re-render del texto para mayor nitidez
          const { canvas } = renderTextToCanvas(ov.meta.textProps);
          img = await canvasToImage(canvas);
        } else {
          img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = ov.src; });
        }
        const id = mgr._addFromImageWithMeta(img, { x: ov.x, y: ov.y, scale: 1, opacity: ov.opacity }, ov.meta || null);
        const o = mgr.overlays.find(v=>v.id===id);
        if (o) { o.w = ov.w; o.h = ov.h; o.angle = ov.angle||0; }
        mgr._redrawAll(); mgr._commit();
      }
      overlayMgrRef.current.set(mesh.uuid, mgr);
    }
  }

  /* ====== Capa “diseño”: detección y API de color por objeto ====== */
  const norm = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  function detectDesignLayerObjects() {
    if (!modelRef.current) return;

    const root = modelRef.current;
    const out = [];
    const isDesignGroup = (o) => {
      const n = norm(o.name || "");
      return n === "diseño" || n === "diseno";
    };

    let designGroup = null;
    root.traverse((o) => {
      if (!designGroup && o.isGroup && isDesignGroup(o)) designGroup = o;
    });

    if (!designGroup) {
      designObjectsRef.current = [];
      onDesignLayerParsed?.([]);
      return;
    }

    const artboards = designGroup.children?.length ? designGroup.children : [designGroup];

    for (const art of artboards) {
      const artName = art === designGroup ? "(diseño)" : (art.name || "(artboard)");
      art.traverse((o) => {
        if (!o.isMesh) return;
        const mesh = o;
        const uuid = mesh.uuid;
        const name = mesh.name || "(objeto)";
        let hex = "#ffffff";
        if (mesh.material && mesh.material.color) {
          const h = mesh.material.color.getHexString();
          hex = `#${h}`;
        }
        out.push({ artboard: artName, objectName: name, meshUUID: uuid, colorHex: hex });
      });
    }

    designObjectsRef.current = out;
    onDesignLayerParsed?.(out);
  }

  function setObjectColor(meshUUID, hex) {
    const mesh = uuidToMeshRef.current.get(meshUUID);
    if (!mesh) return false;
    if (!/^#?[0-9a-f]{6}$/i.test(hex||"")) return false;
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    if (!mesh.material) return false;

    if (mesh.material.isMaterial && mesh.material.isShared) {
      mesh.material = mesh.material.clone();
    }
    if (mesh.material.color) mesh.material.color.set(`#${h}`);
    mesh.material.needsUpdate = true;
    return true;
  }

  function getObjectColor(meshUUID) {
    const mesh = uuidToMeshRef.current.get(meshUUID);
    if (!mesh || !mesh.material || !mesh.material.color) return null;
    return `#${mesh.material.color.getHexString()}`;
  }

  /* ====== Editor de TEXTO inline (DOM) ====== */
  function closeInlineTextEditor() {
    const mount = mountRef.current;
    if (inlineEditorRef.current) {
      try { mount.removeChild(inlineEditorRef.current); } catch {}
      inlineEditorRef.current = null;
    }
    inlineEditing.current = { mgr: null, ov: null, id: null };
    if (inlineEditorCloseRef.current) {
      window.removeEventListener("keydown", inlineEditorCloseRef.current);
      inlineEditorCloseRef.current = null;
    }
  }

  async function openInlineTextEditor(clientX, clientY, mgr, ov) {
    closeInlineTextEditor();
    const mount = mountRef.current;

    const panel = document.createElement("div");
    panel.className = "text-inline-editor";
    panel.style.left = `${clientX + 6}px`;
    panel.style.top  = `${clientY + 6}px`;

    const ta = document.createElement("textarea");
    const textProps = (ov.meta?.textProps) || { text: "" };
    ta.value = String(textProps.text || "");
    panel.appendChild(ta);

    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Doble clic en el sticker para editar. SHIFT+Enter inserta salto de línea.";
    panel.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "actions";
    const bCancel = document.createElement("button");
    bCancel.className = "btn";
    bCancel.textContent = "Cancelar";
    const bSave = document.createElement("button");
    bSave.className = "btn btn-primary";
    bSave.textContent = "Guardar";
    actions.appendChild(bCancel);
    actions.appendChild(bSave);
    panel.appendChild(actions);

    mount.appendChild(panel);
    inlineEditorRef.current = panel;
    inlineEditing.current = { mgr, ov, id: ov.id };

    // Eventos
    bCancel.onclick = () => closeInlineTextEditor();
    bSave.onclick = async () => {
      const newText = ta.value;
      const newProps = { ...(ov.meta?.textProps || {}), text: newText };
      const { canvas } = renderTextToCanvas(newProps);
      const img = await canvasToImage(canvas);
      mgr.replaceImage(ov.id, img, false);
      ov.meta = { ...(ov.meta||{}), kind: "text", textProps: newProps };
      closeInlineTextEditor();
      onOverlaysChanged?.("textEdited");
    };

    inlineEditorCloseRef.current = (e) => {
      if (e.key === "Escape") closeInlineTextEditor();
      if (e.key === "Enter" && e.shiftKey) {
        // permitir salto de línea en el textarea
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        bSave.click();
      }
    };
    window.addEventListener("keydown", inlineEditorCloseRef.current);
    ta.focus();
    ta.select();
  }

  /* ===== API pública ===== */
  async function addDecalImage(file) {
    if (!modelRef.current) { alert("Cargá un modelo primero."); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
    try { URL.revokeObjectURL(img.src); } catch {}
    pendingImageRef.current = img;
    showToastRef.current?.("Imagen lista: clic izquierdo para colocar. Arrastrá para mover. (Clic derecho: orbitar)");
  }

  // NUEVO: agregar texto como overlay (bitmap)
  async function addTextOverlay(opts = {}) {
    if (!modelRef.current) { alert("Cargá un modelo primero."); return; }
    const { canvas } = renderTextToCanvas(opts);
    const img = await canvasToImage(canvas);
    pendingImageRef.current = { img, meta: { kind: "text", textProps: { ...opts } } };
    // Cursor especial mientras espera la colocación
    mountRef.current?.classList.add("text-place-mode");
    showToastRef.current?.("Texto listo: clic izquierdo sobre el modelo para colocar. Doble clic sobre el texto para editar.");
  }

  function transformExtraImage(id, transform = {}) {
    if (!overlayMgrRef.current) return false;
    for (const mgr of overlayMgrRef.current.values()) {
      if (mgr.transform(id, transform)) return true;
    }
    return false;
  }
  function removeExtraImage(id) {
    if (!overlayMgrRef.current) return false;
    for (const mgr of overlayMgrRef.current.values()) {
      if (mgr.remove(id)) return true;
    }
    return false;
  }

  useImperativeHandle(refApi, () => ({
    loadModelFromFile,
    loadModelFromUrl,
    applyOverlayTexture,
    getBocetoImages,
    exportPDF,
    addDecalImage,
    transformExtraImage,
    removeExtraImage,
    getOverlaysState,
    setOverlaysState,
    setObjectColor,
    getObjectColor,
    // NUEVO:
    addTextOverlay,
  }));

  return <div ref={mountRef} className="view-root" style={{ width: "100%", height: "100%" }} />;
}
