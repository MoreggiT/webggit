// src/Viewer3D.jsx
import React, { useEffect, useRef, useImperativeHandle } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export default function Viewer3D({ refApi, onModelReady, onProgress, onClearAll, log }) {
  const mountRef = useRef();
  const rendererRef = useRef();
  const sceneRef = useRef();
  const cameraRef = useRef();
  const controlsRef = useRef();
  const modelRef = useRef(null);
  const fitDataRef = useRef(null); // {center, radius, fitDist}

  useEffect(() => {
    const mount = mountRef.current;

    // ===== Escena
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe5e7eb);
    sceneRef.current = scene;

    // ===== Cámara + renderer (alpha para capturas con fondo transparente)
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
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    // ===== Entorno PBR
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromScene(new RoomEnvironment(renderer), 0.8).texture;
    scene.environment = env;

    // ===== Controles
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomSpeed = 0.8;
    controls.screenSpacePanning = false;
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

    return () => {
      window.removeEventListener("resize", onResize);
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      env?.dispose?.();
      pmrem?.dispose?.();
    };
  }, []);

  // ========== Util: aplicar materiales + encuadre ==========
  const _finalizeAndAdd = (gltf, { onDone } = {}) => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;

    if (modelRef.current) scene.remove(modelRef.current);
    modelRef.current = gltf.scene;

    modelRef.current.traverse((o) => {
      if (!o.isMesh) return;

      const mat = o.material?.clone ? o.material.clone() : o.material;
      if (mat && (mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial || mat.isMeshPhongMaterial || mat.isMeshLambertMaterial)) {
        if (mat.map) {
          mat.map.colorSpace = THREE.SRGBColorSpace;
          mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
        if (mat.normalMap) {
          const sx = (mat.normalScale?.x ?? 1), sy = (mat.normalScale?.y ?? 1);
          mat.normalScale = new THREE.Vector2(sx * 1.6, sy * 1.6);
          mat.normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
        }
        if ("envMapIntensity" in mat) mat.envMapIntensity = 1.0;
        if ("roughness" in mat && typeof mat.roughness === "number") {
          mat.roughness = Math.min(0.95, Math.max(0.35, mat.roughness));
        }
        mat.side = THREE.FrontSide;
        o.material = mat;
      }

      o.castShadow = false;
      o.receiveShadow = false;
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

    onModelReady?.(extractMeshes(modelRef.current));
    onDone?.();
  };

  // ========== Cargar GLB desde File ==========
  const loadModelFromFile = (file, { onStart, onProgress, onDone, onClear } = {}) => {
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
        URL.revokeObjectURL(url);
        _finalizeAndAdd(gltf, { onDone });
      },
      (xhr) => {
        if (xhr.total) onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
      },
      (err) => { log?.("❌ Error al cargar GLB:", err.message); }
    );
  };

  // ========== Cargar GLB desde URL (para /public/moldes/...) ==========
  const loadModelFromUrl = (modelUrl, { onStart, onProgress, onDone, onClear } = {}) => {
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
        if (xhr.total) onProgress?.(Math.round((xhr.loaded / xhr.total) * 100));
      },
      (err) => { log?.("❌ Error al cargar GLB (URL):", err.message, modelUrl); }
    );
  };

  // ===== Extraer meshes (para overlays)
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

  // ===== Overlay SVG (malla encima con Multiply, alfa premultiplicado)
  function applyOverlayTexture(m, canvas, keepRepeatOffset = false) {
    if (!m.mesh) m.mesh = m.ref;

    let tex;
    if (m.overlayMat?.map) {
      // Reusar la misma textura
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

      // UV del subrectángulo de la pieza
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

  // ===== Capturas (PNG transparente) =====
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

  // API pública
  useImperativeHandle(refApi, () => ({
    loadModelFromFile,
    loadModelFromUrl,    // 👈 nuevo
    applyOverlayTexture,
    getBocetoImages,
    exportPDF,
  }));

  return <div ref={mountRef} className="view-root" style={{ width: "100%", height: "100%" }} />;
}
