import * as THREE from "three";
import {
  VRMLoaderPlugin,
  type VRM,
  type VRMSpringBoneManager,
} from "@pixiv/three-vrm";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
loader.register(
  (parser) =>
    new VRMLoaderPlugin(parser, {
      autoUpdateHumanBones: false,
    })
);

export type LoadedGltfPart = {
  root: THREE.Group;
  meshCount: number;
  boneCount: number;
  skinnedMeshCount: number;
  userData?: Record<string, unknown>;
  vrm?: VRM | null;
  springBoneManager?: VRMSpringBoneManager | null;
};

export type LoadedGltfAnimationSet = {
  clips: THREE.AnimationClip[];
};

export async function loadGltfPart(
  url: string,
  label: string
): Promise<LoadedGltfPart> {
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene ?? gltf.scenes[0];
  if (!scene) {
    throw new Error(`GLTF scene is empty for ${label}`);
  }

  let meshCount = 0;
  let boneCount = 0;
  let skinnedMeshCount = 0;
  scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      meshCount += 1;
    }
    if ((node as THREE.Bone).isBone) {
      boneCount += 1;
    }
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMeshCount += 1;
    }
  });

  const root = new THREE.Group();
  root.name = `Loaded:${label}`;
  root.add(scene);
  return {
    root,
    meshCount,
    boneCount,
    skinnedMeshCount,
    userData: {
      ...(gltf.userData as Record<string, unknown>),
      gltfExtensions:
        ((gltf.parser as unknown as { json?: { extensions?: Record<string, unknown> } })
          .json?.extensions ?? {}),
    },
    vrm: (gltf.userData.vrm as VRM | undefined) ?? null,
    springBoneManager:
      (gltf.userData.vrmSpringBoneManager as
        | VRMSpringBoneManager
        | undefined) ?? null,
  };
}

export async function loadGltfAnimations(
  url: string,
  label: string
): Promise<LoadedGltfAnimationSet> {
  const gltf = await loader.loadAsync(url);
  if (!gltf.animations.length) {
    throw new Error(`GLTF has no animation clips for ${label}`);
  }
  return {
    clips: gltf.animations,
  };
}
