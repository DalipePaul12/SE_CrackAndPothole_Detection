// One editable photo report per signed-in account on this device.
export async function reportDraft(owner, method, value) {
  if (!owner) throw Error("Sign in before saving a draft.");
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open("snap2fix-report-drafts", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("drafts");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", method === "get" ? "readonly" : "readwrite");
      const store = tx.objectStore("drafts");
      const req = method === "put" ? store.put(value, String(owner)) : store[method](String(owner));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(tx.error || Error("Could not access device storage."));
    });
  } finally { db.close(); }
}
