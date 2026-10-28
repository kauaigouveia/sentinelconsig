/** Identical DATA/OFFER rows represent one consultation, never separate choices. */
export function v8References(rows:readonly any[] = []) {
  const refs=rows.map(r=>r.data?.v8).filter(v=>typeof v?.consultId==='string'&&typeof v?.promoterId==='string');
  const active=refs.filter(v=>!['FAILED','REJECTED'].includes(v.status));
  return [...new Map((active.length?active:refs).map(v=>[JSON.stringify([v.promoterId,v.consultId]),v])).values()];
}
export function uniqueV8Reference(rows:readonly any[] = []) {const refs=v8References(rows);return refs.length===1?refs[0]:undefined;}
