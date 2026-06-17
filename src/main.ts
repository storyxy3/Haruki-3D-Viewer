import "./styles/main.css";
import * as THREE from "three";
import {
  type BodyAssetManifest,
  type HeadAssetManifest,
  type Vec3,
  characterHeightMetersById,
  cloneAssemblyState,
  getBodyAsset,
  getHeadAsset,
  previewLightDefaults,
  sekaiPluginLightLocationToThreeDirection,
  sampleCatalog,
} from "./data/sampleScene";
import {
  PjskViewerApp,
  type AnimationPlaybackSnapshot,
  type BodyAnimationKind,
  type BodyAnimationSelection,
  type BodyDebugMode,
  type FaceMotionPlaybackSnapshot,
  type FaceMotionSet,
  type HairShadowMode,
  type MaterialBindingMode,
  type PartImportSnapshot,
  type RenderIsolationMode,
  type RuntimeCombinedCharacterAsset,
  type SpringBoneRuntimeSnapshot,
} from "./engine/PjskViewerApp";
import {
  characterYawDegreesByMode,
  defaultAnimationState,
  defaultRenderState,
  toonShadowSmoothByMode,
  valueShadowInfluenceByMode,
  type CharacterYawMode,
  type SpringRuntimeMode,
  type ToonShadowSmoothMode,
  type ValueShadowInfluenceMode,
} from "./config/viewerConfig";
import {
  composeRuntimeCombinedCharacterAsset,
  getCharacterIndexEntries,
  getDefaultCustomSelection,
  listSelectableParts,
  type Character3dIndex,
  type CustomPartSelection,
  type HeadHairCompatibility,
  type PartPackageSet,
  type PartRegistryEntry,
  type PartRuntimePackage,
  type RuntimePartType,
} from "./parts/runtimePartComposer";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

const previewState = { ...previewLightDefaults };
const assemblyState = cloneAssemblyState(sampleCatalog.defaultAssembly);
const initialQueryParams = new URLSearchParams(window.location.search);
let lastImportSnapshot: PartImportSnapshot | null = null;
let importRun = 0;
let lastAnimationSnapshot: AnimationPlaybackSnapshot | null = null;
let lastFaceMotionSnapshot: FaceMotionPlaybackSnapshot | null = null;
let lastSpringBoneSnapshot: SpringBoneRuntimeSnapshot | null = null;
const renderState = {
  ...defaultRenderState,
  hairShadowMode: readHairShadowMode(initialQueryParams),
};
let renderIsolationMode: RenderIsolationMode = readRenderIsolationMode(initialQueryParams);
const animationState = { ...defaultAnimationState };

type UnknownRecord = Record<string, unknown>;

type LightMotionCurve = {
  property: string;
  curveHash: number;
  pathHash: number;
  typeId: string;
  keyframes: Array<{ time: number; value: number }>;
};

type LightMotionClip = {
  name: string;
  controllerKind?: string;
  sampleRate: number;
  duration: number;
  curves: LightMotionCurve[];
};

type LightMotionSet = {
  bundlePath?: string;
  clips: LightMotionClip[];
};

type LightControllerPreview = {
  ambient?: Record<string, unknown>;
  directional?: Record<string, unknown>;
  characterAmbient?: Record<string, unknown>;
  characterRim?: Record<string, unknown>;
  unknownClips: string[];
};

const localAssetState = {
  faceMotionData: null as FaceMotionSet | null,
  faceMotionError: "" as string,
  converterFiles: [] as File[],
  converterUrlByPath: new Map<string, string>(),
  converterDisplayNameByUrl: new Map<string, string>(),
  converterBodyManifest: null as BodyAssetManifest | null,
  converterHeadManifest: null as HeadAssetManifest | null,
  converterRuntimeExtension: null as UnknownRecord | null,
  converterCombinedCharacter: null as RuntimeCombinedCharacterAsset | null,
  converterCombinedFile: null as File | null,
  converterEmbeddedFaceMotionData: null as FaceMotionSet | null,
  converterEmbeddedLightMotionData: null as LightMotionSet | null,
  converterLightControllerPreview: null as LightControllerPreview | null,
  converterBaseUrl: null as string | null,
  partPackageSet: null as PartPackageSet | null,
  customSelection: null as CustomPartSelection | null,
  activeCustomCharacterId: null as number | null,
  converterError: "" as string,
};

root.innerHTML = `
  <div class="shell">
    <aside class="panel">
      <p class="eyebrow">Standalone Prototype</p>
      <h1>Haruki 3D Viewer</h1>
      <p class="summary">
        Import a full runtime package or a Haruki part registry package.
      </p>

      <section class="group">
        <h2>Runtime Package</h2>
        <label>
          <span>Package Folder</span>
          <input id="local-converter-folder" data-local-key="converterFolder" type="file" webkitdirectory directory multiple />
        </label>
        <div class="action-row">
          <button id="clear-local-assets" class="button-secondary" type="button">
            Clear Local Output
          </button>
        </div>
        <div class="callout">
          Full package: <code>character/unity-runtime.json</code> plus <code>pjsk-sekai-runtime.extension.json</code>.<br />
          Part package: <code>parts/part-registry.json</code>.
        </div>
      </section>

      <section class="group controls">
        <h2>Custom Parts</h2>
        <label>
          <span>Body</span>
          <select id="custom-body-select"></select>
        </label>
        <label>
          <span>Head</span>
          <select id="custom-head-select"></select>
        </label>
        <label>
          <span>Hair</span>
          <select id="custom-hair-select"></select>
        </label>
        <label>
          <span>Head Optional</span>
          <select id="custom-head-optional-select"></select>
        </label>
        <div id="custom-parts-status" class="callout">
          Import a part registry package to enable same-character custom switching.
        </div>
      </section>

      <section class="group controls">
        <h2>Material Mode</h2>
        <label>
          <span>Binding Strategy</span>
          <select data-render-key="materialBindingMode">
            <option value="manifest" selected>Manifest Rebind</option>
            <option value="glb">Source Original</option>
          </select>
        </label>
        <label>
          <span>Shadow Smooth</span>
          <select data-render-key="toonShadowSmoothMode">
            <option value="auto" selected>Auto</option>
            <option value="hard">Hard 0.001</option>
            <option value="w003">0.03</option>
            <option value="w005">0.05</option>
            <option value="w008">0.08</option>
            <option value="w012">0.12</option>
          </select>
        </label>
        <label>
          <span>H.B Influence</span>
          <select data-render-key="valueShadowInfluenceMode">
            <option value="0">0</option>
            <option value="0.25">0.25</option>
            <option value="0.5">0.5</option>
            <option value="1" selected>1</option>
          </select>
        </label>
        <label>
          <span>Hair Shadow</span>
          <select data-render-key="hairShadowMode">
            <option value="light" selected>Light Driven</option>
            <option value="legacy_head">Legacy Head Shadow</option>
          </select>
        </label>
        <label>
          <span>Model Yaw</span>
          <select data-render-key="characterYawMode">
            <option value="0" selected>0 deg</option>
            <option value="45">+45 deg</option>
            <option value="-45">-45 deg</option>
            <option value="90">+90 deg</option>
          <option value="-90">-90 deg</option>
          <option value="180">180 deg</option>
          </select>
        </label>
        <label>
          <span>Render Isolation</span>
          <select data-render-key="renderIsolationMode">
            <option value="normal" selected>Normal</option>
            <option value="no_eye_through_hair">No Eye Through Hair</option>
            <option value="eye_through_hair_only">Eye Through Hair Only</option>
            <option value="eye_through_hair_eye_only">Through Hair Eye Only</option>
            <option value="eye_through_hair_eyebrow_only">Through Hair Eyebrow Only</option>
            <option value="eye_through_hair_eyelash_only">Through Hair Eyelash Only</option>
            <option value="no_eye_through_hair_eye">No Through Hair Eye</option>
            <option value="no_eye_through_hair_eyebrow">No Through Hair Eyebrow</option>
            <option value="no_eye_through_hair_eyelash">No Through Hair Eyelash</option>
            <option value="no_eye_through_hair_eyelash_overlay">No Eyelash Overlay</option>
            <option value="no_eye_through_hair_eyelash_prepass">No Eyelash Prepass</option>
            <option value="no_outline">No Outline</option>
            <option value="outline_only">Outline Only</option>
            <option value="no_face_layers">No Face Layers</option>
            <option value="no_face_outline">No Face Outline</option>
            <option value="no_hair_outline">No Hair Outline</option>
            <option value="no_body_outline">No Body Outline</option>
            <option value="eyelight_only">Eye/Eyelight Only</option>
            <option value="no_eyelight">No Eyelight</option>
            <option value="face_sdf">Face SDF Debug</option>
          </select>
        </label>
      </section>

      <section class="group controls">
        <h2>Animation</h2>
        <label>
          <span>Body Motion</span>
          <select id="animation-select"></select>
        </label>
        <label>
          <span>Body Loop Motion</span>
          <select id="animation-loop-select"></select>
        </label>
        <label>
          <span>Playback Speed</span>
          <input id="animation-speed" type="range" min="0" max="2" step="0.01" value="1" />
        </label>
        <label>
          <span>Pause</span>
          <input id="animation-paused" type="checkbox" />
        </label>
        <label>
          <span>Face Morphs</span>
          <input id="face-motion-enabled" type="checkbox" checked />
        </label>
        <label>
          <span>Head/Neck Tracks</span>
          <input id="body-head-tracks-enabled" type="checkbox" checked />
        </label>
        <label>
          <span>Spring Runtime</span>
          <select id="spring-runtime-mode">
            <option value="off">Off</option>
            <option value="unity-prefab">Unity Prefab</option>
          </select>
        </label>
        <label>
          <span>Seek Time</span>
          <input id="animation-seek" type="range" min="0" max="5" step="0.01" value="0" />
        </label>
        <div id="animation-status" class="callout">
          No body animation selected.
        </div>
      </section>

      <section class="group controls">
        <h2>SpringBone Metadata</h2>
        <div id="springbone-status" class="callout">
          Waiting for PJSK springBone metadata.
        </div>
      </section>

      <section class="group foldout">
        <details open>
          <summary><h2>Active Import</h2></summary>
          <div id="import-summary" class="stack"></div>
        </details>
      </section>

      <section class="group foldout">
        <details>
          <summary><h2>Runtime State</h2></summary>
          <pre id="assembly-json"></pre>
        </details>
      </section>
    </aside>

    <main class="stage-wrap">
      <div id="viewer" class="stage"></div>
      <div class="caption">
        Runtime package preview with optional Unity Prefab SpringBone simulation.
      </div>
    </main>
  </div>
`;

const viewerHost = document.querySelector<HTMLElement>("#viewer");

if (!viewerHost) {
  throw new Error("Missing #viewer host");
}

const viewer = new PjskViewerApp(viewerHost, previewState);
viewer.setMaterialBindingMode(renderState.materialBindingMode);
viewer.setHairShadowMode(renderState.hairShadowMode);
viewer.setToonShadowPreview(
  toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
  valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
);
viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
viewer.setRenderIsolationMode(renderIsolationMode);
const renderIsolationSelect = document.querySelector<HTMLSelectElement>(
  'select[data-render-key="renderIsolationMode"]'
);
if (renderIsolationSelect) {
  renderIsolationSelect.value = renderIsolationMode;
}
const hairShadowSelect = document.querySelector<HTMLSelectElement>(
  'select[data-render-key="hairShadowMode"]'
);
if (hairShadowSelect) {
  hairShadowSelect.value = renderState.hairShadowMode;
}

function copyBodyAsset(base: BodyAssetManifest): BodyAssetManifest {
  return {
    ...base,
    characterId: base.characterId,
    characterHeightMeters: base.characterHeightMeters,
    source: {
      ...base.source,
      animationUrls: base.source.animationUrls
        ? [...base.source.animationUrls]
        : undefined,
    },
    neckAnchor: { ...base.neckAnchor },
    skeleton: {
      ...base.skeleton,
      neckAttach: { ...base.skeleton.neckAttach },
    },
    bodyMaterials: base.bodyMaterials.map((entry) => ({ ...entry })),
    proxy: { ...base.proxy },
  };
}

function copyHeadAsset(base: HeadAssetManifest): HeadAssetManifest {
  return {
    ...base,
    characterId: base.characterId,
    characterHeightMeters: base.characterHeightMeters,
    source: {
      ...base.source,
      animationUrls: base.source.animationUrls
        ? [...base.source.animationUrls]
        : undefined,
    },
    rawImportOffset: { ...base.rawImportOffset },
    assembly: {
      ...base.assembly,
      attachOrigin: { ...base.assembly.attachOrigin },
      boneRemap: base.assembly.boneRemap
        ? { ...base.assembly.boneRemap }
        : undefined,
    },
    faceMaterials: base.faceMaterials.map((entry) => ({ ...entry })),
    morphChannels: base.morphChannels ? [...base.morphChannels] : undefined,
    morphChannelBindings: base.morphChannelBindings
      ? base.morphChannelBindings.map((entry) => ({ ...entry }))
      : undefined,
    proxy: { ...base.proxy },
  };
}

function asRecord(value: unknown): UnknownRecord {
  return (value && typeof value === "object" ? value : {}) as UnknownRecord;
}

function readString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}


function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeCharacterId(value: unknown) {
  const raw = readString(value).trim();
  if (!raw) {
    return undefined;
  }
  return raw.padStart(2, "0");
}

function inferCharacterIdFromText(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const match = value.match(/characterv2[_/-](\d{1,2})\b/i)
    ?? value.match(/\b(?:body|head|face)-(\d{1,2})\b/i);
  return match ? match[1].padStart(2, "0") : undefined;
}

function resolveCharacterHeightMeters(
  explicit: unknown,
  characterId: string | undefined
) {
  const value = readNumber(explicit, Number.NaN);
  if (Number.isFinite(value) && value > 0) {
    return value > 10 ? value / 100 : value;
  }
  return characterId ? characterHeightMetersById[characterId] : undefined;
}

