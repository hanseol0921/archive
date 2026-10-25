import { LogOut } from 'lucide-react';
import './styles/Logout.css';
export default function Logout() {
  return <main className="logout-page"><section className="logout-card" aria-labelledby="logout-title">
    <LogOut size={32} aria-hidden="true" />
    <h1 id="logout-title">로그아웃되었습니다</h1>
    <p>관리자 계정에서 안전하게 로그아웃했어요.</p>
    <a className="logout-home-link" href="/">아카이브로 돌아가기</a>
    <a className="logout-login-link" href="/login">다시 로그인</a>
  </section></main>;
}
