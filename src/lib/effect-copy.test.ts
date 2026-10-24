import { expect, test } from "bun:test";
import { EFFECTS } from "@/engine/effects";
import { EFFECT_CAPTION } from "./effect-copy";

test("every effect the strip can play has a caption", () => {
  for (const key of Object.keys(EFFECTS))
    expect(EFFECT_CAPTION[key as keyof typeof EFFECT_CAPTION]).toBeTruthy();
});
