import * as THREE from "three";

export enum UtjColliderStatus {
  NoCollision = 0,
  HeadIsEmbedded = 1,
  TailCollision = 2,
}

export type UtjSpringBoneState = {
  currTipPos: THREE.Vector3;
  prevTipPos: THREE.Vector3;
  hitNormal: THREE.Vector3;
  cachedPosition: THREE.Vector3;
  cachedMovement: THREE.Vector3;
};

export type UtjSpringBoneUpdateInput = {
  headPosition: THREE.Vector3;
  parentRotation: THREE.Quaternion;
  initialLocalRotation: THREE.Quaternion;
  boneAxis: THREE.Vector3;
  lengthFallbackDirection?: THREE.Vector3;
  springLength: number;
  stiffnessForce: number;
  dragForce: number;
  springForce: THREE.Vector3;
  externalForce: THREE.Vector3;
  deltaTime: number;
};

export type UtjSpringBoneCollisionInput = {
  headPosition: THREE.Vector3;
  springLength: number;
  tailRadius: number;
  colliders: readonly UtjCollider[];
  bounce: number;
  friction: number;
  onColliderCheck?: (collider: UtjCollider, trace: UtjColliderCheckTrace) => void;
  onCollision?: (collider: UtjCollider, result: UtjCollisionResult) => void;
};

export type UtjGroundCollisionInput = {
  headPosition: THREE.Vector3;
  springLength: number;
  tailRadius: number;
  groundHeight: number;
  lengthFallbackDirection: THREE.Vector3;
  bounce: number;
  friction: number;
};

export type UtjSphereCollisionOptions = {
  headEmbeddedFallback?: false | THREE.Vector3;
  noIntersectionStatus?: UtjColliderStatus.NoCollision | UtjColliderStatus.TailCollision;
};

export type UtjSphereCollider = {
  kind: "sphere";
  enabled?: boolean;
  debugName?: string;
  debugPath?: string;
  debugSourcePathId?: number;
  radius: number;
  localOffset: THREE.Vector3;
  localToWorldMatrix: THREE.Matrix4;
  worldToLocalMatrix: THREE.Matrix4;
  worldToLocalRadiusScale: number;
  localToWorldNormalMatrix: THREE.Matrix4;
  lossyScaleX: number;
};

export type UtjCapsuleCollider = {
  kind: "capsule";
  enabled?: boolean;
  debugName?: string;
  debugPath?: string;
  debugSourcePathId?: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
};

export type UtjLocalCapsuleCollider = {
  kind: "capsuleLocal";
  enabled?: boolean;
  debugName?: string;
  debugPath?: string;
  debugSourcePathId?: number;
  localStart: THREE.Vector3;
  localEnd: THREE.Vector3;
  radius: number;
  localToWorldMatrix: THREE.Matrix4;
  worldToLocalMatrix: THREE.Matrix4;
  worldToLocalRadiusScale: number;
  localToWorldNormalMatrix: THREE.Matrix4;
  lossyScaleX: number;
};

export type UtjPanelCollider = {
  kind: "panel";
  enabled?: boolean;
  debugName?: string;
  debugPath?: string;
  debugSourcePathId?: number;
  width: number;
  height: number;
  localToWorldMatrix: THREE.Matrix4;
  worldToLocalMatrix: THREE.Matrix4;
  worldToLocalRadiusScale: number;
  worldToLocalLengthScale: number;
  localToWorldNormalMatrix: THREE.Matrix4;
};

export type UtjCollider =
  | UtjSphereCollider
  | UtjCapsuleCollider
  | UtjLocalCapsuleCollider
  | UtjPanelCollider;

export type UtjCollisionResult = {
  status: UtjColliderStatus;
  tailPosition: THREE.Vector3;
  hitNormal: THREE.Vector3;
};

export type UtjColliderTraceDetails = {
  kind: UtjCollider["kind"];
  localHeadPosition?: THREE.Vector3;
  localTailPositionBefore?: THREE.Vector3;
  localTailPositionAfter?: THREE.Vector3;
  localTailRadius?: number;
  localSphereOrigin?: THREE.Vector3;
  localSphereRadius?: number;
  localCapsuleStart?: THREE.Vector3;
  localCapsuleEnd?: THREE.Vector3;
  capsuleRadius?: number;
  panelWidth?: number;
  panelHeight?: number;
};

export type UtjColliderCheckTrace = {
  status: UtjColliderStatus;
  beforeTailPosition: THREE.Vector3;
  afterTailPosition: THREE.Vector3;
  hitNormal: THREE.Vector3;
  details: UtjColliderTraceDetails;
};

export type UtjAngleLimit = {
  active: boolean;
  min: number;
  max: number;
};

