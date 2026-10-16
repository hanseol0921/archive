import { useState } from 'react';

export default function ManagedImage({ src, originalSrc, ...props }) {
  const [step, setStep] = useState(0);
  const [retry, setRetry] = useState(0);
  const sources = [...new Set([src, originalSrc].filter(Boolean))];
  let source = sources[Math.min(step, sources.length - 1)];
  if (retry) {
    try {
      const fresh = new URL(source);
      if (fresh.hostname === 'media.riwooarchive.com') {
        fresh.searchParams.set('image-retry', String(retry));
        source = fresh.href;
      }
    } catch { /* Preserve external and relative image URLs. */ }
  }
  return <img {...props} src={source} onError={() => {
    if (step < sources.length - 1) setStep(step + 1);
    else if (!retry) setRetry(Date.now());
  }} />;
}
