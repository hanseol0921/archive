export const MEDIA_TYPES = ["셀카", "남찍사", "거울셀카", "리우뷰", "스크린샷", "같은사진"];
export const UNCLASSIFIED_FILTER = 'type.is.null,type.eq."",type.eq.선택 안됨,type.eq.DM,type.eq.모먼트';
export function isUnclassifiedType(value) {
  return value == null || ["", "선택 안됨", "DM", "모먼트"].includes(value);
}
