// localForage SIMULADO en memoria para pruebas.
(function(){const m=new Map();window.localforage={config(){},async getItem(k){return m.has(k)?m.get(k):null},async setItem(k,v){m.set(k,v);return v},async removeItem(k){m.delete(k)},async clear(){m.clear()}};})();
