// src/components/ModelThumb.jsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import "./modelthumb.css";

/**
 * Tarjeta con mini render 3D + nombre (la tarjeta completa es clickeable).
 *
 * Props:
 *  - modelUrl: string             URL del .glb (para preview 3D)
 *  - fileName: string             nombre para mostrar (sin .glb)
 *  - onUse: ()=>void              callback al click
 *  - size?: number                lado (px) del cuadro (default 160)
 */
export default function ModelThumb({
  modelUrl,
  fileName,
  onUse,
  size = 160,
}) {
  const name = String(fileName || "").replace(/\.[^.]+$/, ""); // sin .glb

  const rootRef = useRef(null);
  const rRef = useRef(null);
  const camRef = useRef(null);
  const modelRef = useRef(null);
  const rafRef = useRef(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Renderer
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(size, size);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    rRef.current = r;
    root.appendChild(r.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Cam
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    cam.position.set(0.6, 0.5, 1.2);
    camRef.current = cam;

    // Env
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.15).texture;
    scene.environment = env;

    // Luces
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b6c0, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    if (modelUrl) {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
      loader.setDRACOLoader(draco);
      loader.setMeshoptDecoder(MeshoptDecoder);

      loader.load(
        modelUrl,
        (gltf) => {
          modelRef.current = gltf.scene;

          // Normalizamos materiales para que se vea limpio en miniatura
          modelRef.current.traverse((o) => {
            if (!o.isMesh) return;
            const mat = o.material?.clone ? o.material.clone() : o.material;
            if (mat) {
              if (mat.map) {
                mat.map.colorSpace = THREE.SRGBColorSpace;
                mat.map.flipY = false;
              }
              if (mat.color) mat.color.set(0xffffff);
              if ("envMapIntensity" in mat) mat.envMapIntensity = 1.0;
              if ("roughness" in mat && typeof mat.roughness === "number") {
                mat.roughness = Math.min(0.95, Math.max(0.35, mat.roughness));
              }
              mat.side = THREE.FrontSide;
              o.material = mat;
            }
            o.castShadow = false; o.receiveShadow = false;
          });

          scene.add(modelRef.current);

          // Fit al cuadro
          const box = new THREE.Box3().setFromObject(modelRef.current);
          const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
          const radius = Math.max(sphere.radius, 1e-6);
          const center = sphere.center;
          const fitDist = radius / Math.sin(THREE.MathUtils.degToRad(cam.fov) / 2);

          cam.near = Math.max(radius / 100, 0.01);
          cam.far = radius * 50;
          const dist = fitDist * 1.15;
          cam.position.copy(center).addScaledVector(new THREE.Vector3(0.8, 0.7, 1.1).normalize(), dist);
          cam.lookAt(center);
          cam.updateProjectionMatrix();

          // Animación sutil constante (sin overlays)
          const baseRot = modelRef.current.rotation.y;
          const tick = () => {
            rafRef.current = requestAnimationFrame(tick);
            if (modelRef.current) {
              const t = performance.now() * 0.001;
              const amp = 0.035;
              modelRef.current.rotation.y = baseRot + Math.sin(t * 0.8) * amp;
            }
            r.render(scene, cam);
          };
          tick();
        },
        undefined,
        (err) => {
          console.warn("Thumb GLB error:", err?.message || err);
          setFailed(true);
        }
      );
    } else {
      // Lienzo en blanco (fallback visual por CSS)
      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        r.render(scene, cam);
      };
      tick();
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      try { root.removeChild(r.domElement); } catch {}
      if (modelRef.current) {
        modelRef.current.traverse((o) => {
          if (o.isMesh) {
            o.geometry?.dispose?.();
            o.material?.map?.dispose?.();
            o.material?.dispose?.();
          }
        });
      }
      rRef.current?.dispose?.();
    };
  }, [size, modelUrl]);

  // Habilitamos teclado (Enter/Espacio) además del click
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onUse?.();
    }
  };

  return (
    <div
      className="mt-card"
      role="button"
      tabIndex={0}
      onClick={onUse}
      onKeyDown={onKey}
      aria-label={`Seleccionar ${name}`}
    >
      <div className="mt-thumb" style={{ width: size, height: size }}>
        <div className="mt-canvas" ref={rootRef} />
        {failed && <div className="mt-badge mt-failed">Error</div>}
      </div>

      <div className="mt-name">{name}</div>
    </div>
  );
}