function applyPreviewCharacterHeightFromAssets(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const nextHeight =
    bodyAsset.characterHeightMeters ??
    headAsset.characterHeightMeters ??
    previewLightDefaults.characterHeight;
  if (Math.abs(previewState.characterHeight - nextHeight) < 0.0001) {
    return;
  }
  previewState.characterHeight = nextHeight;
  viewer.updatePreviewLight(previewState);
}

function readMaterialLighting(value: unknown) {
  const record = asRecord(value);
  return {
    specularPower: readNumber(record.specularPower ?? record.SpecularPower, 0),
    rimThreshold: readNumber(record.rimThreshold ?? record.RimThreshold, 0.2),
    shadowTexWeight: readNumber(record.shadowTexWeight ?? record.ShadowTexWeight, 1),
    saturation: readNumber(record.saturation ?? record.Saturation, 0.5),
    partsAmbientColor: readString(record.partsAmbientColor ?? record.PartsAmbientColor, "#ffffff"),
    reflectionBlendColor: readString(record.reflectionBlendColor ?? record.ReflectionBlendColor, "#ffffff"),
    outlineWidth: readNumber(record.outlineWidth ?? record.OutlineWidth, 0.001),
    outlineOffset: readNumber(record.outlineOffset ?? record.OutlineOffset, 0),
    outlineLightness: readNumber(record.outlineLightness ?? record.OutlineLightness, 0.5),
    shadowWidth: readNumber(record.shadowWidth ?? record.ShadowWidth, 0),
    useOutlineSecondNormal: readNumber(record.useOutlineSecondNormal ?? record.UseOutlineSecondNormal, 0),
    distortionFps: readNumber(record.distortionFps ?? record.DistortionFps, 12),
    distortionIntensity: readNumber(record.distortionIntensity ?? record.DistortionIntensity, 0),
    distortionIntensityX: readNumber(record.distortionIntensityX ?? record.DistortionIntensityX, 0),
    distortionIntensityY: readNumber(record.distortionIntensityY ?? record.DistortionIntensityY, 0),
    distortionOffsetX: readNumber(record.distortionOffsetX ?? record.DistortionOffsetX, 0),
    distortionOffsetY: readNumber(record.distortionOffsetY ?? record.DistortionOffsetY, 0),
    distortionScrollSpeed: readNumber(record.distortionScrollSpeed ?? record.DistortionScrollSpeed, 1),
    distortionScrollX: readNumber(record.distortionScrollX ?? record.DistortionScrollX, 0),
    distortionScrollY: readNumber(record.distortionScrollY ?? record.DistortionScrollY, 0),
    distortionTexTilingX: readNumber(record.distortionTexTilingX ?? record.DistortionTexTilingX, 1),
    distortionTexTilingY: readNumber(record.distortionTexTilingY ?? record.DistortionTexTilingY, 1),
    threshold: readNumber(record.threshold ?? record.Threshold, 0.5),
    lightInfluence: readNumber(record.lightInfluence ?? record.LightInfluence, 1),
    lightInfluenceForEyeHighlight: readNumber(record.lightInfluenceForEyeHighlight ?? record.LightInfluenceForEyeHighlight, 1),
  };
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readUnknownArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readVec3Record(value: unknown, fallback: Vec3): Vec3 {
  const record = asRecord(value);
  const readNumber = (camel: string, pascal: string, defaultValue: number) => {
    const next = record[camel] ?? record[pascal];
    return typeof next === "number" ? next : defaultValue;
  };
  return {
    x: readNumber("x", "X", fallback.x),
    y: readNumber("y", "Y", fallback.y),
    z: readNumber("z", "Z", fallback.z),
  };
}

function normalizeBodyManifest(raw: unknown): BodyAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const skeleton = asRecord(record.skeleton ?? record.Skeleton);
  const neckAttach = asRecord(skeleton.neckAttach ?? skeleton.NeckAttach);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const bodyMaterialsRaw: unknown[] = Array.isArray(
    record.bodyMaterials ?? record.BodyMaterials
  )
    ? ((record.bodyMaterials ?? record.BodyMaterials) as unknown[])
    : [];

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId: normalizeCharacterId(record.characterId ?? record.CharacterId)
      ?? inferCharacterIdFromText(readString(skeleton.skeletonId ?? skeleton.SkeletonId)),
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      normalizeCharacterId(record.characterId ?? record.CharacterId)
        ?? inferCharacterIdFromText(readString(skeleton.skeletonId ?? skeleton.SkeletonId))
    ),
    materialPipeline: readString(
      record.materialPipeline ?? record.MaterialPipeline,
      "embedded"
    ) as BodyAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: readString(source.meshUrl ?? source.MeshUrl),
      skeletonUrl: readString(source.skeletonUrl ?? source.SkeletonUrl) || undefined,
      animationUrls: readStringArray(source.animationUrls ?? source.AnimationUrls),
    },
    neckAnchor: readVec3Record(record.neckAnchor ?? record.NeckAnchor, {
      x: 0,
      y: 1.75,
      z: 0.15,
    }),
    skeleton: {
      skeletonId: readString(skeleton.skeletonId ?? skeleton.SkeletonId),
      rootNodeName:
        readString(skeleton.rootNodeName ?? skeleton.RootNodeName) || undefined,
      neckAttach: {
        nodeName:
          readString(neckAttach.nodeName ?? neckAttach.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          neckAttach.fallbackPosition ?? neckAttach.FallbackPosition,
          { x: 0, y: 1.75, z: 0.15 }
        ),
      },
    },
    bodyMaterials: bodyMaterialsRaw.map((entry: unknown) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName:
          readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind:
          readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: readString(slot.mainTex ?? slot.MainTex) || undefined,
        shadowTex: readString(slot.shadowTex ?? slot.ShadowTex) || undefined,
        valueTex: readString(slot.valueTex ?? slot.ValueTex) || undefined,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      bodyColor: readString(proxy.bodyColor ?? proxy.BodyColor, "#f2d0c3"),
      shadowColor: readString(proxy.shadowColor ?? proxy.ShadowColor, "#bf958a"),
      bodyScale:
        typeof (proxy.bodyScale ?? proxy.BodyScale) === "number"
          ? Number(proxy.bodyScale ?? proxy.BodyScale)
          : 1,
      torsoLength:
        typeof (proxy.torsoLength ?? proxy.TorsoLength) === "number"
          ? Number(proxy.torsoLength ?? proxy.TorsoLength)
          : 2.2,
      shoulderWidth:
        typeof (proxy.shoulderWidth ?? proxy.ShoulderWidth) === "number"
          ? Number(proxy.shoulderWidth ?? proxy.ShoulderWidth)
          : 1.1,
    },
  };
}

function normalizeHeadManifest(raw: unknown): HeadAssetManifest {
  const record = asRecord(raw);
  const source = asRecord(record.source ?? record.Source);
  const assembly = asRecord(record.assembly ?? record.Assembly);
  const attachOrigin = asRecord(assembly.attachOrigin ?? assembly.AttachOrigin);
  const boneRemapRecord = asRecord(assembly.boneRemap ?? assembly.BoneRemap);
  const proxy = asRecord(record.proxy ?? record.Proxy);
  const faceMaterialsRaw: unknown[] = Array.isArray(
    record.faceMaterials ?? record.FaceMaterials
  )
    ? ((record.faceMaterials ?? record.FaceMaterials) as unknown[])
    : [];

  return {
    id: readString(record.id ?? record.Id),
    displayName: readString(record.displayName ?? record.DisplayName),
    characterId: normalizeCharacterId(record.characterId ?? record.CharacterId)
      ?? inferCharacterIdFromText(readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId)),
    characterHeightMeters: resolveCharacterHeightMeters(
      record.characterHeightMeters ?? record.CharacterHeightMeters ?? record.height ?? record.Height,
      normalizeCharacterId(record.characterId ?? record.CharacterId)
        ?? inferCharacterIdFromText(readString(assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId))
    ),
    materialPipeline: readString(
      record.materialPipeline ?? record.MaterialPipeline,
      "embedded"
    ) as HeadAssetManifest["materialPipeline"],
    source: {
      bundleRoot: readString(source.bundleRoot ?? source.BundleRoot),
      manifestUrl: readString(source.manifestUrl ?? source.ManifestUrl),
      meshUrl: readString(source.meshUrl ?? source.MeshUrl),
      skeletonUrl: readString(source.skeletonUrl ?? source.SkeletonUrl) || undefined,
      animationUrls: readStringArray(source.animationUrls ?? source.AnimationUrls),
    },
    rawImportOffset: readVec3Record(
      record.rawImportOffset ?? record.RawImportOffset,
      { x: 0, y: 0, z: 0 }
    ),
    assembly: {
      expectedSkeletonId: readString(
        assembly.expectedSkeletonId ?? assembly.ExpectedSkeletonId
      ),
      attachOrigin: {
        nodeName:
          readString(attachOrigin.nodeName ?? attachOrigin.NodeName) || undefined,
        fallbackPosition: readVec3Record(
          attachOrigin.fallbackPosition ?? attachOrigin.FallbackPosition,
          { x: 0, y: 0.08, z: 0.02 }
        ),
      },
      rootNodeName:
        readString(assembly.rootNodeName ?? assembly.RootNodeName) || undefined,
      boneRemap: Object.fromEntries(
        Object.entries(boneRemapRecord).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
    },
    defaultFaceMode: readString(
      record.defaultFaceMode ?? record.DefaultFaceMode,
      "clean"
    ) as HeadAssetManifest["defaultFaceMode"],
    morphChannels: readStringArray(record.morphChannels ?? record.MorphChannels),
    morphChannelBindings: Array.isArray(record.morphChannelBindings ?? record.MorphChannelBindings)
      ? ((record.morphChannelBindings ?? record.MorphChannelBindings) as unknown[])
          .map((entry) => asRecord(entry))
          .filter((entry) => typeof entry.nameHash === "number" || typeof entry.NameHash === "number")
          .map((entry) => ({
            name: readString(entry.name ?? entry.Name),
            sourceName: readString(entry.sourceName ?? entry.SourceName),
            nameHash: Number(entry.nameHash ?? entry.NameHash),
            curveHash: Number(entry.curveHash ?? entry.CurveHash),
          }))
      : undefined,
    faceMaterials: faceMaterialsRaw.map((entry: unknown) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName:
          readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind:
          readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: readString(slot.mainTex ?? slot.MainTex) || undefined,
        shadowTex: readString(slot.shadowTex ?? slot.ShadowTex) || undefined,
        valueTex: readString(slot.valueTex ?? slot.ValueTex) || undefined,
        faceShadowTex:
          readString(slot.faceShadowTex ?? slot.FaceShadowTex) || undefined,
        mode: readString(slot.mode ?? slot.Mode, "clean") as HeadAssetManifest["defaultFaceMode"],
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    }),
    proxy: {
      faceColor: readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9"),
      faceShadeColor: readString(
        proxy.faceShadeColor ?? proxy.FaceShadeColor,
        "#f7cdbf"
      ),
      skinColorDefault: readString(
        proxy.skinColorDefault ?? proxy.SkinColorDefault,
        readString(proxy.faceColor ?? proxy.FaceColor, "#fde2d9")
      ),
      skinColor1: readString(
        proxy.skinColor1 ?? proxy.SkinColor1,
        readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")
      ),
      skinColor2: readString(
        proxy.skinColor2 ?? proxy.SkinColor2,
        readString(proxy.faceShadeColor ?? proxy.FaceShadeColor, "#f7cdbf")
      ),
      hairColor: readString(proxy.hairColor ?? proxy.HairColor, "#7b5b4a"),
      hairShadowColor: readString(
        proxy.hairShadowColor ?? proxy.HairShadowColor,
        "#513d33"
      ),
      headRadius:
        typeof (proxy.headRadius ?? proxy.HeadRadius) === "number"
          ? Number(proxy.headRadius ?? proxy.HeadRadius)
          : 0.74,
      faceDepth:
        typeof (proxy.faceDepth ?? proxy.FaceDepth) === "number"
          ? Number(proxy.faceDepth ?? proxy.FaceDepth)
          : 0.82,
      hairArc:
        typeof (proxy.hairArc ?? proxy.HairArc) === "number"
          ? Number(proxy.hairArc ?? proxy.HairArc)
          : 0.98,
    },
  };
}

function getNormalizedRelativePath(file: File) {
  const raw = file.webkitRelativePath || file.name;
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : normalized;
}

function findConverterUrl(path: string | undefined) {
  if (!path) {
    return null;
  }
  const normalized = path.replace(/\\/g, "/");
  const exact = localAssetState.converterUrlByPath.get(normalized);
  if (exact) {
    return exact;
  }

  const basename = normalized.split("/").pop() ?? normalized;
  const byBasename = localAssetState.converterUrlByPath.get(basename);
  if (byBasename) {
    return byBasename;
  }

  for (const [candidate, url] of localAssetState.converterUrlByPath) {
    if (
      candidate === normalized ||
      candidate.endsWith(`/${normalized}`) ||
      normalized.endsWith(`/${candidate}`)
    ) {
      return url;
    }
  }
  return localAssetState.converterBaseUrl
    ? resolveConverterBaseUrl(localAssetState.converterBaseUrl, normalized)
    : null;
}

function resolveConverterPath(path: string | undefined) {
  if (!path) {
    return path;
  }
  return findConverterUrl(path) ?? path;
}

function resolveConverterBaseUrl(baseUrl: string, relativePath: string) {
  const base = new URL(baseUrl, window.location.href);
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  const normalized = relativePath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return new URL(normalized, base).toString();
}

function normalizeRuntimeBodyManifest(raw: unknown): BodyAssetManifest {
  const manifest = normalizeBodyManifest(raw);
  return {
    ...manifest,
    source: {
      ...manifest.source,
      meshUrl: resolveConverterPath(manifest.source.meshUrl) ?? manifest.source.meshUrl,
      skeletonUrl: resolveConverterPath(manifest.source.skeletonUrl),
      animationUrls: manifest.source.animationUrls?.map((path) => resolveConverterPath(path) ?? path),
    },
  };
}