export type UtjConstrainVectorInput = {
  basisSide: THREE.Vector3;
  basisUp: THREE.Vector3;
  basisForward: THREE.Vector3;
  springStrength: number;
  deltaTime: number;
  limit: UtjAngleLimit;
  vector: THREE.Vector3;
};

export type UtjLengthLimitTarget = {
  position: THREE.Vector3;
  initialLength: number;
};

export type UtjApplyLengthLimitsInput = {
  currTipPos: THREE.Vector3;
  springConstant: number;
  deltaTime: number;
  targets: readonly UtjLengthLimitTarget[];
};

const EPSILON = 0.00001;
const SPRING_LENGTH_EPSILON = 0.001;
const FALLBACK_AXIS = new THREE.Vector3(1, 0, 0);

// State setup
export function createUtjSpringBoneState(
  headPosition: THREE.Vector3,
  tipPosition: THREE.Vector3
): UtjSpringBoneState {
  return {
    currTipPos: tipPosition.clone(),
    prevTipPos: tipPosition.clone(),
    hitNormal: new THREE.Vector3(0, 0, 0),
    cachedPosition: headPosition.clone(),
    cachedMovement: new THREE.Vector3(0, 0, 0),
  };
}

// UpdateSpring / integration
export function computeAnimatedTipPosition(
  input: Pick<
    UtjSpringBoneUpdateInput,
    "headPosition" | "parentRotation" | "initialLocalRotation" | "boneAxis" | "springLength"
  >
): THREE.Vector3 {
  const rotation = input.parentRotation.clone().multiply(input.initialLocalRotation);
  const axis = input.boneAxis.clone().applyQuaternion(rotation);
  return input.headPosition.clone().addScaledVector(axis, input.springLength);
}

// UTJ.SpringBone.UpdateSpring RVA 0x0a59dbd8
export function updateUtjSpring(state: UtjSpringBoneState, input: UtjSpringBoneUpdateInput): void {
  const previousTip = state.currTipPos.clone();
  const animatedTip = computeAnimatedTipPosition(input);
  const stiffness = animatedTip.sub(state.currTipPos).multiplyScalar(input.stiffnessForce);
  const force = input.springForce.clone().add(input.externalForce).add(stiffness);
  const velocity = state.currTipPos
    .clone()
    .sub(state.prevTipPos)
    .multiplyScalar(1.0 - input.dragForce);

  state.currTipPos.add(velocity).addScaledVector(force, input.deltaTime * input.deltaTime * 0.5);
  state.prevTipPos.copy(previousTip);
  enforceSpringLength(
    state.currTipPos,
    input.headPosition,
    input.springLength,
    input.lengthFallbackDirection ?? input.boneAxis
  );
}

export function cacheUtjSpringBonePosition(
  state: UtjSpringBoneState,
  headPosition: THREE.Vector3
): void {
  state.cachedMovement.copy(headPosition).sub(state.cachedPosition);
  state.cachedPosition.copy(headPosition);
}

// Length limits
export function enforceSpringLength(
  tailPosition: THREE.Vector3,
  headPosition: THREE.Vector3,
  springLength: number,
  fallbackDirection = FALLBACK_AXIS
): void {
  const direction = tailPosition.clone().sub(headPosition);
  if (direction.lengthSq() <= SPRING_LENGTH_EPSILON * SPRING_LENGTH_EPSILON) {
    direction.copy(fallbackDirection);
  }
  direction.normalize();
  tailPosition.copy(headPosition).addScaledVector(direction, springLength);
}

export function fixBoneLength(
  result: THREE.Vector3,
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  minLength: number,
  maxLength: number,
  fallbackDirection = FALLBACK_AXIS
): void {
  const direction = tailPosition.clone().sub(headPosition);
  const distance = direction.length();
  if (distance <= SPRING_LENGTH_EPSILON) {
    direction.copy(fallbackDirection).normalize();
    result.copy(headPosition).addScaledVector(direction, minLength);
    return;
  }

  const clampedLength = THREE.MathUtils.clamp(distance, minLength, maxLength);
  result.copy(headPosition).addScaledVector(direction, clampedLength / distance);
}

export function applyUtjLengthLimits(input: UtjApplyLengthLimitsInput): void {
  if (input.targets.length === 0) {
    return;
  }

  const stiffness = input.springConstant * input.deltaTime * input.deltaTime;
  const movement = new THREE.Vector3();
  for (const target of input.targets) {
    const targetToTip = input.currTipPos.clone().sub(target.position);
    const distance = targetToTip.length();
    const over = distance - target.initialLength;
    movement.addScaledVector(targetToTip, -(stiffness * over) / distance);
  }
  input.currTipPos.add(movement);
}

