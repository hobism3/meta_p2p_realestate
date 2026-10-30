import type { RegistryDraft } from "./registry-draft";

type TitleFields = Pick<RegistryDraft, "buildingName" | "buildingType" | "buildingDong" | "floor" | "unit">;

function unit(value: string, suffix: "동" | "층" | "호"): string {
  const digits = value.trim().replace(/^제/, "").replace(new RegExp(suffix + "$"), "").trim();
  // A numeric unit may contain a leading zero (e.g. 0501호). Keep the exact
  // identifier from the document rather than coercing away leading zeros.
  const valid = digits.length >= 1 && digits.length <= 4 &&
    Array.from(digits).every(ch => ch >= "0" && ch <= "9") && Number(digits) > 0;
  return valid ? `${digits}${suffix}` : "";
}

/** A draft label for the form; never a validated property identity. */
export function registryDraftTitle(d: TitleFields): string {
  const name = d.buildingName.value || d.buildingType.value;
  const dong = unit(d.buildingDong.value, "동");
  const unitOrFloor = unit(d.unit.value, "호") || unit(d.floor.value, "층");
  const pieces = [name, dong, unitOrFloor].filter(Boolean);
  return pieces.length ? `${pieces.join(" ")} (확인 필요)` : "";
}