function normalizeRuntimeHeadManifest(raw: unknown): HeadAssetManifest {
  const manifest = normalizeHeadManifest(raw);
  return {
    ...manifest,
    source: {
      ...manifest.source,
      meshUrl: resolveConverterPath(manifest.source.meshUrl) ?? manifest.source.meshUrl,
      skeletonUrl: resolveConverterPath(manifest.source.skeletonUrl),
      animationUrls: manifest.source.animationUrls?.map((path) => resolveConverterPath(path) ?? path),
    },
  };
}

function applyRuntimeMaterialSlots(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest,
  runtimeExtension: UnknownRecord
) {
  const materialSlots = asRecord(runtimeExtension.materialSlots ?? runtimeExtension.MaterialSlots);
  const bodySlots = readUnknownArray(materialSlots.body ?? materialSlots.Body);
  const headSlots = readUnknownArray(materialSlots.head ?? materialSlots.Head);
  const accessorySlots = readUnknownArray(
    materialSlots.accessory ?? materialSlots.Accessory
  );

  if (bodySlots.length) {
    bodyAsset.bodyMaterials = bodySlots.map((entry) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind: readString(slot.materialKind ?? slot.MaterialKind) || undefined,
        mainTex: resolveConverterPath(readString(slot.mainTex ?? slot.MainTex)) || undefined,
        shadowTex: resolveConverterPath(readString(slot.shadowTex ?? slot.ShadowTex)) || undefined,
        valueTex: resolveConverterPath(readString(slot.valueTex ?? slot.ValueTex)) || undefined,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
    });
  }

  const readHeadMaterialSlot = (
    entry: unknown,
    fallbackMaterialKind?: string
  ) => {
      const slot = asRecord(entry);
      return {
        meshName: readString(slot.meshName ?? slot.MeshName),
        materialName: readString(slot.materialName ?? slot.MaterialName) || undefined,
        materialKind:
          readString(slot.materialKind ?? slot.MaterialKind) ||
          fallbackMaterialKind ||
          undefined,
        mainTex: resolveConverterPath(readString(slot.mainTex ?? slot.MainTex)) || undefined,
        shadowTex: resolveConverterPath(readString(slot.shadowTex ?? slot.ShadowTex)) || undefined,
        valueTex: resolveConverterPath(readString(slot.valueTex ?? slot.ValueTex)) || undefined,
        faceShadowTex:
          resolveConverterPath(readString(slot.faceShadowTex ?? slot.FaceShadowTex)) || undefined,
        mode: headAsset.defaultFaceMode,
        lighting: readMaterialLighting(slot.lighting ?? slot.Lighting),
      };
  };

  if (headSlots.length || accessorySlots.length) {
    headAsset.faceMaterials = [
      ...(headSlots.length
        ? headSlots.map((entry) => readHeadMaterialSlot(entry))
        : headAsset.faceMaterials),
      ...accessorySlots.map((entry) => readHeadMaterialSlot(entry, "accessory")),
    ];
  }
}

function normalizeRuntimeExtension(raw: unknown) {
  const extension = asRecord(raw);
  const bodyAsset = normalizeRuntimeBodyManifest(extension.bodyManifest ?? extension.BodyManifest);
  const headAsset = normalizeRuntimeHeadManifest(extension.headManifest ?? extension.HeadManifest);
  applyRuntimeMaterialSlots(bodyAsset, headAsset, extension);
  return {
    extension,
    bodyAsset,
    headAsset,
  };
}

async function normalizeRuntimeWithUnityRuntimeJson(
  runtimeExtension: UnknownRecord,
  unityRuntimeJsonUrl: string | null | undefined
) {
  if (!unityRuntimeJsonUrl) {
    return normalizeRuntimeExtension(runtimeExtension);
  }
  const unityRuntimeExtension = asRecord(await fetchRuntimeJson(unityRuntimeJsonUrl));
  return normalizeRuntimeExtension({
    ...unityRuntimeExtension,
    ...runtimeExtension,
    bodyManifest:
      runtimeExtension.bodyManifest ??
      runtimeExtension.BodyManifest ??
      unityRuntimeExtension.bodyManifest ??
      unityRuntimeExtension.BodyManifest,
    headManifest:
      runtimeExtension.headManifest ??
      runtimeExtension.HeadManifest ??
      unityRuntimeExtension.headManifest ??
      unityRuntimeExtension.HeadManifest,
    materialSlots:
      runtimeExtension.materialSlots ??
      runtimeExtension.MaterialSlots ??
      unityRuntimeExtension.materialSlots ??
      unityRuntimeExtension.MaterialSlots,
  });
}

function readRuntimePreviewLight(extension: UnknownRecord) {
  const profile = asRecord(
    extension.sekaiRuntimeMaterialProfile ?? extension.SekaiRuntimeMaterialProfile
  );
  const preview = asRecord(
    profile.viewerTunedPreview ?? profile.ViewerTunedPreview
  );
  const pluginPreview = asRecord(
    profile.pluginPreview ?? profile.PluginPreview
  );
  const hasPreview = Object.keys(preview).length > 0;
  const hasPluginPreview = Object.keys(pluginPreview).length > 0;
  if (!hasPreview && !hasPluginPreview) {
    return null;
  }
  const pluginDirectionalLocation = readVec3Record(
    pluginPreview.directionalLocation ?? pluginPreview.DirectionalLocation,
    {
      x: previewState.x,
      y: -previewState.z,
      z: previewState.y,
    }
  );
  const pluginLightDirection =
    sekaiPluginLightLocationToThreeDirection(pluginDirectionalLocation);
  const readProfileNumber = (
    previewCamel: string,
    previewPascal: string,
    pluginCamel: string,
    pluginPascal: string,
    fallback: number
  ) =>
    readNumber(
      preview[previewCamel] ?? preview[previewPascal],
      readNumber(pluginPreview[pluginCamel] ?? pluginPreview[pluginPascal], fallback)
    );
  return {
    x: readNumber(preview.x ?? preview.X, pluginLightDirection.x),
    y: readNumber(preview.y ?? preview.Y, pluginLightDirection.y),
    z: readNumber(preview.z ?? preview.Z, pluginLightDirection.z),
    intensity: readProfileNumber("intensity", "Intensity", "directionalEnergy", "DirectionalEnergy", previewState.intensity),
    ambient: readProfileNumber("ambient", "Ambient", "ambientIntensity", "AmbientIntensity", previewState.ambient),
    shadowThreshold: readProfileNumber("shadowThreshold", "ShadowThreshold", "shadowThreshold", "ShadowThreshold", previewState.shadowThreshold),
    shadowWeight: readProfileNumber("shadowWeight", "ShadowWeight", "shadowWeight", "ShadowWeight", previewState.shadowWeight),
    characterAmbient: readProfileNumber(
      "characterAmbient",
      "CharacterAmbient",
      "characterAmbientIntensity",
      "CharacterAmbientIntensity",
      previewState.characterAmbient
    ),
    rimIntensity: readProfileNumber("rimIntensity", "RimIntensity", "rimIntensity", "RimIntensity", previewState.rimIntensity),
    rimThreshold: readProfileNumber("rimThreshold", "RimThreshold", "rimThreshold", "RimThreshold", previewState.rimThreshold),
    rimDirectionality: readProfileNumber(
      "rimDirectionality",
      "RimDirectionality",
      "rimDirectionality",
      "RimDirectionality",
      previewState.rimDirectionality
    ),
    faceSoftness: readNumber(preview.faceSoftness ?? preview.FaceSoftness, previewState.faceSoftness),
    faceSdfUseLightDirection: readNumber(
      preview.faceSdfUseLightDirection ?? preview.FaceSdfUseLightDirection,
      previewState.faceSdfUseLightDirection
    ),
    characterHeight: readNumber(
      preview.characterHeight ?? preview.CharacterHeight,
      previewState.characterHeight
    ),
  };
}

function readRuntimeMotionPackage(extension: UnknownRecord) {
  return asRecord(extension.motionPackage ?? extension.MotionPackage);
}

function readEmbeddedFaceMotion(extension: UnknownRecord): FaceMotionSet | null {
  const motionPackage = readRuntimeMotionPackage(extension);
  const faceMotion = motionPackage.faceMotion ?? motionPackage.FaceMotion;
  if (!faceMotion) {
    return null;
  }
  return faceMotion as FaceMotionSet;
}

function readEmbeddedLightMotion(extension: UnknownRecord): LightMotionSet | null {
  const motionPackage = readRuntimeMotionPackage(extension);
  const lightMotion = motionPackage.lightMotion ?? motionPackage.LightMotion;
  if (!lightMotion) {
    return null;
  }
  return lightMotion as LightMotionSet;
}

function readFirstLightValue(clip: LightMotionClip, property: string) {
  const curve = clip.curves.find((entry) => entry.property === property);
  const value = curve?.keyframes[0]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatColorChannel(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
}

function readFirstLightColor(clip: LightMotionClip, prefix: string) {
  const r = readFirstLightValue(clip, `${prefix}.r`);
  const g = readFirstLightValue(clip, `${prefix}.g`);
  const b = readFirstLightValue(clip, `${prefix}.b`);
  if (r === null || g === null || b === null) {
    return null;
  }
  return `#${formatColorChannel(r)}${formatColorChannel(g)}${formatColorChannel(b)}`;
}

function readFirstLightVector(clip: LightMotionClip, prefix: string): Vec3 | null {
  const x = readFirstLightValue(clip, `${prefix}.x`);
  const y = readFirstLightValue(clip, `${prefix}.y`);
  const z = readFirstLightValue(clip, `${prefix}.z`);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { x, y, z };
}

function buildLightControllerPreview(lightMotion: LightMotionSet | null): LightControllerPreview | null {
  if (!lightMotion?.clips.length) {
    return null;
  }
  const preview: LightControllerPreview = { unknownClips: [] };
  for (const clip of lightMotion.clips) {
    const controllerKind = clip.controllerKind ?? "unknown";
    switch (controllerKind) {
      case "ambient":
        preview.ambient = {
          clip: clip.name,
          intensity: readFirstLightValue(clip, "intensity"),
          ambientColor: readFirstLightColor(clip, "ambientColor"),
        };
        break;
      case "directional":
        preview.directional = {
          clip: clip.name,
          shadowColor: readFirstLightColor(clip, "shadowColor"),
          outlineColor: readFirstLightColor(clip, "outlineColor"),
          outlineBlending: readFirstLightValue(clip, "outlineBlending"),
          rotationEuler: readFirstLightVector(clip, "rotationEuler"),
          faceShadowLimitRange: readFirstLightValue(clip, "faceShadowLimitRange"),
          useFaceShadowLimiter: readFirstLightValue(clip, "useFaceShadowLimiter"),
          hasRotationEuler: clip.curves.some((curve) =>
            curve.property === "rotationEuler" || curve.property.startsWith("rotationEuler.")
          ),
        };
        break;
      case "character_ambient":
        preview.characterAmbient = {
          clip: clip.name,
          intensity: readFirstLightValue(clip, "intensity"),
          ambientColor: readFirstLightColor(clip, "ambientColor"),
        };
        break;
      case "character_rim":
        preview.characterRim = {
          clip: clip.name,
          rimColor: readFirstLightColor(clip, "rimColor"),
          shadowRimColor: readFirstLightColor(clip, "shadowRimColor"),
          lightInfluence: readFirstLightValue(clip, "lightInfluence"),
          edgeSmoothness: readFirstLightValue(clip, "edgeSmoothness"),
          shadowSharpness: readFirstLightValue(clip, "shadowSharpness"),
          isUseShadowColor: readFirstLightValue(clip, "isUseShadowColor"),
        };
        break;
      default:
        preview.unknownClips.push(formatLightMotionClip(clip));
        break;
    }
  }
  return preview;
}

function readOptionalLightNumber(value: unknown) {
  const next = readNumber(value, Number.NaN);
  return Number.isFinite(next) ? next : null;
}

function clampLightControllerValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function readOptionalVec3Record(value: unknown): Vec3 | null {
  const record = asRecord(value);
  const x = readOptionalLightNumber(record.x ?? record.X);
  const y = readOptionalLightNumber(record.y ?? record.Y);
  const z = readOptionalLightNumber(record.z ?? record.Z);
  if (x === null || y === null || z === null) {
    return null;
  }
  return { x, y, z };
}

function eulerDegreesToViewerLightDirection(euler: Vec3): Vec3 {
  const direction = new THREE.Vector3(0, 0, 1)
    .applyEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(euler.x),
        THREE.MathUtils.degToRad(euler.y),
        THREE.MathUtils.degToRad(euler.z),
        "XYZ"
      )
    )
    .normalize();
  return { x: direction.x, y: direction.y, z: direction.z };
}

