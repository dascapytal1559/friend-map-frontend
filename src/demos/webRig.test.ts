// The spider's rig (webRig.ts): a head that looks almost at once within its
// range, a chassis that follows later and slower to face someone selected, and
// anyone else only from beyond the cone in front of it, an abdomen that
// trails, legs that stand fanned round the body as a star, keep their
// footholds and step, one
// gait at a time, when the body turns, each solved in three dimensions from
// its hip and its foothold, each standing where it likes within a range of its
// own, picked anew at every turn and drifting a little at rest, and a body
// that leans with its weight; all at once under reduced motion.

import { describe, expect, it } from "vitest";
import {
  BODY, BODY_HEIGHT, CENTRE, CHASSIS_DEAD, CHASSIS_DELAY, CHASSIS_RATE, CHASSIS_STOP, CONE, COXA, CROUCH, crouchShare, drift, DRIFT_LIFT, DRIFT_REST, DRIFT_SHARE, FEMUR, FOLD_LIMIT, FREEDOM, FOLLOW_AFTER, HEAD_RANGE, IDLE_REST, IDLE_SPREAD, legHip, legPose, legRest, LEGS, lookShare, METATARSUS, neighbours, newRig, OVERSHOOT, PATELLA, pickIdle, placeAnew, QUIRKS, restOf, roundDistance, roundLerp, standOf, startIdle, STEP_HEIGHT, STEP_MS, STEP_SPACING, STEP_TRIGGER, stepLift, stepShare, STRIDE, SWAY, TARSUS, TIBIA, twoBone, updateRig, wrapAngle, type IdleKind, type Rig, type RigInput, type XYZ,
} from "./webRig.ts";

const d3 = (a: XYZ, b: XYZ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const S = 50;
const UP = -Math.PI / 2;
const still: RigInput = { look: null, target: null, reduced: false, random: () => 0.5 };

/** Runs the rig on for `ms` in 16 ms frames from `from`, with `input`, calling `each` after every frame. */
function run(rig: Rig, from: number, ms: number, input: RigInput, each?: (now: number) => void): number {
  let now = from;
  for (let t = 16; t <= ms; t += 16) {
    now = from + t;
    updateRig(rig, now, 16, S, input);
    each?.(now);
  }
  return now;
}

describe("the head", () => {
  it("looks toward a target within its range almost at once, while the chassis stays", () => {
    const rig = newRig(UP, 0, S);
    run(rig, 0, 160, { ...still, look: UP + 0.8 });
    expect(Math.abs(wrapAngle(rig.head - (UP + 0.8)))).toBeLessThan(0.05);
    expect(rig.chassis).toBe(UP);
    expect(rig.turning).toBe(false);
  });

  it("holds where it last looked with nothing to look at", () => {
    const rig = newRig(UP, 0, S);
    run(rig, 0, 300, { ...still, look: UP + 0.5 });
    const held = rig.head;
    run(rig, 300, 2000, still);
    expect(rig.head).toBeCloseTo(held);
    expect(rig.chassis).toBe(UP);
  });
});

describe("a target beyond the head's range", () => {
  it("is looked at by the head first, at its limit, then the chassis follows, slower, until the head is on it", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + Math.PI * 0.9;
    const input = { ...still, look: target, target };
    run(rig, 0, 160, input);
    // Early: the head is at the end of its neck, and the chassis has not set off yet.
    expect(wrapAngle(rig.head - rig.chassis)).toBeGreaterThan(HEAD_RANGE - 0.1);
    expect(rig.chassis).toBe(UP);
    expect(rig.turning).toBe(false);
    run(rig, 160, 96, input);
    expect(rig.turning).toBe(true);
    expect(Math.abs(wrapAngle(rig.chassis - UP))).toBeGreaterThan(0);
    const chassisAt = (ms: number) => {
      const r = newRig(UP, 0, S);
      run(r, 0, ms, input);
      return Math.abs(wrapAngle(r.chassis - UP));
    };
    expect(chassisAt(200)).toBeLessThan(chassisAt(600));
    expect(chassisAt(600)).toBeLessThan(chassisAt(1200));
    run(rig, 256, 4000, input);
    expect(Math.abs(wrapAngle(rig.chassis - target))).toBeLessThan(CHASSIS_STOP);
    expect(Math.abs(wrapAngle(rig.head - target))).toBeLessThan(0.05);
    expect(rig.turning).toBe(false);
  });

  it("sets the chassis off only after the head has had a moment to look", () => {
    expect(CHASSIS_DELAY).toBeGreaterThan(100);
  });

  it("leaves the chassis alone for someone selected just off its line, within the dead zone", () => {
    const rig = newRig(UP, 0, S);
    run(rig, 0, 1000, { ...still, look: UP + CHASSIS_DEAD * 0.8, target: UP + CHASSIS_DEAD * 0.8, held: true });
    expect(rig.chassis).toBe(UP);
  });

  it("follows a free cursor only once it has been held beyond the head's reach a while", () => {
    const rig = newRig(UP, 0, S);
    const far = UP + Math.PI * 0.9;
    run(rig, 0, FOLLOW_AFTER - 100, { ...still, look: far });
    expect(rig.chassis).toBe(UP);
    run(rig, FOLLOW_AFTER - 100, 1500, { ...still, look: far });
    expect(Math.abs(wrapAngle(rig.chassis - UP))).toBeGreaterThan(0.5);
  });

  it("is trailed by the abdomen, which lags the chassis and then settles behind it", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + Math.PI * 0.9;
    let lagged = false;
    run(rig, 0, 3000, { ...still, look: target, target }, () => {
      if (Math.abs(wrapAngle(rig.chassis - rig.abdomen)) > 0.15) lagged = true;
    });
    expect(lagged).toBe(true);
    run(rig, 3000, 3000, { ...still, look: target, target });
    expect(Math.abs(wrapAngle(rig.abdomen - rig.chassis))).toBeLessThan(0.03);
  });
});

