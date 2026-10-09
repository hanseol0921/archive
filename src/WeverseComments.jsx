import {useEffect,useState} from 'react';
import {supabase} from './supabaseClient';
import ArchiveLayout from './ArchiveLayout';
import WeverseProfile from './WeverseProfile';
import {commentThread,sourcePostId,WEVERSE_ARTIST} from './weverseData';
import './styles/Weverse.css';

function CommentContent({row,isAdmin}) {
  return <div className={row.is_target_artist?'wv-comment-author artist':'wv-comment-author'}>
    {row.author_type==='artist' && row.is_target_artist && <WeverseProfile at={row.created_at} sourceId={row.post_id} name={row.author} isAdmin={isAdmin}/>}
    <div><div className="wv-comment-byline"><strong>{row.author_type==='fan'?'원도어':row.author}</strong><time>{row.created_at?new Date(row.created_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):''}</time></div>
      <p className="wv-comment-text">{row.text}</p>{row.images?.map((image,i)=><img className="wv-comment-image" key={i} src={image.url} alt="댓글 이미지" loading="lazy"/>)}
      {row.links?.map(url=><a key={url} className="wv-comment-link" href={url} target="_blank" rel="noreferrer">{url}</a>)}</div></div>;
}

function Branch({row,isAdmin,depth=0}) {
  return <li className={`wv-comment-node ${depth?'is-reply':''}`}><CommentContent row={row} isAdmin={isAdmin}/>
    {!!row.children.length && <ol>{row.children.map(child=><Branch key={child.id} row={child} isAdmin={isAdmin} depth={depth+1}/>)}</ol>}</li>;
}

export function PostComments({post,isAdmin}) {
  const source=sourcePostId(post.weverse_url);
  const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    async function load() {
      const result=[];
      if(!source) {if(active)setLoading(false);return;}
      for(let offset=0;;offset+=500) {
        const {data,error:e}=await supabase.from('weverse_comments').select('*').eq('post_id',source).order('id').range(offset,offset+499);
        if(e) {if(active){setError('댓글을 불러오지 못했습니다.');setLoading(false);}return;}
        result.push(...data);if(data.length<500)break;
      }
      if(active){setRows(result);setLoading(false);}
    }
    load();return()=>{active=false;};
  },[source]);
  if(!source)return null;
  return <section className="wv-post-comments"><h3>댓글 {rows.length}</h3>
    {loading?<p role="status">불러오는 중</p>:error?<p role="alert">{error}</p>:rows.length?<ol>{commentThread(rows).map(row=><Branch key={row.id} row={row} isAdmin={isAdmin}/>)}</ol>:<p className="wv-empty">아직 가져온 댓글이 없습니다.</p>}</section>;
}

export default function WeverseComments({isAdmin=false}) {
  const [rows,setRows]=useState([]),[parents,setParents]=useState(new Map()),[filter,setFilter]=useState('all');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[more,setMore]=useState(true),[page,setPage]=useState(0);
  const [diarySources,setDiarySources]=useState(new Set());
  useEffect(()=>{
    let active=true;
    async function load() {
      setBusy(true);setError('');
      let query=supabase.from('weverse_comments').select('*,post:weverse_comment_posts!inner(*)')
        .eq('artist_member_id',WEVERSE_ARTIST).eq('is_target_artist',true);
      if(filter==='artist')query=query.eq('post.is_target_artist',true);
      if(filter==='fan')query=query.eq('post.author_type','fan');
      const {data,error:e}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*100,page*100+99);
      if(!active)return;
      if(e){setError('댓글을 불러오지 못했습니다. DB 설정을 확인해 주세요.');setBusy(false);return;}
      const ids=[...new Set(data.map(row=>row.parent_comment_id).filter(Boolean))];
      const context=ids.length?await supabase.from('weverse_comments').select('*').in('id',ids):{data:[]};
      const urls=[...new Set(data.map(row=>row.post?.url).filter(Boolean))];
      const diaries=urls.length?await supabase.from('weverse_posts').select('weverse_url,is_diary').in('weverse_url',urls):{data:[]};
      if(!active)return;
      if(context.error) {setError('부모 댓글을 불러오지 못했습니다.');setBusy(false);return;}
      setParents(old=>new Map([...old,...context.data.map(p=>[p.id,p])]));
      if(!diaries.error)setDiarySources(old=>new Set([...old,...diaries.data.filter(p=>p.is_diary).map(p=>sourcePostId(p.weverse_url))]));
      setRows(old=>page===0?data:[...old,...data]);setMore(data.length===100);setBusy(false);
    }
    load();return()=>{active=false;};
  },[page,filter]);
  const visible=rows.filter(row=>filter==='all'||(filter==='artist'?row.post?.is_target_artist:row.post?.author_type==='fan'));
  return <ArchiveLayout isAdmin={isAdmin} activeTab="comments"><section className="wv-comments-page">
    <header><h1>댓글</h1>{isAdmin&&<a href="/admin/weverse/import">가져오기</a>}</header>
    <div className="wv-comment-filters" role="group" aria-label="원글 작성자">{[['all','전체'],['fan','팬 글'],['artist','리우 글']].map(([value,label])=><button key={value} aria-pressed={filter===value} onClick={()=>{setPage(0);setFilter(value);}}>{label}</button>)}</div>
    {error&&<p role="alert">{error}</p>}
    <ol className="wv-comment-feed">{visible.map(row=><li key={row.id}>
      {row.post&&<details className="wv-original-post"><summary>{row.post.author_type==='fan'?'원도어 게시글':`${row.post.author} 게시글`}</summary><p>{row.post.text}</p>{row.post.images?.map((img,i)=><img key={i} src={img.url} alt="원글 이미지" loading="lazy"/>)}
        {row.post.url&&<a href={row.post.url} target="_blank" rel="noreferrer">위버스 원글</a>}</details>}
      {parents.has(row.parent_comment_id)&&<div className="wv-parent-preview"><CommentContent row={parents.get(row.parent_comment_id)} isAdmin={isAdmin}/></div>}
      <CommentContent row={row} isAdmin={isAdmin}/>
      {row.post?.is_target_artist&&<a className="wv-post-link" href={`${isAdmin?'/admin':''}/${diarySources.has(row.post_id)?'diary':'posts'}?weverse=${encodeURIComponent(row.post_id)}`}>{diarySources.has(row.post_id)?'다이어리':'게시글'}로 이동</a>}
    </li>)}</ol>
    {!busy&&!visible.length&&!error&&<p className="wv-empty">가져온 댓글이 없습니다.</p>}
    {more&&<button className="wv-load-more" disabled={busy} onClick={()=>setPage(page+1)}>{busy?'불러오는 중':'이전 댓글'}</button>}
  </section></ArchiveLayout>;
}
