import { describe, expect, test } from "bun:test";
import type { HueStatus } from "./api-types";
import { healthProblem } from "./health";

const linked: HueStatus = {
  linked: true,
  transport: "remote",
  lightId: "l1",
  lightName: "TV strip",
  bridgeId: "b1",
  tokenExpiresAt: new Date(10 * 86_400_000).toISOString(),
};

describe("healthProblem", () => {
  test("a healthy link says nothing", () => {
    expect(healthProblem(linked, null, 0)).toBeNull();
  });
  test("a rejected key comes first, with a relink fix", () => {
    const p = healthProblem(linked, "bridge_unauthorized", 0);
    expect(p?.fix).toBe("Relink");
    expect(p?.tone).toBe("bad");
  });
  test("a bridge that isn't answering says so", () => {
    expect(healthProblem(linked, "bridge_unreachable", 0)?.text).toMatch(
      /isn't answering/,
    );
  });
  test("a link that should have renewed by now warns", () => {
    const soon = {
      ...linked,
      tokenExpiresAt: new Date(3_600_000).toISOString(),
    };
    expect(healthProblem(soon, null, 0)?.tone).toBe("warn");
  });
  test("no strip chosen points to the picker", () => {
    expect(healthProblem({ ...linked, lightId: null }, null, 0)?.fix).toBe(
      "Pick a strip",
    );
  });
});
