import * as THREE from "three";

/**
 * Coordinate contract for this viewer.
 *
 * Unity-authored data enters the viewer through a single mirror:
 *
 *   Unity / F5 / prefab local or world vector:  ( x, y, z )
 *   Viewer / Three vector after import:        ( -x, y, z )
 *
 * Quaternions are mirrored by the matching basis change:
 *
 *   Unity quaternion:  ( x, y, z, w )
 *   Viewer quaternion: ( x, -y, -z, w )
 *
 * Rules that keep the runtime sane:
 *
 * 1. Convert serialized Unity positions, directions, and rotations exactly once
 *    at the import boundary.
 * 2. After a Transform/Object3D exists in the viewer scene, all runtime math is
 *    viewer-space math. Do not convert live Three world/local positions again.
 * 3. When IDA/F5 names a Unity basis vector, such as QuaternionUtility.Left,
 *    convert that named Unity axis with convertUnityAxisToThree before using it
 *    with a Three matrix/quaternion.
 * 4. Never paste raw Unity basis literals like (-1, 0, 0) into runtime code
 *    unless the code is still explicitly operating in unconverted Unity space.
 *
 * The trap: Unity "Left" is local -X, but in this viewer local -X is mirrored,
 * so Unity Left becomes viewer +X. Hardcoding Three (-1, 0, 0) for an F5
 * "Left" silently flips SpringBone angle limits and makes whole cloth/hair
 * groups bend outward.
 */

export type UnityVectorLike = {
  x?: number;
  y?: number;
  z?: number;
  X?: number;
  Y?: number;
  Z?: number;
};

export type UnityQuaternionLike = {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
  X?: number;
  Y?: number;
  Z?: number;
  W?: number;
};

export type UnityAxisName =
  | "right"
  | "left"
  | "up"
  | "down"
  | "forward"
  | "back";

const UNITY_AXIS_DIRECTIONS: Record<UnityAxisName, THREE.Vector3> = {
  right: new THREE.Vector3(1, 0, 0),
  left: new THREE.Vector3(-1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  down: new THREE.Vector3(0, -1, 0),
  forward: new THREE.Vector3(0, 0, 1),
  back: new THREE.Vector3(0, 0, -1),
};

export function readUnityVector3(
  value: UnityVectorLike | undefined | null,
  fallback: THREE.Vector3
): THREE.Vector3 {
  if (!value) {
    return fallback.clone();
  }
  const x = readFiniteNumber(value.x ?? value.X);
  const y = readFiniteNumber(value.y ?? value.Y);
  const z = readFiniteNumber(value.z ?? value.Z);
  return x === null || y === null || z === null
    ? fallback.clone()
    : new THREE.Vector3(x, y, z);
}

export function readUnityQuaternion(
  value: UnityQuaternionLike | undefined | null
): THREE.Quaternion {
  if (!value) {
    return new THREE.Quaternion();
  }
  const x = readFiniteNumber(value.x ?? value.X);
  const y = readFiniteNumber(value.y ?? value.Y);
  const z = readFiniteNumber(value.z ?? value.Z);
  const w = readFiniteNumber(value.w ?? value.W);
  return x === null || y === null || z === null || w === null
    ? new THREE.Quaternion()
    : new THREE.Quaternion(x, y, z, w).normalize();
}

export function convertUnityPositionToThree(value: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-value.x, value.y, value.z);
}

export function convertUnityDirectionToThree(value: THREE.Vector3): THREE.Vector3 {
  return convertUnityPositionToThree(value);
}

export function convertUnityQuaternionToThree(value: THREE.Quaternion): THREE.Quaternion {
  return new THREE.Quaternion(value.x, -value.y, -value.z, value.w).normalize();
}

export function convertUnityAxisToThree(axis: UnityAxisName): THREE.Vector3 {
  return convertUnityDirectionToThree(UNITY_AXIS_DIRECTIONS[axis]);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
