import { authHeaders } from "./client-auth.ts";
import { SEED_LISTINGS, type Listing } from "./listings.ts";

export async function loadAllListings(): Promise<Listing[]> {
  const res = await fetch("/api/listings");
  if (!res.ok) throw new Error("매물 조회 실패");
  return (await res.json()) as Listing[];
}

export async function findListing(id: string): Promise<Listing | undefined> {
  const all = await loadAllListings();
  return all.find((l) => l.id === id);
}

export interface DealMessage {
  id: string;
  listing_id: string;
  author: string;
  role: string;
  room_id?: string | null;
  author_type?: string;
  text: string;
  created_at: string;
}

export interface DealVisit {
  id: string;
  visit_date: string;
  visit_time: string;
  status: string;
}

export interface DealAgreement {
  id: string;
  text: string;
  created_at: string;
}

function writeHeaders(): Record<string, string> {
  const t = process.env.NEXT_PUBLIC_WRITE_TOKEN;
  return { ...(t ? { "x-write-token": t } : {}), ...authHeaders() };
}

async function req(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...writeHeaders(), ...(init?.headers ?? {}) },
  });
  const body = (await res.json()) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(body.error ?? "요청 실패");
  return body;
}

export async function loadMessages(id: string): Promise<DealMessage[]> {
  return (await req(`/api/deals/${id}/messages`)) as DealMessage[];
}

export async function sendMessage(id: string, author: string, role: string, text: string): Promise<void> {
  await req(`/api/deals/${id}/messages`, { method: "POST", body: JSON.stringify({ author, role, text }) });
}

export async function loadVisits(id: string): Promise<DealVisit[]> {
  return (await req(`/api/deals/${id}/visits`)) as DealVisit[];
}

export async function proposeVisit(id: string, date: string, time: string): Promise<void> {
  await req(`/api/deals/${id}/visits`, { method: "POST", body: JSON.stringify({ date, time }) });
}