// Collision dispatch and velocity response
// UTJ.SpringBone.CheckForCollision RVA 0x0a59e454
export function checkUtjCollisions(
  state: UtjSpringBoneState,
  input: UtjSpringBoneCollisionInput
): UtjColliderStatus {
  let finalStatus = UtjColliderStatus.NoCollision;
  let finalHitNormal: THREE.Vector3 | null = null;
  const preCollisionTip = state.currTipPos.clone();

  for (const collider of sortedCollidersForUtj(input.colliders)) {
    if (collider.enabled === false) {
      continue;
    }

    const result = checkColliderCollisionAndReact(
      collider,
      input.headPosition,
      state.currTipPos,
      input.tailRadius,
      input.springLength
    );
    input.onColliderCheck?.(collider, {
      status: result.status,
      beforeTailPosition: state.currTipPos.clone(),
      afterTailPosition: result.tailPosition.clone(),
      hitNormal: result.hitNormal.clone(),
      details: buildColliderTraceDetails(
        collider,
        input.headPosition,
        state.currTipPos,
        result.tailPosition,
        input.tailRadius
      ),
    });

    if (result.status === UtjColliderStatus.NoCollision) {
      continue;
    }

    state.currTipPos.copy(result.tailPosition);
    state.hitNormal.copy(result.hitNormal);
    finalHitNormal = result.hitNormal;
    finalStatus = result.status;
    input.onCollision?.(collider, result);
  }

  if (finalHitNormal) {
    applyUtjCollisionVelocityResponse(
      state,
      finalHitNormal,
      input.bounce,
      input.friction,
      preCollisionTip
    );
  }

  return finalStatus;
}

function buildColliderTraceDetails(
  collider: UtjCollider,
  headPosition: THREE.Vector3,
  beforeTailPosition: THREE.Vector3,
  afterTailPosition: THREE.Vector3,
  tailRadius: number
): UtjColliderTraceDetails {
  if (collider.kind === "sphere") {
    return {
      kind: collider.kind,
      localHeadPosition: headPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionBefore: beforeTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionAfter: afterTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailRadius: tailRadius,
      localSphereOrigin: collider.localOffset.clone(),
      localSphereRadius: collider.lossyScaleX * collider.radius,
    };
  }

  if (collider.kind === "capsuleLocal") {
    return {
      kind: collider.kind,
      localHeadPosition: headPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionBefore: beforeTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionAfter: afterTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailRadius: tailRadius,
      localCapsuleStart: collider.localStart.clone(),
      localCapsuleEnd: collider.localEnd.clone(),
      capsuleRadius: collider.radius,
    };
  }

  if (collider.kind === "panel") {
    return {
      kind: collider.kind,
      localHeadPosition: headPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionBefore: beforeTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailPositionAfter: afterTailPosition.clone().applyMatrix4(collider.worldToLocalMatrix),
      localTailRadius: tailRadius * collider.worldToLocalRadiusScale,
      panelWidth: collider.width,
      panelHeight: collider.height,
    };
  }

  return {
    kind: collider.kind,
    localHeadPosition: headPosition.clone(),
    localTailPositionBefore: beforeTailPosition.clone(),
    localTailPositionAfter: afterTailPosition.clone(),
    localTailRadius: tailRadius,
    localCapsuleStart: collider.start.clone(),
    localCapsuleEnd: collider.end.clone(),
    capsuleRadius: collider.radius,
  };
}

// Ground and panel colliders
export function checkUtjGroundCollision(
  state: UtjSpringBoneState,
  input: UtjGroundCollisionInput
): boolean {
  const localHead = input.headPosition.clone();
  localHead.y -= input.groundHeight;
  const localTail = state.currTipPos.clone();
  localTail.y -= input.groundHeight;
  const currentLength = state.currTipPos.distanceTo(input.headPosition);
  const status = checkCollisionWithAlignedPlaneAndReact(
    localHead,
    currentLength,
    localTail,
    input.tailRadius,
    1
  );
  if (status === UtjColliderStatus.NoCollision) {
    return false;
  }

  localTail.y += input.groundHeight;
  fixBoneLength(
    state.currTipPos,
    input.headPosition,
    localTail,
    input.springLength * 0.5,
    input.springLength,
    input.lengthFallbackDirection
  );
  state.prevTipPos.copy(state.currTipPos);
  state.hitNormal.set(0, 1, 0);
  return true;
}