function applyLightControllerPreview(preview: LightControllerPreview | null) {
  const directionalShadowColor = readString(preview?.directional?.shadowColor);
  viewer.updateGlobalShadowColor(directionalShadowColor || "#ffffff");
  const ambientColor =
    readString(preview?.characterAmbient?.ambientColor) ||
    readString(preview?.ambient?.ambientColor) ||
    null;
  const isUseShadowColor = readOptionalLightNumber(preview?.characterRim?.isUseShadowColor);
  const shadowRimColor =
    isUseShadowColor === null || isUseShadowColor > 0.5
      ? readString(preview?.characterRim?.shadowRimColor) || null
      : null;
  viewer.updateLightControllerColors({
    ambientColor,
    rimColor: readString(preview?.characterRim?.rimColor) || null,
    shadowRimColor,
  });
  viewer.updateLightControllerRimShape({
    edgeSmoothness: readOptionalLightNumber(preview?.characterRim?.edgeSmoothness),
    shadowSharpness: readOptionalLightNumber(preview?.characterRim?.shadowSharpness),
  });
  viewer.updateLightControllerOutline({
    color: readString(preview?.directional?.outlineColor) || null,
    blending: readOptionalLightNumber(preview?.directional?.outlineBlending),
  });

  let previewLightChanged = false;
  const rotationEuler = readOptionalVec3Record(preview?.directional?.rotationEuler);
  if (rotationEuler) {
    const direction = eulerDegreesToViewerLightDirection(rotationEuler);
    previewState.x = direction.x;
    previewState.y = direction.y;
    previewState.z = direction.z;
    previewLightChanged = true;
  }

  const ambientIntensity = readOptionalLightNumber(preview?.ambient?.intensity);
  if (ambientIntensity !== null) {
    previewState.ambient = clampLightControllerValue(
      previewState.ambient * Math.max(ambientIntensity, 0),
      0,
      0.8
    );
    previewLightChanged = true;
  }

  const characterAmbientIntensity = readOptionalLightNumber(
    preview?.characterAmbient?.intensity
  );
  if (characterAmbientIntensity !== null) {
    previewState.characterAmbient = clampLightControllerValue(
      previewState.characterAmbient * Math.max(characterAmbientIntensity, 0),
      0,
      1
    );
    previewLightChanged = true;
  }

  const rimLightInfluence = readOptionalLightNumber(
    preview?.characterRim?.lightInfluence
  );
  if (rimLightInfluence !== null) {
    previewState.rimIntensity = clampLightControllerValue(
      previewState.rimIntensity * Math.max(rimLightInfluence, 0),
      0,
      1.5
    );
    previewLightChanged = true;
  }

  const faceShadowLimitRange = readOptionalLightNumber(
    preview?.directional?.faceShadowLimitRange
  );
  const useFaceShadowLimiter = readOptionalLightNumber(
    preview?.directional?.useFaceShadowLimiter
  );
  if (
    faceShadowLimitRange !== null &&
    (useFaceShadowLimiter === null || useFaceShadowLimiter > 0.5)
  ) {
    previewState.faceSdfUseLightDirection = clampLightControllerValue(
      faceShadowLimitRange,
      0,
      1
    );
    previewLightChanged = true;
  }

  if (previewLightChanged) {
    viewer.updatePreviewLight(previewState);
  }
}

function readEmbeddedUnityMotionPath(extension: UnknownRecord) {
  const motionPackage = readRuntimeMotionPackage(extension);
  return readString(motionPackage.unityMotionJson ?? motionPackage.UnityMotionJson) || null;
}

function readUnityRuntimeJsonPath(extension: UnknownRecord) {
  const container = asRecord(extension.container ?? extension.Container);
  return readString(container.unityRuntimeJson ?? container.UnityRuntimeJson) || null;
}

function findRuntimeExtensionCandidate(files: File[]) {
  return files.find((file) => /pjsk-sekai-runtime\.extension\.json$/i.test(file.name)) ?? null;
}

function findPartRegistryCandidate(files: File[]) {
  return files.find((file) => /(?:^|\/)parts\/part-registry\.json$/i.test(getNormalizedRelativePath(file)))
    ?? files.find((file) => /^part-registry\.json$/i.test(file.name))
    ?? null;
}

function findCombinedCharacterFile(files: File[]) {
  void files;
  return null;
}

function resetRuntimePackageState() {
  localAssetState.converterBodyManifest = null;
  localAssetState.converterHeadManifest = null;
  localAssetState.converterRuntimeExtension = null;
  localAssetState.converterCombinedCharacter = null;
  localAssetState.converterCombinedFile = null;
  localAssetState.converterEmbeddedFaceMotionData = null;
  localAssetState.converterEmbeddedLightMotionData = null;
  localAssetState.converterLightControllerPreview = null;
  localAssetState.partPackageSet = null;
  localAssetState.customSelection = null;
  localAssetState.activeCustomCharacterId = null;
}

async function parsePartRegistryFolder(files: File[], registryFile: File) {
  const registry = await parseJsonFile<PartRegistryEntry[]>(registryFile);
  const characterIndexFile = files.find((file) =>
    /(?:^|\/)character3d-index\.json$/i.test(getNormalizedRelativePath(file))
  );
  const compatibilityFile = files.find((file) =>
    /(?:^|\/)head-hair-compatibility\.json$/i.test(getNormalizedRelativePath(file))
  );
  const characterIndex = characterIndexFile
    ? getCharacterIndexEntries(await parseJsonFile<Character3dIndex>(characterIndexFile))
    : [];
  const compatibility = compatibilityFile
    ? await parseJsonFile<HeadHairCompatibility>(compatibilityFile)
    : null;
  const packages = new Map<string, PartRuntimePackage>();
  for (const entry of registry) {
    const path = `${entry.packagePath.replace(/\/+$/, "")}/part-runtime.json`;
    const file = files.find((candidate) => {
      const relativePath = getNormalizedRelativePath(candidate);
      return relativePath === path || relativePath.endsWith(`/${path}`);
    });
    if (file) {
      packages.set(entry.packagePath, await parseJsonFile<PartRuntimePackage>(file));
    }
  }
  return buildPartPackageSet(registry, characterIndex, compatibility, packages, "");
}

async function parsePartRegistryBaseUrl(baseUrl: string) {
  const registry = await fetchRuntimeJson(
    resolveConverterBaseUrl(baseUrl, "parts/part-registry.json")
  ) as PartRegistryEntry[];
  const characterIndex = await fetchOptionalJson<Character3dIndex>(
    resolveConverterBaseUrl(baseUrl, "character3d-index.json")
  );
  const compatibility = await fetchOptionalJson<HeadHairCompatibility>(
    resolveConverterBaseUrl(baseUrl, "parts/head-hair-compatibility.json")
  );
  const packages = new Map<string, PartRuntimePackage>();
  await Promise.all(registry.map(async (entry) => {
    const runtime = await fetchRuntimeJson(
      resolveConverterBaseUrl(baseUrl, `${entry.packagePath}/part-runtime.json`)
    ) as PartRuntimePackage;
    packages.set(entry.packagePath, runtime);
  }));
  return buildPartPackageSet(
    registry,
    characterIndex ? getCharacterIndexEntries(characterIndex) : [],
    compatibility,
    packages,
    baseUrl
  );
}

function buildPartPackageSet(
  registry: PartRegistryEntry[],
  characterIndex: ReturnType<typeof getCharacterIndexEntries>,
  compatibility: HeadHairCompatibility | null,
  packages: Map<string, PartRuntimePackage>,
  baseUrl: string
): PartPackageSet {
  return {
    registry,
    characterIndex,
    compatibility,
    packages,
    baseUrl,
  };
}

async function parseJsonFile<T>(file: File): Promise<T> {
  return JSON.parse(await file.text()) as T;
}

async function fetchOptionalJson<T>(url: string): Promise<T | null> {
  try {
    return await fetchRuntimeJson(url) as T;
  } catch {
    return null;
  }
}

function activatePartPackageSet(partSet: PartPackageSet) {
  localAssetState.partPackageSet = partSet;
  localAssetState.customSelection = getDefaultCustomSelection(partSet);
  localAssetState.activeCustomCharacterId = localAssetState.customSelection?.characterId ?? null;
  rebuildCustomCombinedCharacter();
  renderCustomPartControls();
}

function rebuildCustomCombinedCharacter() {
  const partSet = localAssetState.partPackageSet;
  const selection = localAssetState.customSelection;
  if (!partSet || !selection) {
    return;
  }
  const combined = composeRuntimeCombinedCharacterAsset({
    partSet,
    selection,
    activeCharacterId: localAssetState.activeCustomCharacterId,
    resolveUrl: (path) => findConverterUrl(path)
      ?? (partSet.baseUrl ? resolveConverterBaseUrl(partSet.baseUrl, path) : path),
  });
  localAssetState.converterCombinedCharacter = combined;
  localAssetState.converterRuntimeExtension = asRecord(combined.runtimeExtension);
  localAssetState.converterBodyManifest = combined.bodyAsset;
  localAssetState.converterHeadManifest = combined.headAsset;
}

async function parseConverterFolder(files: File[]) {
  localAssetState.converterFiles = files;
  for (const url of new Set(localAssetState.converterUrlByPath.values())) {
    URL.revokeObjectURL(url);
  }
  localAssetState.converterUrlByPath.clear();
  localAssetState.converterDisplayNameByUrl.clear();
  resetRuntimePackageState();
  localAssetState.converterBaseUrl = null;
  applyLightControllerPreview(null);
  localAssetState.converterError = "";

  for (const file of files) {
    const relativePath = getNormalizedRelativePath(file);
    const url = URL.createObjectURL(file);
    localAssetState.converterUrlByPath.set(relativePath, url);
    localAssetState.converterUrlByPath.set(file.name, url);
    localAssetState.converterDisplayNameByUrl.set(url, relativePath.split('/').pop() ?? file.name);
  }

  const runtimeExtensionFile = findRuntimeExtensionCandidate(files);
  const partRegistryFile = findPartRegistryCandidate(files);
  const combinedCharacterFile = findCombinedCharacterFile(files);

  if (partRegistryFile) {
    try {
      activatePartPackageSet(await parsePartRegistryFolder(files, partRegistryFile));
      return;
    } catch (error) {
      localAssetState.converterError =
        error instanceof Error ? error.message : String(error);
      renderCustomPartControls();
      return;
    }
  }

  if (!runtimeExtensionFile) {
    localAssetState.converterError =
      "Runtime package must contain pjsk-sekai-runtime.extension.json or parts/part-registry.json.";
    renderCustomPartControls();
    return;
  }

  try {
    const baseRuntimeExtension = asRecord(JSON.parse(await runtimeExtensionFile.text()));
    const unityRuntimeJsonPath = readUnityRuntimeJsonPath(baseRuntimeExtension);
    const unityRuntimeJsonUrl = unityRuntimeJsonPath
      ? findConverterUrl(unityRuntimeJsonPath)
      : null;
    const runtime = await normalizeRuntimeWithUnityRuntimeJson(
      baseRuntimeExtension,
      unityRuntimeJsonUrl
    );
    if (!unityRuntimeJsonUrl) {
      localAssetState.converterError =
        "Pure Unity converter output must contain character/unity-runtime.json.";
      return;
    }
    const meshUrl = "";
    localAssetState.converterRuntimeExtension = runtime.extension;
    localAssetState.converterCombinedFile = combinedCharacterFile;
    if (unityRuntimeJsonUrl && unityRuntimeJsonPath) {
      localAssetState.converterDisplayNameByUrl.set(
        unityRuntimeJsonUrl,
        unityRuntimeJsonPath
      );
    }
    const prefabRuntimeMeshUrl = undefined;
    const runtimePreview = readRuntimePreviewLight(runtime.extension);
    if (runtimePreview) {
      Object.assign(previewState, runtimePreview);
      viewer.updatePreviewLight(previewState);
    }
    const unityMotionJsonPath = readEmbeddedUnityMotionPath(runtime.extension);
    const unityMotionJsonUrl = unityMotionJsonPath
      ? findConverterUrl(unityMotionJsonPath)
      : null;
    if (unityMotionJsonUrl && unityMotionJsonPath) {
      localAssetState.converterDisplayNameByUrl.set(
        unityMotionJsonUrl,
        unityMotionJsonPath
      );
    }
    const embeddedFaceMotion = readEmbeddedFaceMotion(runtime.extension);
    localAssetState.converterEmbeddedFaceMotionData = embeddedFaceMotion;
    localAssetState.converterEmbeddedLightMotionData =
      readEmbeddedLightMotion(runtime.extension);
    localAssetState.converterLightControllerPreview =
      buildLightControllerPreview(localAssetState.converterEmbeddedLightMotionData);
    applyLightControllerPreview(localAssetState.converterLightControllerPreview);
    if (embeddedFaceMotion) {
      localAssetState.faceMotionData = embeddedFaceMotion;
      localAssetState.faceMotionError = "";
    }
    localAssetState.converterCombinedCharacter = {
      id: `runtime-${runtime.bodyAsset.characterId ?? "unknown"}-unity-runtime.json`,
      displayName: "Runtime unity-runtime.json",
      meshUrl,
      prefabRuntimeMeshUrl,
      unityRuntimeJsonUrl: unityRuntimeJsonUrl ?? undefined,
      unityRuntimeJsonPath: unityRuntimeJsonPath ?? undefined,
      unityMotionJsonUrl: unityMotionJsonUrl ?? undefined,
      unityMotionJsonPath: unityMotionJsonPath ?? undefined,
      bodyAsset: runtime.bodyAsset,
      headAsset: runtime.headAsset,
      runtimeExtension: runtime.extension,
    };
    localAssetState.converterBodyManifest = runtime.bodyAsset;
    localAssetState.converterHeadManifest = runtime.headAsset;
    if (unityMotionJsonUrl) {
      localAssetState.converterBodyManifest = {
        ...localAssetState.converterBodyManifest,
        source: {
          ...localAssetState.converterBodyManifest.source,
          animationUrls: [unityMotionJsonUrl],
        },
      };
      localAssetState.converterCombinedCharacter.bodyAsset =
        localAssetState.converterBodyManifest;
    }
    return;
  } catch (error) {
    localAssetState.converterError =
      error instanceof Error ? error.message : String(error);
  }
}

