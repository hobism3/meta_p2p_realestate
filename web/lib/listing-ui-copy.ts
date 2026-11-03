/** Presentation only: canonical trade types, feature values and user text stay unchanged. */
export const LISTING_FEATURE_EN: Record<string, string> = {
  "에어컨": "Air conditioner", "시스템에어컨": "Built-in A/C", "냉장고": "Refrigerator",
  "세탁기": "Washing machine", "건조기": "Dryer", "침대": "Bed", "옷장": "Wardrobe",
  "인덕션": "Induction cooktop", "가스레인지": "Gas cooktop", "전자레인지": "Microwave",
  "비데": "Bidet", "싱크대": "Kitchen sink", "엘리베이터": "Elevator", "주차": "Parking",
  "반려동물 가능": "Pets allowed", "반려동물 불가": "No pets", "베란다": "Veranda",
  "발코니": "Balcony", "확장형": "Extended interior", "비확장형": "Non-extended interior",
};

export const PHOTO_PRIVACY_EN: Record<string, string> = {
  person: "Person", face: "Face", photo_frame: "Portrait or photo frame", document: "Personal document",
  screen: "Screen", address_label: "Address or delivery label", reflection: "Mirror or glass reflection",
};

export const SAMPLE_PHOTO_EN: Record<string, { label: string; hint: string }> = {
  living: { label: "Living room", hint: "Chairs · flooring · windows" },
  kitchen: { label: "Kitchen", hint: "Refrigerator · range" },
  lounge: { label: "Lounge", hint: "Sofa · TV · fireplace" },
};

export function listingFeatureLabel(value: string, en: boolean): string {
  return en ? LISTING_FEATURE_EN[value] ?? value : value;
}

/** A reversible text-input projection: unknown/custom words are never translated. */
export function featureInputDisplay(value: string, en: boolean): string {
  if (!en) return value;
  return value.split(",").map(part => part.replace(part.trim(), listingFeatureLabel(part.trim(), true))).join(",");
}

export function featureInputCanonical(value: string, en: boolean): string {
  if (!en) return value;
  const pairs = Object.entries(LISTING_FEATURE_EN);
  return value.split(",").map(part => {
    const match = pairs.find(([, label]) => label.toLowerCase() === part.trim().toLowerCase());
    return match ? part.replace(part.trim(), match[0]) : part;
  }).join(",");
}

export function tradeTypeLabel(value: string, en: boolean): string {
  return en ? ({ "월세": "Monthly rent", "전세": "Jeonse", "매매": "Sale" } as Record<string, string>)[value] ?? value : value;
}

export function wonFromManwon(value: string): string {
  return value.trim() && Number.isFinite(Number(value)) ? "₩" + (Number(value) * 10000).toLocaleString("en-US") : "—";
}

export function englishListingPrice(form: {tradeType: string; deposit: string; rent: string; salePrice: string}): string {
  if (form.tradeType === "매매") return "Sale " + wonFromManwon(form.salePrice);
  if (form.tradeType === "전세") return "Jeonse deposit " + wonFromManwon(form.deposit);
  return "Deposit " + wonFromManwon(form.deposit) + " / " + wonFromManwon(form.rent) + " per month";
}