function checkColliderCollisionAndReact(
  collider: UtjCollider,
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  springLength: number
): UtjCollisionResult {
  if (collider.kind === "sphere") {
    return checkLocalSphereCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      collider
    );
  }

  if (collider.kind === "capsule") {
    return checkCapsuleCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      collider.start,
      collider.end,
      collider.radius
    );
  }

  if (collider.kind === "panel") {
    return checkPanelCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      springLength,
      collider
    );
  }

  return checkLocalCapsuleCollisionAndReact(
    headPosition,
    tailPosition,
    tailRadius,
    collider
  );
}

export function checkPanelCollisionAndReact(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  springLength: number,
  collider: UtjPanelCollider
): UtjCollisionResult {
  const localTail = tailPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localTailRadius = tailRadius * collider.worldToLocalRadiusScale;
  if (localTail.z >= localTailRadius) {
    return noCollision(tailPosition);
  }

  const halfWidth = collider.width * 0.5;
  const halfHeight = collider.height * 0.5;
  if (Math.abs(localTail.x) >= halfWidth + localTailRadius) {
    return noCollision(tailPosition);
  }
  if (Math.abs(localTail.y) >= halfHeight + localTailRadius) {
    return noCollision(tailPosition);
  }

  const localHead = headPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localLength = springLength * collider.worldToLocalLengthScale;
  let status = UtjColliderStatus.NoCollision;
  const localResult = localTail.clone();

  if (localTail.z > 0 || localHead.z > 0) {
    if (Math.abs(localTail.y) <= halfHeight && Math.abs(localTail.x) <= halfWidth) {
      status = checkCollisionWithAlignedPlaneAndReact(
        localHead,
        localLength,
        localResult,
        localTailRadius,
        2
      );
      if (status === UtjColliderStatus.NoCollision) {
        return noCollision(tailPosition);
      }
    } else if (Math.abs(localTail.y) > halfHeight) {
      const edgeY = localTail.y >= 0 ? halfHeight : -halfHeight;
      const normal = new THREE.Vector3(0, localTail.y - edgeY, localTail.z);
      if (normal.lengthSq() <= EPSILON * EPSILON) {
        normal.set(0, 0, 0);
      } else {
        normal.normalize();
      }
      localResult.set(
        localTail.x + normal.x * localTailRadius,
        edgeY + normal.y * localTailRadius,
        normal.z * localTailRadius
      );
      status = UtjColliderStatus.TailCollision;
    } else {
      const edgeX = localTail.x >= 0 ? halfWidth : -halfWidth;
      const normal = new THREE.Vector3(localTail.x - edgeX, 0, localTail.z);
      if (normal.lengthSq() <= EPSILON * EPSILON) {
        normal.set(0, 0, 0);
      } else {
        normal.normalize();
      }
      localResult.set(
        edgeX + normal.x * localTailRadius,
        localTail.y + normal.y * localTailRadius,
        normal.z * localTailRadius
      );
      status = UtjColliderStatus.TailCollision;
    }
  } else if (Math.abs(localHead.y) <= halfHeight) {
    if (Math.abs(localHead.x) <= halfWidth) {
      status = UtjColliderStatus.HeadIsEmbedded;
      localResult.set(localHead.x, localHead.y, localTailRadius);
    } else {
      status = UtjColliderStatus.TailCollision;
      localResult.set(localTail.x < 0 ? -halfWidth : halfWidth, localTail.y, localTail.z);
    }
  } else {
    status = UtjColliderStatus.TailCollision;
    localResult.set(localTail.x, localTail.y >= 0 ? halfHeight : -halfHeight, localTail.z);
  }

  return {
    status,
    tailPosition: localResult.applyMatrix4(collider.localToWorldMatrix),
    hitNormal: transformDirection(new THREE.Vector3(0, 0, 1), collider.localToWorldMatrix),
  };
}

export function checkCollisionWithAlignedPlaneAndReact(
  localHeadPosition: THREE.Vector3,
  localLength: number,
  localTailPosition: THREE.Vector3,
  localTailRadius: number,
  upAxis: 0 | 1 | 2
): UtjColliderStatus {
  const up = getAxis(localTailPosition, upAxis);
  if (up >= localTailRadius) {
    return UtjColliderStatus.NoCollision;
  }

  const headUp = getAxis(localHeadPosition, upAxis);
  if (headUp + localLength <= localTailRadius) {
    localTailPosition.copy(localHeadPosition);
    setAxis(localTailPosition, upAxis, headUp + localLength);
    return UtjColliderStatus.HeadIsEmbedded;
  }

  const sideA = (upAxis + 1) % 3 as 0 | 1 | 2;
  const sideB = (upAxis + 2) % 3 as 0 | 1 | 2;
  const a = getAxis(localTailPosition, sideA) - getAxis(localHeadPosition, sideA);
  const b = getAxis(localTailPosition, sideB) - getAxis(localHeadPosition, sideB);
  const sideLength = Math.sqrt(a * a + b * b);
  if (sideLength > 0.001) {
    const height = headUp - localTailRadius;
    const sideScale = Math.sqrt(localLength * localLength - height * height) / sideLength;
    setAxis(localTailPosition, sideA, getAxis(localHeadPosition, sideA) + a * sideScale);
    setAxis(localTailPosition, sideB, getAxis(localHeadPosition, sideB) + b * sideScale);
    setAxis(localTailPosition, upAxis, localTailRadius);
  } else {
    localTailPosition.copy(localHeadPosition);
  }
  return UtjColliderStatus.TailCollision;
}

