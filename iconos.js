/* KCO — Centro Operativo Personal — iconos de la interfaz.
   Juego chico de iconos de trazo (grilla 24, currentColor, trazo 1.75) dibujados
   para KCO, sin archivos ni librerias externas. Se arman con createElementNS y
   setAttribute: nunca con innerHTML. Expone window.KCOIconos.crear(nombre, clase).
   Cada forma es [tipo, ...]: 'p' path (d), 'c' circulo (cx, cy, r),
   'r' rectangulo (x, y, w, h, radio), 'l' linea (x1, y1, x2, y2), 'pl' polilinea (puntos). ES5. */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var FORMAS = {
    /* Vistas */
    zap: [['p', 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8z']],
    calendar: [['r', 3.5, 5, 17, 15.5, 2.5], ['l', 3.5, 10, 20.5, 10], ['l', 8, 3, 8, 7], ['l', 16, 3, 16, 7]],
    tareas: [['r', 3.5, 3.5, 17, 17, 4], ['pl', '8 12.2 10.8 15 16 9.5']],
    target: [['c', 12, 12, 8.5], ['c', 12, 12, 4.75], ['c', 12, 12, 1]],
    book: [['p', 'M2.5 5H8a4 4 0 0 1 4 4v11.5A3 3 0 0 0 9 17.5H2.5z'], ['p', 'M21.5 5H16a4 4 0 0 0-4 4v11.5a3 3 0 0 1 3-3h6.5z']],

    /* Barra superior */
    search: [['c', 11, 11, 6.5], ['l', 20, 20, 15.8, 15.8]],
    settings: [['l', 4, 20.5, 4, 14], ['l', 4, 10, 4, 3.5], ['l', 12, 20.5, 12, 12], ['l', 12, 8, 12, 3.5],
      ['l', 20, 20.5, 20, 16], ['l', 20, 12, 20, 3.5], ['l', 1.5, 14, 6.5, 14], ['l', 9.5, 8, 14.5, 8], ['l', 17.5, 16, 22.5, 16]],
    'chevron-down': [['pl', '6 9 12 15 18 9']],
    'chevron-up': [['pl', '6 15 12 9 18 15']],

    /* Acciones */
    check: [['pl', '20 6.5 9.5 17 4 11.5']],
    play: [['p', 'M7.5 4.5v15l12-7.5z']],
    forward: [['pl', '6 17 11 12 6 7'], ['pl', '13 17 18 12 13 7']],
    'arrow-right': [['l', 4.5, 12, 19, 12], ['pl', '12.5 5.5 19 12 12.5 18.5']],
    plus: [['l', 12, 5, 12, 19], ['l', 5, 12, 19, 12]],
    minus: [['l', 5, 12, 19, 12]],
    x: [['l', 18, 6, 6, 18], ['l', 6, 6, 18, 18]],
    square: [['r', 4.5, 4.5, 15, 15, 3.5]],
    pause: [['r', 6, 4.5, 4, 15, 1], ['r', 14, 4.5, 4, 15, 1]],
    undo: [['pl', '9 14 4 9 9 4'], ['p', 'M20 20v-7a4 4 0 0 0-4-4H4']],
    edit: [['p', 'M16.5 3.5a2.5 2.5 0 0 1 3.5 3.5L7.5 19.5 3 21l1.5-4.5z']],
    share: [['p', 'M4.5 12v7a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7'], ['pl', '16 6.5 12 2.5 8 6.5'], ['l', 12, 2.5, 12, 15]],
    trash: [['l', 3.5, 6.5, 20.5, 6.5], ['p', 'M18.5 6.5l-.9 13a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9l-.9-13'],
      ['p', 'M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2'], ['l', 10, 11, 10, 17], ['l', 14, 11, 14, 17]],
    download: [['p', 'M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15'], ['pl', '7.5 10.5 12 15 16.5 10.5'], ['l', 12, 15, 12, 3.5]],
    upload: [['p', 'M20.5 15v3.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V15'], ['pl', '16.5 8 12 3.5 7.5 8'], ['l', 12, 3.5, 12, 15]],
    cart: [['c', 9, 20, 1.5], ['c', 18, 20, 1.5], ['p', 'M2.5 3.5h2.8l2.5 11.6a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 1.9-1.5L21.5 8H6.1']],
    more: [['c', 5, 12, 1.1], ['c', 12, 12, 1.1], ['c', 19, 12, 1.1]],
    pin: [['l', 12, 16.5, 12, 21.5], ['p', 'M9 3.5h6l-.8 5.5 3.3 3.5v2h-11v-2L9.8 9z']],

    /* Secciones y estados */
    'alert-circle': [['c', 12, 12, 8.5], ['l', 12, 8, 12, 12.5], ['l', 12, 16, 12.01, 16]],
    'alert-triangle': [['p', 'M10.3 4 2.4 17.7a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z'], ['l', 12, 9.5, 12, 13.5], ['l', 12, 17, 12.01, 17]],
    inbox: [['pl', '21.5 12.5 16 12.5 14.5 15 9.5 15 8 12.5 2.5 12.5'],
      ['p', 'M5.4 5.6 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5l-2.9-6.9a2 2 0 0 0-1.8-1.1H7.2a2 2 0 0 0-1.8 1.1z']],
    hourglass: [['l', 6, 3, 18, 3], ['l', 6, 21, 18, 21], ['p', 'M7.5 3v3.5l4.5 5.5 4.5-5.5V3'], ['p', 'M7.5 21v-3.5l4.5-5.5 4.5 5.5V21']],
    clock: [['c', 12, 12, 8.5], ['pl', '12 7.5 12 12 15 14']],
    repeat: [['pl', '17 2.5 20.5 6 17 9.5'], ['p', 'M3.5 11.5V10a4 4 0 0 1 4-4h13'], ['pl', '7 21.5 3.5 18 7 14.5'], ['p', 'M20.5 12.5V14a4 4 0 0 1-4 4h-13']],
    'check-circle': [['c', 12, 12, 8.5], ['pl', '8.5 12.2 11 14.7 15.8 9.5']],
    layers: [['p', 'M12 3 2.5 7.75 12 12.5l9.5-4.75z'], ['pl', '2.5 12 12 16.75 21.5 12'], ['pl', '2.5 16.25 12 21 21.5 16.25']],
    flag: [['l', 5, 21.5, 5, 3.5], ['p', 'M5 4h12.5l-2.5 4.5 2.5 4.5H5']],
    star: [['p', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z']],
    trophy: [['l', 8, 21, 16, 21], ['l', 12, 16.5, 12, 21], ['p', 'M7 3.5h10V9a5 5 0 0 1-10 0z'],
      ['p', 'M17 5h3v1.5A3.5 3.5 0 0 1 16.6 10'], ['p', 'M7 5H4v1.5A3.5 3.5 0 0 0 7.4 10']],
    'trending-up': [['pl', '2.5 17 9 10.5 13 14.5 21.5 6'], ['pl', '15.5 6 21.5 6 21.5 12']],
    compass: [['c', 12, 12, 8.5], ['p', 'M15.5 8.5 13.6 13.6 8.5 15.5 10.4 10.4z']],
    list: [['l', 9, 6, 20.5, 6], ['l', 9, 12, 20.5, 12], ['l', 9, 18, 20.5, 18], ['l', 4, 6, 4.01, 6], ['l', 4, 12, 4.01, 12], ['l', 4, 18, 4.01, 18]],
    clipboard: [['r', 8.5, 2.5, 7, 4, 1], ['p', 'M15.5 4.5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h2']],
    bell: [['p', 'M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8.5 2.5 8.5h-17S6 15.5 6 9'], ['p', 'M10.3 20.5a1.9 1.9 0 0 0 3.4 0']],
    message: [['p', 'M20.5 15a2 2 0 0 1-2 2H8l-4.5 4V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z']],
    sun: [['c', 12, 12, 4], ['p', 'M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4']],
    users: [['c', 9, 8, 3.5], ['p', 'M2.5 20.5v-.5A5.5 5.5 0 0 1 8 14.5h2a5.5 5.5 0 0 1 5.5 5.5v.5'], ['p', 'M16 4.6a3.5 3.5 0 0 1 0 6.8'], ['p', 'M21.5 20.5V20a5.5 5.5 0 0 0-3.5-5.1']]
  };

  function forma(def) {
    var t = def[0], e;
    if (t === 'p') {
      e = document.createElementNS(NS, 'path');
      e.setAttribute('d', def[1]);
    } else if (t === 'c') {
      e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', def[1]); e.setAttribute('cy', def[2]); e.setAttribute('r', def[3]);
    } else if (t === 'r') {
      e = document.createElementNS(NS, 'rect');
      e.setAttribute('x', def[1]); e.setAttribute('y', def[2]);
      e.setAttribute('width', def[3]); e.setAttribute('height', def[4]);
      e.setAttribute('rx', def[5]);
    } else if (t === 'l') {
      e = document.createElementNS(NS, 'line');
      e.setAttribute('x1', def[1]); e.setAttribute('y1', def[2]);
      e.setAttribute('x2', def[3]); e.setAttribute('y2', def[4]);
    } else {
      e = document.createElementNS(NS, 'polyline');
      e.setAttribute('points', def[1]);
    }
    return e;
  }

  /* Devuelve un <svg> decorativo (aria-hidden): el nombre accesible lo pone
     el boton (texto visible o aria-label). Un nombre desconocido da un svg vacio. */
  function crear(nombre, clase) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.75');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('class', clase ? 'ico ' + clase : 'ico');
    var defs = FORMAS.hasOwnProperty(nombre) ? FORMAS[nombre] : [], i;
    for (i = 0; i < defs.length; i++) { s.appendChild(forma(defs[i])); }
    return s;
  }

  function existe(nombre) { return FORMAS.hasOwnProperty(nombre); }

  window.KCOIconos = { crear: crear, existe: existe };
})();
