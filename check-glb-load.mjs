globalThis.self = globalThis;

import { readFile } from "node:fs/promises";
import { LoadingManager } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node check-glb-load.mjs <glb-or-vrm> [more files...]");
  process.exit(1);
}

const manager = new LoadingManager();
const loader = new GLTFLoader(manager);

for (const file of files) {
  try {
    const bytes = await readFile(file);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, "", resolve, reject);
    });
    let meshCount = 0;
    let boneCount = 0;
    gltf.scene.traverse((node) => {
      if (node.isMesh) meshCount += 1;
      if (node.isBone) boneCount += 1;
    });
    console.log(file, "OK", JSON.stringify({ meshCount, boneCount, sceneName: gltf.scene.name }));
  } catch (error) {
    console.log(file, "ERR", error?.message || String(error));
  }
}