// Sphere colliders
export function checkSphereCollisionAndReact(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  sphereCenter: THREE.Vector3,
  sphereRadius: number,
  headEmbeddedRadius = sphereRadius,
  options: UtjSphereCollisionOptions = {}
): UtjCollisionResult {
  const radiusB = tailRadius + sphereRadius;
  const centerToTail = tailPosition.clone().sub(sphereCenter);
  if (centerToTail.lengthSq() >= radiusB * radiusB) {
    return noCollision(tailPosition);
  }

  const headDistanceSq = headPosition.distanceToSquared(sphereCenter);
  if (headDistanceSq <= headEmbeddedRadius * headEmbeddedRadius) {
    const normal = options.headEmbeddedFallback === false
      ? centerToTail.clone().multiplyScalar(1.0 / Math.sqrt(centerToTail.lengthSq()))
      : normalizeOrFallback(
        centerToTail,
        options.headEmbeddedFallback instanceof THREE.Vector3
          ? options.headEmbeddedFallback
          : headPosition.clone().sub(sphereCenter).lengthSq() <= EPSILON * EPSILON
          ? new THREE.Vector3(0, 1, 0)
          : headPosition.clone().sub(sphereCenter)
      );
    return {
      status: UtjColliderStatus.HeadIsEmbedded,
      tailPosition: sphereCenter.clone().addScaledVector(normal, radiusB),
      hitNormal: normal,
    };
  }

  const radiusA = tailPosition.distanceTo(headPosition);
  const intersection = computeSphereIntersectionCircle(
    headPosition,
    radiusA,
    sphereCenter,
    radiusB
  );
  if (!intersection) {
    if (options.noIntersectionStatus === UtjColliderStatus.TailCollision) {
      return {
        status: UtjColliderStatus.TailCollision,
        tailPosition: tailPosition.clone(),
        hitNormal: normalizeOrFallback(tailPosition.clone().sub(sphereCenter), centerToTail),
      };
    }
    return noCollision(tailPosition);
  }

  const newTailPosition = computeNewTailPosition(intersection, tailPosition);
  return {
    status: UtjColliderStatus.TailCollision,
    tailPosition: newTailPosition,
    hitNormal: normalizeOrFallback(newTailPosition.clone().sub(sphereCenter), centerToTail),
  };
}

export function checkLocalSphereCollisionAndReact(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  collider: UtjSphereCollider
): UtjCollisionResult {
  const localHead = headPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localTail = tailPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localTailRadius = tailRadius;
  const localSphereRadius = collider.lossyScaleX * collider.radius;
  const localResult = checkSphereCollisionAndReact(
    localHead,
    localTail,
    localTailRadius,
    collider.localOffset,
    localSphereRadius,
    localSphereRadius,
    {
      headEmbeddedFallback: false,
      noIntersectionStatus: UtjColliderStatus.TailCollision,
    }
  );

  if (localResult.status === UtjColliderStatus.NoCollision) {
    return noCollision(tailPosition);
  }

  return {
    status: localResult.status,
    tailPosition: localResult.tailPosition.clone().applyMatrix4(collider.localToWorldMatrix),
    hitNormal: transformDirection(
      localResult.hitNormal.clone(),
      collider.localToWorldNormalMatrix
    ),
  };
}