async function fetchRuntimeJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function parseConverterBaseUrl(baseUrl: string) {
  localAssetState.converterFiles = [];
  for (const url of new Set(localAssetState.converterUrlByPath.values())) {
    URL.revokeObjectURL(url);
  }
  localAssetState.converterUrlByPath.clear();
  localAssetState.converterDisplayNameByUrl.clear();
  resetRuntimePackageState();
  localAssetState.converterBaseUrl = baseUrl;
  applyLightControllerPreview(null);
  localAssetState.converterError = "";

  try {
    try {
      activatePartPackageSet(await parsePartRegistryBaseUrl(baseUrl));
      return;
    } catch {
      resetRuntimePackageState();
      localAssetState.converterBaseUrl = baseUrl;
    }

    const runtimeUrl = resolveConverterBaseUrl(
      baseUrl,
      "pjsk-sekai-runtime.extension.json"
    );
    const baseRuntimeExtension = asRecord(await fetchRuntimeJson(runtimeUrl));
    const unityRuntimeJsonPath = readUnityRuntimeJsonPath(baseRuntimeExtension);
    const unityRuntimeJsonUrl = unityRuntimeJsonPath
      ? resolveConverterBaseUrl(baseUrl, unityRuntimeJsonPath)
      : undefined;
    const runtime = await normalizeRuntimeWithUnityRuntimeJson(
      baseRuntimeExtension,
      unityRuntimeJsonUrl
    );
    localAssetState.converterRuntimeExtension = runtime.extension;
    if (!unityRuntimeJsonUrl) {
      throw new Error(
        "Pure Unity converter output must contain character/unity-runtime.json."
      );
    }
    if (unityRuntimeJsonUrl && unityRuntimeJsonPath) {
      localAssetState.converterDisplayNameByUrl.set(
        unityRuntimeJsonUrl,
        unityRuntimeJsonPath.split("/").pop() ?? unityRuntimeJsonPath
      );
    }
    const prefabRuntimeMeshUrl = undefined;
    const runtimePreview = readRuntimePreviewLight(runtime.extension);
    if (runtimePreview) {
      Object.assign(previewState, runtimePreview);
      viewer.updatePreviewLight(previewState);
    }

    const unityMotionJsonPath = readEmbeddedUnityMotionPath(runtime.extension);
    const unityMotionJsonUrl = unityMotionJsonPath
      ? resolveConverterBaseUrl(baseUrl, unityMotionJsonPath)
      : undefined;
    if (unityMotionJsonUrl && unityMotionJsonPath) {
      localAssetState.converterDisplayNameByUrl.set(
        unityMotionJsonUrl,
        unityMotionJsonPath.split("/").pop() ?? unityMotionJsonPath
      );
    }
    const embeddedFaceMotion = readEmbeddedFaceMotion(runtime.extension);
    localAssetState.converterEmbeddedFaceMotionData = embeddedFaceMotion;
    localAssetState.converterEmbeddedLightMotionData =
      readEmbeddedLightMotion(runtime.extension);
    localAssetState.converterLightControllerPreview =
      buildLightControllerPreview(localAssetState.converterEmbeddedLightMotionData);
    applyLightControllerPreview(localAssetState.converterLightControllerPreview);
    if (embeddedFaceMotion) {
      localAssetState.faceMotionData = embeddedFaceMotion;
      localAssetState.faceMotionError = "";
    }

    localAssetState.converterCombinedCharacter = {
      id: `runtime-${runtime.bodyAsset.characterId ?? "unknown"}-unity-runtime.json`,
      displayName: "Runtime unity-runtime.json",
      meshUrl: "",
      prefabRuntimeMeshUrl,
      unityRuntimeJsonUrl,
      unityRuntimeJsonPath: unityRuntimeJsonPath ?? undefined,
      unityMotionJsonUrl,
      unityMotionJsonPath: unityMotionJsonPath ?? undefined,
      bodyAsset: runtime.bodyAsset,
      headAsset: runtime.headAsset,
      runtimeExtension: runtime.extension,
    };
    localAssetState.converterBodyManifest = runtime.bodyAsset;
    localAssetState.converterHeadManifest = runtime.headAsset;
    if (unityMotionJsonUrl) {
      localAssetState.converterBodyManifest = {
        ...localAssetState.converterBodyManifest,
        source: {
          ...localAssetState.converterBodyManifest.source,
          animationUrls: [unityMotionJsonUrl],
        },
      };
      localAssetState.converterCombinedCharacter.bodyAsset =
        localAssetState.converterBodyManifest;
    }
  } catch (error) {
    localAssetState.converterError =
      error instanceof Error ? error.message : String(error);
  }
}

function buildActiveBodyAsset() {
  const base = localAssetState.converterBodyManifest
    ? copyBodyAsset(localAssetState.converterBodyManifest)
    : copyBodyAsset(getBodyAsset(sampleCatalog, assemblyState.bodyAssetId));
  base.characterId ??= inferCharacterIdFromText(base.skeleton.skeletonId)
    ?? inferCharacterIdFromText(base.id)
    ?? inferCharacterIdFromText(base.source.bundleRoot);
  base.characterHeightMeters ??= base.characterId
    ? characterHeightMetersById[base.characterId]
    : undefined;
  return base;
}

function buildActiveHeadAsset() {
  if (localAssetState.converterHeadManifest) {
    return copyHeadAsset(localAssetState.converterHeadManifest);
  }
  const base = copyHeadAsset(getHeadAsset(sampleCatalog, assemblyState.headAssetId));
  base.characterId ??= inferCharacterIdFromText(base.assembly.expectedSkeletonId)
    ?? inferCharacterIdFromText(base.id)
    ?? inferCharacterIdFromText(base.source.bundleRoot);
  base.characterHeightMeters ??= base.characterId
    ? characterHeightMetersById[base.characterId]
    : undefined;
  base.proxy.skinColorDefault ??= base.proxy.faceColor;
  base.proxy.skinColor1 ??= base.proxy.faceShadeColor;
  base.proxy.skinColor2 ??= base.proxy.faceShadeColor;
  return base;
}

function resolveAnimationDisplayName(url: string) {
  return localAssetState.converterDisplayNameByUrl.get(url)
    ?? (url.split("/").pop() ?? url);
}

function formatAnimationLabel(url: string) {
  const basename = resolveAnimationDisplayName(url);
  return basename.replace(/\.[^.]+$/, "");
}

function formatRuntimeRequestUrl(url: string | undefined) {
  if (!url) {
    return "<none>";
  }
  const displayName = localAssetState.converterDisplayNameByUrl.get(url);
  if (displayName) {
    return displayName;
  }
  const marker = "/capture-input/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex >= 0) {
    return url.slice(markerIndex + marker.length);
  }
  const normalized = url.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments.slice(-2).join("/") || url;
}

function formatPrefabHeadFollowLine() {
  const debug = lastAnimationSnapshot?.bodyRetargetDebug?.prefabHeadFollow;
  if (!debug) {
    return "";
  }
  const state = debug.active ? "active" : `inactive: ${debug.reason ?? "unknown"}`;
  const source = debug.sourcePath ?? "<none>";
  const target = debug.targetPath ?? "<none>";
  return `<code>Unity Assembly: ${state} | body attach ${source} -> head origin ${target} | setup ${debug.setupVersion ?? "<none>"}</code>`;
}

function formatUnityRuntimeSpaceLine() {
  const extension = localAssetState.converterRuntimeExtension;
  if (!extension) {
    return "";
  }
  const springBone = asRecord(extension.pjskSpringBone ?? extension.PjskSpringBone);
  const setup = asRecord(springBone.runtimeUnitySetup ?? springBone.RuntimeUnitySetup);
  const coordinateSpace = asRecord(setup.coordinateSpace ?? setup.CoordinateSpace);
  const source = readString(coordinateSpace.source ?? coordinateSpace.Source, "<unknown>");
  const viewer = readString(coordinateSpace.viewer ?? coordinateSpace.Viewer, "<unknown>");
  if (source === "<unknown>" && viewer === "<unknown>") {
    return "";
  }
  const positionConversion = readString(
    coordinateSpace.positionConversion ?? coordinateSpace.PositionConversion
  );
  const rotationConversion = readString(
    coordinateSpace.rotationConversion ?? coordinateSpace.RotationConversion
  );
  const conversions = [positionConversion, rotationConversion].filter(Boolean).join(" / ");
  return `<code>Unity Runtime Space: ${source} -> ${viewer}${conversions ? ` | ${conversions}` : ""}</code>`;
}

function getAnimationBasename(url: string) {
  return formatAnimationLabel(url);
}

function isFaceAnimationUrl(url: string) {
  return /^face(?:_loop)?$/i.test(getAnimationBasename(url));
}

function isLoopAnimationUrl(url: string) {
  return /(?:^|[_-])loop$/i.test(getAnimationBasename(url));
}

function isMergedBodyMotionUrl(url: string) {
  return /body[_-]?motion/i.test(getAnimationBasename(url));
}

