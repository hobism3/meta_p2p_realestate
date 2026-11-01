import type { OwnerAiPolicy } from "./owner-ai.ts";

export const BOOKING_DURATION_MINUTES = 60;
export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled";
export type SlotWindow = { weekday: number; start: string; end: string };

export function minutes(text:string):number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text);
  return match ? Number(match[1])*60+Number(match[2]) : -1;
}
export function hhmm(n:number):string {
  return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
}
export function validDate(date:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const d=new Date(date+"T00:00:00.000Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===date;
}
export function localKorea(date:Date=new Date()):{date:string;minute:number} {
  const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  const obj=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${obj.year}-${obj.month}-${obj.day}`,minute:Number(obj.hour)*60+Number(obj.minute)};
}
export function isBookableDate(date:string, now:Date=new Date()):boolean {
  if(!validDate(date))return false;
  const korea=localKorea(now);
  const delta=(Date.parse(date+"T00:00:00Z")-Date.parse(korea.date+"T00:00:00Z"))/86400000;
  return delta>=0&&delta<=60;
}
export function slotsForDate(
  availability:SlotWindow[],date:string,now:Date=new Date(),
):string[]{
  if(!isBookableDate(date,now))return [];
  // Gregorian civil weekday in Seoul; UTC midnight has the same local calendar date.
  const weekday=new Date(date+"T00:00:00Z").getUTCDay();
  const local=localKorea(now);
  const out:string[]=[];
  for(let start=0;start<=23*60;start+=30){
    if(date===local.date && start<=local.minute+59)continue;
    if(availability.some(w=>w.weekday===weekday && start>=minutes(w.start) &&
      start+BOOKING_DURATION_MINUTES<=minutes(w.end)))out.push(hhmm(start));
  }
  return out;
}
export function bookingCells(start:string):[string,string] | null {
  const m=minutes(start);
  if(m<0||m%30!==0||m+BOOKING_DURATION_MINUTES>1440)return null;
  return [start,hhmm(m+30)];
}
export function canCancel(status:BookingStatus):boolean {
  return status==="requested"||status==="confirmed";
}
export function decideStatus(current:BookingStatus,action:string,isOwner:boolean,isRequester:boolean):BookingStatus|null {
  if(action==="confirm" && isOwner && current==="requested")return "confirmed";
  if(action==="decline" && isOwner && current==="requested")return "declined";
  if(action==="cancel" && (isOwner||isRequester) && canCancel(current))return "cancelled";
  return null;
}
export function bookingLabel(status:BookingStatus):string {
  return ({requested:"집주인 승인 대기",confirmed:"방문 확정",declined:"집주인 거절",cancelled:"취소"})[status];
}