// Capsule colliders
export function checkCapsuleCollisionAndReact(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  capsuleStart: THREE.Vector3,
  capsuleEnd: THREE.Vector3,
  capsuleRadius: number
): UtjCollisionResult {
  const segment = capsuleEnd.clone().sub(capsuleStart);
  const segmentLengthSq = segment.lengthSq();
  if (segmentLengthSq <= EPSILON * EPSILON) {
    return checkSphereCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      capsuleStart,
      capsuleRadius
    );
  }

  const t = THREE.MathUtils.clamp(
    tailPosition.clone().sub(capsuleStart).dot(segment) / segmentLengthSq,
    0,
    1
  );
  const closest = capsuleStart.clone().addScaledVector(segment, t);
  const radiusB = tailRadius + capsuleRadius;
  const closestToTail = tailPosition.clone().sub(closest);
  if (closestToTail.lengthSq() >= radiusB * radiusB) {
    return noCollision(tailPosition);
  }

  if (t <= EPSILON) {
    return checkSphereCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      capsuleStart,
      capsuleRadius
    );
  }
  if (t >= 1.0 - EPSILON) {
    return checkSphereCollisionAndReact(
      headPosition,
      tailPosition,
      tailRadius,
      capsuleEnd,
      capsuleRadius
    );
  }

  const normal = normalizeOrFallback(closestToTail, headPosition.clone().sub(closest));
  const headAxisT = THREE.MathUtils.clamp(
    headPosition.clone().sub(capsuleStart).dot(segment) / segmentLengthSq,
    0,
    1
  );
  const closestToHead = capsuleStart.clone().addScaledVector(segment, headAxisT);
  const headInside = headPosition.distanceToSquared(closestToHead) <= capsuleRadius * capsuleRadius;

  return {
    status: headInside ? UtjColliderStatus.HeadIsEmbedded : UtjColliderStatus.TailCollision,
    tailPosition: closest.addScaledVector(normal, radiusB),
    hitNormal: normal,
  };
}

export function checkLocalCapsuleCollisionAndReact(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  tailRadius: number,
  collider: UtjLocalCapsuleCollider
): UtjCollisionResult {
  const localHead = headPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localTail = tailPosition.clone().applyMatrix4(collider.worldToLocalMatrix);
  const localTailRadius = tailRadius;
  const localResult = checkLocalYAxisCapsuleCollisionAndReact(
    localHead,
    localTail,
    localTailRadius,
    collider.localStart,
    collider.localEnd,
    collider.radius,
    collider.lossyScaleX
  );

  if (localResult.status === UtjColliderStatus.NoCollision) {
    return noCollision(tailPosition);
  }

  const worldTailPosition = localResult.tailPosition
    .clone()
    .applyMatrix4(collider.localToWorldMatrix);
  const worldHitNormal = transformDirection(localResult.hitNormal, collider.localToWorldNormalMatrix);
  return {
    status: localResult.status,
    tailPosition: worldTailPosition,
    hitNormal: worldHitNormal,
  };
}

export function checkLocalYAxisCapsuleCollisionAndReact(
  localHeadPosition: THREE.Vector3,
  localTailPosition: THREE.Vector3,
  localTailRadius: number,
  localStart: THREE.Vector3,
  localEnd: THREE.Vector3,
  capsuleRadius: number,
  lossyScaleX = 1.0
): UtjCollisionResult {
  if (capsuleRadius <= 0.0001) {
    return noCollision(localTailPosition);
  }

  const lowerCap = localStart.y <= localEnd.y ? localStart : localEnd;
  const upperCap = localStart.y <= localEnd.y ? localEnd : localStart;
  const minY = lowerCap.y;
  const maxY = upperCap.y;

  if (localTailPosition.y <= minY || localTailPosition.y >= maxY) {
    const capCenter = localTailPosition.y < maxY ? lowerCap : upperCap;
    return checkSphereCollisionAndReact(
      localHeadPosition,
      localTailPosition,
      localTailRadius,
      capCenter,
      capsuleRadius,
      Math.abs(lossyScaleX) * capsuleRadius,
      {
        headEmbeddedFallback: new THREE.Vector3(0, 0, 0),
        noIntersectionStatus: UtjColliderStatus.TailCollision,
      }
    );
  }

  return checkLocalCylinderCollisionAndReact(
    localHeadPosition,
    localTailPosition,
    localTailRadius,
    capsuleRadius,
    lossyScaleX
  );
}

export function checkLocalCylinderCollisionAndReact(
  localHeadPosition: THREE.Vector3,
  localTailPosition: THREE.Vector3,
  localTailRadius: number,
  capsuleRadius: number,
  lossyScaleX = 1.0
): UtjCollisionResult {
  const radiusB = capsuleRadius + localTailRadius;
  const xzLengthSq =
    localTailPosition.x * localTailPosition.x +
    localTailPosition.z * localTailPosition.z;
  if (xzLengthSq > radiusB * radiusB) {
    return noCollision(localTailPosition);
  }

  const xzLength = Math.sqrt(xzLengthSq);
  const normalX = xzLength > EPSILON ? localTailPosition.x / xzLength : 0.0;
  const normalZ = xzLength > EPSILON ? localTailPosition.z / xzLength : 0.0;
  const tailPosition = new THREE.Vector3(
    radiusB * normalX,
    localTailPosition.y,
    radiusB * normalZ
  );
  const hitNormal = new THREE.Vector3(normalX, 0, normalZ);
  const headXzLengthSq =
    localHeadPosition.x * localHeadPosition.x +
    localHeadPosition.z * localHeadPosition.z;
  const headEmbeddedRadius = Math.abs(lossyScaleX) * capsuleRadius;
  const headStatus = headXzLengthSq <= headEmbeddedRadius * headEmbeddedRadius
    ? UtjColliderStatus.HeadIsEmbedded
    : UtjColliderStatus.TailCollision;
  return {
    status: headStatus,
    tailPosition,
    hitNormal,
  };
}

