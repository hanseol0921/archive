export function profileCrop(url) {
  const match = String(url || '').match(/#dm-crop=([\d.]+),([\d.]+),([\d.]+)$/);
  if (!match) return {x:50,y:50,scale:1};
  return {x:Math.max(0,Math.min(100,Number(match[1]))),y:Math.max(0,Math.min(100,Number(match[2]))),scale:Math.max(1,Math.min(3,Number(match[3])))};
}
export function cropStyle(crop) {
  return {objectFit:'cover',objectPosition:`${crop.x}% ${crop.y}%`,transform:`scale(${crop.scale})`};
}
export function croppedProfileURL(url,crop) {
  return `${url.split('#')[0]}#dm-crop=${crop.x.toFixed(2)},${crop.y.toFixed(2)},${crop.scale.toFixed(2)}`;
}