const MESSAGES: Record<string, string> = {
  "읽기 전용 모드": "Read-only mode.",
  "인증 필요": "Authentication required.",
  "로그인이 필요합니다.": "Please sign in.",
  "요청 과다": "Too many requests. Try again later.",
  "빈 공간 미리보기 기능이 비활성화되어 있습니다.": "Furniture-free previews are currently unavailable.",
  "JSON 형식만 허용합니다.": "Only JSON requests are supported.",
  "JSON만 허용됩니다.": "Only JSON requests are supported.",
  "사진 크기를 줄여 주세요.": "Please reduce the photo file size.",
  "사진 크기 제한 초과": "The photo exceeds the file-size limit.",
  "가구 없는 이미지 생성을 위해 별도 외부 전송 동의가 필요합니다.": "Separate consent to send the photo externally is required for a furniture-free preview.",
  "950KB 이하의 JPEG 이미지만 허용합니다.": "Only JPEG images up to 950 KB are supported.",
  "이미지 생성은 계정당 시간당 최대 2회입니다.": "Image generation is limited to two requests per account per hour.",
  "가구 없는 이미지 시연의 전체 호출 한도를 모두 사용했어요.": "The shared furniture-free demo request limit has been reached.",
  "빈 공간 이미지를 생성하지 못했습니다. 원본 사진을 이용해 주세요.": "Could not generate a furniture-free image. Please use the original photo.",
  "생성된 이미지의 형식이 올바르지 않아 표시하지 않았습니다.": "The generated image had an invalid format and was not displayed.",
  "이미지 생성 요청에 실패했습니다. 원본 사진은 계속 사용할 수 있습니다.": "Image generation failed. You can continue using the original photo.",
  "사진 AI 검토가 비활성화되어 있어요. 기본 사진 가이드는 계속 이용할 수 있습니다.": "AI photo review is unavailable. You can still use the basic photo guide.",
  "사진의 외부 AI 전송에 대한 명시적 동의가 필요합니다.": "Explicit consent is required to send the photo to an external AI service.",
  "사진을 JPEG로 압축한 뒤 950KB 이하로 전송해 주세요.": "Compress the photo to JPEG, up to 950 KB, before sending it.",
  "계정당 사진 AI 검토는 시간당 허용 횟수를 모두 사용했습니다.": "This account has reached the hourly AI photo review limit.",
  "현재 시연의 AI 분석 총 사용 한도를 모두 사용했어요.": "The shared demo AI analysis limit has been reached.",
  "사진 AI 분석 서버가 응답하지 않았습니다. 직접 확인해 주세요.": "The AI photo analysis server did not respond. Please review the photo yourself.",
  "AI 응답이 완료되지 않았습니다. 직접 확인하거나 나중에 다시 시도해 주세요.": "The AI response was incomplete. Review the photo yourself or try again later.",
  "사진 분석 결과를 확인하지 못했습니다. 직접 확인해 주세요.": "Could not validate the photo analysis result. Please review the photo yourself.",
  "사진 분석 연결에 실패했어요. 사진은 저장되지 않았으며 직접 등록할 수 있습니다.": "Photo analysis could not connect. The photo was not saved; you can continue manually.",
  "매물 제목을 입력해 주세요.": "Enter a listing title.",
  "주소를 입력해 주세요.": "Enter the address.",
  "면적은 0보다 큰 숫자로 입력해 주세요.": "Enter a floor area greater than zero.",
  "매매가는 0보다 큰 숫자로 입력해 주세요.": "Enter a sale price greater than zero.",
  "보증금을 숫자로 입력해 주세요.": "Enter a numeric deposit amount.",
  "월세를 숫자로 입력해 주세요.": "Enter a numeric monthly rent.",
  "입주 가능 시기를 입력해 주세요.": "Enter the move-in availability.",
  "관리비는 0 이상의 숫자로 입력해 주세요.": "Enter a monthly maintenance fee of zero or more.",
  "게시자명을 입력해 주세요.": "Enter a display name.",
  "매물 조회 실패": "Could not load the listing.",
  "저장에 실패했습니다.": "Could not save the listing.",
  "옵션 저장에 실패했어요.": "Could not save the amenities.",
  "이미지를 읽을 수 없어요.": "Could not read the image.",
  "사진 변환 실패": "Could not convert the photo.",
  "파일 변환 실패": "Could not convert the file.",
  "사진 검사를 지원하지 않는 브라우저예요.": "This browser does not support photo inspection.",
  "사진은 한 번에 최대 6장까지 정리할 수 있어요.": "You can work with up to six photos at a time.",
  "JPG·PNG·WebP 사진(장당 8MB 이하)만 선택해 주세요.": "Choose JPG, PNG or WebP photos, up to 8 MB each.",
  "유사한 사진이 있어요. 다른 각도로 촬영하면 좋아요.": "A similar photo is already present. Consider a different angle.",
  "사진을 읽지 못했어요.": "Could not read the photo.",
  "이미 추가한 예시 사진입니다.": "This sample photo has already been added.",
  "예시 사진을 불러오지 못했어요.": "Could not load the sample photo.",
  "예시 사진을 사용할 수 없어요.": "The sample photo is unavailable.",
  "이미 공개한 사진은 매물 관리의 갤러리에서 삭제할 수 있어요.": "Remove published photos from the gallery in listing management.",
  "사진 가림을 사용할 수 없는 브라우저예요.": "This browser does not support photo masking.",
  "사진을 표시하지 못했어요.": "Could not display the photo.",
  "사진 가림 적용에 실패했어요.": "Could not apply the privacy mask.",
  "사진 용량을 줄이지 못했어요.": "Could not reduce the photo file size.",
  "사진 분석 실패": "Photo analysis failed.",
  "분석 불가": "Analysis is unavailable.",
  "생성된 이미지를 읽지 못했어요.": "Could not read the generated image.",
  "빈 공간 이미지를 만들지 못했어요.": "Could not generate the furniture-free preview.",
  "시연용 합성 이미지는 실제 매물 사진으로 게시할 수 없습니다.": "Synthetic demo images cannot be published as real property photos.",
  "AI에서 개인정보 노출 가능성을 발견했습니다. 해당 영역을 먼저 가려 주세요.": "AI flagged possible personal information. Mask those areas first.",
  "게시용 JPEG 용량을 180KB 이하로 줄일 수 없습니다.": "Could not compress the publishing JPEG to 180 KB or less.",
  "사진 게시에 실패했습니다.": "Could not publish the photo.",
  "사진 게시 실패": "Photo publication failed.",
  "실제 매물 갤러리에 사진을 공개했어요. 삭제하거나 변경하려면 매물 관리로 이동해 주세요.": "The photo is now public in the listing gallery. Use listing management to change or remove it.",
  "선택한 옵션을 매물에 저장했어요.": "Selected amenities saved to the listing.",
  "선택한 옵션을 매물 정보에 추가했어요.": "Selected amenities added to the listing draft.",
  "옵션을 저장하지 못했어요.": "Could not save the amenities.",
  "해상도가 낮아요. 더 선명한 사진을 권장해요.": "Low resolution. Try a sharper photo.",
  "전체적으로 어두워 보여요. 조명을 켜고 다시 촬영해 보세요.": "The photo appears dark. Try taking it again with more light.",
  "전체적으로 너무 밝아요. 노출을 조절해 보세요.": "The photo appears overexposed. Try adjusting the exposure.",
  "압축이 강할 수 있어요. 원본 품질을 확인해 주세요.": "The photo may be heavily compressed. Check the original quality.",
};

/** Translate only known application copy, preserving any unknown server detail verbatim. */
export function listingUiMessage(message: string, en: boolean): string {
  if (!en) return message;
  if (MESSAGES[message]) return MESSAGES[message];
  if (message.startsWith("사진 AI 분석 중: ")) return "Analyzing photo with AI: " + message.slice("사진 AI 분석 중: ".length);
  const noRetry = " · 자동 재시도하지 않아요.";
  if (message.endsWith(noRetry)) {
    const prefix = message.slice(0, -noRetry.length);
    const split = prefix.indexOf(": ");
    return (split >= 0 ? prefix.slice(0, split+2) + listingUiMessage(prefix.slice(split+2), true) : listingUiMessage(prefix, true)) + " · No automatic retry.";
  }
  return message;
}
