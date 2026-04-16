import { colornames } from "color-name-list";
import tinycolor from "tinycolor2";

const nameMap: Record<string, string> = {};
for (const { name, hex } of colornames) {
  nameMap[name.toLowerCase()] = hex;
}

export function clubColorToHex(clubColors: string): string {
  if (!clubColors) return "#888888";
  const primary = clubColors.split(" / ")[0].trim();
  const fromExtended = nameMap[primary.toLowerCase()];
  if (fromExtended) return fromExtended;
  const color = tinycolor(primary);
  if (color.isValid()) return color.toHexString();
  return "#888888";
}
