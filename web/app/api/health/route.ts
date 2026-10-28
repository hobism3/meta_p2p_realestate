import { guardRead, ok } from "@/lib/api";
import { getDal } from "@/lib/dal";

export async function GET(req: Request): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  let db: string;
  const kind = getDal().kind;
  try {
    await getDal().all("SELECT 1");
    db = "up";
  } catch {
    db = "down";
  }
  return ok({ ok: true, db, kind });
}
