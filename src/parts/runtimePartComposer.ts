import type {
  BodyAssetManifest,
  HeadAssetManifest,
} from "../data/sampleScene";
import type { RuntimeCombinedCharacterAsset } from "../engine/PjskViewerApp";

export type RuntimePartType = "body" | "head" | "hair" | "head_optional";

export type PartRegistryEntry = {
  costume3dId: number;
  partType: RuntimePartType | string;
  characterId: number;
  unit?: string | null;
  name?: string | null;
  packagePath: string;
  status?: string;
};

export type Character3dIndexEntry = {
  id: number;
  characterId: number;
  bodyCostume3dId?: number;
  headCostume3dId?: number;
  hairCostume3dId?: number;
  headOptionalCostume3dId?: number | null;
  unit?: string | null;
  name?: string | null;
};

export type Character3dIndex = {
  version?: string;
  entries?: Character3dIndexEntry[];
  character3ds?: Character3dIndexEntry[];
};

export type HeadHairCompatibility = {
  version?: string;
  allowed?: Array<{
    unit?: string | null;
    headCostume3dId: number;
    hairCostume3dId: number;
  }>;
  denied?: Array<{
    unit?: string | null;
    headCostume3dId: number;
    hairCostume3dId: number;
  }>;
};

export type PartRuntimePackage = {
  version: string;
  part: {
    costume3dId: number;
    partType: RuntimePartType | string;
    characterId: number;
    unit?: string | null;
    name?: string | null;
  };
  mount?: Record<string, unknown>;
  manifest: unknown;
  nativeMeshes?: Record<string, unknown>;
  materialSlots?: unknown[];
  textureRoles?: unknown[];
  characterTextures?: Record<string, string>;
  springBone?: Record<string, unknown>;
  morphChannelBindings?: unknown[];
  warnings?: string[];
};

export type PartPackageSet = {
  registry: PartRegistryEntry[];
  characterIndex: Character3dIndexEntry[];
  compatibility: HeadHairCompatibility | null;
  packages: Map<string, PartRuntimePackage>;
  baseUrl: string;
};

export type CustomPartSelection = {
  characterId: number;
  unit?: string | null;
  bodyCostume3dId: number;
  headCostume3dId: number;
  hairCostume3dId: number;
  headOptionalCostume3dId?: number | null;
};

export type ComposePartAssetInput = {
  partSet: PartPackageSet;
  selection: CustomPartSelection;
  activeCharacterId: number | null;
  resolveUrl: (path: string) => string;
};

type RuntimeSetup = {
  version?: string;
  prefabGraphs?: unknown[];
  rootSelectionProfile?: Record<string, unknown>;
  setupPlan?: Record<string, unknown>;
  activeRootProfile?: Record<string, unknown>;
  managers?: unknown[];
  bones?: unknown[];
  colliders?: unknown[];
  colliderBindings?: unknown[];
  managerColliderCaches?: unknown[];
  warnings?: string[];
  [key: string]: unknown;
};

export function normalizeRuntimePartType(value: string): RuntimePartType {
  const normalized = value.toLowerCase();
  if (normalized === "head_optional" || normalized === "accessory") {
    return "head_optional";
  }
  if (normalized === "body" || normalized === "head" || normalized === "hair") {
    return normalized;
  }
  throw new Error(`Unsupported runtime part type: ${value}`);
}

export function getCharacterIndexEntries(index: Character3dIndex): Character3dIndexEntry[] {
  return index.entries ?? index.character3ds ?? [];
}

export function getDefaultCustomSelection(partSet: PartPackageSet): CustomPartSelection | null {
  const preset = partSet.characterIndex.find(hasCompletePresetParts);
  if (preset) {
    return {
      characterId: preset.characterId,
      unit: preset.unit,
      bodyCostume3dId: preset.bodyCostume3dId,
      headCostume3dId: preset.headCostume3dId,
      hairCostume3dId: preset.hairCostume3dId,
      headOptionalCostume3dId: preset.headOptionalCostume3dId ?? null,
    };
  }

  const body = findFirstPart(partSet.registry, "body");
  const head = findFirstPart(partSet.registry, "head");
  const hair = findFirstPart(partSet.registry, "hair");
  if (!body || !head || !hair) {
    return null;
  }
  if (body.characterId !== head.characterId || body.characterId !== hair.characterId) {
    return null;
  }
  return {
    characterId: body.characterId,
    unit: body.unit ?? head.unit ?? hair.unit ?? null,
    bodyCostume3dId: body.costume3dId,
    headCostume3dId: head.costume3dId,
    hairCostume3dId: hair.costume3dId,
    headOptionalCostume3dId: null,
  };
}

