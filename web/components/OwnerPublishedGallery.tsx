"use client";
import {useCallback,useEffect,useState} from "react";
import {authHeaders} from "../lib/client-auth";
import {PHOTO_ROOM_NAMES,type PhotoRoom} from "../lib/photo-guide";

type Photo={id:string;url:string;room:PhotoRoom;masked:boolean;publishedAt:string};
export default function OwnerPublishedGallery({listingId}:{listingId:string}){
 const [rows,setRows]=useState<Photo[]>([]);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [deleting,setDeleting]=useState<string|null>(null);
 const url="/api/listings/"+encodeURIComponent(listingId)+"/gallery";
 const load=useCallback(async()=>{
  try{
   const response=await fetch(url,{cache:"no-store"});
   const obj=await response.json() as {error?:string;photos?:Photo[]};
   if(!response.ok)throw Error(obj.error||"게시된 사진을 불러오지 못했습니다.");
   setRows(Array.isArray(obj.photos)?obj.photos:[]);setError("");
  }catch(e){setError(e instanceof Error?e.message:"사진 조회 실패");}
  finally{setLoading(false);}
 },[url]);
 useEffect(()=>{
  void load();
  const fn=()=>void load();
  window.addEventListener("directhome:gallery-published",fn);
  return()=>window.removeEventListener("directhome:gallery-published",fn);
 },[load]);
 const remove=async(photoId:string)=>{
  if(deleting||!window.confirm("이 사진을 공개 갤러리에서 삭제할까요?"))return;
  setDeleting(photoId);setError("");
  try{
   const response=await fetch(url+"/"+encodeURIComponent(photoId),{
    method:"DELETE",headers:{...authHeaders(),
     ...(process.env.NEXT_PUBLIC_WRITE_TOKEN?{"x-write-token":process.env.NEXT_PUBLIC_WRITE_TOKEN}:{})},
   });
   const obj=await response.json() as {error?:string};
   if(!response.ok)throw Error(obj.error||"삭제 실패");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"사진 삭제 실패");}
  finally{setDeleting(null);}
 };
 return <div aria-label="공개 중인 실제 매물 사진">
  {loading?<p role="status">게시된 사진을 확인하는 중...</p>:null}
  {error?<p role="alert">{error}</p>:null}
  <p className="meta">게시 중 {rows.length}/6장 · 집주인 계정에서만 삭제할 수 있습니다. 삭제 이후 기기·브라우저의 외부 캐시는 즉시 회수되지 않을 수 있습니다.</p>
  {rows.length?<div className="photo-guide-grid">{rows.map(photo=>
   <article key={photo.id} className="photo-guide-item">
    <img src={photo.url} alt={"게시자가 공개한 "+(PHOTO_ROOM_NAMES[photo.room]??"실내")+" 사진"} loading="lazy"/>
    <div className="photo-guide-item-text">
     <strong>{PHOTO_ROOM_NAMES[photo.room]??"공간 분류 미확인"}</strong>
     <p className="meta">{photo.masked?"개인영역 수동 가림 적용":"가림 적용 여부 미확인"} · 실제 원본/권리관계 인증 아님</p>
     <button type="button" className="btn ghost" disabled={deleting!==null} onClick={()=>void remove(photo.id)}>
      {deleting===photo.id?"삭제 중...":"공개 사진 삭제"}
     </button>
    </div>
   </article>)}</div>:<p>현재 공개한 실제 매물 사진이 없습니다. 아래에서 직접 사진을 검토한 뒤 게시해 주세요.</p>}
 </div>;
}
