import { useState } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import { archiveFileMap, importDMArchive, validateDMArchive } from './dmArchiveImport';
import './styles/DM.css';

export default function DMImport() {
  const [selection, setSelection] = useState(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  async function select(event) {
    setSelection(null);
    try {
      const files = archiveFileMap(Array.from(event.target.files));
      const manifest = files.get('archive.json');
      if (!manifest) throw new Error('archive.json이 있는 아티스트 폴더를 선택해 주세요.');
      const archive = validateDMArchive(JSON.parse(await manifest.text()));
      setSelection({ files, archive });
      setStatus('');
    } catch (error) { setStatus(error.message); }
  }
  async function upload() {
    setBusy(true);
    setStatus('기존 자료 확인 중');
    try {
      const result=await importDMArchive(selection.archive, selection.files, (n, total) => setStatus(`${n} / ${total}`));
      setStatus(`가져오기 완료 · 새 메시지 ${result.newMessages}개 · 기존 메시지 ${result.existingMessages}개 · 새 파일 ${result.uploadedFiles}개 · 파일 재사용 ${result.reusedFiles}개`);
    } catch (error) { setStatus(`중단: ${error.message}`); }
    finally { setBusy(false); }
  }
  return <main className="dm-import">
    <a href="/admin/dm">DM으로 돌아가기</a><h1>DM 가져오기</h1>
    <label className="dm-folder"><FolderOpen size={18} /> 아티스트 폴더 선택
      <input type="file" webkitdirectory="" multiple disabled={busy} onChange={select} />
    </label>
    {selection && <p>{selection.archive.room.artist_name} · {selection.archive.messages.length}개 메시지
      {!selection.archive.history_complete && ' · 일부 기간'}</p>}
    {selection && <p>수집 시각: {new Date(selection.archive.captured_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}<br/>
      마지막 메시지: {selection.archive.messages.length ? new Date(selection.archive.messages.at(-1).sent_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}) : '없음'}</p>}
    <button disabled={!selection || busy} onClick={upload}><Upload size={16} /> {busy ? '가져오는 중' : '가져오기'}</button>
    <p role="status">{status}</p>
  </main>;
}
