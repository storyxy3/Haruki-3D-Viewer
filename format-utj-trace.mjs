#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    input: "",
    out: "",
    event: "latest",
    collider: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      index += 1;
      if (index >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[index];
    };

    if (arg === "--input" || arg === "-i") {
      options.input = readValue();
    } else if (arg === "--out" || arg === "-o") {
      options.out = readValue();
    } else if (arg === "--event") {
      options.event = readValue();
    } else if (arg === "--collider") {
      options.collider = readValue();
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (!options.input) {
      options.input = arg;
    } else if (!options.out) {
      options.out = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.input) {
    throw new Error("Missing --input trace JSON.");
  }
  options.input = path.resolve(options.input);
  options.out = options.out ? path.resolve(options.out) : "";
  return options;
}

function printHelp() {
  console.log(`Usage:
  node format-utj-trace.mjs --input <trace.json> --out <report.md>

Options:
  --event <latest|index>   Trace event to render. Default: latest
  --collider <text>        Prefer a collider whose name/path contains this text
`);
}

function fmtNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return String(value);
  }
  if (value === 0) {
    return "0";
  }
  return Number(value).toPrecision(10);
}

function fmtVec(value) {
  if (!value) {
    return "-";
  }
  return `(${fmtNumber(value.x)}, ${fmtNumber(value.y)}, ${fmtNumber(value.z)}) len=${fmtNumber(value.length)}`;
}

function fmtQuat(value) {
  if (!value) {
    return "-";
  }
  return `(${fmtNumber(value.x)}, ${fmtNumber(value.y)}, ${fmtNumber(value.z)}, ${fmtNumber(value.w)})`;
}

function row(cells) {
  return `| ${cells.join(" | ")} |`;
}

function section(title) {
  return [``, `## ${title}`, ``];
}

function stateRows(stage, state, ida) {
  return [
    row([stage, `${ida}.currTipPos`, fmtVec(state?.currTipPos)]),
    row([stage, `${ida}.prevTipPos`, fmtVec(state?.prevTipPos)]),
    row([stage, `${ida}.cachedPosition/head`, fmtVec(state?.cachedPosition)]),
    row([stage, `${ida}.cachedMovement`, fmtVec(state?.cachedMovement)]),
    row([stage, `${ida}.hitNormal`, fmtVec(state?.hitNormal)]),
  ];
}

function pickEvent(trace, eventOption) {
  const events = Array.isArray(trace.events) ? trace.events : [];
  if (events.length === 0) {
    throw new Error("Trace has no events.");
  }
  if (eventOption === "latest") {
    return events[events.length - 1];
  }
  const index = Number(eventOption);
  if (!Number.isInteger(index) || index < 0 || index >= events.length) {
    throw new Error(`Invalid --event ${eventOption}; trace has ${events.length} events.`);
  }
  return events[index];
}

function pickCollider(event, filter) {
  const checks = Array.isArray(event.collisionChecks) ? event.collisionChecks : [];
  if (!checks.length) {
    return null;
  }
  const normalized = filter.trim().toLowerCase();
  if (normalized) {
    const hit = checks.find((check) =>
      String(check.name ?? "").toLowerCase().includes(normalized) ||
      String(check.path ?? "").toLowerCase().includes(normalized)
    );
    if (hit) {
      return hit;
    }
  }
  return checks.find((check) => check.status !== 0) ?? checks[0];
}

