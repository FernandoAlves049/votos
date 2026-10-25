import { selection, urlFor, officialFetch, normalizeResult, normalizeMunicipalities, normalizeSections, normalizeAux } from './tse.mjs';

// GitHub Pages publica arquivos estáticos. As consultas vão somente ao domínio oficial.
export async function queryOfficial(kind, input, fetcher = fetch) {
  const p = selection(input);
  const ttl = ['config', 'municipalities'].includes(kind) ? 3600 : kind === 'sections' ? 60 : 30;
  const pack = await officialFetch(urlFor(kind, p), ttl, fetcher, undefined);
  let data = pack.data;
  if (kind === 'result') data = normalizeResult(data, p);
  if (kind === 'municipalities') data = normalizeMunicipalities(data, p.uf === 'br' ? undefined : p.uf);
  if (kind === 'sections') data = normalizeSections(data, p);
  if (kind === 'aux') data = normalizeAux(data, p);
  return { ...pack, data };
}