// Shared sphere/capsule solver helpers
export type UtjSphereIntersectionCircle = {
  origin: THREE.Vector3;
  upVector: THREE.Vector3;
  radius: number;
};

export function computeSphereIntersectionCircle(
  originA: THREE.Vector3,
  radiusA: number,
  originB: THREE.Vector3,
  radiusB: number
): UtjSphereIntersectionCircle | null {
  const between = originB.clone().sub(originA);
  const distanceSq = between.lengthSq();
  const distance = Math.sqrt(distanceSq);
  if (distance <= 0.0) {
    return null;
  }

  const upVector = between.multiplyScalar(1.0 / distance);
  const radiusASq = radiusA * radiusA;
  const numerator = radiusASq + distanceSq - radiusB * radiusB;
  const halfOverDistance = 0.5 / distance;
  const radicand = radiusASq * (distanceSq * 4.0) - numerator * numerator;
  if (radicand < 0.0) {
    return null;
  }
  const x = numerator * halfOverDistance;
  return {
    origin: originA.clone().addScaledVector(upVector, x),
    upVector,
    radius: halfOverDistance * Math.sqrt(radicand),
  };
}

export function computeNewTailPosition(
  intersection: UtjSphereIntersectionCircle,
  tailPosition: THREE.Vector3
): THREE.Vector3 {
  const originToTail = tailPosition.clone().sub(intersection.origin);
  const projected = intersection.origin
    .clone()
    .addScaledVector(intersection.upVector, originToTail.dot(intersection.upVector));
  const radial = tailPosition.clone().sub(projected);
  const radialLength = radial.length();
  if (radialLength <= EPSILON || intersection.radius <= EPSILON) {
    return intersection.origin.clone();
  }
  return intersection.origin.clone().addScaledVector(radial, intersection.radius / radialLength);
}

export function applyUtjCollisionVelocityResponse(
  state: UtjSpringBoneState,
  hitNormal: THREE.Vector3,
  bounce: number,
  friction: number,
  preCollisionTip = state.currTipPos
): void {
  const normal = normalizeOrFallback(hitNormal, FALLBACK_AXIS);
  const previousTip = state.prevTipPos.clone();
  const velocity = preCollisionTip.clone().sub(previousTip);
  const normalVelocity = normal.clone().multiplyScalar(velocity.dot(normal));
  const tangentVelocity = velocity.sub(normalVelocity);
  const correctedVelocity = tangentVelocity
    .multiplyScalar(1.0 - friction)
    .sub(normalVelocity.multiplyScalar(bounce));
  if (correctedVelocity.lengthSq() <= 0.0001) {
    state.prevTipPos.copy(state.currTipPos);
    return;
  }

  state.prevTipPos.copy(state.currTipPos).sub(correctedVelocity);
  const oldDistance = state.currTipPos.distanceTo(previousTip);
  const newSpeed = correctedVelocity.length();
  const extra = Math.max(newSpeed - oldDistance, 0);
  if (extra > 0) {
    state.currTipPos.addScaledVector(correctedVelocity, extra / newSpeed);
  }
}

// Angle limits
// UTJ.SpringBone.ApplyAngleLimits RVA 0x0a59e91c
export function constrainUtjAngleLimit(input: UtjConstrainVectorInput): boolean {
  if (!input.limit.active) {
    return false;
  }

  const vector = input.vector;
  const upLength = input.basisUp.dot(vector);
  const upComponent = input.basisUp.clone().multiplyScalar(upLength);
  const sideForward = vector.clone().sub(upComponent);
  const sideForwardLength = sideForward.length();
  const sideForwardDirection = sideForward.multiplyScalar(1.0 / sideForwardLength);
  const rawSideDot = input.basisSide.dot(sideForwardDirection);
  const sideDotMax = Number.isNaN(rawSideDot) ? 1.0 : Math.min(rawSideDot, 1.0);
  const sideDot = rawSideDot < -1.0 ? -1.0 : sideDotMax;
  const angle = Math.asin(sideDot) * 57.296;
  const easedAngle = angle - angle * input.springStrength * input.deltaTime * input.deltaTime;
  const easedAtMostMax = easedAngle <= input.limit.max ? easedAngle : input.limit.max;
  const clampedAngle = easedAngle < input.limit.min ? input.limit.min : easedAtMostMax;
  const bound = clampedAngle >= 0 ? input.limit.max : input.limit.min;
  let ratio = 0;
  if (bound < -0.0001 || bound > 0.0001) {
    const rawRatio = clampedAngle / bound;
    if (rawRatio >= 0) {
      ratio = Math.min(rawRatio, 1.0);
    }
  }
  const limitedAngle = bound * ratio;
  const radians = limitedAngle * 0.017453;
  const limitedSideForward = input.basisSide
    .clone()
    .multiplyScalar(Math.sin(radians))
    .addScaledVector(input.basisForward, Math.cos(radians))
    .multiplyScalar(sideForwardLength);

  vector.copy(upComponent).add(limitedSideForward);
  return limitedAngle !== easedAngle;
}

