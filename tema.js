/* KCO — Centro Operativo Personal — tema claro / oscuro.
   Corre en <head>, antes del primer pintado: fija data-tema="claro|oscuro" en
   <html> para que kco.css arranque con la paleta correcta y no haya destello.
   La preferencia vive en kibco.tema: 'sistema' (o nada) sigue al sistema
   operativo (prefers-color-scheme), 'claro' y 'oscuro' lo fuerzan.
   kco-app.js la cambia desde Ajustes con window.KCOTema. ES5, sin DOM de usuario. */
(function () {
  'use strict';

  var K_TEMA = 'kibco.tema';
  /* Color de la barra del navegador / sistema: el --bg de cada tema en kco.css. */
  var COLOR_BARRA = { claro: '#F2F3F6', oscuro: '#0D0F12' };
  var raiz = document.documentElement;
  var media = null;
  var preferencia = 'sistema';

  try {
    media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: light)') : null;
  } catch (e) { media = null; }

  function valida(v) { return v === 'claro' || v === 'oscuro' ? v : 'sistema'; }

  function leerPreferencia() {
    var v = null;
    try { v = window.localStorage.getItem(K_TEMA); } catch (e) { v = null; }
    return valida(v);
  }

  /* Sin preferencia del sistema conocida se usa el oscuro, el tema historico. */
  function resolver(pref) {
    if (pref !== 'sistema') { return pref; }
    return media && media.matches ? 'claro' : 'oscuro';
  }

  function aplicar() {
    var tema = resolver(preferencia);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    var i;
    raiz.setAttribute('data-tema', tema);
    /* Las dos variantes (media light y dark) toman el color activo: si la
       persona fuerza un tema distinto al del sistema, la barra lo sigue igual. */
    for (i = 0; i < metas.length; i++) { metas[i].setAttribute('content', COLOR_BARRA[tema]); }
    return tema;
  }

  function alCambiarSistema() {
    if (preferencia === 'sistema') { aplicar(); }
  }

  preferencia = leerPreferencia();
  aplicar();

  if (media) {
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', alCambiarSistema);
    } else if (typeof media.addListener === 'function') {
      media.addListener(alCambiarSistema);
    }
  }

  window.KCOTema = {
    CLAVE: K_TEMA,
    /* 'sistema' | 'claro' | 'oscuro' */
    preferencia: function () { return preferencia; },
    /* Tema en pantalla ahora: 'claro' | 'oscuro' */
    activo: function () { return raiz.getAttribute('data-tema'); },
    /* Cambia la preferencia en memoria y la aplica; guardarla es de kco-app.js. */
    elegir: function (pref) { preferencia = valida(pref); aplicar(); return preferencia; },
    /* Otra pestana cambio kibco.tema: se vuelve a leer. */
    releer: function () { preferencia = leerPreferencia(); aplicar(); return preferencia; }
  };
})();
