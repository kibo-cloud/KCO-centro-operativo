/* KCO — nucleo de dominio. Logica pura: sin DOM, sin localStorage, sin reloj
   implicito (la fecha de hoy siempre entra por parametro). Por eso se puede
   probar en Node y en el navegador da exactamente el mismo resultado.
   ES5 estricto, igual que el resto de la app. */
(function (raiz, fabrica) {
  'use strict';
  var m = fabrica();
  if (typeof module === 'object' && module && module.exports) { module.exports = m; }
  else { raiz.KCOCore = m; }
})(this, function () {
  'use strict';

  /* ---------- fechas como clave de dia local 'AAAA-MM-DD' ----------
     Toda la aritmetica de dias se hace a las 12:00 locales: asi un cambio de
     horario de verano nunca corre una fecha al dia anterior o siguiente. */

  function dosDig(n) { return n < 10 ? '0' + n : '' + n; }

  function claveDia(d) {
    return d.getFullYear() + '-' + dosDig(d.getMonth() + 1) + '-' + dosDig(d.getDate());
  }

  function esClave(x) {
    if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) { return false; }
    var d = deClave(x);
    return !!d && claveDia(d) === x;
  }

  function deClave(k) {
    if (typeof k !== 'string') { return null; }
    var p = k.split('-');
    if (p.length !== 3) { return null; }
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  function sumarDias(k, n) {
    var d = deClave(k);
    d.setDate(d.getDate() + n);
    return claveDia(d);
  }

  /* Dias de a hasta b: positivo si b es posterior. */
  function difDias(a, b) {
    return Math.round((deClave(b).getTime() - deClave(a).getTime()) / 86400000);
  }

  function diaSemana(k) { return deClave(k).getDay(); }

  function diasDelMes(anio, mes0) { return new Date(anio, mes0 + 1, 0, 12).getDate(); }

  function claveDeIso(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : claveDia(d);
  }

  return {
    dosDig: dosDig,
    claveDia: claveDia,
    esClave: esClave,
    deClave: deClave,
    sumarDias: sumarDias,
    difDias: difDias,
    diaSemana: diaSemana,
    diasDelMes: diasDelMes,
    claveDeIso: claveDeIso
  };
});
