import {guardRead,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {ownerAiJobFailures} from "@/lib/owner-ai-job-service";
export async function GET(req:Request){
 const g=guardRead(req);if(g)return g;
 const a=await authenticate(req);if("error" in a)return ok({error:a.error},a.status);
 return ok(await ownerAiJobFailures(a.identity.userId));
}