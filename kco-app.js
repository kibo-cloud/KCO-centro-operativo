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
  var K_BACKUP = 'kibco.ultimoBackup';
  var K_SOLIC = 'kibco.solicitantes';
  var K_DEST = 'kibco.destinos';
  var K_CTXCAP = 'kibco.contextoCaptura';
  var K_RUTINAS = 'kibco.rutinas';
  var rutinas = [];
  var K_PROYECTOS = 'kibco.proyectos';
  var proyectos = [];

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
  var vista = 'ahora';
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
    /* Un cambio de estado a mano reemplaza cualquier excepcion de rutina. */
    it.motivo = '';
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
    if (id === 'todo') { return '\u2B50'; }
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
      inp.setAttribute('placeholder', 'Capturar en ' + icoNomCtx(ctxCaptura) + ' \u00B7 Enter guarda');
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

  function nodoItem(it, motivo, modo) {
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
    if (motivo) { cu.appendChild(nodo('div', 'motivo mono', motivo)); }

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
    if (contexto === 'todo') { l2.appendChild(badge('ctx', icoCtx(it.contexto))); }
    if (it.rutinaId !== '') { l2.appendChild(badge('rut', '\uD83D\uDD04')); }
    if (it.motivo !== '') { l2.appendChild(badge('mot', textoMotivo(it.motivo))); }
    if (it.anclado === true) { l2.appendChild(badge('pin', '\uD83D\uDCCC')); }
    var bn = badgeNivel(it);
    if (bn) { l2.appendChild(bn); }
    var bf = badgeFecha(it);
    if (bf) { l2.appendChild(bf); }
    var inf = estadoInfo(it.estado);
    /* Pendiente es el estado por defecto de algo clasificado: no hace falta
       gritarlo en cada tarjeta. Los demas estados si dicen algo. */
    if (it.estado !== 'pendiente') { l2.appendChild(badge('est', inf.ico + ' ' + inf.nom.toUpperCase())); }
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

    if (modo === 'triage' && it.estado === 'entrada') {
      accs = document.createElement('div');
      accs.className = 'accs';
      sumarAccion(accs, 'abtn ico', '\u2714', 'clasificar', function () { sacarDeInbox(it.id, false); }, 'Pasar a pendiente');
      sumarAccion(accs, 'abtn ico', '\uD83D\uDCC5', 'parahoy', function () { sacarDeInbox(it.id, true); }, 'Para hoy');
    } else if (esActivo(it.estado)) {
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
    if (ev.tipo === 'excepcion') { return textoMotivo(ev.hasta); }
    if (ev.tipo === 'mision_alta') { return 'Nueva mision'; }
    if (ev.tipo === 'mision_fin') { return '\uD83C\uDFC1 Mision cumplida'; }
    if (ev.tipo === 'mision_reabre') { return 'Reabriste la mision'; }
    if (ev.tipo === 'mision_pausa') { return 'Pausaste la mision'; }
    if (ev.tipo === 'mision_activa') { return 'Reactivaste la mision'; }
    if (ev.tipo === 'mision_baja') { return 'Borraste la mision'; }
    if (ev.tipo === 'hito') { return '\uD83C\uDFAF Hito: ' + ev.hasta; }
    if (ev.tipo === 'hito_reabre') { return 'Reabriste el hito ' + ev.hasta; }
    if (ev.tipo === 'mision_tarea') { return ev.hasta ? 'A la mision ' + ev.hasta : 'Sacaste de la mision'; }
    if (ev.tipo === 'rutina_alta') { return 'Nueva rutina'; }
    if (ev.tipo === 'rutina_edit') { return 'Editaste la rutina'; }
    if (ev.tipo === 'rutina_pausa') { return 'Pausaste la rutina'; }
    if (ev.tipo === 'rutina_activa') { return 'Reactivaste la rutina'; }
    if (ev.tipo === 'rutina_baja') { return 'Borraste la rutina'; }
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

  /* ---------- centro de control: AHORA y HOY ---------- */

  function vaciar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  function hoyClave() { return K.claveDia(new Date()); }

  function nodo(tag, clase, texto) {
    var e = document.createElement(tag);
    if (clase) { e.className = clase; }
    if (typeof texto === 'string') { e.textContent = texto; }
    return e;
  }

  /* Encabezado de seccion + su lista. Devuelve el <ul> para llenarlo. */
  function seccion(cont, id, titulo, n, nota) {
    var s = nodo('section', 'sec');
    if (id) { s.id = id; }
    var h = nodo('h3', 'sec-tit');
    h.appendChild(nodo('span', '', titulo));
    if (typeof n === 'number' || typeof n === 'string') { h.appendChild(nodo('b', 'mono', '' + n)); }
    s.appendChild(h);
    if (nota) { s.appendChild(nodo('div', 'sec-nota', nota)); }
    var ul = nodo('ul', 'lista');
    s.appendChild(ul);
    cont.appendChild(s);
    return ul;
  }

  function activosVisibles() {
    var r = [], i;
    for (i = 0; i < items.length; i++) {
      if (enContexto(items[i]) && esActivo(items[i].estado)) { r.push(items[i]); }
    }
    return r;
  }

  /* Accion principal de un toque para cualquier item, la misma que ofrece su tarjeta. */
  function accionPrincipal(it) {
    if (it.tipo === 'tarea') { return { txt: '\u2705 Hecho', fn: function () { cambiarEstado(it.id, 'completado'); } }; }
    if (!K.esFabrica(it.contexto)) { return { txt: '\u2705 Comprado', fn: function () { cambiarEstado(it.id, 'comprado'); } }; }
    if (it.pausado === true) { return { txt: '\u25B6 Seguir', fn: function () { alternarPausa(it.id); } }; }
    var sig = estadoSiguiente(it);
    return sig ? { txt: '\u25B6 ' + sig.nom, fn: function () { cambiarEstado(it.id, sig.id); } } : null;
  }

  function botonHero(cont, clase, texto, fn) {
    var b = nodo('button', clase, texto);
    b.type = 'button';
    b.onclick = function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } fn(); };
    cont.appendChild(b);
    return b;
  }

  function nodoHero(r, siguientes) {
    var it = r.item;
    var c = nodo('div', 'hero' + claseNivel(it));
    c.setAttribute('data-id', it.id);
    c.appendChild(nodo('div', 'hero-rot', '\u25B6 SIGUIENTE MOVIMIENTO'));
    c.appendChild(nodo('div', 'hero-txt', it.texto));
    var meta = [r.motivo, icoNomCtx(it.contexto)];
    var pr = it.proyectoId ? buscarProyectoNombre(it.proyectoId) : '';
    if (pr !== '') { meta.push('\uD83C\uDFAF ' + pr); }
    c.appendChild(nodo('div', 'hero-meta mono', meta.join(' \u00B7 ')));
    var accs = nodo('div', 'hero-accs');
    var ap = accionPrincipal(it);
    if (ap) { botonHero(accs, 'bloque pri', ap.txt, ap.fn).setAttribute('data-hero', 'hecho'); }
    if (it.tipo === 'tarea' && it.estado !== 'proceso') {
      botonHero(accs, 'bloque', '\u23F5 Empezar', function () { cambiarEstado(it.id, 'proceso'); }).setAttribute('data-hero', 'empezar');
    }
    botonHero(accs, 'bloque', '\u23ED Ma\u00F1ana', function () {
      posponer(it.id);
    }).setAttribute('data-hero', 'manana');
    c.appendChild(accs);
    if (siguientes.length > 0) {
      var sg = nodo('div', 'hero-sig');
      sg.appendChild(nodo('span', 'mono', 'DESPUES '));
      var j;
      for (j = 0; j < siguientes.length; j++) {
        (function (s) {
          var a = nodo('button', 'linkbtn', s.item.texto);
          a.type = 'button';
          a.onclick = function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } abrirItem(s.item.id); };
          sg.appendChild(a);
        })(siguientes[j]);
      }
      c.appendChild(sg);
    }
    c.onclick = function () { abrirItem(it.id); };
    return c;
  }

  /* "No ahora": lo corre a mañana sin perderlo. Se puede deshacer. */
  function posponer(id) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    var previo = it.fecha, previoRec = it.recordatorio, previoAv = it.recAvisado;
    var man = K.sumarDias(hoyClave(), 1);
    it.fecha = man;
    /* Un recordatorio vencido se corre al mismo horario de mañana. */
    if (it.recordatorio !== '' && fechaObj(it.recordatorio) && fechaObj(it.recordatorio).getTime() <= Date.now()) {
      var d = fechaObj(it.recordatorio), m = K.deClave(man);
      m.setHours(d.getHours(), d.getMinutes(), 0, 0);
      it.recordatorio = m.toISOString();
      it.recAvisado = false;
    }
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { it.fecha = previo; it.recordatorio = previoRec; it.recAvisado = previoAv; return; }
    registrar('fecha', it, previo, man);
    pintar();
    chequearRecordatorios();
    ofrecerDeshacer('Para ma\u00F1ana: ' + it.texto, function () {
      var v = buscarItem(id);
      if (!v || soloLectura) { return; }
      v.fecha = previo; v.recordatorio = previoRec; v.recAvisado = previoAv;
      if (guardarItems()) { registrar('fecha', v, man, previo); pintar(); chequearRecordatorios(); }
    });
  }

  /* Saca un item del inbox en un toque: queda Pendiente, y opcionalmente para hoy. */
  function sacarDeInbox(id, paraHoy) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.estado !== 'entrada') { return; }
    var foto = fotoDe(it), fechaPrev = it.fecha, ahora = new Date().toISOString();
    it.estado = 'pendiente';
    it.estadoDesde = ahora;
    it.actualizado = ahora;
    if (paraHoy) { it.fecha = hoyClave(); }
    if (!guardarItems()) { it.estado = 'entrada'; it.fecha = fechaPrev; return; }
    registrar('estado', it, 'entrada', 'pendiente');
    if (paraHoy && fechaPrev !== it.fecha) { registrar('fecha', it, fechaPrev, it.fecha); }
    pintar();
    ofrecerDeshacer((paraHoy ? 'Para hoy: ' : 'Clasificada: ') + it.texto, function () {
      var v = buscarItem(id);
      if (!v) { return; }
      v.fecha = fechaPrev;
      restaurarFoto(id, foto, 'inbox');
    });
  }

  function tile(cont, ico, n, rot, destino, clase) {
    var b = nodo('button', 'tile' + (clase ? ' ' + clase : '') + (n === 0 ? ' cero' : ''));
    b.type = 'button';
    b.setAttribute('data-tile', destino);
    b.appendChild(nodo('b', 'mono', '' + n));
    b.appendChild(nodo('span', '', ico + ' ' + rot));
    b.onclick = function () {
      var s = $(destino);
      if (s && s.scrollIntoView) { try { s.scrollIntoView(true); } catch (e) {} }
    };
    cont.appendChild(b);
  }

  function pintarAhora() {
    var cont = $('ahoraCuerpo');
    vaciar(cont);
    var hoy = hoyClave(), ahora = Date.now();
    var lista = activosVisibles();
    var ranking = K.priorizar(lista, hoy, ahora);
    var esperando = [], inbox = [], nAt = 0, nHoy = 0, i, s;
    for (i = 0; i < lista.length; i++) {
      s = K.situacion(lista[i], hoy, ahora);
      if (s === 'atencion') { nAt++; }
      if (s === 'esperando') { esperando.push(lista[i]); }
      if (K.diaDe(lista[i]) === hoy) { nHoy++; }
      if (lista[i].tipo === 'tarea' && lista[i].estado === 'entrada') { inbox.push(lista[i]); }
    }

    pintarProgresoArriba(cont);

    var pulso = nodo('div', 'pulso');
    tile(pulso, '\uD83D\uDD34', nAt, 'Atencion', 'secAtencion', nAt > 0 ? 'rojo' : '');
    tile(pulso, '\uD83D\uDCC5', nHoy, 'Hoy', 'secSigue', '');
    tile(pulso, '\uD83D\uDCE5', inbox.length, 'Inbox', 'secInbox', '');
    tile(pulso, '\uD83D\uDD35', esperando.length, 'Esperando', 'secEsperando', '');
    cont.appendChild(pulso);

    var mostrados = {};
    if (ranking.length === 0) {
      var calma = nodo('div', 'hero calma');
      calma.appendChild(nodo('div', 'hero-rot', '\u2714 TODO EN ORDEN'));
      calma.appendChild(nodo('div', 'hero-txt', lista.length === 0
        ? 'Nada pendiente en ' + nomCtx(contexto) + '. Captura abajo lo proximo que aparezca.'
        : 'Lo que queda esta esperando a otros o tiene dia mas adelante.'));
      cont.appendChild(calma);
    } else {
      var sig = [];
      for (i = 1; i < ranking.length && sig.length < 2; i++) { sig.push(ranking[i]); }
      cont.appendChild(nodoHero(ranking[0], sig));
      mostrados['#' + ranking[0].item.id] = true;
    }

    var at = [];
    for (i = 0; i < ranking.length; i++) {
      if (ranking[i].situacion === 'atencion' && !mostrados['#' + ranking[i].item.id]) { at.push(ranking[i]); }
    }
    if (at.length > 0) {
      var ulA = seccion(cont, 'secAtencion', '\uD83D\uDD34 REQUIERE ATENCION', at.length);
      for (i = 0; i < at.length; i++) {
        ulA.appendChild(nodoItem(at[i].item, at[i].motivo));
        mostrados['#' + at[i].item.id] = true;
      }
    }

    var siguen = [];
    for (i = 0; i < ranking.length && siguen.length < 6; i++) {
      var r = ranking[i];
      if (mostrados['#' + r.item.id] || r.item.estado === 'entrada') { continue; }
      siguen.push(r);
    }
    if (siguen.length > 0) {
      var resto = 0;
      for (i = 0; i < ranking.length; i++) {
        if (!mostrados['#' + ranking[i].item.id] && ranking[i].item.estado !== 'entrada') { resto++; }
      }
      var ulS = seccion(cont, 'secSigue', '\uD83D\uDFE1 A CONTINUACION', resto,
        resto > siguen.length ? 'Las ' + siguen.length + ' que mas pesan. El resto esta en Tareas.' : '');
      for (i = 0; i < siguen.length; i++) {
        ulS.appendChild(nodoItem(siguen[i].item, siguen[i].motivo));
        mostrados['#' + siguen[i].item.id] = true;
      }
    }

    var bandeja = [];
    for (i = inbox.length - 1; i >= 0; i--) { if (!mostrados['#' + inbox[i].id]) { bandeja.push(inbox[i]); } }
    if (bandeja.length > 0) {
      var ulI = seccion(cont, 'secInbox', '\uD83D\uDCE5 INBOX', bandeja.length,
        'Capturado sin clasificar. \u2714 lo pasa a pendiente, \uD83D\uDCC5 lo deja para hoy.');
      for (i = 0; i < bandeja.length && i < 8; i++) { ulI.appendChild(nodoItem(bandeja[i], '', 'triage')); }
    }

    if (esperando.length > 0) {
      var ulE = seccion(cont, 'secEsperando', '\uD83D\uDD35 ESPERANDO', esperando.length);
      for (i = 0; i < esperando.length && i < 8; i++) { ulE.appendChild(nodoItem(esperando[i], '')); }
    }

    pintarMisionesAhora(cont);
  }

  function itemsDelDia(clave) {
    var r = [], i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (enContexto(it) && esActivo(it.estado) && K.diaDe(it) === clave) { r.push(it); }
    }
    return ordenar(r);
  }

  var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function tituloDia(clave) {
    var d = K.deClave(clave);
    return DIAS_SEMANA[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
  }

  var DIAS_PROXIMOS = 7;

  function pintarHoy() {
    var cont = $('hoyCuerpo');
    vaciar(cont);
    var hoy = hoyClave(), i, it;
    var vencidas = [], hechas = [];
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!enContexto(it)) { continue; }
      var dia = K.diaDe(it);
      if (esActivo(it.estado) && dia !== '' && dia < hoy) { vencidas.push(it); }
      if (K.esHecho(it.estado) && K.claveDeIso(it.estadoDesde) === hoy) { hechas.push(it); }
    }
    var deHoy = itemsDelDia(hoy);
    var rut = ocurrenciasDeHoy();

    var cab = nodo('div', 'hoy-cab');
    cab.appendChild(nodo('div', 'hoy-fecha', tituloDia(hoy).toUpperCase()));
    var total = hechas.length + deHoy.length + vencidas.length;
    var pct = total === 0 ? 0 : Math.round((hechas.length * 100) / total);
    cab.appendChild(nodo('div', 'mono hoy-cuenta', hechas.length + '/' + total + ' \u00B7 ' + pct + '%'));
    cont.appendChild(cab);
    var barra = nodo('div', 'barra');
    var bi = nodo('i', '');
    bi.style.width = pct + '%';
    barra.appendChild(bi);
    cont.appendChild(barra);

    if (rut.length > 0) {
      var hechasR = 0;
      for (i = 0; i < rut.length; i++) { if (!esActivo(rut[i].estado)) { hechasR++; } }
      var ulR = seccion(cont, 'secRutinasHoy', '\uD83D\uDD04 RUTINAS DE HOY', hechasR + '/' + rut.length);
      ordenar(rut);
      rut.sort(function (a, b) { return esActivo(a.estado) === esActivo(b.estado) ? 0 : (esActivo(a.estado) ? -1 : 1); });
      for (i = 0; i < rut.length; i++) {
        var ruD = buscarRutina(rut[i].rutinaId);
        ulR.appendChild(nodoItem(rut[i], ruD ? lineaRacha(ruD) : ''));
      }
    }
    var gest = nodo('button', 'bloque', '\uD83D\uDD04 Rutinas' + (rutinas.length ? ' (' + rutinas.length + ')' : ': crear la primera'));
    gest.type = 'button';
    gest.id = 'btnRutinas';
    gest.onclick = function () { abrirListaRutinas(); };
    cont.appendChild(gest);
    if (vencidas.length > 0) {
      var ulV = seccion(cont, 'secVencidas', '\uD83D\uDD34 VENCIDAS', vencidas.length,
        'Tenian dia y paso. \u23ED en la ficha o en AHORA las corre a ma\u00F1ana.');
      ordenar(vencidas);
      for (i = 0; i < vencidas.length; i++) { ulV.appendChild(nodoItem(vencidas[i], 'Era ' + nombreDia(K.diaDe(vencidas[i])))); }
    }
    var noRut = [];
    for (i = 0; i < deHoy.length; i++) { if (deHoy[i].rutinaId === '') { noRut.push(deHoy[i]); } }
    var ulH = seccion(cont, 'secParaHoy', '\uD83D\uDCC5 PARA HOY', noRut.length);
    if (noRut.length === 0) {
      ulH.appendChild(nodo('li', 'vacio chico', 'Nada agendado para hoy. Desde AHORA ves que conviene hacer.'));
    }
    for (i = 0; i < noRut.length; i++) { ulH.appendChild(nodoItem(noRut[i], '')); }
    if (hechas.length > 0) {
      var ulD = seccion(cont, 'secHechasHoy', '\uD83D\uDFE2 HECHO HOY', hechas.length);
      for (i = hechas.length - 1; i >= 0; i--) { ulD.appendChild(nodoItem(hechas[i], '')); }
    }

    var prox = nodo('div', 'sec-titulo-grande', '\uD83D\uDCC6 PROXIMOS DIAS');
    cont.appendChild(prox);
    var alguno = false, d, clave;
    for (d = 1; d <= DIAS_PROXIMOS; d++) {
      clave = K.sumarDias(hoy, d);
      var delDia = itemsDelDia(clave);
      var previstas = rutinasPrevistas(clave);
      if (delDia.length === 0 && previstas.length === 0) { continue; }
      alguno = true;
      var ulP = seccion(cont, 'dia-' + clave, (d === 1 ? 'MA\u00D1ANA \u00B7 ' : '') + tituloDia(clave).toUpperCase(),
        delDia.length + previstas.length);
      for (i = 0; i < delDia.length; i++) { ulP.appendChild(nodoItem(delDia[i], '')); }
      for (i = 0; i < previstas.length; i++) { ulP.appendChild(nodoPrevista(previstas[i])); }
    }
    var luego = [];
    var tope = K.sumarDias(hoy, DIAS_PROXIMOS);
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (enContexto(it) && esActivo(it.estado) && K.diaDe(it) > tope) { luego.push(it); }
    }
    if (luego.length > 0) {
      alguno = true;
      luego.sort(function (a, b) { var x = K.diaDe(a), y = K.diaDe(b); return x < y ? -1 : (x > y ? 1 : 0); });
      var ulL = seccion(cont, 'secMasAdelante', '\uD83D\uDFE3 MAS ADELANTE', luego.length);
      for (i = 0; i < luego.length && i < 10; i++) { ulL.appendChild(nodoItem(luego[i], tituloDia(K.diaDe(luego[i])))); }
    }
    if (!alguno) {
      cont.appendChild(nodo('div', 'vacio chico', 'Nada agendado en los proximos ' + DIAS_PROXIMOS + ' dias.'));
    }
  }

  /* Ganchos que completan las rutinas y las misiones (mas abajo). */
  function ocurrenciasDeHoy() {
    var r = [], i, hoy = hoyClave();
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (enContexto(it) && it.rutinaId !== '' && it.ocurrencia === hoy) { r.push(it); }
    }
    return r;
  }

  var ORDEN_VISTAS = ['ahora', 'hoy', 'tablero', 'compras', 'misiones', 'registro'];
  var VISTA_DOM = { ahora: 'vistaAhora', hoy: 'vistaHoy', tablero: 'vistaTablero', compras: 'vistaCompras', misiones: 'vistaMisiones', registro: 'vistaRegistro' };
  var VISTA_TAB = { ahora: 'tabAhora', hoy: 'tabHoy', tablero: 'tabTareas', compras: 'tabTareas', misiones: 'tabMisiones', registro: 'tabRegistro' };

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
    animarMain(dir);
    pintar();
    if (sinHistorial) { return; }
    if (v !== 'ahora') {
      if (!anclaPuesta && pilaCapas.length === 0) {
        anclaPuesta = empujarHistorial({ kcoAncla: true });
      }
    } else if (anclaPuesta && pilaCapas.length === 0) {
      anclaPuesta = false;
      retrocederHistorial(1);
    }
  }

  function pintar() {
    var v;
    for (v in VISTA_DOM) {
      if (VISTA_DOM.hasOwnProperty(v)) { $(VISTA_DOM[v]).style.display = vista === v ? 'block' : 'none'; }
    }
    for (v in VISTA_TAB) {
      if (VISTA_TAB.hasOwnProperty(v)) {
        var on = VISTA_TAB[vista] === VISTA_TAB[v];
        $(VISTA_TAB[v]).className = on ? 'tab on' : 'tab';
        $(VISTA_TAB[v]).setAttribute('aria-selected', on ? 'true' : 'false');
      }
    }
    $('segTareas').style.display = vista === 'tablero' || vista === 'compras' ? 'flex' : 'none';
    $('segBtnTareas').className = vista === 'tablero' ? 'segbtn on' : 'segbtn';
    $('segBtnCompras').className = vista === 'compras' ? 'segbtn on' : 'segbtn';
    if (vista === 'ahora') { pintarAhora(); }
    else if (vista === 'hoy') { pintarHoy(); }
    else if (vista === 'tablero') { pintarTablero(); }
    else if (vista === 'compras') { pintarCompras(); }
    else if (vista === 'misiones') { pintarMisiones(); }
    else { pintarRegistro(); }
    actualizarAvisoBackup();
    /* Una hoja de mision abierta refleja al instante lo que cambio debajo. */
    if (misionAbierta && $('tapaMision').className === 'tapa on') { pintarHojaMision(); }
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
    $(id).style.zIndex = '' + (30 + pilaCapas.length);
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
    if (vista !== 'ahora') {
      irAVista('ahora', true);
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

    var ru = it.rutinaId !== '' ? buscarRutina(it.rutinaId) : null;
    $('cajaOcurrencia').style.display = it.rutinaId !== '' ? 'block' : 'none';
    if (it.rutinaId !== '') {
      $('ocuInfo').textContent = ru
        ? K.describirRutina(ru) + ' \u00B7 ' + lineaRacha(ru) + ' \u00B7 toca el ' + nombreDia(it.ocurrencia)
        : 'La rutina de esta tarea ya no existe. Queda como historial.';
      $('btnVerRutina').style.display = ru ? 'block' : 'none';
      var ex = ['omitida', 'no_corresponde', 'delegada'], m;
      for (m = 0; m < ex.length; m++) {
        $('btnEx_' + ex[m]).className = it.motivo === ex[m] ? 'gbtn on' : 'gbtn';
      }
    }
    pintarMisionEnFicha(it);
    $('btnHacerRutina').style.display = it.rutinaId === '' && it.tipo === 'tarea' ? 'block' : 'none';
    $('btnAcompra').style.display = it.tipo === 'compra' || it.rutinaId !== '' ? 'none' : 'block';
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
    $('btnDeshacer').style.display = '';
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
    /* Una hoja de mision abierta refleja al instante lo que cambio debajo. */
    if (misionAbierta && $('tapaMision').className === 'tapa on') { pintarHojaMision(); }
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
      items: items, eventos: eventos, rutinas: rutinas, proyectos: proyectos
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
    var nuevasRutinas = [];
    if (esArray(datos.rutinas)) {
      for (i = 0; i < datos.rutinas.length; i++) {
        var r = normRutina(datos.rutinas[i]);
        if (r) { nuevasRutinas.push(r); }
      }
    }
    var nuevosProyectos = [];
    if (esArray(datos.proyectos)) {
      for (i = 0; i < datos.proyectos.length; i++) {
        var pj = K.normalizarProyecto(datos.proyectos[i]);
        if (pj) { nuevosProyectos.push(pj); }
      }
    }
    items = nuevosItems;
    eventos = nuevosEventos;
    rutinas = nuevasRutinas;
    proyectos = nuevosProyectos;
    soloLectura = false;
    guardarItems();
    guardarEventos();
    guardarRutinas();
    guardarProyectos();
    generarOcurrencias();
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
      ' movimientos' + (esArray(datos.rutinas) ? ', ' + datos.rutinas.length + ' rutinas' : '') +
      (esArray(datos.proyectos) ? ', ' + datos.proyectos.length + ' misiones' : '') +
      ', exportado el ' + (datos.exportado ? horaCorta(datos.exportado) : 'sin fecha') +
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

  $('tabAhora').onclick = function () { irAVista('ahora'); };
  $('tabHoy').onclick = function () { irAVista('hoy'); };
  $('tabTareas').onclick = function () { irAVista(vista === 'compras' ? 'compras' : 'tablero'); };
  $('segBtnTareas').onclick = function () { irAVista('tablero'); };
  $('segBtnCompras').onclick = function () { irAVista('compras'); };
  $('tabRegistro').onclick = function () { irAVista('registro'); };
  $('tabMisiones').onclick = function () { irAVista('misiones'); };
  $('btnGuardarMision').onclick = function () { guardarDatosMision(); };
  $('txtMisNombre').onchange = function () { if (misionAbierta) { guardarDatosMision(); } };
  $('txtMisObjetivo').onchange = function () { if (misionAbierta) { guardarDatosMision(); } };
  $('btnAgregarHito').onclick = function () { agregarHito(); };
  $('txtHito').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) { ev.preventDefault(); agregarHito(); }
  };
  $('btnAgregarMisTarea').onclick = function () { agregarTareaMision(); };
  $('txtMisTarea').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) { ev.preventDefault(); agregarTareaMision(); }
  };
  $('btnMisPausa').onclick = function () { alternarPausaMision(); };
  $('btnMisTerminar').onclick = function () { terminarMision(); };
  $('btnMisBorrar').onclick = function () { borrarMision(); };
  $('btnCerrarMision').onclick = function () { misionAbierta = null; cerrarHoja('tapaMision'); };
  acercarAlTeclado($('txtHito'));
  acercarAlTeclado($('txtMisTarea'));

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

  $('btnEx_omitida').onclick = function () { if (itemAbierto) { cerrarOcurrencia(itemAbierto, 'omitida'); } };
  $('btnEx_no_corresponde').onclick = function () { if (itemAbierto) { cerrarOcurrencia(itemAbierto, 'no_corresponde'); } };
  $('btnEx_delegada').onclick = function () { if (itemAbierto) { cerrarOcurrencia(itemAbierto, 'delegada'); } };
  $('btnVerRutina').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (it && it.rutinaId) { abrirRutina(it.rutinaId); }
  };
  $('btnHacerRutina').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (it) { abrirRutina(null, { texto: it.texto, contexto: it.contexto, nivel: it.nivel }, it.id); }
  };
  $('btnGuardarRutina').onclick = function () { guardarRutina(); };
  $('btnPausarRutina').onclick = function () { alternarRutinaActiva(); };
  $('btnBorrarRutina').onclick = function () { borrarRutina(); };
  $('btnCerrarRutina').onclick = function () { borrador = null; cerrarHoja('tapaRutina'); };
  $('btnNuevaRutina').onclick = function () { abrirRutina(null); };
  $('btnCerrarRutinas').onclick = function () { cerrarHoja('tapaRutinas'); };
  $('numCada').onchange = function () { if (borrador) { leerCamposRutina(); pintarHojaRutina(); } };
  $('numDiaMes').onchange = $('numCada').onchange;
  $('rutInicio').onchange = $('numCada').onchange;
  $('rutFin').onchange = $('numCada').onchange;
  $('txtRutina').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) { ev.preventDefault(); guardarRutina(); }
  };
  acercarAlTeclado($('txtRutina'));

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

  function textoMotivo(m) {
    if (m === 'omitida') { return '\u23ED Omitida'; }
    if (m === 'no_corresponde') { return '\u2796 No correspondia'; }
    if (m === 'delegada') { return '\uD83E\uDD1D Delegada'; }
    if (m === 'vencida') { return '\u231B Sin registrar'; }
    return '';
  }

  /* Gancho de la fase de progreso (XP y nivel). */
  function pintarProgresoArriba() {}

  /* ---------- misiones ----------
     kibco.proyectos guarda las misiones. Las tareas se vinculan con proyectoId.
     El progreso y la proxima accion los calcula KCOCore. */

  function guardarProyectos() { return soloLectura ? false : escribir(K_PROYECTOS, JSON.stringify(proyectos)); }

  function buscarProyecto(id) {
    var i;
    for (i = 0; i < proyectos.length; i++) { if (proyectos[i].id === id) { return proyectos[i]; } }
    return null;
  }

  function buscarProyectoNombre(id) {
    var p = buscarProyecto(id);
    return p ? p.nombre : '';
  }

  function registrarMision(tipo, p, hasta) {
    if (soloLectura) { return; }
    eventos.push({
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo, itemId: p.id,
      texto: p.nombre, contexto: p.contexto, desde: '', hasta: hasta || ''
    });
    guardarEventos();
  }

  function textoProxima(p) {
    var a = K.proximaAccion(p, items, hoyClave(), Date.now());
    if (!a) { return null; }
    if (a.tipo === 'hito') { return { txt: '\u2192 Hito: ' + a.hito.texto, motivo: a.motivo, accion: a }; }
    return { txt: '\u2192 ' + a.item.texto, motivo: a.motivo, accion: a };
  }

  function nodoMision(p, compacto) {
    var pr = K.progresoProyecto(p, items);
    var c = nodo('button', 'mision' + (p.estado === 'terminado' ? ' fin' : '') + (p.estado === 'pausado' ? ' pausa' : '') + (compacto ? ' compacta' : ''));
    c.type = 'button';
    c.setAttribute('data-mision', p.id);
    var top = nodo('div', 'mis-top');
    top.appendChild(nodo('span', 'mis-nom', icoCtx(p.contexto) + ' ' + p.nombre));
    top.appendChild(nodo('b', 'mono mis-pct', pr.pct + '%'));
    c.appendChild(top);
    var barra = nodo('div', 'barra');
    var bi = nodo('i', '');
    bi.style.width = pr.pct + '%';
    barra.appendChild(bi);
    c.appendChild(barra);
    if (p.estado === 'terminado') {
      c.appendChild(nodo('div', 'mis-prox mono', '\uD83C\uDFC1 Mision cumplida ' + (p.terminado ? fechaNota(p.terminado) : '')));
    } else {
      var px = textoProxima(p);
      c.appendChild(nodo('div', 'mis-prox' + (px ? '' : ' vacia'), px ? px.txt : '\u2192 Defini la proxima accion'));
    }
    if (!compacto) {
      var meta = [];
      if (pr.hitosTotal > 0) { meta.push(pr.hitosHechos + '/' + pr.hitosTotal + ' hitos'); }
      meta.push(pr.tareasHechas + '/' + pr.tareasTotal + ' tareas');
      if (p.estado === 'pausado') { meta.push('\u23F8 en pausa'); }
      c.appendChild(nodo('div', 'mis-meta mono', meta.join(' \u00B7 ')));
    }
    c.onclick = function () { abrirMision(p.id); };
    return c;
  }

  function misionesVisibles(estado) {
    var r = [], i;
    for (i = 0; i < proyectos.length; i++) {
      var p = proyectos[i];
      if ((contexto === 'todo' || p.contexto === contexto) && p.estado === estado) { r.push(p); }
    }
    r.sort(function (a, b) { return a.actualizado < b.actualizado ? 1 : (a.actualizado > b.actualizado ? -1 : 0); });
    return r;
  }

  function pintarMisionesAhora(cont) {
    var act = misionesVisibles('activo');
    if (act.length === 0) { return; }
    var s = nodo('section', 'sec');
    s.id = 'secMisiones';
    var h = nodo('h3', 'sec-tit');
    h.appendChild(nodo('span', '', '\uD83C\uDFAF MISIONES ACTIVAS'));
    h.appendChild(nodo('b', 'mono', '' + act.length));
    s.appendChild(h);
    var i;
    for (i = 0; i < act.length && i < 4; i++) { s.appendChild(nodoMision(act[i], true)); }
    cont.appendChild(s);
  }

  function pintarMisiones() {
    var cont = $('misionesCuerpo');
    vaciar(cont);
    var nueva = nodo('button', 'bloque pri', '\u2795 Nueva mision');
    nueva.type = 'button';
    nueva.id = 'btnNuevaMision';
    nueva.onclick = function () { abrirMision(null); };
    var act = misionesVisibles('activo'), pau = misionesVisibles('pausado'), fin = misionesVisibles('terminado'), i;
    if (act.length + pau.length + fin.length === 0) {
      cont.appendChild(nodo('div', 'vacio', 'Una mision es un objetivo con hitos y tareas. KCO te dice cual es el proximo movimiento de cada una.'));
      cont.appendChild(nueva);
      return;
    }
    cont.appendChild(nueva);
    function grupo(titulo, lista, id) {
      if (lista.length === 0) { return; }
      var s = nodo('section', 'sec');
      s.id = id;
      var h = nodo('h3', 'sec-tit');
      h.appendChild(nodo('span', '', titulo));
      h.appendChild(nodo('b', 'mono', '' + lista.length));
      s.appendChild(h);
      for (i = 0; i < lista.length; i++) { s.appendChild(nodoMision(lista[i], false)); }
      cont.appendChild(s);
    }
    grupo('\uD83C\uDFAF ACTIVAS', act, 'secMisActivas');
    grupo('\u23F8 EN PAUSA', pau, 'secMisPausadas');
    grupo('\uD83C\uDFC1 CUMPLIDAS', fin, 'secMisCumplidas');
  }

  /* ---------- hoja de mision ---------- */

  var misionAbierta = null;
  var misBorradorCtx = 'trabajo';

  function abrirMision(id) {
    var p = id ? buscarProyecto(id) : null;
    if (id && !p) { return; }
    misionAbierta = p ? p.id : null;
    $('txtMisNombre').value = p ? p.nombre : '';
    $('txtMisObjetivo').value = p ? p.objetivo : '';
    misBorradorCtx = p ? p.contexto : ctxCaptura;
    $('txtHito').value = '';
    $('txtMisTarea').value = '';
    pintarHojaMision();
    abrirHoja('tapaMision');
  }

  function pintarHojaMision() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    $('misTitulo').textContent = p ? p.nombre : 'Nueva mision';
    pintarOpciones('gridMisCtx', K.CONTEXTOS, misBorradorCtx, function (c) { return c.ico + ' ' + c.nom; },
      function (c) {
        misBorradorCtx = c.id;
        if (p) { guardarDatosMision(); } else { pintarHojaMision(); }
      }, 'data-ctx');
    $('btnGuardarMision').style.display = p ? 'none' : 'block';
    $('cajaMisExistente').style.display = p ? 'block' : 'none';
    if (!p) { $('misSub').textContent = 'Nombre y objetivo. Los hitos y las tareas se agregan despues.'; return; }
    var pr = K.progresoProyecto(p, items);
    $('misSub').textContent = (p.estado === 'terminado' ? '\uD83C\uDFC1 Cumplida' : (p.estado === 'pausado' ? '\u23F8 En pausa' : '\uD83C\uDFAF Activa')) +
      ' \u00B7 ' + pr.pct + '% \u00B7 creada ' + (p.creado ? fechaNota(p.creado) : '');
    $('misPctTxt').textContent = pr.pct + '%';
    $('misPctBarra').style.width = pr.pct + '%';
    $('misPctDet').textContent = (pr.hitosTotal > 0 ? pr.hitosHechos + '/' + pr.hitosTotal + ' hitos \u00B7 ' : '') +
      pr.tareasHechas + '/' + pr.tareasTotal + ' tareas';

    var cp = $('misProxima');
    vaciar(cp);
    var px = p.estado === 'terminado' ? null : textoProxima(p);
    if (px) {
      var box = nodo('div', 'mis-proxbox');
      box.appendChild(nodo('div', 'mis-prox', px.txt));
      box.appendChild(nodo('div', 'mono motivo', px.motivo));
      if (px.accion.tipo === 'tarea') {
        var ap = accionPrincipal(px.accion.item);
        if (ap) {
          var b = nodo('button', 'bloque pri', ap.txt);
          b.type = 'button';
          b.setAttribute('data-mis', 'hecho');
          b.onclick = function () { ap.fn(); pintarHojaMision(); };
          box.appendChild(b);
        }
      } else if (px.accion.tipo === 'hito') {
        var bh = nodo('button', 'bloque pri', '\u2714 Hito cumplido');
        bh.type = 'button';
        bh.setAttribute('data-mis', 'hito');
        bh.onclick = function () { alternarHito(p.id, px.accion.hito.id); };
        box.appendChild(bh);
      }
      cp.appendChild(box);
    } else {
      cp.appendChild(nodo('div', 'sinnotas', p.estado === 'terminado'
        ? 'Mision cumplida.' : 'Sin proxima accion. Agrega una tarea o un hito abajo.'));
    }

    var lh = $('misHitos');
    vaciar(lh);
    if (p.hitos.length === 0) { lh.appendChild(nodo('div', 'sinnotas', 'Sin hitos. Un hito es algo que tiene que pasar: "QA aprobado", "Release".')); }
    var i;
    for (i = 0; i < p.hitos.length; i++) {
      (function (h) {
        var f = nodo('div', h.hecho ? 'paso hecho' : 'paso');
        var bt = nodo('button', 'tic', h.hecho ? '\u2611' : '\u2610');
        bt.type = 'button';
        bt.setAttribute('data-hito', h.id);
        bt.setAttribute('aria-label', h.hecho ? 'Desmarcar hito' : 'Marcar hito cumplido');
        bt.onclick = function () { alternarHito(p.id, h.id); };
        var d = nodo('div', 'd', h.texto + (h.hecho && h.cuando ? '  \u00B7 ' + fechaNota(h.cuando) : ''));
        var bx = nodo('button', 'equis', '\u2715');
        bx.type = 'button';
        bx.setAttribute('aria-label', 'Sacar hito');
        bx.onclick = function () { sacarHito(p.id, h.id); };
        f.appendChild(bt); f.appendChild(d); f.appendChild(bx);
        lh.appendChild(f);
      })(p.hitos[i]);
    }

    var lt = $('misTareas');
    vaciar(lt);
    var tareas = K.tareasDeProyecto(p.id, items), abiertas = [], cerradas = [];
    for (i = 0; i < tareas.length; i++) { (esActivo(tareas[i].estado) ? abiertas : cerradas).push(tareas[i]); }
    ordenar(abiertas);
    cerradas.sort(function (a, b) { return a.estadoDesde < b.estadoDesde ? 1 : -1; });
    for (i = 0; i < abiertas.length; i++) { lt.appendChild(nodoItem(abiertas[i], '')); }
    for (i = 0; i < cerradas.length && i < 15; i++) { lt.appendChild(nodoItem(cerradas[i], '')); }
    if (tareas.length === 0) { lt.appendChild(nodo('li', 'sinnotas', 'Sin tareas vinculadas.')); }

    $('btnMisPausa').style.display = p.estado === 'terminado' ? 'none' : 'block';
    $('btnMisPausa').textContent = p.estado === 'pausado' ? '\u25B6 Reactivar mision' : '\u23F8 Pausar mision';
    $('btnMisTerminar').textContent = p.estado === 'terminado' ? '\u21A9 Reabrir mision' : '\uD83C\uDFC1 Completar mision';
    $('btnMisTerminar').className = p.estado === 'terminado' ? 'bloque' : 'bloque pri';
  }

  function guardarDatosMision() {
    if (soloLectura) { return; }
    var nombre = limpiarTexto($('txtMisNombre').value, 120);
    if (nombre === '') { avisar('La mision necesita un nombre.'); return; }
    var ahora = new Date().toISOString();
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    if (p) {
      var antes = { n: p.nombre, o: p.objetivo, c: p.contexto };
      p.nombre = nombre;
      p.objetivo = $('txtMisObjetivo').value.replace(/^\s+|\s+$/g, '').slice(0, 600);
      p.contexto = misBorradorCtx;
      p.actualizado = ahora;
      if (!guardarProyectos()) { p.nombre = antes.n; p.objetivo = antes.o; p.contexto = antes.c; return; }
    } else {
      var n = K.normalizarProyecto({
        id: nuevoId('p'), nombre: nombre, objetivo: $('txtMisObjetivo').value, contexto: misBorradorCtx,
        estado: 'activo', hitos: [], creado: ahora, actualizado: ahora
      });
      proyectos.push(n);
      if (!guardarProyectos()) { proyectos.pop(); return; }
      misionAbierta = n.id;
      registrarMision('mision_alta', n, '');
    }
    pintarHojaMision();
    pintar();
  }

  function tocarMision(p) {
    p.actualizado = new Date().toISOString();
  }

  function alternarHito(pid, hid) {
    var p = buscarProyecto(pid);
    if (!p || soloLectura) { return; }
    var i, h = null;
    for (i = 0; i < p.hitos.length; i++) { if (p.hitos[i].id === hid) { h = p.hitos[i]; } }
    if (!h) { return; }
    h.hecho = !h.hecho;
    h.cuando = h.hecho ? new Date().toISOString() : '';
    tocarMision(p);
    if (!guardarProyectos()) { h.hecho = !h.hecho; return; }
    registrarMision(h.hecho ? 'hito' : 'hito_reabre', p, h.texto);
    pintarHojaMision();
    pintar();
    if (h.hecho) { celebrar('\uD83C\uDFAF Hito cumplido: ' + h.texto); }
  }

  function agregarHito() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    var t = limpiarTexto($('txtHito').value, 160);
    if (!p || soloLectura || t === '') { return; }
    if (p.hitos.length >= 100) { avisar('Una mision admite hasta 100 hitos.'); return; }
    p.hitos.push({ id: nuevoId('h'), texto: t, hecho: false, cuando: '' });
    tocarMision(p);
    if (!guardarProyectos()) { p.hitos.pop(); return; }
    $('txtHito').value = '';
    pintarHojaMision();
    pintar();
  }

  function sacarHito(pid, hid) {
    var p = buscarProyecto(pid);
    if (!p || soloLectura) { return; }
    var i, pos = -1;
    for (i = 0; i < p.hitos.length; i++) { if (p.hitos[i].id === hid) { pos = i; } }
    if (pos < 0) { return; }
    var copia = p.hitos[pos];
    p.hitos.splice(pos, 1);
    tocarMision(p);
    if (!guardarProyectos()) { p.hitos.splice(pos, 0, copia); return; }
    pintarHojaMision();
    pintar();
    ofrecerDeshacer('Hito sacado: ' + copia.texto, function () {
      var q = buscarProyecto(pid);
      if (!q || soloLectura) { return; }
      q.hitos.splice(pos > q.hitos.length ? q.hitos.length : pos, 0, copia);
      if (guardarProyectos()) { pintarHojaMision(); pintar(); }
    });
  }

  function agregarTareaMision() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    var t = $('txtMisTarea').value.replace(/^\s+|\s+$/g, '');
    if (!p || soloLectura || t === '') { return; }
    var it = itemNuevo(t, p.contexto, { estado: 'pendiente', proyectoId: p.id });
    items.push(it);
    if (!guardarItems()) { items.pop(); return; }
    registrar('captura', it, '', 'pendiente');
    tocarMision(p);
    guardarProyectos();
    $('txtMisTarea').value = '';
    pintarHojaMision();
    pintar();
  }

  function alternarPausaMision() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    if (!p || soloLectura || p.estado === 'terminado') { return; }
    p.estado = p.estado === 'pausado' ? 'activo' : 'pausado';
    tocarMision(p);
    if (!guardarProyectos()) { p.estado = p.estado === 'pausado' ? 'activo' : 'pausado'; return; }
    registrarMision(p.estado === 'pausado' ? 'mision_pausa' : 'mision_activa', p, '');
    pintarHojaMision();
    pintar();
  }

  function terminarMision() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    if (!p || soloLectura) { return; }
    if (p.estado === 'terminado') {
      p.estado = 'activo';
      p.terminado = '';
      tocarMision(p);
      if (guardarProyectos()) { registrarMision('mision_reabre', p, ''); pintarHojaMision(); pintar(); }
      return;
    }
    var abiertas = 0, t = K.tareasDeProyecto(p.id, items), i;
    for (i = 0; i < t.length; i++) { if (esActivo(t[i].estado)) { abiertas++; } }
    function cerrar() {
      var q = buscarProyecto(p.id);
      if (!q) { return; }
      q.estado = 'terminado';
      q.terminado = new Date().toISOString();
      tocarMision(q);
      if (!guardarProyectos()) { q.estado = 'activo'; q.terminado = ''; return; }
      registrarMision('mision_fin', q, '');
      pintarHojaMision();
      pintar();
      celebrar('\uD83C\uDFC1 Mision cumplida: ' + q.nombre);
    }
    if (abiertas > 0) {
      pedirConfirmacion('Completar mision', 'Quedan ' + abiertas + ' tareas abiertas en "' + p.nombre +
        '". Siguen como tareas normales, vinculadas a la mision cumplida.', cerrar);
    } else { cerrar(); }
  }

  function borrarMision() {
    var p = misionAbierta ? buscarProyecto(misionAbierta) : null;
    if (!p || soloLectura) { return; }
    pedirConfirmacion('Borrar mision', 'Se borra "' + p.nombre + '" con sus hitos. Las tareas no se borran: quedan sueltas, con su historial.', function () {
      var i, pos = -1;
      for (i = 0; i < proyectos.length; i++) { if (proyectos[i].id === p.id) { pos = i; } }
      if (pos < 0) { return; }
      proyectos.splice(pos, 1);
      if (!guardarProyectos()) { proyectos.splice(pos, 0, p); return; }
      var cambio = false;
      for (i = 0; i < items.length; i++) { if (items[i].proyectoId === p.id) { items[i].proyectoId = ''; cambio = true; } }
      if (cambio) { guardarItems(); }
      registrarMision('mision_baja', p, '');
      misionAbierta = null;
      cerrarHoja('tapaMision');
      pintar();
    });
  }

  function fijarProyecto(id, pid) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.proyectoId === pid) { return; }
    var previo = it.proyectoId;
    it.proyectoId = pid;
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { it.proyectoId = previo; return; }
    registrar('mision_tarea', it, buscarProyectoNombre(previo), buscarProyectoNombre(pid));
    var p = buscarProyecto(pid);
    if (p) { tocarMision(p); guardarProyectos(); }
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
  }

  function pintarMisionEnFicha(it) {
    var defs = [{ id: '', nom: 'Sin mision' }], i;
    for (i = 0; i < proyectos.length; i++) {
      var p = proyectos[i];
      if (p.estado !== 'terminado' || p.id === it.proyectoId) {
        defs.push({ id: p.id, nom: icoCtx(p.contexto) + ' ' + p.nombre });
      }
    }
    $('cajaMision').style.display = defs.length > 1 ? 'block' : 'none';
    pintarOpciones('gridMision', defs, it.proyectoId, function (d) { return d.nom; },
      function (d) { fijarProyecto(it.id, d.id); }, 'data-mision');
  }

  /* Aviso breve de logro: reusa la barra de deshacer sin accion. */
  function celebrar(texto) {
    $('qpaso').textContent = texto;
    $('btnDeshacer').style.display = 'none';
    revertir = null;
    huecoDeshacer(true);
    $('barraDeshacer').className = 'deshacer on celebra';
    if (relojDeshacer) { window.clearTimeout(relojDeshacer); }
    relojDeshacer = window.setTimeout(ocultarDeshacer, 4000);
  }

  /* ---------- rutinas ----------
     La definicion vive en kibco.rutinas. Cada dia que le toca se genera una
     ocurrencia: un item comun (tarea) con rutinaId y ocurrencia. Completarla,
     omitirla o delegarla la cierra y queda como historial; la siguiente es
     otro item. Nunca se reutiliza el mismo registro. */

  function normRutina(r) { return K.normalizarRutina(r, hoyClave()); }
  function guardarRutinas() { return soloLectura ? false : escribir(K_RUTINAS, JSON.stringify(rutinas)); }

  function buscarRutina(id) {
    var i;
    for (i = 0; i < rutinas.length; i++) { if (rutinas[i].id === id) { return rutinas[i]; } }
    return null;
  }

  var diaGenerado = '';

  function generarOcurrencias() {
    diaGenerado = hoyClave();
    if (soloLectura) { return false; }
    var plan = K.planificarOcurrencias(rutinas, items, diaGenerado);
    if (plan.crear.length === 0 && plan.vencer.length === 0) { return false; }
    var ahora = new Date().toISOString(), i, it, cerradas = [];
    for (i = 0; i < plan.vencer.length; i++) {
      it = buscarItem(plan.vencer[i]);
      if (!it) { continue; }
      cerradas.push({ it: it, estado: it.estado, desde: it.estadoDesde });
      it.estado = 'cancelado';
      it.motivo = 'vencida';
      it.estadoDesde = ahora;
      it.actualizado = ahora;
    }
    var nuevos = 0;
    for (i = 0; i < plan.crear.length; i++) {
      var r = plan.crear[i].rutina;
      items.push(itemNuevo(r.texto, r.contexto, {
        estado: 'pendiente', rutinaId: r.id, ocurrencia: plan.crear[i].fecha,
        nivel: r.nivel, proyectoId: r.proyectoId
      }));
      nuevos++;
    }
    if (!guardarItems()) {
      items.splice(items.length - nuevos, nuevos);
      for (i = 0; i < cerradas.length; i++) {
        cerradas[i].it.estado = cerradas[i].estado;
        cerradas[i].it.motivo = '';
        cerradas[i].it.estadoDesde = cerradas[i].desde;
      }
      return false;
    }
    return true;
  }

  /* Dias proximos: lo que la rutina va a pedir, mostrado sin crear nada. */
  function rutinasPrevistas(clave) {
    var r = [], i, j;
    for (i = 0; i < rutinas.length; i++) {
      var ru = rutinas[i];
      if (!ru.activa || (contexto !== 'todo' && ru.contexto !== contexto)) { continue; }
      if (!K.tocaEnDia(ru, clave)) { continue; }
      var ya = false;
      for (j = 0; j < items.length; j++) {
        if (items[j].rutinaId === ru.id && items[j].ocurrencia === clave) { ya = true; break; }
      }
      if (!ya) { r.push(ru); }
    }
    return r;
  }

  function nodoPrevista(ru) {
    var li = nodo('li', 'item prevista');
    li.setAttribute('data-rutina', ru.id);
    var cu = nodo('div', 'cuerpo');
    cu.appendChild(nodo('div', 'txt', ru.texto));
    var l2 = nodo('div', 'linea2');
    if (contexto === 'todo') { l2.appendChild(badge('ctx', icoCtx(ru.contexto))); }
    l2.appendChild(badge('rut', '\uD83D\uDD04 ' + K.describirRutina(ru)));
    l2.appendChild(badge('', 'previsto'));
    cu.appendChild(l2);
    li.appendChild(cu);
    li.onclick = function () { abrirRutina(ru.id); };
    return li;
  }

  function lineaRacha(ru) {
    var s = K.rachaRutina(ru, items, hoyClave());
    return s.actual > 0 ? '\uD83D\uDD25 ' + s.actual + (s.actual === 1 ? ' vez seguida' : ' seguidas') : K.describirRutina(ru);
  }

  /* Excepciones de una ocurrencia. Delegada cuenta como resuelta; omitida y no
     correspondia la cierran como cancelada con su motivo. Se puede deshacer. */
  function cerrarOcurrencia(id, motivo) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.rutinaId === '' || !MOTIVOS[motivo]) { return; }
    var foto = fotoDe(it), previo = it.estado, ahora = new Date().toISOString();
    it.estado = motivo === 'delegada' ? 'completado' : 'cancelado';
    it.motivo = motivo;
    it.estadoDesde = ahora;
    it.actualizado = ahora;
    if (!guardarItems()) { it.estado = previo; it.motivo = foto.motivo; return; }
    registrar('excepcion', it, previo, motivo);
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    ofrecerDeshacer(textoMotivo(motivo) + ': ' + it.texto, function () { restaurarFoto(id, foto, 'excepcion'); });
  }

  /* ---------- hoja de rutina ---------- */

  var borrador = null;
  var FRECUENCIAS = [
    { id: 'diaria', nom: 'Todos los dias' },
    { id: 'cadaN', nom: 'Cada X dias' },
    { id: 'semana', nom: 'Dias de la semana' },
    { id: 'mes', nom: 'Una vez por mes' }
  ];
  var ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0];
  var LETRAS_DIA = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

  function frecuenciaDe(b) {
    if (b.tipo === 'semana') { return 'semana'; }
    if (b.tipo === 'mes') { return 'mes'; }
    return b.cada > 1 ? 'cadaN' : 'diaria';
  }

  /* origenId: item del que salio la rutina ("Hacer recurrente"). */
  function abrirRutina(id, semilla, origenId) {
    var hoy = hoyClave();
    var r = id ? buscarRutina(id) : null;
    if (id && !r) { avisar('Esa rutina ya no existe. Su historial sigue en las tareas.'); return; }
    var base = r || normRutina({
      id: nuevoId('r'), texto: semilla && semilla.texto ? semilla.texto : 'x',
      contexto: semilla && semilla.contexto ? semilla.contexto : ctxCaptura,
      nivel: semilla && semilla.nivel ? semilla.nivel : 'normal', inicio: hoy
    });
    borrador = JSON.parse(JSON.stringify(base));
    borrador.esNueva = !r;
    borrador.origenId = origenId || '';
    if (!r && !(semilla && semilla.texto)) { borrador.texto = ''; }
    $('txtRutina').value = borrador.texto;
    $('rutInicio').value = borrador.inicio;
    $('rutFin').value = borrador.fin;
    $('numCada').value = '' + borrador.cada;
    $('numDiaMes').value = '' + borrador.diaMes;
    pintarHojaRutina();
    abrirHoja('tapaRutina');
  }

  function pintarHojaRutina() {
    var b = borrador;
    if (!b) { return; }
    $('rutTitulo').textContent = b.esNueva ? 'Nueva rutina' : 'Rutina';
    var f = frecuenciaDe(b);
    pintarOpciones('gridFrec', FRECUENCIAS, f, function (x) { return x.nom; }, function (x) {
      leerCamposRutina();
      if (x.id === 'diaria') { b.tipo = 'dias'; b.cada = 1; }
      if (x.id === 'cadaN') { b.tipo = 'dias'; b.cada = b.cada > 1 ? b.cada : 2; }
      if (x.id === 'semana') { b.tipo = 'semana'; b.cada = 1; if (b.dias.length === 0) { b.dias = [K.diaSemana(b.inicio)]; } }
      if (x.id === 'mes') { b.tipo = 'mes'; b.cada = 1; }
      pintarHojaRutina();
    }, 'data-frec');
    $('cajaCada').style.display = f === 'diaria' ? 'none' : 'block';
    $('rotCada').textContent = f === 'mes' ? 'Cada cuantos meses' : (f === 'semana' ? 'Cada cuantas semanas' : 'Cada cuantos dias');
    $('numCada').value = '' + b.cada;
    $('cajaSemana').style.display = f === 'semana' ? 'block' : 'none';
    $('cajaMes').style.display = f === 'mes' ? 'block' : 'none';
    $('numDiaMes').value = '' + b.diaMes;
    var gs = $('gridSemana'), i;
    vaciar(gs);
    for (i = 0; i < ORDEN_SEMANA.length; i++) {
      (function (d) {
        var on = b.dias.indexOf(d) > -1;
        var bt = nodo('button', on ? 'diab on' : 'diab', LETRAS_DIA[d]);
        bt.type = 'button';
        bt.setAttribute('data-dow', '' + d);
        bt.setAttribute('aria-pressed', on ? 'true' : 'false');
        bt.onclick = function () {
          leerCamposRutina();
          var p = b.dias.indexOf(d);
          if (p > -1) { b.dias.splice(p, 1); } else { b.dias.push(d); b.dias.sort(); }
          pintarHojaRutina();
        };
        gs.appendChild(bt);
      })(ORDEN_SEMANA[i]);
    }
    pintarOpciones('gridRutCtx', K.CONTEXTOS, b.contexto, function (c) { return c.ico + ' ' + c.nom; },
      function (c) { leerCamposRutina(); b.contexto = c.id; pintarHojaRutina(); }, 'data-ctx');
    pintarOpciones('gridRutNivel', K.NIVELES, b.nivel, function (n) { return n.ico + ' ' + n.nom; },
      function (n) { leerCamposRutina(); b.nivel = n.id; pintarHojaRutina(); }, 'data-nivel');
    var prueba = normRutina(b);
    var prox = prueba ? K.proximaFecha(prueba, hoyClave()) : '';
    $('rutProxima').textContent = prueba
      ? K.describirRutina(prueba) + (prox ? ' \u00B7 proxima: ' + nombreDia(prox) : ' \u00B7 no le toca mas')
      : 'Escribi que hay que hacer.';

    var existente = !b.esNueva;
    $('cajaRutExistente').style.display = existente ? 'block' : 'none';
    if (existente) {
      var ru = buscarRutina(b.id);
      var st = K.rachaRutina(ru, items, hoyClave());
      $('rutRacha').textContent = '\uD83D\uDD25 racha ' + st.actual + ' \u00B7 mejor ' + st.mejor + ' \u00B7 ' +
        st.hechas + ' hechas de ' + st.total;
      pintarHistorialRutina(ru);
      $('btnPausarRutina').textContent = ru.activa ? '\u23F8 Pausar rutina' : '\u25B6 Reactivar rutina';
      $('rutSub').textContent = ru.activa ? 'Activa' : 'En pausa: no genera ocurrencias';
    } else {
      $('rutSub').textContent = b.origenId ? 'Sale de una tarea: esa tarea pasa a ser la de hoy si le toca.' : '';
    }
  }

  function simboloOcurrencia(it) {
    if (it.motivo === 'delegada') { return '\uD83E\uDD1D'; }
    if (K.esHecho(it.estado)) { return '\u2705'; }
    if (it.motivo === 'no_corresponde') { return '\u2796'; }
    if (it.motivo === 'omitida') { return '\u23ED'; }
    if (it.motivo === 'vencida') { return '\u231B'; }
    if (it.estado === 'cancelado') { return '\u274C'; }
    return '\u25CB';
  }

  function pintarHistorialRutina(ru) {
    var cont = $('rutHistorial');
    vaciar(cont);
    var occ = K.ocurrenciasDe(ru.id, items);
    occ.sort(function (a, b) { return a.ocurrencia < b.ocurrencia ? 1 : -1; });
    if (occ.length === 0) { cont.appendChild(nodo('div', 'sinnotas', 'Todavia no hay ocurrencias.')); return; }
    var i;
    for (i = 0; i < occ.length && i < 21; i++) {
      (function (it) {
        var f = nodo('button', 'histo');
        f.type = 'button';
        var p = it.ocurrencia.split('-');
        f.appendChild(nodo('span', 'mono h', p[2] + '/' + p[1]));
        f.appendChild(nodo('span', 's', simboloOcurrencia(it)));
        f.appendChild(nodo('span', 'd', it.motivo ? textoMotivo(it.motivo) : estadoInfo(it.estado).nom));
        f.onclick = function () { cerrarHoja('tapaRutina'); abrirItem(it.id); };
        cont.appendChild(f);
      })(occ[i]);
    }
  }

  function leerCamposRutina() {
    var b = borrador;
    b.texto = $('txtRutina').value;
    b.cada = parseInt($('numCada').value, 10) || 1;
    if (frecuenciaDe(b) === 'cadaN' && b.cada < 2) { b.cada = 2; }
    b.diaMes = parseInt($('numDiaMes').value, 10) || 1;
    b.inicio = $('rutInicio').value;
    b.fin = $('rutFin').value;
  }

  function guardarRutina() {
    if (soloLectura || !borrador) { return; }
    leerCamposRutina();
    var b = borrador;
    if (b.tipo === 'semana' && b.dias.length === 0) { avisar('Elegi al menos un dia de la semana.'); return; }
    if (b.fin !== '' && K.esClave(b.fin) && K.esClave(b.inicio) && b.fin < b.inicio) {
      avisar('La fecha de fin es anterior al inicio.');
      return;
    }
    var ahora = new Date().toISOString();
    var previo = buscarRutina(b.id);
    var r = normRutina({
      id: b.id, texto: b.texto, contexto: b.contexto, nivel: b.nivel, tipo: b.tipo, cada: b.cada,
      dias: b.dias, diaMes: b.diaMes, inicio: b.inicio, fin: b.fin,
      activa: previo ? previo.activa : true, proyectoId: b.proyectoId || '',
      creado: previo ? previo.creado : ahora, actualizado: ahora
    });
    if (!r) { avisar('Escribi que hay que hacer.'); return; }
    var copia = rutinas.slice(0), i;
    if (previo) {
      for (i = 0; i < rutinas.length; i++) { if (rutinas[i].id === r.id) { rutinas[i] = r; } }
    } else { rutinas.push(r); }
    if (!guardarRutinas()) { rutinas = copia; return; }
    /* Lo abierto se alinea con la definicion; lo cerrado es historia y no se toca. */
    var cambio = false;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.rutinaId !== r.id || !esActivo(it.estado)) { continue; }
      it.texto = r.texto; it.contexto = r.contexto; it.nivel = r.nivel; it.prioridad = r.nivel === 'urgente';
      cambio = true;
    }
    if (b.origenId) {
      var o = buscarItem(b.origenId), due = K.ultimaFecha(r, hoyClave());
      if (o && esActivo(o.estado) && o.rutinaId === '' && due === hoyClave()) {
        o.rutinaId = r.id; o.ocurrencia = due; o.texto = r.texto;
        if (o.estado === 'entrada') { o.estado = 'pendiente'; }
        cambio = true;
      }
    }
    if (cambio) { guardarItems(); }
    registrarRutina(previo ? 'rutina_edit' : 'rutina_alta', r);
    generarOcurrencias();
    cerrarHoja('tapaRutina');
    borrador = null;
    pintar();
    if ($('tapaRutinas').className === 'tapa on') { pintarListaRutinas(); }
  }

  function registrarRutina(tipo, r) {
    if (soloLectura) { return; }
    eventos.push({
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo, itemId: r.id,
      texto: r.texto, contexto: r.contexto, desde: '', hasta: K.describirRutina(r)
    });
    guardarEventos();
  }

  function alternarRutinaActiva() {
    var r = borrador ? buscarRutina(borrador.id) : null;
    if (!r || soloLectura) { return; }
    r.activa = !r.activa;
    r.actualizado = new Date().toISOString();
    if (!guardarRutinas()) { r.activa = !r.activa; return; }
    registrarRutina(r.activa ? 'rutina_activa' : 'rutina_pausa', r);
    if (r.activa) { generarOcurrencias(); }
    pintarHojaRutina();
    pintar();
  }

  function borrarRutina() {
    var r = borrador ? buscarRutina(borrador.id) : null;
    if (!r || soloLectura) { return; }
    pedirConfirmacion('Borrar rutina', 'Se borra la definicion de "' + r.texto +
      '". Las ocurrencias que ya pasaron quedan en el historial, y la de hoy, si esta abierta, queda como tarea comun.',
      function () {
        var i, pos = -1;
        for (i = 0; i < rutinas.length; i++) { if (rutinas[i].id === r.id) { pos = i; } }
        if (pos < 0) { return; }
        rutinas.splice(pos, 1);
        if (!guardarRutinas()) { rutinas.splice(pos, 0, r); return; }
        registrarRutina('rutina_baja', r);
        borrador = null;
        cerrarHoja('tapaRutina');
        pintar();
        if ($('tapaRutinas').className === 'tapa on') { pintarListaRutinas(); }
      });
  }

  function pintarListaRutinas() {
    var cont = $('listaRutinas');
    vaciar(cont);
    if (rutinas.length === 0) {
      cont.appendChild(nodo('div', 'vacio chico', 'Sin rutinas. Una rutina genera su tarea sola cada vez que toca y guarda el historial.'));
      return;
    }
    var orden = rutinas.slice(0), i;
    orden.sort(function (a, b) {
      if (a.activa !== b.activa) { return a.activa ? -1 : 1; }
      return a.texto.toLowerCase() < b.texto.toLowerCase() ? -1 : 1;
    });
    for (i = 0; i < orden.length; i++) {
      (function (ru) {
        var li = nodo('li', 'item' + (ru.activa ? '' : ' st-cancelado'));
        li.setAttribute('data-rutina', ru.id);
        var cu = nodo('div', 'cuerpo');
        cu.appendChild(nodo('div', 'txt', ru.texto));
        var l2 = nodo('div', 'linea2');
        l2.appendChild(badge('ctx', icoCtx(ru.contexto)));
        l2.appendChild(badge('rut', K.describirRutina(ru)));
        var st = K.rachaRutina(ru, items, hoyClave());
        if (st.actual > 0) { l2.appendChild(badge('racha', '\uD83D\uDD25 ' + st.actual)); }
        if (!ru.activa) { l2.appendChild(badge('pausa', '\u23F8 EN PAUSA')); }
        else {
          var px = K.proximaFecha(ru, hoyClave());
          if (px) { l2.appendChild(badge('', 'prox ' + nombreDia(px))); }
        }
        cu.appendChild(l2);
        li.appendChild(cu);
        li.onclick = function () { abrirRutina(ru.id); };
        cont.appendChild(li);
      })(orden[i]);
    }
  }

  function abrirListaRutinas() {
    pintarListaRutinas();
    abrirHoja('tapaRutinas');
  }

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
  rutinas = cargarLista(K_RUTINAS, normRutina);
  proyectos = cargarLista(K_PROYECTOS, K.normalizarProyecto);
  cargarCatalogos();
  aplicarMigracion4();
  generarOcurrencias();
  filtro = leer(K_FILTRO) || 'activos';
  filtroCompra = leer(K_FILTROC) || 'activos';
  filtroTag = leer(K_FILTROTAG) || '';
  modoLuz = leer(K_LUZ) === '1';
  /* KCO siempre abre en AHORA: la pregunta al abrir es "que hago ahora",
     no "en que pestaña me quede". */
  vista = 'ahora';
  var cc = leer(K_CTXCAP);
  ctxCaptura = K.contextoValido(cc) ? cc : 'trabajo';
  aplicarContexto(leer(K_CTX) || 'todo', false);
  pintarFirma();

  if (typeof window.setInterval === 'function') {
    window.setInterval(function () {
      chequearRecordatorios();
      /* Paso la medianoche con la app abierta: tocan las rutinas del dia nuevo. */
      if (hoyClave() !== diaGenerado) {
        generarOcurrencias();
        if (pilaCapas.length === 0) { pintar(); }
      }
    }, 30000);
  }

  window.onpopstate = function () { alVolverAtras(); };

  conectarSwipe(document.getElementsByTagName('main')[0], swipeVistas);
  conectarSwipe(document.getElementsByTagName('header')[0], swipeContexto);


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