export function listSelectableParts(
  partSet: PartPackageSet,
  characterId: number,
  partType: RuntimePartType
): PartRegistryEntry[] {
  return partSet.registry
    .filter((entry) => entry.characterId === characterId)
    .filter((entry) => normalizeRuntimePartType(entry.partType) === partType)
    .filter((entry) => entry.status !== "missing")
    .sort((left, right) => left.costume3dId - right.costume3dId);
}

export function composeRuntimeCombinedCharacterAsset(
  input: ComposePartAssetInput
): RuntimeCombinedCharacterAsset {
  const { partSet, selection, activeCharacterId, resolveUrl } = input;
  if (activeCharacterId !== null && selection.characterId !== activeCharacterId) {
    throw new Error(
      `Custom switching is limited to character ${activeCharacterId}. Reload the viewer package to switch to character ${selection.characterId}.`
    );
  }

  const body = requirePart(partSet, selection.characterId, "body", selection.bodyCostume3dId);
  const head = requirePart(partSet, selection.characterId, "head", selection.headCostume3dId);
  const hair = requirePart(partSet, selection.characterId, "hair", selection.hairCostume3dId);
  const optional = selection.headOptionalCostume3dId
    ? requirePart(partSet, selection.characterId, "head_optional", selection.headOptionalCostume3dId)
    : null;

  assertSameCharacter(selection.characterId, [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[]);
  assertHeadHairCompatible(partSet.compatibility, selection);

  const bodyManifest = normalizeBodyManifestFromPart(body, resolveUrl);
  const headManifest = normalizeHeadManifestFromParts(
    [head, hair, optional].filter(Boolean) as PartRuntimePackage[],
    selection,
    resolveUrl
  );
  const runtimeExtension = composeRuntimeExtension(
    [body, head, hair, optional].filter(Boolean) as PartRuntimePackage[],
    bodyManifest,
    headManifest
  );

  return {
    id: `custom-${selection.characterId}-${selection.bodyCostume3dId}-${selection.headCostume3dId}-${selection.hairCostume3dId}-${selection.headOptionalCostume3dId ?? "none"}`,
    displayName: `Custom ${selection.characterId}`,
    meshUrl: "",
    unityRuntimeJsonUrl: `haruki-composed://character-${selection.characterId}/unity-runtime.json`,
    unityRuntimeJsonPath: "viewer-composed-part-runtime",
    bodyAsset: bodyManifest,
    headAsset: headManifest,
    runtimeExtension,
  };
}

function findFirstPart(registry: PartRegistryEntry[], partType: RuntimePartType) {
  return registry.find((entry) => normalizeRuntimePartType(entry.partType) === partType);
}

function hasCompletePresetParts(entry: Character3dIndexEntry): entry is Character3dIndexEntry & {
  bodyCostume3dId: number;
  headCostume3dId: number;
  hairCostume3dId: number;
} {
  return typeof entry.characterId === "number" &&
    typeof entry.bodyCostume3dId === "number" &&
    typeof entry.headCostume3dId === "number" &&
    typeof entry.hairCostume3dId === "number";
}

function requirePart(
  partSet: PartPackageSet,
  characterId: number,
  partType: RuntimePartType,
  costume3dId: number
): PartRuntimePackage {
  const entry = partSet.registry.find(
    (candidate) =>
      candidate.characterId === characterId &&
      candidate.costume3dId === costume3dId &&
      normalizeRuntimePartType(candidate.partType) === partType
  );
  if (!entry) {
    throw new Error(`Missing ${partType} registry entry for character ${characterId}, costume3dId ${costume3dId}.`);
  }
  const runtime = partSet.packages.get(entry.packagePath);
  if (!runtime) {
    throw new Error(`Missing loaded part package: ${entry.packagePath}`);
  }
  return runtime;
}

function assertSameCharacter(characterId: number, packages: PartRuntimePackage[]) {
  const mismatch = packages.find((runtime) => runtime.part.characterId !== characterId);
  if (mismatch) {
    throw new Error(
      `Part ${mismatch.part.partType}/${mismatch.part.costume3dId} belongs to character ${mismatch.part.characterId}, not ${characterId}.`
    );
  }
}

function assertHeadHairCompatible(
  compatibility: HeadHairCompatibility | null,
  selection: CustomPartSelection
) {
  if (!compatibility) {
    return;
  }
  const key = compatibilityKey(selection.unit, selection.headCostume3dId, selection.hairCostume3dId);
  const denied = new Set(
    (compatibility.denied ?? []).map((entry) =>
      compatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId)
    )
  );
  if (denied.has(key)) {
    throw new Error(`Head ${selection.headCostume3dId} and hair ${selection.hairCostume3dId} are not available together.`);
  }
  if ((compatibility.allowed ?? []).length > 0) {
    const allowed = new Set(
      (compatibility.allowed ?? []).map((entry) =>
        compatibilityKey(entry.unit, entry.headCostume3dId, entry.hairCostume3dId)
      )
    );
    if (!allowed.has(key)) {
      throw new Error(`Head ${selection.headCostume3dId} and hair ${selection.hairCostume3dId} are not listed as an allowed combination.`);
    }
  }
}

