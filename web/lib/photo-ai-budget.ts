/**
 * Shared, atomic production cap across all Vercel instances.
 * Requires private Postgres schema directhome_private.photo_ai_call_budget.
 * Any database error fails closed (no provider request).
 */
import { getDal } from "@/lib/dal";

export async function reservePhotoAiAttempt(feature: "vision" | "edit"): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "production") return true;
  const max = feature === "vision" ? 3 : 2;
  try {
    return await getDal().withTransaction(async (tx) => {
      await tx.run(
        "INSERT INTO directhome_private.photo_ai_call_budget (feature, attempts) VALUES (?, 0) ON CONFLICT (feature) DO NOTHING",
        [feature],
      );
      const row = await tx.get(
        "UPDATE directhome_private.photo_ai_call_budget SET attempts=attempts+1, updated_at=NOW() WHERE feature=? AND attempts < ? RETURNING attempts",
        [feature, max],
      );
      return Boolean(row);
    });
  } catch { return false; }
}
