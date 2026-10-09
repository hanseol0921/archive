import { useEffect, useState } from "react";
import Archive from "./Archive";
import Login from "./Login";
import AdminRoute from "./AdminRoute";
import Posts from "./Posts";
import Videos from "./Videos";
import Diary from "./Diary";
import Guestbook from "./Guestbook";
import { GlobalBgmPlayer } from "./ArchiveLayout";
import Home from "./Home";
import WeverseComments from './WeverseComments';

function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleNavigation = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    window.addEventListener("archive:navigate", handleNavigation);
    return () => {
      window.removeEventListener("popstate", handleNavigation);
      window.removeEventListener("archive:navigate", handleNavigation);
    };
  }, []);

  if (path === "/login") return <Login />;

  let page;
  const showBgm = !path.startsWith("/admin") || ["/admin", "/admin/home", "/admin/videos", "/admin/posts", "/admin/diary", "/admin/guestbook", "/admin/dm"].includes(path);
  if (path.startsWith("/admin")) page = <AdminRoute />;
  else if (path === "/") page = <Home isAdmin={false} />;
  else if (path === "/photos") page = <Archive isAdmin={false} />;
  else if (path === "/videos") page = <Videos isAdmin={false} />;
  else if (path === "/posts") page = <Posts isAdmin={false} />;
  else if (path === '/comments') page = <WeverseComments />;
  else if (path === "/diary") page = <Diary isAdmin={false} />;
  else if (path === "/guestbook") page = <Guestbook isAdmin={false} />;
  else page = <Home isAdmin={false} />;

  return (
    <>
      {page}
      {showBgm && <GlobalBgmPlayer isAdmin={path.startsWith("/admin")} />}
    </>
  );
}

export default App;
