import { gone, guardRead, guardWrite } from "@/lib/api";

// 구 공용 거래방 API는 폐쇄됐다(410). 과거 데이터는 보존한다.
export async function GET(req: Request): Promise<Response> {
  const g = guardRead(req);
  if (g) return g;
  return gone();
}

export async function POST(req: Request): Promise<Response> {
  const g = guardWrite(req);
  if (g) return g;
  return gone();
}
