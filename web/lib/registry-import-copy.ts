/** Presentation-only translations. Never translate/replace original PDF evidence. */
const COPY: Record<string, string> = {
  "PDF 읽는 중": "Reading PDF",
  "서버로 전송 중": "Sending the approved fictional PDF",
  "서버 연결 완료 · 문서 검증 중": "Connected · Checking the document",
  "AI 문서 분석 진행 중": "Document analysis in progress",
  "분석 완료 · 추출 결과 확인": "Analysis complete · Review the extracted draft",
  "전유부분 면적이 명확하지 않아 면적을 비워두었습니다.": "The unit's exclusive floor area was unclear, so the area field was left blank.",
  "행정구역을 확인하지 못해 주소를 자동 입력하지 않았습니다.": "The administrative area could not be identified, so the address was not filled in.",
  "등기부 형식이 확인되지 않아 입력값을 자동 적용하지 않습니다.": "The document format could not be identified as a registry record. No fields will be applied automatically.",
  "등기 정보는 소유권·현행 권리관계의 진위를 증명하지 않습니다.": "These extracted details do not verify ownership or the current legal status of registered rights.",
  "가격·관리비·입주일·옵션은 문서에서 알 수 없어 직접 입력해야 합니다.": "Enter the price, maintenance fee, move-in date and amenities yourself; they are not supplied by this document.",
  "동일한 교육용 합성 PDF에서 주소·면적 후보만 가져왔습니다. 기록된 가압류·근저당 후보는 별도 권리 점검에서만 검토하세요. 실제 Meta 문서분석 결과가 아닙니다.": "This educational fixture supplies draft property details. Review its provisional seizure and mortgage entries in the separate rights-review workflow. This is not a Meta document-analysis result.",
  "교육용 PDF의 정확한 파일 해시에 매칭된 Mock 결과입니다. Meta AI 추출 결과가 아닙니다.": "This Mock result matches the exact hash of the educational PDF. It is not a Meta AI extraction.",
  "읽기 전용 모드": "Read-only mode",
  "인증 필요": "Sign in to continue",
  "요청 과다": "Too many requests. Please wait before trying again.",
  "문서 분석은 계정당 시간당 최대 3회 가능합니다.": "Document analysis is limited to three requests per account per hour.",
  "문서 AI 분석은 서버에서 아직 활성화되지 않았습니다.": "Document AI analysis is not enabled on the server.",
  "Meta 모델 키가 설정되지 않았습니다.": "The Meta service is not configured.",
  "업로드 용량 초과(최대 2MB PDF)": "The upload exceeds the 2 MB PDF limit.",
  "JSON 전송만 지원합니다.": "The request format is not supported.",
  "가상 시연 PDF의 문서 분석 전송 확인이 필요합니다.": "Confirm that this is an approved fictional demo PDF before sending it.",
  "2MB 이하의 PDF만 허용됩니다.": "Choose a PDF no larger than 2 MB.",
  "올바른 암호화되지 않은 PDF가 아닙니다.": "Choose a valid, unencrypted PDF.",
  "Mock 모드에서는 제공된 합성 PDF 예시만 분석할 수 있습니다.": "Mock mode accepts only the provided fictional PDF samples.",
  "개인정보 보호를 위해 실제 등기 PDF의 외부 AI 전송을 차단했습니다. 제공된 가상 PDF 예시로만 시연할 수 있습니다.": "Real registry PDFs cannot be sent to an external AI service. Use only the provided fictional sample.",
  "Meta 응답에서 분석 결과를 읽지 못했습니다.": "The Meta response did not contain a readable analysis result.",
  "Meta 응답을 구조화하지 못했습니다.": "The Meta response could not be converted into structured fields.",
  "등기 정보에서 검토 가능한 필드를 찾지 못했습니다.": "No supported fields were found for review.",
  "문서 분석 시간이 초과되었거나 네트워크 연결에 실패했습니다.": "Document analysis timed out or the network connection failed.",
  "문서 분석 중 서버 오류가 발생했습니다.": "A server error occurred during document analysis.",
};

export function registryImportMessage(value: string, en: boolean): string {
  if (!en) return value;
  if (COPY[value]) return COPY[value];
  const failure = value.match(/^Meta 분석에 실패했습니다\(HTTP (\d+)\)\. 다시 시도하거나 직접 입력해 주세요\.$/);
  if (failure) return `Meta analysis failed (HTTP ${failure[1]}). Try again or enter the details manually.`;
  // Unknown server text stays visible rather than silently losing its meaning.
  return /[가-힣]/.test(value) ? `Original service message (Korean): ${value}` : value;
}

/** Explicit glosses for known fixture fields, never machine-invented translations. */
export function registryFieldGloss(value: string): string | undefined {
  return ({
    "아파트": "Apartment",
    "집합건물": "Condominium building",
    "데모아파트": "Demo Apartment",
    "서울특별시 가상구 데모로 101": "101 Demo-ro, Gasang-gu, Seoul (fictional address)",
  } as Record<string, string>)[value];
}
