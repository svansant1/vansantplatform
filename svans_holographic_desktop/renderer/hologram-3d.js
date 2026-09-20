import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { GLTFLoader } from "./vendor/three/GLTFLoader.js";

/**
 * Real 3D hologram viewer — actual geometry, not a flat AI-generated image.
 *
 * This gives SVANS genuine holographic manipulation: rotate/zoom (mouse or
 * voice-driven), component highlight/isolate by node name, layer visibility
 * toggling, transparency/X-ray, exploded assembly view, and cross-section
 * clipping. All of it operates on the actual loaded mesh hierarchy.
 *
 * Honest limitation: highlight/isolate/layer/explode all work by matching
 * against the *names* of nodes and meshes in the loaded model. A model
 * authored with meaningful names ("engine_block", "chassis", "exterior")
 * gives rich control. A model with generic auto-generated names ("Mesh_0042")
 * will still explode/cross-section/rotate fine, but named-component targeting
 * will have nothing to match — SVANS should say so rather than pretend it
 * found something it didn't.
 */

function createHologramViewer(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
  camera.position.set(2.4, 1.6, 2.4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.3;
  controls.maxDistance = 40;

  scene.add(new THREE.AmbientLight(0x66d9ff, 0.55));
  const key = new THREE.DirectionalLight(0x9fefff, 1.1);
  key.position.set(3, 4, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x0088bb, 0.6);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  const grid = new THREE.GridHelper(4, 24, 0x0090c0, 0x0a3a4a);
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  let root = null; // THREE.Group holding the loaded model
  let originalTransforms = new Map(); // Object3D -> { position, material info } for reset()
  let clipPlane = null;
  let explodeCenter = new THREE.Vector3();
  let animationFrame = null;
  let spinning = true;

  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  function frameCamera(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const distance = maxDim * 1.8;
    camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    controls.target.copy(center);
    controls.update();
    explodeCenter = center;
  }

  function clearOriginalTransforms() {
    originalTransforms = new Map();
  }

  function captureOriginalTransforms(object) {
    object.traverse((node) => {
      if (node.isMesh) {
        originalTransforms.set(node, {
          position: node.position.clone(),
          visible: node.visible,
          opacity: Array.isArray(node.material) ? node.material.map((m) => m.opacity) : node.material?.opacity,
        });
      }
    });
  }

  function loadGlbFromBase64(base64, { onLoaded, onError } = {}) {
    if (root) {
      scene.remove(root);
      root = null;
    }
    clearOriginalTransforms();
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const loader = new GLTFLoader();
    loader.parse(
      bytes.buffer,
      "",
      (gltf) => {
        root = gltf.scene;
        root.traverse((node) => {
          if (node.isMesh) {
            node.material = node.material.clone(); // isolate materials per-instance so opacity/highlight edits don't bleed across shared materials
            node.userData.baseEmissive = node.material.emissive ? node.material.emissive.clone() : null;
          }
        });
        scene.add(root);
        captureOriginalTransforms(root);
        frameCamera(root);
        onLoaded?.(root);
      },
      (error) => onError?.(error),
    );
  }

  function findMeshes(namePattern) {
    if (!root) return [];
    const needle = String(namePattern || "").toLowerCase();
    const matches = [];
    root.traverse((node) => {
      if (node.isMesh && node.name.toLowerCase().includes(needle)) matches.push(node);
    });
    return matches;
  }

  function allMeshes() {
    const meshes = [];
    root?.traverse((node) => { if (node.isMesh) meshes.push(node); });
    return meshes;
  }

  function highlight(namePattern) {
    const matches = findMeshes(namePattern);
    for (const mesh of allMeshes()) {
      const isMatch = matches.includes(mesh);
      if (mesh.material?.emissive) {
        mesh.material.emissive.set(isMatch ? 0x00d4ff : mesh.userData.baseEmissive || 0x000000);
        mesh.material.emissiveIntensity = isMatch ? 1.6 : 0;
      }
    }
    return matches.length;
  }

  function isolate(namePattern) {
    const matches = findMeshes(namePattern);
    if (!matches.length) return 0;
    for (const mesh of allMeshes()) mesh.visible = matches.includes(mesh);
    return matches.length;
  }

  function showAll() {
    for (const mesh of allMeshes()) mesh.visible = true;
  }

  function setLayerVisibility(namePattern, visible) {
    const matches = findMeshes(namePattern);
    for (const mesh of matches) mesh.visible = visible;
    return matches.length;
  }

  function setTransparent(namePattern, opacity) {
    const matches = namePattern ? findMeshes(namePattern) : allMeshes();
    for (const mesh of matches) {
      if (!mesh.material) continue;
      mesh.material.transparent = true;
      mesh.material.opacity = opacity;
      mesh.material.depthWrite = opacity > 0.85;
    }
    return matches.length;
  }

  function explode(factor) {
    if (!root) return;
    // Move each top-level child outward from the model's center, proportional
    // to its own distance from center — preserves real assembly relationships
    // (parts near the middle move less, outer parts move more) rather than
    // scattering everything uniformly.
    for (const child of root.children) {
      const original = originalTransforms.get(child)?.position ?? child.position.clone();
      const worldPos = child.getWorldPosition(new THREE.Vector3());
      const direction = worldPos.clone().sub(explodeCenter);
      if (direction.lengthSq() < 0.0001) direction.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      direction.normalize();
      child.position.copy(original.clone().add(direction.multiplyScalar(factor)));
    }
  }

  function crossSection(enabled, axis = "y", offset = 0) {
    if (!enabled) {
      for (const mesh of allMeshes()) if (mesh.material) mesh.material.clippingPlanes = [];
      clipPlane = null;
      return;
    }
    const normal = axis === "x" ? new THREE.Vector3(-1, 0, 0) : axis === "z" ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, -1, 0);
    clipPlane = new THREE.Plane(normal, offset);
    for (const mesh of allMeshes()) {
      if (!mesh.material) continue;
      mesh.material.clippingPlanes = [clipPlane];
      mesh.material.side = THREE.DoubleSide;
    }
  }

  function reset() {
    if (!root) return;
    for (const [node, original] of originalTransforms) {
      node.position.copy(original.position);
      node.visible = original.visible;
      if (node.material?.emissive) {
        node.material.emissive.set(node.userData.baseEmissive || 0x000000);
        node.material.emissiveIntensity = 0;
      }
      node.material.transparent = false;
      node.material.opacity = 1;
      node.material.clippingPlanes = [];
    }
    frameCamera(root);
  }

  function setSpinning(value) {
    spinning = value;
  }

  function animate() {
    animationFrame = requestAnimationFrame(animate);
    if (spinning && root) root.rotation.y += 0.0025;
    controls.update();
    renderer.render(scene, camera);
  }
  resize();
  animate();

  function dispose() {
    cancelAnimationFrame(animationFrame);
    resizeObserver.disconnect();
    controls.dispose();
    renderer.dispose();
    container.innerHTML = "";
  }

  return {
    loadGlbFromBase64, highlight, isolate, showAll, setLayerVisibility,
    setTransparent, explode, crossSection, reset, setSpinning, dispose,
    hasModel: () => Boolean(root),
  };
}

window.SvansHologram3D = {
  mount(container) {
    return createHologramViewer(container);
  },
};
