import { guardRead,ok } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { getDal } from "@/lib/dal";
import { getOwnerAiPolicy } from "@/lib/owner-ai";
export async function GET(req:Request){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 const rows=await getDal().all("SELECT l.id,l.title,l.address,l.trade_type,l.deposit,l.rent,l.sale_price, (SELECT COUNT(*) FROM deal_rooms d WHERE d.listing_id = l.id) AS room_count FROM custom_listings l WHERE l.owner_id = ? ORDER BY l.created_at DESC",[a.identity.userId]);
 return ok(await Promise.all(rows.map(async r=>({
  id:String(r.id), title:String(r.title),address:String(r.address),tradeType:String(r.trade_type),
  deposit:Number(r.deposit),rent:Number(r.rent),salePrice:Number(r.sale_price),rooms:Number(r.room_count),
  aiEnabled:(await getOwnerAiPolicy(String(r.id))).aiEnabled,
 }))));
}