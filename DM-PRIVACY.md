DM is hidden from public tabs, folders and media lists. `/dm` no longer renders the DM page. Admin photo/video filters default to DM unchecked; the admin DM tab remains available.

Database enforcement is prepared in `scripts/dm-private-access.sql` but has not been applied. Run it in Supabase SQL Editor before treating DM as private. It restricts SELECT on DM tables and DM photo/video records to the configured administrator, including when older public SELECT policies remain.

Media currently uses public URLs on media.riwooarchive.com. Database policies cannot revoke an already known image/video URL. Full media privacy additionally requires private storage and authenticated delivery (or signed URLs), and revoking existing public DM URLs. This storage migration has not been performed.


관리자 추가 선택의 DM 공개 설정을 방문자 사진·동영상 읽기 권한에도 반영하려면 Supabase SQL Editor에서 scripts/dm-media-visibility.sql을 한 번 실행합니다. 기존 dm-private-access.sql 이후에 적용하세요. DM 채팅 탭 공개 설정과는 독립적이며, 자료별 아카이브 표시 해제와 숨김 유형은 계속 적용됩니다.
