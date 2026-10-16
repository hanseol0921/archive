import { useState } from 'react';
import { cachedImageSource, rememberImageSource, retryImageSource } from './imageSourceCache';

export default function ManagedImage({ src, originalSrc, onError, onLoad, ...props }) {
  const [step, setStep] = useState(0);
  const [retry, setRetry] = useState(0);
  const [remembered] = useState(() => cachedImageSource(src));
  const sources = [...new Set([remembered, src, originalSrc].filter(Boolean))];
  let source = sources[Math.min(step, sources.length - 1)];
  if (retry) {
    source = retryImageSource(source);
  }
  return <img {...props} src={source} onLoad={event => {
    rememberImageSource(src, source);
    onLoad?.(event);
  }} onError={event => {
    if (step < sources.length - 1) setStep(step + 1);
    else if (!retry) setRetry(1);
    else onError?.(event);
  }} />;
}
