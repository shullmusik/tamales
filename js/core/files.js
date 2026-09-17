/* ==========================================================================
   core/files.js — fotos de tickets en IndexedDB (localStorage es demasiado chico)
   Cada foto se comprime a JPEG (máx. 1400 px) antes de guardarse: ~150–300 KB.
   Los respaldos .json NO incluyen fotos; los datos del ticket sí.
   ========================================================================== */
window.TM = window.TM || {};

TM.files = (() => {
  const DB = 'tamalitos-files', STORE = 'photos';
  let dbp = null;
  const urls = {};                                   // caché de object URLs por id

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('sin IndexedDB')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => resolve(r && r.result !== undefined ? r.result : undefined);
    t.onerror = () => reject(t.error);
  }));

  const put = (id, blob) => tx('readwrite', (st) => st.put({ id, blob, at: Date.now() })).then(() => id);
  const get = (id) => tx('readonly', (st) => st.get(id)).then((rec) => (rec ? rec.blob : null));
  const del = (id) => { if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; } return tx('readwrite', (st) => st.delete(id)); };
  const url = (id) => (urls[id] ? Promise.resolve(urls[id]) : get(id).then((b) => (b ? (urls[id] = URL.createObjectURL(b)) : null)));
  const uid = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** Reduce la foto a máx. 1400 px por lado, JPEG 82 %. Devuelve un Blob. */
  function compress(file, max) {
    max = max || 1400;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const src = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(src);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('no se pudo comprimir'))), 'image/jpeg', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(src); reject(new Error('imagen no válida')); };
      img.src = src;
    });
  }

  /** Guarda una foto (ya comprimida) y devuelve su id. */
  const savePhoto = (file) => compress(file).then((blob) => put(uid(), blob));

  /** Espacio usado por las fotos (bytes), para mostrarlo en Ajustes. */
  const usage = () => tx('readonly', (st) => st.getAll()).then((all) => (all || []).reduce((a, r) => a + (r.blob ? r.blob.size : 0), 0)).catch(() => 0);

  return { put, get, del, url, compress, savePhoto, usage };
})();