function compatibilityKey(unit: string | null | undefined, headCostume3dId: number, hairCostume3dId: number) {
  return `${unit ?? ""}|${headCostume3dId}|${hairCostume3dId}`;
}

function normalizeBodyManifestFromPart(
  runtime: PartRuntimePackage,
  resolveUrl: (path: string) => string
): BodyAssetManifest {
  const manifest = cloneRecord(runtime.manifest) as BodyAssetManifest;
  manifest.id ||= `body-${runtime.part.costume3dId}`;
  manifest.displayName ||= runtime.part.name ?? manifest.id;
  manifest.characterId = String(runtime.part.characterId).padStart(2, "0");
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolveUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolveUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolveUrl)),
  };
  manifest.bodyMaterials = mergeMaterialSlots(manifest.bodyMaterials, [runtime]);
  return manifest;
}

function normalizeHeadManifestFromParts(
  runtimes: PartRuntimePackage[],
  selection: CustomPartSelection,
  resolveUrl: (path: string) => string
): HeadAssetManifest {
  const head = runtimes.find((runtime) => normalizeRuntimePartType(runtime.part.partType) === "head") ?? runtimes[0];
  const manifest = cloneRecord(head.manifest) as HeadAssetManifest;
  manifest.id = `head-${selection.headCostume3dId}-hair-${selection.hairCostume3dId}`;
  manifest.displayName = `Head ${selection.headCostume3dId} / Hair ${selection.hairCostume3dId}`;
  manifest.characterId = String(selection.characterId).padStart(2, "0");
  manifest.source = {
    ...manifest.source,
    meshUrl: resolveRequiredUrl(manifest.source?.meshUrl, resolveUrl),
    skeletonUrl: resolveMaybeUrl(manifest.source?.skeletonUrl, resolveUrl),
    animationUrls: manifest.source?.animationUrls?.map((url) => resolveRequiredUrl(url, resolveUrl)),
  };
  manifest.faceMaterials = mergeMaterialSlots(manifest.faceMaterials, runtimes);
  manifest.morphChannelBindings = runtimes.flatMap((runtime) =>
    Array.isArray(runtime.morphChannelBindings) ? runtime.morphChannelBindings : []
  ) as HeadAssetManifest["morphChannelBindings"];
  return manifest;
}

function composeRuntimeExtension(
  runtimes: PartRuntimePackage[],
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const runtimeSetup = mergeRuntimeSetup(runtimes);
  return {
    version: "0414",
    sourceKind: "viewer_composed_part_runtime_package",
    bodyAsset,
    headAsset,
    bodyManifest: bodyAsset,
    headManifest: headAsset,
    materialSlots: runtimes.flatMap((runtime) => runtime.materialSlots ?? []),
    textureRoles: runtimes.flatMap((runtime) => runtime.textureRoles ?? []),
    characterTextures: Object.assign({}, ...runtimes.map((runtime) => runtime.characterTextures ?? {})),
    nativeMeshes: mergeNativeMeshes(runtimes),
    morphChannelBindings: headAsset.morphChannelBindings ?? [],
    pjskSpringBone: {
      runtimeUnitySetup: runtimeSetup,
    },
    warnings: runtimes.flatMap((runtime) => runtime.warnings ?? []),
  };
}

