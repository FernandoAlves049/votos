export function versionModule(source,version) {
  const suffix='?v='+encodeURIComponent(version);
  return source.replace(/(from\s*['"])(\.{1,2}\/[^'"]+\.(?:mjs|js))(['"])/g,
    (_match,prefix,path,quote)=>prefix+path+suffix+quote);
}
export function versionHTML(html,version) {
  return html.replace(/((?:src|href)=")(\.\/[^"]+\.(?:js|mjs|css))(")/g,
    (_match,prefix,path,quote)=>prefix+path+'?v='+encodeURIComponent(version)+quote);
}
