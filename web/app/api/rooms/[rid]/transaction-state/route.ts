import {guardRead,notFound,ok} from "@/lib/api";
import {authenticate} from "@/lib/auth";
import {getRoom,isRoomMember} from "@/lib/rooms";
import {readTransactionState} from "@/lib/transaction-state-service";

/** Read-only canonical projection; never treats AI text as confirmation. */
export async function GET(req:Request,{params}:{params:{rid:string}}){
 const g=guardRead(req);if(g)return g;
 const room=await getRoom(params.rid);
 if(!room)return notFound("거래방 없음");
 const auth=await authenticate(req);
 if("error" in auth)return ok({error:auth.error},auth.status);
 if(!await isRoomMember(params.rid,auth.identity.userId))
  return ok({error:"조회 권한 없음"},403);
 try{return ok(await readTransactionState(params.rid,auth.identity.userId));}
 catch{return ok({error:"거래 진행 상태를 불러오지 못했습니다."},500);}
}