function isUnityMotionJsonUrl(url: string) {
  return /(?:^|\/)unity-motion\.json(?:$|[?#])/i.test(url);
}

type AnimationOption = {
  url: string;
  label: string;
  isLoop: boolean;
  kind: BodyAnimationKind;
};

function getAnimationKind(url: string): BodyAnimationKind {
  const combinedAsset = localAssetState.converterCombinedCharacter;
  const displayName = localAssetState.converterDisplayNameByUrl.get(url);
  if (
    url === combinedAsset?.unityMotionJsonUrl ||
    isUnityMotionJsonUrl(url) ||
    Boolean(displayName && isUnityMotionJsonUrl(displayName))
  ) {
    return "unity-json";
  }
  return "gltf";
}

function getAnimationOptions(bodyAsset: BodyAssetManifest) {
  return (bodyAsset.source.animationUrls ?? [])
    .filter((url) => !isFaceAnimationUrl(url))
    .map((url) => ({
      url,
      label: formatAnimationLabel(url),
      isLoop: isLoopAnimationUrl(url),
      kind: getAnimationKind(url),
    }));
}

function syncAnimationSelection(bodyAsset: BodyAssetManifest) {
  const options = getAnimationOptions(bodyAsset);
  const loopOptions = options.filter((option) => option.isLoop);
  if (!options.length) {
    animationState.selectedMotionUrl = "";
    animationState.selectedLoopUrl = "";
    return options;
  }
  if (!options.some((option) => option.url === animationState.selectedMotionUrl)) {
    animationState.selectedMotionUrl =
      options.find((option) => !option.isLoop)?.url ?? options[0].url;
  }
  if (
    animationState.selectedLoopUrl &&
    !loopOptions.some((option) => option.url === animationState.selectedLoopUrl)
  ) {
    animationState.selectedLoopUrl = "";
  }
  if (
    !animationState.selectedLoopUrl &&
    options.length === 1 &&
    (isMergedBodyMotionUrl(options[0].url) || options[0].kind === "unity-json")
  ) {
    animationState.selectedLoopUrl = options[0].url;
  }
  return options;
}

function buildBodyAnimationSelection(
  bodyAsset: BodyAssetManifest
): BodyAnimationSelection | null {
  const options = syncAnimationSelection(bodyAsset);
  if (!options.length || !animationState.selectedMotionUrl) {
    return null;
  }
  const selectedMotion = options.find((option) => option.url === animationState.selectedMotionUrl);
  const selectedLoop = options.find((option) => option.url === animationState.selectedLoopUrl);
  return {
    motionUrl: animationState.selectedMotionUrl,
    motionKind: selectedMotion?.kind ?? getAnimationKind(animationState.selectedMotionUrl),
    loopUrl: animationState.selectedLoopUrl || null,
    loopKind: animationState.selectedLoopUrl
      ? selectedLoop?.kind ?? getAnimationKind(animationState.selectedLoopUrl)
      : null,
  };
}

function renderAnimationStatus(
  status: HTMLElement,
  options: AnimationOption[],
  loading = false
) {
  if (loading) {
    status.textContent = "Refreshing import and animation state...";
    return;
  }

  if (!options.length) {
    status.textContent = "No animation URLs declared on the active runtime package.";
    return;
  }

  if (lastAnimationSnapshot?.error) {
    status.textContent = `Animation error: ${lastAnimationSnapshot.error}`;
    return;
  }

  if (lastFaceMotionSnapshot?.error) {
    status.textContent = `Face motion error: ${lastFaceMotionSnapshot.error}`;
    return;
  }

  const configuredLoopInfo = animationState.selectedLoopUrl
    ? ` | Configured Loop: ${formatAnimationLabel(animationState.selectedLoopUrl)}`
    : " | Configured Loop: <none>";
  const trackDebug = lastAnimationSnapshot?.bodyTrackDebug;
  const loopDebug = lastAnimationSnapshot?.bodyLoopTrackDebug;
  const debugInfo = trackDebug
    ? ` | Body Tracks: ${trackDebug.trackCount}, Hair: ${trackDebug.hairTrackCount}, Head/Neck: ${trackDebug.headTrackCount + trackDebug.neckTrackCount}, Upper: ${trackDebug.upperBodyTrackCount}, UTJ Tracks: ${trackDebug.utjControlledTrackCount}`
    : "";
  const loopDebugInfo = loopDebug
    ? ` | Loop Tracks: ${loopDebug.trackCount}, Hair: ${loopDebug.hairTrackCount}, Head/Neck: ${loopDebug.headTrackCount + loopDebug.neckTrackCount}, UTJ Tracks: ${loopDebug.utjControlledTrackCount}`
    : "";
  const togglesInfo = lastAnimationSnapshot
    ? ` | Face Morphs: ${lastAnimationSnapshot.faceMotionEnabled ? "on" : "off"} | Head Tracks: ${lastAnimationSnapshot.bodyHeadTracksEnabled ? "on" : "off"}`
    : "";
  const retargetDebug = lastAnimationSnapshot?.bodyRetargetDebug;
  const retargetInfo = retargetDebug?.mode === "unity-prefab"
    ? ` | Retarget: ${retargetDebug.emittedTrackCount} tracks, Body targets: ${retargetDebug.resolvedBodyTargetCount}, Face targets: ${retargetDebug.resolvedFaceTargetCount}`
    : "";

  if (lastAnimationSnapshot?.activeClipName) {
    const faceInfo = lastFaceMotionSnapshot?.activeClipName
      ? ` | Face: ${lastFaceMotionSnapshot.activeClipName}${lastFaceMotionSnapshot.queuedLoopClipName ? ` -> Loop: ${lastFaceMotionSnapshot.queuedLoopClipName}` : ""} | Morph Maps: ${lastFaceMotionSnapshot.mappedCurveCount} | Face Meshes: ${lastFaceMotionSnapshot.mappedMeshCount}`
      : "";
    const timeInfo =
      lastAnimationSnapshot.duration > 0
        ? ` | Time: ${lastAnimationSnapshot.currentTime.toFixed(2)} / ${lastAnimationSnapshot.duration.toFixed(2)}`
        : "";
    status.textContent = `Active clip: ${lastAnimationSnapshot.activeClipName}${lastAnimationSnapshot.queuedLoopClipName ? ` -> Loop: ${lastAnimationSnapshot.queuedLoopClipName}` : ""}${configuredLoopInfo}${faceInfo} | Speed: ${animationState.speed.toFixed(2)}${animationState.paused ? " | Paused" : ""}${timeInfo}${togglesInfo}${debugInfo}${loopDebugInfo}${retargetInfo}`;
    return;
  }

  status.textContent = `Selected clip: ${formatAnimationLabel(animationState.selectedMotionUrl)}${configuredLoopInfo}${animationState.paused ? " | Paused" : ""}${togglesInfo}${debugInfo}${loopDebugInfo}${retargetInfo}`;
}

function getConfiguredFaceMotionSelection() {
  if (!localAssetState.faceMotionData?.clips.length) {
    return {
      clipName: null,
      loopClipName: null,
    };
  }

  if (isLoopAnimationUrl(animationState.selectedMotionUrl)) {
    return {
      clipName: "face_loop",
      loopClipName: null,
    };
  }

  return {
    clipName: "face",
    loopClipName: animationState.selectedLoopUrl ? "face_loop" : null,
  };
}

function renderAnimationControls(loading = false) {
  const { bodyAsset } = getActiveAssets();
  const options = syncAnimationSelection(bodyAsset);
  const select = document.querySelector<HTMLSelectElement>("#animation-select");
  const loopSelect = document.querySelector<HTMLSelectElement>("#animation-loop-select");
  const speed = document.querySelector<HTMLInputElement>("#animation-speed");
  const paused = document.querySelector<HTMLInputElement>("#animation-paused");
  const faceMotionEnabled = document.querySelector<HTMLInputElement>("#face-motion-enabled");
  const bodyHeadTracksEnabled = document.querySelector<HTMLInputElement>(
    "#body-head-tracks-enabled"
  );
  const springRuntimeMode = document.querySelector<HTMLSelectElement>(
    "#spring-runtime-mode"
  );
  const seek = document.querySelector<HTMLInputElement>("#animation-seek");
  const status = document.querySelector<HTMLElement>("#animation-status");

  if (
    !select ||
    !loopSelect ||
    !speed ||
    !paused ||
    !faceMotionEnabled ||
    !bodyHeadTracksEnabled ||
    !springRuntimeMode ||
    !seek ||
    !status
  ) {
    return;
  }

  select.innerHTML = options.length
    ? options
        .map(
          (option) =>
            `<option value="${option.url}" ${option.url === animationState.selectedMotionUrl ? "selected" : ""}>${option.label}</option>`
        )
        .join("")
    : '<option value="">No body animations</option>';
  const loopOptions = options.filter((option) => option.isLoop);
  const mergedLoopOption =
    !loopOptions.length &&
    options.length === 1 &&
    (isMergedBodyMotionUrl(options[0].url) || options[0].kind === "unity-json")
      ? { url: options[0].url, label: "motion_loop", isLoop: true, kind: options[0].kind }
      : null;
  const visibleLoopOptions = mergedLoopOption ? [mergedLoopOption] : loopOptions;
  loopSelect.innerHTML = loopOptions.length
    ? [
        '<option value="">No loop handoff</option>',
        ...visibleLoopOptions.map(
          (option) =>
            `<option value="${option.url}" ${option.url === animationState.selectedLoopUrl ? "selected" : ""}>${option.label}</option>`
        ),
      ].join("")
    : mergedLoopOption
      ? [
          '<option value="">No loop handoff</option>',
          `<option value="${mergedLoopOption.url}" ${mergedLoopOption.url === animationState.selectedLoopUrl ? "selected" : ""}>${mergedLoopOption.label}</option>`,
        ].join("")
    : '<option value="">No loop motions detected</option>';
  select.disabled = !options.length || loading;
  loopSelect.disabled = !options.length || loading;
  speed.disabled = !options.length;
  paused.disabled = !options.length;
  faceMotionEnabled.disabled = !options.length;
  bodyHeadTracksEnabled.disabled = !options.length || loading;
  springRuntimeMode.disabled = loading;
  seek.disabled = !options.length || !lastAnimationSnapshot?.duration;
  speed.value = String(animationState.speed);
  paused.checked = animationState.paused;
  faceMotionEnabled.checked = renderState.faceMotionEnabled;
  bodyHeadTracksEnabled.checked = renderState.bodyHeadTracksEnabled;
  springRuntimeMode.value = renderState.springRuntimeMode;
  const duration = lastAnimationSnapshot?.duration ?? 5;
  seek.max = String(Math.max(duration, 0.01));
  seek.value = String(Math.min(animationState.seekTime, duration));

  renderAnimationStatus(status, options, loading);
}

function renderCustomPartControls() {
  const partSet = localAssetState.partPackageSet;
  const selection = localAssetState.customSelection;
  const status = document.querySelector<HTMLElement>("#custom-parts-status");
  const bodySelect = document.querySelector<HTMLSelectElement>("#custom-body-select");
  const headSelect = document.querySelector<HTMLSelectElement>("#custom-head-select");
  const hairSelect = document.querySelector<HTMLSelectElement>("#custom-hair-select");
  const optionalSelect = document.querySelector<HTMLSelectElement>("#custom-head-optional-select");
  const selects = [bodySelect, headSelect, hairSelect, optionalSelect].filter(Boolean) as HTMLSelectElement[];

  if (!partSet || !selection) {
    for (const select of selects) {
      select.disabled = true;
      select.innerHTML = `<option value="">Unavailable</option>`;
    }
    if (status) {
      status.textContent = localAssetState.converterError
        ? `Custom parts unavailable: ${localAssetState.converterError}`
        : "Import a part registry package to enable same-character custom switching.";
    }
    return;
  }

  const characterId = localAssetState.activeCustomCharacterId ?? selection.characterId;
  fillCustomPartSelect(bodySelect, partSet, characterId, "body", selection.bodyCostume3dId);
  fillCustomPartSelect(headSelect, partSet, characterId, "head", selection.headCostume3dId);
  fillCustomPartSelect(hairSelect, partSet, characterId, "hair", selection.hairCostume3dId);
  fillCustomPartSelect(
    optionalSelect,
    partSet,
    characterId,
    "head_optional",
    selection.headOptionalCostume3dId ?? null,
    true
  );
  if (status) {
    status.textContent =
      `Custom character ${characterId}: same-character switching enabled. Switch character by reloading another package.`;
  }
}

function fillCustomPartSelect(
  select: HTMLSelectElement | null,
  partSet: PartPackageSet,
  characterId: number,
  partType: RuntimePartType,
  selectedCostume3dId: number | null,
  allowNone = false
) {
  if (!select) {
    return;
  }
  const parts = listSelectableParts(partSet, characterId, partType);
  select.disabled = parts.length === 0 && !allowNone;
  const noneOption = allowNone ? `<option value="">None</option>` : "";
  select.innerHTML = `${noneOption}${parts
    .map((entry) => {
      const label = `${entry.costume3dId} ${entry.name ?? entry.unit ?? ""}`.trim();
      return `<option value="${entry.costume3dId}">${label}</option>`;
    })
    .join("")}`;
  select.value = selectedCostume3dId ? String(selectedCostume3dId) : "";
}

function renderSpringBoneStatus(loading = false) {
  const status = document.querySelector<HTMLElement>("#springbone-status");
  if (!status) {
    return;
  }

  if (loading) {
    status.textContent = "Loading springBone metadata...";
    return;
  }

  const snapshot = lastSpringBoneSnapshot;
  if (!snapshot || !snapshot.present) {
    status.textContent =
      "No PJSK springBone metadata. Use character/unity-runtime.json plus PJSK_sekai_runtime.";
    return;
  }

  const runtime = snapshot.utjRuntime
    ? ` | Runtime ${snapshot.utjRuntime.runtimeMode ?? "unity-prefab"} S${snapshot.utjRuntime.springCount}/B${snapshot.utjRuntime.boneCount}/C${snapshot.utjRuntime.colliderCount}/M${snapshot.utjRuntime.missingNodeCount}/Sleeve${snapshot.utjRuntime.maxSleeveOffset.toFixed(3)}/Skirt${snapshot.utjRuntime.maxSkirtOffset.toFixed(3)}/Skin${snapshot.utjRuntime.skinnedBoneMatches}:${snapshot.utjRuntime.skinnedBoneMisses}${formatSpringRuntimeSetupSummary(snapshot.utjRuntime)}${formatUtjSpringBoneBindingSummary(snapshot.utjRuntime)}`
    : " | Runtime no";
  status.textContent =
    `SpringBone metadata | Body Managers ${snapshot.bodyManagerCount}, Bones ${snapshot.bodySpringBoneCount}, ExtraBone ${snapshot.bodyExtraBoneCount}, Colliders S${snapshot.bodySphereColliderCount}/C${snapshot.bodyCapsuleColliderCount}/P${snapshot.bodyPanelColliderCount} | Head Managers ${snapshot.headManagerCount}, Bones ${snapshot.headSpringBoneCount}, ExtraBone ${snapshot.headExtraBoneCount}, Colliders S${snapshot.headSphereColliderCount}/C${snapshot.headCapsuleColliderCount}/P${snapshot.headPanelColliderCount} | CharacterHair ${snapshot.characterHairPresent ? "yes" : "no"} | CharacterEye ${snapshot.characterEyePresent ? "yes" : "no"} | VRM Manager ${snapshot.vrmSpringBoneManagerPresent ? "yes" : "no"}${runtime}`;
}

function formatSpringRuntimeSetupSummary(
  runtime: NonNullable<SpringBoneRuntimeSnapshot["utjRuntime"]>
): string {
  const setup = runtime.setupDiagnostics;
  if (!setup) {
    return "";
  }
  return ` | Setup M${setup.managerCount}/B${setup.boneSourceCount}/C${setup.colliderSourceCount}/D${setup.bindingDecisionCount}/Cache${setup.managerColliderCacheCount}/Roots[${setup.activeRoots.join(",") || "none"}]`;
}

function formatUtjSpringBoneBindingSummary(
  runtime: NonNullable<SpringBoneRuntimeSnapshot["utjRuntime"]>
): string {
  const diagnostics = runtime.bindingDiagnostics ?? [];
  if (!diagnostics.length) {
    return "";
  }

  const colliderFlagDiagnostics = diagnostics.filter(
    (diagnostic) => diagnostic.sourceKind === "colliderFlag"
  );
  const selectedRootCounts = new Map<string, number>();
  let dualBodySitCandidates = 0;
  for (const diagnostic of colliderFlagDiagnostics) {
    const selectedRoot = diagnostic.selectedRoot ?? "none";
    selectedRootCounts.set(selectedRoot, (selectedRootCounts.get(selectedRoot) ?? 0) + 1);
    const candidateRootNames = new Set(diagnostic.candidateRoots.map((candidate) => candidate.root));
    if (candidateRootNames.has("body") && candidateRootNames.has("sit_body")) {
      dualBodySitCandidates += 1;
    }
  }

  const rootSummary = [...selectedRootCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([root, count]) => `${root}:${count}`)
    .join(",");
  const topBindings = colliderFlagDiagnostics
    .slice(0, 4)
    .map((diagnostic) =>
      `${diagnostic.boneName ?? diagnostic.bonePath ?? "bone"}=>${diagnostic.selectedRoot ?? "none"}:${diagnostic.selectedColliderCount}(${diagnostic.selectionReason})`
    )
    .join(" ; ");
  return ` | Binding colliderFlag ${colliderFlagDiagnostics.length}/${diagnostics.length} roots[${rootSummary || "none"}] body+sit candidates ${dualBodySitCandidates}${topBindings ? ` | ${topBindings}` : ""}`;
}

async function applyBodyAnimation(bodyAsset: BodyAssetManifest) {
  viewer.setAnimationSpeed(animationState.speed);
  viewer.setAnimationPaused(animationState.paused);
  lastAnimationSnapshot = await viewer.setAnimationSelection(
    buildBodyAnimationSelection(bodyAsset)
  );
  animationState.seekTime = lastAnimationSnapshot.currentTime;
}

async function applyFaceMotion() {
  const selection = getConfiguredFaceMotionSelection();
  viewer.setFaceMotionSet(
    localAssetState.faceMotionData,
    selection.clipName,
    selection.loopClipName
  );
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
}

function getActiveAssets() {
  return {
    bodyAsset: buildActiveBodyAsset(),
    headAsset: buildActiveHeadAsset(),
    combinedAsset: localAssetState.converterCombinedCharacter,
  };
}

function getCompositionWarnings(
  bodyAsset: BodyAssetManifest,
  headAsset: HeadAssetManifest
) {
  const warnings: string[] = [];
  if (bodyAsset.skeleton.skeletonId !== headAsset.assembly.expectedSkeletonId) {
    warnings.push(
      `Skeleton mismatch: ${bodyAsset.skeleton.skeletonId} vs ${headAsset.assembly.expectedSkeletonId}`
    );
  }
  if (!bodyAsset.skeleton.neckAttach.nodeName) {
    warnings.push(
      "Body manifest has no named neck attach node; viewer will use fallback position."
    );
  }
  if (!headAsset.assembly.attachOrigin.nodeName) {
    warnings.push(
      "Head manifest has no named attach origin node; viewer will use fallback origin."
    );
  }
  if (
    !headAsset.assembly.boneRemap ||
    !Object.keys(headAsset.assembly.boneRemap).length
  ) {
    warnings.push("Head manifest has no bone remap table.");
  }
  return warnings;
}

function clearLocalInputValues() {
  const input = document.querySelector<HTMLInputElement>("#local-converter-folder");
  if (input) {
    input.value = "";
  }
}

function resetLocalOverrides() {
  for (const url of new Set(localAssetState.converterUrlByPath.values())) {
    URL.revokeObjectURL(url);
  }
  localAssetState.converterFiles = [];
  localAssetState.converterUrlByPath.clear();
  localAssetState.converterDisplayNameByUrl.clear();
  resetRuntimePackageState();
  localAssetState.converterBaseUrl = null;
  applyLightControllerPreview(null);
  localAssetState.converterError = "";
  localAssetState.faceMotionData = null;
  localAssetState.faceMotionError = "";
  renderCustomPartControls();
}

function formatLightMotionClip(clip: LightMotionClip) {
  const controllerKind = clip.controllerKind ?? "unknown";
  return `${clip.name}:${controllerKind}`;
}

function renderImportSummary(loading = false) {
  const { bodyAsset, headAsset, combinedAsset } = getActiveAssets();
  const summary = document.querySelector<HTMLElement>("#import-summary");
  const assemblyJson = document.querySelector<HTMLElement>("#assembly-json");

  if (!summary || !assemblyJson) {
    return;
  }

  const bodyImport = lastImportSnapshot?.body;
  const headImport = lastImportSnapshot?.head;
  const bodyStatus = loading
    ? "Loading..."
    : bodyImport?.sourceMode === "glb"
      ? "Runtime Source Loaded"
      : bodyImport?.sourceMode === "unity-runtime"
        ? "Unity Runtime Loaded"
      : bodyImport?.sourceMode === "proxy"
        ? "Proxy Fallback"
        : "Pending";
  const headStatus = loading
    ? "Loading..."
    : headImport?.sourceMode === "glb"
      ? "Runtime Source Loaded"
      : headImport?.sourceMode === "unity-runtime"
        ? "Unity Runtime Loaded"
      : headImport?.sourceMode === "proxy"
        ? "Proxy Fallback"
        : "Pending";
  const compositionWarnings = getCompositionWarnings(bodyAsset, headAsset);
  const runtimeComposition = lastImportSnapshot?.composition;
  const runtimeMode = loading
    ? "Preparing..."
    : runtimeComposition?.mode ?? "unknown";
  const unityRuntimeFileName = combinedAsset?.unityRuntimeJsonUrl
    ? combinedAsset.unityRuntimeJsonPath
      ?? localAssetState.converterDisplayNameByUrl.get(combinedAsset.unityRuntimeJsonUrl)
      ?? combinedAsset.unityRuntimeJsonUrl.split("/").pop()
      ?? "unity-runtime.json"
    : "missing";
  const unityMotionFileName = combinedAsset?.unityMotionJsonUrl
    ? combinedAsset.unityMotionJsonPath
      ?? localAssetState.converterDisplayNameByUrl.get(combinedAsset.unityMotionJsonUrl)
      ?? combinedAsset.unityMotionJsonUrl.split("/").pop()
      ?? "unity-motion.json"
    : "not exported";
  const bodySourceLines = `
    <code>Unity Runtime JSON: ${unityRuntimeFileName}</code>
    ${bodyImport ? `<code>Loaded Runtime Source: ${formatRuntimeRequestUrl(bodyImport.requestedUrl)}</code>` : ""}
    ${bodyImport ? `<code>Combined Meshes: ${bodyImport.meshCount}</code>` : ""}
    <code>Body Material Slots: ${bodyAsset.bodyMaterials.length}</code>
  `;
  const headSourceLines = `
    <code>Unity Runtime JSON: ${unityRuntimeFileName}</code>
    ${headImport ? `<code>Loaded Runtime Source: ${formatRuntimeRequestUrl(headImport.requestedUrl)}</code>` : ""}
    ${headImport ? `<code>Combined Meshes: ${headImport.meshCount}</code>` : ""}
    <code>Head Material Slots: ${headAsset.faceMaterials.length}</code>
  `;
  const compositionDetail = `
    <code>Unity source-space prefab assembly.</code>
    ${
      runtimeComposition
        ? `<code>Runtime Bone Links: ${runtimeComposition.linkedBoneCount}</code>`
        : ""
    }
    <code>Spring Runtime Mode: ${renderState.springRuntimeMode}</code>
    ${formatUnityRuntimeSpaceLine()}
    ${formatPrefabHeadFollowLine()}
    ${
      runtimeComposition?.missingBodyBones.length
        ? runtimeComposition.missingBodyBones
            .map((bone) => `<code>Missing body bone: ${bone}</code>`)
            .join("")
        : ""
    }
    ${
      runtimeComposition?.missingHeadBones.length
        ? runtimeComposition.missingHeadBones
            .map((bone) => `<code>Missing head bone: ${bone}</code>`)
            .join("")
        : ""
    }
  `;

  summary.innerHTML = `
    <div class="summary-card">
      <span class="status-label">Runtime Body</span>
      <strong>${bodyAsset.displayName}</strong>
      <span class="status-line">${bodyStatus}</span>
      ${
        localAssetState.converterBodyManifest
          ? `<code>Converter Folder Mode: active</code>`
          : ""
      }
      ${bodySourceLines}
      ${bodyImport?.error ? `<code>Error: ${bodyImport.error}</code>` : ""}
      <code>Skeleton: ${bodyAsset.skeleton.skeletonId}</code>
      <code>Neck Attach Node: ${bodyAsset.skeleton.neckAttach.nodeName ?? "<fallback only>"}</code>
      ${bodyImport ? `<code>Bones: ${bodyImport.boneCount}, Skinned Meshes: ${bodyImport.skinnedMeshCount}</code>` : ""}
    </div>
    <div class="summary-card">
      <span class="status-label">Runtime Head</span>
      <strong>${headAsset.displayName}</strong>
      <span class="status-line">${headStatus}</span>
      ${
        localAssetState.converterHeadManifest
          ? `<code>Converter Folder Mode: active</code>`
          : ""
      }
      ${headSourceLines}
      ${headImport?.error ? `<code>Error: ${headImport.error}</code>` : ""}
      <code>Expected Skeleton: ${headAsset.assembly.expectedSkeletonId}</code>
      <code>Head Origin Node: ${headAsset.assembly.attachOrigin.nodeName ?? "<fallback only>"}</code>
      ${headImport ? `<code>Bones: ${headImport.boneCount}, Skinned Meshes: ${headImport.skinnedMeshCount}</code>` : ""}
    </div>
    <div class="summary-card">
      <span class="status-label">Composition</span>
      <strong>${runtimeMode}</strong>
      ${compositionDetail}
      ${
        compositionWarnings.length
          ? compositionWarnings.map((warning) => `<code>${warning}</code>`).join("")
          : `<code>Body attach node, head attach origin, and skeleton identity are all present.</code>`
      }
      ${
        localAssetState.converterError
          ? `<code>Converter Error: ${localAssetState.converterError}</code>`
          : ""
      }
      ${
        localAssetState.converterRuntimeExtension
          ? `<code>PJSK_sekai_runtime: active</code>`
          : ""
      }
      ${
        localAssetState.converterRuntimeExtension
          ? `<code>Motion Package Unity JSON: ${unityMotionFileName}</code>`
          : ""
      }
      ${
        localAssetState.converterEmbeddedFaceMotionData?.clips.length
          ? `<code>Motion Package Face: ${localAssetState.converterEmbeddedFaceMotionData.clips.map((clip) => clip.name).join(" -> ")}</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Motion Package Face: <none></code>`
            : ""
      }
      ${
        localAssetState.converterEmbeddedLightMotionData?.clips.length
          ? `<code>Motion Package Light: ${localAssetState.converterEmbeddedLightMotionData.clips.map(formatLightMotionClip).join(" -> ")}</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Motion Package Light: <none></code>`
            : ""
      }
      ${
        lastAnimationSnapshot?.activeClipName
          ? `<code>Runtime Body Clip: ${lastAnimationSnapshot.activeClipName}${
              lastAnimationSnapshot.queuedLoopClipName
                ? ` -> ${lastAnimationSnapshot.queuedLoopClipName}`
                : ""
            }</code>`
          : ""
      }
      ${
        lastFaceMotionSnapshot?.activeClipName
          ? `<code>Runtime Face Clip: ${lastFaceMotionSnapshot.activeClipName}${
              lastFaceMotionSnapshot.queuedLoopClipName
                ? ` -> ${lastFaceMotionSnapshot.queuedLoopClipName}`
                : ""
            } (${lastFaceMotionSnapshot.mappedCurveCount} maps / ${lastFaceMotionSnapshot.mappedMeshCount} meshes)</code>`
          : localAssetState.converterRuntimeExtension
            ? `<code>Runtime Face Clip: <none></code>`
            : ""
      }
    </div>
  `;

  assemblyJson.textContent = JSON.stringify(
    {
      bodyAssetId: assemblyState.bodyAssetId,
      headAssetId: assemblyState.headAssetId,
      previewLight: previewState,
      bodyCharacterId: bodyAsset.characterId ?? null,
      headCharacterId: headAsset.characterId ?? null,
      characterHeightMeters:
        bodyAsset.characterHeightMeters ?? headAsset.characterHeightMeters ?? null,
      stitchMode: assemblyState.stitchMode,
      bodyNeckAnchor: bodyAsset.neckAnchor,
      bodySkeleton: bodyAsset.skeleton,
      headRawImportOffset: headAsset.rawImportOffset,
      headAssembly: headAsset.assembly,
      faceMode: headAsset.defaultFaceMode,
      selectedBodyMotion: animationState.selectedMotionUrl || null,
      selectedBodyMotionLabel: animationState.selectedMotionUrl ? resolveAnimationDisplayName(animationState.selectedMotionUrl) : null,
      selectedBodyLoopMotion: animationState.selectedLoopUrl || null,
      selectedBodyLoopMotionLabel: animationState.selectedLoopUrl ? resolveAnimationDisplayName(animationState.selectedLoopUrl) : null,
      runtimeCombinedModel: localAssetState.converterCombinedFile?.name ?? null,
      runtimeExtensionLoaded: Boolean(localAssetState.converterRuntimeExtension),
      runtimeBodyMotionPath: null,
      runtimeBodyMotionResolved: false,
      embeddedFaceMotionClips:
        localAssetState.converterEmbeddedFaceMotionData?.clips.map((clip) => clip.name) ?? [],
      embeddedLightMotionClips:
        localAssetState.converterEmbeddedLightMotionData?.clips.map((clip) => ({
          name: clip.name,
          controllerKind: clip.controllerKind ?? "unknown",
          curveCount: clip.curves.length,
          properties: Array.from(new Set(clip.curves.map((curve) => curve.property))).sort(),
        })) ?? [],
      lightControllerPreview: localAssetState.converterLightControllerPreview,
      animationUrls: bodyAsset.source.animationUrls ?? [],
      headMorphChannels: headAsset.morphChannels ?? [],
      headMorphBindings: headAsset.morphChannelBindings ?? [],
      compositionWarnings,
      runtimeComposition,
      runtimeAnimation: lastAnimationSnapshot,
      runtimeFaceMotion: lastFaceMotionSnapshot,
      runtimeSpringBone: lastSpringBoneSnapshot,
    },
    null,
    2
  );

  renderAnimationControls(loading);
  renderSpringBoneStatus(loading);
}

async function applyCharacterImport() {
  const run = ++importRun;
  const { bodyAsset, headAsset, combinedAsset } = getActiveAssets();
  applyPreviewCharacterHeightFromAssets(bodyAsset, headAsset);
  lastImportSnapshot = null;
  lastAnimationSnapshot = {
    selectedUrl: animationState.selectedMotionUrl || null,
    selectedLoopUrl: animationState.selectedLoopUrl || null,
    activeClipName: null,
    queuedLoopClipName: null,
    currentTime: 0,
    duration: 0,
    paused: animationState.paused,
    speed: animationState.speed,
    faceMotionEnabled: renderState.faceMotionEnabled,
    bodyHeadTracksEnabled: renderState.bodyHeadTracksEnabled,
    bodyTrackDebug: null,
    bodyLoopTrackDebug: null,
    bodyRetargetDebug: null,
    error: null,
  };
  lastFaceMotionSnapshot = {
    activeClipName: null,
    queuedLoopClipName: null,
    error: null,
    currentTime: 0,
    mappedMeshCount: 0,
    mappedCurveCount: 0,
  };
  lastSpringBoneSnapshot = {
    present: false,
    bodyManagerCount: 0,
    bodySpringBoneCount: 0,
    bodyExtraBoneCount: 0,
    bodySphereColliderCount: 0,
    bodyCapsuleColliderCount: 0,
    bodyPanelColliderCount: 0,
    headManagerCount: 0,
    headSpringBoneCount: 0,
    headExtraBoneCount: 0,
    headSphereColliderCount: 0,
    headCapsuleColliderCount: 0,
    headPanelColliderCount: 0,
    characterHairPresent: false,
    characterEyePresent: false,
    vrmSpringBoneManagerPresent: false,
    source: "none",
  };
  renderImportSummary(true);
  if (!combinedAsset) {
    renderImportSummary();
    return;
  }
  viewer.setMaterialBindingMode(renderState.materialBindingMode);
  viewer.setHairShadowMode(renderState.hairShadowMode);
  viewer.setToonShadowPreview(
    toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
    valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
  );
  viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
  const snapshot = await viewer.importCombinedCharacter(combinedAsset);
  if (run !== importRun) {
    return;
  }
  lastImportSnapshot = snapshot;
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  viewer.updateAssembly(assemblyState);
  viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
  await applyBodyAnimation(bodyAsset);
  await applyFaceMotion();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderImportSummary();
}

viewer.updatePreviewLight(previewState);
renderAnimationControls();
renderSpringBoneStatus();
renderCustomPartControls();

type CaptureConfig = {
  baseUrl: string;
  phase: number;
  clip: "motion" | "motion_loop";
  warmupMs: number;
  warmupFrames: number;
  warmupMode: "animation" | "runtime";
  bodyDebugMode: BodyDebugMode;
  renderIsolation: RenderIsolationMode;
  springRuntimeMode: SpringRuntimeMode;
  utjTraceBones: string[];
  utjTraceMaxEvents: number;
};

type CaptureWindow = Window & {
  __PJSK_CAPTURE_READY__?: boolean;
  __PJSK_CAPTURE_ERROR__?: string;
  __PJSK_CAPTURE_SNAPSHOT__?: unknown;
};

function getCaptureWindow() {
  return window as CaptureWindow;
}

function readCaptureConfig(): CaptureConfig | null {
  const params = new URLSearchParams(window.location.search);
  const baseUrl = params.get("captureBase");
  if (!baseUrl) {
    return null;
  }
  document.body.classList.add("capture-mode");
  viewer.setCapturePresentation(true);

  const phase = Number(params.get("capturePhase") ?? "0.5");
  const clipParam = params.get("captureClip");
  const clip = clipParam === "motion" ? "motion" : "motion_loop";
  const yawMode = params.get("characterYawMode");
  if (yawMode) {
    renderState.characterYawMode = yawMode as CharacterYawMode;
  }
  const warmupMs = Number(params.get("captureWarmupMs") ?? "0");
  const warmupFrames = Number(params.get("captureWarmupFrames") ?? "0");
  const warmupModeParam = params.get("captureWarmupMode");
  const warmupMode = warmupModeParam === "runtime" ? "runtime" : "animation";
  const bodyDebugMode = readBodyDebugMode(params);
  const renderIsolation = readRenderIsolationMode(params);
  const springRuntimeMode = readSpringRuntimeMode(params);
  const utjTraceBones = params
    .getAll("utjTraceBone")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const traceMaxEvents = Number(params.get("utjTraceMaxEvents") ?? "240");
  renderState.springRuntimeMode = springRuntimeMode;
  renderState.hairShadowMode = readHairShadowMode(params);
  viewer.setSpringRuntimeMode(springRuntimeMode);
  viewer.setBodyDebugMode(bodyDebugMode);
  viewer.setRenderIsolationMode(renderIsolation);
  viewer.setHairShadowMode(renderState.hairShadowMode);

  return {
    baseUrl,
    phase: THREE.MathUtils.clamp(Number.isFinite(phase) ? phase : 0.5, 0, 1),
    clip,
    warmupMs: Math.max(Math.trunc(Number.isFinite(warmupMs) ? warmupMs : 0), 0),
    warmupFrames: Math.max(Math.trunc(Number.isFinite(warmupFrames) ? warmupFrames : 0), 0),
    warmupMode,
    bodyDebugMode,
    renderIsolation,
    springRuntimeMode,
    utjTraceBones,
    utjTraceMaxEvents: Math.max(Math.trunc(Number.isFinite(traceMaxEvents) ? traceMaxEvents : 240), 1),
  };
}

function readBodyDebugMode(params: URLSearchParams): BodyDebugMode {
  const mode = params.get("bodyDebugMode");
  switch (mode) {
    case "skin":
    case "neck":
    case "contact":
    case "h_r":
    case "h_g":
    case "h_b":
    case "h_a":
    case "vertex_r":
    case "vertex_g":
    case "base_shadow":
    case "ndotl_raw":
    case "h_b_adjusted_shadow":
    case "ambient_target":
    case "ambient_weight":
    case "ambient_tint":
    case "specular":
    case "specular_mask":
    case "specular_add":
    case "rim_raw":
    case "rim_add":
    case "rim_gate":
    case "rim_color":
    case "rim_scalar":
    case "toon_luma":
    case "shadow_mask":
    case "shadow_target":
      return mode;
    default:
      return "off";
  }
}

function readRenderIsolationMode(params: URLSearchParams): RenderIsolationMode {
  const mode = params.get("renderIsolation");
  switch (mode) {
    case "face_sdf":
    case "no_face_sdf":
    case "no_face_layers":
    case "no_eye_through_hair":
    case "eye_through_hair_only":
    case "eye_through_hair_eye_only":
    case "eye_through_hair_eyebrow_only":
    case "eye_through_hair_eyelash_only":
    case "no_eye_through_hair_eye":
    case "no_eye_through_hair_eyebrow":
    case "no_eye_through_hair_eyelash":
    case "no_eye_through_hair_eyelash_overlay":
    case "no_eye_through_hair_eyelash_prepass":
    case "eyelight_only":
    case "no_eyelight":
    case "outline_only":
    case "no_outline":
    case "no_body_outline":
    case "no_hair_outline":
    case "no_face_outline":
      return mode;
    default:
      return "normal";
  }
}

function readHairShadowMode(params: URLSearchParams): HairShadowMode {
  return params.get("hairShadowMode") === "legacy_head" ? "legacy_head" : "light";
}

function readSpringRuntimeMode(params: URLSearchParams): SpringRuntimeMode {
  const mode = params.get("springRuntimeMode");
  if (mode === "unity-prefab") {
    return mode;
  }
  if (mode === "webgl-utj" || params.get("utjSpringBoneEnabled") === "true") {
    return "unity-prefab";
  }
  return "off";
}

function setCaptureError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.captureError = message;
  getCaptureWindow().__PJSK_CAPTURE_ERROR__ = message;
}

function waitForAnimationFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

async function prepareCaptureFrame(config: CaptureConfig) {
  animationState.paused = true;
  viewer.setAnimationPaused(true);
  lastAnimationSnapshot = config.clip === "motion"
    ? viewer.seekAnimationPhase(config.phase)
    : viewer.seekAnimationLoopPhase(config.phase);
  if (config.warmupFrames > 0) {
    const advanceAnimation = config.warmupMode === "animation";
    animationState.paused = !advanceAnimation;
    viewer.setAnimationPaused(!advanceAnimation);
    for (let index = 0; index < config.warmupFrames; index += 1) {
      viewer.stepCaptureFrame(1 / 60, advanceAnimation);
    }
    animationState.paused = true;
    viewer.setAnimationPaused(true);
  } else if (config.warmupMs > 0) {
    animationState.paused = config.warmupMode === "runtime";
    viewer.setAnimationPaused(config.warmupMode === "runtime");
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, config.warmupMs);
    });
    animationState.paused = true;
    viewer.setAnimationPaused(true);
  }
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  viewer.frameCurrentCharacterForCapture();
  animationState.seekTime = lastAnimationSnapshot.currentTime;
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderImportSummary();
  renderAnimationControls();
  renderSpringBoneStatus();
  await waitForAnimationFrames(3);
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  const captureWindow = getCaptureWindow();
  captureWindow.__PJSK_CAPTURE_SNAPSHOT__ = {
    phase: config.phase,
    requestedClip: config.clip,
    springRuntimeMode: config.springRuntimeMode,
    bodyDebugMode: config.bodyDebugMode,
    renderIsolation: config.renderIsolation,
    import: lastImportSnapshot,
    animation: lastAnimationSnapshot,
    faceMotion: lastFaceMotionSnapshot,
    springBone: lastSpringBoneSnapshot,
    materialDebug: viewer.getRuntimeDebugSnapshot(),
    utjSpringBoneTrace: viewer.getUtjSpringBoneTraceSnapshot(),
  };
  captureWindow.__PJSK_CAPTURE_READY__ = true;
  document.body.dataset.captureReady = "true";
}

