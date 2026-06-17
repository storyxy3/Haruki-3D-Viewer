# Haruki 3D Viewer

Browser runtime for inspecting converted Project SEKAI character packages.

The viewer does not parse Unity bundles. It loads offline Haruki runtime packages:

- `character/character.vrm`
- `pjsk-sekai-runtime.extension.json`
- `motion/body_motion.glb`, when present
- `character/textures/**`
- `parts/part-registry.json` plus `parts/**/part-runtime.json`, for same-character custom assembly

## Quick Start

```bash
npm install
npm run dev
```

Open the local Vite URL and select a full runtime package folder or a generated part registry package folder:

```text
<converter-output-directory>
```

The preferred full package is the lean runtime export from `Haruki-3D-Exporter`. Part registry packages enable custom body/head/hair/head-optional switching only within one character; switching character requires loading another package.

## Capture Mode

Generate a deterministic browser screenshot from a full runtime package folder:

```bash
npm run capture:runtime -- \
  --input <converter-output-directory> \
  --out <capture-output.png> \
  --width 1400 \
  --height 1000 \
  --phase 0.5
```

Useful capture options:

- `--phase <0..1>` seeks the selected loop phase.
- `--warmup-frames <n>` steps the runtime at 60fps before capture.
- `--warmup-mode animation` advances animation and runtime.
- `--warmup-mode runtime` freezes animation and only settles runtime systems.
- `--yaw <0|45|-45|90|-90|180>` sets character yaw.
- `--spring-runtime-mode unity-prefab` enables the Unity Prefab SpringBone runtime.
- `--utj-springbone` is kept only as a compatibility alias for `unity-prefab`.

SpringBone is off by default in both browser and capture mode. The metadata is still loaded and shown; use the Unity Prefab runtime for current debugging.

## Runtime Behavior

The viewer reads exact PJSK semantics from `PJSK_sekai_runtime`:

- body/head assembly metadata
- material slot kinds and C/S/H texture roles
- face SDF texture role
- morph hash/channel bindings
- embedded face/light motion data
- raw and candidate SpringBone metadata

Motion behavior:

- If `motion/body_motion.glb` is present in the runtime extension, it is selected automatically.
- A merged `body_motion.glb` containing `motion` and `motion_loop` is treated as both the main clip and loop clip.
- Embedded face clips are promoted with the body loop, so `face_loop` is active when the body loop is active.

## Configuration

Viewer defaults live in:

```text
src/config/viewerConfig.ts
```

This file owns UI/runtime defaults such as:

- toon shadow preview presets
- value shadow influence presets
- character yaw presets
- default render state
- default animation state
- default SpringBone runtime state

Lighting and sample catalog data still live in `src/data/sampleScene.ts` because they are part of the runtime package boundary and fallback sample data.

## Development Notes

Build:

```bash
npm run build
```

Current constraints:

- Browser code should load converted packages only, not raw bundles.
- `character/character.vrm` is a transport container with PJSK custom extras, not a guarantee of generic VRM visual parity.
- Exact rendering still depends on viewer-specific shaders and `PJSK_sekai_runtime`.
- SpringBone metadata is retained, but UTJ runtime simulation is temporarily disabled by default.

When testing a new converter build, regenerate the output folder and re-import the whole folder so stale browser blob URLs are not reused.
