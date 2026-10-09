import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { isArchiveAdmin } from "./adminAccess";
import AdminHome from "./AdminHome";
import Admin from "./Admin";
import Videos from "./Videos";
import Posts from "./Posts";
import Diary from "./Diary";
import ArchiveImport from "./ArchiveImport";
import PhotoManager from "./PhotoManager";
import UnclassifiedMediaManager from "./UnclassifiedMediaManager";
import Guestbook from "./Guestbook";
import ReportManager from "./ReportManager";
import TagManager from "./TagManager";
import Home from "./Home";
import DM from "./DM";
import DMImport from "./DMImport";
import AdminSettings from "./AdminSettings";
import WeverseComments from './WeverseComments';
import WeverseImport from './WeverseImport';

function AdminRoute() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const path = window.location.pathname;

  useEffect(() => {
    let active = true;
    async function checkSession() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!active) return;
      setSession(currentSession);
      setLoading(false);
    }
    checkSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!loading && !session) window.location.assign("/login");
  }, [loading, session]);

  if (loading) return null;

  if (!session) {
    return null;
  }

  if (!isArchiveAdmin(session.user)) {
    return <main><p>관리자 계정만 접근할 수 있습니다.</p><a href="/">홈으로 돌아가기</a></main>;
  }

  if (path === "/admin/settings") return <AdminSettings />;
  if (path === '/admin/comments') return <WeverseComments isAdmin />;
  if (path === '/admin/weverse/import') return <WeverseImport />;
  if (path === "/admin/import") return <ArchiveImport />;
  if (path === "/admin/dm") return <DM isAdmin />;
  if (path === "/admin/dm/import") return <DMImport />;
  if (path === "/admin/upload") return <Admin />;
  if (path === "/admin/videos") return <Videos isAdmin={true} />;
  if (path === "/admin/posts") return <Posts isAdmin={true} />;
  if (path === "/admin/diary") return <Diary isAdmin={true} />;
  if (path === "/admin/guestbook") return <Guestbook isAdmin={true} />;
  if (path === "/admin/photos/manage") return <PhotoManager />;
  if (path === "/admin/media/unclassified") return <UnclassifiedMediaManager />;
  if (path === "/admin/reports") return <ReportManager />;
  if (path === "/admin/tags") return <TagManager />;
  if (path === "/admin/home") return <Home isAdmin={true} />;

  return <AdminHome />;
}

export default AdminRoute;
