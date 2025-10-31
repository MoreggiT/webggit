// src/components/ModelThumb.jsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useInView } from "react-intersection-observer";
import "./modelthumb.css";

/**
 * Tarjeta con mini render 3D + nombre (la tarjeta completa es clickeable).
 *
 * Props:
 *  - modelUrl: string             URL del .glb (para preview 3D)
 *  - fileName: string             nombre para mostrar (sin .glb)
 *  - onUse: ()=>void              callback al click
 *  - size?: number                lado (px) del cuadro (default 160)
 */
export default function ModelThumb({
  modelUrl,
  fileName,
  onUse,
  size = 160,
}) {
  const name = String(fileName || "").replace(/\.[^.]+$/, ""); // sin .glb

  // Hook para detectar si el componente es visible en pantalla
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: true, // Se activa solo una vez
    threshold: 0.1,    // Considera visible cuando el 10% del elemento lo esté
  });

  const canvasContainerRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const hasRendered = useRef(false);

  // Combinamos las refs para que IntersectionObserver y Three.js usen el mismo div
  const setRefs = useCallback(
    (node) => {
      canvasContainerRef.current = node;
      inViewRef(node);
    },
    [inViewRef]
  );

  useEffect(() => {
    // Si no está en el viewport, no hacemos nada
    if (!inView) return;

    const root = canvasContainerRef.current;
    if (!root || hasRendered.current) return;

    // Renderer
    // preserveDrawingBuffer es necesario para que el render no se borre
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(size, size);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    root.appendChild(r.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // Cam
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
    cam.position.set(0.6, 0.5, 1.2);

    // Env
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.15).texture;
    scene.environment = env;
    pmrem.dispose(); // Liberamos memoria del PMREMGenerator

    // Luces
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb0b6c0, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 0.35);
    dir.position.set(2, 3, 2);
    scene.add(dir);

    let model = null;

    if (modelUrl) {
      const loader = new GLTFLoader();
      const draco = new DRACOLoader();
      draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/");
      loader.setDRACOLoader(draco);
      loader.setMeshoptDecoder(MeshoptDecoder);

      loader.load(
        modelUrl,
        (gltf) => {
          model = gltf.scene;
          // Normalizamos materiales
          model.traverse((o) => {
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
          scene.add(model);

          // Fit al cuadro
          const box = new THREE.Box3().setFromObject(model);
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

          // Renderizamos la escena UNA SOLA VEZ
          r.render(scene, cam);
          hasRendered.current = true;
        },
        undefined,
        (err) => {
          console.warn("Thumb GLB error:", err?.message || err);
          setFailed(true);
        }
      );
    } else {
      // Si no hay modelo, renderizamos la escena vacía una vez
      r.render(scene, cam);
      hasRendered.current = true;
    }

    return () => {
      try { root.removeChild(r.domElement); } catch {}
      if (model) {
        model.traverse((o) => {
          if (o.isMesh) {
            o.geometry?.dispose?.();
            o.material?.map?.dispose?.();
            o.material?.dispose?.();
          }
        });
      }
      r.dispose?.();
    };
  }, [size, modelUrl, inView]); // Se ejecuta cuando el componente se hace visible

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
      {/* Aplicamos la ref combinada a este div */}
      <div className="mt-thumb" ref={setRefs} style={{ width: size, height: size }}>
        {/* El canvas se montará aquí cuando el componente sea visible */}
        {failed && <div className="mt-badge mt-failed">Error</div>}
      </div>

      <div className="mt-name">{name}</div>
    </div>
  );
}