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

  /* ---------- contextos ----------
     Trabajo sigue siendo el unico con el flujo de compras de fabrica (OC, OT,
     +48 hs). Todos los demas usan la lista simple de compras: por comprar,
     comprado, cancelado. El id 'hogar' se conserva y se muestra como Casa. */

  var CONTEXTOS = [
    { id: 'trabajo', ico: '🏭', nom: 'Trabajo' },
    { id: 'hogar', ico: '🏠', nom: 'Casa' },
    { id: 'apps', ico: '💻', nom: 'Apps' },
    { id: 'contenido', ico: '🎬', nom: 'Contenido' },
    { id: 'personal', ico: '🏋', nom: 'Personal' }
  ];

  function infoContexto(id) {
    var i;
    for (i = 0; i < CONTEXTOS.length; i++) { if (CONTEXTOS[i].id === id) { return CONTEXTOS[i]; } }
    return null;
  }

  function contextoValido(id) { return infoContexto(id) !== null; }
  function normalizarContexto(id) { return contextoValido(id) ? id : 'trabajo'; }
  function esFabrica(ctx) { return ctx === 'trabajo'; }

  /* ---------- prioridad en cuatro niveles ----------
     El booleano viejo 'prioridad' se sigue escribiendo (true solo en urgente),
     asi una version anterior de KCO ve lo urgente como prioridad alta. */

  var NIVELES = [
    { id: 'urgente', ico: '‼', nom: 'Urgente', peso: 3 },
    { id: 'importante', ico: '❗', nom: 'Importante', peso: 2 },
    { id: 'normal', ico: '○', nom: 'Normal', peso: 1 },
    { id: 'baja', ico: '↓', nom: 'Baja', peso: 0 }
  ];

  function infoNivel(id) {
    var i;
    for (i = 0; i < NIVELES.length; i++) { if (NIVELES[i].id === id) { return NIVELES[i]; } }
    return NIVELES[2];
  }

  function nivelDe(it) {
    if (it && (it.nivel === 'urgente' || it.nivel === 'importante' || it.nivel === 'normal' || it.nivel === 'baja')) {
      return it.nivel;
    }
    return it && it.prioridad === true ? 'urgente' : 'normal';
  }

  /* ---------- estados ---------- */

  var CERRADOS = { completado: 1, cancelado: 1, recibido: 1, comprado: 1 };
  var HECHOS = { completado: 1, recibido: 1, comprado: 1 };
  /* Casilleros de fabrica donde la pelota la tiene otro. */
  var ESPERAS_FABRICA = { esperando_oc: 1, esperando_aprob: 1, oc_enviada: 1, esperando_entrega: 1 };
  var HORAS_ALERTA_ENTREGA = 48;

  function esActivo(estado) { return !CERRADOS[estado]; }
  function esHecho(estado) { return HECHOS[estado] === 1; }

  function alertaEntrega(it, ahoraMs) {
    if (it.tipo !== 'compra' || it.estado !== 'esperando_entrega' || it.pausado === true) { return 0; }
    var d = new Date(it.estadoDesde);
    if (isNaN(d.getTime())) { return 0; }
    var h = (ahoraMs - d.getTime()) / 3600000;
    return h > HORAS_ALERTA_ENTREGA ? h : 0;
  }

  /* El dia en que algo "cae": fecha explicita, el dia de la ocurrencia de una
     rutina, o el dia del recordatorio. Vacio si no tiene dia. */
  function diaDe(it) {
    if (esClave(it.fecha)) { return it.fecha; }
    if (esClave(it.ocurrencia)) { return it.ocurrencia; }
    return claveDeIso(it.recordatorio);
  }

  /* ---------- situacion: los cinco estados visibles del centro de control ----------
     No reemplaza al estado del flujo (entrada, pendiente, proceso...): lo lee y
     lo traduce a la pregunta que importa al abrir la app.
       atencion   -> hay que mirarlo ya (vencido, recordatorio pasado, urgente, +48 hs)
       proximo    -> se puede hacer ahora
       esperando  -> la pelota la tiene otro
       programado -> tiene dia, y es despues de hoy
       hecho / cancelado */

  var SITUACIONES = [
    { id: 'atencion', ico: '🔴', nom: 'Requiere atencion' },
    { id: 'proximo', ico: '🟡', nom: 'Proximo' },
    { id: 'esperando', ico: '🔵', nom: 'Esperando' },
    { id: 'programado', ico: '🟣', nom: 'Programado' },
    { id: 'hecho', ico: '🟢', nom: 'Hecho' }
  ];

  function infoSituacion(id) {
    var i;
    for (i = 0; i < SITUACIONES.length; i++) { if (SITUACIONES[i].id === id) { return SITUACIONES[i]; } }
    return { id: 'cancelado', ico: '❌', nom: 'Cancelado' };
  }

  function recordatorioVencido(it, ahoraMs) {
    if (!it.recordatorio || !esActivo(it.estado)) { return false; }
    var d = new Date(it.recordatorio);
    return !isNaN(d.getTime()) && d.getTime() <= ahoraMs;
  }

  function enEspera(it) {
    if (it.estado === 'esperando' || it.pausado === true) { return true; }
    return it.tipo === 'compra' && esFabrica(it.contexto) && ESPERAS_FABRICA[it.estado] === 1;
  }

  function situacion(it, hoy, ahoraMs) {
    if (esHecho(it.estado)) { return 'hecho'; }
    if (it.estado === 'cancelado') { return 'cancelado'; }
    var dia = diaDe(it);
    if (dia !== '' && dia < hoy) { return 'atencion'; }
    if (recordatorioVencido(it, ahoraMs)) { return 'atencion'; }
    if (alertaEntrega(it, ahoraMs) > 0) { return 'atencion'; }
    if (nivelDe(it) === 'urgente') { return 'atencion'; }
    if (enEspera(it)) { return 'esperando'; }
    if (dia !== '' && dia > hoy) { return 'programado'; }
    return 'proximo';
  }

  /* ---------- proximo movimiento ----------
     Puntaje simple y explicable: cada regla suma y la primera que aplica da el
     motivo que se muestra. Solo compite lo accionable ahora (atencion y
     proximo); lo que espera a otro o cae otro dia no se propone. */

  function puntaje(it, hoy, ahoraMs) {
    var sit = situacion(it, hoy, ahoraMs);
    if (sit !== 'atencion' && sit !== 'proximo') { return null; }
    var p = 0, motivo = '', dia = diaDe(it), nivel = nivelDe(it);
    function regla(cumple, puntos, texto) {
      if (!cumple) { return; }
      p += puntos;
      if (motivo === '') { motivo = texto; }
    }
    var atraso = dia !== '' && dia < hoy ? difDias(dia, hoy) : 0;
    regla(atraso > 0, 300 + Math.min(atraso, 30) * 5, atraso === 1 ? 'Vencida ayer' : 'Vencida hace ' + atraso + ' d');
    regla(recordatorioVencido(it, ahoraMs), 250, 'Recordatorio vencido');
    var hs = alertaEntrega(it, ahoraMs);
    regla(hs > 0, 200, Math.floor(hs) + ' hs esperando entrega');
    regla(nivel === 'urgente', 400, 'Urgente');
    regla(dia === hoy, 200, esClave(it.ocurrencia) ? 'Rutina de hoy' : 'Para hoy');
    regla(it.anclado === true, 120, 'Anclada');
    regla(it.estado === 'proceso', 100, 'En proceso');
    regla(nivel === 'importante', 150, 'Importante');
    regla(!!it.proyectoId, 40, 'Avanza una mision');
    regla(nivel === 'baja', -60, 'Baja prioridad');
    regla(it.estado === 'entrada', -30, 'Sin clasificar');
    var edad = it.creado ? difDias(claveDeIso(it.creado) || hoy, hoy) : 0;
    if (edad > 0) { p += Math.min(edad, 30); }
    if (motivo === '') { motivo = edad > 0 ? 'Pendiente hace ' + edad + ' d' : 'Pendiente'; }
    return { puntos: p, motivo: motivo, situacion: sit };
  }

  /* Devuelve los items accionables ordenados, cada uno con su puntaje. */
  function priorizar(lista, hoy, ahoraMs) {
    var r = [], i, s;
    for (i = 0; i < lista.length; i++) {
      s = puntaje(lista[i], hoy, ahoraMs);
      if (s) { r.push({ item: lista[i], puntos: s.puntos, motivo: s.motivo, situacion: s.situacion }); }
    }
    r.sort(function (a, b) {
      if (a.puntos !== b.puntos) { return b.puntos - a.puntos; }
      var ca = a.item.creado || '', cb = b.item.creado || '';
      return ca < cb ? -1 : (ca > cb ? 1 : 0);
    });
    return r;
  }

  /* ---------- captura rapida ----------
     Reglas de hora (sin cambios desde 0.6, pensadas para no comerse medidas):
       A) @H:MM o @HH:MM en cualquier lugar -> siempre es hora.
       B) HH:MM con dos digitos -> solo al final del texto, o si dice hoy/mañana.
     Agregados en 2.0, todos opcionales y solo como palabra suelta:
       'hoy' o 'mañana' al final, sin hora -> fecha del dia.
       #trabajo #casa #hogar #apps #contenido #personal -> contexto.
       !! -> urgente, ! -> importante. */

  var ALIAS_CTX = { trabajo: 'trabajo', casa: 'hogar', hogar: 'hogar', apps: 'apps', app: 'apps',
    contenido: 'contenido', personal: 'personal' };

  function quitar(texto, m) {
    return texto.slice(0, m.index) + ' ' + texto.slice(m.index + m[0].length);
  }

  function limpio(t) { return t.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }

  function parsearCaptura(entrada, ahora) {
    var texto = ' ' + entrada + ' ';
    var r = { texto: '', recordatorio: '', fecha: '', contexto: '', nivel: '' };
    var mc = texto.match(/\s#([a-zñ]+)(?=\s)/i);
    if (mc && ALIAS_CTX.hasOwnProperty(mc[1].toLowerCase())) {
      r.contexto = ALIAS_CTX[mc[1].toLowerCase()];
      texto = quitar(texto, mc);
    }
    var mn = texto.match(/\s(!!?)(?=\s)/);
    if (mn) {
      r.nivel = mn[1] === '!!' ? 'urgente' : 'importante';
      texto = quitar(texto, mn);
    }
    texto = limpio(texto);
    var antes = texto;
    var m = texto.match(/(^|\s)@\s?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/);
    if (!m) {
      var mb = texto.match(/(^|\s)([01]\d|2[0-3]):([0-5]\d)(?=\s|$)/);
      if (mb) {
        var resto = texto.slice(mb.index + mb[0].length).replace(/^\s+|\s+$/g, '');
        var conDia = /(^|\s)(hoy|ma[ñn]ana)(\s|$)/i.test(texto);
        if (resto === '' || conDia) { m = mb; }
      }
    }
    if (m) {
      var h = parseInt(m[2], 10), min = parseInt(m[3], 10), dia = 0;
      texto = quitar(texto, m);
      var mm = texto.match(/(^|\s)(ma[ñn]ana)(\s|$)/i);
      if (mm) { dia = 1; texto = quitar(texto, mm); }
      else {
        var mh = texto.match(/(^|\s)(hoy)(\s|$)/i);
        if (mh) { texto = quitar(texto, mh); }
      }
      var d = new Date(ahora.getTime());
      d.setHours(h, min, 0, 0);
      if (dia === 1 || d.getTime() <= ahora.getTime()) { d.setDate(d.getDate() + 1); }
      texto = limpio(texto);
      if (texto !== '') { r.recordatorio = d.toISOString(); }
      else { texto = antes; }
    } else {
      var mf = texto.match(/(^|\s)(hoy|ma[ñn]ana)$/i);
      if (mf && limpio(texto.slice(0, mf.index)) !== '') {
        var hoyK = claveDia(ahora);
        r.fecha = mf[2].toLowerCase() === 'hoy' ? hoyK : sumarDias(hoyK, 1);
        texto = limpio(texto.slice(0, mf.index));
      }
    }
    r.texto = texto;
    return r;
  }

  return {
    CONTEXTOS: CONTEXTOS,
    infoContexto: infoContexto,
    contextoValido: contextoValido,
    normalizarContexto: normalizarContexto,
    esFabrica: esFabrica,
    NIVELES: NIVELES,
    infoNivel: infoNivel,
    nivelDe: nivelDe,
    CERRADOS: CERRADOS,
    esActivo: esActivo,
    esHecho: esHecho,
    alertaEntrega: alertaEntrega,
    diaDe: diaDe,
    SITUACIONES: SITUACIONES,
    infoSituacion: infoSituacion,
    situacion: situacion,
    puntaje: puntaje,
    priorizar: priorizar,
    parsearCaptura: parsearCaptura,
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
