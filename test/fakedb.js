// Base de datos falsa en memoria (solo para pruebas)
function getP(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setP(o, p, v) { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach((k) => { if (typeof a[k] !== 'object' || a[k] === null) a[k] = {}; a = a[k]; }); a[ks.at(-1)] = v; }
function delP(o, p) { const ks = p.split('.'); const a = getP(o, ks.slice(0, -1).join('.')) ?? (ks.length === 1 ? o : undefined); if (a) delete a[ks.at(-1)]; }
function fakeDb() {
  const cols = {};
  const col = (n) => cols[n] || (cols[n] = (() => {
    const docs = [];
    const match = (d, f) => Object.entries(f).every(([k, v]) => d[k] === v);
    const apply = (d, u, ins) => {
      for (const [p, v] of Object.entries(u.$set || {})) setP(d, p, structuredClone(v));
      for (const [p, v] of Object.entries(u.$inc || {})) setP(d, p, (getP(d, p) || 0) + v);
      for (const p of Object.keys(u.$unset || {})) delP(d, p);
      for (const [p, v] of Object.entries(u.$addToSet || {})) { const a = getP(d, p) || []; if (!a.includes(v)) a.push(v); setP(d, p, a); }
      if (ins) for (const [p, v] of Object.entries(u.$setOnInsert || {})) setP(d, p, structuredClone(v));
    };
    return {
      createIndex: async () => {},
      findOne: async (f) => { const d = docs.find((x) => match(x, f)); return d ? structuredClone(d) : null; },
      insertOne: async (doc) => { if (doc.username && docs.some((x) => x.username === doc.username)) throw Object.assign(new Error('dup'), { code: 11000 }); docs.push(structuredClone(doc)); return {}; },
      updateOne: async (f, u, o = {}) => { let d = docs.find((x) => match(x, f)); let ins = false; if (!d && o.upsert) { d = { ...f }; docs.push(d); ins = true; } if (!d) return { matchedCount: 0 }; apply(d, u, ins); return { matchedCount: 1 }; },
      deleteOne: async (f) => { const i = docs.findIndex((x) => match(x, f)); if (i >= 0) docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
      find: (f, o = {}) => ({ toArray: async () => docs.filter((x) => match(x, f)).map((d) => { const c = structuredClone(d); for (const [k, v] of Object.entries(o.projection || {})) if (v === 0) delete c[k]; return c; }) }),
      _docs: docs,
    };
  })());
  return { collection: col };
}
module.exports = { fakeDb };
