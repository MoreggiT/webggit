// src/components/ModelThumb.jsx
import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import "./modelthumb.css";

// Un cache simple para las geometrías y materiales
const cache = new Map();
const loader = new GLTFLoader();

async function loadModel(url) {
  if (cache.has(url)) {
    return cache.get(url);
  }
  try {
    const gltf = await loader.loadAsync(url);
    const scene = gltf.scene || new THREE.Scene();
    
    // Normalizar y centrar la geometría
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1 / maxDim;
    
    // --- ESTA ERA LA LÍNEA DEL PROBLEMA ---
    // Al centrar cada geometría individualmente, el cálculo del 'center'
    // se volvía incorrecto. La eliminamos.
    // scene.traverse((child) => {
    //   if (child.isMesh) {
    //     child.geometry.center(); 
    //   }
    // });

    // Ahora, simplemente escalamos la escena y la movemos
    // usando el centro original, lo cual es correcto.
    scene.scale.set(scale, scale, scale);
    scene.position.sub(center.multiplyScalar(scale));
    scene.updateMatrixWorld(true);

    const result = { scene };
    cache.set(url, result);
    return result;
  } catch (err) {
    console.error("Error loading model for thumb:", url, err);
    cache.delete(url); // No guardar en caché si falla
    throw err;
  }
}

function ModelThumb({ modelUrl, fileName, onClick }) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Usamos useMemo para la escena, cámara y renderer para que no se re-creen
  const { scene, camera, renderer } = useMemo(() => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Un fondo gris claro

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.z = 1.2;
    camera.position.y = 0.5;
    camera.lookAt(0, 0, 0);
    scene.add(camera);
    
    // Luces
    const ambient = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 2);
    directional.position.set(2, 5, 3);
    camera.add(directional);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    return { scene, camera, renderer };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let frameId;
    let modelScene = null;
    let isMounted = true;

    const resizeRenderer = () => {
      const currentMount = mountRef.current;
      if (!currentMount) return; 

      const { clientWidth, clientHeight } = currentMount;
      if (clientWidth === 0 || clientHeight === 0) return; 

      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    mount.appendChild(renderer.domElement);

    const animate = () => {
      if (!isMounted) return;
      if (modelScene) {
        modelScene.rotation.y += 0.01; // Rotación suave
      }
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    loadModel(modelUrl)
      .then((model) => {
        if (!isMounted) return;
        modelScene = model.scene;
        scene.add(modelScene);
        setLoading(false);
        resizeRenderer(); // Llamada inicial para ajustar el tamaño
        animate();
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(true);
        setLoading(false);
      });

    // El observador ahora usa la función resizeRenderer corregida
    const observer = new ResizeObserver(resizeRenderer);
    observer.observe(mount);

    return () => {
      isMounted = false;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      if (mount && mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      if (modelScene) {
        scene.remove(modelScene);
      }
    };
  }, [modelUrl, scene, camera, renderer]); // Dependencias están bien

  return (
    <button className="model-thumb-btn" onClick={onClick} title={`Cargar ${fileName}`}>
      <div className="model-thumb-preview" ref={mountRef}>
        {loading && <div className="thumb-spinner" />}
        {error && <div className="thumb-error">!</div>}
      </div>
      <div className="model-thumb-caption">{fileName.replace(/\.glb$/, "")}</div>
    </button>
  );
}

export default ModelThumb;

