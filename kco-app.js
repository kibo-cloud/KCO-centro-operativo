/* KCO — Centro Operativo Personal — interfaz y persistencia. ES5 estricto. */
(function () {
  'use strict';

  var K = window.KCOCore;
  var VERSION_APP = '1.1.1';
  /* El esquema sigue en 4: la v0.8 no cambia la forma de los datos.
     Subirlo sin motivo rompe la compatibilidad de backups hacia atras. */
  var ESQUEMA = 4;
  var HORAS_ALERTA_ENTREGA = 48;
  var DIAS_AVISO_BACKUP = 14;
  var LARGO_CAMPO = 60;
  var TOPE_CATALOGO = 200;

  var K_CTX = 'kibco.contexto';
  var K_ITEMS = 'kibco.items';
  var K_EVENTOS = 'kibco.eventos';
  var K_ESQUEMA = 'kibco.esquema';
  var K_FILTRO = 'kibco.filtro';
  var K_FILTROC = 'kibco.filtroCompra';
  var K_FILTROTAG = 'kibco.filtroTag';
  var K_LUZ = 'kibco.luz';
  var K_VISTA = 'kibco.vista';
  var K_BACKUP = 'kibco.ultimoBackup';
  var K_SOLIC = 'kibco.solicitantes';
  var K_DEST = 'kibco.destinos';
  var K_CTXCAP = 'kibco.contextoCaptura';

  var ESTADOS_TAREA = [
    { id: 'entrada', ico: '\uD83D\uDCE5', nom: 'Entrada' },
    { id: 'pendiente', ico: '\uD83D\uDD35', nom: 'Pendiente' },
    { id: 'proceso', ico: '\uD83D\uDFE1', nom: 'En proceso' },
    { id: 'esperando', ico: '\u23F8', nom: 'Esperando' },
    { id: 'completado', ico: '\uD83D\uDFE2', nom: 'Completado' },
    { id: 'cancelado', ico: '\u274C', nom: 'Cancelado' }
  ];

  /* Compras de fabrica: flujo completo con OC y OT. Solo en Trabajo. */
  var ESTADOS_COMPRA = [
    { id: 'cotizando', ico: '\uD83D\uDCE5', nom: 'Cotizando' },
    { id: 'esperando_oc', ico: '\uD83D\uDCDD', nom: 'Esperando OC' },
    { id: 'esperando_aprob', ico: '\u23F3', nom: 'Esperando aprob.' },
    { id: 'oc_enviada', ico: '\uD83D\uDCE4', nom: 'OC enviada' },
    { id: 'esperando_entrega', ico: '\uD83D\uDE9A', nom: 'Esperando entrega' },
    /* El id queda 'recibido' para no romper datos ni backups de 0.6 en adelante.
       Solo cambia la etiqueta visible. */
    { id: 'recibido', ico: '\uD83D\uDCE6', nom: 'Material Recibido' },
    { id: 'cancelado', ico: '\u274C', nom: 'Cancelado' }
  ];

  /* Compras del hogar: lista simple, sin OC, sin OT, sin proveedores. */
  var ESTADOS_COMPRA_HOGAR = [
    { id: 'por_comprar', ico: '\uD83D\uDED2', nom: 'Por comprar' },
    { id: 'comprado', ico: '\u2705', nom: 'Comprado' },
    { id: 'cancelado', ico: '\u274C', nom: 'Cancelado' }
  ];

  /* Catalogo completo de tags. tagInfo busca aca, asi un tag viejo
     sigue mostrandose aunque ya no se ofrezca en ese contexto. */
  var TAGS = [
    { id: 'relevamiento', ico: '\uD83D\uDCCF', nom: 'Relevamiento' },
    { id: 'limpieza', ico: '\uD83E\uDDF9', nom: 'Limpieza' },
    { id: 'adm', ico: '\uD83D\uDCC4', nom: 'Adm / Legajos' },
    { id: 'proveedor', ico: '\uD83C\uDFE2', nom: 'Alta Proveedor' },
    { id: 'panol', ico: '\uD83E\uDDF0', nom: 'Pa\u00F1ol' },
    { id: 'gestion', ico: '\uD83D\uDCCB', nom: 'Gestion' },
    { id: 'comida', ico: '\uD83C\uDF7D', nom: 'Comida' },
    { id: 'higiene', ico: '\uD83E\uDDFC', nom: 'Higiene' },
    { id: 'mantenimiento', ico: '\uD83D\uDD27', nom: 'Mantenimiento' },
    { id: 'hogar', ico: '\uD83C\uDFE0', nom: 'Hogar' }
  ];

  var TAGS_TRABAJO = ['relevamiento', 'limpieza', 'adm', 'proveedor', 'panol', 'gestion'];
  var TAGS_HOGAR = ['comida', 'limpieza', 'higiene', 'mantenimiento', 'hogar'];
  /* Apps, Contenido y Personal no traen clasificaciones propias: se ordenan por
     prioridad, dia y mision. Si un item llega con un tag de otro contexto se
     sigue viendo para poder sacarlo, igual que siempre. */

  var RANGOS = [
    { id: 'hoy', nom: 'Hoy', dias: 1 },
    { id: 'd7', nom: '7 dias', dias: 7 },
    { id: 'd30', nom: '30 dias', dias: 30 },
    { id: 'todo', nom: 'Todo', dias: 0 }
  ];

  var CERRADOS = { completado: 1, cancelado: 1, recibido: 1, comprado: 1 };

  var items = [];
  var eventos = [];
  var contexto = 'trabajo';
  /* Donde cae lo que se captura mirando 'Todo': el ultimo contexto elegido. */
  var ctxCaptura = 'trabajo';
  var filtro = 'activos';
  var filtroCompra = 'activos';
  var filtroTag = '';
  var modoLuz = false;
  var vista = 'tablero';
  var rango = 'hoy';
  var soloLectura = false;
  var migrarComprasHogar = false;
  var itemAbierto = null;
  var confAccion = null;

  function $(id) { return document.getElementById(id); }

  function avisar(texto) {
    $('aviso').textContent = texto;
    $('aviso').className = 'aviso on';
  }

  function leer(clave) {
    try { return window.localStorage.getItem(clave); } catch (e) { return null; }
  }

  function escribir(clave, valor) {
    try {
      window.localStorage.setItem(clave, valor);
      return true;
    } catch (e) {
      avisar('No se pudo guardar. Puede estar lleno el almacenamiento del navegador.');
      return false;
    }
  }

  function dosDig(n) { return n < 10 ? '0' + n : '' + n; }
  function fechaObj(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? null : d; }
  function claveDia(d) { return d.getFullYear() + '-' + dosDig(d.getMonth() + 1) + '-' + dosDig(d.getDate()); }
  function hhmm(d) { return dosDig(d.getHours()) + ':' + dosDig(d.getMinutes()); }

  function etiquetaDia(clave) {
    var p = clave.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    var hoy = new Date();
    var ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    if (claveDia(hoy) === clave) { return 'Hoy'; }
    if (claveDia(ayer) === clave) { return 'Ayer'; }
    var dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    return dias[d.getDay()] + ' ' + dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1);
  }

  function horaCorta(iso) {
    var d = fechaObj(iso);
    if (!d) { return ''; }
    if (claveDia(d) === claveDia(new Date())) { return 'Hoy ' + hhmm(d); }
    return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1) + ' ' + hhmm(d);
  }

  function nuevoId(p) { return (p || 'i') + Date.now() + '-' + Math.floor(Math.random() * 100000); }

  function listaEstados(tipo, ctx) {
    if (tipo !== 'compra') { return ESTADOS_TAREA; }
    return K.esFabrica(ctx) ? ESTADOS_COMPRA : ESTADOS_COMPRA_HOGAR;
  }

  function listaTags(ctx) {
    var r = [], i;
    if (ctx === 'todo') { return TAGS.slice(0); }
    var ids = ctx === 'hogar' ? TAGS_HOGAR : (ctx === 'trabajo' ? TAGS_TRABAJO : []);
    for (i = 0; i < ids.length; i++) {
      var t = tagInfo(ids[i]);
      if (t) { r.push(t); }
    }
    return r;
  }

  function estadoInfo(id) {
    var i;
    for (i = 0; i < ESTADOS_TAREA.length; i++) { if (ESTADOS_TAREA[i].id === id) { return ESTADOS_TAREA[i]; } }
    for (i = 0; i < ESTADOS_COMPRA.length; i++) { if (ESTADOS_COMPRA[i].id === id) { return ESTADOS_COMPRA[i]; } }
    for (i = 0; i < ESTADOS_COMPRA_HOGAR.length; i++) { if (ESTADOS_COMPRA_HOGAR[i].id === id) { return ESTADOS_COMPRA_HOGAR[i]; } }
    return ESTADOS_TAREA[0];
  }

  function estadoValido(tipo, ctx, id) {
    var l = listaEstados(tipo, ctx), i;
    for (i = 0; i < l.length; i++) { if (l[i].id === id) { return true; } }
    return false;
  }

  /* Un estado de compra de fabrica no existe en Hogar y viceversa.
     Este mapeo evita que un item quede con un estado huerfano. */
  function estadoEquivalente(tipo, ctx, id) {
    if (estadoValido(tipo, ctx, id)) { return id; }
    if (tipo !== 'compra') { return 'entrada'; }
    if (!K.esFabrica(ctx)) {
      if (id === 'recibido') { return 'comprado'; }
      if (id === 'cancelado') { return 'cancelado'; }
      return 'por_comprar';
    }
    if (id === 'comprado') { return 'recibido'; }
    if (id === 'cancelado') { return 'cancelado'; }
    return 'cotizando';
  }

  function tagInfo(id) {
    var i;
    for (i = 0; i < TAGS.length; i++) { if (TAGS[i].id === id) { return TAGS[i]; } }
    return null;
  }

  function esActivo(estado) { return !CERRADOS[estado]; }

  /* ---------- datos ---------- */

  /* Campos agregados en 0.9.3. Viven fuera del esquema: se leen siempre con
     fallback, asi un backup viejo (sin ellos) entra sin migracion y el numero
     de esquema se queda en 4. */
  function normalizarNotas(x) {
    if (!esArray(x)) { return []; }
    var r = [], i, c;
    for (i = 0; i < x.length; i++) {
      c = x[i];
      if (!c || typeof c !== 'object') { continue; }
      if (!c.texto) { continue; }
      r.push({
        cuando: c.cuando ? '' + c.cuando : new Date().toISOString(),
        texto: '' + c.texto
      });
    }
    return r;
  }

  function notasDe(it) { return esArray(it.comentarios) ? it.comentarios : []; }

  /* ---------- catalogos auto-aprendices ---------- */

  var solicitantes = [];
  var destinos = [];

  /* Un solo lugar donde se limpia lo que escribe el usuario: espacios de mas
     adentro y afuera, y tope de largo para que un pegado accidental de medio
     texto no reviente la tarjeta ni el catalogo. */
  function limpiarTexto(x, tope) {
    if (x === null || typeof x === 'undefined') { return ''; }
    var t = ('' + x).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    if (t.length > tope) { t = t.substring(0, tope).replace(/\s+$/, ''); }
    return t;
  }

  /* La clave del mapa de vistos lleva un '#' adelante a proposito: sin eso,
     un valor como "constructor" o "toString" da verdadero contra el prototipo
     de Object y el elemento se descartaria como si ya estuviera. */
  function normalizarCatalogo(x) {
    if (!esArray(x)) { return []; }
    var r = [], vistos = {}, i, t, k;
    for (i = 0; i < x.length; i++) {
      if (typeof x[i] !== 'string' && typeof x[i] !== 'number') { continue; }
      t = limpiarTexto(x[i], LARGO_CAMPO);
      if (t === '') { continue; }
      k = '#' + t.toLowerCase();
      if (vistos[k] === true) { continue; }
      vistos[k] = true;
      r.push(t);
      if (r.length >= TOPE_CATALOGO) { break; }
    }
    return ordenarCatalogo(r);
  }

  function ordenarCatalogo(a) {
    return a.sort(function (x, y) {
      var xa = x.toLowerCase(), ya = y.toLowerCase();
      if (xa < ya) { return -1; }
      if (xa > ya) { return 1; }
      return 0;
    });
  }

  function cargarCatalogos() {
    solicitantes = leerCatalogo(K_SOLIC);
    destinos = leerCatalogo(K_DEST);
  }

  function leerCatalogo(clave) {
    var crudo = leer(clave);
    if (!crudo) { return []; }
    try { return normalizarCatalogo(JSON.parse(crudo)); } catch (e) { return []; }
  }

  function enCatalogo(lista, texto) {
    var t = texto.toLowerCase(), i;
    for (i = 0; i < lista.length; i++) {
      if (lista[i].toLowerCase() === t) { return i; }
    }
    return -1;
  }

  /* Aprende sola: si lo tipeado no esta, entra. La comparacion ignora
     mayusculas, asi "Cinta 3" y "cinta 3" no quedan como dos entradas. */
  function aprender(lista, clave, texto) {
    var t = limpiarTexto(texto, LARGO_CAMPO);
    if (t === '') { return false; }
    if (enCatalogo(lista, t) > -1) { return false; }
    if (lista.length >= TOPE_CATALOGO) { return false; }
    lista.push(t);
    ordenarCatalogo(lista);
    escribir(clave, JSON.stringify(lista));
    return true;
  }

  function olvidar(lista, clave, texto) {
    var i = enCatalogo(lista, texto);
    if (i < 0) { return false; }
    lista.splice(i, 1);
    escribir(clave, JSON.stringify(lista));
    return true;
  }

  function pintarDatalist(idLista, valores) {
    var dl = $(idLista);
    if (!dl) { return; }
    while (dl.firstChild) { dl.removeChild(dl.firstChild); }
    var i, o;
    for (i = 0; i < valores.length; i++) {
      o = document.createElement('option');
      o.value = valores[i];
      dl.appendChild(o);
    }
  }

  function pintarDatalists() {
    pintarDatalist('listaSolicitantes', solicitantes);
    pintarDatalist('listaDestinos', destinos);
  }

  /* Con el teclado abierto Android achica el alto visible y el campo puede
     quedar tapado. Se lo acerca al borde de abajo una vez que el teclado
     termino de subir. */
  function acercarAlTeclado(inp) {
    if (!inp) { return; }
    inp.onfocus = function () {
      if (typeof window.setTimeout !== 'function') { return; }
      window.setTimeout(function () {
        try { inp.scrollIntoView(false); } catch (e) {}
      }, 280);
    };
  }

  /* Checklist del item, agregado en 1.0.0. Mismo criterio que los comentarios:
     fuera del esquema y con fallback en lectura. */
  function normalizarPasos(x) {
    if (!esArray(x)) { return []; }
    var r = [], i, c;
    for (i = 0; i < x.length; i++) {
      c = x[i];
      if (!c || typeof c !== 'object') { continue; }
      if (!c.texto) { continue; }
      r.push({ texto: '' + c.texto, hecho: c.hecho === true });
    }
    return r;
  }

  function pasosDe(it) { return esArray(it.pasos) ? it.pasos : []; }

  function pasosHechos(arr) {
    var i, n = 0;
    for (i = 0; i < arr.length; i++) { if (arr[i].hecho === true) { n++; } }
    return n;
  }

  function normalizarItem(it) {
    if (!it || typeof it !== 'object') { return null; }
    var creado = it.creado ? '' + it.creado : new Date().toISOString();
    var ctx = K.normalizarContexto(it.contexto);
    var tipo = it.tipo === 'compra' ? 'compra' : 'tarea';
    var est = it.estado ? '' + it.estado : (tipo === 'compra' ? (K.esFabrica(ctx) ? 'cotizando' : 'por_comprar') : 'entrada');
    var nivel = K.nivelDe(it);
    est = estadoEquivalente(tipo, ctx, est);
    var act = it.actualizado ? '' + it.actualizado : creado;
    var tag = it.tag ? '' + it.tag : '';
    if (tag !== '' && !tagInfo(tag)) { tag = ''; }
    return {
      id: it.id ? '' + it.id : nuevoId(),
      texto: it.texto ? '' + it.texto : '',
      contexto: ctx,
      tipo: tipo,
      estado: est,
      espera: it.espera ? '' + it.espera : '',
      prioridad: nivel === 'urgente',
      tag: tag,
      recordatorio: it.recordatorio ? '' + it.recordatorio : '',
      recAvisado: it.recAvisado === true,
      creado: creado,
      actualizado: act,
      estadoDesde: it.estadoDesde ? '' + it.estadoDesde : act,
      comentarios: normalizarNotas(it.comentarios),
      pausado: it.pausado === true,
      pausadoDesde: it.pausadoDesde ? '' + it.pausadoDesde : '',
      pasos: normalizarPasos(it.pasos),
      anclado: it.anclado === true,
      solicitante: limpiarTexto(it.solicitante, LARGO_CAMPO),
      destino: limpiarTexto(it.destino, LARGO_CAMPO),
      /* Agregados en 2.0, fuera del esquema y con fallback, igual que 0.9.3. */
      nivel: nivel,
      fecha: K.esClave(it.fecha) ? it.fecha : '',
      proyectoId: idSeguro(it.proyectoId),
      rutinaId: idSeguro(it.rutinaId),
      ocurrencia: K.esClave(it.ocurrencia) ? it.ocurrencia : '',
      motivo: MOTIVOS[it.motivo] === 1 ? it.motivo : ''
    };
  }

  /* Motivo de cierre de una ocurrencia de rutina. Una ocurrencia que no se hizo
     se cierra como cancelada con su motivo, nunca se borra: el historial queda. */
  var MOTIVOS = { omitida: 1, no_corresponde: 1, delegada: 1, vencida: 1 };

  function idSeguro(x) {
    if (typeof x !== 'string') { return ''; }
    return /^[A-Za-z0-9_-]{1,40}$/.test(x) ? x : '';
  }

  function normalizarEvento(ev) {
    if (!ev || typeof ev !== 'object') { return null; }
    return {
      id: ev.id ? '' + ev.id : nuevoId('e'),
      ts: ev.ts ? '' + ev.ts : new Date().toISOString(),
      tipo: ev.tipo ? '' + ev.tipo : 'nota',
      itemId: ev.itemId ? '' + ev.itemId : '',
      texto: ev.texto ? '' + ev.texto : '',
      contexto: K.normalizarContexto(ev.contexto),
      desde: ev.desde ? '' + ev.desde : '',
      hasta: ev.hasta ? '' + ev.hasta : ''
    };
  }

  function esArray(x) { return Object.prototype.toString.call(x) === '[object Array]'; }

  function cargarLista(clave, normalizador) {
    var crudo = leer(clave);
    if (crudo === null || crudo === '') { return []; }
    var datos = null;
    try { datos = JSON.parse(crudo); } catch (e) { datos = null; }
    if (!esArray(datos)) {
      escribir(clave + '.roto.' + Date.now(), crudo);
      soloLectura = true;
      avisar('Datos ilegibles en ' + clave + '. Guarde una copia intacta y no escribo encima. Restaura un backup desde Ajustes.');
      return [];
    }
    var salida = [], i;
    for (i = 0; i < datos.length; i++) {
      var n = normalizador(datos[i]);
      if (n) { salida.push(n); }
    }
    return salida;
  }

  function migrar() {
    var v = leer(K_ESQUEMA);
    if (v === null) { escribir(K_ESQUEMA, '' + ESQUEMA); return; }
    var n = parseInt(v, 10);
    if (isNaN(n)) {
      soloLectura = true;
      avisar('El esquema de datos guardado no se entiende. No escribo nada.');
      return;
    }
    if (n > ESQUEMA) {
      soloLectura = true;
      avisar('Estos datos son de una version mas nueva de KCO (esquema ' + n + '). No escribo nada para no romperlos.');
      return;
    }
    if (n < ESQUEMA) {
      /* 1 -> 2: aparece kibco.eventos y el campo espera. */
      if (leer(K_EVENTOS) === null) { escribir(K_EVENTOS, '[]'); }
      /* 2 -> 3: aparecen tipo, prioridad, tag, recordatorio, recAvisado y estadoDesde.
         Todos con default en la lectura. */
      /* 3 -> 4: Hogar deja de usar el flujo de compras de fabrica. Las compras de hogar
         que quedaron con estados de OC/OT se pasan a la lista simple. Se persiste aca
         porque el estado viejo ya no existe en ese contexto. Nada mas se toca. */
      escribir(K_ESQUEMA, '' + ESQUEMA);
      migrarComprasHogar = n < 4;
    }
  }

  function aplicarMigracion4() {
    if (!migrarComprasHogar || soloLectura) { return; }
    var crudo = leer(K_ITEMS);
    if (crudo === null || crudo === '') { return; }
    var previos = null;
    try { previos = JSON.parse(crudo); } catch (e) { return; }
    if (!esArray(previos)) { return; }
    var cambiados = 0, i;
    for (i = 0; i < previos.length; i++) {
      var v = previos[i];
      if (!v || typeof v !== 'object') { continue; }
      if (v.contexto !== 'hogar' || v.tipo !== 'compra') { continue; }
      if (estadoValido('compra', 'hogar', v.estado)) { continue; }
      cambiados++;
    }
    if (cambiados === 0) { return; }
    guardarItems();
    eventos.push({
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'migracion', itemId: '',
      texto: cambiados + ' compras de Hogar pasadas a la lista simple',
      contexto: 'hogar', desde: 'esquema 3', hasta: 'esquema 4'
    });
    guardarEventos();
  }

  function guardarItems() { return soloLectura ? false : escribir(K_ITEMS, JSON.stringify(items)); }
  function guardarEventos() { return soloLectura ? false : escribir(K_EVENTOS, JSON.stringify(eventos)); }

  function registrar(tipo, item, desde, hasta) {
    if (soloLectura) { return; }
    eventos.push({
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo,
      itemId: item.id, texto: item.texto, contexto: item.contexto,
      desde: desde || '', hasta: hasta || ''
    });
    guardarEventos();
  }

  function buscarItem(id) {
    var i;
    for (i = 0; i < items.length; i++) { if (items[i].id === id) { return items[i]; } }
    return null;
  }

  /* La deteccion de hora, dia, contexto y prioridad al tipear vive en
     KCOCore.parsearCaptura, con sus pruebas. */

  function fijarRecordatorio(it, d) {
    it.recordatorio = d.toISOString();
    it.recAvisado = false;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('recordatorio', it, '', horaCorta(it.recordatorio));
      pintar();
      pintarHojaItem();
    }
  }

  /* ---------- notificaciones ---------- */

  function hayNotificacion() {
    return typeof window.Notification !== 'undefined';
  }

  function estadoNotif() {
    if (!hayNotificacion()) { return 'no disponible'; }
    return window.Notification.permission;
  }

  function notificar(it) {
    if (!hayNotificacion() || window.Notification.permission !== 'granted') { return false; }
    try {
      var n = new window.Notification('KCO \u00B7 ' + nomCtx(it.contexto), {
        body: it.texto, icon: './icono-192.png', tag: it.id
      });
      return !!n;
    } catch (e) { return false; }
  }

  function chequearRecordatorios() {
    var ahora = Date.now();
    var vencidos = [];
    var cambio = false;
    var i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.recordatorio === '' || !esActivo(it.estado)) { continue; }
      var d = fechaObj(it.recordatorio);
      if (!d || d.getTime() > ahora) { continue; }
      vencidos.push(it);
      if (!it.recAvisado) {
        notificar(it);
        it.recAvisado = true;
        cambio = true;
      }
    }
    if (cambio) { guardarItems(); }
    var caja = $('recuerdo');
    if (vencidos.length === 0) {
      caja.className = 'recuerdo';
      caja.textContent = '';
      return;
    }
    var partes = [];
    for (i = 0; i < vencidos.length && i < 4; i++) {
      partes.push(hhmm(fechaObj(vencidos[i].recordatorio)) + ' ' + vencidos[i].texto);
    }
    caja.textContent = '\u23F0 Vencido: ' + partes.join(' \u00B7 ') +
      (vencidos.length > 4 ? ' (+' + (vencidos.length - 4) + ')' : '');
    caja.className = 'recuerdo on';
  }

  /* ---------- captura ---------- */

  /* Todo item nuevo pasa por el mismo normalizador que lo que se lee del disco:
     un solo lugar define la forma de un item. */
  function itemNuevo(texto, ctx, extra) {
    var ahora = new Date().toISOString();
    var base = {
      id: nuevoId(), texto: texto, contexto: ctx, tipo: 'tarea', estado: 'entrada',
      creado: ahora, actualizado: ahora, estadoDesde: ahora
    }, k;
    if (extra) { for (k in extra) { if (extra.hasOwnProperty(k)) { base[k] = extra[k]; } } }
    return normalizarItem(base);
  }

  function capturar() {
    var crudo = $('txtCaptura').value.replace(/^\s+|\s+$/g, '');
    if (crudo === '' || soloLectura) { return; }
    var p = K.parsearCaptura(crudo, new Date());
    var it = itemNuevo(p.texto, p.contexto || ctxCaptura, {
      recordatorio: p.recordatorio, fecha: p.fecha, nivel: p.nivel || 'normal'
    });
    items.push(it);
    if (guardarItems()) {
      registrar('captura', it, '', 'entrada');
      if (it.recordatorio !== '') { registrar('recordatorio', it, '', horaCorta(it.recordatorio)); }
      $('txtCaptura').value = '';
      pintar();
      $('txtCaptura').focus();
    } else {
      items.pop();
    }
  }

  function cambiarEstado(id, nuevo) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.estado === nuevo) { return; }
    if (!estadoValido(it.tipo, it.contexto, nuevo)) { return; }
    var previo = it.estado;
    var foto = fotoDe(it);
    var ahora = new Date().toISOString();
    it.estado = nuevo;
    it.actualizado = ahora;
    it.estadoDesde = ahora;
    /* Avanzar de casillero implica que la compra volvio a moverse. */
    it.pausado = false;
    it.pausadoDesde = '';
    if (nuevo !== 'esperando') { it.espera = ''; }
    if (guardarItems()) {
      registrar('estado', it, previo, nuevo);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
      (function (idGuardado, f, txt) {
        ofrecerDeshacer(txt, function () { restaurarFoto(idGuardado, f, 'estado'); });
      })(id, foto, estadoInfo(nuevo).nom + ': ' + it.texto);
    } else {
      it.estado = previo;
    }
  }

  function horasEn(iso) {
    var d = fechaObj(iso);
    if (!d) { return 0; }
    return (Date.now() - d.getTime()) / 3600000;
  }

  function alertaEntrega(it) {
    if (it.tipo !== 'compra' || it.estado !== 'esperando_entrega') { return 0; }
    /* En pausa el reloj no corre: no tiene sentido reclamar una entrega que
       vos mismo frenaste. */
    if (it.pausado === true) { return 0; }
    var h = horasEn(it.estadoDesde);
    return h > HORAS_ALERTA_ENTREGA ? h : 0;
  }

  /* ---------- pintado ---------- */

  /* 'todo' no es un contexto de datos: es la vista que junta los cinco. */
  function enContexto(it) { return contexto === 'todo' || it.contexto === contexto; }

  function delContexto(tipo) {
    var r = [], i;
    for (i = 0; i < items.length; i++) {
      if (enContexto(items[i]) && items[i].tipo === tipo) { r.push(items[i]); }
    }
    return r;
  }

  function nomCtx(id) {
    if (id === 'todo') { return 'Todo'; }
    var c = K.infoContexto(id);
    return c ? c.nom : 'Trabajo';
  }

  function icoCtx(id) {
    if (id === 'todo') { return '⭐'; }
    var c = K.infoContexto(id);
    return c ? c.ico : '';
  }

  function icoNomCtx(id) { return icoCtx(id) + ' ' + nomCtx(id); }

  /* Fila de contextos del encabezado: Todo primero, despues los cinco. */
  function pintarSelectorContexto() {
    var cont = $('ctxsel');
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    var defs = [{ id: 'todo' }].concat(K.CONTEXTOS), i;
    for (i = 0; i < defs.length; i++) {
      (function (id) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = contexto === id ? 'ctxbtn on' : 'ctxbtn';
        b.setAttribute('data-ctx', id);
        b.setAttribute('aria-pressed', contexto === id ? 'true' : 'false');
        b.textContent = icoCtx(id) + ' ' + nomCtx(id).toUpperCase();
        b.onclick = function () { aplicarContexto(id, true); };
        cont.appendChild(b);
      })(defs[i].id);
    }
  }

  function pintarPistaCaptura() {
    var inp = $('txtCaptura');
    if (inp) {
      inp.setAttribute('placeholder', 'Capturar en ' + icoNomCtx(ctxCaptura) + ' · Enter guarda');
    }
  }

  /* Grilla de opciones de un toque para la ficha: nivel, contexto. */
  function pintarOpciones(idGrid, defs, actual, rotulo, alElegir, atributo) {
    var g = $(idGrid);
    while (g.firstChild) { g.removeChild(g.firstChild); }
    var i;
    for (i = 0; i < defs.length; i++) {
      (function (def) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = (actual === def.id ? 'gbtn on' : 'gbtn') + (def.id === 'urgente' ? ' rojo' : '');
        b.setAttribute(atributo, def.id);
        b.textContent = rotulo(def);
        b.onclick = function () { alElegir(def); };
        g.appendChild(b);
      })(defs[i]);
    }
  }

  function fijarNivel(id, nivel) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.nivel === nivel) { return; }
    var previo = it.nivel;
    it.nivel = nivel;
    it.prioridad = nivel === 'urgente';
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('prioridad', it, previo, nivel);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    } else {
      it.nivel = previo;
      it.prioridad = previo === 'urgente';
    }
  }

  function fijarFecha(id, clave) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    if (clave !== '' && !K.esClave(clave)) { avisar('Fecha invalida.'); return; }
    if (it.fecha === clave) { return; }
    var previo = it.fecha;
    it.fecha = clave;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('fecha', it, previo, clave);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    } else { it.fecha = previo; }
  }

  /* Cambiar de contexto conserva todo el item. Si cambia el tipo de flujo de
     compras (fabrica <-> lista simple) el estado se traduce al equivalente y la
     pausa se suelta, porque fuera de Trabajo no existe. Se puede deshacer. */
  function moverDeContexto(id, ctx) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.contexto === ctx || !K.contextoValido(ctx)) { return; }
    var foto = fotoDe(it);
    var previo = it.contexto;
    it.contexto = ctx;
    var est = estadoEquivalente(it.tipo, ctx, it.estado);
    if (est !== it.estado) { it.estado = est; it.estadoDesde = new Date().toISOString(); }
    if (!K.esFabrica(ctx)) { it.pausado = false; it.pausadoDesde = ''; }
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('contexto', it, previo, ctx);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
      (function (idG, f, txt) {
        ofrecerDeshacer(txt, function () { restaurarFoto(idG, f, 'contexto'); });
      })(id, foto, 'A ' + icoNomCtx(ctx) + ': ' + it.texto);
    } else {
      it.contexto = previo;
      it.estado = foto.estado;
    }
  }

  /* Lo anclado va primero, por encima incluso de la prioridad alta. El filtro
     de estado y el de clasificacion se siguen aplicando: anclar cambia el orden
     de la lista, no la convierte en otra lista. */
  function ordenar(arr) {
    return arr.sort(function (a, b) {
      var aa = a.anclado === true, ab = b.anclado === true;
      if (aa !== ab) { return aa ? -1 : 1; }
      var pa = K.infoNivel(a.nivel).peso, pb = K.infoNivel(b.nivel).peso;
      if (pa !== pb) { return pb - pa; }
      if (a.creado === b.creado) { return 0; }
      return a.creado > b.creado ? -1 : 1;
    });
  }

  function pintarChipsGen(contId, defs, actual, cuenta, alElegir) {
    var cont = $(contId);
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    var i;
    for (i = 0; i < defs.length; i++) {
      (function (def) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = actual === def.id ? 'chip on' : 'chip';
        b.textContent = (def.ico ? def.ico + ' ' : '') + def.nom + ' ' + cuenta(def.id);
        b.setAttribute('data-filtro', def.id);
        b.onclick = function () { alElegir(def.id); };
        cont.appendChild(b);
      })(defs[i]);
    }
  }

  function contar(tipo, est) {
    var arr = delContexto(tipo), i, n = 0;
    for (i = 0; i < arr.length; i++) {
      if (est === 'activos' ? esActivo(arr[i].estado) : arr[i].estado === est) { n++; }
    }
    return n;
  }

  function progreso(tipo, cerrado, elTxt, elBarra) {
    var arr = delContexto(tipo), i, total = 0, hechos = 0;
    for (i = 0; i < arr.length; i++) {
      if (arr[i].estado === 'cancelado') { continue; }
      total++;
      if (K.esHecho(arr[i].estado)) { hechos++; }
    }
    var pct = total === 0 ? 0 : Math.round((hechos * 100) / total);
    $(elTxt).textContent = pct + '% \u00B7 ' + hechos + '/' + total;
    $(elBarra).style.width = pct + '%';
  }

  /* Siguiente casillero del flujo de compras de fabrica, salteando Cancelado. */
  function estadoSiguiente(it) {
    if (it.tipo !== 'compra' || !K.esFabrica(it.contexto)) { return null; }
    var i;
    for (i = 0; i < ESTADOS_COMPRA.length; i++) {
      if (ESTADOS_COMPRA[i].id !== it.estado) { continue; }
      var sig = ESTADOS_COMPRA[i + 1];
      if (!sig || sig.id === 'cancelado') { return null; }
      return sig;
    }
    return null;
  }

  function badge(clase, texto) {
    var s = document.createElement('span');
    s.className = 'badge ' + clase;
    s.textContent = texto;
    return s;
  }

  function claseNivel(it) {
    if (it.nivel === 'urgente') { return ' prio'; }
    if (it.nivel === 'importante') { return ' imp'; }
    if (it.nivel === 'baja') { return ' baja'; }
    return '';
  }

  function badgeNivel(it) {
    if (it.nivel === 'normal' || !esActivo(it.estado)) { return null; }
    var n = K.infoNivel(it.nivel);
    return badge('niv-' + it.nivel, n.ico + ' ' + n.nom.toUpperCase());
  }

  /* El dia en palabras cortas: hoy, mañana, ayer, o dd/mm. */
  function nombreDia(clave) {
    var hoy = K.claveDia(new Date());
    var d = K.difDias(hoy, clave);
    if (d === 0) { return 'hoy'; }
    if (d === 1) { return 'ma\u00F1ana'; }
    if (d === -1) { return 'ayer'; }
    var p = clave.split('-');
    return p[2] + '/' + p[1];
  }

  function badgeFecha(it) {
    if (it.fecha === '' || !esActivo(it.estado)) { return null; }
    var vencida = it.fecha < K.claveDia(new Date());
    return badge('dia' + (vencida ? ' vencido' : ''), '\uD83D\uDCC5 ' + nombreDia(it.fecha));
  }

  var itemsVistos = {};

  function nodoItem(it) {
    var li = document.createElement('li');
    li.className = 'item st-' + it.estado + claseNivel(it) +
      (it.pausado === true ? ' pausado' : '') +
      (itemsVistos[it.id] ? '' : ' nuevo');
    itemsVistos[it.id] = 1;
    li.setAttribute('data-id', it.id);
    /* Todo el contenido vive en su propia columna: asi el alto de la tarjeta
       es el del lado mas alto y la columna de acciones nunca se desborda. */
    var cu = document.createElement('div');
    cu.className = 'cuerpo';
    var d1 = document.createElement('div');
    d1.className = 'txt';
    d1.textContent = it.texto;
    cu.appendChild(d1);

    if (it.estado === 'esperando' && it.espera !== '') {
      var de = document.createElement('div');
      de.className = 'espera';
      de.textContent = '\u23F8 ' + it.espera;
      cu.appendChild(de);
    }

    if (esPedido(it) && lineaPedido(it) !== '') {
      var pe = document.createElement('div');
      pe.className = 'pedido';
      pe.textContent = lineaPedido(it);
      cu.appendChild(pe);
    }

    var l2 = document.createElement('div');
    l2.className = 'linea2';
    if (it.anclado === true) { l2.appendChild(badge('pin', '\uD83D\uDCCC')); }
    var bn = badgeNivel(it);
    if (bn) { l2.appendChild(bn); }
    var bf = badgeFecha(it);
    if (bf) { l2.appendChild(bf); }
    var inf = estadoInfo(it.estado);
    l2.appendChild(badge('est', inf.ico + ' ' + inf.nom.toUpperCase()));
    if (it.pausado === true) { l2.appendChild(badge('pausa', '\u23F8 EN ESPERA')); }
    if (it.tag !== '') {
      var t = tagInfo(it.tag);
      if (t) { l2.appendChild(badge('tag', t.ico + ' ' + t.nom)); }
    }
    if (it.recordatorio !== '') {
      var d = fechaObj(it.recordatorio);
      if (d) {
        var vencido = d.getTime() <= Date.now() && esActivo(it.estado);
        l2.appendChild(badge('rec' + (vencido ? ' vencido' : ''), '\u23F0 ' + horaCorta(it.recordatorio)));
      }
    }
    var pasos = pasosDe(it);
    if (pasos.length > 0) {
      l2.appendChild(badge('pasos', '\u2611 ' + pasosHechos(pasos) + '/' + pasos.length));
    }
    var notas = notasDe(it);
    if (notas.length > 0) { l2.appendChild(badge('nota', '\uD83D\uDCAC ' + notas.length)); }
    l2.appendChild(badge('', horaCorta(it.creado)));
    cu.appendChild(l2);

    var hs = alertaEntrega(it);
    if (hs > 0) {
      var a = document.createElement('div');
      a.className = 'alerta48';
      a.textContent = '\u26A0 ' + Math.floor(hs) + ' hs esperando entrega. Reclamar o cerrar.';
      cu.appendChild(a);
    }
    li.appendChild(cu);

    /* Acciones de un toque, sin abrir la ficha. Lo que mas se hace en el dia
       tiene que costar un dedo, no tres. */
    var accs = null;
    function sumarAccion(cont, clase, texto, marca, fn, rotulo) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = clase;
      b.setAttribute('data-acc', marca);
      b.setAttribute('aria-label', rotulo ? rotulo : texto);
      b.setAttribute('title', rotulo ? rotulo : texto);
      b.textContent = texto;
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        fn();
      };
      cont.appendChild(b);
      return b;
    }

    if (esActivo(it.estado)) {
      accs = document.createElement('div');
      accs.className = 'accs';
      if (it.tipo === 'tarea') {
        /* Las tareas son el unico caso con dos botones al lado. Ahi no entra
           texto sin partirse, asi que van con el icono solo: son siempre los
           mismos dos y el rotulo completo esta en la ficha. */
        var dosAcciones = it.estado === 'entrada' || it.estado === 'pendiente';
        sumarAccion(accs, dosAcciones ? 'abtn ico' : 'abtn',
          dosAcciones ? '\u2705' : '\u2705 Listo', 'listo', function () {
            cambiarEstado(it.id, 'completado');
          }, 'Listo');
        if (dosAcciones) {
          sumarAccion(accs, 'abtn ico', '\uD83D\uDED2', 'acompras', function () {
            moverACompras(it.id);
          }, 'Mover a Compras');
        }
      } else if (!K.esFabrica(it.contexto)) {
        sumarAccion(accs, 'abtn', '\u2B1C Marcar comprado', 'comprado', function () {
          alternarComprado(it.id);
        });
      } else if (it.pausado === true) {
        /* En pausa la tarjeta ofrece reanudar, no avanzar: primero se descongela. */
        sumarAccion(accs, 'abtn on', '\u25B6 Seguir', 'reanudar', function () {
          alternarPausa(it.id);
        });
      } else {
        var sig = estadoSiguiente(it);
        if (sig) {
          sumarAccion(accs, 'abtn', '\u25B6 ' + sig.nom, 'siguiente', function () {
            cambiarEstado(it.id, sig.id);
          });
        }
      }
    } else if (it.tipo === 'compra' && !K.esFabrica(it.contexto) && it.estado === 'comprado') {
      accs = document.createElement('div');
      accs.className = 'accs';
      sumarAccion(accs, 'abtn on', '\u2705 Comprado', 'comprado', function () {
        alternarComprado(it.id);
      });
    }
    if (accs && accs.firstChild) { li.appendChild(accs); }

    li.onclick = function () { abrirItem(it.id); };
    return li;
  }

  /* Filtro por clasificacion: encontrar sin abrir el teclado.
     Solo se muestran los tags que tienen algo cargado en este contexto. */
  function contarTag(tagId) {
    var arr = delContexto('tarea'), i, n = 0;
    for (i = 0; i < arr.length; i++) {
      if (!esActivo(arr[i].estado) && filtro === 'activos') { continue; }
      if (filtro !== 'activos' && arr[i].estado !== filtro) { continue; }
      if (tagId === '' ? true : arr[i].tag === tagId) { n++; }
    }
    return n;
  }

  function pintarChipsTag() {
    var cont = $('chipsTag');
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    var posibles = listaTags(contexto);
    var conUso = [], i;
    for (i = 0; i < posibles.length; i++) {
      if (contarTag(posibles[i].id) > 0) { conUso.push(posibles[i]); }
    }
    if (conUso.length === 0) {
      if (filtroTag !== '') { filtroTag = ''; escribir(K_FILTROTAG, ''); }
      return;
    }
    var defs = [{ id: '', ico: '', nom: 'Todo' }].concat(conUso);
    for (i = 0; i < defs.length; i++) {
      (function (def) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = filtroTag === def.id ? 'chip on' : 'chip';
        b.setAttribute('data-tag-filtro', def.id === '' ? 'todo' : def.id);
        b.textContent = (def.ico ? def.ico + ' ' : '') + def.nom +
          (def.id === '' ? '' : ' ' + contarTag(def.id));
        b.onclick = function () {
          filtroTag = filtroTag === def.id ? '' : def.id;
          escribir(K_FILTROTAG, filtroTag);
          pintar();
        };
        cont.appendChild(b);
      })(defs[i]);
    }
  }

  function pintarLista(tipo, filtroActual, listaId, vacioId) {
    var lista = $(listaId);
    while (lista.firstChild) { lista.removeChild(lista.firstChild); }
    var arr = ordenar(delContexto(tipo));
    var i, visibles = 0;
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (filtroActual === 'activos') {
        if (!esActivo(it.estado)) { continue; }
      } else if (it.estado !== filtroActual) { continue; }
      if (tipo === 'tarea' && filtroTag !== '' && it.tag !== filtroTag) { continue; }
      visibles++;
      lista.appendChild(nodoItem(it));
    }
    $(vacioId).style.display = visibles === 0 ? 'block' : 'none';
    return visibles;
  }

  function pintarTablero() {
    progreso('tarea', '', 'progTxt', 'progBarra');
    var defs = [{ id: 'activos', ico: '', nom: 'Activos' }].concat(ESTADOS_TAREA);
    pintarChipsGen('chips', defs, filtro, function (id) { return contar('tarea', id); }, function (id) {
      filtro = id; escribir(K_FILTRO, filtro); pintar();
    });
    pintarChipsTag();
    pintarLista('tarea', filtro, 'lista', 'vacioTablero');
    if (filtroTag !== '') {
      var t = tagInfo(filtroTag);
      $('vacioTablero').textContent = 'Nada en ' + (t ? t.nom : 'esa clasificacion') + ' con este filtro.';
    } else {
      $('vacioTablero').textContent = filtro === 'activos'
        ? 'Nada activo aca. Escribi arriba y toca Enter.'
        : 'No hay items en este filtro.';
    }
  }

  function pintarCompras() {
    var esHogar = contexto !== 'trabajo' && contexto !== 'todo';
    progreso('compra', '', 'progCompraTxt', 'progCompraBarra');
    $('rotCompras').textContent = esHogar ? 'Lista de compras' : (contexto === 'todo' ? 'Compras cerradas' : 'Material recibido');
    var base = esHogar ? ESTADOS_COMPRA_HOGAR : ESTADOS_COMPRA;
    /* En Todo conviven los dos flujos: se suman los casilleros de la lista simple. */
    if (contexto === 'todo') { base = ESTADOS_COMPRA.slice(0, 6).concat(ESTADOS_COMPRA_HOGAR); }
    var defs = [{ id: 'activos', ico: '', nom: esHogar ? 'Por comprar' : 'Abiertas' }].concat(base);
    pintarChipsGen('chipsCompra', defs, filtroCompra, function (id) { return contar('compra', id); }, function (id) {
      filtroCompra = id; escribir(K_FILTROC, filtroCompra); pintar();
    });
    pintarLista('compra', filtroCompra, 'listaCompras', 'vacioCompras');
    $('vacioCompras').textContent = esHogar
      ? 'Lista vacia. Escribi arriba y toca Mover a Compras.'
      : 'Sin compras. Toca Mover a Compras en cualquier tarea.';
  }

  function desdeRango() {
    var i, def = RANGOS[0];
    for (i = 0; i < RANGOS.length; i++) { if (RANGOS[i].id === rango) { def = RANGOS[i]; } }
    if (def.dias === 0) { return null; }
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (def.dias - 1));
    return d;
  }

  function eventosFiltrados() {
    var corte = desdeRango(), salida = [], i;
    for (i = 0; i < eventos.length; i++) {
      var ev = eventos[i];
      if (contexto !== 'todo' && ev.contexto !== contexto) { continue; }
      var d = fechaObj(ev.ts);
      if (!d) { continue; }
      if (corte && d.getTime() < corte.getTime()) { continue; }
      salida.push(ev);
    }
    return salida;
  }

  function frase(ev) {
    if (ev.tipo === 'captura') { return 'Capturaste'; }
    if (ev.tipo === 'edicion') { return 'Editaste'; }
    if (ev.tipo === 'borrado') { return 'Borraste'; }
    if (ev.tipo === 'espera') { return 'Anotaste espera'; }
    if (ev.tipo === 'restauracion') { return 'Restauraste un backup'; }
    if (ev.tipo === 'prioridad') {
      if (ev.hasta === 'alta') { return 'Marcaste prioridad alta'; }
      if (ev.hasta === 'normal' && ev.desde === '') { return 'Sacaste la prioridad'; }
      return 'Prioridad: ' + K.infoNivel(ev.hasta).nom;
    }
    if (ev.tipo === 'fecha') { return ev.hasta === '' ? 'Sacaste el dia' : 'Agendaste para ' + nombreDia(ev.hasta); }
    if (ev.tipo === 'contexto') { return 'Moviste a ' + icoNomCtx(ev.hasta); }
    if (ev.tipo === 'tag') { return ev.hasta === '' ? 'Sacaste la clasificacion' : 'Clasificaste como ' + ev.hasta; }
    if (ev.tipo === 'recordatorio') { return ev.hasta === '' ? 'Sacaste el recordatorio' : 'Recordatorio ' + ev.hasta; }
    if (ev.tipo === 'compra') { return 'Moviste a Compras'; }
    if (ev.tipo === 'vuelta') { return 'Volviste a tarea'; }
    if (ev.tipo === 'pausa') { return ev.hasta === 'reanudada' ? 'Reanudaste la compra' : 'Pusiste la compra en espera'; }
    if (ev.tipo === 'comentario') { return 'Comentaste'; }
    if (ev.tipo === 'anclado') { return ev.hasta === 'anclado' ? 'Anclaste arriba' : 'Sacaste el ancla'; }
    if (ev.tipo === 'migracion') { return 'Migracion de datos'; }
    if (ev.tipo === 'estado') { return estadoInfo(ev.desde).nom + ' \u2192 ' + estadoInfo(ev.hasta).nom; }
    return 'Movimiento';
  }

  function pintarRegistro() {
    pintarChipsGen('chipsRango', RANGOS, rango, function () { return ''; }, function (id) { rango = id; pintar(); });
    var cont = $('timeline');
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    var lista = eventosFiltrados();
    if (lista.length === 0) { $('vacioRegistro').style.display = 'block'; return; }
    $('vacioRegistro').style.display = 'none';
    var diaActual = '', i;
    for (i = lista.length - 1; i >= 0; i--) {
      var ev = lista[i];
      var d = fechaObj(ev.ts);
      var cl = claveDia(d);
      if (cl !== diaActual) {
        diaActual = cl;
        var h = document.createElement('div');
        h.className = 'dia';
        h.textContent = etiquetaDia(cl);
        cont.appendChild(h);
      }
      var fila = document.createElement('div');
      fila.className = 'ev';
      var ch = document.createElement('div');
      ch.className = 'h';
      ch.textContent = hhmm(d);
      var cd = document.createElement('div');
      cd.className = 'd';
      var b = document.createElement('b');
      b.textContent = frase(ev);
      cd.appendChild(b);
      var s = document.createElement('small');
      s.textContent = ev.texto;
      cd.appendChild(s);
      fila.appendChild(ch);
      fila.appendChild(cd);
      cont.appendChild(fila);
    }
  }

  var ORDEN_VISTAS = ['tablero', 'compras', 'registro'];

  function posVista(v) {
    var i;
    for (i = 0; i < ORDEN_VISTAS.length; i++) { if (ORDEN_VISTAS[i] === v) { return i; } }
    return 0;
  }

  function animarMain(dir) {
    var m = document.getElementsByTagName('main')[0];
    if (!m) { return; }
    m.className = '';
    /* Lectura forzada para reiniciar la animacion CSS. */
    if (typeof m.offsetWidth === 'number') { var x = m.offsetWidth; }
    m.className = dir === 'izq' ? 'hacia-izq' : 'hacia-der';
  }

  function irAVista(v, sinHistorial) {
    if (v === vista) { return; }
    var dir = posVista(v) > posVista(vista) ? 'der' : 'izq';
    vista = v;
    escribir(K_VISTA, vista);
    animarMain(dir);
    pintar();
    if (sinHistorial) { return; }
    if (v !== 'tablero') {
      if (!anclaPuesta && pilaCapas.length === 0) {
        anclaPuesta = empujarHistorial({ kcoAncla: true });
      }
    } else if (anclaPuesta && pilaCapas.length === 0) {
      anclaPuesta = false;
      retrocederHistorial(1);
    }
  }

  function pintar() {
    $('vistaTablero').style.display = vista === 'tablero' ? 'block' : 'none';
    $('vistaCompras').style.display = vista === 'compras' ? 'block' : 'none';
    $('vistaRegistro').style.display = vista === 'registro' ? 'block' : 'none';
    $('tabTablero').className = vista === 'tablero' ? 'tab on' : 'tab';
    $('tabCompras').className = vista === 'compras' ? 'tab on' : 'tab';
    $('tabRegistro').className = vista === 'registro' ? 'tab on' : 'tab';
    if (vista === 'tablero') { pintarTablero(); }
    else if (vista === 'compras') { pintarCompras(); }
    else { pintarRegistro(); }
    actualizarAvisoBackup();
  }

  /* ---------- hojas ---------- */

  /* ---------- capas e historial ----------
     Cada hoja flotante que se abre empuja una entrada en el historial.
     Asi el boton/gesto "atras" de Android cierra la capa de arriba en vez
     de cerrar la PWA. Si no queda ninguna capa abierta y estamos en una
     pestaña que no es el tablero, "atras" vuelve al tablero. Recien ahi
     el siguiente "atras" hace lo de siempre. */

  var pilaCapas = [];
  var ignorarPop = 0;
  var anclaPuesta = false;

  function empujarHistorial(dato) {
    try {
      if (window.history && typeof window.history.pushState === 'function') {
        window.history.pushState(dato, '');
        return true;
      }
    } catch (e) { /* sin history: la app sigue andando igual */ }
    return false;
  }

  function retrocederHistorial(n) {
    try {
      if (window.history && typeof window.history.go === 'function') {
        ignorarPop = ignorarPop + n;
        window.history.go(-n);
        return;
      }
    } catch (e) { ignorarPop = 0; }
  }

  function cerrarDom(id) {
    var el = $(id);
    if (el) { el.className = 'tapa'; }
    if (id === 'tapaItem') { itemAbierto = null; }
    if (id === 'tapaConfirmar') { confAccion = null; }
  }

  function abrirHoja(id) {
    var i;
    for (i = 0; i < pilaCapas.length; i++) {
      if (pilaCapas[i] === id) { $(id).className = 'tapa on'; return; }
    }
    $(id).className = 'tapa on';
    pilaCapas.push(id);
    empujarHistorial({ kcoCapa: id });
  }

  function cerrarHoja(id) {
    var pos = -1, i;
    for (i = 0; i < pilaCapas.length; i++) { if (pilaCapas[i] === id) { pos = i; } }
    if (pos === -1) { cerrarDom(id); return; }
    /* Se cierran tambien las capas que quedaron por encima de esta. */
    var cuantas = pilaCapas.length - pos;
    for (i = pilaCapas.length - 1; i >= pos; i--) {
      cerrarDom(pilaCapas[i]);
      pilaCapas.pop();
    }
    retrocederHistorial(cuantas);
  }

  function cerrarTodasLasCapas() {
    var cuantas = pilaCapas.length;
    if (cuantas === 0) { return; }
    var i;
    for (i = pilaCapas.length - 1; i >= 0; i--) { cerrarDom(pilaCapas[i]); }
    pilaCapas = [];
    retrocederHistorial(cuantas);
  }

  function alVolverAtras() {
    if (ignorarPop > 0) { ignorarPop = ignorarPop - 1; return; }
    if (pilaCapas.length > 0) {
      cerrarDom(pilaCapas[pilaCapas.length - 1]);
      pilaCapas.pop();
      return;
    }
    if (vista !== 'tablero') {
      irAVista('tablero', true);
      anclaPuesta = false;
      return;
    }
    anclaPuesta = false;
    /* Nada abierto y ya estamos en el tablero: se deja salir. */
  }

  /* ---------- gestos ----------
     Se compara el desplazamiento horizontal contra el vertical para no
     robarle el gesto al scroll. Un swipe solo cuenta si es claramente
     horizontal, supera el umbral y no tardo una eternidad. */

  var UMBRAL_X = 60;
  var PROPORCION = 2;
  var MS_MAX = 700;

  function puntoDe(ev, cual) {
    var lista = cual === 'fin' ? ev.changedTouches : ev.touches;
    if (!lista || !lista.length) { return null; }
    return { x: lista[0].clientX, y: lista[0].clientY };
  }

  /* Un gesto que arranca sobre una barra de chips es para mover la barra, no
     para cambiar de pestaña. Se sube por el arbol a mano porque closest() no
     existe en WebViews viejas de Android. */
  function enScrollHorizontal(nodo, tope) {
    var n = nodo;
    while (n && n !== tope && n.nodeType === 1) {
      if (typeof n.className === 'string' && n.className !== '') {
        var c = ' ' + n.className + ' ';
        if (c.indexOf(' chips ') > -1 || c.indexOf(' scroll-x ') > -1) { return true; }
      }
      n = n.parentNode;
    }
    return false;
  }

  function conectarSwipe(el, alDeslizar) {
    if (!el || !el.addEventListener) { return; }
    var ini = null;
    var t0 = 0;
    el.addEventListener('touchstart', function (ev) {
      if (enScrollHorizontal(ev.target, el)) { ini = null; return; }
      ini = puntoDe(ev, 'ini');
      t0 = Date.now();
    }, false);
    el.addEventListener('touchend', function (ev) {
      if (!ini) { return; }
      var fin = puntoDe(ev, 'fin');
      var desde = ini;
      ini = null;
      if (!fin) { return; }
      if (Date.now() - t0 > MS_MAX) { return; }
      if (pilaCapas.length > 0) { return; }
      var dx = fin.x - desde.x;
      var dy = fin.y - desde.y;
      var ady = dy < 0 ? -dy : dy;
      var adx = dx < 0 ? -dx : dx;
      if (adx < UMBRAL_X) { return; }
      if (adx < ady * PROPORCION) { return; }
      alDeslizar(dx < 0 ? 'izq' : 'der');
    }, false);
  }

  function swipeVistas(sentido) {
    var i = posVista(vista);
    var destino = sentido === 'izq' ? i + 1 : i - 1;
    if (destino < 0 || destino >= ORDEN_VISTAS.length) { return; }
    irAVista(ORDEN_VISTAS[destino]);
  }

  function swipeContexto(sentido) {
    var orden = ['todo'], i, pos = 0;
    for (i = 0; i < K.CONTEXTOS.length; i++) { orden.push(K.CONTEXTOS[i].id); }
    for (i = 0; i < orden.length; i++) { if (orden[i] === contexto) { pos = i; } }
    aplicarContexto(orden[sentido === 'izq' ? (pos + 1) % orden.length : (pos + orden.length - 1) % orden.length], true);
  }

  function pedirConfirmacion(titulo, detalle, accion) {
    $('confTitulo').textContent = titulo;
    $('confDetalle').textContent = detalle;
    confAccion = accion;
    abrirHoja('tapaConfirmar');
  }

  function pintarHojaItem() {
    var it = buscarItem(itemAbierto);
    if (!it) { cerrarHoja('tapaItem'); return; }
    $('itemTitulo').textContent = it.texto;
    var inf = estadoInfo(it.estado);
    $('itemSub').textContent = (it.tipo === 'compra' ? 'COMPRA \u00B7 ' : '') + inf.ico + ' ' + inf.nom +
      ' \u00B7 creado ' + horaCorta(it.creado);
    $('rotEstados').textContent = it.tipo === 'compra' ? 'Estado de compra' : 'Estado';

    var grid = $('gridEstados');
    while (grid.firstChild) { grid.removeChild(grid.firstChild); }
    var l = listaEstados(it.tipo, it.contexto), i;
    for (i = 0; i < l.length; i++) {
      (function (est) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = it.estado === est.id ? 'gbtn on' : 'gbtn';
        b.textContent = est.ico + ' ' + est.nom;
        b.setAttribute('data-estado', est.id);
        b.onclick = function () { cambiarEstado(it.id, est.id); };
        grid.appendChild(b);
      })(l[i]);
    }

    $('cajaEspera').style.display = it.estado === 'esperando' ? 'block' : 'none';
    if (it.estado === 'esperando') { $('txtEspera').value = it.espera; }

    pintarOpciones('gridNivel', K.NIVELES, it.nivel, function (n) { return n.ico + ' ' + n.nom; },
      function (n) { fijarNivel(it.id, n.id); }, 'data-nivel');
    pintarOpciones('gridCtx', K.CONTEXTOS, it.contexto, function (c) { return c.ico + ' ' + c.nom; },
      function (c) { moverDeContexto(it.id, c.id); }, 'data-ctx');
    var hoyK = K.claveDia(new Date());
    $('btnDiaHoy').className = it.fecha === hoyK ? 'gbtn on' : 'gbtn';
    $('btnDiaMan').className = it.fecha === K.sumarDias(hoyK, 1) ? 'gbtn on' : 'gbtn';
    $('btnDiaElegir').className = it.fecha !== '' && it.fecha !== hoyK && it.fecha !== K.sumarDias(hoyK, 1) ? 'gbtn on' : 'gbtn';
    $('btnDiaElegir').textContent = $('btnDiaElegir').className === 'gbtn on' ? '\uD83D\uDCC5 ' + nombreDia(it.fecha) : 'Elegir dia';
    $('btnSacarDia').style.display = it.fecha === '' ? 'none' : 'block';
    $('cajaDia').style.display = 'none';

    var gt = $('gridTags');
    while (gt.firstChild) { gt.removeChild(gt.firstChild); }
    var tg = listaTags(it.contexto);
    /* Si el item arrastra un tag que ya no se ofrece en este contexto, se agrega
       al final para poder verlo y sacarlo, en vez de perderlo en silencio. */
    if (it.tag !== '' && tagInfo(it.tag)) {
      var presente = false;
      for (i = 0; i < tg.length; i++) { if (tg[i].id === it.tag) { presente = true; } }
      if (!presente) { tg = tg.concat([tagInfo(it.tag)]); }
    }
    for (i = 0; i < tg.length; i++) {
      (function (t) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = it.tag === t.id ? 'gbtn on' : 'gbtn';
        b.textContent = t.ico + ' ' + t.nom;
        b.setAttribute('data-tag', t.id);
        b.onclick = function () { alternarTag(it.id, t.id); };
        gt.appendChild(b);
      })(tg[i]);
    }

    $('btnSacarRec').style.display = it.recordatorio === '' ? 'none' : 'block';
    $('btnSacarRec').textContent = it.recordatorio === ''
      ? 'Sacar recordatorio'
      : 'Sacar recordatorio (' + horaCorta(it.recordatorio) + ')';
    if (esPedido(it)) {
      $('cajaPedido').style.display = 'block';
      $('txtSolicitante').value = campoPedido(it, 'solicitante');
      $('txtDestino').value = campoPedido(it, 'destino');
      pintarDatalists();
    } else {
      $('cajaPedido').style.display = 'none';
    }

    var bp = $('btnPausa');
    if (puedePausar(it)) {
      bp.style.display = 'block';
      bp.textContent = it.pausado === true ? '\u25B6 Reanudar la compra' : '\u23F8 Pausar / En espera';
      bp.className = it.pausado === true ? 'gbtn on' : 'gbtn';
    } else {
      bp.style.display = 'none';
    }
    if (it.pausado === true) {
      $('itemSub').textContent = $('itemSub').textContent + ' \u00B7 \u23F8 en espera';
    }

    var ln = $('listaNotas');
    while (ln.firstChild) { ln.removeChild(ln.firstChild); }
    var notas = notasDe(it);
    if (notas.length === 0) {
      var vacio = document.createElement('div');
      vacio.className = 'sinnotas';
      vacio.textContent = 'Sin comentarios todavia.';
      ln.appendChild(vacio);
    } else {
      var k;
      for (k = notas.length - 1; k >= 0; k--) {
        var fila = document.createElement('div');
        fila.className = 'nota';
        var fh = document.createElement('div');
        fh.className = 'h';
        fh.textContent = fechaNota(notas[k].cuando);
        var fd = document.createElement('div');
        fd.className = 'd';
        fd.textContent = notas[k].texto;
        fila.appendChild(fh);
        fila.appendChild(fd);
        ln.appendChild(fila);
      }
    }
    $('txtNota').value = '';

    $('btnAnclar').textContent = it.anclado === true
      ? '\uD83D\uDCCC Anclado arriba de todo'
      : '\uD83D\uDCCC Anclar arriba de todo';
    $('btnAnclar').className = it.anclado === true ? 'gbtn on' : 'gbtn';

    var lp = $('listaPasos');
    while (lp.firstChild) { lp.removeChild(lp.firstChild); }
    var pasos = pasosDe(it);
    if (pasos.length === 0) {
      var vp = document.createElement('div');
      vp.className = 'sinnotas';
      vp.textContent = 'Sin pasos. Sirve para tareas de varios movimientos.';
      lp.appendChild(vp);
    } else {
      var j;
      for (j = 0; j < pasos.length; j++) {
        (function (paso, pos) {
          var fila = document.createElement('div');
          fila.className = paso.hecho === true ? 'paso hecho' : 'paso';
          var bt = document.createElement('button');
          bt.type = 'button';
          bt.className = 'tic';
          bt.setAttribute('data-paso', '' + pos);
          bt.textContent = paso.hecho === true ? '\u2611' : '\u2610';
          bt.onclick = function () { alternarPaso(it.id, pos); };
          var dd = document.createElement('div');
          dd.className = 'd';
          dd.textContent = paso.texto;
          var bx = document.createElement('button');
          bx.type = 'button';
          bx.className = 'equis';
          bx.setAttribute('data-sacar', '' + pos);
          bx.textContent = '\u2715';
          bx.onclick = function () { sacarPaso(it.id, pos); };
          fila.appendChild(bt);
          fila.appendChild(dd);
          fila.appendChild(bx);
          lp.appendChild(fila);
        })(pasos[j], j);
      }
    }
    $('txtPaso').value = '';

    $('btnAcompra').style.display = it.tipo === 'compra' ? 'none' : 'block';
    $('btnVolverTarea').style.display = it.tipo === 'compra' ? 'block' : 'none';
  }

  /* Un toque, sin confirmacion: no se borra nada y se puede volver atras
     desde la ficha con "Volver a tarea". */
  function moverACompras(id) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.tipo === 'compra') { return; }
    var foto = fotoDe(it);
    var ahora = new Date().toISOString();
    it.tipo = 'compra';
    it.estado = K.esFabrica(it.contexto) ? 'cotizando' : 'por_comprar';
    it.espera = '';
    it.actualizado = ahora;
    it.estadoDesde = ahora;
    if (guardarItems()) {
      registrar('compra', it, 'tarea', it.estado);
      /* No se salta a la pestaña Compras: el item ya quedo movido y quedarse
         en la vista actual permite mover varios seguidos sin volver atras. */
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
      (function (idGuardado, f, txt) {
        ofrecerDeshacer(txt, function () {
          restaurarFoto(idGuardado, f, 'compra');
        });
      })(id, foto, 'Movida a Compras: ' + it.texto);
    } else {
      it.tipo = 'tarea';
    }
  }

  function volverATarea(id) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.tipo !== 'compra') { return; }
    var ahora = new Date().toISOString();
    it.tipo = 'tarea';
    it.estado = 'pendiente';
    it.actualizado = ahora;
    it.estadoDesde = ahora;
    if (guardarItems()) {
      registrar('vuelta', it, 'compra', 'pendiente');
      /* Igual que al mover a Compras: la vista no se mueve, asi se pueden
         revertir varias seguidas sin volver a la pestaña anterior. */
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    } else {
      it.tipo = 'compra';
    }
  }

  /* Pausa: no cambia el casillero ni el estado guardado, solo lo congela.
     Al reanudar se corre estadoDesde hacia adelante el tiempo que estuvo en
     pausa, asi el contador de +48 hs sigue desde donde quedo en vez de
     arrancar de cero. */
  function puedePausar(it) {
    return it.tipo === 'compra' && K.esFabrica(it.contexto) && esActivo(it.estado);
  }

  function alternarPausa(id) {
    var it = buscarItem(id);
    if (!it || soloLectura || !puedePausar(it)) { return; }
    var ahora = new Date();
    if (it.pausado === true) {
      var desde = fechaObj(it.pausadoDesde);
      var base = fechaObj(it.estadoDesde);
      if (desde && base) {
        var quieto = ahora.getTime() - desde.getTime();
        if (quieto > 0) { it.estadoDesde = new Date(base.getTime() + quieto).toISOString(); }
      }
      it.pausado = false;
      it.pausadoDesde = '';
    } else {
      it.pausado = true;
      it.pausadoDesde = ahora.toISOString();
    }
    it.actualizado = ahora.toISOString();
    if (guardarItems()) {
      registrar('pausa', it, '', it.pausado ? 'en espera' : 'reanudada');
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    }
  }

  /* ---------- bitacora ---------- */

  function agregarNota(id, texto) {
    var it = buscarItem(id);
    var t = ('' + texto).replace(/^\s+|\s+$/g, '');
    if (!it || soloLectura || t === '') { return false; }
    if (!esArray(it.comentarios)) { it.comentarios = []; }
    it.comentarios.push({ cuando: new Date().toISOString(), texto: t });
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { it.comentarios.pop(); return false; }
    registrar('comentario', it, '', t);
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    return true;
  }

  /* Solicitante y destino solo tienen sentido en las compras de fabrica:
     en Hogar no hay quien pida ni a que maquina va. */
  function esPedido(it) {
    return it.tipo === 'compra' && K.esFabrica(it.contexto);
  }

  function campoPedido(it, cual) {
    var v = cual === 'destino' ? it.destino : it.solicitante;
    return limpiarTexto(v, LARGO_CAMPO);
  }

  function lineaPedido(it) {
    var p = [];
    var sol = campoPedido(it, 'solicitante');
    var des = campoPedido(it, 'destino');
    if (sol !== '') { p.push('\uD83D\uDC64 ' + sol); }
    if (des !== '') { p.push('\uD83D\uDCCD ' + des); }
    return p.join('  |  ');
  }

  /* Se dispara al salir del campo. No repinta la ficha para no pisar lo que
     el usuario pueda estar tipeando en el otro input. */
  function guardarPedido() {
    if (!itemAbierto || soloLectura) { return false; }
    var it = buscarItem(itemAbierto);
    if (!it || !esPedido(it)) { return false; }
    var sol = limpiarTexto($('txtSolicitante').value, LARGO_CAMPO);
    var des = limpiarTexto($('txtDestino').value, LARGO_CAMPO);
    if (sol === campoPedido(it, 'solicitante') && des === campoPedido(it, 'destino')) { return false; }
    var antesS = it.solicitante, antesD = it.destino;
    it.solicitante = sol;
    it.destino = des;
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) {
      it.solicitante = antesS;
      it.destino = antesD;
      return false;
    }
    aprender(solicitantes, K_SOLIC, sol);
    aprender(destinos, K_DEST, des);
    pintarDatalists();
    pintarCatalogos();
    pintar();
    return true;
  }

  /* ---------- catalogos en Ajustes ---------- */

  function pintarCatalogos() {
    pintarCatalogo('chipsSolic', 'vSolic', solicitantes, K_SOLIC, 'solicitante');
    pintarCatalogo('chipsDest', 'vDest', destinos, K_DEST, 'destino');
  }

  function pintarCatalogo(idCaja, idDato, lista, clave, rotulo) {
    var caja = $(idCaja);
    if (!caja) { return; }
    while (caja.firstChild) { caja.removeChild(caja.firstChild); }
    if ($(idDato)) { $(idDato).textContent = '' + lista.length; }
    if (lista.length === 0) {
      var v = document.createElement('div');
      v.className = 'vacio';
      v.textContent = 'Todavia no aprendio ninguno.';
      caja.appendChild(v);
      return;
    }
    var i;
    for (i = 0; i < lista.length; i++) {
      (function (valor) {
        var c = document.createElement('div');
        c.className = 'cat';
        var t = document.createElement('span');
        t.textContent = valor;
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-borrar', valor);
        b.setAttribute('aria-label', 'Borrar ' + valor);
        b.setAttribute('title', 'Borrar ' + valor);
        b.textContent = '\u2715';
        b.onclick = function () {
          pedirConfirmacion('Borrar ' + rotulo, 'Se saca "' + valor + '" de la lista. Las compras que ya lo tienen cargado no se tocan.', function () {
            if (olvidar(lista, clave, valor)) {
              pintarCatalogos();
              pintarDatalists();
            }
          });
        };
        c.appendChild(t);
        c.appendChild(b);
        caja.appendChild(c);
      })(lista[i]);
    }
  }

  /* Alta en lote: uno por renglon, o separados por punto y coma. No se corta
     por coma a proposito, porque un destino como "Cinta 3, sector B" es un solo
     valor y no dos. */
  function sumarAMano(idInput, lista, clave) {
    var crudo = $(idInput).value;
    if (limpiarTexto(crudo, LARGO_CAMPO) === '' && crudo.replace(/[\s;]/g, '') === '') { return; }
    var partes = crudo.split(/[\r\n;]+/);
    var nuevos = 0, repetidos = 0, lleno = false, i, t;
    for (i = 0; i < partes.length; i++) {
      t = limpiarTexto(partes[i], LARGO_CAMPO);
      if (t === '') { continue; }
      if (enCatalogo(lista, t) > -1) { repetidos++; continue; }
      if (aprender(lista, clave, t)) { nuevos++; } else { lleno = true; break; }
    }
    if (nuevos > 0) {
      $(idInput).value = '';
      pintarCatalogos();
      pintarDatalists();
    }
    avisar(resumenAlta(nuevos, repetidos, lleno));
  }

  function resumenAlta(nuevos, repetidos, lleno) {
    if (lleno) {
      return 'Se sumaron ' + nuevos + '. La lista llego al tope de ' + TOPE_CATALOGO + '.';
    }
    if (nuevos === 0 && repetidos > 0) {
      return repetidos === 1 ? 'Ya estaba en la lista.' : 'Los ' + repetidos + ' ya estaban en la lista.';
    }
    if (nuevos === 0) { return 'No habia nada para sumar.'; }
    var txt = nuevos === 1 ? 'Se sumo 1.' : 'Se sumaron ' + nuevos + '.';
    if (repetidos > 0) { txt = txt + ' ' + (repetidos === 1 ? '1 ya estaba.' : repetidos + ' ya estaban.'); }
    return txt;
  }

  function alternarAnclado(id) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    it.anclado = it.anclado === true ? false : true;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('anclado', it, '', it.anclado ? 'anclado' : 'suelto');
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    } else { it.anclado = it.anclado === true ? false : true; }
  }

  /* ---------- checklist ---------- */

  function agregarPaso(id, texto) {
    var it = buscarItem(id);
    var t = ('' + texto).replace(/^\s+|\s+$/g, '');
    if (!it || soloLectura || t === '') { return false; }
    if (!esArray(it.pasos)) { it.pasos = []; }
    it.pasos.push({ texto: t, hecho: false });
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { it.pasos.pop(); return false; }
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    return true;
  }

  function alternarPaso(id, pos) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    var arr = pasosDe(it);
    if (pos < 0 || pos >= arr.length) { return; }
    arr[pos].hecho = arr[pos].hecho === true ? false : true;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    } else { arr[pos].hecho = arr[pos].hecho === true ? false : true; }
  }

  /* Sacar un paso se puede deshacer 9 segundos, igual que borrar un item.
     Preferible a una confirmacion: un paso mal escrito se saca de un toque. */
  function sacarPaso(id, pos) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    var arr = pasosDe(it);
    if (pos < 0 || pos >= arr.length) { return; }
    var copia = { texto: arr[pos].texto, hecho: arr[pos].hecho === true };
    arr.splice(pos, 1);
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { arr.splice(pos, 0, copia); return; }
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    (function (idG, donde, guardado) {
      ofrecerDeshacer('Paso sacado: ' + guardado.texto, function () {
        var v = buscarItem(idG);
        if (!v || soloLectura) { return; }
        if (!esArray(v.pasos)) { v.pasos = []; }
        v.pasos.splice(donde > v.pasos.length ? v.pasos.length : donde, 0, guardado);
        if (guardarItems()) {
          pintar();
          if (itemAbierto === idG) { pintarHojaItem(); }
        }
      });
    })(id, pos, copia);
  }

  function fechaNota(iso) {
    var d = fechaObj(iso);
    if (!d) { return ''; }
    return dosDig(d.getDate()) + '/' + dosDig(d.getMonth() + 1) + ' ' + hhmm(d);
  }

  function alternarComprado(id) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    cambiarEstado(id, it.estado === 'comprado' ? 'por_comprar' : 'comprado');
  }

  /* ---------- deshacer ----------
     Guarda como revertir la ultima accion. Vive solo en memoria: si la app se
     cierra, se pierde, y esta bien. No toca el formato de los datos guardados. */

  var revertir = null;
  var relojDeshacer = null;
  var SEG_DESHACER = 9000;

  /* La barra de deshacer flota sobre la lista. Mientras esta a la vista se le
     suma hueco al final de main para que no tape la ultima tarjeta. */
  function huecoDeshacer(activo) {
    var m = document.getElementsByTagName('main')[0];
    if (!m || !m.style) { return; }
    m.style.paddingBottom = activo ? '152px' : '';
  }

  function ofrecerDeshacer(texto, fn) {
    revertir = fn;
    huecoDeshacer(true);
    $('qpaso').textContent = texto;
    $('barraDeshacer').className = 'deshacer on';
    if (relojDeshacer) { window.clearTimeout(relojDeshacer); }
    if (typeof window.setTimeout === 'function') {
      relojDeshacer = window.setTimeout(ocultarDeshacer, SEG_DESHACER);
    }
  }

  function ocultarDeshacer() {
    revertir = null;
    huecoDeshacer(false);
    if (relojDeshacer) { window.clearTimeout(relojDeshacer); relojDeshacer = null; }
    var b = $('barraDeshacer');
    if (b) { b.className = 'deshacer'; }
  }

  function hacerDeshacer() {
    var fn = revertir;
    ocultarDeshacer();
    if (fn) { fn(); }
  }

  function fotoDe(it) {
    return {
      estado: it.estado, tipo: it.tipo, espera: it.espera,
      actualizado: it.actualizado, estadoDesde: it.estadoDesde, prioridad: it.prioridad, nivel: it.nivel,
      contexto: it.contexto, motivo: it.motivo,
      pausado: it.pausado === true, pausadoDesde: it.pausadoDesde ? it.pausadoDesde : ''
    };
  }

  function restaurarFoto(id, foto, textoEvento) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    it.estado = foto.estado;
    it.tipo = foto.tipo;
    it.espera = foto.espera;
    it.prioridad = foto.prioridad;
    it.nivel = foto.nivel;
    it.contexto = foto.contexto;
    it.motivo = foto.motivo;
    it.actualizado = foto.actualizado;
    it.estadoDesde = foto.estadoDesde;
    it.pausado = foto.pausado === true;
    it.pausadoDesde = foto.pausadoDesde ? foto.pausadoDesde : '';
    if (guardarItems()) {
      registrar('deshacer', it, textoEvento || '', foto.estado);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
    }
  }

  function alternarTag(id, tag) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    var previo = it.tag;
    it.tag = it.tag === tag ? '' : tag;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('tag', it, previo, it.tag);
      pintar();
      pintarHojaItem();
    } else { it.tag = previo; }
  }

  function abrirItem(id) {
    itemAbierto = id;
    $('cajaHora').style.display = 'none';
    pintarHojaItem();
    abrirHoja('tapaItem');
  }

  function mostrarTexto(titulo, texto) {
    $('textoTitulo').textContent = titulo;
    $('txtSalida').value = texto;
    abrirHoja('tapaTexto');
  }

  /* ---------- busqueda ---------- */

  function pintarBusqueda() {
    var q = $('txtBusca').value.replace(/^\s+|\s+$/g, '').toLowerCase();
    var cont = $('resultados');
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    if (q === '') {
      $('vacioBusca').style.display = 'block';
      $('vacioBusca').textContent = 'Escribi para buscar.';
      return;
    }
    var i, n = 0;
    for (i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var t = tagInfo(it.tag);
      var heno = it.texto.toLowerCase() + ' ' + (t ? t.nom.toLowerCase() : '');
      if (heno.indexOf(q) === -1) { continue; }
      n++;
      (function (item) {
        var li = document.createElement('li');
        li.className = 'item st-' + item.estado + claseNivel(item);
        var e = document.createElement('div');
        e.className = 'etq';
        e.textContent = icoNomCtx(item.contexto).toUpperCase() +
          (item.tipo === 'compra' ? ' \u00B7 COMPRA' : '');
        var tx = document.createElement('div');
        tx.className = 'txt';
        tx.textContent = item.texto;
        var l2 = document.createElement('div');
        l2.className = 'linea2';
        var inf = estadoInfo(item.estado);
        l2.appendChild(badge('est', inf.ico + ' ' + inf.nom.toUpperCase()));
        l2.appendChild(badge('', horaCorta(item.creado)));
        li.appendChild(e);
        li.appendChild(tx);
        li.appendChild(l2);
        li.onclick = function () {
          cerrarHoja('tapaBuscar');
          if (item.contexto !== contexto) { aplicarContexto(item.contexto, true); }
          if (item.tipo === 'compra') { irAVista('compras'); }
          abrirItem(item.id);
        };
        cont.appendChild(li);
      })(it);
    }
    $('vacioBusca').style.display = n === 0 ? 'block' : 'none';
    $('vacioBusca').textContent = 'Sin resultados para esa busqueda.';
  }

  /* ---------- resumen ---------- */

  function textoResumen() {
    var i, def = RANGOS[0];
    for (i = 0; i < RANGOS.length; i++) { if (RANGOS[i].id === rango) { def = RANGOS[i]; } }
    var hoy = new Date();
    var lineas = ['KCO \u00B7 ' + nomCtx(contexto) + ' \u00B7 ' + def.nom +
      ' (' + dosDig(hoy.getDate()) + '/' + dosDig(hoy.getMonth() + 1) + '/' + hoy.getFullYear() + ')', ''];
    var evs = eventosFiltrados();
    var hechos = [], movidos = [], nuevos = [];
    for (i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.tipo === 'captura') { nuevos.push(ev.texto); }
      if (ev.tipo === 'estado' && CERRADOS[ev.hasta] && ev.hasta !== 'cancelado') { hechos.push(ev.texto); }
      if (ev.tipo === 'estado' && !CERRADOS[ev.hasta]) {
        movidos.push(ev.texto + ' \u2192 ' + estadoInfo(ev.hasta).nom);
      }
    }
    function bloque(titulo, arr) {
      if (arr.length === 0) { return; }
      lineas.push(titulo);
      var vistos = {}, j;
      for (j = 0; j < arr.length; j++) {
        if (vistos[arr[j]]) { continue; }
        vistos[arr[j]] = true;
        lineas.push('- ' + arr[j]);
      }
      lineas.push('');
    }
    bloque('COMPLETADO:', hechos);
    bloque('EN MOVIMIENTO:', movidos);
    bloque('CAPTURADO:', nuevos);

    var urgentes = [], compras = [], esp = [], pend = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (!enContexto(it) || !esActivo(it.estado)) { continue; }
      if (it.nivel === 'urgente') { urgentes.push(it.texto); continue; }
      if (it.tipo === 'compra') {
        compras.push(it.texto + (!K.esFabrica(it.contexto) ? '' : ' (' + estadoInfo(it.estado).nom + ')') +
          (alertaEntrega(it) > 0 ? ' [+48hs]' : ''));
        continue;
      }
      if (it.estado === 'esperando') { esp.push(it.texto + (it.espera ? ' (' + it.espera + ')' : '')); }
      else { pend.push(it.texto); }
    }
    bloque('URGENTE:', urgentes);
    bloque(contexto === 'trabajo' ? 'COMPRAS ABIERTAS:' : 'LISTA DE COMPRAS:', compras);
    bloque('ESPERANDO:', esp);
    bloque('QUEDA ABIERTO:', pend);

    if (lineas.length === 2) { lineas.push('Sin movimientos en este periodo.'); }
    return lineas.join('\n');
  }

  /* Reporte de relevo: lo del turno de hoy, en texto plano para pegar en
     WhatsApp. Siempre el dia de hoy y el contexto actual, sin importar que
     rango este elegido en el Registro: un relevo es de un turno, no de 30 dias. */
  function textoRelevo() {
    var ahora = new Date();
    var hoy = claveDia(ahora);
    var lineas = [];
    lineas.push((contexto === 'trabajo' ? '\uD83D\uDD27' : icoCtx(contexto)) + ' RELEVO DE TURNO \u00B7 ' + nomCtx(contexto));
    lineas.push('\uD83D\uDCC5 ' + dosDig(ahora.getDate()) + '/' + dosDig(ahora.getMonth() + 1) + '/' +
      ahora.getFullYear() + ' \u00B7 ' + hhmm(ahora));

    var hechas = [], notas = [], i, ev, d;
    for (i = 0; i < eventos.length; i++) {
      ev = eventos[i];
      if (contexto !== 'todo' && ev.contexto !== contexto) { continue; }
      d = fechaObj(ev.ts);
      if (!d || claveDia(d) !== hoy) { continue; }
      if (ev.tipo === 'estado' && CERRADOS[ev.hasta] && ev.hasta !== 'cancelado') {
        hechas.push(ev.texto);
      }
      if (ev.tipo === 'comentario') { notas.push(hhmm(d) + ' ' + ev.texto + ' \u2014 ' + ev.hasta); }
    }

    var ancladas = [], compras = [], it, det;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!enContexto(it) || !esActivo(it.estado)) { continue; }
      if (it.anclado === true || it.nivel === 'urgente') {
        ancladas.push((it.anclado === true ? '\uD83D\uDCCC ' : '\u203C ') + it.texto);
      }
      if (it.tipo === 'compra') {
        det = it.texto;
        if (K.esFabrica(it.contexto)) { det = det + ' \u2014 ' + estadoInfo(it.estado).nom; }
        if (it.pausado === true) { det = det + ' \u23F8 en espera'; }
        if (alertaEntrega(it) > 0) { det = det + ' \u26A0 +48hs'; }
        compras.push(det);
      }
    }

    function bloque(titulo, arr) {
      if (arr.length === 0) { return; }
      var vistos = {}, j, limpio = [];
      for (j = 0; j < arr.length; j++) {
        if (vistos[arr[j]]) { continue; }
        vistos[arr[j]] = true;
        limpio.push(arr[j]);
      }
      lineas.push('');
      lineas.push(titulo + ' (' + limpio.length + ')');
      for (j = 0; j < limpio.length; j++) { lineas.push('\u2022 ' + limpio[j]); }
    }

    bloque('\u2705 COMPLETADAS', hechas);
    bloque(contexto === 'trabajo' ? '\uD83D\uDED2 COMPRAS PENDIENTES' : '\uD83D\uDED2 LISTA DE COMPRAS', compras);
    bloque('\uD83D\uDCAC NOTAS DEL DIA', notas);
    bloque('\uD83D\uDCCC ANCLADO Y URGENTE', ancladas);

    if (lineas.length === 2) { lineas.push(''); lineas.push('Sin novedades en el turno.'); }
    return lineas.join('\n');
  }

  /* ---------- aviso de backup ---------- */

  function marcarBackup() {
    escribir(K_BACKUP, new Date().toISOString());
    actualizarAvisoBackup();
  }

  function diasSinBackup() {
    var v = leer(K_BACKUP);
    var base = v ? fechaObj(v) : null;
    if (!base) {
      /* Nunca exporto: se cuenta desde el item mas viejo, asi una instalacion
         recien hecha no molesta desde el primer dia. */
      var i, min = null;
      for (i = 0; i < items.length; i++) {
        var d = fechaObj(items[i].creado);
        if (d && (!min || d.getTime() < min.getTime())) { min = d; }
      }
      base = min;
    }
    if (!base) { return 0; }
    return Math.floor((Date.now() - base.getTime()) / 86400000);
  }

  function actualizarAvisoBackup() {
    var dias = diasSinBackup();
    var b = $('btnAjustes');
    if (b) { b.className = dias > DIAS_AVISO_BACKUP ? 'iconobtn avisa' : 'iconobtn'; }
    var v = $('vBackup');
    if (v) {
      var u = leer(K_BACKUP);
      v.textContent = u ? horaCorta(u) + ' \u00B7 hace ' + dias + ' d' : 'nunca (hace ' + dias + ' d)';
    }
  }

  function compartir(titulo, texto) {
    if (navigator.share) {
      try { navigator.share({ title: titulo, text: texto }); return true; } catch (e) { /* fallback */ }
    }
    return copiar(texto);
  }

  function copiar(texto) {
    var sal = $('txtSalida');
    sal.value = texto;
    try {
      sal.removeAttribute('readonly');
      sal.select();
      var ok = document.execCommand ? document.execCommand('copy') : false;
      sal.setAttribute('readonly', 'readonly');
      return ok;
    } catch (e) {
      sal.setAttribute('readonly', 'readonly');
      return false;
    }
  }

  /* ---------- backup ---------- */

  function armarBackup() {
    return JSON.stringify({
      app: 'kco', schema: ESQUEMA, version: VERSION_APP,
      exportado: new Date().toISOString(), contexto: contexto,
      items: items, eventos: eventos
    });
  }

  function nombreBackup() {
    var d = new Date();
    return 'kco-backup-' + d.getFullYear() + dosDig(d.getMonth() + 1) + dosDig(d.getDate()) +
      '-' + dosDig(d.getHours()) + dosDig(d.getMinutes()) + '.json';
  }

  function descargarBackup() {
    var texto = armarBackup();
    try {
      var blob = new Blob([texto], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = nombreBackup();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) {
      mostrarTexto('Backup (copialo a mano)', texto);
      return false;
    }
  }

  function aplicarBackup(datos) {
    var nuevosItems = [], nuevosEventos = [], i;
    for (i = 0; i < datos.items.length; i++) {
      var n = normalizarItem(datos.items[i]);
      if (n) { nuevosItems.push(n); }
    }
    if (esArray(datos.eventos)) {
      for (i = 0; i < datos.eventos.length; i++) {
        var e = normalizarEvento(datos.eventos[i]);
        if (e) { nuevosEventos.push(e); }
      }
    }
    items = nuevosItems;
    eventos = nuevosEventos;
    soloLectura = false;
    guardarItems();
    guardarEventos();
    escribir(K_ESQUEMA, '' + ESQUEMA);
    eventos.push({
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'restauracion', itemId: '',
      texto: nuevosItems.length + ' items restaurados', contexto: ctxCaptura, desde: '', hasta: ''
    });
    guardarEventos();
    $('aviso').className = 'aviso';
    pintar();
  }

  function procesarImportacion(texto) {
    var datos = null;
    try { datos = JSON.parse(texto); } catch (e) { datos = null; }
    if (!datos || typeof datos !== 'object' || esArray(datos)) {
      avisar('Ese archivo no es un backup valido.');
      return;
    }
    if (datos.app !== 'kco') {
      avisar('Ese backup es de otra app (' + (datos.app ? datos.app : 'sin identificar') + '). KCO solo restaura backups de KCO.');
      return;
    }
    var sch = parseInt(datos.schema, 10);
    if (isNaN(sch) || sch > ESQUEMA) {
      avisar('Ese backup usa un esquema mas nuevo (' + datos.schema + ') que esta version de KCO. Actualiza la app antes de restaurar.');
      return;
    }
    if (!esArray(datos.items)) { avisar('El backup no trae la lista de items.'); return; }
    pedirConfirmacion('Restaurar backup',
      'Trae ' + datos.items.length + ' items y ' + (esArray(datos.eventos) ? datos.eventos.length : 0) +
      ' movimientos, exportado el ' + (datos.exportado ? horaCorta(datos.exportado) : 'sin fecha') +
      '. Esto REEMPLAZA los ' + items.length + ' items que tenes ahora. No se puede deshacer.',
      function () { aplicarBackup(datos); });
  }

  /* ---------- contexto ---------- */

  function aplicarLuz(guardar) {
    var base = 'ctx-' + contexto;
    document.body.className = modoLuz ? base + ' luz' : base;
    var b = $('btnLuz');
    if (b) {
      b.textContent = modoLuz ? '\u2600 Modo luz de planta: ACTIVADO' : '\u2600 Modo luz de planta';
      b.className = modoLuz ? 'bloque pri' : 'bloque';
    }
    if (guardar) { escribir(K_LUZ, modoLuz ? '1' : '0'); }
  }

  function aplicarContexto(nuevo, guardar) {
    contexto = nuevo === 'todo' || K.contextoValido(nuevo) ? nuevo : 'trabajo';
    if (contexto !== 'todo') { ctxCaptura = contexto; }
    aplicarLuz(false);
    pintarSelectorContexto();
    pintarPistaCaptura();
    if (guardar) {
      escribir(K_CTX, contexto);
      escribir(K_CTXCAP, ctxCaptura);
    }
    pintar();
    chequearRecordatorios();
  }

  /* ---------- interfaz ---------- */


  $('txtCaptura').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) { ev.preventDefault(); capturar(); }
  };

  $('tabTablero').onclick = function () { irAVista('tablero'); };
  $('tabCompras').onclick = function () { irAVista('compras'); };
  $('tabRegistro').onclick = function () { irAVista('registro'); };

  $('btnCerrarItem').onclick = function () { itemAbierto = null; cerrarHoja('tapaItem'); };


  $('btnGuardarEspera').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    it.espera = $('txtEspera').value.replace(/^\s+|\s+$/g, '');
    it.actualizado = new Date().toISOString();
    if (guardarItems()) { registrar('espera', it, '', it.espera); pintar(); pintarHojaItem(); }
  };

  $('btnHoy18').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    var d = new Date();
    d.setHours(18, 0, 0, 0);
    if (d.getTime() <= Date.now()) { d.setDate(d.getDate() + 1); }
    fijarRecordatorio(it, d);
  };

  $('btnMan9').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    var d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    fijarRecordatorio(it, d);
  };

  $('btnDiaHoy').onclick = function () {
    if (itemAbierto) { fijarFecha(itemAbierto, K.claveDia(new Date())); }
  };
  $('btnDiaMan').onclick = function () {
    if (itemAbierto) { fijarFecha(itemAbierto, K.sumarDias(K.claveDia(new Date()), 1)); }
  };
  $('btnDiaElegir').onclick = function () {
    var it = buscarItem(itemAbierto);
    $('txtDia').value = it && it.fecha !== '' ? it.fecha : K.claveDia(new Date());
    $('cajaDia').style.display = $('cajaDia').style.display === 'block' ? 'none' : 'block';
  };
  $('btnDiaOk').onclick = function () {
    if (itemAbierto) { fijarFecha(itemAbierto, $('txtDia').value); }
  };
  $('btnSacarDia').onclick = function () {
    if (itemAbierto) { fijarFecha(itemAbierto, ''); }
  };

  $('btnOtraHora').onclick = function () {
    $('cajaHora').style.display = $('cajaHora').style.display === 'block' ? 'none' : 'block';
  };

  function horaElegida(sumarDia) {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    var v = $('txtHora').value;
    var m = v.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!m) { avisar('Hora invalida.'); return; }
    var d = new Date();
    if (sumarDia) { d.setDate(d.getDate() + 1); }
    d.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
    if (!sumarDia && d.getTime() <= Date.now()) { d.setDate(d.getDate() + 1); }
    $('cajaHora').style.display = 'none';
    fijarRecordatorio(it, d);
  }
  $('btnHoraHoy').onclick = function () { horaElegida(false); };
  $('btnHoraManana').onclick = function () { horaElegida(true); };

  $('btnSacarRec').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura || it.recordatorio === '') { return; }
    it.recordatorio = '';
    it.recAvisado = false;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('recordatorio', it, '', '');
      pintar();
      pintarHojaItem();
      chequearRecordatorios();
    }
  };

  $('btnAcompra').onclick = function () {
    if (itemAbierto) { moverACompras(itemAbierto); }
  };

  $('btnVolverTarea').onclick = function () {
    if (itemAbierto) { volverATarea(itemAbierto); }
  };

  $('btnEditar').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it) { return; }
    $('txtEditar').value = it.texto;
    abrirHoja('tapaEditar');
  };

  $('btnGuardarEdicion').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    var nuevo = $('txtEditar').value.replace(/^\s+|\s+$/g, '');
    if (nuevo === '' || nuevo === it.texto) { cerrarHoja('tapaEditar'); return; }
    var previo = it.texto;
    it.texto = nuevo;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('edicion', it, previo, nuevo);
      cerrarHoja('tapaEditar');
      pintar();
      pintarHojaItem();
    } else { it.texto = previo; }
  };

  $('btnCancelarEdicion').onclick = function () { cerrarHoja('tapaEditar'); };

  $('btnCompartirItem').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it) { return; }
    var t = it.texto + '\n(' + estadoInfo(it.estado).nom + ' \u00B7 ' +
      nomCtx(it.contexto) + ' \u00B7 KCO)';
    if (!navigator.share) { mostrarTexto('Compartir item', t); return; }
    compartir('KCO', t);
  };

  $('btnBorrar').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    pedirConfirmacion('Borrar item', 'Se borra "' + it.texto + '". Vas a tener unos segundos para deshacerlo.', function () {
      var i, pos = -1;
      for (i = 0; i < items.length; i++) {
        if (items[i].id === it.id) { pos = i; break; }
      }
      if (pos === -1) { return; }
      var copia = items[pos];
      items.splice(pos, 1);
      if (guardarItems()) { registrar('borrado', it, it.estado, ''); }
      itemAbierto = null;
      cerrarHoja('tapaItem');
      pintar();
      chequearRecordatorios();
      (function (guardado, donde) {
        ofrecerDeshacer('Borrado: ' + guardado.texto, function () {
          if (soloLectura) { return; }
          items.splice(donde > items.length ? items.length : donde, 0, guardado);
          if (guardarItems()) {
            registrar('deshacer', guardado, 'borrado', guardado.estado);
            pintar();
          }
        });
      })(copia, pos);
    });
  };

  $('btnConfSi').onclick = function () {
    var accion = confAccion;
    confAccion = null;
    cerrarHoja('tapaConfirmar');
    if (accion) { accion(); }
  };
  $('btnConfNo').onclick = function () { confAccion = null; cerrarHoja('tapaConfirmar'); };

  $('btnBuscar').onclick = function () { $('txtBusca').value = ''; pintarBusqueda(); abrirHoja('tapaBuscar'); };
  $('txtBusca').oninput = function () { pintarBusqueda(); };
  $('txtBusca').onkeyup = function () { pintarBusqueda(); };
  $('btnCerrarBusca').onclick = function () { cerrarHoja('tapaBuscar'); };

  $('btnRelevo').onclick = function () { mostrarTexto('Reporte de Turno', textoRelevo()); };
  $('btnResumen').onclick = function () { mostrarTexto('Resumen', textoResumen()); };
  $('btnCompartirTexto').onclick = function () {
    var t = $('txtSalida').value;
    if (navigator.share) { compartir('KCO', t); } else { copiar(t); }
  };
  $('btnCopiarTexto').onclick = function () { copiar($('txtSalida').value); };
  $('btnCerrarTexto').onclick = function () { cerrarHoja('tapaTexto'); };

  $('btnAjustes').onclick = function () {
    actualizarAvisoBackup();
    pintarCatalogos();
    $('vApp').textContent = VERSION_APP;
    $('vEsquema').textContent = '' + ESQUEMA;
    $('vTotal').textContent = '' + items.length;
    $('vEventos').textContent = '' + eventos.length;
    $('vNotif').textContent = estadoNotif();
    abrirHoja('tapaAjustes');
  };
  $('btnCerrarAjustes').onclick = function () { cerrarHoja('tapaAjustes'); };

  $('btnPermiso').onclick = function () {
    if (!hayNotificacion()) { avisar('Este navegador no tiene notificaciones.'); return; }
    try {
      window.Notification.requestPermission(function (p) {
        $('vNotif').textContent = p;
      });
    } catch (e) { avisar('No se pudo pedir el permiso de notificaciones.'); }
  };

  $('btnDeshacer').onclick = function () { hacerDeshacer(); };

  $('btnPausa').onclick = function () {
    if (itemAbierto) { alternarPausa(itemAbierto); }
  };

  $('btnAgregarNota').onclick = function () {
    if (itemAbierto) { agregarNota(itemAbierto, $('txtNota').value); }
  };

  $('btnAnclar').onclick = function () {
    if (itemAbierto) { alternarAnclado(itemAbierto); }
  };

  $('txtSolicitante').onchange = function () { guardarPedido(); };
  $('txtDestino').onchange = function () { guardarPedido(); };

  function enterCierraCampo(inp) {
    inp.onkeydown = function (ev) {
      var k = ev.key || ev.keyCode;
      if (k === 'Enter' || k === 13) {
        ev.preventDefault();
        guardarPedido();
        try { inp.blur(); } catch (e) {}
      }
    };
  }
  enterCierraCampo($('txtSolicitante'));
  enterCierraCampo($('txtDestino'));

  acercarAlTeclado($('txtSolicitante'));
  acercarAlTeclado($('txtDestino'));
  acercarAlTeclado($('txtNota'));
  acercarAlTeclado($('txtPaso'));

  $('btnSumarSolic').onclick = function () { sumarAMano('txtNuevoSolic', solicitantes, K_SOLIC); };
  $('btnSumarDest').onclick = function () { sumarAMano('txtNuevoDest', destinos, K_DEST); };
  /* En estos dos campos Enter hace renglon nuevo: son de pegar listas.
     El alta la hace el boton. */
  acercarAlTeclado($('txtNuevoSolic'));
  acercarAlTeclado($('txtNuevoDest'));

  $('btnAgregarPaso').onclick = function () {
    if (itemAbierto) { agregarPaso(itemAbierto, $('txtPaso').value); }
  };

  $('txtPaso').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) {
      ev.preventDefault();
      if (itemAbierto) { agregarPaso(itemAbierto, $('txtPaso').value); }
    }
  };

  $('txtNota').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) {
      ev.preventDefault();
      if (itemAbierto) { agregarNota(itemAbierto, $('txtNota').value); }
    }
  };

  $('btnLuz').onclick = function () {
    modoLuz = !modoLuz;
    aplicarLuz(true);
  };

  $('btnExportar').onclick = function () { descargarBackup(); marcarBackup(); };
  $('btnBackupTexto').onclick = function () { mostrarTexto('Backup KCO', armarBackup()); marcarBackup(); };
  $('btnImportar').onclick = function () { $('archivoImport').click(); };
  $('archivoImport').onchange = function (ev) {
    var f = ev.target.files && ev.target.files[0];
    if (!f) { return; }
    var lector = new FileReader();
    lector.onload = function () {
      cerrarHoja('tapaAjustes');
      procesarImportacion('' + lector.result);
      ev.target.value = '';
    };
    lector.onerror = function () { avisar('No se pudo leer el archivo.'); };
    lector.readAsText(f);
  };

  /* ---------- arranque ---------- */

  var AUTOR = 'Desarrollado por Kevin V\u00E1squez';

  function pintarFirma() {
    var txt = 'KCO v' + VERSION_APP + ' \u00B7 esquema ' + ESQUEMA + ' \u00B7 ' + AUTOR;
    var p = $('pie');
    if (p) { p.textContent = txt; }
    if ($('pieVersion')) { $('pieVersion').textContent = VERSION_APP; }
    if ($('pieEsquema')) { $('pieEsquema').textContent = '' + ESQUEMA; }
  }

  migrar();
  items = cargarLista(K_ITEMS, normalizarItem);
  eventos = cargarLista(K_EVENTOS, normalizarEvento);
  cargarCatalogos();
  aplicarMigracion4();
  filtro = leer(K_FILTRO) || 'activos';
  filtroCompra = leer(K_FILTROC) || 'activos';
  filtroTag = leer(K_FILTROTAG) || '';
  modoLuz = leer(K_LUZ) === '1';
  var vg = leer(K_VISTA);
  vista = (vg === 'registro' || vg === 'compras') ? vg : 'tablero';
  var cc = leer(K_CTXCAP);
  ctxCaptura = K.contextoValido(cc) ? cc : 'trabajo';
  aplicarContexto(leer(K_CTX) || 'trabajo', false);
  pintarFirma();

  if (typeof window.setInterval === 'function') {
    window.setInterval(chequearRecordatorios, 30000);
  }

  window.onpopstate = function () { alVolverAtras(); };

  conectarSwipe(document.getElementsByTagName('main')[0], swipeVistas);
  conectarSwipe(document.getElementsByTagName('header')[0], swipeContexto);

  if (vista !== 'tablero') { anclaPuesta = empujarHistorial({ kcoAncla: true }); }

  if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    navigator.serviceWorker.register('./sw.js').then(function () {
      if (navigator.serviceWorker.controller) {
        var canal = new MessageChannel();
        canal.port1.onmessage = function (ev) {
          if (ev.data && ev.data.version) { $('vSw').textContent = ev.data.version; }
        };
        navigator.serviceWorker.controller.postMessage({ tipo: 'version' }, [canal.port2]);
      } else {
        $('vSw').textContent = 'activo tras recargar';
      }
    }, function () { $('vSw').textContent = 'no registrado'; });
  } else {
    $('vSw').textContent = 'no disponible';
  }
})();
