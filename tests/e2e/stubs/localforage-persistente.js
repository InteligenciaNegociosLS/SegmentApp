// localForage SIMULADO que SÍ sobrevive a recargar la página (usa localStorage).
// Solo para la prueba "sin internet": hay que cerrar y abrir la app sin perder lo guardado.
(function(){const P='__lf__';window.localforage={config(){},
async getItem(k){const v=localStorage.getItem(P+k);return v==null?null:JSON.parse(v)},
async setItem(k,v){localStorage.setItem(P+k,JSON.stringify(v));return v},
async removeItem(k){localStorage.removeItem(P+k)},
async clear(){Object.keys(localStorage).filter(k=>k.startsWith(P)).forEach(k=>localStorage.removeItem(k))}};})();