function buildReport(trace, event, collider) {
  const lines = [
    `# UTJ SpringBone IDA Compare Report`,
    ``,
    `Trace filters: ${(trace.filters ?? []).join(", ") || "-"}`,
    `Event: sequence=${event.sequence}, bone=${event.boneName}, spring=${event.springName}`,
    `Path: ${event.bonePath}`,
    ``,
    `Read this from top to bottom. The first row that differs from game runtime is where the bug starts.`,
  ];

  lines.push(...section("1. UpdateSpring Inputs"));
  lines.push(row(["IDA / F5 place", "Viewer trace field", "Value"]));
  lines.push(row(["---", "---", "---"]));
  lines.push(row(["UTJ_SpringBone__UpdateSpring deltaTime", "deltaTime", fmtNumber(event.deltaTime)]));
  lines.push(row(["localTransform.position / cachedPosition", "headPosition", fmtVec(event.headPosition)]));
  lines.push(row(["parentTransform.rotation", "parentRotation", fmtQuat(event.parentRotation)]));
  lines.push(row(["initialLocalRotation", "initialLocalRotation", fmtQuat(event.initialLocalRotation)]));
  lines.push(row(["boneAxis", "boneAxis", fmtVec(event.boneAxis)]));
  lines.push(row(["springLength", "springLength", fmtNumber(event.springLength)]));
  lines.push(row(["stiffnessForce", "stiffnessForce", fmtNumber(event.stiffnessForce)]));
  lines.push(row(["dragForce", "dragForce", fmtNumber(event.dragForce)]));
  lines.push(row(["springForce + externalForce", "springForce / externalForce", `${fmtVec(event.springForce)} / ${fmtVec(event.externalForce)}`]));
  lines.push(row(["computed animated tip", "animatedTip", fmtVec(event.animatedTip)]));

  lines.push(...section("2. Stage State"));
  lines.push(row(["Stage", "IDA value to compare", "Viewer value"]));
  lines.push(row(["---", "---", "---"]));
  lines.push(...stateRows("before UpdateSpring", event.stateBefore, "springBone->fields"));
  lines.push(...stateRows("after cache position", event.stateAfterCache, "after cache"));
  lines.push(...stateRows("after UpdateSpring", event.stateAfterUpdateSpring, "after UTJ_SpringBone__UpdateSpring"));
  lines.push(...stateRows("after LengthLimits", event.stateAfterLengthLimits, "after ApplyLengthLimits"));
  lines.push(...stateRows("after Collision", event.stateAfterCollisions, "after CheckForCollision"));
  lines.push(...stateRows("after AngleLimits", event.stateAfterAngleLimits, "after ApplyAngleLimits"));
  lines.push(row(["final rotation", "bone.localRotation", fmtQuat(event.finalLocalRotation)]));

  lines.push(...section("3. Collision Detail"));
  if (!collider) {
    lines.push("No collider checks were recorded for this event.");
  } else {
    lines.push(`Chosen collider: ${collider.name ?? "-"} (${collider.path ?? "-"})`);
    lines.push(row(["IDA / F5 place", "Viewer trace field", "Value"]));
    lines.push(row(["---", "---", "---"]));
    lines.push(row(["CheckForCollisionAndReact return", "status", String(collider.status)]));
    lines.push(row(["tailPosition before call", "beforeTailPosition", fmtVec(collider.beforeTailPosition)]));
    lines.push(row(["*tailPosition after call", "afterTailPosition", fmtVec(collider.afterTailPosition)]));
    lines.push(row(["*hitNormal", "hitNormal", fmtVec(collider.hitNormal)]));
    lines.push(row(["localHeadPosition", "localHeadPosition", fmtVec(collider.localHeadPosition)]));
    lines.push(row(["localTailPosition_", "localTailPositionBefore", fmtVec(collider.localTailPositionBefore)]));
    lines.push(row(["localTailPosition_ after react", "localTailPositionAfter", fmtVec(collider.localTailPositionAfter)]));
    lines.push(row(["localTailRadius", "localTailRadius", fmtNumber(collider.localTailRadius)]));
    lines.push(row(["sphereLocalOrigin", "localSphereOrigin", fmtVec(collider.localSphereOrigin)]));
    lines.push(row(["x_3 * this->fields.radius", "localSphereRadius", fmtNumber(collider.localSphereRadius)]));
    lines.push(row(["capsule start/end", "localCapsuleStart / localCapsuleEnd", `${fmtVec(collider.localCapsuleStart)} / ${fmtVec(collider.localCapsuleEnd)}`]));
    lines.push(row(["capsule radius", "capsuleRadius", fmtNumber(collider.capsuleRadius)]));
  }

  const angle = event.angleLimit ?? {};
  lines.push(...section("4. Angle Limit Detail"));
  lines.push(row(["IDA / F5 place", "Viewer trace field", "Value"]));
  lines.push(row(["---", "---", "---"]));
  lines.push(row(["pivot transform", "pivotPath", angle.pivotPath ?? "-"]));
  lines.push(row(["angle vector before", "vectorBefore", fmtVec(angle.vectorBefore)]));
  lines.push(row(["QuaternionUtility.Left(pivot.rotation)", "forward", fmtVec(angle.forward)]));
  lines.push(row(["QuaternionUtility.Back(pivot.rotation)", "back", fmtVec(angle.back)]));
  lines.push(row(["QuaternionUtility.Down(pivot.rotation)", "down", fmtVec(angle.down)]));
  lines.push(row(["Y ConstrainVector changed", "yApplied", String(Boolean(angle.yApplied))]));
  lines.push(row(["vector after Y", "afterY", fmtVec(angle.afterY)]));
  lines.push(row(["Z ConstrainVector changed", "zApplied", String(Boolean(angle.zApplied))]));
  lines.push(row(["vector after Z", "afterZ", fmtVec(angle.afterZ)]));
  lines.push(row(["final angle vector", "vectorAfter", fmtVec(angle.vectorAfter)]));

  lines.push(...section("5. What To Conclude"));
  lines.push(`- If section 2 first differs at "after UpdateSpring", inspect UpdateSpring inputs in section 1.`);
  lines.push(`- If section 2 matches until collision but differs at "after Collision", inspect section 3 for collider path, local coordinates, and radius.`);
  lines.push(`- If collision matches but "after AngleLimits" differs, inspect section 4 pivot/basis/min/max/angular stiffness.`);
  lines.push(`- For this event collisionStatus=${event.collisionStatus}; chosen collider status=${collider?.status ?? "none"}.`);

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const trace = JSON.parse(fs.readFileSync(options.input, "utf8"));
  const event = pickEvent(trace, options.event);
  const collider = pickCollider(event, options.collider);
  const report = buildReport(trace, event, collider);
  if (options.out) {
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, report);
  } else {
    process.stdout.write(report);
  }
}

main();
