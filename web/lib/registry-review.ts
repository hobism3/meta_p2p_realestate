/** Local-only, deterministic title-document reading aid.
 * Nothing in this tool is an ownership certification, an appraisal, or legal advice.
 * It stores no uploaded PDF, personal identifiers, name, account or address.
 */
export type RegistryFlag=
 "mortgage"|"seizure"|"trust"|"lease_right"|"provisional_disposition"|
 "ownership_mismatch"|"unknown_tenant_priority"|"unknown_tax"|"stale_document";
export type RegistrySignal={flag:RegistryFlag;title:string;description:string;check:string;};
export const REGISTRY_SIGNALS:Record<RegistryFlag,RegistrySignal>={
 mortgage:{
  flag:"mortgage",title:"근저당권·저당권 기재",
  description:"담보권 설정이 확인됩니다. 채권최고액이 실제 대출잔액과 같다는 뜻은 아닙니다.",
  check:"말소 여부·현재 채무와 선순위 관계, 보증금 지급 전 담보권 처리 조건을 관계 기관·전문가와 확인하세요.",
 },
 seizure:{
  flag:"seizure",title:"압류·가압류 기재",
  description:"등기부에 채권 보전·집행 관련 기재가 있습니다. 권리 순위·말소 여부와 최신 등기 확인이 필요합니다.",
  check:"등기 발급일, 접수·순위번호와 현재 효력·말소 여부를 공식 등기부로 재확인하세요.",
 },
 trust:{
  flag:"trust",title:"신탁등기 기재",
  description:"등기상 신탁이 있다면 명의인 외의 임대 권한·수탁자 동의 등 계약 권한을 별도로 확인해야 합니다.",
  check:"신탁원부, 수탁자·위탁자 역할과 계약·보증금 수령 권한을 확인하세요.",
 },
 lease_right:{
  flag:"lease_right",title:"전세권·임차권 등 권리 기재",
  description:"기존 등기 권리와 새 계약의 우선순위가 충돌할 수 있습니다.",
  check:"권리자·접수일·말소 조건 및 선순위 임차관계의 내용을 확인하세요.",
 },
 provisional_disposition:{
  flag:"provisional_disposition",title:"가처분 등 처분 제한",
  description:"계약 이전에 소유권 처분과 관련된 분쟁·제한이 있는지 검토해야 합니다.",
  check:"가처분 신청사건과 말소·등기효력 등을 전문가에게 확인하세요.",
 },
 ownership_mismatch:{
  flag:"ownership_mismatch",title:"게시자와 등기상 소유자 정보 불일치",
  description:"불일치만으로 사기라고 단정할 수는 없습니다. 대리인·공동소유·신탁·법인 등 정당한 구조도 가능합니다.",
  check:"계약 상대방의 신분과 적법한 대리·임대 권한을 독립적인 증빙으로 확인하세요.",
 },
 unknown_tenant_priority:{
  flag:"unknown_tenant_priority",title:"선순위 임차관계 미확인",
  description:"등기부만으로 기존 임차인의 대항력·보증금 규모를 모두 파악하기 어렵습니다.",
  check:"전입세대·확정일자 관련 확인 가능한 자료와 현장 현황을 적법한 방법으로 검토하세요.",
 },
 unknown_tax:{
  flag:"unknown_tax",title:"세금 체납 관련 정보 미확인",
  description:"등기부에 표시되지 않은 조세채권 위험이 있을 수 있습니다.",
  check:"계약 상황에 맞는 국세·지방세 체납 확인 제도와 필요한 동의 절차를 검토하세요.",
 },
 stale_document:{
  flag:"stale_document",title:"등기 발급 시점 재확인 필요",
  description:"증명서가 오래되었거나 발급일이 불명확하면 권리관계가 달라졌을 수 있습니다.",
  check:"계약·잔금 등 중요한 시점 전 공식 인터넷등기소에서 다시 발급받으세요.",
 },
};
export function registryReview(flags:readonly RegistryFlag[]):{findings:RegistrySignal[];notes:string[]}{
 const unique=Array.from(new Set(flags)).filter(k=>Object.hasOwn(REGISTRY_SIGNALS,k));
 return {
  findings:unique.map(k=>REGISTRY_SIGNALS[k]),
  notes:[
   "선택하지 않은 항목은 '존재하지 않음'이 아니라 '미확인'입니다. 위 결과가 거래 안전 또는 권리순위를 보장하지 않습니다.",
   "표제부/갑구/을구의 현행과 말소사항을 구별하고, 문서 발급 시각·물건의 주소·호실을 직접 대조하세요.",
   "이 화면은 입력값을 서버로 전송하거나 저장하지 않습니다. 실제 법률적 결론은 관련 서류와 전문가 검토가 필요합니다.",
  ],
 };
}
