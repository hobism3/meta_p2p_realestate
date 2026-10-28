import { gone, guardRead, guardWrite } from "@/lib/api";

// 구 공용 거래방 API는 폐쇄됐다(410). 과거 데이터는 보존한다.
// 새 방 생성은 POST /api/deals/[id]/rooms, 대화는 /api/rooms/[rid]를 쓴다.
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