// ComputeRotation
// UTJ.SpringBone.ComputeRotation overloads RVA 0x0a59eb24 / 0x0a59ed20
export function computeUtjWorldRotation(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  parentRotation: THREE.Quaternion,
  initialLocalRotation: THREE.Quaternion,
  boneAxis: THREE.Vector3
): THREE.Quaternion {
  const baseRotation = parentRotation.clone().multiply(initialLocalRotation);
  const baseDirection = normalizeOrFallback(boneAxis.clone().applyQuaternion(baseRotation), FALLBACK_AXIS);
  const targetDirection = normalizeOrFallback(tailPosition.clone().sub(headPosition), baseDirection);
  const delta = new THREE.Quaternion().setFromUnitVectors(baseDirection, targetDirection);
  return delta.multiply(baseRotation).normalize();
}

export function computeUtjLocalRotation(
  headPosition: THREE.Vector3,
  tailPosition: THREE.Vector3,
  parentRotation: THREE.Quaternion,
  initialLocalRotation: THREE.Quaternion,
  boneAxis: THREE.Vector3
): THREE.Quaternion {
  const baseRotation = parentRotation.clone().multiply(initialLocalRotation);
  const localTipDirection = tailPosition
    .clone()
    .sub(headPosition)
    .applyQuaternion(baseRotation.clone().invert());
  localTipDirection.multiplyScalar(1.0 / localTipDirection.length());
  const delta = new THREE.Quaternion().setFromUnitVectors(boneAxis.clone(), localTipDirection);
  return initialLocalRotation.clone().multiply(delta);
}

// Shared math helpers
function noCollision(tailPosition: THREE.Vector3): UtjCollisionResult {
  return {
    status: UtjColliderStatus.NoCollision,
    tailPosition: tailPosition.clone(),
    hitNormal: new THREE.Vector3(0, 0, 0),
  };
}

function sortedCollidersForUtj(colliders: readonly UtjCollider[]): UtjCollider[] {
  return [...colliders].sort((a, b) => colliderOrder(a) - colliderOrder(b));
}

function colliderOrder(collider: UtjCollider): number {
  if (collider.kind === "capsule" || collider.kind === "capsuleLocal") {
    return 0;
  }
  if (collider.kind === "sphere") {
    return 1;
  }
  return 2;
}

function normalizeOrFallback(vector: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  if (vector.lengthSq() <= EPSILON * EPSILON) {
    vector.copy(fallback);
  }
  if (vector.lengthSq() <= EPSILON * EPSILON) {
    vector.copy(FALLBACK_AXIS);
  }
  return vector.normalize();
}

function transformDirection(direction: THREE.Vector3, matrix: THREE.Matrix4): THREE.Vector3 {
  const e = matrix.elements;
  const x = direction.x;
  const y = direction.y;
  const z = direction.z;
  direction.set(
    e[0] * x + e[4] * y + e[8] * z,
    e[1] * x + e[5] * y + e[9] * z,
    e[2] * x + e[6] * y + e[10] * z
  );
  return normalizeOrFallback(direction, FALLBACK_AXIS);
}

function orthogonalFallback(axis: THREE.Vector3): THREE.Vector3 {
  const normalized = normalizeOrFallback(axis.clone(), FALLBACK_AXIS);
  const candidate = Math.abs(normalized.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  return candidate.cross(normalized).normalize();
}

function getAxis(vector: THREE.Vector3, axis: 0 | 1 | 2): number {
  if (axis === 0) {
    return vector.x;
  }
  return axis === 1 ? vector.y : vector.z;
}

function setAxis(vector: THREE.Vector3, axis: 0 | 1 | 2, value: number): void {
  if (axis === 0) {
    vector.x = value;
  } else if (axis === 1) {
    vector.y = value;
  } else {
    vector.z = value;
  }
}
