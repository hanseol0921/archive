import './styles/WeversePoll.css';

function dateLabel(value) {
  return value ? new Date(value).toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}) : '';
}

export default function WeversePoll({block, photos = [], compact = false}) {
  const total = block.total_count;
  return <section className={`weverse-poll${compact ? ' weverse-poll-compact' : ''}`} aria-label="투표 기록">
    <h3>{block.question}</h3>
    <div className="weverse-poll-meta">{block.allow_multiple ? '복수 선택' : '단일 선택'}{block.ends_at && ` · 마감 ${dateLabel(block.ends_at)}`}</div>
    <ol className="weverse-poll-options">{block.options.map(option => {
      const image = photos[option.photo_index];
      const percent = total > 0 && option.count != null ? Math.min(100, option.count / total * 100) : null;
      return <li key={option.id}>
        {image && <img src={image.thumbnail_url || image.image_url} alt="" loading="lazy" decoding="async" onError={event => { if (image.image_url && event.currentTarget.getAttribute('src') !== image.image_url) event.currentTarget.src = image.image_url; }} />}
        <div className="weverse-poll-option-body"><div className="weverse-poll-option-label"><span>{option.text}</span>{option.count != null && <span>{option.count.toLocaleString('ko-KR')}표{percent != null && ` (${percent.toFixed(1)}%)`}</span>}</div>
          {percent != null && <div className="weverse-poll-track"><div style={{width: `${percent}%`}} /></div>}
        </div>
      </li>;
    })}</ol>
    <footer>{total != null && <span>전체 {total.toLocaleString('ko-KR')}표</span>}<span>{block.status === 'ACTIVE' ? '진행 중' : block.status === 'CLOSED' || block.status === 'ENDED' ? '마감' : ''}</span>{!compact && <time dateTime={block.captured_at}>수집 {dateLabel(block.captured_at)}</time>}</footer>
  </section>;
}
