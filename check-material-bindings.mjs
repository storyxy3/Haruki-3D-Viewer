globalThis.self = globalThis;
import { readFile } from "node:fs/promises";
import { LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const files = process.argv.slice(2).map((file, index) => [`input-${index + 1}`, file]);
if (files.length === 0) {
  console.error("usage: node check-material-bindings.mjs <glb-or-vrm> [more files...]");
  process.exit(1);
}

const manager = new LoadingManager();
const loader = new GLTFLoader(manager);

for (const [label, file] of files) {
  const bytes = await readFile(file);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const gltf = await new Promise((resolve, reject) => loader.parse(arrayBuffer, "", resolve, reject));
  console.log(`== ${label} ==`);
  gltf.scene.traverse((node) => {
    if (!node.isMesh) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    console.log(node.name, mats.map((m) => m?.name ?? "<unnamed>"));
  });
}