function mergeRuntimeSetup(runtimes: PartRuntimePackage[]): RuntimeSetup {
  const firstSetup = getPartRuntimeSetup(runtimes[0]);
  const warnings = runtimes.flatMap((runtime) => [
    ...(runtime.warnings ?? []),
    ...((runtime.springBone?.warnings as string[] | undefined) ?? []),
  ]);
  const activeRoots = uniqueStrings(
    runtimes.flatMap((runtime) =>
      readStringArray((runtime.springBone?.activeRootProfile as Record<string, unknown> | undefined)?.activeRoots)
    )
  );
  return {
    ...firstSetup,
    version: "0414",
    prefabGraphs: runtimes
      .map((runtime) => runtime.springBone?.prefabGraph)
      .filter((value) => value !== undefined),
    rootSelectionProfile: {
      policy: "viewer_composed_active_parts",
      rootCandidates: [],
    },
    setupPlan: {
      discoveryMode: "viewer_composed_part_runtime_package",
      rootPolicy: "active_custom_parts",
      orderedSteps: [
        "load active part packages",
        "merge part native meshes",
        "merge active part springbone records",
        "reset spring runtime",
      ],
    },
    activeRootProfile: {
      defaultBodyRoot: activeRoots[0] ?? "body",
      activeRoots: activeRoots.length ? activeRoots : ["body", "face"],
      inactiveRoots: [],
    },
    managers: remapPathIds(runtimes, "managers"),
    bones: remapPathIds(runtimes, "bones"),
    colliders: remapColliderIndexes(runtimes),
    colliderBindings: runtimes.flatMap((runtime, index) =>
      cloneArrayWithPartPrefix(runtime.springBone?.colliderBindings, index)
    ),
    managerColliderCaches: runtimes.flatMap((runtime, index) =>
      cloneArrayWithPartPrefix(runtime.springBone?.managerColliderCaches, index)
    ),
    warnings,
  };
}

function getPartRuntimeSetup(runtime: PartRuntimePackage): RuntimeSetup {
  const springBone = runtime.springBone ?? {};
  return {
    managers: springBone.managers as unknown[] | undefined,
    bones: springBone.bones as unknown[] | undefined,
    colliders: springBone.colliders as unknown[] | undefined,
    colliderBindings: springBone.colliderBindings as unknown[] | undefined,
    managerColliderCaches: springBone.managerColliderCaches as unknown[] | undefined,
    activeRootProfile: springBone.activeRootProfile as Record<string, unknown> | undefined,
  };
}

function remapPathIds(runtimes: PartRuntimePackage[], field: "managers" | "bones") {
  return runtimes.flatMap((runtime, partIndex) =>
    cloneArrayWithPartPrefix(runtime.springBone?.[field], partIndex).map((entry) => {
      if (isRecord(entry) && typeof entry.pathId === "number") {
        return { ...entry, pathId: remapNumericId(entry.pathId, partIndex) };
      }
      return entry;
    })
  );
}

function remapColliderIndexes(runtimes: PartRuntimePackage[]) {
  return runtimes.flatMap((runtime, partIndex) =>
    cloneArrayWithPartPrefix(runtime.springBone?.colliders, partIndex).map((entry) => {
      if (isRecord(entry) && typeof entry.index === "number") {
        return { ...entry, index: remapNumericId(entry.index, partIndex) };
      }
      return entry;
    })
  );
}

function cloneArrayWithPartPrefix(value: unknown, partIndex: number): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (!isRecord(entry)) {
      return entry;
    }
    const cloned = { ...entry };
    if (typeof cloned.pathId === "number") {
      cloned.pathId = remapNumericId(cloned.pathId, partIndex);
    }
    if (typeof cloned.sourceSpringBonePathId === "number") {
      cloned.sourceSpringBonePathId = remapNumericId(cloned.sourceSpringBonePathId, partIndex);
    }
    if (Array.isArray(cloned.sourceColliderPathIds)) {
      cloned.sourceColliderPathIds = cloned.sourceColliderPathIds.map((id) =>
        typeof id === "number" ? remapNumericId(id, partIndex) : id
      );
    }
    return cloned;
  });
}

function remapNumericId(value: number, partIndex: number) {
  return (partIndex + 1) * 1_000_000_000 + value;
}

function mergeNativeMeshes(runtimes: PartRuntimePackage[]) {
  return {
    version: "0414",
    meshes: runtimes.flatMap((runtime) =>
      readRecordArray(runtime.nativeMeshes?.meshes)
    ),
    warnings: runtimes.flatMap((runtime) => runtime.warnings ?? []),
  };
}

function mergeMaterialSlots<T>(base: T[] | undefined, runtimes: PartRuntimePackage[]): T[] {
  const exported = runtimes.flatMap((runtime) => runtime.materialSlots ?? []) as T[];
  return exported.length ? exported : [...(base ?? [])];
}

function resolveMaybeUrl(value: string | undefined, resolveUrl: (path: string) => string) {
  return value ? resolveUrl(value) : value;
}

function resolveRequiredUrl(value: string | undefined, resolveUrl: (path: string) => string) {
  return value ? resolveUrl(value) : "";
}

function cloneRecord<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
