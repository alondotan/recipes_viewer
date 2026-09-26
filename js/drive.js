'use strict';

// Reads recipe JSON files from a Google Drive folder shared as "anyone with the link",
// using the Drive API with an API key (no sign-in).
const Drive = (() => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const CACHE_KEY = 'rv.driveCache';
  const cfg = window.CONFIG?.drive || {};
  const folderId = String(cfg.folder || '').match(/folders\/([\w-]+)/)?.[1] || cfg.folder;
  const enabled = !!(cfg.apiKey && folderId);
  const common = `supportsAllDrives=true&key=${encodeURIComponent(cfg.apiKey || '')}`;

  function explain(status, msg) {
    msg = msg.replace(/\.$/, '');
    if (status === 403) return `אין הרשאה: ${msg}. בדקו שה-Google Drive API מופעל בפרויקט ושהמפתח מתיר את הכתובת של האתר.`;
    if (status === 404) return `לא נמצא: ${msg}. בדקו שהתיקייה משותפת ל"כל מי שיש לו את הקישור".`;
    if (status === 400) return `בקשה לא תקינה: ${msg}. בדקו את מפתח ה-API ואת מזהה התיקייה ב-config.js.`;
    return msg;
  }

  async function call(url) {
    let res;
    try { res = await fetch(url); }
    // A network-level failure is either no connection or Google's anti-abuse page (sent without CORS headers).
    catch { throw new Error('גוגל דרייב לא מגיב. ייתכן שאין חיבור, או שגוגל חוסם זמנית אחרי הרבה בקשות. נסו שוב בעוד כמה דקות.'); }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = (await res.json()).error?.message || msg; } catch {}
      throw new Error(explain(res.status, msg));
    }
    return res;
  }

  // Cache: { [fileId]: { name, modifiedTime, recipe } }. Lets the list show instantly and work offline,
  // and means only files that changed since the last visit are downloaded again.
  const loadCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; } };
  const saveCache = c => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {} };

  async function listFiles() {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const files = [];
    let page = '';
    do {
      const url = `${API}?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000&includeItemsFromAllDrives=true&${common}${page ? `&pageToken=${page}` : ''}`;
      const data = await (await call(url)).json();
      files.push(...data.files);
      page = data.nextPageToken;
    } while (page);
    // The folder may also hold the schema (recipe.schema.json), which is not a recipe.
    return files.filter(f => /\.json$/i.test(f.name) && !/\.schema\.json$/i.test(f.name));
  }

  async function download(id) {
    const text = await (await call(`${API}/${encodeURIComponent(id)}?alt=media&${common}`)).text();
    try { return JSON.parse(text); }
    catch (e) { throw new Error(`ה-JSON לא תקין: ${e.message}`); }
  }

  const cached = () => Object.entries(loadCache()).map(([id, v]) => ({ id, name: v.name, recipe: v.recipe }));

  // → [{ id, name, recipe } | { id, name, error }]
  // Downloads only new/changed files, a few at a time: a burst of parallel downloads can trip
  // Google's anti-abuse block. After repeated failures it stops asking and falls back to the cache.
  async function list(onProgress) {
    const files = await listFiles();
    const cache = loadCache(), next = {};
    const items = new Array(files.length);
    let cursor = 0, failures = 0, stopped = null, done = 0;

    const settle = (k, item) => {
      items[k] = item;
      if (++done % 10 === 0) saveCache(next);
      onProgress?.(items.filter(Boolean), files.length);
    };

    async function worker() {
      while (cursor < files.length) {
        const k = cursor++, f = files[k], hit = cache[f.id];
        if (hit && hit.modifiedTime === f.modifiedTime) {
          next[f.id] = { ...hit, name: f.name };
          settle(k, { id: f.id, name: f.name, recipe: hit.recipe });
          continue;
        }
        let error = stopped;
        if (!error) {
          try {
            const recipe = await download(f.id);
            failures = 0;
            next[f.id] = { name: f.name, modifiedTime: f.modifiedTime, recipe };
            settle(k, { id: f.id, name: f.name, recipe });
            continue;
          } catch (e) {
            error = e.message;
            if (++failures >= 3) stopped = error;
          }
        }
        // Keep an older cached copy rather than showing an error; it's retried next time.
        if (hit) {
          next[f.id] = hit;
          settle(k, { id: f.id, name: f.name, recipe: hit.recipe });
        } else settle(k, { id: f.id, name: f.name, error });
      }
    }

    await Promise.all(Array.from({ length: 4 }, worker));
    saveCache(next);
    return { items, error: stopped };
  }


  // Fresh copy when online, cached copy otherwise.
  async function get(id) {
    try { return await download(id); }
    catch (e) {
      const hit = loadCache()[id];
      if (hit) return hit.recipe;
      throw e;
    }
  }

  return { enabled, list, cached, get };
})();
