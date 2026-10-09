import {useState} from 'react';
import {FolderOpen,Upload} from 'lucide-react';
import {archiveFileMap} from './dmArchiveImport';
import {validateWeverseArchive,importWeverseArchive} from './weverseArchiveImport';
import './styles/Weverse.css';

export default function WeverseImport() {
  const [selection,setSelection]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  async function select(event) {
    setSelection(null);setStatus('');
    try {
      const files=archiveFileMap([...event.target.files]);
      if(!files.has('archive.json')) throw new Error('archive.json이 바로 안에 있는 아티스트 폴더를 선택해 주세요.');
      const archive=validateWeverseArchive(JSON.parse(await files.get('archive.json').text()));
      setSelection({files,archive});
    } catch(error) {setStatus(error.message);}
  }
  async function upload() {
    setBusy(true);setStatus('기존 자료 확인 중');
    try {
      const result=await importWeverseArchive(selection.archive,selection.files,(n,total)=>setStatus(`파일 ${n}/${total}`));
      setStatus(`가져오기 완료 · 새 댓글 ${result.newComments}개 · 기존 댓글 ${result.existingComments}개 · 새 파일 ${result.uploaded}개 · 재사용 ${result.reused}개`);
    } catch(error) {setStatus(`중단: ${error.message}`);} finally {setBusy(false);}
  }
  return <main className="wv-import"><a href="/admin/comments">댓글로 돌아가기</a><h1>위버스 댓글·프로필 가져오기</h1>
    <label><FolderOpen size={18}/> 아티스트 폴더<input type="file" webkitdirectory="" multiple disabled={busy} onChange={select}/></label>
    {selection && <p>리우 댓글 {selection.archive.comments?.filter(c=>c.is_target_artist).length||0}개 · 프로필 {selection.archive.profiles.length}개</p>}
    <button disabled={!selection||busy} onClick={upload}><Upload size={18}/> 가져오기</button><p role="status">{status}</p></main>;
}