describe("the cone in front", () => {
  /** Runs a rig facing up on with a target `off` its heading, hovered unless `held`, and says where it ended and whether any leg stepped. */
  const toward = (off: number, held = false, ms = 3000) => {
    const rig = newRig(UP, 0, S);
    let stepped = false;
    run(rig, 0, ms, { ...still, look: UP + off, target: UP + off, held }, () => {
      if (rig.legs.some((leg) => leg.step)) stepped = true;
    });
    return { rig, stepped };
  };

  it("is 45° either side of where the body faces", () => {
    expect(CONE).toBeCloseTo(Math.PI / 4);
    expect(CONE).toBeLessThan(HEAD_RANGE);
    expect(CONE).toBeGreaterThan(CHASSIS_DEAD);
  });

  it("is where someone hovered is looked at by the head alone: the chassis stays and no leg steps, either side, right up to its edge", () => {
    for (const off of [CONE - 0.02, -(CONE - 0.02), 0.5, -0.3]) {
      const { rig, stepped } = toward(off);
      expect(rig.chassis).toBe(UP);
      expect(rig.turning).toBe(false);
      expect(Math.abs(wrapAngle(rig.head - (UP + off)))).toBeLessThan(0.05);
      expect(stepped).toBe(false);
    }
  });

  it("turns the chassis for someone hovered just beyond it, either side, the head first, until it faces them", () => {
    for (const off of [CONE + 0.02, -(CONE + 0.02)]) {
      const early = toward(off, false, 160);
      expect(early.rig.chassis).toBe(UP);
      expect(Math.abs(wrapAngle(early.rig.head - (UP + off)))).toBeLessThan(0.05);
      const { rig, stepped } = toward(off);
      expect(Math.abs(wrapAngle(rig.chassis - (UP + off)))).toBeLessThan(CHASSIS_STOP);
      expect(stepped).toBe(true);
    }
  });

  it("does not hold back the body from someone selected: it turns to face them within it too", () => {
    for (const off of [0.5, -(CONE - 0.02)]) {
      const { rig } = toward(off, true);
      expect(Math.abs(wrapAngle(rig.chassis - (UP + off)))).toBeLessThan(CHASSIS_STOP);
    }
  });

  it("gives the head its moment again when someone hovered beyond it is left for someone within it, and then someone beyond again", () => {
    const rig = newRig(UP, 0, S);
    const beyond = { ...still, look: UP + 1, target: UP + 1 };
    let now = run(rig, 0, 96, beyond);
    now = run(rig, now, 400, { ...still, look: UP + 0.3, target: UP + 0.3 });
    expect(rig.chassis).toBe(UP);
    now = run(rig, now, CHASSIS_DELAY - 32, beyond);
    expect(rig.chassis).toBe(UP);
    run(rig, now, 200, beyond);
    expect(rig.turning).toBe(true);
  });
});