export async function setVisitStatus(id: string, vid: string, status: string): Promise<void> {
  await req(`/api/deals/${id}/visits/${vid}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function loadAgreements(id: string): Promise<DealAgreement[]> {
  return (await req(`/api/deals/${id}/agreements`)) as DealAgreement[];
}

export async function addAgreement(id: string, text: string): Promise<void> {
  await req(`/api/deals/${id}/agreements`, { method: "POST", body: JSON.stringify({ text }) });
}

export async function loadChecks(id: string): Promise<Record<string, string>> {
  return (await req(`/api/deals/${id}/checklist`)) as Record<string, string>;
}

export async function saveChecks(id: string, checks: Record<string, string>): Promise<void> {
  await req(`/api/deals/${id}/checklist`, { method: "PUT", body: JSON.stringify({ checks }) });
}

export function loadRole(id: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(`directhome.role.${id}`) ?? "";
}

export function saveRole(id: string, role: string): void {
  window.localStorage.setItem(`directhome.role.${id}`, role);
}

export interface RoomInfo {
  id: string;
  listing_id: string;
  created_by: string;
  created_at: string;
}

export async function createRoom(listingId: string): Promise<string> {
  const body = (await req(`/api/deals/${listingId}/rooms`, {
    method: "POST",
    body: JSON.stringify({}),
  })) as { id: string };
  return body.id;
}

export async function loadRoomMessages(rid: string): Promise<DealMessage[]> {
  return (await req(`/api/rooms/${rid}/messages`)) as DealMessage[];
}

export async function sendRoomMessage(rid: string, text: string): Promise<string> {
  const body = (await req(`/api/rooms/${rid}/messages`, { method: "POST", body: JSON.stringify({ text }) })) as { id: string };
  return body.id;
}

export interface MyRoom {
  id: string;
  listing_id: string;
  created_at: string;
  listing_title: string;
  demo: boolean;
}

export async function loadMyRooms(): Promise<MyRoom[]> {
  return (await req("/api/rooms")) as MyRoom[];
}

export interface RoomMeta {
  room: RoomInfo;
  listing: { id: string; title: string; tradeType: string; salePrice: number } | null;
  demo: boolean;
}

export async function loadRoomMeta(rid: string): Promise<RoomMeta> {
  return (await req(`/api/rooms/${rid}`)) as RoomMeta;
}

export interface AgentInvokeResult {
  id: string;
  text: string;
  provider: string;
  model: string;
}

export async function invokeAgent(rid: string, triggerMessageId: string): Promise<AgentInvokeResult> {
  return (await req(`/api/rooms/${rid}/agent/invoke`, {
    method: "POST",
    body: JSON.stringify({ trigger_message_id: triggerMessageId }),
  })) as AgentInvokeResult;
}

export function seedCount(): number {
  return SEED_LISTINGS.length;
}

export interface ZiptalkInvokeResult {
  bubble_message_id: string | null;
  applied: number;
  provider: string;
  model: string;
}

export async function invokeZiptalk(rid: string, triggerMessageId?: string): Promise<ZiptalkInvokeResult> {
  return (await req(`/api/rooms/${rid}/ziptalk/invoke`, {
    method: "POST",
    body: JSON.stringify(triggerMessageId ? { trigger_message_id: triggerMessageId } : {}),
  })) as ZiptalkInvokeResult;
}

export interface RoomCondition {
  name: string;
  value: string;
  proposer: string;
  status: string;
  source_msg_ids: string;
  version: number;
  confirmed_by: string;
  confirmed_at: string;
  confirmed_version: number;
  confirmed_name: string;
  updated_at: string;
}

export interface ConditionHistoryRow {
  name: string;
  old_value: string;
  new_value: string;
  source_msg_ids: string;
  created_at: string;
}

export async function loadConditions(rid: string): Promise<{ conditions: RoomCondition[]; history: ConditionHistoryRow[] }> {
  return (await req(`/api/rooms/${rid}/conditions`)) as { conditions: RoomCondition[]; history: ConditionHistoryRow[] };
}

export interface RoomVisit {
  id: string;
  visit_date: string;
  visit_time: string;
  status: string;
  proposed_by: string;
  source_msg_ids: string;
  decided_by: string;
  decided_at: string;
}

export async function loadRoomVisits(rid: string): Promise<RoomVisit[]> {
  return (await req(`/api/rooms/${rid}/visits`)) as RoomVisit[];
}

export async function setRoomVisitStatus(rid: string, vid: string, status: string, extra?: { confirm_visit?: boolean; condition_version?: number }): Promise<void> {
  await req(`/api/rooms/${rid}/visits/${vid}`, { method: "PATCH", body: JSON.stringify({ status, ...(extra ?? {}) }) });
}

export async function confirmCondition(rid: string, name: string, version?: number): Promise<{ name: string; version: number }> {
  return (await req(`/api/rooms/${rid}/conditions/confirm`, {
    method: "POST",
    body: JSON.stringify(version === undefined ? { name } : { name, version }),
  })) as { name: string; version: number };
}

export interface ProposalApproval {
  actor_id: string;
  actor_type: string;
  decision: string;
}

export interface RoomProposal {
  id: string;
  room_id: string;
  name: string;
  value: string;
  version: number;
  source_msg_ids: string[];
  visit_id: string;
  status: string;
  card_msg_id: string;
  created_by: string;
  reason: string;
}

export interface ProposalSide {
  key: string;
  label: string;
}

export interface ProposalsData {
  proposals: RoomProposal[];
  approvals: Record<string, ProposalApproval[]>;
  sides: ProposalSide[];
  demo: boolean;
  me: string;
}

export async function loadProposals(rid: string): Promise<ProposalsData> {
  return (await req(`/api/rooms/${rid}/proposals`)) as ProposalsData;
}

export async function decideProposal(rid: string, pid: string, decision: "agree" | "refuse", version: number): Promise<{ id: string; status: string; version: number }> {
  return (await req(`/api/rooms/${rid}/proposals/${pid}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, version }),
  })) as { id: string; status: string; version: number };
}
