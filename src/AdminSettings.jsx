import useTabVisibility, { ARCHIVE_TABS } from "./useTabVisibility";
import { useState } from "react";
import ArchiveLayout from "./ArchiveLayout";
import "./styles/AdminSettings.css";

const groups = [
  { id: "tabs", name: "탭 공개 설정", links: [] },
  { id: "media", name: "자료 관리", links: [
    ["업로드 사진·동영상 관리", "사진과 동영상 정보를 일괄 편집합니다.", "/admin/photos/manage"],
    ["미분류 자료 관리", "분류가 필요한 자료를 모아서 편집합니다.", "/admin/media/unclassified"],
    ["태그 관리", "태그와 검색용 이름을 관리합니다.", "/admin/tags"],
  ] },
  { id: "import", name: "자료 가져오기", links: [
    ["위버스 댓글·프로필 가져오기", "수집한 댓글과 위버스 프로필 기록을 가져옵니다.", "/admin/weverse/import"],
    ["백업 폴더 가져오기", "저장한 백업 폴더에서 자료를 가져옵니다.", "/admin/import"],
    ["사진·동영상 업로드", "자료를 직접 업로드합니다.", "/admin/upload"],
    ["DM 가져오기", "관리자용 DM 자료를 가져옵니다.", "/admin/dm/import"],
  ] },
  { id: "reports", name: "제보함", links: [["제보함", "자료 누락과 수정 요청을 확인합니다.", "/admin/reports"]] },
];

export default function AdminSettings() {
  const visibility = useTabVisibility();
  const [section, setSection] = useState("media");
  const current = groups.find((group) => group.id === section);
  const sidebar = <nav className="settings-menu" aria-label="관리자 설정 메뉴"><h2>설정</h2>{groups.map((group) => <button type="button" key={group.id} aria-pressed={section === group.id} onClick={() => setSection(group.id)}>{group.name}</button>)}</nav>;
  return <ArchiveLayout isAdmin activeTab="settings" sidebarContent={sidebar}>
    <div className="settings-mobile-menu">{sidebar}</div>
    <section className="settings-content"><h1>{current.name}</h1>{section === "tabs" ? <div className="settings-tab-visibility"><p>방문자 화면에 표시할 탭을 설정합니다. 관리자 화면에는 모든 탭이 표시됩니다.</p>{visibility.error && <p role="alert">{visibility.error}</p>}{ARCHIVE_TABS.map(([key, name]) => <div className="settings-tab-row" key={key}><span>{name}</span><small>{visibility.allowed?.[key] ? "활성화" : "비활성화"}</small><button type="button" className="settings-tab-switch" role="switch" aria-checked={visibility.allowed?.[key] === true} aria-label={`${name} 방문자 탭 표시`} disabled={!visibility.ready || visibility.saving} onClick={() => visibility.change(key, visibility.allowed?.[key] !== true)}><span aria-hidden="true" /></button></div>)}</div> : <div className="settings-links">{current.links.map(([title, description, url]) => <a href={url} key={url}><div><strong>{title}</strong><p>{description}</p></div><span aria-hidden="true">›</span></a>)}</div>}</section>
  </ArchiveLayout>;
}