async function bootstrapApp() {
  const captureConfig = readCaptureConfig();
  if (!captureConfig) {
    await applyCharacterImport();
    return;
  }

  try {
    getCaptureWindow().__PJSK_CAPTURE_READY__ = false;
    document.body.dataset.captureReady = "false";
    animationState.paused = true;
    await parseConverterBaseUrl(captureConfig.baseUrl);
    if (localAssetState.converterError) {
      throw new Error(localAssetState.converterError);
    }
    await applyCharacterImport();
    if (localAssetState.converterError) {
      throw new Error(localAssetState.converterError);
    }
    viewer.setUtjSpringBoneTraceFilters(
      captureConfig.utjTraceBones,
      captureConfig.utjTraceMaxEvents
    );
    await prepareCaptureFrame(captureConfig);
  } catch (error) {
    setCaptureError(error);
  }
}

void bootstrapApp();

window.setInterval(() => {
  const status = document.querySelector<HTMLElement>("#animation-status");
  if (!status) {
    return;
  }
  const { bodyAsset } = getActiveAssets();
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderAnimationStatus(status, syncAnimationSelection(bodyAsset));
  renderSpringBoneStatus();
}, 250);

document
  .querySelectorAll<HTMLSelectElement>("select[data-render-key]")
  .forEach((select) => {
    select.addEventListener("change", () => {
      const key = select.dataset.renderKey;
      if (key === "materialBindingMode") {
        renderState.materialBindingMode = select.value as MaterialBindingMode;
        void applyCharacterImport();
      }
      if (key === "toonShadowSmoothMode") {
        renderState.toonShadowSmoothMode = select.value as ToonShadowSmoothMode;
        viewer.setToonShadowPreview(
          toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
          valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
        );
        renderImportSummary();
      }
      if (key === "valueShadowInfluenceMode") {
        renderState.valueShadowInfluenceMode = select.value as ValueShadowInfluenceMode;
        viewer.setToonShadowPreview(
          toonShadowSmoothByMode[renderState.toonShadowSmoothMode],
          valueShadowInfluenceByMode[renderState.valueShadowInfluenceMode]
        );
        renderImportSummary();
      }
      if (key === "hairShadowMode") {
        renderState.hairShadowMode = select.value as HairShadowMode;
        viewer.setHairShadowMode(renderState.hairShadowMode);
        renderImportSummary();
      }
      if (key === "characterYawMode") {
        renderState.characterYawMode = select.value as CharacterYawMode;
        viewer.setCharacterYawDegrees(characterYawDegreesByMode[renderState.characterYawMode]);
      }
      if (key === "renderIsolationMode") {
        renderIsolationMode = select.value as RenderIsolationMode;
        viewer.setRenderIsolationMode(renderIsolationMode);
      }
    });
  });

