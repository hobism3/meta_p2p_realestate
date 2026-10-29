// Meta 집톡이 실분석 스모크. 키 보유 환경에서만 실행한다. CI에서는 실행하지 않는다.
// 절차: 서버를 AGENT_PROVIDER=meta + MODEL_API_KEY로 기동한 뒤
//   BASE=http://127.0.0.1:PORT WRITE_TOKEN=... E2E_JWT_SECRET=... node tests/meta-smoke.mjs
// 합성 대화(제안→변경→철회→일정→미확인)를 넣고 provider/model/조건/근거를 출력한다.
// Mock으로 대체하지 않는다. provider가 meta가 아니면 실패로 종료한다.
import { mintTestToken } from "../lib/auth.ts";

const BASE = process.env.BASE ?? "http://127.0.0.1:3130";
const TOKEN = process.env.WRITE_TOKEN ?? "";
const SECRET = process.env.E2E_JWT_SECRET ?? "test-e2e-secret";
const bearer = mintTestToken("smoke-user", "스모크", "tenant", SECRET, Math.floor(Date.now() / 1000) + 3600);

async function api(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "x-write-token": TOKEN, Authorization: `Bearer ${bearer}` },
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

const room = await api("/api/deals/s21/rooms", { method: "POST", body: JSON.stringify({}) });
if (room.status !== 201) throw new Error(`방 생성 실패: ${room.status}`);
const rid = room.body.id;
const lines = [
  "44000만원에 합시다",
  "44500만원으로 올리겠습니다",
  "입주일은 언제인가요?",
];
for (const text of lines) {
  const s = await api(`/api/rooms/${rid}/messages`, { method: "POST", body: JSON.stringify({ text }) });
  if (s.status !== 201) throw new Error(`전송 실패: ${s.status}`);
  const z = await api(`/api/rooms/${rid}/ziptalk/invoke`, {
    method: "POST", body: JSON.stringify({ trigger_message_id: s.body.id }),
  });
  console.log(JSON.stringify({ text, status: z.status, provider: z.body?.provider, model: z.body?.model, bubble: z.body?.bubble_message_id ?? null }));
  if (z.body?.provider !== "meta") throw new Error(`실분석 아님: provider=${z.body?.provider}`);
}
const c = await api(`/api/rooms/${rid}/conditions`);
console.log(JSON.stringify(c.body, null, 2));
