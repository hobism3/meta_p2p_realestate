import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {ownerBookings} from "@/lib/owner-booking-service";
export async function GET(req:Request){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 return ok(await ownerBookings(a.identity.userId));
}
