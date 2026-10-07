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
    { id: 'trabajo', ico: '\uD83C\uDFED', nom: 'Trabajo' },
    { id: 'hogar', ico: '\uD83C\uDFE0', nom: 'Casa' },
    { id: 'apps', ico: '\uD83D\uDCBB', nom: 'Apps' },
    { id: 'contenido', ico: '\uD83C\uDFAC', nom: 'Contenido' },
    { id: 'personal', ico: '\uD83C\uDFCB', nom: 'Personal' }
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
    { id: 'urgente', ico: '\u203C', nom: 'Urgente', peso: 3 },
    { id: 'importante', ico: '\u2757', nom: 'Importante', peso: 2 },
    { id: 'normal', ico: '\u25CB', nom: 'Normal', peso: 1 },
    { id: 'baja', ico: '\u2193', nom: 'Baja', peso: 0 }
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
    { id: 'atencion', ico: '\uD83D\uDD34', nom: 'Requiere atencion' },
    { id: 'proximo', ico: '\uD83D\uDFE1', nom: 'Proximo' },
    { id: 'esperando', ico: '\uD83D\uDD35', nom: 'Esperando' },
    { id: 'programado', ico: '\uD83D\uDFE3', nom: 'Programado' },
    { id: 'hecho', ico: '\uD83D\uDFE2', nom: 'Hecho' }
  ];

  function infoSituacion(id) {
    var i;
    for (i = 0; i < SITUACIONES.length; i++) { if (SITUACIONES[i].id === id) { return SITUACIONES[i]; } }
    return { id: 'cancelado', ico: '\u274C', nom: 'Cancelado' };
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

  /* ---------- rutinas (tareas recurrentes) ----------
     Una rutina es una DEFINICION. Cada vez que le toca, genera una OCURRENCIA:
     un item comun con rutinaId y ocurrencia (el dia). La ocurrencia se completa
     o se cierra con un motivo y queda como historial; la siguiente es otro item.
     Frecuencias:
       dias   -> cada N dias desde el inicio (N=1 es diaria)
       semana -> ciertos dias de la semana, cada N semanas
       mes    -> un dia del mes, cada N meses (31 en un mes corto = ultimo dia) */

  var LIMITE_BUSQUEDA = 800;

  function entero(x, min, max, def) {
    var n = parseInt(x, 10);
    if (isNaN(n)) { return def; }
    return n < min ? min : (n > max ? max : n);
  }

  function normalizarRutina(r, hoy) {
    if (!r || typeof r !== 'object') { return null; }
    var texto = typeof r.texto === 'string' ? limpio(r.texto).slice(0, 200) : '';
    if (texto === '' || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.id)) { return null; }
    var inicio = esClave(r.inicio) ? r.inicio : hoy;
    var tipo = r.tipo === 'semana' || r.tipo === 'mes' ? r.tipo : 'dias';
    var dias = [], vistos = {}, i;
    if (Object.prototype.toString.call(r.dias) === '[object Array]') {
      for (i = 0; i < r.dias.length; i++) {
        var d = parseInt(r.dias[i], 10);
        if (d >= 0 && d <= 6 && !vistos[d]) { vistos[d] = true; dias.push(d); }
      }
    }
    dias.sort();
    if (tipo === 'semana' && dias.length === 0) { dias = [diaSemana(inicio)]; }
    var fin = esClave(r.fin) && r.fin >= inicio ? r.fin : '';
    return {
      id: r.id,
      texto: texto,
      contexto: normalizarContexto(r.contexto),
      nivel: nivelDe(r),
      tipo: tipo,
      cada: entero(r.cada, 1, 365, 1),
      dias: dias,
      diaMes: entero(r.diaMes, 1, 31, parseInt(inicio.split('-')[2], 10)),
      inicio: inicio,
      fin: fin,
      activa: r.activa !== false,
      proyectoId: typeof r.proyectoId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r.proyectoId) ? r.proyectoId : '',
      creado: typeof r.creado === 'string' ? r.creado : '',
      actualizado: typeof r.actualizado === 'string' ? r.actualizado : ''
    };
  }

  function lunesDe(k) {
    var dow = diaSemana(k);
    return sumarDias(k, -((dow + 6) % 7));
  }

  function tocaEnDia(r, k) {
    if (k < r.inicio || (r.fin !== '' && k > r.fin)) { return false; }
    if (r.tipo === 'dias') { return difDias(r.inicio, k) % r.cada === 0; }
    if (r.tipo === 'semana') {
      var semanas = Math.round(difDias(lunesDe(r.inicio), lunesDe(k)) / 7);
      if (semanas % r.cada !== 0) { return false; }
      var dow = diaSemana(k), i;
      for (i = 0; i < r.dias.length; i++) { if (r.dias[i] === dow) { return true; } }
      return false;
    }
    var a = deClave(r.inicio), b = deClave(k);
    var meses = (b.getFullYear() * 12 + b.getMonth()) - (a.getFullYear() * 12 + a.getMonth());
    if (meses % r.cada !== 0) { return false; }
    var tope = diasDelMes(b.getFullYear(), b.getMonth());
    return b.getDate() === (r.diaMes > tope ? tope : r.diaMes);
  }

  /* Ultimo dia que le toco hasta 'hasta' inclusive, o '' si nunca. */
  function ultimaFecha(r, hasta) {
    var k = r.fin !== '' && r.fin < hasta ? r.fin : hasta, n = 0;
    while (k >= r.inicio && n < LIMITE_BUSQUEDA) {
      if (tocaEnDia(r, k)) { return k; }
      k = sumarDias(k, -1);
      n++;
    }
    return '';
  }

  /* Proximo dia que le toca desde 'desde' inclusive, o '' si ya no le toca mas. */
  function proximaFecha(r, desde) {
    var k = desde < r.inicio ? r.inicio : desde, n = 0;
    while (n < LIMITE_BUSQUEDA) {
      if (r.fin !== '' && k > r.fin) { return ''; }
      if (tocaEnDia(r, k)) { return k; }
      k = sumarDias(k, 1);
      n++;
    }
    return '';
  }

  var NOMBRES_DIA = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

  function describirRutina(r) {
    if (r.tipo === 'dias') { return r.cada === 1 ? 'Todos los dias' : 'Cada ' + r.cada + ' dias'; }
    if (r.tipo === 'semana') {
      var orden = [1, 2, 3, 4, 5, 6, 0], nombres = [], i, j;
      for (i = 0; i < orden.length; i++) {
        for (j = 0; j < r.dias.length; j++) { if (r.dias[j] === orden[i]) { nombres.push(NOMBRES_DIA[orden[i]]); } }
      }
      var lista = r.dias.length === 7 ? 'todos los dias' : nombres.join(', ');
      return (r.cada === 1 ? 'Cada semana: ' : 'Cada ' + r.cada + ' semanas: ') + lista;
    }
    return (r.cada === 1 ? 'Todos los meses' : 'Cada ' + r.cada + ' meses') + ' el dia ' + r.diaMes;
  }

  function ocurrenciasDe(rutinaId, items) {
    var r = [], i;
    for (i = 0; i < items.length; i++) {
      if (items[i].rutinaId === rutinaId && esClave(items[i].ocurrencia)) { r.push(items[i]); }
    }
    return r;
  }

  /* Que hay que crear y que hay que cerrar hoy. Puro: no toca nada.
     - Se crea solo la ocurrencia del ultimo dia que le toco (hoy o antes): si la
       app no se abrio en tres dias no aparecen tres "dar de comer" atrasados.
     - Una ocurrencia anterior que siga abierta cuando llega la siguiente se cierra
       como 'vencida' (sin registrar). No se borra: el historial dice la verdad. */
  function planificarOcurrencias(rutinas, items, hoy) {
    var crear = [], vencer = [], i, j;
    for (i = 0; i < rutinas.length; i++) {
      var r = rutinas[i];
      if (!r.activa) { continue; }
      var due = ultimaFecha(r, hoy);
      if (due === '') { continue; }
      var occ = ocurrenciasDe(r.id, items), existe = false;
      for (j = 0; j < occ.length; j++) {
        if (occ[j].ocurrencia === due) { existe = true; }
        else if (occ[j].ocurrencia < due && esActivo(occ[j].estado)) { vencer.push(occ[j].id); }
      }
      if (!existe) { crear.push({ rutina: r, fecha: due }); }
    }
    return { crear: crear, vencer: vencer };
  }

  /* Como cuenta cada ocurrencia para una racha:
       +1      hecha (incluye delegada: se resolvio)
       neutro  'no correspondia', o la de hoy todavia abierta
       corta   omitida, vencida o cancelada a secas
     Los dias en que la app no genero ocurrencia (no se abrio, rutina pausada)
     son neutros: la racha mide constancia registrada, no castiga ausencias. */
  function pesoOcurrencia(it, hoy) {
    if (esHecho(it.estado)) { return 1; }
    if (it.estado === 'cancelado') { return it.motivo === 'no_corresponde' ? 0 : -1; }
    return it.ocurrencia >= hoy ? 0 : -1;
  }

  function rachaRutina(r, items, hoy) {
    var occ = ocurrenciasDe(r.id, items);
    occ.sort(function (a, b) { return a.ocurrencia < b.ocurrencia ? -1 : (a.ocurrencia > b.ocurrencia ? 1 : 0); });
    var actual = 0, mejor = 0, hechas = 0, i, p;
    for (i = 0; i < occ.length; i++) {
      p = pesoOcurrencia(occ[i], hoy);
      if (p === 1) { actual++; hechas++; if (actual > mejor) { mejor = actual; } }
      else if (p === -1) { actual = 0; }
    }
    return { actual: actual, mejor: mejor, hechas: hechas, total: occ.length };
  }

  /* ---------- misiones (proyectos) ----------
     Una mision tiene objetivo, hitos (la estructura: que tiene que pasar) y
     tareas vinculadas (el trabajo diario, con proyectoId). El progreso sale de
     los hitos si los hay, porque son la forma de la mision; si no, de las tareas. */

  var ESTADOS_MISION = { activo: 1, pausado: 1, terminado: 1 };

  function idValido(x) { return typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x); }

  function normalizarProyecto(p) {
    if (!p || typeof p !== 'object' || !idValido(p.id)) { return null; }
    var nombre = typeof p.nombre === 'string' ? limpio(p.nombre).slice(0, 120) : '';
    if (nombre === '') { return null; }
    var hitos = [], i, vistos = {};
    if (Object.prototype.toString.call(p.hitos) === '[object Array]') {
      for (i = 0; i < p.hitos.length && hitos.length < 100; i++) {
        var h = p.hitos[i];
        if (!h || typeof h !== 'object' || typeof h.texto !== 'string') { continue; }
        var t = limpio(h.texto).slice(0, 160);
        if (t === '') { continue; }
        var hid = idValido(h.id) && !vistos['#' + h.id] ? h.id : 'h' + i + '-' + hitos.length;
        vistos['#' + hid] = true;
        hitos.push({ id: hid, texto: t, hecho: h.hecho === true, cuando: h.hecho === true && typeof h.cuando === 'string' ? h.cuando : '' });
      }
    }
    var estado = ESTADOS_MISION[p.estado] === 1 ? p.estado : 'activo';
    return {
      id: p.id,
      nombre: nombre,
      objetivo: typeof p.objetivo === 'string' ? p.objetivo.replace(/^\s+|\s+$/g, '').slice(0, 600) : '',
      contexto: normalizarContexto(p.contexto),
      estado: estado,
      hitos: hitos,
      creado: typeof p.creado === 'string' ? p.creado : '',
      actualizado: typeof p.actualizado === 'string' ? p.actualizado : '',
      terminado: estado === 'terminado' && typeof p.terminado === 'string' ? p.terminado : ''
    };
  }

  function tareasDeProyecto(id, items) {
    var r = [], i;
    for (i = 0; i < items.length; i++) { if (items[i].proyectoId === id) { r.push(items[i]); } }
    return r;
  }

  function progresoProyecto(p, items) {
    var t = tareasDeProyecto(p.id, items), th = 0, tt = 0, hh = 0, i;
    for (i = 0; i < t.length; i++) {
      if (t[i].estado === 'cancelado') { continue; }
      tt++;
      if (esHecho(t[i].estado)) { th++; }
    }
    for (i = 0; i < p.hitos.length; i++) { if (p.hitos[i].hecho) { hh++; } }
    var pct = 0;
    if (p.hitos.length > 0) { pct = Math.round((hh * 100) / p.hitos.length); }
    else if (tt > 0) { pct = Math.round((th * 100) / tt); }
    if (p.estado === 'terminado') { pct = 100; }
    return { pct: pct, hitosHechos: hh, hitosTotal: p.hitos.length, tareasHechas: th, tareasTotal: tt };
  }

  /* El proximo movimiento concreto de una mision, nunca "en progreso". */
  function proximaAccion(p, items, hoy, ahoraMs) {
    var activas = [], i;
    var t = tareasDeProyecto(p.id, items);
    for (i = 0; i < t.length; i++) { if (esActivo(t[i].estado)) { activas.push(t[i]); } }
    var r = priorizar(activas, hoy, ahoraMs);
    if (r.length > 0) { return { tipo: 'tarea', item: r[0].item, motivo: r[0].motivo }; }
    for (i = 0; i < p.hitos.length; i++) {
      if (!p.hitos[i].hecho) { return { tipo: 'hito', hito: p.hitos[i], motivo: activas.length ? 'Lo demas espera' : 'Proximo hito' }; }
    }
    if (activas.length > 0) { return { tipo: 'espera', item: activas[0], motivo: 'Esperando o agendada' }; }
    return null;
  }

  /* ---------- diario operativo ----------
     Lectura curada del registro de eventos: solo lo que importa recordar.
     Una tarea completada que despues se reabrio (o se deshizo) no figura como
     hecha: el diario no puede decir algo que ya no es verdad. Si se vuelve a
     completar, figura el dia de la ultima vez. */

  var GLOBALES = { logro: 1, nivel: 1 };

  function porTs(a, b) { return a.ts < b.ts ? -1 : (a.ts > b.ts ? 1 : 0); }

  function diario(eventos, items, filtro) {
    var porId = {}, i, ev, k;
    for (i = 0; i < items.length; i++) { porId['#' + items[i].id] = items[i]; }
    var evs = eventos.slice(0).sort(porTs);
    var ultima = {};
    for (i = 0; i < evs.length; i++) {
      ev = evs[i];
      k = '#' + ev.itemId;
      var cierra = (ev.tipo === 'estado' && HECHOS[ev.hasta] === 1) || (ev.tipo === 'excepcion' && ev.hasta === 'delegada');
      var abre = (ev.tipo === 'estado' || ev.tipo === 'deshacer') && !HECHOS[ev.hasta] ||
        (ev.tipo === 'excepcion' && ev.hasta !== 'delegada') || ev.tipo === 'vuelta';
      if (cierra) { ultima[k] = i; }
      else if (abre && ultima.hasOwnProperty(k)) { delete ultima[k]; }
    }
    var desde = filtro && filtro.desde ? filtro.desde : '';
    var ctx = filtro && filtro.contexto ? filtro.contexto : 'todo';
    var dias = [], indice = {};
    for (i = evs.length - 1; i >= 0; i--) {
      ev = evs[i];
      if (desde && ev.ts < desde) { break; }
      if (ctx !== 'todo' && ev.contexto !== ctx && !GLOBALES[ev.tipo]) { continue; }
      var e = entradaDiario(ev, i, ultima, porId);
      if (!e) { continue; }
      var dia = claveDeIso(ev.ts);
      if (dia === '') { continue; }
      if (!indice.hasOwnProperty('#' + dia)) {
        indice['#' + dia] = dias.length;
        dias.push({ dia: dia, entradas: [], cuenta: { hechas: 0, rutinas: 0, hitos: 0, misiones: 0, logros: 0 } });
      }
      var g = dias[indice['#' + dia]];
      g.entradas.push(e);
      if (e.clase === 'hecha') { g.cuenta.hechas++; }
      if (e.clase === 'rutina') { g.cuenta.rutinas++; }
      if (e.clase === 'hito') { g.cuenta.hitos++; }
      if (e.clase === 'mision') { g.cuenta.misiones++; }
      if (e.clase === 'logro') { g.cuenta.logros++; }
    }
    return dias;
  }

  function entradaDiario(ev, i, ultima, porId) {
    var base = { ts: ev.ts, itemId: ev.itemId, contexto: ev.contexto };
    function e(clase, ico, texto, sub) {
      base.clase = clase; base.ico = ico; base.texto = texto; base.sub = sub || '';
      return base;
    }
    if ((ev.tipo === 'estado' && HECHOS[ev.hasta] === 1) || (ev.tipo === 'excepcion' && ev.hasta === 'delegada')) {
      if (ultima['#' + ev.itemId] !== i) { return null; }
      var it = porId['#' + ev.itemId];
      var delegada = ev.tipo === 'excepcion';
      if (it && it.rutinaId) { return e('rutina', '\uD83D\uDD04', ev.texto, delegada ? 'delegada' : ''); }
      if (it && it.tipo === 'compra') { return e('hecha', '\uD83D\uDCE6', ev.texto, ev.hasta === 'recibido' ? 'material recibido' : 'comprado'); }
      return e('hecha', '\u2714', ev.texto, delegada ? 'delegada' : '');
    }
    if (ev.tipo === 'hito') { return e('hito', '\uD83C\uDFAF', 'Hito: ' + ev.hasta, ev.texto + (ev.desde ? ' \u00B7 ' + ev.desde + '%' : '')); }
    if (ev.tipo === 'mision_alta') { return e('mision', '\uD83D\uDE80', 'Nueva mision: ' + ev.texto, ''); }
    if (ev.tipo === 'mision_fin') { return e('mision', '\uD83C\uDFC1', 'Mision cumplida: ' + ev.texto, ''); }
    if (ev.tipo === 'mision_reabre') { return e('nota', '\u21A9', 'Retomaste la mision: ' + ev.texto, ''); }
    if (ev.tipo === 'rutina_alta') { return e('nota', '\uD83D\uDD04', 'Nueva rutina: ' + ev.texto, ev.hasta); }
    if (ev.tipo === 'comentario') { return e('nota', '\uD83D\uDCAC', ev.hasta, ev.texto); }
    if (ev.tipo === 'logro') { return e('logro', '\uD83C\uDFC6', 'Logro: ' + ev.hasta, ev.texto); }
    if (ev.tipo === 'nivel') { return e('logro', '\u2B50', 'Nivel ' + ev.hasta, ev.texto); }
    if (ev.tipo === 'restauracion') { return e('sistema', '\u2699', 'Restauraste un backup', ev.texto); }
    return null;
  }

  return {
    diario: diario,
    normalizarProyecto: normalizarProyecto,
    tareasDeProyecto: tareasDeProyecto,
    progresoProyecto: progresoProyecto,
    proximaAccion: proximaAccion,
    normalizarRutina: normalizarRutina,
    tocaEnDia: tocaEnDia,
    ultimaFecha: ultimaFecha,
    proximaFecha: proximaFecha,
    describirRutina: describirRutina,
    ocurrenciasDe: ocurrenciasDe,
    planificarOcurrencias: planificarOcurrencias,
    rachaRutina: rachaRutina,
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
