// Mantém módulos e dados estáticos na mesma versão da publicação.
export function assetURL(path,base=import.meta.url) {
  const url=new URL(path,base);
  const version=new URL(import.meta.url).searchParams.get('v');
  if(version)url.searchParams.set('v',version);
  return url.href;
}