describe("the legs", () => {
  it("start planted at rest, each with a foothold on the web", () => {
    const rig = newRig(UP, 0, S);
    expect(rig.legs.length).toBe(8);
    for (const leg of rig.legs) {
      const rest = legRest(rig, leg, S);
      expect(leg.foot.x).toBeCloseTo(rest.x);
      expect(leg.foot.y).toBeCloseTo(rest.y);
      expect(leg.step).toBeNull();
    }
  });

  it("step through a far turn from its start, staggered and overlapping, never a neighbour of one in the air, and are planted at rest by its end with no late step", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + Math.PI * 0.9;
    const input = { ...still, look: target, target };
    const starts: number[] = [];
    const seen = new Set<string>();
    let mostInAir = 0;
    let neighboursInAir = false;
    let chassisStoppedAt: number | null = null;
    run(rig, 0, 6000, input, (now) => {
      const flying = rig.legs.filter((l) => l.step);
      mostInAir = Math.max(mostInAir, flying.length);
      for (const a of flying) for (const b of flying) if (a !== b && neighbours(a, b)) neighboursInAir = true;
      for (const l of flying) {
        const key = `${l.side}${l.index}@${l.step!.start}`;
        if (!seen.has(key)) {
          seen.add(key);
          starts.push(l.step!.start);
          expect(l.step!.length).toBeGreaterThanOrEqual(STEP_MS);
          // A stride at most.
          expect(Math.hypot(l.step!.to.x - l.step!.from.x, l.step!.to.y - l.step!.from.y)).toBeLessThanOrEqual(STRIDE * S + 1e-6);
        }
      }
      if (chassisStoppedAt === null && now > 500 && !rig.turning) chassisStoppedAt = now;
    });
    // Early: the first step begins with the turn, before the chassis has even set off.
    expect(starts[0]).toBeLessThanOrEqual(CHASSIS_DELAY + 32);
    // Staggered: no two within the spacing; and no long holds while the chassis turns.
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(STEP_SPACING - 1e-6);
    const turning = starts.filter((at) => chassisStoppedAt === null || at < chassisStoppedAt);
    for (let i = 1; i < turning.length; i++) expect(turning[i] - turning[i - 1]).toBeLessThan(400);
    // Overlapping: more than one leg in the air at a time, but never neighbours.
    expect(mostInAir).toBeGreaterThanOrEqual(2);
    expect(neighboursInAir).toBe(false);
    // Every leg stepped, and none snaps late: the last strides begin within half a second of the chassis stopping.
    expect(new Set([...seen].map((k) => k.split("@")[0])).size).toBe(8);
    expect(chassisStoppedAt).not.toBeNull();
    expect(Math.max(...starts)).toBeLessThan(chassisStoppedAt! + 500);
    for (const leg of rig.legs) {
      expect(leg.step).toBeNull();
      const rest = legRest(rig, leg, S);
      expect(Math.hypot(rest.x - leg.foot.x, rest.y - leg.foot.y)).toBeLessThan(STEP_TRIGGER * S);
    }
  });

  it("keep their stance through a far turn: no planted foot comes much nearer its hip than it stands, and the chassis turns no faster than they carry it", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + Math.PI * 0.9;
    let worstFold = 0;
    let fastest = 0;
    let last = rig.chassis;
    run(rig, 0, 5000, { ...still, look: target, target, random: seeded(5) }, () => {
      fastest = Math.max(fastest, Math.abs(wrapAngle(rig.chassis - last)) / 0.016);
      last = rig.chassis;
      for (const leg of rig.legs) {
        const hip = legHip(rig, leg, S);
        worstFold = Math.max(worstFold, 1 - Math.hypot(leg.foot.x - rig.sway.x - hip.x, leg.foot.y - rig.sway.y - hip.y) / (standOf(leg.side, leg.index, leg.placement) * S));
      }
    });
    expect(worstFold).toBeLessThan(FOLD_LIMIT + 0.08);
    expect(fastest).toBeLessThanOrEqual(CHASSIS_RATE + 1e-6);
    expect(Math.abs(wrapAngle(rig.chassis - target))).toBeLessThan(CHASSIS_STOP);
  });

  it("step a little for a near turn too, to someone selected, and settle planted", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + 0.6;
    let steps = 0;
    const seen = new Set<string>();
    run(rig, 0, 3000, { ...still, look: target, target, held: true }, () => {
      for (const l of rig.legs) if (l.step && !seen.has(`${l.side}${l.index}@${l.step.start}`)) {
        seen.add(`${l.side}${l.index}@${l.step.start}`);
        steps++;
      }
    });
    expect(steps).toBeGreaterThan(0);
    for (const leg of rig.legs) expect(leg.step).toBeNull();
  });

  it("stride with an ease that reaches a little past the mark and settles, lifting quickly and planting softly", () => {
    expect(stepShare(0)).toBe(0);
    expect(stepShare(1)).toBe(1);
    expect(stepShare(0.8)).toBeCloseTo(1 + OVERSHOOT);
    expect(stepShare(0.9)).toBeGreaterThan(1);
    expect(stepShare(0.9)).toBeLessThan(1 + OVERSHOOT);
    expect(stepLift(0)).toBe(0);
    expect(stepLift(1)).toBe(0);
    expect(stepLift(0.3)).toBeGreaterThan(stepLift(0.7));
    const a = { side: -1 as const, index: 1, foot: { x: 0, y: 0 }, step: null, landedAt: 0, placement: CENTRE };
    expect(neighbours(a, { ...a, index: 2 })).toBe(true);
    expect(neighbours(a, { ...a, side: 1 })).toBe(true);
    expect(neighbours(a, { ...a, side: 1, index: 3 })).toBe(false);
  });

  it("shift their weight now and then at rest", () => {
    const rig = newRig(UP, 0, S);
    let stepped = false;
    run(rig, 0, 9000, still, () => {
      if (rig.legs.some((l) => l.step)) stepped = true;
    });
    expect(stepped).toBe(true);
  });
});

