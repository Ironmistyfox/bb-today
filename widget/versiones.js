export function esVersionNueva(nueva, actual) {
  const partes = v => /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(v || ''))?.slice(1).map(Number);
  const a=partes(nueva), b=partes(actual);
  if (!a || !b) return false;
  for (let i=0;i<3;i++) if(a[i]!==b[i]) return a[i]>b[i];
  return false;
}
