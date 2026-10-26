/* KCO — Centro Operativo Personal — interfaz y persistencia. ES5 estricto. */
(function () {
  'use strict';

  var K = window.KCOCore;
  var VERSION_APP = '2.1.0';
  /* Esquema 5 (2.2.0): los contextos pasan a ser apartados del usuario
     (kibco.apartados). Subirlo sin motivo rompe la compatibilidad de backups. */
  var ESQUEMA = 5;
  var HORAS_ALERTA_ENTREGA = 48;
  var DIAS_AVISO_BACKUP = 14;
  var LARGO_CAMPO = 60;
  var TOPE_CATALOGO = 200;

  var K_CTX = 'kibco.contexto';
  var K_ITEMS = 'kibco.items';
  var K_EVENTOS = 'kibco.eventos';
  /* Ultimo recurso: solo si una escritura del registro falla (almacenamiento
     lleno) se compacta lo viejo (KCOCore.compactarEventos) sin cambiar ninguna
     vista derivada. Nunca se compacta de forma preventiva: no se pierde historia. */
  var VENTANA_EVENTOS_DIAS = 180;
  var AVISO_REGISTRO = 'No se pudo guardar el registro: almacenamiento lleno. Export\u00E1 un backup.';
  var K_ESQUEMA = 'kibco.esquema';
  /* Registro de apartados (KCOCore.normalizarApartados). */
  var K_APARTADOS = 'kibco.apartados';
  var K_FILTRO = 'kibco.filtro';
  var K_FILTROC = 'kibco.filtroCompra';
  var K_FILTROTAG = 'kibco.filtroTag';
  var K_LUZ = 'kibco.luz';
  /* Preferencia de tema: la lee y aplica tema.js en <head>; aca solo se elige y guarda. */
  var K_TEMA = 'kibco.tema';
  var K_BACKUP = 'kibco.ultimoBackup';
  var K_SOLIC = 'kibco.solicitantes';
  var K_DEST = 'kibco.destinos';
  var K_CTXCAP = 'kibco.contextoCaptura';
  var K_RUTINAS = 'kibco.rutinas';
  var rutinas = [];
  var K_PROYECTOS = 'kibco.proyectos';
  var proyectos = [];
  /* Memoria del progreso: que nivel ya se celebro y que logros se desbloquearon.
     El XP en si no se guarda: se recalcula siempre desde los datos. */
  var K_PROGRESO = 'kibco.progreso';
  var memProgreso = { nivelVisto: 1, logros: {} };
  /* progresoNuevo: hay que sembrarlo en silencio (primera vez o guardado roto).
     progresoSinCopia: el guardado esta roto y no se pudo copiar; no se pisa. */
  var progresoNuevo = false;
  var progresoSinCopia = false;

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

  /* Los tags son de cada apartado (KCOCore.tagsDe). tagInfo busca en todos
     los apartados, asi un tag viejo sigue mostrandose aunque ya no se ofrezca
     en ese contexto y se puede sacar, igual que siempre. */

  var RANGOS = [
    { id: 'hoy', nom: 'Hoy', dias: 1 },
    { id: 'd7', nom: '7 dias', dias: 7 },
    { id: 'd30', nom: '30 dias', dias: 30 },
    { id: 'todo', nom: 'Todo', dias: 0 }
  ];

  var CERRADOS = { completado: 1, cancelado: 1, recibido: 1, comprado: 1 };

  var items = [];
  var eventos = [];
  /* Se fijan al arrancar, ya con el registro de apartados cargado. */
  var contexto = 'todo';
  /* Donde cae lo que se captura mirando 'Todo': el ultimo contexto elegido. */
  var ctxCaptura = '';
  /* Destino elegido con el chip de la barra para la captura en curso ('' = el
     de la vista). Vale para una sola captura: guardar o cambiar de vista lo limpia. */
  var ctxDestino = '';
  var filtro = 'activos';
  var filtroCompra = 'activos';
  var filtroTag = '';
  var modoLuz = false;
  var vista = 'ahora';
  var rango = 'd7';
  /* DIARIO tiene tres lecturas del mismo historial: curada, cruda y campaña. */
  var modoDiario = 'diario';
  var soloLectura = false;
  /* Solo lectura porque los datos son de una version mas nueva: ahi tampoco
     se restaura, porque pisaria datos que esta version no entiende. */
  var esquemaFuturo = false;
  var migrarComprasHogar = false;
  /* Desde que esquema se sembraron los apartados de siempre ('' = no se sembro). */
  var apartadosSembradosDesde = '';
  /* Instalacion nueva sin apartados guardados: la primera corrida ofrece
     plantillas (T07). Ver cargarApartados. */
  var necesitaPlantillas = false;
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

  /* silencioso: quien llama decide el aviso (p. ej. reintenta antes de avisar). */
  function escribir(clave, valor, silencioso) {
    try {
      window.localStorage.setItem(clave, valor);
      return true;
    } catch (e) {
      if (!silencioso) { avisar('No se pudo guardar. Puede estar lleno el almacenamiento del navegador.'); }
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

  function nuevoId(p) { return K.nuevoId(p); }

  function listaEstados(tipo, ctx) {
    if (tipo !== 'compra') { return ESTADOS_TAREA; }
    return K.esFabrica(ctx) ? ESTADOS_COMPRA : ESTADOS_COMPRA_HOGAR;
  }

  function listaTags(ctx) {
    var r = [], i;
    if (ctx === 'todo') { return K.todosTags(); }
    /* Cada tag con el nombre de este apartado, aunque otro apartado use el
       mismo id con otro nombre. */
    var propios = K.tagsDe(ctx);
    for (i = 0; i < propios.length; i++) {
      var t = tagInfo(propios[i].id, ctx);
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

  /* Con ctx, el tag como lo nombra ese apartado; si no, el del catalogo. */
  function tagInfo(id, ctx) { return K.infoTag(id, ctx); }

  /* Los ids de estado de un evento vienen de datos importados: se consulta el
     mapa sin pasar por el prototipo ('constructor' no es un estado cerrado). */
  function esCerradoId(x) { return Object.prototype.hasOwnProperty.call(CERRADOS, x); }

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
    if (soloLectura) { return false; }
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
    if (soloLectura) { return false; }
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
    if (tag !== '' && !tagInfo(tag, ctx)) { tag = ''; }
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

  /* Copia intacta de un valor que no se puede leer, en <clave>.roto.<ts>. Una sola
     copia por valor distinto: recargar con el mismo dato roto no llena el almacenamiento. */
  function ponerEnCuarentena(clave, crudo) {
    var pre = clave + '.roto.', i, k;
    try {
      for (i = 0; i < window.localStorage.length; i++) {
        k = window.localStorage.key(i);
        if (k && k.indexOf(pre) === 0 && window.localStorage.getItem(k) === crudo) { return true; }
      }
    } catch (e) { /* sin acceso para listar: se intenta la copia igual */ }
    return escribir(pre + Date.now(), crudo);
  }

  function cargarLista(clave, normalizador) {
    var crudo = leer(clave);
    if (crudo === null || crudo === '') { return []; }
    var datos = null;
    try { datos = JSON.parse(crudo); } catch (e) { datos = null; }
    if (!esArray(datos)) {
      ponerEnCuarentena(clave, crudo);
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

  /* Hay datos de antes si alguna lista guardada tiene algo (aunque este rota). */
  function hayDatos() {
    var claves = [K_ITEMS, K_EVENTOS, K_RUTINAS, K_PROYECTOS], i, v;
    for (i = 0; i < claves.length; i++) {
      v = leer(claves[i]);
      if (v !== null && v !== '' && v !== '[]') { return true; }
    }
    return false;
  }

  function migrar() {
    var v = leer(K_ESQUEMA);
    var n = v === null ? ESQUEMA : parseInt(v, 10);
    if (isNaN(n)) {
      soloLectura = true;
      avisar('El esquema de datos guardado no se entiende. No escribo nada.');
      return;
    }
    if (n > ESQUEMA) {
      soloLectura = true;
      esquemaFuturo = true;
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
      migrarComprasHogar = n < 4;
    }
    /* 4 -> 5: los contextos pasan a ser apartados del usuario. Con datos de
       antes (o un esquema viejo) y sin kibco.apartados se siembran los cinco
       de siempre, con los mismos ids, colores, tags y modo de compras: ningun
       item cambia. Sin datos ni esquema es una instalacion nueva: no se siembra. */
    if (leer(K_APARTADOS) === null && (n < 5 || hayDatos()) &&
        escribir(K_APARTADOS, JSON.stringify(K.apartadosLegado()))) {
      apartadosSembradosDesde = v === null ? 'sin esquema' : 'esquema ' + n;
    }
    if (v === null || n < ESQUEMA) { escribir(K_ESQUEMA, '' + ESQUEMA); }
  }

  /* Registro de apartados. Lectura con cuarentena igual que las listas.
     Sin apartados activos (instalacion nueva) queda necesitaPlantillas para que
     la primera corrida ofrezca plantillas (T07).
     PUENTE TEMPORAL hasta T07: mientras no exista el selector de plantillas, un
     registro vacio se completa con los apartados de siempre SOLO en memoria (no
     se guarda nada), asi la app sigue usable. T07 reemplaza este puente. */
  function cargarApartados() {
    K.fijarApartados(cargarLista(K_APARTADOS, K.normalizarApartado));
    necesitaPlantillas = false;
    if (K.apartados().length === 0) {
      necesitaPlantillas = !soloLectura;
      K.fijarApartados(K.apartadosLegado());
    }
  }

  function guardarApartados() {
    if (soloLectura || necesitaPlantillas) { return false; }
    return escribir(K_APARTADOS, JSON.stringify(K.todosApartados()));
  }

  /* Deja constancia en el registro de la siembra de apartados (necesita los
     eventos ya cargados, por eso corre despues de migrar). */
  function aplicarMigracion5() {
    if (apartadosSembradosDesde === '' || soloLectura) { return; }
    anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'migracion', itemId: '',
      texto: 'Apartados creados a partir de los 5 contextos de siempre',
      contexto: K.normalizarContexto(''), desde: apartadosSembradosDesde, hasta: 'esquema 5'
    }]);
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
    anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'migracion', itemId: '',
      texto: cambiados + ' compras de Hogar pasadas a la lista simple',
      contexto: 'hogar', desde: 'esquema 3', hasta: 'esquema 4'
    }]);
  }

  function guardarItems() { return soloLectura ? false : escribir(K_ITEMS, JSON.stringify(items)); }

  function corteEventos() {
    var d = new Date();
    d.setDate(d.getDate() - VENTANA_EVENTOS_DIAS);
    return d.toISOString();
  }

  /* Guarda el registro. Si la escritura falla, compacta lo viejo y reintenta
     una sola vez. La memoria solo toma la version
     compactada si quedo guardada: memoria y almacenamiento dicen lo mismo. */
  function guardarEventos() {
    if (soloLectura) { return false; }
    var lista = eventos;
    if (escribir(K_EVENTOS, JSON.stringify(lista), true)) { eventos = lista; return true; }
    if (lista === eventos) {
      lista = K.compactarEventos(eventos, corteEventos());
      if (lista.length < eventos.length && escribir(K_EVENTOS, JSON.stringify(lista), true)) {
        eventos = lista;
        return true;
      }
    }
    avisar(AVISO_REGISTRO);
    return false;
  }

  /* Agrega eventos y los guarda. Si no se pueden guardar, salen de memoria (el
     cambio del item ya guardado se queda: el aviso dice que falto el registro). */
  function anotarEventos(nuevos) {
    if (soloLectura || nuevos.length === 0) { return false; }
    var i;
    for (i = 0; i < nuevos.length; i++) { eventos.push(nuevos[i]); }
    if (guardarEventos()) { return true; }
    eventos.splice(eventos.length - nuevos.length, nuevos.length);
    return false;
  }

  function registrar(tipo, item, desde, hasta) {
    if (soloLectura) { return false; }
    return anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo,
      itemId: item.id, texto: item.texto, contexto: item.contexto,
      desde: desde || '', hasta: hasta || ''
    }]);
  }

  function buscarItem(id) {
    var i;
    for (i = 0; i < items.length; i++) { if (items[i].id === id) { return items[i]; } }
    return null;
  }

  /* La deteccion de hora, dia, contexto y prioridad al tipear vive en
     KCOCore.parsearCaptura, con sus pruebas. */

  function fijarRecordatorio(it, d) {
    var antes = copiaItem(it);
    it.recordatorio = d.toISOString();
    it.recAvisado = false;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('recordatorio', it, '', horaCorta(it.recordatorio));
      pintar();
      pintarHojaItem();
    } else { reponerItem(it, antes); }
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
    vaciar(caja);
    conIcono(caja, 'clock', 'Vencido: ' + partes.join(' \u00B7 ') +
      (vencidos.length > 4 ? ' (+' + (vencidos.length - 4) + ')' : ''));
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
    var it = itemNuevo(p.texto, destinoCaptura(p), {
      recordatorio: p.recordatorio, fecha: p.fecha, nivel: p.nivel || 'normal'
    });
    items.push(it);
    if (guardarItems()) {
      registrar('captura', it, '', 'entrada');
      if (it.recordatorio !== '') { registrar('recordatorio', it, '', horaCorta(it.recordatorio)); }
      $('txtCaptura').value = '';
      ctxDestino = '';
      pintarChipsCaptura();
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
    var foto = fotoDe(it), antes = copiaItem(it);
    var xpAntes = xpTotal();
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
      })(id, foto, estadoInfo(nuevo).nom + ': ' + it.texto + feedbackProgreso(xpAntes));
    } else {
      reponerItem(it, antes);
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
    return c ? c.nom : '' + id;
  }

  /* Emoji para textos exportados: el icono de un apartado es un nombre de
     iconos.js (SVG), que no sirve en texto plano; el nucleo lo traduce. */
  function icoCtx(id) {
    return id === 'todo' ? '\u2B50' : K.emojiApartado(id);
  }

  /* Identidad visual de un contexto en la interfaz: un punto de su color
     (kco.css, --ctx-*). El emoji queda solo en textos que se exportan. */
  function punto(id) {
    var s = document.createElement('span');
    s.className = 'punto p-' + id;
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  function badgeCtx(id) {
    var b = badge('ctx', '');
    b.appendChild(punto(id));
    b.appendChild(document.createTextNode(nomCtx(id)));
    return b;
  }

  /* Abiertos por contexto ('todo' = todos), para el selector y la barra lateral. */
  function cuentasPorContexto() {
    var r = { todo: 0 }, i, c;
    for (i = 0; i < K.CONTEXTOS.length; i++) { r[K.CONTEXTOS[i].id] = 0; }
    for (i = 0; i < items.length; i++) {
      if (!esActivo(items[i].estado)) { continue; }
      c = items[i].contexto;
      r.todo++;
      if (r.hasOwnProperty(c)) { r[c]++; }
    }
    return r;
  }

  function filaContexto(id, enHoja) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctxfila';
    b.setAttribute('data-ctx', id);
    b.appendChild(punto(id));
    b.appendChild(nodo('span', 'ctxfila-nom', nomCtx(id)));
    b.appendChild(nodo('span', 'ctxfila-n', '0'));
    b.appendChild(svgIco('check', 'ctxfila-ok'));
    b.onclick = function () {
      if (enHoja) { cerrarHoja('tapaCtx'); }
      aplicarContexto(id, true);
    };
    return b;
  }

  /* Las filas se arman una vez y despues solo se actualizan: repintar no le
     saca el foco de teclado al boton que se acaba de usar. */
  function filasContexto(cont, defs, n, enHoja) {
    var i, b, id, on, ids = [];
    /* Las filas se arman de nuevo solo si cambio el registro de apartados. */
    for (i = 0; i < defs.length; i++) { ids.push(defs[i].id); }
    if (cont.getAttribute('data-ids') !== ids.join(',')) {
      while (cont.firstChild) { cont.removeChild(cont.firstChild); }
      for (i = 0; i < defs.length; i++) { cont.appendChild(filaContexto(defs[i].id, enHoja)); }
      cont.setAttribute('data-ids', ids.join(','));
    }
    for (b = cont.firstChild; b; b = b.nextSibling) {
      id = b.getAttribute('data-ctx');
      on = id === contexto;
      b.className = on ? 'ctxfila on' : 'ctxfila';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.getElementsByTagName('span')[2].textContent = '' + (n[id] || 0);
    }
  }

  /* Selector de contexto: hoja en movil (#ctxsel, se abre desde el chip de la
     barra superior), lista en la barra lateral de escritorio (#ctxLateral). */
  function pintarSelectorContexto() {
    var defs = [{ id: 'todo' }].concat(K.CONTEXTOS), n = cuentasPorContexto();
    filasContexto($('ctxsel'), defs, n, true);
    filasContexto($('ctxLateral'), defs, n, false);
    $('ctxPunto').className = 'punto p-' + contexto;
    $('ctxNombre').textContent = nomCtx(contexto);
  }

  function abrirSelectorContexto() {
    pintarSelectorContexto();
    abrirHoja('tapaCtx');
    var b = $('ctxsel').getElementsByClassName('on')[0];
    if (b && b.focus) { try { b.focus(); } catch (e) {} }
  }

  function pintarPistaCaptura() {
    var inp = $('txtCaptura');
    if (inp) {
      inp.setAttribute('placeholder', 'Capturar en ' + nomCtx(ctxCaptura) + ' \u00B7 Enter guarda');
    }
  }

  /* ---------- chips de la barra de captura ----------
     Al tipear se muestra lo que se va a guardar: contexto destino, dia y
     prioridad. Sale de KCOCore.resumenCaptura, el mismo parser que capturar(). */

  /* Una #etiqueta tipeada gana; si no, el chip elegido; si no, la vista. */
  function destinoCaptura(p) { return p.contexto || ctxDestino || ctxCaptura; }

  function chipDato(el, texto, ico) {
    vaciar(el);
    el.hidden = texto === '';
    if (texto !== '') { conIcono(el, ico, texto); }
  }

  function pintarChipsCaptura() {
    var inp = $('txtCaptura'), caja = $('capChips'), raiz = document.documentElement;
    if (!inp || !caja) { return; }
    var crudo = inp.value.replace(/^\s+|\s+$/g, '');
    var hay = crudo !== '' || ctxDestino !== '';
    caja.hidden = !hay;
    /* La barra crece: el contenido deja libre ese alto extra (kco.css). */
    if (hay) { raiz.setAttribute('data-capchips', '1'); } else { raiz.removeAttribute('data-capchips'); }
    if (!hay) { ajustarAltoCaptura(); return; }
    var r = K.resumenCaptura(crudo, new Date()), ctx = destinoCaptura(r), b = $('capCtx');
    vaciar(b);
    b.appendChild(punto(ctx));
    b.appendChild(nodo('span', 'capchip-nom', nomCtx(ctx)));
    b.appendChild(svgIco('chevron-down', 'capchip-chev'));
    b.setAttribute('aria-label', 'Guardar en ' + nomCtx(ctx) + '. Cambiar');
    chipDato($('capDia'), r.dia, r.recordatorio !== '' ? 'clock' : 'calendar');
    chipDato($('capNivel'), r.nivel ? K.infoNivel(r.nivel).nom : '', 'flag');
    $('capNivel').className = r.nivel === 'urgente' ? 'capchip rojo' : 'capchip';
    ajustarAltoCaptura();
  }

  /* Los chips pueden ocupar dos filas en pantallas angostas (Ma\u00F1ana 09:30 +
     prioridad + un contexto largo): --capbar-h toma el alto medido de la barra
     para que el contenido y el deshacer no queden tapados. Sin chips vuelve al
     valor de kco.css. */
  function ajustarAltoCaptura() {
    var raiz = document.documentElement, barra = document.querySelector('.captura'), h;
    if (!raiz.style || typeof raiz.style.setProperty !== 'function') { return; }
    if (!barra || !raiz.hasAttribute('data-capchips')) { raiz.style.removeProperty('--capbar-h'); return; }
    h = Math.ceil(barra.getBoundingClientRect().height);
    if (h > 0) { raiz.style.setProperty('--capbar-h', h + 'px'); }
  }

  function filaDestino(id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctxfila';
    b.setAttribute('data-ctx', id);
    b.appendChild(punto(id));
    b.appendChild(nodo('span', 'ctxfila-nom', nomCtx(id)));
    b.appendChild(svgIco('check', 'ctxfila-ok'));
    b.onclick = function () { elegirDestino(id); };
    return b;
  }

  /* Hoja "Guardar en": los cinco contextos (Todo no es un destino). */
  function abrirDestinoCaptura() {
    var cont = $('destsel'), i, b, on;
    var actual = destinoCaptura(K.parsearCaptura($('txtCaptura').value, new Date()));
    if (!cont.firstChild) {
      for (i = 0; i < K.CONTEXTOS.length; i++) { cont.appendChild(filaDestino(K.CONTEXTOS[i].id)); }
    }
    for (b = cont.firstChild; b; b = b.nextSibling) {
      on = b.getAttribute('data-ctx') === actual;
      b.className = on ? 'ctxfila on' : 'ctxfila';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    abrirHoja('tapaDestino');
    b = cont.getElementsByClassName('on')[0];
    if (b) { enfocar(b); }
  }

  /* Elegir destino saca la #etiqueta tipeada (si no, ganaria al guardar) y
     devuelve el foco a la barra para seguir escribiendo o dar Enter. */
  function elegirDestino(id) {
    var inp = $('txtCaptura');
    ctxDestino = id;
    inp.value = K.quitarContextoCaptura(inp.value);
    cerrarHoja('tapaDestino');
    pintarChipsCaptura();
    enfocar(inp);
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
        if (atributo === 'data-ctx') { b.insertBefore(punto(def.id), b.firstChild); }
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
    var foto = fotoDe(it), antes = copiaItem(it);
    var previo = it.contexto;
    it.contexto = ctx;
    var est = estadoEquivalente(it.tipo, ctx, it.estado);
    /* Una compra ya hecha solo cambia de nombre de casillero (comprado <->
       recibido): no se la vuelve a fechar como si se hubiera hecho ahora. */
    if (est !== it.estado) {
      if (!K.esHecho(it.estado)) { it.estadoDesde = new Date().toISOString(); }
      it.estado = est;
    }
    if (!K.esFabrica(ctx)) { it.pausado = false; it.pausadoDesde = ''; }
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('contexto', it, previo, ctx);
      pintar();
      if (itemAbierto === id) { pintarHojaItem(); }
      (function (idG, f, txt) {
        ofrecerDeshacer(txt, function () { restaurarFoto(idG, f, 'contexto'); });
      })(id, foto, 'A ' + nomCtx(ctx) + ': ' + it.texto);
    } else {
      reponerItem(it, antes);
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
        b.textContent = def.nom + ' ' + cuenta(def.id);
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

  function badge(clase, texto, ico) {
    return nodo('span', 'badge ' + clase, texto, ico);
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
    return badge('niv-' + it.nivel, n.nom);
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
    return badge('dia' + (vencida ? ' vencido' : ''), nombreDia(it.fecha), 'calendar');
  }

  var itemsVistos = {};

  function nodoItem(it, motivo, modo) {
    var li = document.createElement('li');
    li.className = 'item fila st-' + it.estado + claseNivel(it) +
      (it.pausado === true ? ' pausado' : '') +
      (itemsVistos[it.id] ? '' : ' nuevo');
    itemsVistos[it.id] = 1;
    li.setAttribute('data-id', it.id);
    /* La tarjeta se enfoca con Tab: Enter abre la ficha, la tecla de menu (o
       Shift+F10, o clic derecho, o mantener apretado) abre el menu rapido. */
    li.setAttribute('tabindex', '0');
    /* Detras de la fila, lo que revela el gesto: verde con tilde a la derecha
       (completar), acento con "mas" a la izquierda (menu rapido). */
    var rev = nodo('div', 'rev');
    rev.setAttribute('aria-hidden', 'true');
    rev.appendChild(svgIco('check', 'rev-ok'));
    rev.appendChild(svgIco('more', 'rev-mas'));
    li.appendChild(rev);
    var fila = nodo('div', 'desliza');
    li.appendChild(fila);

    /* Circulo a la izquierda (Things/Todoist): completar o reabrir una tarea,
       marcar una compra de lista simple. Su nombre lleva el texto del item. */
    var ah = accionHecho(it);
    if (ah) {
      var chk = document.createElement('button');
      chk.type = 'button';
      chk.className = ah.on ? 'chk on' : 'chk';
      chk.setAttribute('data-acc', it.tipo === 'tarea' ? (ah.on ? 'reabrir' : 'listo') : 'comprado');
      chk.setAttribute('aria-label', ah.rot + ': ' + it.texto);
      chk.setAttribute('aria-pressed', ah.on ? 'true' : 'false');
      var circ = nodo('span', 'chk-c');
      circ.appendChild(svgIco('check'));
      chk.appendChild(circ);
      chk.onclick = function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        ah.fn();
      };
      fila.appendChild(chk);
    }

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
      conIcono(de, 'pause', it.espera);
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
    if (contexto === 'todo') { l2.appendChild(badgeCtx(it.contexto)); }
    if (it.rutinaId !== '') { l2.appendChild(badge('rut', '', 'repeat')).setAttribute('title', 'Rutina'); }
    if (it.motivo !== '') { l2.appendChild(badge('mot', textoMotivo(it.motivo))); }
    if (it.anclado === true) { l2.appendChild(badge('pin', '', 'pin')).setAttribute('title', 'Anclado'); }
    var bn = badgeNivel(it);
    if (bn) { l2.appendChild(bn); }
    var bf = badgeFecha(it);
    if (bf) { l2.appendChild(bf); }
    var inf = estadoInfo(it.estado);
    /* Pendiente es el estado por defecto de algo clasificado: no hace falta
       gritarlo en cada tarjeta. Los demas estados si dicen algo. */
    if (it.estado !== 'pendiente') { l2.appendChild(badge('est', inf.nom)); }
    if (it.pausado === true) { l2.appendChild(badge('pausa', 'En espera', 'pause')); }
    if (it.tag !== '') {
      var t = tagInfo(it.tag, it.contexto);
      if (t) { l2.appendChild(badge('tag', t.ico + ' ' + t.nom)); }
    }
    if (it.recordatorio !== '') {
      var d = fechaObj(it.recordatorio);
      if (d) {
        var vencido = d.getTime() <= Date.now() && esActivo(it.estado);
        l2.appendChild(badge('rec' + (vencido ? ' vencido' : ''), horaCorta(it.recordatorio), 'clock'));
      }
    }
    var pasos = pasosDe(it);
    if (pasos.length > 0) {
      l2.appendChild(badge('pasos', pasosHechos(pasos) + '/' + pasos.length, 'tareas'));
    }
    var notas = notasDe(it);
    if (notas.length > 0) { l2.appendChild(badge('nota', '' + notas.length, 'message')); }
    l2.appendChild(badge('', horaCorta(it.creado)));
    cu.appendChild(l2);

    var hs = alertaEntrega(it);
    if (hs > 0) {
      var a = document.createElement('div');
      a.className = 'alerta48';
      conIcono(a, 'alert-triangle', Math.floor(hs) + ' hs esperando entrega. Reclamar o cerrar.');
      cu.appendChild(a);
    }
    fila.appendChild(cu);

    /* Una sola accion secundaria, chica y sin borde: "Para hoy" en el inbox
       (triaje en un toque) y avanzar/seguir en el flujo de compras de fabrica.
       Mover a Compras ya no vive en la tarjeta: esta en la ficha y en el menu. */
    function accion2(clase, marca, rotulo, ico, texto, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = clase;
      b.setAttribute('data-acc', marca);
      b.setAttribute('aria-label', rotulo);
      b.setAttribute('title', rotulo);
      conIcono(b, ico, texto);
      b.onclick = function (ev) {
        if (ev && ev.stopPropagation) { ev.stopPropagation(); }
        fn();
      };
      fila.appendChild(b);
    }
    if (modo === 'triage' && it.estado === 'entrada') {
      accion2('iconobtn mini', 'parahoy', 'Para hoy', 'calendar', '', function () { sacarDeInbox(it.id, true); });
    } else if (it.tipo === 'compra' && K.esFabrica(it.contexto) && esActivo(it.estado)) {
      if (it.pausado === true) {
        /* En pausa la tarjeta ofrece reanudar, no avanzar: primero se descongela. */
        accion2('acc2 on', 'reanudar', 'Seguir', 'play', 'Seguir', function () { alternarPausa(it.id); });
      } else {
        var sig = estadoSiguiente(it);
        if (sig) {
          accion2('acc2', 'siguiente', 'Pasar a ' + sig.nom, 'arrow-right', sig.nom, function () { cambiarEstado(it.id, sig.id); });
        }
      }
    }

    li.onclick = function () {
      if (gestoReciente(li)) { return; }
      abrirItem(it.id);
    };
    li.onkeydown = function (ev) {
      if (ev.target !== li) { return; }
      var k = ev.key || '';
      if (k === 'Enter' || k === ' ' || ev.keyCode === 13 || ev.keyCode === 32) { ev.preventDefault(); abrirItem(it.id); }
      if (esActivo(it.estado) && (k === 'ContextMenu' || ev.keyCode === 93 || (ev.shiftKey && (k === 'F10' || ev.keyCode === 121)))) {
        ev.preventDefault();
        abrirMenuRapido(it.id);
      }
    };
    if (esActivo(it.estado)) {
      li.oncontextmenu = function (ev) {
        if (ev && ev.preventDefault) { ev.preventDefault(); }
        abrirMenuRapido(it.id);
      };
      conectarSwipeFila(li, fila, it.id, !!ah);
    }
    return li;
  }

  /* ---------- gesto en filas ----------
     Solo tactil. Se decide la intencion con los primeros 10px: si es mas
     vertical que horizontal es scroll y la fila no hace nada (touch-action
     pan-y en kco.css deja el scroll al navegador). Horizontal: la fila sigue al
     dedo; soltando pasado el umbral (80px o un tiron rapido), a la derecha
     completa (con deshacer, como el circulo) y a la izquierda abre el menu
     rapido. Mientras una fila tiene el gesto, el swipe entre vistas no cuenta. */
  var gestoFila = false;
  var UMBRAL_FILA = 80;

  function gestoReciente(li) {
    var t = parseInt(li.getAttribute('data-gesto') || '0', 10);
    return Date.now() - t < 500;
  }

  function conectarSwipeFila(li, fila, id, puedeHecho) {
    if (!li.addEventListener || typeof window.PointerEvent === 'undefined') { return; }
    var x0 = 0, y0 = 0, t0 = 0, dx = 0, modo = null, idP = null;
    li.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'touch' || ev.isPrimary === false || pilaCapas.length > 0) { return; }
      x0 = ev.clientX; y0 = ev.clientY; t0 = Date.now(); dx = 0; modo = 'duda'; idP = ev.pointerId;
    });
    li.addEventListener('pointermove', function (ev) {
      if (!modo || ev.pointerId !== idP) { return; }
      var mx = ev.clientX - x0, my = ev.clientY - y0;
      var ax = mx < 0 ? -mx : mx, ay = my < 0 ? -my : my;
      if (modo === 'duda') {
        if (ay > 10 && ay >= ax) { modo = null; return; }
        if (ax > 10 && ax > ay * 1.5) {
          modo = 'h';
          gestoFila = true;
          li.className = li.className + ' arrastra';
        } else { return; }
      }
      /* Sin accion de completar, la derecha ofrece resistencia y no hace nada. */
      dx = mx > 0 && !puedeHecho ? mx / 4 : mx;
      fila.style.transform = 'translate3d(' + dx + 'px,0,0)';
      li.setAttribute('data-rev', dx > 0 ? 'ok' : 'mas');
      li.setAttribute('data-umbral', (dx < 0 ? -dx : dx) >= UMBRAL_FILA ? '1' : '0');
    });
    function soltar(ev, cancelado) {
      if (!modo || ev.pointerId !== idP) { return; }
      var era = modo;
      modo = null;
      if (era !== 'h') { return; }
      li.setAttribute('data-gesto', '' + Date.now());
      li.className = li.className.replace(/ arrastra/g, '');
      li.removeAttribute('data-rev');
      li.removeAttribute('data-umbral');
      fila.style.transform = '';
      if (cancelado) { return; }
      var ad = dx < 0 ? -dx : dx, ms = Date.now() - t0;
      if (ad < UMBRAL_FILA && !(ad > 40 && ad / (ms > 0 ? ms : 1) > 0.6)) { return; }
      var it = buscarItem(id), acc = it ? accionHecho(it) : null;
      if (dx > 0 && puedeHecho && acc) { acc.fn(); }
      if (dx < 0) { abrirMenuRapido(id); }
    }
    li.addEventListener('pointerup', function (ev) { soltar(ev, false); });
    li.addEventListener('pointercancel', function (ev) { soltar(ev, true); });
  }

  /* ---------- menu rapido ----------
     Hoja chica (la misma hoja accesible de siempre) con lo que mas se hace sin
     abrir la ficha: Hoy, Mañana, Prioridad, Mover a Compras y Borrar, mas un
     acceso a la ficha completa. Se abre deslizando a la izquierda, con clic
     derecho, manteniendo apretado o con la tecla de menu sobre la tarjeta. */
  var itemRapido = null;

  function abrirMenuRapido(id) {
    var it = buscarItem(id);
    if (!it || pilaCapas.length > 0) { return; }
    itemRapido = id;
    $('rapTitulo').textContent = it.texto;
    $('rapNivel').style.display = 'none';
    $('btnRapNivel').setAttribute('aria-expanded', 'false');
    $('btnRapCompras').style.display = it.tipo === 'tarea' && it.rutinaId === '' ? '' : 'none';
    pintarOpciones('rapNivel', K.NIVELES, it.nivel, function (n) { return n.nom; }, function (n) {
      cerrarHoja('tapaRapido');
      fijarNivel(id, n.id);
    }, 'data-nivel');
    abrirHoja('tapaRapido');
  }

  function accionRapida(cual) {
    var id = itemRapido, it = buscarItem(id);
    if (!it) { cerrarHoja('tapaRapido'); return; }
    if (cual === 'prioridad') {
      var abierto = $('rapNivel').style.display !== 'none';
      $('rapNivel').style.display = abierto ? 'none' : '';
      $('btnRapNivel').setAttribute('aria-expanded', abierto ? 'false' : 'true');
      return;
    }
    /* La hoja que siga (ficha, confirmar) ocupa la entrada del menu rapido. */
    cerrarParaRelevo('tapaRapido');
    if (cual === 'hoy') {
      if (it.estado === 'entrada') { sacarDeInbox(id, true); } else { fijarFecha(id, hoyClave()); }
    } else if (cual === 'manana') {
      posponer(id);
    } else if (cual === 'compras') {
      moverACompras(id);
    } else if (cual === 'borrar') {
      pedirBorrar(id);
    } else if (cual === 'ficha') {
      abrirItem(id);
    }
    soltarRelevo();
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
        b.textContent = def.nom +
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

  /* ---------- listas largas ----------
     Una lista larga pinta de a TROZO filas; "Ver mas" al pie suma el trozo
     siguiente. Cada lista recuerda su trozo mientras no cambie su clave
     (contexto + filtro, o la busqueda): repintar despues de una edicion lo
     conserva; cambiar de filtro o de vista (irAVista) vuelve a TROZO. */
  var TROZO = 50;
  var trozos = {};

  function limiteTrozo(lista, clave) {
    var t = trozos[lista];
    if (!t || t.clave !== clave) {
      t = { clave: clave, n: TROZO };
      trozos[lista] = t;
    }
    return t.n;
  }

  /* La hoja (.hoja) que contiene a el, si hay: su scroll tambien se conserva. */
  function hojaDe(el) {
    while (el && el.nodeType === 1) {
      if (el.classList && el.classList.contains('hoja')) { return el; }
      el = el.parentNode;
    }
    return null;
  }

  /* El boton va al final de cont (un <li> si cont es una lista). Al tocarlo se
     repinta con un trozo mas, se conserva el scroll (de la pagina y de la hoja
     que lo contenga) y el foco pasa a la primera fila nueva. */
  function botonVerMas(cont, lista, quedan, repintar) {
    var pie = document.createElement(cont.tagName === 'UL' ? 'li' : 'div');
    pie.className = 'vermas-fila';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'vermas';
    b.setAttribute('data-vermas', lista);
    b.textContent = 'Ver m\u00E1s (' + quedan + ')';
    b.onclick = function () {
      var y = window.pageYOffset || 0, hoja = hojaDe(cont), sy = hoja ? hoja.scrollTop : 0;
      var antes = trozos[lista] ? trozos[lista].n : TROZO;
      if (trozos[lista]) { trozos[lista].n = antes + TROZO; }
      repintar();
      if (typeof window.scrollTo === 'function') { window.scrollTo(0, y); }
      if (hoja) { hoja.scrollTop = sy; }
      var filas = cont.querySelectorAll('li.item, .ev');
      if (filas[antes]) {
        if (!filas[antes].hasAttribute('tabindex')) { filas[antes].setAttribute('tabindex', '-1'); }
        enfocar(filas[antes]);
      }
    };
    pie.appendChild(b);
    cont.appendChild(pie);
  }

  function pintarLista(tipo, filtroActual, listaId, vacioId) {
    var lista = $(listaId);
    while (lista.firstChild) { lista.removeChild(lista.firstChild); }
    var arr = ordenar(delContexto(tipo));
    var lim = limiteTrozo(listaId, tipo + '|' + contexto + '|' + filtroActual + '|' + (tipo === 'tarea' ? filtroTag : ''));
    var i, visibles = 0;
    for (i = 0; i < arr.length; i++) {
      var it = arr[i];
      if (filtroActual === 'activos') {
        if (!esActivo(it.estado)) { continue; }
      } else if (it.estado !== filtroActual) { continue; }
      if (tipo === 'tarea' && filtroTag !== '' && it.tag !== filtroTag) { continue; }
      visibles++;
      if (visibles <= lim) { lista.appendChild(nodoItem(it)); }
    }
    if (visibles > lim) { botonVerMas(lista, listaId, visibles - lim, pintar); }
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
    if (pintarLista('tarea', filtro, 'lista', 'vacioTablero') === 0) { vacioTareas(); }
  }

  function vacioTareas() {
    var el = $('vacioTablero'), t;
    if (filtroTag !== '') {
      t = tagInfo(filtroTag, contexto);
      estadoVacio(el, { id: 'etiqueta', ico: 'list', tit: 'Nada en ' + (t ? t.nom : 'esa clasificaci\u00F3n'),
        txt: 'Ninguna tarea de este filtro tiene esa etiqueta.', acc: 'Quitar etiqueta',
        alTocar: function () { filtroTag = ''; escribir(K_FILTROTAG, filtroTag); pintar(); } });
    } else if (filtro === 'activos') {
      estadoVacio(el, { id: 'tareas', ico: 'tareas',
        tit: contexto === 'todo' ? 'Sin tareas activas' : 'Sin tareas activas en ' + nomCtx(contexto),
        txt: 'Escrib\u00ED en la barra de captura y toc\u00E1 Enter. Termin\u00E1 con "hoy" o "ma\u00F1ana" para agendarla.',
        acc: 'Capturar', accIco: 'plus', alTocar: irACaptura });
    } else if (filtro === 'entrada') {
      estadoVacio(el, { id: 'inbox', ico: 'inbox', tit: 'Inbox vac\u00EDo',
        txt: 'Lo que captures cae ac\u00E1 hasta que decidas: para hoy, otro d\u00EDa u otro estado.',
        acc: 'Capturar', accIco: 'plus', alTocar: irACaptura });
    } else {
      estadoVacio(el, { id: 'filtro', ico: 'list', tit: 'Nada en ' + estadoInfo(filtro).nom,
        txt: 'Ninguna tarea est\u00E1 en ese estado ahora.', acc: 'Ver activos',
        alTocar: function () { filtro = 'activos'; escribir(K_FILTRO, filtro); pintar(); } });
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
    if (pintarLista('compra', filtroCompra, 'listaCompras', 'vacioCompras') > 0) { return; }
    if (filtroCompra !== 'activos') {
      estadoVacio($('vacioCompras'), { id: 'compras-filtro', ico: 'cart', tit: 'Nada en ' + estadoInfo(filtroCompra).nom,
        txt: 'Ninguna compra est\u00E1 en ese paso ahora.', acc: esHogar ? 'Ver por comprar' : 'Ver abiertas',
        alTocar: function () { filtroCompra = 'activos'; escribir(K_FILTROC, filtroCompra); pintar(); } });
      return;
    }
    estadoVacio($('vacioCompras'), { id: 'compras', ico: 'cart', tit: esHogar ? 'Lista de compras vac\u00EDa' : 'Sin compras abiertas',
      txt: esHogar
        ? 'Captur\u00E1 lo que falta y movelo a Compras desde su men\u00FA (desliz\u00E1 a la izquierda) o su ficha.'
        : 'Cualquier tarea pasa a compra desde su men\u00FA o su ficha (Mover a Compras) y sigue ac\u00E1 hasta recibirla.',
      acc: 'Capturar', accIco: 'plus', alTocar: irACaptura });
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
    if (ev.tipo === 'nivel') { return '\u2B50 Nivel ' + ev.hasta; }
    if (ev.tipo === 'logro') { return '\uD83C\uDFC6 Logro: ' + ev.hasta; }
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
    if (ev.tipo === 'contexto') { return 'Moviste a ' + nomCtx(ev.hasta); }
    if (ev.tipo === 'tag') { return ev.hasta === '' ? 'Sacaste la clasificacion' : 'Clasificaste como ' + ev.hasta; }
    if (ev.tipo === 'recordatorio') { return ev.hasta === '' ? 'Sacaste el recordatorio' : 'Recordatorio ' + ev.hasta; }
    if (ev.tipo === 'compra') { return 'Moviste a Compras'; }
    if (ev.tipo === 'vuelta') { return 'Volviste a tarea'; }
    if (ev.tipo === 'pausa') { return ev.hasta === 'reanudada' ? 'Reanudaste la compra' : 'Pusiste la compra en espera'; }
    if (ev.tipo === 'comentario') { return 'Comentaste'; }
    if (ev.tipo === 'anclado') { return ev.hasta === 'anclado' ? 'Anclaste arriba' : 'Sacaste el ancla'; }
    if (ev.tipo === 'migracion') { return 'Migracion de datos'; }
    if (ev.tipo === 'compactado') { return 'Historial viejo compactado'; }
    if (ev.tipo === 'estado') { return estadoInfo(ev.desde).nom + ' \u2192 ' + estadoInfo(ev.hasta).nom; }
    return 'Movimiento';
  }

  var MESES_LARGO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function cabeceraDiaDiario(clave) {
    var d = K.deClave(clave);
    var rel = etiquetaDia(clave);
    var largo = d.getDate() + ' ' + MESES_LARGO[d.getMonth()] + ' ' + d.getFullYear();
    return rel === 'Hoy' || rel === 'Ayer' ? rel + ' \u00B7 ' + largo : largo + ' \u00B7 ' + DIAS_SEMANA[d.getDay()];
  }

  function resumenDia(c) {
    var p = [];
    if (c.hechas) { p.push('\u2714 ' + c.hechas); }
    if (c.rutinas) { p.push('\uD83D\uDD04 ' + c.rutinas); }
    if (c.hitos) { p.push('\uD83C\uDFAF ' + c.hitos); }
    if (c.misiones) { p.push('\uD83C\uDFC1 ' + c.misiones); }
    if (c.logros) { p.push('\uD83C\uDFC6 ' + c.logros); }
    return p.join('  ');
  }

  function pintarDiario() {
    var cont = $('diarioCuerpo');
    vaciar(cont);
    var corte = desdeRango();
    var dias = K.diario(eventos, items, { desde: corte ? corte.toISOString() : '', contexto: contexto });
    $('vacioRegistro').style.display = dias.length === 0 ? 'block' : 'none';
    if (dias.length === 0) {
      vacioRango('diario', 'book', 'Nada en el diario', 'Lo que completes, los hitos y las misiones quedan ac\u00E1 solos, d\u00EDa por d\u00EDa.');
    }
    var i, j, total = 0, pintadas = 0;
    var lim = limiteTrozo('diarioCuerpo', contexto + '|' + rango);
    for (i = 0; i < dias.length; i++) { total = total + dias[i].entradas.length; }
    for (i = 0; i < dias.length && pintadas < lim; i++) {
      var g = dias[i];
      var cab = nodo('div', 'dia diario-dia');
      cab.appendChild(nodo('span', '', cabeceraDiaDiario(g.dia)));
      cab.appendChild(nodo('span', 'mono diario-cuenta', resumenDia(g.cuenta)));
      cont.appendChild(cab);
      for (j = 0; j < g.entradas.length && pintadas < lim; j++) {
        pintadas++;
        (function (e) {
          var f = nodo('div', 'ev diario-ev ' + e.clase);
          f.appendChild(nodo('div', 'ico', e.ico));
          var d = nodo('div', 'd');
          d.appendChild(nodo('b', '', e.texto));
          if (e.sub) { d.appendChild(nodo('small', '', e.sub)); }
          f.appendChild(d);
          var h = fechaObj(e.ts);
          f.appendChild(nodo('div', 'h mono', h ? hhmm(h) : ''));
          if (e.itemId && buscarItem(e.itemId)) {
            f.className = f.className + ' toca';
            f.onclick = function () { abrirItem(e.itemId); };
          }
          cont.appendChild(f);
        })(g.entradas[j]);
      }
    }
    if (total > lim) { botonVerMas(cont, 'diarioCuerpo', total - lim, pintar); }
  }

  /* Diario o registro sin nada en el rango: si el rango es corto, la accion
     lo abre a Todo. */
  function vacioRango(id, ico, tit, txt) {
    var todo = rango === 'todo';
    estadoVacio($('vacioRegistro'), { id: id, ico: ico, tit: tit + (todo ? ' todav\u00EDa' : ' en este per\u00EDodo'), txt: txt,
      acc: todo ? '' : 'Ver todo', alTocar: function () { rango = 'todo'; pintar(); } });
  }

  function pintarRegistro() {
    $('btnModoDiario').className = modoDiario === 'diario' ? 'segbtn on' : 'segbtn';
    $('btnModoRegistro').className = modoDiario === 'registro' ? 'segbtn on' : 'segbtn';
    $('btnModoCampana').className = modoDiario === 'campana' ? 'segbtn on' : 'segbtn';
    $('cajaRango').style.display = modoDiario === 'campana' ? 'none' : 'block';
    $('diarioCuerpo').style.display = modoDiario === 'diario' ? 'block' : 'none';
    $('timeline').style.display = modoDiario === 'registro' ? 'block' : 'none';
    $('campanaCuerpo').style.display = modoDiario === 'campana' ? 'block' : 'none';
    if (modoDiario === 'campana') { $('vacioRegistro').style.display = 'none'; pintarCampana(); return; }
    pintarChipsGen('chipsRango', RANGOS, rango, function () { return ''; }, function (id) { rango = id; pintar(); });
    if (modoDiario === 'diario') { pintarDiario(); return; }
    var cont = $('timeline');
    while (cont.firstChild) { cont.removeChild(cont.firstChild); }
    var lista = eventosFiltrados();
    if (lista.length === 0) {
      vacioRango('registro', 'list', 'Sin movimientos', 'Cada captura, cambio de estado y cierre queda anotado ac\u00E1.');
      $('vacioRegistro').style.display = 'block';
      return;
    }
    $('vacioRegistro').style.display = 'none';
    var diaActual = '', i;
    var lim = limiteTrozo('timeline', contexto + '|' + rango);
    var hasta = Math.max(0, lista.length - lim);
    for (i = lista.length - 1; i >= hasta; i--) {
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
    if (hasta > 0) { botonVerMas(cont, 'timeline', hasta, pintar); }
  }

  /* ---------- centro de control: AHORA y HOY ---------- */

  function vaciar(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  function hoyClave() { return K.claveDia(new Date()); }

  /* Icono SVG de iconos.js (decorativo). Sin iconos.js queda un span vacio. */
  function svgIco(nombre, clase) {
    return window.KCOIconos ? window.KCOIconos.crear(nombre, clase) : document.createElement('span');
  }

  /* Icono + rotulo: el texto va en su propio <span> para que kco.css separe
     el icono solo cuando hay texto al lado (.ico:not(:last-child)). */
  function conIcono(e, ico, texto) {
    e.appendChild(svgIco(ico));
    if (texto) {
      var t = document.createElement('span');
      t.textContent = texto;
      e.appendChild(t);
    }
    return e;
  }

  /* ---------- estados vacios ----------
     Toda vista sin nada muestra lo mismo: un icono de iconos.js, un titulo
     corto, una linea que dice que hacer y, si sirve, una accion. el puede ser
     un contenedor fijo (#vacioTablero) o uno nuevo (vacioNuevo). */
  function estadoVacio(el, o) {
    vaciar(el);
    el.className = 'vacio est-vacio';
    el.setAttribute('data-vacio', o.id);
    var ic = nodo('div', 'vacio-ico');
    ic.appendChild(svgIco(o.ico));
    el.appendChild(ic);
    el.appendChild(nodo('div', 'vacio-tit', o.tit));
    if (o.txt) { el.appendChild(nodo('div', 'vacio-txt', o.txt)); }
    if (o.acc) {
      var b = nodo('button', 'vacio-acc', o.acc, o.accIco || '');
      b.type = 'button';
      if (o.accId) { b.id = o.accId; }
      b.onclick = o.alTocar;
      el.appendChild(b);
    }
    return el;
  }

  function vacioNuevo(tag, o) { return estadoVacio(document.createElement(tag), o); }

  /* La accion "Capturar" de un estado vacio: el cursor en la barra. */
  function irACaptura() { enfocar($('txtCaptura')); }

  function nodo(tag, clase, texto, ico) {
    var e = document.createElement(tag);
    if (clase) { e.className = clase; }
    if (ico) { return conIcono(e, ico, texto); }
    if (typeof texto === 'string') { e.textContent = texto; }
    return e;
  }

  /* Cambia el rotulo de un boton conservando su icono (o poniendo otro). */
  function rotular(el, texto, ico) {
    var s = el.getElementsByTagName('svg')[0];
    vaciar(el);
    if (ico || !s) { conIcono(el, ico || el.getAttribute('data-ico') || '', texto); return; }
    el.appendChild(s);
    var t = document.createElement('span');
    t.textContent = texto;
    el.appendChild(t);
  }

  /* Marcado estatico: <x data-ico="nombre"> recibe su icono al arrancar; su
     texto pasa a un <span> (mismo textContent). */
  function decorarIconos() {
    var l = document.querySelectorAll('[data-ico]'), i, el, txt;
    for (i = 0; i < l.length; i++) {
      el = l[i];
      if (el.getElementsByTagName('svg').length) { continue; }
      txt = el.textContent.replace(/^\s+|\s+$/g, '');
      vaciar(el);
      conIcono(el, el.getAttribute('data-ico'), txt);
    }
  }

  /* Encabezado de seccion + su lista. Devuelve el <ul> para llenarlo. */
  function seccion(cont, id, titulo, n, nota, ico) {
    var s = nodo('section', 'sec');
    if (id) { s.id = id; }
    var h = nodo('h3', 'sec-tit');
    h.appendChild(nodo('span', '', titulo, ico));
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
    if (it.tipo === 'tarea') { return { txt: 'Hecho', ico: 'check', fn: function () { cambiarEstado(it.id, 'completado'); } }; }
    if (!K.esFabrica(it.contexto)) { return { txt: 'Comprado', ico: 'check', fn: function () { cambiarEstado(it.id, 'comprado'); } }; }
    if (it.pausado === true) { return { txt: 'Seguir', ico: 'play', fn: function () { alternarPausa(it.id); } }; }
    var sig = estadoSiguiente(it);
    return sig ? { txt: sig.nom, ico: 'arrow-right', fn: function () { cambiarEstado(it.id, sig.id); } } : null;
  }

  function botonHero(cont, clase, texto, fn, ico) {
    var b = nodo('button', clase, texto, ico);
    b.type = 'button';
    b.onclick = function (ev) { if (ev && ev.stopPropagation) { ev.stopPropagation(); } fn(); };
    cont.appendChild(b);
    return b;
  }

  function nodoHero(r, siguientes) {
    var it = r.item;
    var c = nodo('div', 'hero' + claseNivel(it));
    c.setAttribute('data-id', it.id);
    c.appendChild(nodo('div', 'hero-rot', 'Siguiente movimiento', 'zap'));
    c.appendChild(nodo('div', 'hero-txt', it.texto));
    var meta = [r.motivo, nomCtx(it.contexto)];
    var pr = it.proyectoId ? buscarProyectoNombre(it.proyectoId) : '';
    if (pr !== '') { meta.push(pr); }
    c.appendChild(nodo('div', 'hero-meta mono', meta.join(' \u00B7 ')));
    var accs = nodo('div', 'hero-accs');
    var ap = accionPrincipal(it);
    if (ap) { botonHero(accs, 'bloque pri', ap.txt, ap.fn, ap.ico).setAttribute('data-hero', 'hecho'); }
    if (it.tipo === 'tarea' && it.estado !== 'proceso') {
      botonHero(accs, 'bloque', 'Empezar', function () { cambiarEstado(it.id, 'proceso'); }, 'play').setAttribute('data-hero', 'empezar');
    }
    botonHero(accs, 'bloque', 'Ma\u00F1ana', function () {
      posponer(it.id);
    }, 'forward').setAttribute('data-hero', 'manana');
    c.appendChild(accs);
    if (siguientes.length > 0) {
      var sg = nodo('div', 'hero-sig');
      sg.appendChild(nodo('span', '', 'Despu\u00E9s '));
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
    b.appendChild(nodo('span', '', rot));
    b.appendChild(svgIco(ico, 'tile-ico'));
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
    tile(pulso, 'alert-circle', nAt, 'Atenci\u00F3n', 'secAtencion', nAt > 0 ? 'rojo' : '');
    tile(pulso, 'calendar', nHoy, 'Hoy', 'secSigue', '');
    tile(pulso, 'inbox', inbox.length, 'Inbox', 'secInbox', '');
    tile(pulso, 'hourglass', esperando.length, 'Esperando', 'secEsperando', '');
    cont.appendChild(pulso);

    var mostrados = {};
    if (lista.length === 0) {
      cont.appendChild(vacioNuevo('div', { id: 'ahora', ico: 'check-circle', tit: 'Todo en orden',
        txt: 'Nada pendiente en ' + nomCtx(contexto) + '. Captur\u00E1 lo pr\u00F3ximo que aparezca y KCO te dice qu\u00E9 sigue.',
        acc: 'Capturar', accIco: 'plus', alTocar: irACaptura }));
    } else if (ranking.length === 0) {
      var calma = nodo('div', 'hero calma');
      calma.appendChild(nodo('div', 'hero-rot', 'Todo en orden', 'check-circle'));
      calma.appendChild(nodo('div', 'hero-txt', 'Lo que queda esta esperando a otros o tiene dia mas adelante.'));
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
      var ulA = seccion(cont, 'secAtencion', 'Requiere atenci\u00F3n', at.length, '', 'alert-circle');
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
      var ulS = seccion(cont, 'secSigue', 'A continuaci\u00F3n', resto,
        resto > siguen.length ? 'Las ' + siguen.length + ' que mas pesan. El resto esta en Tareas.' : '', 'arrow-right');
      for (i = 0; i < siguen.length; i++) {
        ulS.appendChild(nodoItem(siguen[i].item, siguen[i].motivo));
        mostrados['#' + siguen[i].item.id] = true;
      }
    }

    var bandeja = [];
    for (i = inbox.length - 1; i >= 0; i--) { if (!mostrados['#' + inbox[i].id]) { bandeja.push(inbox[i]); } }
    if (bandeja.length > 0) {
      var ulI = seccion(cont, 'secInbox', 'Inbox', bandeja.length,
        'Capturado sin clasificar. El c\u00EDrculo lo completa, el calendario lo deja para hoy; desliz\u00E1 a la izquierda para m\u00E1s.', 'inbox');
      for (i = 0; i < bandeja.length && i < 8; i++) { ulI.appendChild(nodoItem(bandeja[i], '', 'triage')); }
    }

    if (esperando.length > 0) {
      var ulE = seccion(cont, 'secEsperando', 'Esperando', esperando.length, '', 'hourglass');
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

  function capital(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

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
    cab.appendChild(nodo('div', 'hoy-fecha', capital(tituloDia(hoy))));
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
      var ulR = seccion(cont, 'secRutinasHoy', 'Rutinas de hoy', hechasR + '/' + rut.length, '', 'repeat');
      ordenar(rut);
      rut.sort(function (a, b) { return esActivo(a.estado) === esActivo(b.estado) ? 0 : (esActivo(a.estado) ? -1 : 1); });
      for (i = 0; i < rut.length; i++) {
        var ruD = buscarRutina(rut[i].rutinaId);
        ulR.appendChild(nodoItem(rut[i], ruD ? lineaRacha(ruD) : ''));
      }
    }
    var gest = nodo('button', 'bloque', 'Rutinas' + (rutinas.length ? ' (' + rutinas.length + ')' : ': crear la primera'), 'repeat');
    gest.type = 'button';
    gest.id = 'btnRutinas';
    gest.onclick = function () { abrirListaRutinas(); };
    cont.appendChild(gest);
    if (vencidas.length > 0) {
      var ulV = seccion(cont, 'secVencidas', 'Vencidas', vencidas.length,
        'Ten\u00EDan d\u00EDa y ya pas\u00F3. Ma\u00F1ana, en la ficha o en Ahora, las corre un d\u00EDa.', 'alert-circle');
      ordenar(vencidas);
      for (i = 0; i < vencidas.length; i++) { ulV.appendChild(nodoItem(vencidas[i], 'Era ' + nombreDia(K.diaDe(vencidas[i])))); }
    }
    var noRut = [];
    for (i = 0; i < deHoy.length; i++) { if (deHoy[i].rutinaId === '') { noRut.push(deHoy[i]); } }
    var ulH = seccion(cont, 'secParaHoy', 'Para hoy', noRut.length, '', 'calendar');
    if (noRut.length === 0) {
      ulH.appendChild(vacioNuevo('li', { id: 'hoy', ico: 'calendar', tit: 'Nada agendado para hoy',
        txt: 'Termin\u00E1 una captura con "hoy" o eleg\u00ED un d\u00EDa en la ficha. Desde Ahora ves qu\u00E9 conviene hacer.',
        acc: 'Capturar', accIco: 'plus', alTocar: irACaptura }));
    }
    for (i = 0; i < noRut.length; i++) { ulH.appendChild(nodoItem(noRut[i], '')); }
    if (hechas.length > 0) {
      var ulD = seccion(cont, 'secHechasHoy', 'Hecho hoy', hechas.length, '', 'check-circle');
      for (i = hechas.length - 1; i >= 0; i--) { ulD.appendChild(nodoItem(hechas[i], '')); }
    }

    var prox = nodo('div', 'sec-titulo-grande', 'Pr\u00F3ximos d\u00EDas');
    cont.appendChild(prox);
    var alguno = false, d, clave;
    for (d = 1; d <= DIAS_PROXIMOS; d++) {
      clave = K.sumarDias(hoy, d);
      var delDia = itemsDelDia(clave);
      var previstas = rutinasPrevistas(clave);
      if (delDia.length === 0 && previstas.length === 0) { continue; }
      alguno = true;
      var ulP = seccion(cont, 'dia-' + clave, (d === 1 ? 'Ma\u00F1ana \u00B7 ' : '') + (d === 1 ? tituloDia(clave) : capital(tituloDia(clave))),
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
      var ulL = seccion(cont, 'secMasAdelante', 'M\u00E1s adelante', luego.length, '', 'layers');
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

  /* Barra lateral de escritorio: las cinco vistas (Tareas cubre Compras). */
  var NAV_VISTAS = [
    { v: 'ahora', nom: 'Ahora', ico: 'zap' },
    { v: 'hoy', nom: 'Hoy', ico: 'calendar' },
    { v: 'tablero', nom: 'Tareas', ico: 'tareas' },
    { v: 'misiones', nom: 'Misiones', ico: 'target' },
    { v: 'registro', nom: 'Diario', ico: 'book' }
  ];
  var TITULO_VISTA = { ahora: 'Ahora', hoy: 'Hoy', tablero: 'Tareas', compras: 'Compras', misiones: 'Misiones', registro: 'Diario' };

  /* Cuentas baratas (una pasada): atencion en Ahora, lo de hoy, lo abierto y
     las misiones activas del contexto. El Diario no lleva cuenta. */
  function cuentasVistas() {
    var hoy = hoyClave(), ahora = Date.now(), l = activosVisibles(), i;
    var r = { ahora: 0, hoy: 0, tablero: l.length, misiones: misionesVisibles('activo').length, registro: 0 };
    for (i = 0; i < l.length; i++) {
      if (K.situacion(l[i], hoy, ahora) === 'atencion') { r.ahora++; }
      if (K.diaDe(l[i]) === hoy) { r.hoy++; }
    }
    return r;
  }

  /* Se arma una vez; cada pintado actualiza estado y cuentas sin rehacer los
     botones (el foco de teclado no se pierde al navegar). */
  function pintarNavLateral() {
    var nav = $('navLateral'), n = cuentasVistas(), i, b, v, on, cn;
    if (!nav.firstChild) {
      for (i = 0; i < NAV_VISTAS.length; i++) {
        (function (d) {
          var x = nodo('button', 'lat-item', '');
          x.type = 'button';
          x.setAttribute('data-vista', d.v);
          x.appendChild(svgIco(d.ico));
          x.appendChild(nodo('span', 'lat-item-nom', d.nom));
          x.appendChild(nodo('span', 'lat-item-n' + (d.v === 'ahora' ? ' rojo' : ''), ''));
          x.onclick = function () { irAVista(d.v === 'tablero' && vista === 'compras' ? 'compras' : d.v); };
          nav.appendChild(x);
        })(NAV_VISTAS[i]);
      }
    }
    for (b = nav.firstChild; b; b = b.nextSibling) {
      v = b.getAttribute('data-vista');
      on = VISTA_TAB[vista] === VISTA_TAB[v];
      b.className = on ? 'lat-item on' : 'lat-item';
      if (on) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); }
      cn = b.getElementsByTagName('span')[1];
      cn.textContent = n[v] > 0 ? '' + n[v] : '';
    }
  }

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
    trozos = {};
    animarMain(dir);
    pintar();
    if (sinHistorial) { return; }
    if (v !== 'ahora') {
      if (anclaSerie === '' && pilaCapas.length === 0) {
        var s = nuevaSerie();
        if (empujarHistorial({ kcoAncla: true, kcoNivel: 0, kcoSerie: s })) { anclaSerie = s; }
      }
    } else if (anclaSerie !== '' && pilaCapas.length === 0) {
      anotarResiduo(anclaSerie);
      anclaSerie = '';
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
    $('tituloVista').textContent = TITULO_VISTA[vista] || '';
    pintarSelectorContexto();
    pintarNavLateral();
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
  /* Identidad de la entrada de historial de cada capa abierta, a la par de
     pilaCapas ('' = la capa no tiene entrada: history no anda). Cada entrada
     lleva { kcoCapa, kcoNivel, kcoSerie }; la serie es unica en la sesion. */
  var seriesCapas = [];
  /* Serie de la entrada "ancla" (pestaña distinta de Ahora); '' = no hay. */
  var anclaSerie = '';
  var semillaSerie = (new Date()).getTime().toString(36) + '.' + Math.floor(Math.random() * 1e6).toString(36);
  var cuentaSerie = 0;
  /* Relevo: una hoja se cerro para que otra la reemplace en el mismo toque
     (menu rapido -> ficha). Su entrada no se retrocede: la proxima entrada que
     se empuje la reemplaza con replaceState. Asi no queda ningun retroceso en
     vuelo. soltarRelevo() retrocede si al final nadie la reuso. */
  var relevo = false;
  var relevoSerie = '';
  /* Residuos: series de las entradas de las que se fue un retroceso propio
     (capas cerradas, ancla abandonada). Si ese retroceso llega tarde o se
     pierde, el historial cae en una de ellas: es lo unico que se absorbe en
     silencio. Cualquier otra entrada desconocida cuenta como la base. */
  var residuos = [];
  var MAX_RESIDUOS = 20;

  function anotarResiduo(s) {
    if (!s) { return; }
    residuos.push(s);
    if (residuos.length > MAX_RESIDUOS) { residuos.shift(); }
  }

  function nuevaSerie() {
    cuentaSerie = cuentaSerie + 1;
    return semillaSerie + '.' + cuentaSerie;
  }

  function empujarHistorial(dato) {
    var reemplazar = relevo;
    relevo = false;
    try {
      if (window.history && typeof window.history.pushState === 'function') {
        if (reemplazar) { window.history.replaceState(dato, ''); } else { window.history.pushState(dato, ''); }
        return true;
      }
    } catch (e) { /* sin history: la app sigue andando igual */ }
    return false;
  }

  /* Retroceso propio. No se cuenta ni se espera: su popstate, llegue cuando
     llegue (o nunca), pasa por reconciliarHistorial y ahi no cierra nada. */
  function retrocederHistorial(n) {
    try {
      if (window.history && typeof window.history.go === 'function') { window.history.go(-n); }
    } catch (e) { /* nada: el historial queda con una entrada vieja, que se asienta sola */ }
  }

  /* La entrada de historial de una hoja recien abierta. */
  function anotarCapa(id) {
    var s = nuevaSerie();
    return empujarHistorial({ kcoCapa: id, kcoNivel: pilaCapas.length, kcoSerie: s }) ? s : '';
  }

  /* Cierra (sin tocar el historial) todas las capas por encima de la posicion
     pos de la pila; -1 = todas. Devuelve cuantas cerro. */
  function cerrarCapasSobre(pos) {
    var n = 0;
    while (pilaCapas.length - 1 > pos) {
      cerrarDom(pilaCapas[pilaCapas.length - 1]);
      pilaCapas.pop();
      seriesCapas.pop();
      n++;
    }
    return n;
  }

  /* Reconciliacion: el popstate (o un pageshow restaurado) dice en que entrada
     esta el historial; las capas se ajustan a eso. Es idempotente y no lleva
     cuentas ni timers:
     - entrada de una capa abierta: se cierran las que estan encima (si es la de
       arriba, fue un retroceso propio y no pasa nada);
     - el ancla vigente: se cierran todas las capas;
     - la entrada base (sin datos de KCO): se cierran todas; si no habia
       ninguna, una pestaña que no es Ahora vuelve a Ahora;
     - un residuo de un retroceso propio (entrada de la que ese retroceso se
       fue): se asienta en silencio, una sola vez. Es donde cae un retroceso
       propio que llego tarde, despues de que se abrio otra hoja, y esa hoja no
       se toca. Si en cambio el retroceso se perdio, el primer "atras" del
       usuario cae en esa entrada y no cierra nada; el siguiente ya anda;
     - cualquier otra entrada de KCO desconocida (de antes de recargar, de
       otro formato): cuenta como la base, asi cada "atras" se nota.
     sinConsumir (pageshow restaurado): no es un aterrizaje de un retroceso, asi
     que un residuo se respeta pero queda anotado para cuando ese retroceso llegue. */
  function reconciliarHistorial(st, sinConsumir) {
    var serie = st && typeof st.kcoSerie === 'string' ? st.kcoSerie : '';
    var pos;
    if (serie !== '') {
      pos = seriesCapas.indexOf(serie);
      if (pos > -1) { cerrarCapasSobre(pos); return; }
      if (anclaSerie !== '' && serie === anclaSerie) { cerrarCapasSobre(-1); return; }
      pos = residuos.indexOf(serie);
      if (pos > -1) {
        if (!sinConsumir) { residuos.splice(pos, 1); }
        return;
      }
    }
    anclaSerie = '';
    if (cerrarCapasSobre(-1) > 0) { return; }
    if (vista !== 'ahora') { irAVista('ahora', true); }
    /* Nada abierto y ya estamos en Ahora: se deja salir. */
  }

  /* Cierra id (la capa de arriba) para que la proxima hoja ocupe su entrada.
     Si id no esta arriba o no tiene entrada, es un cierre comun. */
  function cerrarParaRelevo(id) {
    var top = pilaCapas.length - 1;
    if (top < 0 || pilaCapas[top] !== id || seriesCapas[top] === '') { cerrarHoja(id); return; }
    cerrarDom(id);
    pilaCapas.pop();
    relevoSerie = seriesCapas.pop();
    relevo = true;
  }

  function soltarRelevo() {
    if (!relevo) { return; }
    relevo = false;
    anotarResiduo(relevoSerie);
    retrocederHistorial(1);
  }

  /* Foco: al abrir una hoja se recuerda quien la abrio y al cerrarla el foco
     vuelve ahi. Si ese elemento ya no existe (la lista se repinto), se busca la
     tarjeta del mismo item. */
  var focoPrevio = {};

  function recordarFoco(id) {
    var a = document.activeElement;
    if (!a || a === document.body) { focoPrevio[id] = null; return; }
    focoPrevio[id] = { el: a, dataId: a.getAttribute ? a.getAttribute('data-id') : null };
  }

  function enfocar(el) {
    if (!el || !el.focus) { return; }
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* nada */ } }
  }

  function devolverFoco(id) {
    var f = focoPrevio[id], el;
    focoPrevio[id] = null;
    if (!f) { return; }
    el = f.el;
    if (!el || !document.body.contains(el) || el.offsetParent === null) {
      el = f.dataId ? document.querySelector('li.item[data-id="' + f.dataId.replace(/[^A-Za-z0-9_-]/g, '') + '"]') : null;
    }
    if (el && el.offsetParent !== null) { enfocar(el); }
  }

  /* Al abrir, el foco entra a la hoja por su titulo (anuncia el dialogo sin
     abrir el teclado en el telefono); si el titulo esta oculto, por la hoja. */
  function enfocarHoja(id) {
    var t = $(id), h = t.querySelector('h2');
    enfocar(h && h.className.indexOf('oculto-vis') < 0 ? h : t.querySelector('.hoja'));
  }

  function cerrarDom(id) {
    var el = $(id);
    if (el) { el.className = 'tapa'; }
    if (id === 'tapaItem') { itemAbierto = null; }
    if (id === 'tapaConfirmar') { confAccion = null; }
    if (id === 'tapaCtx') { $('btnCtx').setAttribute('aria-expanded', 'false'); }
    if (id === 'tapaDestino') { $('capCtx').setAttribute('aria-expanded', 'false'); }
    devolverFoco(id);
  }

  function abrirHoja(id) {
    var i;
    if (id === 'tapaCtx') { $('btnCtx').setAttribute('aria-expanded', 'true'); }
    if (id === 'tapaDestino') { $('capCtx').setAttribute('aria-expanded', 'true'); }
    for (i = 0; i < pilaCapas.length; i++) {
      if (pilaCapas[i] === id) { $(id).className = 'tapa on'; return; }
    }
    recordarFoco(id);
    $(id).className = 'tapa on';
    $(id).style.zIndex = '' + (30 + pilaCapas.length);
    $(id).querySelector('.hoja').scrollTop = 0;
    pilaCapas.push(id);
    seriesCapas.push(anotarCapa(id));
    enfocarHoja(id);
  }

  /* Cierre por la X, Escape, el fondo o el gesto: el mismo camino que el boton
     atras (cerrarHoja), asi el historial queda siempre a la par de las capas. */
  function cerrarCapa(id) {
    if (id === 'tapaMision') { misionAbierta = null; }
    if (id === 'tapaRutina') { borrador = null; }
    cerrarHoja(id);
  }

  function capaArriba() { return pilaCapas.length ? pilaCapas[pilaCapas.length - 1] : null; }

  /* Lo que se puede enfocar con Tab dentro de una hoja, en orden del documento. */
  function enfocables(cont) {
    var l = cont.querySelectorAll('button, input, textarea, select, a[href], [tabindex]'), r = [], i, e;
    for (i = 0; i < l.length; i++) {
      e = l[i];
      if (e.disabled || e.getAttribute('tabindex') === '-1' || e.type === 'hidden') { continue; }
      if (e.offsetParent === null) { continue; }
      r.push(e);
    }
    return r;
  }

  /* Tab y Shift+Tab giran dentro de la hoja de arriba: el foco nunca se va a la
     pagina de atras (aria-modal). Se mueve a mano para no depender del navegador. */
  function moverFocoEn(cont, atras) {
    var l = enfocables(cont), pos = l.indexOf(document.activeElement);
    if (!l.length) { enfocar(cont); return; }
    if (pos < 0) { enfocar(atras ? l[l.length - 1] : l[0]); return; }
    enfocar(l[(pos + (atras ? l.length - 1 : 1)) % l.length]);
  }

  function movimientoReducido() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function esControl(el, tope) {
    for (; el && el !== tope; el = el.parentNode) {
      if (/^(BUTTON|INPUT|TEXTAREA|SELECT|A)$/.test(el.tagName || '')) { return true; }
    }
    return false;
  }

  /* Deslizar hacia abajo desde la cabecera (asa + titulo) cierra la hoja en
     pantallas tactiles: mas de 80px, o un tiron rapido. El cuerpo de la hoja
     sigue scrolleando normal: el gesto vive solo en la cabecera. Con movimiento
     reducido la hoja no sigue al dedo; se decide al soltar. */
  function conectarArrastreHoja(tapa, hoja, cab) {
    if (!cab.addEventListener || typeof window.PointerEvent === 'undefined') { return; }
    var activo = false, idP = null, y0 = 0, t0 = 0, dy = 0;
    cab.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen') { return; }
      if (esControl(ev.target, cab)) { return; }
      activo = true; idP = ev.pointerId; y0 = ev.clientY; t0 = Date.now(); dy = 0;
    });
    cab.addEventListener('pointermove', function (ev) {
      if (!activo || ev.pointerId !== idP) { return; }
      dy = ev.clientY - y0;
      if (dy < 0) { dy = 0; }
      if (!movimientoReducido()) {
        hoja.style.transition = 'none';
        hoja.style.transform = 'translate3d(0,' + dy + 'px,0)';
      }
    });
    function soltar(ev, cancelado) {
      if (!activo || ev.pointerId !== idP) { return; }
      activo = false;
      var ms = Date.now() - t0, v = dy / (ms > 0 ? ms : 1);
      hoja.style.transition = '';
      hoja.style.transform = '';
      if (!cancelado && (dy > 80 || (dy > 30 && v > 0.6))) { cerrarCapa(tapa.id); }
    }
    cab.addEventListener('pointerup', function (ev) { soltar(ev, false); });
    cab.addEventListener('pointercancel', function (ev) { soltar(ev, true); });
  }

  /* Toda hoja es un dialogo modal con nombre: cabecera con asa (movil), titulo
     y una X de cerrar arriba a la derecha. Tocar el fondo tambien cierra. */
  function prepararHoja(tapa) {
    var hoja = tapa.querySelector('.hoja'), h2 = hoja.querySelector('h2');
    var cab = hoja.querySelector('.hoja-cab'), fila, asa;
    if (!h2.id) { h2.id = tapa.id + 'Tit'; }
    if (!cab) {
      cab = nodo('div', 'hoja-cab');
      asa = nodo('div', 'asa');
      asa.setAttribute('aria-hidden', 'true');
      cab.appendChild(asa);
      fila = nodo('div', 'hoja-fila');
      fila.appendChild(h2);
      cab.appendChild(fila);
      hoja.insertBefore(cab, hoja.firstChild);
    } else {
      fila = cab.querySelector('.hoja-fila');
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'iconobtn hoja-x';
    x.setAttribute('aria-label', 'Cerrar');
    x.setAttribute('title', 'Cerrar');
    x.appendChild(svgIco('x'));
    x.onclick = function () { cerrarCapa(tapa.id); };
    fila.appendChild(x);
    tapa.setAttribute('role', 'dialog');
    tapa.setAttribute('aria-modal', 'true');
    tapa.setAttribute('aria-labelledby', h2.id);
    h2.setAttribute('tabindex', '-1');
    hoja.setAttribute('tabindex', '-1');
    tapa.addEventListener('click', function (ev) {
      if (ev.target === tapa && capaArriba() === tapa.id) { cerrarCapa(tapa.id); }
    });
    conectarArrastreHoja(tapa, hoja, cab);
  }

  function prepararHojas() {
    var l = document.querySelectorAll('.tapa'), i;
    for (i = 0; i < l.length; i++) { prepararHoja(l[i]); }
    document.addEventListener('keydown', function (ev) {
      var id = capaArriba();
      if (!id) { return; }
      var k = ev.key || '';
      if (k === 'Escape' || k === 'Esc' || ev.keyCode === 27) {
        ev.preventDefault();
        cerrarCapa(id);
      } else if (k === 'Tab' || ev.keyCode === 9) {
        ev.preventDefault();
        moverFocoEn($(id).querySelector('.hoja'), ev.shiftKey === true);
      }
    });
  }

  function cerrarHoja(id) {
    var pos = -1, i;
    for (i = 0; i < pilaCapas.length; i++) { if (pilaCapas[i] === id) { pos = i; } }
    if (pos === -1) { cerrarDom(id); return; }
    /* Se cierran tambien las capas que quedaron por encima de esta. Solo se
       retroceden las que tienen entrada en el historial. */
    var cuantas = 0;
    for (i = pilaCapas.length - 1; i >= pos; i--) {
      if (seriesCapas[i] !== '') { cuantas++; anotarResiduo(seriesCapas[i]); }
    }
    cerrarCapasSobre(pos - 1);
    if (cuantas > 0) { retrocederHistorial(cuantas); }
  }

  function cerrarTodasLasCapas() {
    if (pilaCapas.length === 0) { return; }
    cerrarHoja(pilaCapas[0]);
  }

  function alVolverAtras(ev) {
    reconciliarHistorial(ev && ev.state !== undefined ? ev.state : window.history.state);
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
      gestoFila = false;
      if (enScrollHorizontal(ev.target, el)) { ini = null; return; }
      ini = puntoDe(ev, 'ini');
      t0 = Date.now();
    }, false);
    el.addEventListener('touchend', function (ev) {
      if (!ini) { return; }
      if (gestoFila) { ini = null; gestoFila = false; return; }
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

  /* El campo de texto crece con el contenido (sin barra de scroll propia). */
  function ajustarAlto(t) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 'px';
  }

  /* Editar el texto de un item: guarda, registra 'edicion' y ofrece deshacer.
     Devuelve false si no hubo cambio (vacio, igual o sin poder guardar). */
  function editarTexto(id, valor) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return false; }
    var nuevo = ('' + valor).replace(/^\s+|\s+$/g, '');
    if (nuevo === '' || nuevo === it.texto) { return false; }
    var previo = it.texto, antes = copiaItem(it);
    it.texto = nuevo;
    it.actualizado = new Date().toISOString();
    if (!guardarItems()) { reponerItem(it, antes); return false; }
    registrar('edicion', it, previo, nuevo);
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    ofrecerDeshacer('Texto editado: ' + nuevo, function () {
      var v = buscarItem(id);
      if (!v || soloLectura || v.texto !== nuevo) { return; }
      var copia = copiaItem(v);
      v.texto = previo;
      v.actualizado = new Date().toISOString();
      if (guardarItems()) {
        registrar('deshacer', v, 'edicion', v.estado);
        pintar();
        if (itemAbierto === id) { pintarHojaItem(); }
      } else { reponerItem(v, copia); }
    });
    return true;
  }

  /* La accion principal de un item, la del circulo de la tarjeta y la de Hecho
     en la ficha: completar o reabrir una tarea, marcar o desmarcar una compra de
     lista simple. El flujo de fabrica no tiene una sola "hecha": null. */
  function accionHecho(it) {
    if (it.tipo === 'tarea') {
      if (esActivo(it.estado)) {
        return { on: false, txt: 'Hecho', rot: 'Completar', fn: function () { cambiarEstado(it.id, 'completado'); } };
      }
      if (it.estado === 'completado') {
        return { on: true, txt: 'Reabrir', rot: 'Reabrir', fn: function () { cambiarEstado(it.id, 'pendiente'); } };
      }
      return null;
    }
    if (!K.esFabrica(it.contexto) && (esActivo(it.estado) || it.estado === 'comprado')) {
      var comprado = it.estado === 'comprado';
      return { on: comprado, txt: comprado ? 'Comprado' : 'Comprar', rot: comprado ? 'Desmarcar comprado' : 'Marcar comprado',
        fn: function () { alternarComprado(it.id); } };
    }
    return null;
  }

  function pintarHojaItem() {
    var it = buscarItem(itemAbierto);
    if (!it) { cerrarHoja('tapaItem'); return; }
    $('itemTitulo').textContent = it.texto;
    var tt = $('txtTituloItem');
    tt.setAttribute('data-id', it.id);
    if (document.activeElement !== tt) { tt.value = it.texto; }
    tt.readOnly = soloLectura;
    ajustarAlto(tt);
    var ah = accionHecho(it), bh = $('btnHecho');
    bh.style.display = ah ? '' : 'none';
    if (ah) {
      rotular(bh, ah.txt, 'check');
      bh.className = ah.on ? 'rbtn hecho on' : 'rbtn hecho';
      bh.setAttribute('aria-pressed', ah.on ? 'true' : 'false');
    }
    var inf = estadoInfo(it.estado);
    $('itemSub').textContent = (it.tipo === 'compra' ? 'Compra \u00B7 ' : '') + inf.ico + ' ' + inf.nom +
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

    pintarOpciones('gridNivel', K.NIVELES, it.nivel, function (n) { return n.nom; },
      function (n) { fijarNivel(it.id, n.id); }, 'data-nivel');
    pintarOpciones('gridCtx', K.CONTEXTOS, it.contexto, function (c) { return c.nom; },
      function (c) { moverDeContexto(it.id, c.id); }, 'data-ctx');
    var hoyK = K.claveDia(new Date());
    var otroDia = it.fecha !== '' && it.fecha !== hoyK && it.fecha !== K.sumarDias(hoyK, 1);
    $('btnDiaHoy').className = it.fecha === hoyK ? 'rbtn on' : 'rbtn';
    $('btnDiaMan').className = it.fecha === K.sumarDias(hoyK, 1) ? 'rbtn on' : 'rbtn';
    $('btnDiaElegir').className = otroDia ? 'rbtn on' : 'rbtn';
    rotular($('btnDiaElegir'), otroDia ? nombreDia(it.fecha) : 'Elegir d\u00EDa', 'clock');
    $('btnSacarDia').style.display = it.fecha === '' ? 'none' : 'block';
    $('cajaDia').style.display = 'none';

    var gt = $('gridTags');
    while (gt.firstChild) { gt.removeChild(gt.firstChild); }
    var tg = listaTags(it.contexto);
    /* Si el item arrastra un tag que ya no se ofrece en este contexto, se agrega
       al final para poder verlo y sacarlo, en vez de perderlo en silencio. */
    if (it.tag !== '' && tagInfo(it.tag, it.contexto)) {
      var presente = false;
      for (i = 0; i < tg.length; i++) { if (tg[i].id === it.tag) { presente = true; } }
      if (!presente) { tg = tg.concat([tagInfo(it.tag, it.contexto)]); }
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
      bp.style.display = '';
      rotular(bp, it.pausado === true ? 'Reanudar la compra' : 'Pausar / En espera', it.pausado === true ? 'play' : 'pause');
      bp.className = it.pausado === true ? 'gbtn ancho on' : 'gbtn ancho';
    } else {
      bp.style.display = 'none';
    }
    if (it.pausado === true) {
      $('itemSub').textContent = $('itemSub').textContent + ' \u00B7 en espera';
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

    rotular($('btnAnclar'), it.anclado === true ? 'Anclado arriba de todo' : 'Anclar arriba de todo');
    $('btnAnclar').className = it.anclado === true ? 'gbtn ancho on' : 'gbtn ancho';

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
    $('btnHacerRutina').style.display = it.rutinaId === '' && it.tipo === 'tarea' ? '' : 'none';
    $('btnAcompra').style.display = it.tipo === 'compra' || it.rutinaId !== '' ? 'none' : '';
    $('btnVolverTarea').style.display = it.tipo === 'compra' ? '' : 'none';
  }

  /* Un toque, sin confirmacion: no se borra nada y se puede volver atras
     desde la ficha con "Volver a tarea". */
  function moverACompras(id) {
    var it = buscarItem(id);
    /* Una ocurrencia de rutina no es una compra: se completa o se omite. */
    if (!it || soloLectura || it.tipo === 'compra' || it.rutinaId !== '') { return; }
    var foto = fotoDe(it), antes = copiaItem(it);
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
      reponerItem(it, antes);
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
    var ahora = new Date(), antes = copiaItem(it);
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
    } else { reponerItem(it, antes); }
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
    if (soloLectura) { return; }
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

  /* Copia de todos los campos de un item, para volverlo atras entero si la
     escritura falla: lo que queda en memoria tiene que ser lo que esta en disco. */
  function copiaItem(it) {
    var c = {}, k;
    for (k in it) { if (it.hasOwnProperty(k)) { c[k] = it[k]; } }
    return c;
  }

  function reponerItem(it, copia) {
    var k;
    for (k in it) { if (it.hasOwnProperty(k) && !copia.hasOwnProperty(k)) { delete it[k]; } }
    for (k in copia) { if (copia.hasOwnProperty(k)) { it[k] = copia[k]; } }
  }

  function restaurarFoto(id, foto, textoEvento) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    var antes = copiaItem(it);
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
    } else { reponerItem(it, antes); }
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
      estadoVacio($('vacioBusca'), { id: 'buscar', ico: 'search', tit: 'Busc\u00E1 en todo KCO',
        txt: 'Tareas y compras de todos los contextos, por texto o etiqueta.' });
      return;
    }
    var i, n = 0, lim = limiteTrozo('resultados', q);
    for (i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      var t = tagInfo(it.tag, it.contexto);
      var heno = it.texto.toLowerCase() + ' ' + (t ? t.nom.toLowerCase() : '');
      if (heno.indexOf(q) === -1) { continue; }
      n++;
      if (n > lim) { continue; }
      (function (item) {
        var li = document.createElement('li');
        li.className = 'item st-' + item.estado + claseNivel(item);
        var e = document.createElement('div');
        e.className = 'etq';
        e.textContent = nomCtx(item.contexto) +
          (item.tipo === 'compra' ? ' \u00B7 Compra' : '');
        var tx = document.createElement('div');
        tx.className = 'txt';
        tx.textContent = item.texto;
        var l2 = document.createElement('div');
        l2.className = 'linea2';
        var inf = estadoInfo(item.estado);
        l2.appendChild(badge('est', inf.ico + ' ' + inf.nom));
        l2.appendChild(badge('', horaCorta(item.creado)));
        li.appendChild(e);
        li.appendChild(tx);
        li.appendChild(l2);
        li.onclick = function () {
          cerrarParaRelevo('tapaBuscar');
          if (item.contexto !== contexto) { aplicarContexto(item.contexto, true); }
          if (item.tipo === 'compra') { irAVista('compras'); }
          abrirItem(item.id);
          soltarRelevo();
        };
        cont.appendChild(li);
      })(it);
    }
    if (n > lim) { botonVerMas(cont, 'resultados', n - lim, pintarBusqueda); }
    $('vacioBusca').style.display = n === 0 ? 'block' : 'none';
    if (n === 0) {
      estadoVacio($('vacioBusca'), { id: 'sin-resultados', ico: 'search', tit: 'Sin resultados',
        txt: 'Nada coincide con \u201C' + $('txtBusca').value.replace(/^\s+|\s+$/g, '') + '\u201D. Prob\u00E1 con otra palabra.',
        acc: 'Borrar b\u00FAsqueda', alTocar: function () { $('txtBusca').value = ''; pintarBusqueda(); enfocar($('txtBusca')); } });
    }
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
      if (ev.tipo === 'estado' && esCerradoId(ev.hasta) && ev.hasta !== 'cancelado') { hechos.push(ev.texto); }
      if (ev.tipo === 'estado' && !esCerradoId(ev.hasta)) {
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
      if (ev.tipo === 'estado' && esCerradoId(ev.hasta) && ev.hasta !== 'cancelado') {
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
      /* Sin ningun backup no hay "hace N d" que contar: solo "nunca". */
      v.textContent = u ? horaCorta(u) + ' \u00B7 hace ' + dias + ' d' : 'nunca';
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
      items: items, eventos: eventos, rutinas: rutinas, proyectos: proyectos, progreso: memProgreso
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

  var AVISO_ESQUEMA_FUTURO = 'Los datos guardados son de una version mas nueva de KCO. No restauro para no pisarlos: actualiza la app primero.';

  function esObjeto(x) { return !!x && typeof x === 'object' && !esArray(x); }

  /* Todo o nada: primero se normaliza todo el backup sin tocar nada; recien
     despues se escribe. Si alguna escritura falla, se repone lo que habia
     (en memoria y en el almacenamiento) y se avisa que no cambio nada. */
  function aplicarBackup(datos) {
    if (esquemaFuturo) { avisar(AVISO_ESQUEMA_FUTURO); return false; }
    var nuevosItems = [], nuevosEventos = [], nuevasRutinas = [], nuevosProyectos = [];
    var nuevoProgreso, conProgreso, i, n;
    try {
      for (i = 0; i < datos.items.length; i++) {
        n = normalizarItem(datos.items[i]);
        if (n) { nuevosItems.push(n); }
      }
      if (esArray(datos.eventos)) {
        for (i = 0; i < datos.eventos.length; i++) {
          n = normalizarEvento(datos.eventos[i]);
          if (n) { nuevosEventos.push(n); }
        }
      }
      if (esArray(datos.rutinas)) {
        for (i = 0; i < datos.rutinas.length; i++) {
          n = normRutina(datos.rutinas[i]);
          if (n) { nuevasRutinas.push(n); }
        }
      }
      if (esArray(datos.proyectos)) {
        for (i = 0; i < datos.proyectos.length; i++) {
          n = K.normalizarProyecto(datos.proyectos[i]);
          if (n) { nuevosProyectos.push(n); }
        }
      }
      conProgreso = esObjeto(datos.progreso);
      nuevoProgreso = normalizarProgreso(conProgreso ? datos.progreso : null);
    } catch (e) {
      avisar('El backup trae datos que no se pueden leer. No se cambio nada.');
      return false;
    }
    /* Un progreso roto que no se pudo copiar se copia ahora; si tampoco se
       puede, la escritura del progreso falla y el restore se deshace entero. */
    if (progresoSinCopia && ponerEnCuarentena(K_PROGRESO, leer(K_PROGRESO))) { progresoSinCopia = false; }
    var claves = [K_ITEMS, K_EVENTOS, K_RUTINAS, K_PROYECTOS, K_PROGRESO, K_ESQUEMA];
    var crudos = [], j;
    for (j = 0; j < claves.length; j++) { crudos.push(leer(claves[j])); }
    var antes = { items: items, eventos: eventos, rutinas: rutinas, proyectos: proyectos,
      progreso: memProgreso, soloLectura: soloLectura };
    items = nuevosItems;
    eventos = nuevosEventos;
    rutinas = nuevasRutinas;
    proyectos = nuevosProyectos;
    memProgreso = nuevoProgreso;
    soloLectura = false;
    /* Backup anterior a 2.0 (sin progreso): se siembra en silencio, igual que
       la primera vez, para no festejar de nuevo toda la historia. */
    if (!conProgreso) {
      memProgreso.nivelVisto = K.nivelPorXP(xpTotal()).nivel;
      revisarLogros(true);
    }
    var ok = guardarItems() && guardarEventos() && guardarRutinas() && guardarProyectos() &&
      guardarProgreso() && escribir(K_ESQUEMA, '' + ESQUEMA);
    if (!ok) {
      for (j = 0; j < claves.length; j++) {
        if (leer(claves[j]) !== crudos[j]) { reponerCrudo(claves[j], crudos[j]); }
      }
      items = antes.items;
      eventos = antes.eventos;
      rutinas = antes.rutinas;
      proyectos = antes.proyectos;
      memProgreso = antes.progreso;
      soloLectura = antes.soloLectura;
      avisar('No se pudo restaurar el backup (fallo al guardar). No se cambio nada.');
      pintar();
      return false;
    }
    generarOcurrencias();
    $('aviso').className = 'aviso';
    anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'restauracion', itemId: '',
      texto: nuevosItems.length + ' items restaurados', contexto: ctxCaptura, desde: '', hasta: ''
    }]);
    pintar();
    return true;
  }

  /* Vuelve una clave a su valor crudo previo (o la borra si no existia). */
  function reponerCrudo(clave, crudo) {
    try {
      if (crudo === null) { window.localStorage.removeItem(clave); } else { window.localStorage.setItem(clave, crudo); }
    } catch (e) { /* nada mas para hacer: el aviso ya esta */ }
  }

  function procesarImportacion(texto) {
    if (esquemaFuturo) { avisar(AVISO_ESQUEMA_FUTURO); return; }
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
      rotular(b, modoLuz ? 'Modo luz de planta: activado' : 'Modo luz de planta');
      b.className = modoLuz ? 'bloque pri' : 'bloque';
    }
    if (guardar) { escribir(K_LUZ, modoLuz ? '1' : '0'); }
  }

  /* Selector Sistema / Claro / Oscuro de Ajustes. tema.js ya aplico el tema antes
     de pintar; si por algo no cargo, el selector queda sin efecto pero no rompe. */
  function pintarTema() {
    var pref = window.KCOTema ? window.KCOTema.preferencia() : 'sistema';
    var bs = $('segTema').getElementsByTagName('button');
    var i;
    for (i = 0; i < bs.length; i++) {
      var on = bs[i].getAttribute('data-tema') === pref;
      bs[i].className = on ? 'segbtn on' : 'segbtn';
      bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function elegirTema(pref) {
    if (!window.KCOTema) { return; }
    escribir(K_TEMA, window.KCOTema.elegir(pref));
    pintarTema();
  }

  function aplicarContexto(nuevo, guardar) {
    contexto = nuevo === 'todo' ? 'todo' : (K.normalizarContexto(nuevo) || 'todo');
    if (contexto !== 'todo') { ctxCaptura = contexto; }
    ctxDestino = '';
    aplicarLuz(false);
    pintarPistaCaptura();
    pintarChipsCaptura();
    if (guardar) {
      escribir(K_CTX, contexto);
      escribir(K_CTXCAP, ctxCaptura);
    }
    pintar();
    chequearRecordatorios();
  }

  /* ---------- interfaz ---------- */


  decorarIconos();
  prepararHojas();

  $('btnCtx').onclick = function () { abrirSelectorContexto(); };

  /* Escribiendo en movil la barra de pestanas se aparta y la captura baja al
     borde: queda pegada al teclado y nada flota encima del campo (kco.css). */
  (function () {
    var inp = $('txtCaptura'), raiz = document.documentElement;
    inp.addEventListener('focus', function () { raiz.setAttribute('data-escribiendo', '1'); });
    inp.addEventListener('blur', function () { raiz.removeAttribute('data-escribiendo'); });
  })();

  $('txtCaptura').onkeydown = function (ev) {
    var k = ev.key || ev.keyCode;
    if (k === 'Enter' || k === 13) { ev.preventDefault(); capturar(); }
  };
  $('txtCaptura').addEventListener('input', pintarChipsCaptura);
  $('capCtx').onclick = function () { abrirDestinoCaptura(); };

  /* n o / llevan a la barra de captura (Todoist, Gmail), salvo que ya se este
     escribiendo en un campo o haya una hoja abierta: nunca se roba una tecla. */
  function esEditable(el) {
    if (!el || !el.tagName) { return false; }
    var t = el.tagName.toLowerCase();
    return t === 'input' || t === 'textarea' || t === 'select' || el.isContentEditable === true;
  }

  /* Filas de la vista actual que se ven (las de una hoja no cuentan: con una
     hoja abierta no hay atajos). */
  function filasVisibles() {
    var l = document.querySelectorAll('main li.item'), r = [], i;
    for (i = 0; i < l.length; i++) { if (l[i].offsetParent !== null) { r.push(l[i]); } }
    return r;
  }

  /* Seleccion de teclado: la fila elegida recibe el foco (todas son
     tabbables) y la clase kbsel, que le da el anillo de foco visible. */
  function seleccionarFila(li) {
    var l = document.querySelectorAll('li.item.kbsel'), i;
    for (i = 0; i < l.length; i++) { l[i].classList.remove('kbsel'); }
    if (!li) { return; }
    li.classList.add('kbsel');
    enfocar(li);
    try { li.scrollIntoView({ block: 'nearest' }); } catch (e) { /* sin scroll */ }
  }

  /* j / k bajan y suben por las filas, x completa o reabre la elegida (con
     deshacer, como el circulo), Enter la abre (onkeydown de la fila). */
  function atajoLista(k) {
    var filas = filasVisibles(), pos = -1, i, it, ah;
    if (filas.length === 0) { return false; }
    for (i = 0; i < filas.length; i++) { if (filas[i] === document.activeElement) { pos = i; } }
    if (pos === -1) {
      for (i = 0; i < filas.length; i++) { if (filas[i].classList.contains('kbsel')) { pos = i; } }
    }
    if (k === 'x') {
      if (pos === -1) { return false; }
      it = buscarItem(filas[pos].getAttribute('data-id'));
      ah = it ? accionHecho(it) : null;
      if (!ah) { return false; }
      ah.fn();
      filas = filasVisibles();
      if (filas.length > 0) { seleccionarFila(filas[Math.min(pos, filas.length - 1)]); }
      return true;
    }
    if (pos === -1) { pos = 0; } else if (k === 'j') { pos = Math.min(pos + 1, filas.length - 1); } else { pos = Math.max(pos - 1, 0); }
    seleccionarFila(filas[pos]);
    return true;
  }

  /* n, /, j, k, x: nunca con modificadores, con una hoja abierta ni adentro
     de un campo editable. */
  document.addEventListener('keydown', function (ev) {
    var k = ev.key || '';
    if (k !== 'n' && k !== '/' && k !== 'j' && k !== 'k' && k !== 'x') { return; }
    if (ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) { return; }
    if (capaArriba() || esEditable(ev.target) || esEditable(document.activeElement)) { return; }
    if (k === 'j' || k === 'k' || k === 'x') {
      if (atajoLista(k)) { ev.preventDefault(); }
      return;
    }
    ev.preventDefault();
    enfocar($('txtCaptura'));
  });

  $('tabAhora').onclick = function () { irAVista('ahora'); };
  $('tabHoy').onclick = function () { irAVista('hoy'); };
  $('tabTareas').onclick = function () { irAVista(vista === 'compras' ? 'compras' : 'tablero'); };
  $('segBtnTareas').onclick = function () { irAVista('tablero'); };
  $('segBtnCompras').onclick = function () { irAVista('compras'); };
  $('tabRegistro').onclick = function () { irAVista('registro'); };
  $('tabMisiones').onclick = function () { irAVista('misiones'); };
  $('btnModoDiario').onclick = function () { modoDiario = 'diario'; pintar(); };
  $('btnModoRegistro').onclick = function () { modoDiario = 'registro'; pintar(); };
  $('btnModoCampana').onclick = function () { modoDiario = 'campana'; pintar(); };
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
  acercarAlTeclado($('txtHito'));
  acercarAlTeclado($('txtMisTarea'));



  $('btnGuardarEspera').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it || soloLectura) { return; }
    var antes = copiaItem(it);
    it.espera = $('txtEspera').value.replace(/^\s+|\s+$/g, '');
    it.actualizado = new Date().toISOString();
    if (guardarItems()) { registrar('espera', it, '', it.espera); pintar(); pintarHojaItem(); }
    else { reponerItem(it, antes); }
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
  $('btnNuevaRutina').onclick = function () { abrirRutina(null); };
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
    var antes = copiaItem(it);
    it.recordatorio = '';
    it.recAvisado = false;
    it.actualizado = new Date().toISOString();
    if (guardarItems()) {
      registrar('recordatorio', it, '', '');
      pintar();
      pintarHojaItem();
      chequearRecordatorios();
    } else { reponerItem(it, antes); }
  };

  $('btnAcompra').onclick = function () {
    if (itemAbierto) { moverACompras(itemAbierto); }
  };

  $('btnVolverTarea').onclick = function () {
    if (itemAbierto) { volverATarea(itemAbierto); }
  };

  /* Titulo editable arriba de la ficha: Enter o salir del campo guarda (por
     editarTexto, con registro y deshacer); Shift+Enter hace un salto de linea;
     Escape descarta lo escrito. El id del item viaja en el campo, asi un blur
     que llega despues de cerrar la ficha igual guarda en el item correcto. */
  (function () {
    var t = $('txtTituloItem');
    function guardarTitulo() {
      var id = t.getAttribute('data-id'), it = buscarItem(id);
      if (!it) { return; }
      if (!editarTexto(id, t.value)) { t.value = it.texto; }
      ajustarAlto(t);
    }
    t.addEventListener('blur', guardarTitulo);
    t.addEventListener('input', function () { ajustarAlto(t); });
    t.onkeydown = function (ev) {
      var k = ev.key || ev.keyCode;
      if ((k === 'Enter' || k === 13) && !ev.shiftKey) { ev.preventDefault(); guardarTitulo(); t.blur(); }
      if (k === 'Escape' || k === 'Esc' || k === 27) {
        var it = buscarItem(t.getAttribute('data-id'));
        if (it && t.value !== it.texto) {
          if (ev.stopPropagation) { ev.stopPropagation(); }
          ev.preventDefault();
          t.value = it.texto;
          ajustarAlto(t);
        }
      }
    };
  })();

  $('btnHecho').onclick = function () {
    var it = buscarItem(itemAbierto), a = it ? accionHecho(it) : null;
    if (a) { a.fn(); }
  };

  $('btnCompartirItem').onclick = function () {
    var it = buscarItem(itemAbierto);
    if (!it) { return; }
    var t = it.texto + '\n(' + estadoInfo(it.estado).nom + ' \u00B7 ' +
      nomCtx(it.contexto) + ' \u00B7 KCO)';
    if (!navigator.share) { mostrarTexto('Compartir item', t); return; }
    compartir('KCO', t);
  };

  $('btnBorrar').onclick = function () { if (itemAbierto) { pedirBorrar(itemAbierto); } };

  /* Borrar pide confirmacion (desde la ficha o el menu rapido). */
  function pedirBorrar(id) {
    var it = buscarItem(id);
    if (!it || soloLectura) { return; }
    /* La ocurrencia vigente de una rutina activa no se borra: se volveria a
       generar sola. Se cierra como omitida y queda en el historial. */
    if (ocurrenciaVigente(it)) {
      pedirConfirmacion('Borrar ocurrencia', 'Es la ocurrencia vigente de la rutina "' + it.texto +
        '". Si se borra vuelve a aparecer, asi que se marca como omitida y queda en el historial.', function () {
        cerrarOcurrencia(it.id, 'omitida');
        itemAbierto = null;
        cerrarHoja('tapaItem');
        pintar();
      });
      return;
    }
    pedirConfirmacion('Borrar item', 'Se borra "' + it.texto + '". Vas a tener unos segundos para deshacerlo.', function () {
      var i, pos = -1;
      for (i = 0; i < items.length; i++) {
        if (items[i].id === it.id) { pos = i; break; }
      }
      if (pos === -1) { return; }
      var copia = items[pos];
      items.splice(pos, 1);
      /* Si no se pudo guardar, el item vuelve a su lugar y no hay nada que
         deshacer: el aviso de escribir ya explica que paso. */
      if (!guardarItems()) { items.splice(pos, 0, copia); pintar(); return; }
      registrar('borrado', it, it.estado, '');
      itemAbierto = null;
      cerrarHoja('tapaItem');
      pintar();
      chequearRecordatorios();
      (function (guardado, donde) {
        ofrecerDeshacer('Borrado: ' + guardado.texto, function () {
          if (soloLectura) { return; }
          var lugar = donde > items.length ? items.length : donde;
          items.splice(lugar, 0, guardado);
          if (guardarItems()) {
            registrar('deshacer', guardado, 'borrado', guardado.estado);
            pintar();
          } else { items.splice(lugar, 1); }
        });
      })(copia, pos);
    });
  }

  (function () {
    var l = document.querySelectorAll('#tapaRapido [data-rap]'), i;
    for (i = 0; i < l.length; i++) {
      (function (b) { b.onclick = function () { accionRapida(b.getAttribute('data-rap')); }; })(l[i]);
    }
    $('btnRapFicha').onclick = function () { accionRapida('ficha'); };
  })();

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

  $('btnRelevo').onclick = function () { mostrarTexto('Reporte de Turno', textoRelevo()); };
  $('btnResumen').onclick = function () { mostrarTexto('Resumen', textoResumen()); };
  $('btnCompartirTexto').onclick = function () {
    var t = $('txtSalida').value;
    if (navigator.share) { compartir('KCO', t); } else { copiar(t); }
  };
  $('btnCopiarTexto').onclick = function () { copiar($('txtSalida').value); };

  $('btnAjustes').onclick = function () {
    actualizarAvisoBackup();
    pintarCatalogos();
    $('vApp').textContent = VERSION_APP;
    $('vEsquema').textContent = '' + ESQUEMA;
    $('vTotal').textContent = '' + items.length;
    $('vEventos').textContent = '' + eventos.length;
    $('vNotif').textContent = estadoNotif();
    pintarTema();
    abrirHoja('tapaAjustes');
  };

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

  (function () {
    var bs = $('segTema').getElementsByTagName('button');
    var i;
    for (i = 0; i < bs.length; i++) {
      bs[i].onclick = function () { elegirTema(this.getAttribute('data-tema')); };
    }
  })();

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

  /* ---------- progreso: XP y nivel ---------- */

  function normalizarProgreso(x) {
    var r = { nivelVisto: 1, logros: {} }, k;
    if (!x || typeof x !== 'object') { return r; }
    var n = parseInt(x.nivelVisto, 10);
    r.nivelVisto = isNaN(n) || n < 1 ? 1 : (n > 999 ? 999 : n);
    if (x.logros && typeof x.logros === 'object') {
      for (k in x.logros) {
        if (Object.prototype.hasOwnProperty.call(x.logros, k) && /^[a-z0-9_]{1,40}$/.test(k) && typeof x.logros[k] === 'string') { r.logros[k] = x.logros[k]; }
      }
    }
    return r;
  }

  /* El progreso se puede regenerar desde la historia, asi que uno ilegible no
     pone la app en solo lectura: se guarda la copia intacta y se siembra de
     nuevo en silencio. Sin copia no se pisa nunca. */
  function cargarProgreso() {
    var crudo = leer(K_PROGRESO);
    progresoNuevo = false;
    progresoSinCopia = false;
    if (crudo === null || crudo === '') { progresoNuevo = true; return normalizarProgreso(null); }
    var datos = null;
    try { datos = JSON.parse(crudo); } catch (e) { datos = null; }
    if (!esObjeto(datos)) {
      if (ponerEnCuarentena(K_PROGRESO, crudo)) { progresoNuevo = true; } else { progresoSinCopia = true; }
      return normalizarProgreso(null);
    }
    return normalizarProgreso(datos);
  }

  function guardarProgreso() {
    if (soloLectura || progresoSinCopia) { return false; }
    return escribir(K_PROGRESO, JSON.stringify(memProgreso));
  }

  function xpTotal() { return K.calcularXP(items, proyectos).total; }

  /* Despues de algo que puede dar XP: devuelve el texto de feedback y, si se
     subio de nivel, lo deja en el diario. El nivel celebrado nunca baja: si se
     reabre algo y se pierde XP, no se vuelve a festejar el mismo nivel. */
  function feedbackProgreso(xpAntes) {
    var ahora = xpTotal(), d = ahora - xpAntes, txt = '';
    if (d > 0) { txt = ' \u00B7 +' + d + ' XP'; }
    var nv = K.nivelPorXP(ahora);
    if (nv.nivel > memProgreso.nivelVisto && !soloLectura) {
      memProgreso.nivelVisto = nv.nivel;
      guardarProgreso();
      anotarEventos([{ id: nuevoId('e'), ts: new Date().toISOString(), tipo: 'nivel', itemId: '',
        texto: nv.titulo, contexto: ctxCaptura, desde: '', hasta: '' + nv.nivel }]);
      txt = txt + ' \u00B7 \u2B50 Nivel ' + nv.nivel + '!';
    }
    return txt + revisarLogros();
  }

  function pintarProgresoArriba(cont) {
    var x = K.calcularXP(items, proyectos);
    var nv = K.nivelPorXP(x.total);
    var hoyXP = x.porDia['#' + hoyClave()] || 0;
    var c = nodo('button', 'progxp');
    c.type = 'button';
    c.id = 'tarjetaNivel';
    var fila = nodo('div', 'progxp-fila');
    fila.appendChild(nodo('span', 'progxp-nv', 'NV ' + nv.nivel + ' \u00B7 ' + nv.titulo, 'star'));
    fila.appendChild(nodo('span', 'mono progxp-n', nv.enNivel + '/' + nv.tramo + ' XP'));
    c.appendChild(fila);
    var barra = nodo('div', 'barra');
    var bi = nodo('i', '');
    bi.style.width = nv.pct + '%';
    barra.appendChild(bi);
    c.appendChild(barra);
    var det = [hoyXP > 0 ? '+' + hoyXP + ' XP hoy' : 'Hoy todavia sin XP', x.total + ' XP en total', 'faltan ' + nv.falta + ' para NV ' + (nv.nivel + 1)];
    var racha = rachaGlobal();
    if (racha.actual > 0) { det.unshift('\uD83D\uDD25 ' + racha.actual + (racha.actual === 1 ? ' dia' : ' dias')); }
    c.appendChild(nodo('div', 'mono progxp-det', det.join(' \u00B7 ')));
    c.onclick = function () { irAVista('registro'); modoDiario = 'campana'; pintar(); };
    cont.appendChild(c);
  }

  /* ---------- logros y racha ---------- */

  function rachaGlobal() { return K.rachaGlobal(items, proyectos, hoyClave()); }

  /* Desbloquea lo que ya se cumple. Silencioso en la primera carga de 2.0:
     la historia previa gana sus logros sin fingir que todo paso hoy. */
  /* Un logro anunciado se escribe primero en el diario y despues en progreso.
     Si el diario no se puede guardar (almacenamiento lleno), el logro NO se marca
     como ganado: anotarEventos ya aviso "No se pudo guardar el registro" y la
     proxima accion lo vuelve a detectar y anunciar. Asi nunca queda un logro
     ganado que el diario no muestra. Si lo que falla es progreso, escribir()
     avisa y la memoria lo conserva: en esta sesion no se repite. */
  function revisarLogros(silencioso) {
    if (soloLectura) { return ''; }
    var nuevos = K.logrosNuevos(K.estadisticas(items, proyectos, rutinas, hoyClave()), memProgreso.logros);
    if (nuevos.length === 0) { return ''; }
    var ahora = new Date().toISOString(), txt = '', i, evs = [];
    if (!silencioso) {
      for (i = 0; i < nuevos.length; i++) {
        evs.push({ id: nuevoId('e'), ts: ahora, tipo: 'logro', itemId: '', texto: nuevos[i].desc,
          contexto: ctxCaptura, desde: nuevos[i].id, hasta: nuevos[i].nom });
        txt = txt + ' \u00B7 \uD83C\uDFC6 ' + nuevos[i].nom;
      }
      if (!anotarEventos(evs)) { return ''; }
    }
    for (i = 0; i < nuevos.length; i++) { memProgreso.logros[nuevos[i].id] = ahora; }
    guardarProgreso();
    return txt;
  }
  /* ---------- campaña: mirar hacia atras y ver que se avanzo ---------- */

  function statTile(cont, valor, rot, sub) {
    var t = nodo('div', 'stat');
    t.appendChild(nodo('b', 'mono', '' + valor));
    t.appendChild(nodo('span', '', rot));
    if (sub) { t.appendChild(nodo('small', 'mono', sub)); }
    cont.appendChild(t);
  }

  function fechaLarga(clave) {
    if (!clave) { return ''; }
    var d = K.deClave(clave);
    return d.getDate() + ' ' + MESES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function pintarCampana() {
    var cont = $('campanaCuerpo');
    vaciar(cont);
    var hoy = hoyClave();
    var st = K.estadisticas(items, proyectos, rutinas, hoy);
    var nv = K.nivelPorXP(st.xp);

    /* Campana vacia: sin un primer dia activo no hay racha, semanas ni
       contextos que mostrar; en vez de una pared de ceros, que hacer y los
       logros que esperan. */
    if (!st.primerDia) {
      cont.appendChild(vacioNuevo('div', { id: 'campana', ico: 'trophy', tit: 'La campa\u00F1a todav\u00EDa no empez\u00F3',
        txt: 'Complet\u00E1 tu primera tarea: desde ese d\u00EDa cuentan los d\u00EDas activos, la racha, el XP y los logros.',
        acc: 'Ir a Ahora', accIco: 'zap', alTocar: function () { irAVista('ahora'); } }));
      pintarLogros(cont);
      return;
    }

    var cab = nodo('div', 'camp-cab');
    cab.appendChild(nodo('div', 'camp-nv', 'Nivel ' + nv.nivel, 'star'));
    cab.appendChild(nodo('div', 'camp-tit', nv.titulo));
    cab.appendChild(nodo('div', 'mono camp-xp', st.xp + ' XP \u00B7 faltan ' + nv.falta + ' para el nivel ' + (nv.nivel + 1)));
    var barra = nodo('div', 'barra');
    var bi = nodo('i', '');
    bi.style.width = nv.pct + '%';
    barra.appendChild(bi);
    cab.appendChild(barra);
    cab.appendChild(nodo('div', 'mono camp-desde', st.primerDia
      ? 'Campa\u00F1a en curso desde el ' + fechaLarga(st.primerDia)
      : 'La campa\u00F1a empieza con lo primero que completes.'));
    cont.appendChild(cab);

    var g = nodo('div', 'stats');
    statTile(g, st.diasActivos, 'dias activos', 'nunca baja');
    statTile(g, st.racha, 'racha actual', 'mejor ' + st.rachaMejor + (st.racha > 0 && !st.hoyActivo ? ' \u00B7 hoy en juego' : ''));
    statTile(g, st.tareasHechas + st.comprasHechas, 'completadas', st.rutinasHechas + ' rutinas aparte');
    statTile(g, st.misionesFin, 'misiones cumplidas', st.hitos + ' hitos');
    cont.appendChild(g);

    pintarSemanas(cont, st.semanas);
    pintarPorContexto(cont, st);
    pintarLogros(cont);

    var fin = [], i;
    for (i = 0; i < proyectos.length; i++) { if (proyectos[i].estado === 'terminado') { fin.push(proyectos[i]); } }
    if (fin.length > 0) {
      fin.sort(function (a, b) { return a.terminado < b.terminado ? 1 : -1; });
      var s = nodo('section', 'sec');
      var h = nodo('h3', 'sec-tit');
      h.appendChild(nodo('span', '', 'Lo que terminaste', 'flag'));
      h.appendChild(nodo('b', 'mono', '' + fin.length));
      s.appendChild(h);
      for (i = 0; i < fin.length && i < 12; i++) { s.appendChild(nodoMision(fin[i], true)); }
      cont.appendChild(s);
    }
  }

  /* Una serie (avances por semana): barras de un solo tono, base comun, sin
     segundo eje. Tocar una barra dice su valor; el resumen va en texto. */
  function pintarSemanas(cont, semanas) {
    var s = nodo('section', 'sec');
    var h = nodo('h3', 'sec-tit');
    h.appendChild(nodo('span', '', '\u00DAltimas 12 semanas', 'trending-up'));
    var total = 0, max = 0, i;
    for (i = 0; i < semanas.length; i++) { total += semanas[i].avances; if (semanas[i].avances > max) { max = semanas[i].avances; } }
    h.appendChild(nodo('b', 'mono', total + ' avances'));
    s.appendChild(h);
    var cap = nodo('div', 'mono sem-cap', 'Toca una semana para ver el detalle.');
    var graf = nodo('div', 'semanas');
    graf.setAttribute('role', 'img');
    var resumen = [];
    for (i = 0; i < semanas.length; i++) {
      (function (w, ultima) {
        var p = w.desde.split('-');
        var etiqueta = 'Semana del ' + p[2] + '/' + p[1] + ': ' + w.avances + ' avances en ' + w.diasActivos + ' dias';
        resumen.push(p[2] + '/' + p[1] + ' ' + w.avances);
        var col = nodo('button', 'sem' + (ultima ? ' actual' : ''));
        col.type = 'button';
        col.setAttribute('title', etiqueta);
        col.setAttribute('aria-label', etiqueta);
        var barra = nodo('i', '');
        barra.style.height = (max === 0 ? 0 : Math.max(w.avances > 0 ? 6 : 0, Math.round((w.avances * 100) / max))) + '%';
        col.appendChild(barra);
        col.onclick = function () { cap.textContent = etiqueta + (ultima ? ' (esta semana)' : ''); };
        graf.appendChild(col);
      })(semanas[i], i === semanas.length - 1);
    }
    graf.setAttribute('aria-label', 'Avances por semana: ' + resumen.join(', '));
    s.appendChild(graf);
    s.appendChild(cap);
    cont.appendChild(s);
  }

  /* Donde se fue el esfuerzo: completadas y XP por contexto, rotulo en texto. */
  function pintarPorContexto(cont, st) {
    var s = nodo('section', 'sec');
    var h = nodo('h3', 'sec-tit');
    h.appendChild(nodo('span', '', 'Actividad por contexto', 'compass'));
    s.appendChild(h);
    var max = 0, i, c, n;
    for (i = 0; i < K.CONTEXTOS.length; i++) { n = st.porContexto[K.CONTEXTOS[i].id] || 0; if (n > max) { max = n; } }
    for (i = 0; i < K.CONTEXTOS.length; i++) {
      c = K.CONTEXTOS[i];
      n = st.porContexto[c.id] || 0;
      var xp = st.xpPorContexto['#' + c.id] || 0;
      var f = nodo('div', 'ctxbar' + (n === 0 ? ' cero' : ''));
      var cn = nodo('span', 'ctxbar-nom', c.nom);
      cn.insertBefore(punto(c.id), cn.firstChild);
      f.appendChild(cn);
      var pista = nodo('span', 'ctxbar-pista');
      var b = nodo('i', '');
      b.style.width = (max === 0 ? 0 : Math.round((n * 100) / max)) + '%';
      pista.appendChild(b);
      f.appendChild(pista);
      f.appendChild(nodo('span', 'mono ctxbar-n', n + ' \u00B7 ' + xp + ' XP'));
      s.appendChild(f);
    }
    cont.appendChild(s);
  }

  function pintarLogros(cont) {
    var s = nodo('section', 'sec');
    s.id = 'secLogros';
    var h = nodo('h3', 'sec-tit');
    var ganados = 0, i;
    for (i = 0; i < K.LOGROS.length; i++) { if (memProgreso.logros.hasOwnProperty(K.LOGROS[i].id)) { ganados++; } }
    h.appendChild(nodo('span', '', 'Logros', 'trophy'));
    h.appendChild(nodo('b', 'mono', ganados + '/' + K.LOGROS.length));
    s.appendChild(h);
    var st = K.estadisticas(items, proyectos, rutinas, hoyClave());
    var g = nodo('div', 'logros');
    for (i = 0; i < K.LOGROS.length; i++) {
      var l = K.LOGROS[i];
      var gano = memProgreso.logros.hasOwnProperty(l.id);
      var c = nodo('div', 'logro' + (gano ? ' ganado' : '') + (!gano && l.secreto ? ' secreto' : ''));
      c.setAttribute('data-logro', l.id);
      if (!gano && l.secreto) {
        c.appendChild(nodo('div', 'logro-ico', '\u2753'));
        c.appendChild(nodo('b', '', 'Logro secreto'));
        c.appendChild(nodo('small', '', 'Se revela cuando lo ganes.'));
      } else {
        c.appendChild(nodo('div', 'logro-ico', l.ico));
        c.appendChild(nodo('b', '', l.nom));
        c.appendChild(nodo('small', '', l.desc));
        var meta = K.metaLogro(l, st), v = Math.min(st[l.campo] || 0, meta);
        c.appendChild(nodo('small', 'mono logro-est', gano
          ? '\u2714 ' + fechaNota(memProgreso.logros[l.id])
          : (meta > 1 ? v + '/' + meta : 'pendiente')));
      }
      g.appendChild(c);
    }
    s.appendChild(g);
    cont.appendChild(s);
  }

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

  function registrarMision(tipo, p, hasta, desde) {
    if (soloLectura) { return false; }
    return anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo, itemId: p.id,
      texto: p.nombre, contexto: p.contexto, desde: desde || '', hasta: hasta || ''
    }]);
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
    var mn = nodo('span', 'mis-nom', p.nombre);
    mn.insertBefore(punto(p.contexto), mn.firstChild);
    top.appendChild(mn);
    top.appendChild(nodo('b', 'mono mis-pct', pr.pct + '%'));
    c.appendChild(top);
    var barra = nodo('div', 'barra');
    var bi = nodo('i', '');
    bi.style.width = pr.pct + '%';
    barra.appendChild(bi);
    c.appendChild(barra);
    if (p.estado === 'terminado') {
      c.appendChild(nodo('div', 'mis-prox mono', 'Misi\u00F3n cumplida ' + (p.terminado ? fechaNota(p.terminado) : ''), 'flag'));
    } else {
      var px = textoProxima(p);
      c.appendChild(nodo('div', 'mis-prox' + (px ? '' : ' vacia'), px ? px.txt : '\u2192 Defini la proxima accion'));
    }
    if (!compacto) {
      var meta = [];
      if (pr.hitosTotal > 0) { meta.push(pr.hitosHechos + '/' + pr.hitosTotal + ' hitos'); }
      meta.push(pr.tareasHechas + '/' + pr.tareasTotal + ' tareas');
      if (p.estado === 'pausado') { meta.push('en pausa'); }
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
    h.appendChild(nodo('span', '', 'Misiones activas', 'target'));
    h.appendChild(nodo('b', 'mono', '' + act.length));
    s.appendChild(h);
    var i;
    for (i = 0; i < act.length && i < 4; i++) { s.appendChild(nodoMision(act[i], true)); }
    cont.appendChild(s);
  }

  function pintarMisiones() {
    var cont = $('misionesCuerpo');
    vaciar(cont);
    var nueva = nodo('button', 'bloque pri', 'Nueva misi\u00F3n', 'plus');
    nueva.type = 'button';
    nueva.id = 'btnNuevaMision';
    nueva.onclick = function () { abrirMision(null); };
    var act = misionesVisibles('activo'), pau = misionesVisibles('pausado'), fin = misionesVisibles('terminado'), i;
    if (act.length + pau.length + fin.length === 0) {
      cont.appendChild(vacioNuevo('div', { id: 'misiones', ico: 'target',
        tit: contexto === 'todo' ? 'Sin misiones todav\u00EDa' : 'Sin misiones en ' + nomCtx(contexto),
        txt: 'Una misi\u00F3n es un objetivo con hitos y tareas. KCO te dice cu\u00E1l es el pr\u00F3ximo movimiento de cada una.',
        acc: 'Nueva misi\u00F3n', accIco: 'plus', accId: 'btnNuevaMision', alTocar: function () { abrirMision(null); } }));
      return;
    }
    cont.appendChild(nueva);
    function grupo(titulo, lista, id, ico) {
      if (lista.length === 0) { return; }
      var s = nodo('section', 'sec');
      s.id = id;
      var h = nodo('h3', 'sec-tit');
      h.appendChild(nodo('span', '', titulo, ico));
      h.appendChild(nodo('b', 'mono', '' + lista.length));
      s.appendChild(h);
      for (i = 0; i < lista.length; i++) { s.appendChild(nodoMision(lista[i], false)); }
      cont.appendChild(s);
    }
    grupo('Activas', act, 'secMisActivas', 'target');
    grupo('En pausa', pau, 'secMisPausadas', 'pause');
    grupo('Cumplidas', fin, 'secMisCumplidas', 'flag');
  }

  /* ---------- hoja de mision ---------- */

  var misionAbierta = null;
  var misBorradorCtx = '';

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
    pintarOpciones('gridMisCtx', K.CONTEXTOS, misBorradorCtx, function (c) { return c.nom; },
      function (c) {
        misBorradorCtx = c.id;
        if (p) { guardarDatosMision(); } else { pintarHojaMision(); }
      }, 'data-ctx');
    $('btnGuardarMision').style.display = p ? 'none' : 'block';
    $('cajaMisExistente').style.display = p ? 'block' : 'none';
    if (!p) { $('misSub').textContent = 'Nombre y objetivo. Los hitos y las tareas se agregan despues.'; return; }
    var pr = K.progresoProyecto(p, items);
    $('misSub').textContent = (p.estado === 'terminado' ? 'Cumplida' : (p.estado === 'pausado' ? 'En pausa' : 'Activa')) +
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
          var b = nodo('button', 'bloque pri', ap.txt, ap.ico);
          b.type = 'button';
          b.setAttribute('data-mis', 'hecho');
          b.onclick = function () { ap.fn(); pintarHojaMision(); };
          box.appendChild(b);
        }
      } else if (px.accion.tipo === 'hito') {
        var bh = nodo('button', 'bloque pri', 'Hito cumplido', 'check');
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
    rotular($('btnMisPausa'), p.estado === 'pausado' ? 'Reactivar misi\u00F3n' : 'Pausar misi\u00F3n', p.estado === 'pausado' ? 'play' : 'pause');
    rotular($('btnMisTerminar'), p.estado === 'terminado' ? 'Reabrir misi\u00F3n' : 'Completar misi\u00F3n', p.estado === 'terminado' ? 'undo' : 'flag');
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
    var xpAntes = xpTotal();
    h.hecho = !h.hecho;
    h.cuando = h.hecho ? new Date().toISOString() : '';
    tocarMision(p);
    if (!guardarProyectos()) { h.hecho = !h.hecho; return; }
    registrarMision(h.hecho ? 'hito' : 'hito_reabre', p, h.texto, '' + K.progresoProyecto(p, items).pct);
    pintarHojaMision();
    pintar();
    var fb = feedbackProgreso(xpAntes);
    if (h.hecho) { celebrar('\uD83C\uDFAF Hito cumplido: ' + h.texto + fb); }
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
      var xpAntes = xpTotal();
      q.estado = 'terminado';
      q.terminado = new Date().toISOString();
      tocarMision(q);
      if (!guardarProyectos()) { q.estado = 'activo'; q.terminado = ''; return; }
      registrarMision('mision_fin', q, '');
      pintarHojaMision();
      pintar();
      celebrar('\uD83C\uDFC1 Mision cumplida: ' + q.nombre + feedbackProgreso(xpAntes));
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
      /* Recien con la mision ya borrada se sueltan sus tareas; si eso no se
         puede guardar, en memoria siguen vinculadas como en disco. */
      var sueltas = [];
      for (i = 0; i < items.length; i++) { if (items[i].proyectoId === p.id) { items[i].proyectoId = ''; sueltas.push(items[i]); } }
      if (sueltas.length && !guardarItems()) {
        for (i = 0; i < sueltas.length; i++) { sueltas[i].proyectoId = p.id; }
      }
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
        defs.push({ id: p.id, nom: p.nombre });
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
    if (contexto === 'todo') { l2.appendChild(badgeCtx(ru.contexto)); }
    l2.appendChild(badge('rut', K.describirRutina(ru), 'repeat'));
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

  /* La ocurrencia abierta del dia que le toca ahora a una rutina activa: si
     desapareciera, generarOcurrencias la crearia de nuevo. */
  function ocurrenciaVigente(it) {
    if (it.rutinaId === '' || !esActivo(it.estado)) { return false; }
    var r = buscarRutina(it.rutinaId), hoy = hoyClave();
    if (!r || !r.activa || (r.fin !== '' && r.fin < hoy)) { return false; }
    return it.ocurrencia === K.ultimaFecha(r, hoy);
  }

  /* Excepciones de una ocurrencia. Delegada cuenta como resuelta; omitida y no
     correspondia la cierran como cancelada con su motivo. Se puede deshacer. */
  function cerrarOcurrencia(id, motivo) {
    var it = buscarItem(id);
    if (!it || soloLectura || it.rutinaId === '' || !MOTIVOS[motivo]) { return; }
    var foto = fotoDe(it), antes = copiaItem(it), previo = it.estado, ahora = new Date().toISOString(), xpAntes = xpTotal();
    it.estado = motivo === 'delegada' ? 'completado' : 'cancelado';
    it.motivo = motivo;
    it.estadoDesde = ahora;
    it.actualizado = ahora;
    if (!guardarItems()) { reponerItem(it, antes); return; }
    registrar('excepcion', it, previo, motivo);
    pintar();
    if (itemAbierto === id) { pintarHojaItem(); }
    ofrecerDeshacer(textoMotivo(motivo) + ': ' + it.texto + feedbackProgreso(xpAntes), function () { restaurarFoto(id, foto, 'excepcion'); });
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
    pintarOpciones('gridRutCtx', K.CONTEXTOS, b.contexto, function (c) { return c.nom; },
      function (c) { leerCamposRutina(); b.contexto = c.id; pintarHojaRutina(); }, 'data-ctx');
    pintarOpciones('gridRutNivel', K.NIVELES, b.nivel, function (n) { return n.ico + ' ' + n.nom; },
      function (n) { leerCamposRutina(); b.nivel = n.id; pintarHojaRutina(); }, 'data-nivel');
    var prueba = normRutina(b);
    var prox = prueba ? K.proximaFecha(prueba, hoyClave()) : '';
    $('rutProxima').textContent = prueba
      ? K.describirRutina(prueba) + (prox ? ' \u00B7 proxima: ' + nombreDia(prox) : ' \u00B7 no le toca mas')
      : 'Escrib\u00ED qu\u00E9 hay que hacer.';

    var existente = !b.esNueva;
    $('cajaRutExistente').style.display = existente ? 'block' : 'none';
    if (existente) {
      var ru = buscarRutina(b.id);
      var st = K.rachaRutina(ru, items, hoyClave());
      $('rutRacha').textContent = '\uD83D\uDD25 racha ' + st.actual + ' \u00B7 mejor ' + st.mejor + ' \u00B7 ' +
        st.hechas + ' hechas de ' + st.total;
      pintarHistorialRutina(ru);
      rotular($('btnPausarRutina'), ru.activa ? 'Pausar rutina' : 'Reactivar rutina', ru.activa ? 'pause' : 'play');
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
        f.onclick = function () { cerrarParaRelevo('tapaRutina'); abrirItem(it.id); soltarRelevo(); };
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
      desdeGeneracion: previo ? previo.desdeGeneracion : hoyClave(),
      creado: previo ? previo.creado : ahora, actualizado: ahora
    });
    if (!r) { avisar('Escrib\u00ED qu\u00E9 hay que hacer.'); return; }
    /* Un calendario nuevo arranca hoy: no inventa una ocurrencia ya vencida. */
    if (previo && cambioCalendario(previo, r)) { r.desdeGeneracion = hoyClave(); }
    var copia = rutinas.slice(0), i;
    if (previo) {
      for (i = 0; i < rutinas.length; i++) { if (rutinas[i].id === r.id) { rutinas[i] = r; } }
    } else { rutinas.push(r); }
    if (!guardarRutinas()) { rutinas = copia; return; }
    /* Lo abierto se alinea con la definicion; lo cerrado es historia y no se toca. */
    var tocados = [];
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.rutinaId !== r.id || !esActivo(it.estado)) { continue; }
      tocados.push({ it: it, antes: copiaItem(it) });
      it.texto = r.texto; it.contexto = r.contexto; it.nivel = r.nivel; it.prioridad = r.nivel === 'urgente';
    }
    if (b.origenId) {
      var o = buscarItem(b.origenId), due = K.ultimaFecha(r, hoyClave());
      if (o && esActivo(o.estado) && o.rutinaId === '' && due === hoyClave()) {
        tocados.push({ it: o, antes: copiaItem(o) });
        o.rutinaId = r.id; o.ocurrencia = due; o.texto = r.texto;
        if (o.estado === 'entrada') { o.estado = 'pendiente'; }
      }
    }
    /* La rutina ya quedo guardada; si las ocurrencias no, en memoria vuelven a
       ser las del disco (se alinean la proxima vez que se guarde la rutina). */
    if (tocados.length && !guardarItems()) {
      for (i = 0; i < tocados.length; i++) { reponerItem(tocados[i].it, tocados[i].antes); }
    }
    registrarRutina(previo ? 'rutina_edit' : 'rutina_alta', r);
    generarOcurrencias();
    cerrarHoja('tapaRutina');
    borrador = null;
    pintar();
    if ($('tapaRutinas').className === 'tapa on') { pintarListaRutinas(); }
  }

  function cambioCalendario(a, b) {
    return a.tipo !== b.tipo || a.cada !== b.cada || a.diaMes !== b.diaMes || a.inicio !== b.inicio ||
      a.fin !== b.fin || a.dias.join(',') !== b.dias.join(',');
  }

  function registrarRutina(tipo, r) {
    if (soloLectura) { return false; }
    return anotarEventos([{
      id: nuevoId('e'), ts: new Date().toISOString(), tipo: tipo, itemId: r.id,
      texto: r.texto, contexto: r.contexto, desde: '', hasta: K.describirRutina(r)
    }]);
  }

  function alternarRutinaActiva() {
    var r = borrador ? buscarRutina(borrador.id) : null;
    if (!r || soloLectura) { return; }
    var antes = { activa: r.activa, actualizado: r.actualizado, desdeGeneracion: r.desdeGeneracion };
    r.activa = !r.activa;
    r.actualizado = new Date().toISOString();
    /* Al reactivarla arranca hoy: lo que le toco durante la pausa no se reclama. */
    if (r.activa) { r.desdeGeneracion = hoyClave(); }
    if (!guardarRutinas()) {
      r.activa = antes.activa; r.actualizado = antes.actualizado; r.desdeGeneracion = antes.desdeGeneracion;
      return;
    }
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
        l2.appendChild(badgeCtx(ru.contexto));
        l2.appendChild(badge('rut', K.describirRutina(ru)));
        var st = K.rachaRutina(ru, items, hoyClave());
        if (st.actual > 0) { l2.appendChild(badge('racha', '\uD83D\uDD25 ' + st.actual)); }
        if (!ru.activa) { l2.appendChild(badge('pausa', 'En pausa', 'pause')); }
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
  /* Antes que las listas: normalizarItem valida el contexto contra el registro. */
  cargarApartados();
  items = cargarLista(K_ITEMS, normalizarItem);
  eventos = cargarLista(K_EVENTOS, normalizarEvento);
  rutinas = cargarLista(K_RUTINAS, normRutina);
  proyectos = cargarLista(K_PROYECTOS, K.normalizarProyecto);
  /* Primera vez con 2.0 (o progreso roto ya copiado): la historia ya cargada
     cuenta XP, pero no se festeja como si todo hubiera pasado hoy. Se parte del
     nivel que ya corresponde. cargarProgreso deja progresoNuevo. */
  memProgreso = cargarProgreso();
  cargarCatalogos();
  aplicarMigracion4();
  aplicarMigracion5();
  generarOcurrencias();
  /* Sin copia posible tambien se siembra, pero solo en memoria (guardarProgreso
     no escribe): asi no se festejan logros y niveles viejos en cada carga. */
  if ((progresoNuevo || progresoSinCopia) && !soloLectura) {
    memProgreso.nivelVisto = K.nivelPorXP(xpTotal()).nivel;
    revisarLogros(true);
    guardarProgreso();
  }
  filtro = leer(K_FILTRO) || 'activos';
  filtroCompra = leer(K_FILTROC) || 'activos';
  filtroTag = leer(K_FILTROTAG) || '';
  modoLuz = leer(K_LUZ) === '1';
  /* KCO siempre abre en AHORA: la pregunta al abrir es "que hago ahora",
     no "en que pestaña me quede". */
  vista = 'ahora';
  var cc = leer(K_CTXCAP);
  ctxCaptura = K.normalizarContexto(cc);
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

  window.onpopstate = function (ev) { alVolverAtras(ev); };
  /* Girar o achicar la ventana cambia cuantas filas ocupan los chips. */
  window.addEventListener('resize', function () {
    if (document.documentElement.hasAttribute('data-capchips')) { ajustarAltoCaptura(); }
  });
  /* Volver desde el bfcache: las capas se reconcilian contra la entrada en la
     que quedo el historial (un retroceso propio en vuelo no cambia nada). */
  window.addEventListener('pageshow', function (ev) {
    if (ev && ev.persisted && window.history) { reconciliarHistorial(window.history.state, true); }
  });

  /* Otra pestaña o ventana de KCO cambio los datos: lo que esta en memoria aca
     ya es viejo y guardarlo pisaria lo nuevo. Se deja de escribir hasta recargar.
     Solo cuentan las claves de datos: preferencias (contexto, filtros, luz, tema,
     catalogos) y copias de cuarentena no pisan nada. key null = se borro todo.
     El tema es la unica preferencia que se sincroniza en vivo: es visual, no
     pisa nada y dos ventanas con temas distintos se ven rotas. */
  var CLAVES_DATOS = [K_ITEMS, K_EVENTOS, K_RUTINAS, K_PROYECTOS, K_PROGRESO, K_ESQUEMA, K_APARTADOS];
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function (ev) {
      var k = ev ? ev.key : null;
      if ((k === K_TEMA || k === null) && window.KCOTema) { window.KCOTema.releer(); pintarTema(); }
      if (k !== null && CLAVES_DATOS.indexOf(k) < 0) { return; }
      soloLectura = true;
      /* Los apartados se releen en vivo: los selectores muestran los nuevos
         (igual se deja de escribir hasta recargar). */
      if (k === K_APARTADOS || k === null) {
        cargarApartados();
        ctxCaptura = K.normalizarContexto(ctxCaptura);
        aplicarContexto(contexto, false);
      }
      avisar('Los datos cambiaron en otra ventana de KCO. Recarga para seguir sin pisar nada.');
    });
  }

  conectarSwipe(document.getElementsByTagName('main')[0], swipeVistas);
  conectarSwipe(document.getElementsByTagName('header')[0], swipeContexto);


  /* Recargar deja el historial parado en una entrada de la carga anterior
     (capa o ancla de otra serie). Al arrancar no hay ninguna capa abierta y la
     vista es Ahora: esa entrada pasa a ser la base. */
  try {
    var stArranque = window.history ? window.history.state : null;
    if (stArranque && (stArranque.kcoCapa || stArranque.kcoAncla || stArranque.kcoSerie) &&
        typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '');
    }
  } catch (e) { /* sin history: nada que normalizar */ }

  /* Atajo "Capturar" del manifest (./?capturar=1): abre con el cursor en la
     captura. La query se limpia para que recargar no repita el foco. */
  if (/[?&]capturar=1(&|$)/.test(window.location.search || '')) {
    $('txtCaptura').focus();
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }

  /* ---------- actualizacion de la app (service worker) ----------
     Una version nueva queda esperando (sw.js no hace skipWaiting al instalarse).
     Se avisa sin bloquear; al tocar "Actualizar" se le pide SKIP_WAITING y,
     cuando toma el control, se recarga una sola vez. Solo se recarga si la
     persona lo pidio: la primera instalacion (clients.claim) no recarga. */
  var swEsperando = null;
  var swRecargando = false;
  var swActualizarPedido = false;

  function avisarVersionNueva(w) {
    swEsperando = w;
    $('avisoVersion').className = 'avisover on';
  }

  function vigilarActualizacion(reg) {
    if (!reg) { return; }
    if (reg.waiting && navigator.serviceWorker.controller) { avisarVersionNueva(reg.waiting); }
    if (typeof reg.addEventListener !== 'function') { return; }
    reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (!w || typeof w.addEventListener !== 'function') { return; }
      w.addEventListener('statechange', function () {
        /* Sin controller es la primera instalacion: no hay nada que actualizar. */
        if (w.state === 'installed' && navigator.serviceWorker.controller) { avisarVersionNueva(w); }
      });
    });
    /* La PWA puede quedar abierta dias: al volver a primer plano se busca version. */
    if (typeof reg.update === 'function' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState !== 'visible') { return; }
        var p = reg.update();
        if (p && typeof p.then === 'function') { p.then(null, function () {}); }
      });
    }
  }

  $('btnActualizar').onclick = function () {
    if (!swEsperando) { return; }
    swActualizarPedido = true;
    $('avisoVersion').className = 'avisover';
    swEsperando.postMessage({ type: 'SKIP_WAITING' });
  };

  if (navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function') {
    if (typeof navigator.serviceWorker.addEventListener === 'function') {
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!swActualizarPedido || swRecargando) { return; }
        swRecargando = true;
        window.location.reload();
      });
    }
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      vigilarActualizacion(reg);
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