/** A run of numbers that is the same every time. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("a life of its own at rest", () => {
  it("does one thing or another now and then, every kind in time, never on a loop, and nothing while someone is looked at", () => {
    const rig = newRig(UP, 0, S);
    const random = seeded(7);
    const seen: IdleKind[] = [];
    const starts: number[] = [];
    run(rig, 0, 240_000, { ...still, random }, (now) => {
      if (rig.idle && rig.idle.start === now - 16) {
        seen.push(rig.idle.kind);
        starts.push(rig.idle.start);
      }
    });
    expect(new Set(seen)).toEqual(new Set<IdleKind>(["shift", "pluck", "groom", "look", "settle", "flex"]));
    const gaps = starts.slice(1).map((at, i) => at - starts[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(IDLE_REST);
    expect(new Set(gaps.map((g) => Math.round(g / 100))).size).toBeGreaterThan(5);
    // Looking at someone, it does nothing of its own.
    const watching = newRig(UP, 0, S);
    run(watching, 0, 30_000, { ...still, look: UP + 0.3, target: UP + 0.3, random: seeded(3) });
    expect(watching.idle).toBeNull();
    // The roll decides the kind, the common ones most.
    expect([0, 0.3, 0.6, 0.72, 0.9, 0.97].map(pickIdle)).toEqual(["pluck", "shift", "groom", "look", "settle", "flex"]);
  });

  it("grooms: a front leg folds up beside the face, higher than a step, and comes back to its rest", () => {
    const rig = newRig(UP, 0, S);
    const act = startIdle(rig, "groom", 0, S, () => 0.9);
    const leg = act.leg!;
    expect(leg.index).toBe(0);
    const rest = legRest(rig, leg, S);
    let nearest = Infinity;
    let highest = 0;
    run(rig, 0, 1200, still, (now) => {
      nearest = Math.min(nearest, Math.hypot(leg.foot.x, leg.foot.y));
      highest = Math.max(highest, legPose(rig, leg, S, now).foot.z);
    });
    expect(nearest).toBeLessThan(0.8 * S);
    expect(highest).toBeGreaterThan(STEP_HEIGHT * S * 1.3);
    expect(leg.step).toBeNull();
    expect(Math.hypot(leg.foot.x - rest.x, leg.foot.y - rest.y)).toBeLessThan(0.01 * S);
    expect(rig.idle).toBeNull();
  });

  it("plucks: a leg lifts high twice, and is back on its foothold after", () => {
    const rig = newRig(UP, 0, S);
    const act = startIdle(rig, "pluck", 0, S, () => 0.2);
    const leg = act.leg!;
    const rest = legRest(rig, leg, S);
    const lifts: number[] = [];
    run(rig, 0, 700, still, (now) => lifts.push(legPose(rig, leg, S, now).foot.z));
    // Two peaks, with a trough between.
    const peak = Math.max(...lifts);
    expect(peak).toBeGreaterThan(STEP_HEIGHT * S * 1.2);
    const first = lifts.findIndex((z) => z > peak * 0.6);
    const trough = lifts.slice(first).findIndex((z) => z < peak * 0.2) + first;
    expect(lifts.slice(trough).some((z) => z > peak * 0.5)).toBe(true);
    expect(leg.step).toBeNull();
    expect(Math.hypot(leg.foot.x - rest.x, leg.foot.y - rest.y)).toBeLessThan(0.01 * S);
  });

  it("looks round: the head turns aside of its own and comes back, slower than a look at someone", () => {
    const rig = newRig(UP, 0, S);
    const act = startIdle(rig, "look", 0, S, () => 0.9);
    expect(Math.abs(act.dir)).toBeGreaterThan(0.3);
    let furthest = 0;
    run(rig, 0, act.length + 400, still, () => {
      furthest = Math.max(furthest, Math.abs(wrapAngle(rig.head - rig.chassis)));
    });
    expect(furthest).toBeGreaterThan(Math.abs(act.dir) * 0.8);
    expect(Math.abs(wrapAngle(rig.head - rig.chassis))).toBeLessThan(0.05);
    expect(rig.chassis).toBe(UP);
    expect(lookShare(0)).toBe(0);
    expect(lookShare(0.5)).toBe(1);
    expect(lookShare(1)).toBe(0);
  });

  it("settles: the body dips and rises, its hips nearer the web meanwhile", () => {
    const rig = newRig(UP, 0, S);
    startIdle(rig, "settle", 0, S, () => 0.5);
    let deepest = 0;
    let lowest = Infinity;
    run(rig, 0, 2400, still, (now) => {
      deepest = Math.max(deepest, rig.crouch);
      lowest = Math.min(lowest, legPose(rig, rig.legs[1], S, now).hip.z);
    });
    expect(deepest).toBeGreaterThan(0.9);
    expect(lowest).toBeLessThan(BODY_HEIGHT * S * (1 - CROUCH * 0.9));
    expect(rig.crouch).toBeLessThan(0.05);
    expect(crouchShare(0.5)).toBe(1);
    expect(crouchShare(1)).toBe(0);
  });

  it("flexes: the abdomen wags on its spring and settles back behind the chassis", () => {
    const rig = newRig(UP, 0, S);
    startIdle(rig, "flex", 0, S, () => 0.5);
    let swung = 0;
    run(rig, 0, 2500, still, () => {
      swung = Math.max(swung, Math.abs(wrapAngle(rig.abdomen - rig.chassis)));
    });
    expect(swung).toBeGreaterThan(0.05);
    expect(Math.abs(wrapAngle(rig.abdomen - rig.chassis))).toBeLessThan(0.03);
  });

  it("has none of it under reduced motion", () => {
    const rig = newRig(UP, 0, S);
    const random = seeded(11);
    run(rig, 0, 60_000, { ...still, reduced: true, random }, () => {
      expect(rig.idle).toBeNull();
      expect(rig.crouch).toBe(0);
      expect(rig.head).toBe(UP);
    });
  });

  it("meet two bones at a joint the right distance from both ends, on the side asked for, reaching toward an end too far away", () => {
    const a = { x: 0, y: 0, z: 0 };
    const up = { x: 0, y: 0, z: 1 };
    const { joint, end } = twoBone(a, { x: 30, y: 0, z: 0 }, 20, 20, up);
    expect(d3(joint, a)).toBeCloseTo(20);
    expect(d3(joint, end)).toBeCloseTo(20);
    expect(joint.z).toBeGreaterThan(0);
    expect(twoBone(a, { x: 30, y: 0, z: 0 }, 20, 20, { x: 0, y: 0, z: -1 }).joint.z).toBeLessThan(0);
    // Asked for a side that leans along the line, the joint still goes across it, as far as the bones allow.
    const leaning = twoBone(a, { x: 30, y: 0, z: 0 }, 20, 20, { x: 1, y: 0, z: 1 }).joint;
    expect(leaning.x).toBeCloseTo(15);
    expect(leaning.z).toBeCloseTo(Math.sqrt(20 * 20 - 15 * 15));
    const far = twoBone(a, { x: 100, y: 0, z: 0 }, 20, 20, up);
    expect(d3(far.end, a)).toBeLessThan(40);
    expect(d3(far.joint, a)).toBeCloseTo(20);
  });

  it("stand on the web in three dimensions: the hips up off it, the knee high above it, every segment its own length, the foot on its foothold", () => {
    const rig = newRig(UP, 0, S);
    for (const leg of rig.legs) {
      const pose = legPose(rig, leg, S, 0);
      expect(pose.hip.z).toBeCloseTo(BODY_HEIGHT * S);
      expect(pose.foot.z).toBe(0);
      expect(pose.foot.x).toBeCloseTo(leg.foot.x);
      expect(pose.foot.y).toBeCloseTo(leg.foot.y);
      expect(pose.knee.z).toBeGreaterThan(pose.hip.z);
      expect(pose.ankle.z).toBeGreaterThan(0);
      expect(d3(pose.hip, pose.trochanter)).toBeCloseTo(Math.hypot(COXA * S, 0.02 * S));
      expect(d3(pose.trochanter, pose.knee)).toBeCloseTo(FEMUR * S);
      expect(d3(pose.knee, pose.patella)).toBeCloseTo(PATELLA * S);
      expect(d3(pose.patella, pose.ankle)).toBeCloseTo(TIBIA * S);
      expect(d3(pose.ankle, pose.tarsus)).toBeCloseTo(METATARSUS * S);
      expect(d3(pose.tarsus, pose.foot)).toBeCloseTo(TARSUS * S);
      expect(pose.fold).toBeGreaterThan(0.2);
      expect(pose.fold).toBeLessThan(0.6);
    }
  });

  it("lean back at the knee, so from above the front three pairs bow out behind their lines, their femurs fanned round the body and their knees well outside it, and the rear pair stands nearly straight; and lift a stepping foot off the web", () => {
    const rig = newRig(UP, 0, S);
    // Facing up the screen, back is +y: a front leg's knee is further down than the straight line from its hip to its foot would put it.
    const poses = rig.legs.map((leg) => ({ leg, pose: legPose(rig, leg, S, 0) }));
    const across = (pose: ReturnType<typeof legPose>) => {
      const fx = pose.foot.x - pose.hip.x;
      const fy = pose.foot.y - pose.hip.y;
      const t = ((pose.knee.x - pose.hip.x) * fx + (pose.knee.y - pose.hip.y) * fy) / (fx * fx + fy * fy);
      return { back: pose.knee.y - (pose.hip.y + fy * t), off: Math.hypot(pose.knee.x - (pose.hip.x + fx * t), pose.knee.y - (pose.hip.y + fy * t)) };
    };
    const front = poses.filter(({ leg }) => leg.index < 3).map(({ pose }) => across(pose));
    const rear = poses.filter(({ leg }) => leg.index === 3).map(({ pose }) => across(pose));
    for (const { back } of front) expect(back).toBeGreaterThan(0.05 * S);
    for (const { off } of rear) expect(off).toBeLessThan(Math.min(...front.map((f) => f.off)) * 0.6);
    // The femurs, from above, fan out round the body: each pair's more sideways than its foot on the front three pairs, and in order front to back.
    const angle = (leg: (typeof rig.legs)[number], at: XYZ) => (Math.atan2(leg.side * (at.x - legHip(rig, leg, S).x), -(at.y - legHip(rig, leg, S).y)) * 180) / Math.PI;
    for (const side of [-1, 1] as const) {
      const ours = poses.filter(({ leg }) => leg.side === side);
      const femurs = ours.map(({ leg, pose }) => angle(leg, pose.knee));
      for (let i = 0; i < 3; i++) expect(femurs[i]).toBeGreaterThan(angle(ours[i].leg, ours[i].pose.foot) + 10);
      for (let i = 1; i < 4; i++) expect(femurs[i]).toBeGreaterThan(femurs[i - 1] + 15);
    }
    // The knees stand well outside the body: further from the hub than the thorax is wide, by a long way.
    for (const { pose } of poses) expect(Math.hypot(pose.knee.x, pose.knee.y)).toBeGreaterThan(0.55 * S);
    const leg = rig.legs[1];
    leg.step = { from: leg.foot, to: leg.foot, start: 0, length: 200 };
    const lifted = legPose(rig, leg, S, 100);
    expect(lifted.up).toBeGreaterThan(0.9);
    expect(lifted.foot.z).toBeGreaterThan(STEP_HEIGHT * S * 0.9);
    expect(Math.hypot(lifted.foot.x, lifted.foot.y)).toBeGreaterThan(Math.hypot(leg.foot.x, leg.foot.y));
  });

  it("stand fanned round the body as a star, as a spider stands seen from above: the front pair forward, the second forward of sideways, the third about sideways and the rear pair back, each about as far from the hub, and every foot well apart from its neighbour", () => {
    // Each pair's foot at rest, from the hub: its angle from straight ahead, degrees, and its distance.
    const feet = LEGS.map(({ rest }) => ({ angle: (Math.atan2(rest.x, -rest.y) * 180) / Math.PI, far: Math.hypot(rest.x, rest.y) }));
    expect(feet[0].angle).toBeGreaterThan(20);
    expect(feet[0].angle).toBeLessThan(32);
    expect(feet[1].angle).toBeGreaterThan(48);
    expect(feet[1].angle).toBeLessThan(62);
    expect(feet[2].angle).toBeGreaterThan(85);
    expect(feet[2].angle).toBeLessThan(100);
    expect(feet[3].angle).toBeGreaterThan(128);
    expect(feet[3].angle).toBeLessThan(145);
    for (let i = 1; i < 4; i++) expect(feet[i].angle - feet[i - 1].angle).toBeGreaterThan(25);
    const far = feet.map((f) => f.far);
    expect(Math.max(...far) / Math.min(...far)).toBeLessThan(1.1);
  });

  it("are long, on a small body, every rest within reach with a bend to spare, the back ones no straighter than the front", () => {
    expect(BODY).toBeLessThan(0.8);
    const reach = COXA + Math.sqrt((FEMUR + PATELLA + TIBIA + METATARSUS + TARSUS) ** 2 - BODY_HEIGHT ** 2);
    expect(reach).toBeGreaterThan(2);
    const extension = LEGS.map((leg) => Math.hypot(leg.rest.x - leg.hip.x, leg.rest.y - leg.hip.y) / reach);
    for (const e of extension) {
      expect(e).toBeGreaterThan(0.5);
      expect(e).toBeLessThan(0.75);
    }
    expect(Math.max(extension[2], extension[3])).toBeLessThan(Math.max(extension[0], extension[1]) + 0.1);
    // Each leg's own rest too, with its quirk.
    for (const side of [-1, 1] as const) {
      for (let index = 0; index < 4; index++) {
        const e = standOf(side, index) / reach;
        expect(e).toBeGreaterThan(0.5);
        expect(e).toBeLessThan(0.78);
      }
    }
  });

  it("stand and bend a little unlike their opposites and their neighbours, never mirror-perfect, and always the same", () => {
    const reach = COXA + Math.sqrt((FEMUR + PATELLA + TIBIA + METATARSUS + TARSUS) ** 2 - BODY_HEIGHT ** 2);
    for (let index = 0; index < 4; index++) {
      const left = restOf(-1, index);
      const right = restOf(1, index);
      // Mirrored, the two rests differ: a little, never a lot.
      const off = Math.hypot(-left.x - right.x, left.y - right.y);
      expect(off).toBeGreaterThan(0.02 * reach);
      expect(off).toBeLessThan(0.12 * reach);
      expect(restOf(-1, index)).toEqual(left);
    }
    const quirks = [...QUIRKS[-1], ...QUIRKS[1]];
    expect(new Set(quirks.map((q) => q.lean)).size).toBe(8);
    expect(new Set(quirks.map((q) => q.turn)).size).toBeGreaterThan(5);
    for (const q of quirks) {
      expect(Math.abs(q.turn)).toBeLessThan(5);
      expect(Math.abs(q.reach - 1)).toBeLessThan(0.06);
      expect(Math.abs(q.lean - 1)).toBeLessThan(0.15);
    }
    // The bend differs too: opposite knees sit at different heights, and the same every time.
    const rig = newRig(UP, 0, S);
    const a = legPose(rig, rig.legs[0], S, 0);
    const b = legPose(rig, rig.legs[4], S, 0);
    expect(rig.legs[0].side).not.toBe(rig.legs[4].side);
    expect(rig.legs[0].index).toBe(rig.legs[4].index);
    expect(Math.abs(a.knee.z - b.knee.z)).toBeGreaterThan(0.001 * S);
    expect(Math.abs(a.knee.z - b.knee.z)).toBeLessThan(0.15 * S);
    expect(legPose(rig, rig.legs[0], S, 0)).toEqual(a);
  });

  it("step round the hub, keeping their distance from it, rather than across", () => {
    const a = { x: 100, y: 0 };
    const b = { x: 0, y: 100 };
    const mid = roundLerp(a, b, 0.5);
    expect(Math.hypot(mid.x, mid.y)).toBeCloseTo(100);
    expect(mid.x).toBeCloseTo(mid.y);
    expect(roundLerp(a, b, 0)).toEqual(a);
    expect(roundLerp(a, b, 1).y).toBeCloseTo(100);
    // The short way round, and in or out as asked.
    const back = roundLerp({ x: 100, y: 1 }, { x: 100, y: -1 }, 0.5);
    expect(back.x).toBeCloseTo(100, 1);
    expect(roundLerp({ x: 100, y: 0 }, { x: 50, y: 0 }, 0.5)).toEqual({ x: 75, y: 0 });
    expect(roundDistance(a, b)).toBeCloseTo((Math.PI / 2) * 100);
    expect(roundDistance({ x: 100, y: 0 }, { x: 60, y: 0 })).toBeCloseTo(40);
  });
});

/** The angle of a leg's line from its hip to its rest, in the body's frame, degrees. */
function lineOf(side: -1 | 1, index: number, placement = CENTRE): number {
  const rest = restOf(side, index, placement);
  return (Math.atan2(rest.y - LEGS[index].hip.y, side * (rest.x - side * LEGS[index].hip.x)) * 180) / Math.PI;
}

