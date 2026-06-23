# Haruki 3D Engine

Runtime engine for rendering converted Project SEKAI 3D character packages in a browser.

This package is not a product GUI. It owns the rendering, package loading, animation, SpringBone, camera, and capture behavior. A web app or local test page should call the public API and provide its own interface.

The engine does not parse Unity bundles. It loads offline Haruki runtime packages:

- `character/character.vrm`
- `pjsk-sekai-runtime.extension.json`
- `character/unity-runtime.json`
- `motion/*.json` or `motion/*.glb`, when present
- `character/textures/**`
- `parts/part-registry.json` plus `parts/**/part-runtime.json`, for role-aware custom assembly

## Quick Start

```bash
npm install
npm run build
```

Use the public entry from `src/index.ts` during local development, or from the built package after `npm run build`:

```ts
import {
  Haruki3DEngine,
  previewLightDefaults,
} from "haruki-3d-engine";

const engine = new Haruki3DEngine({
  container: document.querySelector("#viewer")!,
  initialLight: { ...previewLightDefaults },
});

await engine.loadRuntimePackage({
  baseUrl: "/assets/runtime/001/",
});
```

Full API notes are in [docs/api.md](docs/api.md).

## Capture Harness

The repository keeps one intentionally minimal browser harness for automated capture:

```bash
npm run dev:capture
```

Generate a deterministic browser screenshot from a full runtime package folder:

```bash
npm run capture:runtime -- \
  --input <converter-output-directory> \
  --out <capture-output.png> \
  --width 1400 \
  --height 1000 \
  --scale 2 \
  --phase 0.5
```

Useful capture options:

- `--phase <0..1>` seeks the selected loop phase.
- `--scale <1..2>` renders with a higher device pixel ratio for sharper PNGs.
- `--warmup-frames <n>` steps the runtime at 60fps before capture.
- `--warmup-mode animation` advances animation and runtime.
- `--warmup-mode runtime` freezes animation and only settles runtime systems.
- `--yaw <0|45|-45|90|-90|180>` sets character yaw.
- `--spring-runtime-mode unity-prefab` enables the Unity Prefab SpringBone runtime.
- `--utj-springbone` is kept only as a compatibility alias for `unity-prefab`.

SpringBone defaults to `unity-prefab` in current engine and capture defaults. Use `springRuntimeMode: "off"` or the capture flag when a caller needs a static pose.

## Runtime Behavior

The engine reads exact PJSK semantics from `PJSK_sekai_runtime`:

- body/head assembly metadata
- material slot kinds and C/S/H texture roles
- face SDF texture role
- morph hash/channel bindings
- embedded face/light motion data
- SpringBone metadata and Unity Prefab runtime data

Motion behavior:

- If a runtime motion JSON is present in the runtime extension, it is selected automatically.
- If `motion/body_motion.glb` is present, the engine can still load it as a GLTF animation source.
- A merged `body_motion.glb` containing `motion` and `motion_loop` is treated as both the main clip and loop clip.
- Embedded face clips are promoted with the body loop, so `face_loop` is active when the body loop is active.

Custom wardrobe behavior:

- Part registry packages enable body/head/hair/head-optional switching.
- Custom switching is limited to parts for the currently loaded role. A role is `characterId:unit`, so Miku's unit variants are separate roles.
- Switching to another role first selects/reloads that role, then applies the requested parts.
- Switching parts inside the same role preserves animation playback state and rebuilds SpringBone for the new combined character.
- SpringBone is rebuilt after a new combined character is imported.

## Docker

The Docker image runs the capture HTTP service. Mount an exported runtime package at `/data/runtime` and a final PNG output directory at `/data/captures`:

```bash
docker build -t haruki-3d-engine .
docker run --rm -p 8080:8080 \
  -e HARUKI_CAPTURE_SCALE=2 \
  -v /path/to/runtime:/data/runtime:ro \
  -v /path/to/captures:/data/captures \
  haruki-3d-engine
```

Capture API:

```bash
curl -X POST http://localhost:8080/capture \
  -H 'content-type: application/json' \
  -d '{
    "imageId": "21_light_sound_1001",
    "roleId": "21:light_sound",
    "bodyCostume3dId": 1001,
    "headCostume3dId": 1001,
    "hairCostume3dId": 1001,
    "headOptionalCostume3dId": null,
    "scale": 2
  }'
```

The service starts one persistent headless Chromium page and keeps the engine loaded. Requests reuse that page, write only the final `/data/captures/<imageId>.png`, and atomically replace an existing file with the same id. `width` and `height` control CSS framing; `scale` controls output DPR, so `700x500` with `scale: 2` writes a `1400x1000` PNG. The service-owned Chromium profile/cache directory is removed on shutdown or session restart. Open `http://localhost:8080/capture.html` only when inspecting the harness manually.

## Development Notes

Build:

```bash
npm run build
```

Current constraints:

- Browser code should load converted packages only, not raw bundles.
- `character/character.vrm` is a transport container with PJSK custom extras, not a guarantee of generic VRM visual parity.
- Exact rendering depends on engine shaders and `PJSK_sekai_runtime`.
- The public API should remain usable by multiple frontends without requiring direct Three.js object mutation.
