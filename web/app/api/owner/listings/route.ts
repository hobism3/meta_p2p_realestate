import { guardRead,ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getOwnerAiPolicy } from "@/lib/owner-ai";
export async function GET(req:Request){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const rows=await getDal().all("SELECT id,title,address,trade_type,deposit,rent,sale_price FROM custom_listings WHERE owner_id = ? ORDER BY created_at DESC",[a.identity.userId]);
 return ok(await Promise.all(rows.map(async r=>({
  id:String(r.id), title:String(r.title),address:String(r.address),tradeType:String(r.trade_type),
  deposit:Number(r.deposit),rent:Number(r.rent),salePrice:Number(r.sale_price),
  aiEnabled:(await getOwnerAiPolicy(String(r.id))).aiEnabled,
 }))));
}