document
  .querySelectorAll<HTMLInputElement>("input[data-local-key]")
  .forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.localKey;

      if (key === "converterFolder") {
        await parseConverterFolder(Array.from(input.files ?? []));
      }

      void applyCharacterImport();
    });
  });

function updateCustomSelection(partType: RuntimePartType, value: string) {
  const selection = localAssetState.customSelection;
  if (!selection) {
    return;
  }
  const costume3dId = value ? Number(value) : null;
  if (costume3dId !== null && !Number.isFinite(costume3dId)) {
    return;
  }
  localAssetState.customSelection = {
    ...selection,
    bodyCostume3dId: partType === "body" && costume3dId !== null
      ? costume3dId
      : selection.bodyCostume3dId,
    headCostume3dId: partType === "head" && costume3dId !== null
      ? costume3dId
      : selection.headCostume3dId,
    hairCostume3dId: partType === "hair" && costume3dId !== null
      ? costume3dId
      : selection.hairCostume3dId,
    headOptionalCostume3dId: partType === "head_optional"
      ? costume3dId
      : selection.headOptionalCostume3dId,
  };
  try {
    rebuildCustomCombinedCharacter();
    localAssetState.converterError = "";
  } catch (error) {
    localAssetState.converterError = error instanceof Error ? error.message : String(error);
  }
  renderCustomPartControls();
  void applyCharacterImport();
}

document
  .querySelectorAll<HTMLSelectElement>(
    "#custom-body-select, #custom-head-select, #custom-hair-select, #custom-head-optional-select"
  )
  .forEach((select) => {
    select.addEventListener("change", () => {
      const partTypeById: Record<string, RuntimePartType> = {
        "custom-body-select": "body",
        "custom-head-select": "head",
        "custom-hair-select": "hair",
        "custom-head-optional-select": "head_optional",
      };
      updateCustomSelection(partTypeById[select.id], select.value);
    });
  });

const clearLocalButton =
  document.querySelector<HTMLButtonElement>("#clear-local-assets");

clearLocalButton?.addEventListener("click", () => {
  resetLocalOverrides();
  clearLocalInputValues();
  void applyCharacterImport();
});

window.addEventListener("beforeunload", () => viewer.destroy());
window.addEventListener("beforeunload", () => resetLocalOverrides());

const animationSelect = document.querySelector<HTMLSelectElement>("#animation-select");
animationSelect?.addEventListener("change", () => {
  animationState.selectedMotionUrl = animationSelect.value;
  const { bodyAsset } = getActiveAssets();
  void applyBodyAnimation(bodyAsset)
    .then(() => applyFaceMotion())
    .then(() => renderImportSummary());
});

const animationLoopSelect = document.querySelector<HTMLSelectElement>("#animation-loop-select");
animationLoopSelect?.addEventListener("change", () => {
  animationState.selectedLoopUrl = animationLoopSelect.value;
  const { bodyAsset } = getActiveAssets();
  void applyBodyAnimation(bodyAsset)
    .then(() => applyFaceMotion())
    .then(() => renderImportSummary());
});

const animationSpeed = document.querySelector<HTMLInputElement>("#animation-speed");
animationSpeed?.addEventListener("input", () => {
  animationState.speed = Number(animationSpeed.value);
  viewer.setAnimationSpeed(animationState.speed);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const animationPaused = document.querySelector<HTMLInputElement>("#animation-paused");
animationPaused?.addEventListener("change", () => {
  animationState.paused = animationPaused.checked;
  viewer.setAnimationPaused(animationState.paused);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const faceMotionEnabled = document.querySelector<HTMLInputElement>("#face-motion-enabled");
faceMotionEnabled?.addEventListener("change", () => {
  renderState.faceMotionEnabled = faceMotionEnabled.checked;
  viewer.setFaceMotionEnabled(renderState.faceMotionEnabled);
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  renderAnimationControls();
});

const bodyHeadTracksEnabled = document.querySelector<HTMLInputElement>(
  "#body-head-tracks-enabled"
);
bodyHeadTracksEnabled?.addEventListener("change", () => {
  renderState.bodyHeadTracksEnabled = bodyHeadTracksEnabled.checked;
  viewer.setBodyHeadTracksEnabled(renderState.bodyHeadTracksEnabled);
  void applyFaceMotion().then(() => {
    lastAnimationSnapshot = viewer.getAnimationSnapshot();
    lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
    renderAnimationControls();
    renderSpringBoneStatus();
  });
});

const springRuntimeMode = document.querySelector<HTMLSelectElement>(
  "#spring-runtime-mode"
);
springRuntimeMode?.addEventListener("change", () => {
  renderState.springRuntimeMode = springRuntimeMode.value as SpringRuntimeMode;
  viewer.setSpringRuntimeMode(renderState.springRuntimeMode);
  void applyCharacterImport();
});

const animationSeek = document.querySelector<HTMLInputElement>("#animation-seek");
animationSeek?.addEventListener("input", () => {
  animationState.seekTime = Number(animationSeek.value);
  viewer.seekAnimation(animationState.seekTime);
  animationState.paused = true;
  const pausedInput = document.querySelector<HTMLInputElement>("#animation-paused");
  if (pausedInput) {
    pausedInput.checked = true;
  }
  lastAnimationSnapshot = viewer.getAnimationSnapshot();
  lastFaceMotionSnapshot = viewer.getFaceMotionSnapshot();
  lastSpringBoneSnapshot = viewer.getSpringBoneSnapshot();
  renderAnimationControls();
  renderSpringBoneStatus();
});
