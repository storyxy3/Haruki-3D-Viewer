globalThis.self = globalThis;

import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node inspect-pjsk-hair.mjs <glb>...");
  process.exit(1);
}

const loader = new GLTFLoader();

function parseGltf(bytes) {
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) => loader.parse(arrayBuffer, "", resolve, reject));
}

function round(value) {
  return Math.round(value * 100000) / 100000;
}

function roundVec(vec) {
  return [round(vec.x), round(vec.y), round(vec.z)];
}

function makeBox() {
  return {
    min: new THREE.Vector3(Infinity, Infinity, Infinity),
    max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
    count: 0,
  };
}

function addPoint(box, point) {
  box.min.min(point);
  box.max.max(point);
  box.count += 1;
}

function summarizeBox(box) {
  if (box.count === 0) {
    return null;
  }
  const size = box.max.clone().sub(box.min);
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  return {
    count: box.count,
    min: roundVec(box.min),
    max: roundVec(box.max),
    size: roundVec(size),
    center: roundVec(center),
  };
}

function readSkinWeights(geometry, index) {
  const skinIndex = geometry.getAttribute("skinIndex");
  const skinWeight = geometry.getAttribute("skinWeight");
  if (!skinIndex || !skinWeight) {
    return [];
  }
  const weights = [];
  for (let lane = 0; lane < 4; lane += 1) {
    const weight = skinWeight.getComponent(index, lane);
    if (weight <= 0.00001) {
      continue;
    }
    weights.push({
      joint: skinIndex.getComponent(index, lane),
      weight,
    });
  }
  weights.sort((a, b) => b.weight - a.weight);
  return weights;
}

function getPath(node) {
  const names = [];
  let current = node;
  while (current) {
    if (current.name) {
      names.push(current.name);
    }
    current = current.parent;
  }
  return names.reverse().join("/");
}

function inspectMesh(mesh) {
  mesh.updateMatrixWorld(true);
  if (mesh.isSkinnedMesh) {
    mesh.skeleton.update();
  }

  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const skinnedBox = makeBox();
  const rawBox = makeBox();
  const boneBoxes = new Map();
  const tmp = new THREE.Vector3();
  const world = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    tmp.fromBufferAttribute(position, i);
    addPoint(rawBox, tmp.clone());

    if (mesh.isSkinnedMesh) {
      world.copy(tmp);
      mesh.applyBoneTransform(i, world);
      world.applyMatrix4(mesh.matrixWorld);
      const weights = readSkinWeights(geometry, i);
      const dominant = weights[0];
      const dominantBone = dominant && mesh.skeleton.bones[dominant.joint]
        ? mesh.skeleton.bones[dominant.joint].name
        : "<none>";
      if (!boneBoxes.has(dominantBone)) {
        boneBoxes.set(dominantBone, makeBox());
      }
      addPoint(boneBoxes.get(dominantBone), world);
    } else {
      world.copy(tmp).applyMatrix4(mesh.matrixWorld);
    }
    addPoint(skinnedBox, world);
  }

  const boneSummaries = [...boneBoxes.entries()]
    .filter(([name]) => /hair/i.test(name))
    .map(([name, box]) => ({ name, ...summarizeBox(box) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: mesh.name,
    path: getPath(mesh),
    isSkinnedMesh: !!mesh.isSkinnedMesh,
    materialNames: Array.isArray(mesh.material)
      ? mesh.material.map((mat) => mat?.name ?? "")
      : [mesh.material?.name ?? ""],
    vertexCount: position.count,
    skeletonBoneCount: mesh.isSkinnedMesh ? mesh.skeleton.bones.length : 0,
    rawLocalBounds: summarizeBox(rawBox),
    skinnedWorldBounds: summarizeBox(skinnedBox),
    dominantHairBoneBounds: boneSummaries,
  };
}

function inspectBones(scene) {
  const names = [
    "Head",
    "EX_Left_S_hair_01",
    "EX_Left_S_hair_02",
    "EX_Left_S_hair_03",
    "Left_S_hair_end",
    "EX_Right_S_hair_01",
    "EX_Right_S_hair_02",
    "EX_Right_S_hair_03",
    "Right_S_hair_end",
    "EX_Left_BS_hair_01",
    "EX_Left_BS_hair_02",
    "Left_BS_hair_end",
    "EX_Right_BS_hair_01",
    "EX_Right_BS_hair_02",
    "Right_BS_hair_end",
    "EX_Back_hair_01",
    "Back_hair_end",
  ];
  const nodesByName = new Map();
  scene.traverse((node) => {
    if (!nodesByName.has(node.name)) {
      nodesByName.set(node.name, []);
    }
    nodesByName.get(node.name).push(node);
  });

  const result = [];
  for (const name of names) {
    const nodes = nodesByName.get(name) ?? [];
    for (const node of nodes) {
      node.updateMatrixWorld(true);
      const pos = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
      result.push({
        name,
        path: getPath(node),
        world: roundVec(pos),
      });
    }
  }
  return result;
}

for (const file of files) {
  const bytes = await readFile(file);
  const gltf = await parseGltf(bytes);
  gltf.scene.updateMatrixWorld(true);

  const meshes = [];
  let meshCount = 0;
  let skinnedMeshCount = 0;
  let boneCount = 0;
  gltf.scene.traverse((node) => {
    if (node.isMesh) {
      meshCount += 1;
      if (node.isSkinnedMesh) {
        skinnedMeshCount += 1;
      }
      const matNames = Array.isArray(node.material)
        ? node.material.map((mat) => mat?.name ?? "")
        : [node.material?.name ?? ""];
      if (/hair/i.test(node.name) || matNames.some((name) => /hair/i.test(name))) {
        meshes.push(inspectMesh(node));
      }
    }
    if (node.isBone) {
      boneCount += 1;
    }
  });

  console.log(JSON.stringify({
    file,
    sceneName: gltf.scene.name,
    meshCount,
    skinnedMeshCount,
    boneCount,
    hairMeshes: meshes,
    selectedBones: inspectBones(gltf.scene),
  }, null, 2));
}