/** Every corner of a leg's freedom, and its middle. */
const CORNERS = [CENTRE, ...[-1, 1].flatMap((turn) => [-1, 1].map((reach) => ({ turn, reach })))];

describe("each leg's freedom", () => {
  it("is a few degrees round its hip and a little in or out, widest on the front pair and least on the rear", () => {
    for (const free of FREEDOM) {
      expect(free.turn).toBeGreaterThan(2);
      expect(free.turn).toBeLessThan(12);
      expect(free.reach).toBeGreaterThan(0.01);
      expect(free.reach).toBeLessThan(0.08);
    }
    expect(FREEDOM[0].turn).toBeGreaterThan(FREEDOM[3].turn);
    // At its corners a leg's line turns by its freedom and no more, and it stands that much nearer or further.
    for (const side of [-1, 1] as const) {
      for (let index = 0; index < 4; index++) {
        const free = FREEDOM[index];
        expect(Math.abs(lineOf(side, index, { turn: 1, reach: 0 }) - lineOf(side, index))).toBeCloseTo(free.turn);
        expect(standOf(side, index, { turn: 0, reach: 1 }) / standOf(side, index)).toBeCloseTo(1 + free.reach);
        expect(standOf(side, index, { turn: 0, reach: -1 }) / standOf(side, index)).toBeCloseTo(1 - free.reach);
      }
    }
  });

  it("keeps every leg within reach with a bend to spare, and clear of its neighbours' lines, wherever within it each stands", () => {
    const reach = COXA + Math.sqrt((FEMUR + PATELLA + TIBIA + METATARSUS + TARSUS) ** 2 - BODY_HEIGHT ** 2);
    for (const side of [-1, 1] as const) {
      for (let index = 0; index < 4; index++) {
        for (const corner of CORNERS) {
          const e = standOf(side, index, corner) / reach;
          expect(e).toBeGreaterThan(0.5);
          expect(e).toBeLessThan(0.8);
        }
        if (index === 3) continue;
        // The leg behind, turned as far forward as it goes, still lies well behind this one turned as far back.
        const thisBack = Math.max(...CORNERS.map((c) => lineOf(side, index, c)));
        const nextForward = Math.min(...CORNERS.map((c) => lineOf(side, index + 1, c)));
        expect(nextForward - thisBack).toBeGreaterThan(10);
      }
    }
  });

  it("is where a new place is picked, and a drift goes a little and never past its edge", () => {
    const random = seeded(17);
    for (let i = 0; i < 500; i++) {
      const placed = placeAnew(random);
      for (const v of [placed.turn, placed.reach]) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
      const drifted = drift(placed, random);
      for (const key of ["turn", "reach"] as const) {
        expect(Math.abs(drifted[key])).toBeLessThanOrEqual(1);
        expect(Math.abs(drifted[key] - placed[key])).toBeLessThanOrEqual(DRIFT_SHARE + 1e-9);
      }
    }
    // At its edge, a drift can only come back in.
    expect(drift({ turn: 1, reach: -1 }, () => 1)).toEqual({ turn: 1, reach: -1 + DRIFT_SHARE });
    expect(drift({ turn: 1, reach: -1 }, () => 0)).toEqual({ turn: 1 - DRIFT_SHARE, reach: -1 });
  });

  it("is picked anew by every leg at every turn, at random and unlike its opposite, and the legs step to and plant on those places", () => {
    const rig = newRig(UP, 0, S);
    const random = seeded(23);
    const stances: string[] = [];
    let now = 0;
    for (const target of [UP + Math.PI * 0.9, UP - 0.8, UP + 1.6]) {
      const before = rig.legs.map((leg) => leg.placement);
      now = run(rig, now, 5000, { ...still, look: target, target, random });
      rig.legs.forEach((leg, i) => {
        expect(leg.placement).not.toEqual(before[i]);
        expect(Math.abs(leg.placement.turn)).toBeLessThanOrEqual(1);
        expect(Math.abs(leg.placement.reach)).toBeLessThanOrEqual(1);
        expect(leg.step).toBeNull();
        const rest = legRest(rig, leg, S);
        expect(Math.hypot(rest.x - leg.foot.x, rest.y - leg.foot.y)).toBeLessThan(STEP_TRIGGER * S);
      });
      // Never mirrored: each leg stands otherwise than its opposite.
      for (let index = 0; index < 4; index++) {
        const left = rig.legs.find((l) => l.side === -1 && l.index === index)!;
        const right = rig.legs.find((l) => l.side === 1 && l.index === index)!;
        expect(left.placement).not.toEqual(right.placement);
      }
      stances.push(JSON.stringify(rig.legs.map((leg) => leg.placement)));
    }
    expect(new Set(stances).size).toBe(3);
  });

  it("is drifted within at rest: a leg at a time now and then, barely lifted, never beside or across from one in the air, and never past its edge", () => {
    const rig = newRig(UP, 0, S);
    const random = seeded(29);
    const drifts: number[] = [];
    const moved = new Set<string>();
    run(rig, 0, 120_000, { ...still, random }, (now) => {
      const flying = rig.legs.filter((l) => l.step);
      for (const a of flying) for (const b of flying) expect(a !== b && neighbours(a, b)).toBe(false);
      for (const leg of rig.legs) {
        expect(Math.abs(leg.placement.turn)).toBeLessThanOrEqual(1);
        expect(Math.abs(leg.placement.reach)).toBeLessThanOrEqual(1);
        if (leg.step?.start === now && leg.step.lift === DRIFT_LIFT) {
          drifts.push(now);
          moved.add(`${leg.side}${leg.index}`);
          // A little: well within a plain step's trigger.
          expect(Math.hypot(leg.step.to.x - leg.step.from.x, leg.step.to.y - leg.step.from.y)).toBeLessThan(0.4 * S);
        }
      }
    });
    // Now and then, one at a time, never on a beat, and every leg in time.
    expect(drifts.length).toBeGreaterThan(8);
    const gaps = drifts.slice(1).map((at, i) => at - drifts[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(DRIFT_REST);
    expect(new Set(gaps.map((g) => Math.round(g / 100))).size).toBeGreaterThan(5);
    expect(moved.size).toBe(8);
    // Every drift has landed and the feet are where their places say.
    run(rig, 120_000, 1000, { ...still, random: () => 0.5, look: UP, target: UP });
    for (const leg of rig.legs) {
      const rest = legRest(rig, leg, S);
      expect(Math.hypot(rest.x - leg.foot.x, rest.y - leg.foot.y)).toBeLessThan(0.05 * S);
    }
  });

  it("is never drifted within while someone is looked at, nor under reduced motion, nor picked anew at a turn under it", () => {
    const watching = newRig(UP, 0, S);
    // Within the dead zone, so the body does not turn either.
    run(watching, 0, 30_000, { ...still, look: UP + 0.2, target: UP + 0.2, random: seeded(3) });
    for (const leg of watching.legs) expect(leg.placement).toEqual(CENTRE);
    const calm = newRig(UP, 0, S);
    run(calm, 0, 30_000, { ...still, reduced: true, random: seeded(31) }, () => {
      for (const leg of calm.legs) expect(leg.step).toBeNull();
    });
    updateRig(calm, 30_016, 16, S, { ...still, look: UP + 2, target: UP + 2, reduced: true, random: seeded(37) });
    for (const leg of calm.legs) {
      expect(leg.placement).toEqual(CENTRE);
      const rest = legRest(calm, leg, S);
      expect(leg.foot.x).toBeCloseTo(rest.x);
      expect(leg.foot.y).toBeCloseTo(rest.y);
    }
  });
});

describe("the body's weight", () => {
  it("leans away from a leg in the air, and is back over the hub once every leg is planted", () => {
    const rig = newRig(UP, 0, S);
    expect(rig.sway).toEqual({ x: 0, y: 0 });
    const leg = rig.legs.find((l) => l.side === 1 && l.index === 2)!;
    leg.step = { from: leg.foot, to: leg.foot, start: 0, length: 100_000 };
    run(rig, 0, 1000, still);
    // The leg is out to the right: the body leans left.
    expect(rig.sway.x).toBeLessThan(-SWAY * S * 0.8);
    expect(Math.abs(rig.sway.y)).toBeLessThan(Math.abs(rig.sway.x) * 0.5);
    leg.step = null;
    run(rig, 1000, 1500, still);
    expect(Math.abs(rig.sway.x)).toBeLessThan(0.05);
  });
});

describe("under reduced motion", () => {
  it("every part goes straight to where it is headed, with no steps", () => {
    const rig = newRig(UP, 0, S);
    const target = UP + Math.PI * 0.9;
    updateRig(rig, 16, 16, S, { look: target, target, reduced: true, random: () => 0.5 });
    expect(rig.chassis).toBe(target);
    expect(rig.abdomen).toBe(target);
    expect(Math.abs(wrapAngle(rig.head - target))).toBeLessThan(1e-9);
    for (const leg of rig.legs) {
      expect(leg.step).toBeNull();
      const rest = legRest(rig, leg, S);
      expect(leg.foot.x).toBeCloseTo(rest.x);
    }
    expect(rig.sway).toEqual({ x: 0, y: 0 });
  });
});
