# 유튜브 업로드일 · 조회수 자동 조회

Google Cloud 프로젝트에서 YouTube Data API v3를 활성화하고 API 키를 만든다. 키의 API 제한을 YouTube Data API v3로 지정한다. 키를 채팅이나 Git에 넣지 않는다.

로컬 개발: Git에서 제외된 `.env.local`에 `YOUTUBE_API_KEY=발급받은_키`를 추가하고 개발 서버를 재시작한다.
운영: Vercel 프로젝트의 Environment Variables에 `YOUTUBE_API_KEY`를 추가하고 다시 배포한다. `VITE_` 접두사는 붙이지 않는다. 서버에서만 키를 사용한다. 기존 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`도 서버 환경에 있어야 한다.

등록할 때 제목·링크·폴더만 입력한다. 저장 전에 서버가 유튜브의 `snippet.publishedAt`, `statistics.viewCount`를 조회해 저장한다. 공개 API가 제공하는 날짜는 공개 게시 시각으로, 비공개 상태의 최초 업로드 시각과 다를 수 있다. 화면의 날짜는 항상 Asia/Seoul(KST)로 변환한다. 정렬은 정확한 게시 시각을 비교하며, 인기순은 조회수 내림차순이다.

기존 콘텐츠도 유튜브 폴더를 열면 자동 조회한다. 기존에 수동 입력했던 날짜는 사용하지 않는다. 삭제·비공개 등 조회할 수 없는 영상은 확인되지 않은 정보를 임의로 채우지 않는다. API 조회가 실패하면 저장된 자동 조회 정보를 유지하고 안내와 재시도 버튼을 표시한다. 신규 저장은 게시 시각을 확인한 후에만 진행한다.

최대 50개의 ID를 묶어 조회하며 브라우저·서버 캐시는 1시간, 공개 응답의 CDN 캐시는 최대 1시간이다. 조회수는 실시간 수치가 아니며 요청 시점과 캐시 상태에 따라 갱신된다. 공개 방문자는 아카이브에 등록된 ID만 조회할 수 있다. 아직 등록하지 않은 링크의 조회는 서버에서 지정된 관리자 계정을 인증한 후 허용한다.

공식 문서: https://developers.google.com/youtube/v3/docs/videos/list

현재 로컬에 키가 없어 실제 Google API 연결 검증은 설정 후 필요하다. 이 변경은 운영 배포와 DB 수정을 자동 수행하지 않는다.
