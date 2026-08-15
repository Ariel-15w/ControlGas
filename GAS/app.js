'use strict';


/* =========================================================
   CONFIGURACIÓN GENERAL
========================================================= */

const STORAGE_KEY =
  'controlGasBodegaV3';


const PRICES = [
  2.50,
  2.25,
  2.00
];


const GAS = {

  duragas: {
    label: 'Duragas amarillo'
  },

  kinggas: {
    label: 'King Gas rosado'
  }

};


const defaultState = {

  settings: {

    replacementCost: 1.70,

    emptyValue: 0.25

  },

  activeDay: null,

  days: [],

  accounts: []

};


const $ =
  id =>
    document.getElementById(id);


const clone =
  value =>
    typeof structuredClone === 'function'

      ? structuredClone(value)

      : JSON.parse(
          JSON.stringify(value)
        );


let state =
  loadState();


let clockTimer =
  null;


const num =
  value =>
    Number(value || 0);


const int =
  value =>
    Math.max(
      0,
      Math.trunc(
        Number(value || 0)
      )
    );


const money =
  value =>
    new Intl.NumberFormat(
      'es-EC',
      {
        style: 'currency',
        currency: 'USD'
      }
    ).format(
      num(value)
    );


const uid =
  () =>
    `${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;


const gasLabel =
  type =>
    GAS[type]?.label ||
    type;


const roundMoney =
  value =>
    Math.round(
      (
        num(value) +
        Number.EPSILON
      ) * 100
    ) / 100;


/* =========================================================
   FECHA Y HORA
========================================================= */

function nowParts() {

  const d =
    new Date();


  const pad =
    value =>
      String(value)
        .padStart(
          2,
          '0'
        );


  return {

    date:
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,

    time:
      `${pad(d.getHours())}:${pad(d.getMinutes())}`,

    dateTime:
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

  };

}


function shortDateTime(iso) {

  if (!iso) {
    return '—';
  }


  return new Date(iso)
    .toLocaleString(
      'es-EC',
      {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    );

}


function timeOnly(iso) {

  if (!iso) {
    return '—';
  }


  return new Date(iso)
    .toLocaleTimeString(
      'es-EC',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    );

}


/* =========================================================
   HTML SEGURO
========================================================= */

function escapeHtml(
  value = ''
) {

  return String(value)
    .replace(
      /[&<>'"]/g,
      char => ({

        '&': '&amp;',

        '<': '&lt;',

        '>': '&gt;',

        "'": '&#039;',

        '"': '&quot;'

      }[char])
    );

}


function emptyMsg(text) {

  return `
    <div class="empty-state">
      ${escapeHtml(text)}
    </div>
  `;

}


function metric(
  label,
  value,
  small = '',
  tone = ''
) {

  return `
    <div class="metric ${tone}">

      <span>
        ${escapeHtml(label)}
      </span>

      <strong>
        ${value}
      </strong>

      ${
        small
          ? `<small>${escapeHtml(small)}</small>`
          : ''
      }

    </div>
  `;

}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadState() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        )
      );


    if (!saved) {

      return clone(
        defaultState
      );

    }


    return {

      ...clone(
        defaultState
      ),

      ...saved,


      settings: {

        ...defaultState.settings,

        ...(saved.settings || {})

      },


      days:
        saved.days || [],


      accounts:
        saved.accounts || []

    };

  }

  catch {

    return clone(
      defaultState
    );

  }

}


function saveState() {

  localStorage.setItem(

    STORAGE_KEY,

    JSON.stringify(
      state
    )

  );

}


/* =========================================================
   MENSAJES
========================================================= */

function toast(message) {

  const element =
    $('toast');


  element.textContent =
    message;


  element.classList.add(
    'show'
  );


  clearTimeout(
    window.__toastTimer
  );


  window.__toastTimer =
    setTimeout(
      () =>
        element.classList.remove(
          'show'
        ),

      2500
    );

}


/* =========================================================
   DÍA ACTIVO
========================================================= */

function requireActiveDay() {

  if (
    !state.activeDay ||
    state.activeDay.closed
  ) {

    toast(
      'Primero abre el día.'
    );


    goTo(
      'opening'
    );


    return false;

  }


  return true;

}


/* =========================================================
   INVENTARIO VACÍO
========================================================= */

function emptyInventory() {

  return {

    duragas: {

      full: 0,

      empty: 0,

      reserved: 0

    },


    kinggas: {

      full: 0,

      empty: 0,

      reserved: 0

    }

  };

}


/* =========================================================
   NUEVO DÍA
========================================================= */

function newDay(
  opening,
  note
) {

  const now =
    nowParts();


  return {

    id:
      uid(),

    date:
      now.date,

    openedAt:
      now.dateTime,

    note,

    opening,

    sales: [],

    movements: [],

    adjustments: [],

    closed: false,

    closing: null

  };

}


/* =========================================================
   INVENTARIO ACTUAL
========================================================= */

function currentInventory() {

  const day =
    state.activeDay;


  if (!day) {

    return emptyInventory();

  }


  const inv =
    clone(
      day.opening
    );


  /* ===============================
     VENTAS
  =============================== */

  for (
    const sale
    of day.sales || []
  ) {

    const gas =
      inv[
        sale.gasType
      ];


    if (!gas) {
      continue;
    }


    const qty =
      int(
        sale.qty
      );


    const emptyReceived =
      int(
        sale.emptyReceived
      );


    /*
      PAGA Y RETIRA DESPUÉS

      El tanque lleno sigue
      físicamente en la tienda,
      pero deja de estar disponible.

      Pasa a RESERVADO.
    */

    if (
      sale.deliveryMode ===
      'later'
    ) {

      gas.full -=
        qty;


      gas.reserved +=
        qty;


      /*
        El cliente ya dejó
        su tanque vacío.
      */

      gas.empty +=
        emptyReceived;

    }

    else {

      /*
        VENTA NORMAL

        Sale un lleno.
      */

      gas.full -=
        qty;


      /*
        Entran los tanques
        vacíos entregados
        por el cliente.
      */

      gas.empty +=
        emptyReceived;

    }

  }


  /* ===============================
     MOVIMIENTOS POSTERIORES
  =============================== */

  for (
    const movement
    of day.movements || []
  ) {

    const gas =
      inv[
        movement.gasType
      ];


    if (!gas) {
      continue;
    }


    /*
      CLIENTE DEVUELVE
      TANQUE QUE DEBÍA
    */

    if (
      movement.kind ===
      'tank_return'
    ) {

      gas.empty +=
        int(
          movement.qty
        );

    }


    /*
      CLIENTE RETIRA GAS
      QUE YA HABÍA PAGADO
    */

    if (
      movement.kind ===
      'prepaid_pickup'
    ) {

      gas.reserved -=
        int(
          movement.qty
        );

    }

  }


  /* ===============================
     AJUSTES
  =============================== */

  for (
    const adjustment
    of day.adjustments || []
  ) {

    if (

      inv[
        adjustment.gasType
      ] &&

      Object.hasOwn(

        inv[
          adjustment.gasType
        ],

        adjustment.bucket

      )

    ) {

      inv[
        adjustment.gasType
      ][
        adjustment.bucket
      ] +=
        Math.trunc(
          num(
            adjustment.qty
          )
        );

    }

  }


  return inv;

}


/* =========================================================
   TOTALES DEL DÍA
========================================================= */

function dayTotals(
  day = state.activeDay
) {

  if (!day) {

    return {

      units: 0,

      revenue: 0,

      collected: 0,

      replacement: 0,

      margin: 0,

      cashAfterReserve: 0,

      creditCreated: 0

    };

  }


  const sales =
    day.sales || [];


  const movements =
    day.movements || [];


  /*
    UNIDADES VENDIDAS

    Cuenta también una reserva
    pagada aunque el cliente
    retire después.
  */

  const units =
    sales.reduce(

      (total, sale) =>
        total +
        int(
          sale.qty
        ),

      0

    );


  /*
    VALOR TOTAL DE VENTAS
  */

  const revenue =
    roundMoney(

      sales.reduce(

        (total, sale) =>
          total +
          num(
            sale.total
          ),

        0

      )

    );


  /*
    COBRADO EN EL MOMENTO
    DE CADA VENTA
  */

  const initialCollected =
    sales.reduce(

      (total, sale) =>
        total +
        num(
          sale.paidNow
        ),

      0

    );


  /*
    DINERO DE PENDIENTES
    COBRADO HOY
  */

  const laterCollected =
    movements

      .filter(
        movement =>
          movement.kind ===
          'money_payment'
      )

      .reduce(

        (total, movement) =>
          total +
          num(
            movement.amount
          ),

        0

      );


  const collected =
    roundMoney(
      initialCollected +
      laterCollected
    );


  /*
    DINERO PARA REPOSICIÓN
  */

  const replacement =
    roundMoney(

      units *

      num(
        state.settings
          .replacementCost
      )

    );


  /*
    GANANCIA TEÓRICA
  */

  const margin =
    roundMoney(

      revenue -
      replacement

    );


  /*
    CRÉDITO GENERADO
    DURANTE EL DÍA
  */

  const creditCreated =
    roundMoney(

      sales.reduce(

        (total, sale) =>
          total +
          num(
            sale.moneyDue
          ),

        0

      )

    );


  return {

    units,

    revenue,

    collected,

    replacement,

    margin,

    cashAfterReserve:
      roundMoney(
        collected -
        replacement
      ),

    creditCreated

  };

}


/* =========================================================
   TOTALES PENDIENTES
========================================================= */

function pendingTotals() {

  const open =
    state.accounts.filter(
      account =>
        !account.closed
    );


  return {

    count:
      open.length,


    money:
      roundMoney(

        open.reduce(

          (total, account) =>
            total +
            Math.max(
              0,
              num(
                account.moneyDue
              )
            ),

          0

        )

      ),


    tanks:
      open.reduce(

        (total, account) =>
          total +
          Math.max(
            0,
            int(
              account.tanksDue
            )
          ),

        0

      ),


    pickup:
      open.reduce(

        (total, account) =>
          total +
          Math.max(
            0,
            int(
              account.prepaidQty
            )
          ),

        0

      )

  };

}


/* =========================================================
   NAVEGACIÓN
========================================================= */

function setupTabs() {

  document
    .querySelectorAll(
      '.tab'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            goTo(
              button.dataset.view
            )
        );

      }
    );


  document
    .querySelectorAll(
      '[data-go]'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () =>
            goTo(
              button.dataset.go
            )
        );

      }
    );

}


function goTo(name) {

  document
    .querySelectorAll(
      '.tab'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          button.dataset.view ===
          name

        );

      }
    );


  document
    .querySelectorAll(
      '.view'
    )
    .forEach(
      view => {

        view.classList.toggle(

          'active',

          view.id ===
          `view-${name}`

        );

      }
    );


  if (
    name ===
    'closing'
  ) {

    fillClosingExpected();

  }


  window.scrollTo({

    top: 0,

    behavior:
      'smooth'

  });

}


/* =========================================================
   RELOJ
========================================================= */

function syncClock() {

  const readable =
    new Date()
      .toLocaleString(

        'es-EC',

        {

          dateStyle:
            'medium',

          timeStyle:
            'medium'

        }

      );


  [
    'liveClock',
    'openingAutoDateTime',
    'saleAutoDateTime',
    'closingAutoDateTime'
  ]
    .forEach(
      id => {

        if ($(id)) {

          $(id)
            .textContent =
            readable;

        }

      }
    );

}


/* =========================================================
   APERTURA
========================================================= */

function updateOpeningTotals() {

  $('duragasOpeningTotal')
    .textContent =

    int(
      $('duragasFull').value
    ) +

    int(
      $('duragasEmpty').value
    ) +

    int(
      $('duragasReserved').value
    );


  $('kinggasOpeningTotal')
    .textContent =

    int(
      $('kinggasFull').value
    ) +

    int(
      $('kinggasEmpty').value
    ) +

    int(
      $('kinggasReserved').value
    );

}


function handleOpening(event) {

  event.preventDefault();


  const opening = {

    duragas: {

      full:
        int(
          $('duragasFull').value
        ),

      empty:
        int(
          $('duragasEmpty').value
        ),

      reserved:
        int(
          $('duragasReserved').value
        )

    },


    kinggas: {

      full:
        int(
          $('kinggasFull').value
        ),

      empty:
        int(
          $('kinggasEmpty').value
        ),

      reserved:
        int(
          $('kinggasReserved').value
        )

    }

  };


  /*
    SI YA EXISTE UN DÍA
  */

  if (
    state.activeDay &&
    !state.activeDay.closed
  ) {

    const hasMoves =

      state.activeDay.sales.length +

      state.activeDay.movements.length +

      state.activeDay.adjustments.length >

      0;


    /*
      EVITAMOS MODIFICAR APERTURA
      SI YA EXISTEN VENTAS.
    */

    if (hasMoves) {

      toast(
        'El día ya tiene movimientos. Ciérralo antes de iniciar otro.'
      );

      return;

    }


    state.activeDay.opening =
      opening;


    state.activeDay.note =
      $('openingNote')
        .value
        .trim();

  }

  else {

    state.activeDay =
      newDay(

        opening,

        $('openingNote')
          .value
          .trim()

      );

  }


  saveState();

  renderAll();

  goTo(
    'dashboard'
  );


  toast(
    'Apertura guardada.'
  );

}


/* =========================================================
   CANTIDADES FRECUENTES
========================================================= */

function getQtyFrequency() {

  const scores =
    new Map([

      [1, 6],

      [2, 5],

      [4, 4],

      [6, 3],

      [8, 2],

      [12, 1]

    ]);


  const days = [

    ...state.days,

    ...(state.activeDay
      ? [state.activeDay]
      : [])

  ];


  days.forEach(
    day => {

      (
        day.sales || []
      )
        .forEach(
          sale => {

            const quantity =
              int(
                sale.qty
              );


            if (
              quantity > 0
            ) {

              scores.set(

                quantity,

                (
                  scores.get(
                    quantity
                  ) || 0
                ) + 10

              );

            }

          }
        );

    }
  );


  return [
    ...scores.entries()
  ]

    .filter(
      ([quantity]) =>
        quantity > 0
    )

    .sort(
      (a, b) =>
        b[1] -
        a[1] ||
        a[0] -
        b[0]
    )

    .slice(
      0,
      6
    )

    .map(
      ([quantity]) =>
        quantity
    );

}


/* =========================================================
   BOTONES RÁPIDOS
========================================================= */

function renderQuickButtons() {

  $('quickQtyButtons')
    .innerHTML =

    getQtyFrequency()

      .map(
        quantity => `

          <button
            class="quick-btn"
            type="button"
            data-qty="${quantity}"
          >
            ${quantity}
          </button>

        `
      )

      .join('');


  $('quickPriceButtons')
    .innerHTML =

    PRICES

      .map(
        price => `

          <button
            class="quick-btn"
            type="button"
            data-price="${price.toFixed(2)}"
          >
            ${money(price)}
          </button>

        `
      )

      .join('');


  $('salePrice')
    .innerHTML =

    PRICES

      .map(
        price => `

          <option
            value="${price.toFixed(2)}"
          >
            ${money(price)}
          </option>

        `
      )

      .join('');


  document
    .querySelectorAll(
      '[data-qty]'
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            $('saleQty')
              .value =
              button.dataset.qty;


            syncTankDefaults();

            calculateSale();

          };

      }
    );


  document
    .querySelectorAll(
      '[data-price]'
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            $('salePrice')
              .value =
              button.dataset.price;


            calculateSale();

          };

      }
    );

}


/* =========================================================
   CONTROLES DE VENTA
========================================================= */

function setupSaleControls() {

  document
    .querySelectorAll(
      '[data-sale-mode]'
    )
    .forEach(
      button => {

        button.onclick =
          () =>
            setSaleMode(
              button.dataset.saleMode
            );

      }
    );


  document
    .querySelectorAll(
      '[data-tank-mode]'
    )
    .forEach(
      button => {

        button.onclick =
          () =>
            setTankMode(
              button.dataset.tankMode
            );

      }
    );


  document
    .querySelectorAll(
      '[data-cash]'
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            const total =
              saleTotal();


            if (
              button.dataset.cash ===
              'exact'
            ) {

              $('saleReceived')
                .value =
                total.toFixed(2);

            }

            else {

              $('saleReceived')
                .value =
                Number(
                  button.dataset.cash
                ).toFixed(2);

            }


            calculateSale();

          };

      }
    );


  document
    .querySelectorAll(
      '[data-empty]'
    )
    .forEach(
      button => {

        button.onclick =
          () => {

            $('saleEmptyReceived')
              .value =

              button.dataset.empty ===
              'all'

                ? int(
                    $('saleQty')
                      .value
                  )

                : int(
                    button.dataset.empty
                  );


            calculateSale();

          };

      }
    );

}


/* =========================================================
   ENTREGA AHORA / DESPUÉS
========================================================= */

function setSaleMode(mode) {

  $('saleMode')
    .value =
    mode;


  document
    .querySelectorAll(
      '[data-sale-mode]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          button.dataset.saleMode ===
          mode

        );

      }
    );


  /*
    SI PAGA Y RETIRA DESPUÉS

    Siempre deja sus tanques
    vacíos en el momento.
  */

  if (
    mode ===
    'later'
  ) {

    $('saleTankMode')
      .value =
      'all';


    $('emptyReceivedWrap')
      .hidden =
      true;


    document
      .querySelectorAll(
        '[data-tank-mode]'
      )
      .forEach(
        button => {

          button.classList.toggle(

            'active',

            button.dataset.tankMode ===
            'all'

          );

        }
      );


    /*
      NO SE PERMITE FIADO
      SI SE TRATA DE RESERVA.
    */

    if (
      $('salePaymentMethod')
        .value ===
      'Fiado'
    ) {

      $('salePaymentMethod')
        .value =
        'Efectivo';

    }

  }


  syncTankDefaults();

  handlePaymentMethodChange();

}


/* =========================================================
   TANQUES VACÍOS
========================================================= */

function setTankMode(mode) {

  /*
    RESERVA:
    siempre deja todos
    los vacíos.
  */

  if (
    $('saleMode')
      .value ===
    'later'
  ) {

    mode =
      'all';

  }


  $('saleTankMode')
    .value =
    mode;


  document
    .querySelectorAll(
      '[data-tank-mode]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          button.dataset.tankMode ===
          mode

        );

      }
    );


  $('emptyReceivedWrap')
    .hidden =
    mode !==
    'missing';


  syncTankDefaults();

  calculateSale();

}


function syncTankDefaults() {

  const qty =
    int(
      $('saleQty').value
    );


  /*
    NORMALMENTE EL CLIENTE
    TRAE TODOS LOS TANQUES.
  */

  if (

    $('saleMode').value ===
      'later' ||

    $('saleTankMode').value ===
      'all'

  ) {

    $('saleEmptyReceived')
      .value =
      qty;

  }

  else if (

    int(
      $('saleEmptyReceived')
        .value
    ) > qty

  ) {

    $('saleEmptyReceived')
      .value =
      qty;

  }

}


/* =========================================================
   TOTAL VENTA
========================================================= */

function saleTotal() {

  return roundMoney(

    int(
      $('saleQty').value
    ) *

    num(
      $('salePrice').value
    )

  );

}


/* =========================================================
   FORMA DE PAGO
========================================================= */

function handlePaymentMethodChange() {

  const method =
    $('salePaymentMethod')
      .value;


  const total =
    saleTotal();


  const received =
    $('saleReceived');


  const quick =
    $('quickCashButtons');


  /*
    TRANSFERENCIA
  */

  if (
    method ===
    'Transferencia'
  ) {

    received.value =
      total.toFixed(2);


    received.readOnly =
      true;


    quick.hidden =
      true;


    $('cashQuickCaption')
      .textContent =
      'Transferencia exacta';

  }


  /*
    FIADO
  */

  else if (
    method ===
    'Fiado'
  ) {

    received.value =
      '0.00';


    received.readOnly =
      true;


    quick.hidden =
      true;


    $('cashQuickCaption')
      .textContent =
      'Queda todo pendiente';

  }


  /*
    EFECTIVO
  */

  else {

    received.readOnly =
      false;


    quick.hidden =
      false;


    $('cashQuickCaption')
      .textContent =
      'Monto recibido';

  }


  calculateSale();

}


/* =========================================================
   CÁLCULO AUTOMÁTICO VENTA
========================================================= */

function calculateSale() {

  const qty =
    Math.max(

      1,

      int(
        $('saleQty').value
      )

    );


  const total =
    saleTotal();


  const mode =
    $('saleMode').value;


  const method =
    $('salePaymentMethod')
      .value;


  /*
    TRANSFERENCIA
  */

  if (
    method ===
    'Transferencia'
  ) {

    $('saleReceived')
      .value =
      total.toFixed(2);

  }


  /*
    FIADO
  */

  if (
    method ===
    'Fiado'
  ) {

    $('saleReceived')
      .value =
      '0.00';

  }


  syncTankDefaults();


  const received =
    Math.max(

      0,

      num(
        $('saleReceived')
          .value
      )

    );


  const emptyReceived =
    Math.min(

      qty,

      int(
        $('saleEmptyReceived')
          .value
      )

    );


  /*
    DINERO REAL APLICADO
    A LA VENTA.

    Si entrega $20 por una venta
    de $18, solo $18 son venta.
  */

  const paidNow =
    Math.min(
      total,
      received
    );


  /*
    VUELTO
  */

  const change =
    Math.max(

      0,

      roundMoney(
        received -
        total
      )

    );


  /*
    DINERO PENDIENTE
  */

  const moneyDue =
    Math.max(

      0,

      roundMoney(
        total -
        received
      )

    );


  /*
    TANQUES PENDIENTES

    Solo en entrega inmediata.
  */

  const tanksDue =

    mode ===
    'later'

      ? 0

      : Math.max(

          0,

          qty -
          emptyReceived

        );


  /*
    PRODUCTO PAGADO
    PENDIENTE DE RETIRAR
  */

  const pickup =

    mode ===
    'later'

      ? qty

      : 0;


  /* ===============================
     MOSTRAR RESULTADOS
  =============================== */

  $('saleTotal')
    .textContent =
    money(total);


  $('salePaidNow')
    .textContent =
    money(paidNow);


  $('saleChange')
    .textContent =
    money(change);


  $('saleMoneyDue')
    .textContent =
    money(moneyDue);


  $('saleTanksDue')
    .textContent =
    tanksDue;


  $('salePendingPickup')
    .textContent =
    pickup;


  /* ===============================
     ESTADO AUTOMÁTICO
  =============================== */

  const status =
    $('saleStatus');


  let text =
    'Venta normal: sin pendientes.';


  let tone =
    'good';


  /*
    PAGADO PARA RETIRAR DESPUÉS
  */

  if (
    mode ===
    'later'
  ) {

    text =
      `Pagado/reservado: ${qty} ${
        qty === 1
          ? 'tanque'
          : 'tanques'
      } quedarán pendientes de retirar.`;


    tone =
      'warn';

  }


  /*
    DEBE DINERO Y TANQUE
  */

  else if (
    moneyDue > 0 &&
    tanksDue > 0
  ) {

    text =
      `Se creará pendiente: debe ${money(moneyDue)} y ${tanksDue} tanque(s).`;


    tone =
      'bad';

  }


  /*
    SOLO DINERO
  */

  else if (
    moneyDue > 0
  ) {

    text =
      `Se creará pendiente: debe ${money(moneyDue)}.`;


    tone =
      'warn';

  }


  /*
    SOLO TANQUE
  */

  else if (
    tanksDue > 0
  ) {

    text =
      `Se creará pendiente: debe ${tanksDue} tanque(s).`;


    tone =
      'warn';

  }


  status.className =
    `operation-status ${tone}`;


  status.textContent =
    text;


  highlightSaleQuick();


  return {

    qty,

    total,

    received,

    paidNow,

    change,

    moneyDue,

    tanksDue,

    emptyReceived,

    pickup

  };

}


/* =========================================================
   MARCAR BOTONES SELECCIONADOS
========================================================= */

function highlightSaleQuick() {

  const qty =
    int(
      $('saleQty').value
    );


  const price =
    num(
      $('salePrice').value
    );


  const received =
    roundMoney(
      $('saleReceived').value
    );


  const total =
    saleTotal();


  document
    .querySelectorAll(
      '[data-qty]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'selected',

          int(
            button.dataset.qty
          ) ===
          qty

        );

      }
    );


  document
    .querySelectorAll(
      '[data-price]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'selected',

          num(
            button.dataset.price
          ) ===
          price

        );

      }
    );


  document
    .querySelectorAll(
      '[data-cash]'
    )
    .forEach(
      button => {

        const selected =

          button.dataset.cash ===
          'exact'

            ? received ===
              total

            : received ===
              num(
                button.dataset.cash
              );


        button.classList.toggle(

          'selected',

          selected

        );

      }
    );

}


/* =========================================================
   GUARDAR VENTA
========================================================= */

function handleSale(event) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  /*
    VOLVEMOS A CALCULAR TODO
    AL MOMENTO EXACTO DE GUARDAR.
  */

  const calc =
    calculateSale();


  const gasType =
    $('saleGasType')
      .value;


  const mode =
    $('saleMode')
      .value;


  const inventory =
    currentInventory();


  if (
    calc.qty < 1
  ) {

    toast(
      'La cantidad debe ser mayor a 0.'
    );

    return;

  }


  /*
    EVITAR VENDER MÁS
    DE LO DISPONIBLE.
  */

  if (
    inventory[
      gasType
    ].full <
    calc.qty
  ) {

    toast(
      `Solo hay ${inventory[gasType].full} ${gasLabel(gasType)} llenos disponibles.`
    );

    return;

  }


  /*
    UNA RESERVA NO PUEDE
    QUEDAR FIADA.
  */

  if (

    mode ===
      'later' &&

    $('salePaymentMethod')
      .value ===
      'Fiado'

  ) {

    toast(
      'Para reservar y retirar después, la operación debe quedar pagada.'
    );

    return;

  }


  if (

    mode ===
      'later' &&

    calc.moneyDue > 0

  ) {

    toast(
      'Para retirar después debe quedar pagado el total.'
    );

    return;

  }


  const customerRaw =
    $('saleCustomer')
      .value
      .trim();


  /*
    SI QUEDA ALGÚN PENDIENTE
    EL CLIENTE ES OBLIGATORIO.
  */

  const needsCustomer =

    calc.moneyDue > 0 ||

    calc.tanksDue > 0 ||

    mode ===
      'later';


  if (
    needsCustomer &&
    !customerRaw
  ) {

    toast(
      'Escribe el cliente porque esta operación dejará un pendiente.'
    );

    return;

  }


  const customer =

    customerRaw ||

    'Consumidor final';


  /*
    FECHA/HORA REAL
    EN EL MOMENTO DE GUARDAR.
  */

  const dateTime =
    nowParts()
      .dateTime;


  const sale = {

    id:
      uid(),

    dateTime,

    customer,

    gasType,

    qty:
      calc.qty,

    price:
      num(
        $('salePrice').value
      ),

    total:
      calc.total,

    received:
      calc.received,

    paidNow:
      calc.paidNow,

    change:
      calc.change,

    paymentMethod:
      $('salePaymentMethod').value,

    emptyReceived:
      calc.emptyReceived,

    tanksDue:
      calc.tanksDue,

    moneyDue:
      calc.moneyDue,

    deliveryMode:
      mode,

    note:
      $('saleNote')
        .value
        .trim()

  };


  state.activeDay
    .sales
    .push(
      sale
    );


  state.activeDay
    .movements
    .push({

      id:
        uid(),

      kind:
        'sale',

      dateTime,

      customer,

      amount:
        calc.paidNow,

      detail:
        `${
          mode === 'later'
            ? 'Reserva pagada'
            : 'Venta'
        } ${calc.qty} × ${money(sale.price)} - ${gasLabel(gasType)}`

    });


  /*
    =====================================================
    CREACIÓN AUTOMÁTICA DEL PENDIENTE
    =====================================================
  */

  if (

    calc.moneyDue > 0 ||

    calc.tanksDue > 0 ||

    mode ===
      'later'

  ) {

    state.accounts.push({

      id:
        uid(),

      createdAt:
        dateTime,

      customer,

      gasType,

      saleId:
        sale.id,

      totalAmount:
        calc.total,

      moneyDue:
        calc.moneyDue,

      tanksDue:
        calc.tanksDue,

      prepaidQty:

        mode ===
        'later'

          ? calc.qty

          : 0,

      note:
        sale.note,

      closed:
        false,

      history: []

    });

  }


  saveState();


  resetSaleForm();


  renderAll();


  toast(
    `Operación guardada. Vuelto: ${money(calc.change)}.`
  );

}


/* =========================================================
   REINICIAR FORMULARIO DE VENTA
========================================================= */

function resetSaleForm() {

  $('saleForm')
    .reset();


  $('saleQty')
    .value =
    1;


  $('saleReceived')
    .value =
    0;


  /*
    POR DEFECTO:
    1 VENTA = 1 TANQUE VACÍO RECIBIDO.
  */

  $('saleEmptyReceived')
    .value =
    1;


  $('salePaymentMethod')
    .value =
    'Efectivo';


  setSaleMode(
    'now'
  );


  setTankMode(
    'all'
  );


  renderQuickButtons();

  calculateSale();

}


/* =========================================================
   TIPO DE PENDIENTE
========================================================= */

function accountType(account) {

  /*
    PAGADO Y POR RETIRAR
  */

  if (
    int(
      account.prepaidQty
    ) > 0
  ) {

    return 'pickup';

  }


  /*
    DEBE DINERO Y TANQUE
  */

  if (

    num(
      account.moneyDue
    ) > .009 &&

    int(
      account.tanksDue
    ) > 0

  ) {

    return 'both';

  }


  /*
    SOLO DINERO
  */

  if (
    num(
      account.moneyDue
    ) > .009
  ) {

    return 'money';

  }


  /*
    SOLO TANQUE
  */

  if (
    int(
      account.tanksDue
    ) > 0
  ) {

    return 'tank';

  }


  return 'none';

}


/* =========================================================
   MOSTRAR PENDIENTES
========================================================= */

function renderAccounts() {

  const open =
    state.accounts

      .filter(
        account =>

          !account.closed &&

          accountType(account) !==
          'none'
      )

      .sort(
        (a, b) =>
          new Date(
            b.createdAt
          ) -
          new Date(
            a.createdAt
          )
      );


  if (
    !open.length
  ) {

    $('accountsCards')
      .innerHTML =
      emptyMsg(
        'No hay pendientes.'
      );


    return;

  }


  const groups = [

    [
      'both',
      'Debe dinero y tanque',
      'Falta parte del pago y también uno o más tanques.'
    ],

    [
      'money',
      'Debe solo dinero',
      'Entregó los tanques, pero aún falta dinero.'
    ],

    [
      'tank',
      'Debe solo tanque',
      'El dinero está pagado, pero falta devolver tanque(s).'
    ],

    [
      'pickup',
      'Pagado y pendiente de retirar',
      'El cliente dejó su tanque vacío y tiene gas lleno reservado.'
    ]

  ];


  $('accountsCards')
    .innerHTML =

    groups

      .map(
        (
          [
            key,
            title,
            description
          ]
        ) => {

          const list =
            open.filter(
              account =>
                accountType(account) ===
                key
            );


          if (
            !list.length
          ) {

            return '';

          }


          return `

            <section class="pending-group">

              <div class="pending-group-title">

                <div>

                  <h3>
                    ${title}
                  </h3>

                  <p>
                    ${description}
                  </p>

                </div>


                <span
                  class="badge ${
                    key === 'both'
                      ? 'bad'
                      : 'warn'
                  }"
                >
                  ${list.length}
                </span>

              </div>


              <div class="account-list">

                ${
                  list
                    .map(
                      accountCard
                    )
                    .join('')
                }

              </div>

            </section>

          `;

        }
      )

      .join('');

}


/* =========================================================
   TARJETA DE PENDIENTE
========================================================= */

function accountCard(account) {

  const type =
    accountType(
      account
    );


  const paid =
    Math.max(

      0,

      roundMoney(

        num(
          account.totalAmount
        ) -

        num(
          account.moneyDue
        )

      )

    );


  return `

    <article class="account-card">

      <div class="account-head">

        <div>

          <h4>
            ${escapeHtml(account.customer)}
          </h4>

          <p class="subtle">

            ${gasLabel(account.gasType)}

            •

            ${shortDateTime(account.createdAt)}

          </p>

        </div>


        <span
          class="badge ${
            type === 'both'
              ? 'bad'
              : 'warn'
          }"
        >
          Pendiente
        </span>

      </div>


      <div class="account-meta">

        <span class="badge">

          Total
          ${money(account.totalAmount)}

        </span>


        <span class="badge good">

          Pagado
          ${money(paid)}

        </span>


        ${
          num(
            account.moneyDue
          ) > .009

            ? `
              <span class="badge bad">

                Debe
                ${money(account.moneyDue)}

              </span>
            `

            : ''
        }


        ${
          int(
            account.tanksDue
          ) > 0

            ? `
              <span class="badge warn">

                Debe
                ${int(account.tanksDue)}
                tanque(s)

              </span>
            `

            : ''
        }


        ${
          int(
            account.prepaidQty
          ) > 0

            ? `
              <span class="badge warn">

                Retira
                ${int(account.prepaidQty)}
                tanque(s)

              </span>
            `

            : ''
        }

      </div>


      ${
        account.note

          ? `
            <p>
              ${escapeHtml(account.note)}
            </p>
          `

          : ''
      }


      <div class="account-actions">


        ${
          num(
            account.moneyDue
          ) > .009

            ? `
              <button
                class="btn small primary"
                onclick="openAccountAction('${account.id}','money')"
              >
                Registrar pago
              </button>
            `

            : ''
        }


        ${
          int(
            account.tanksDue
          ) > 0

            ? `
              <button
                class="btn small ghost"
                onclick="openAccountAction('${account.id}','tank')"
              >
                Devolvió tanque
              </button>
            `

            : ''
        }


        ${
          int(
            account.prepaidQty
          ) > 0

            ? `
              <button
                class="btn small primary"
                onclick="openAccountAction('${account.id}','pickup')"
              >
                Entregar gas reservado
              </button>
            `

            : ''
        }

      </div>

    </article>

  `;

}


/* =========================================================
   ABRIR PENDIENTE
========================================================= */

function openAccountAction(
  id,
  action
) {

  const account =
    state.accounts.find(
      item =>
        item.id ===
        id
    );


  if (!account) {
    return;
  }


  $('paymentAccountId')
    .value =
    id;


  $('paymentAction')
    .value =
    action;


  $('paymentAmountWrap')
    .hidden =
    action !==
    'money';


  $('paymentTanksWrap')
    .hidden =
    action !==
    'tank';


  $('paymentPickupWrap')
    .hidden =
    action !==
    'pickup';


  $('paymentAmount')
    .value =

    action ===
    'money'

      ? num(
          account.moneyDue
        ).toFixed(2)

      : 0;


  $('paymentTanks')
    .value =

    action ===
    'tank'

      ? int(
          account.tanksDue
        )

      : 0;


  $('paymentPickupQty')
    .value =

    action ===
    'pickup'

      ? int(
          account.prepaidQty
        )

      : 0;


  $('paymentDialogTitle')
    .textContent =

    action ===
    'money'

      ? 'Registrar pago'

      : action ===
        'tank'

        ? 'Registrar devolución de tanque'

        : 'Entregar gas reservado';


  $('paymentDialog')
    .showModal();

}


/* =========================================================
   SALDAR PENDIENTE
========================================================= */

function handlePayment(event) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  const account =
    state.accounts.find(
      item =>
        item.id ===
        $('paymentAccountId').value
    );


  if (!account) {
    return;
  }


  const action =
    $('paymentAction').value;


  const dateTime =
    nowParts()
      .dateTime;


  const note =
    $('paymentNote')
      .value
      .trim();


  /* =====================================================
     PAGO DE DINERO
  ===================================================== */

  if (
    action ===
    'money'
  ) {

    const amount =
      Math.min(

        num(
          account.moneyDue
        ),

        Math.max(

          0,

          num(
            $('paymentAmount').value
          )

        )

      );


    if (
      amount <= 0
    ) {

      toast(
        'Monto inválido.'
      );

      return;

    }


    account.moneyDue =
      roundMoney(

        account.moneyDue -
        amount

      );


    account.history.push({

      dateTime,

      action:
        'money',

      amount,

      note

    });


    state.activeDay
      .movements
      .push({

        id:
          uid(),

        kind:
          'money_payment',

        dateTime,

        customer:
          account.customer,

        amount,

        detail:
          `Pago de pendiente - ${gasLabel(account.gasType)}`

      });

  }


  /* =====================================================
     DEVOLUCIÓN DE TANQUE
  ===================================================== */

  if (
    action ===
    'tank'
  ) {

    const quantity =
      Math.min(

        int(
          account.tanksDue
        ),

        int(
          $('paymentTanks').value
        )

      );


    if (
      quantity <= 0
    ) {

      toast(
        'Cantidad inválida.'
      );

      return;

    }


    account.tanksDue -=
      quantity;


    account.history.push({

      dateTime,

      action:
        'tank',

      qty:
        quantity,

      note

    });


    /*
      EL TANQUE VACÍO
      VUELVE A INVENTARIO.
    */

    state.activeDay
      .movements
      .push({

        id:
          uid(),

        kind:
          'tank_return',

        dateTime,

        customer:
          account.customer,

        gasType:
          account.gasType,

        qty:
          quantity,

        amount:
          0,

        detail:
          `Devolvió ${quantity} tanque(s) vacío(s) - ${gasLabel(account.gasType)}`

      });

  }


  /* =====================================================
     RETIRO DE GAS PAGADO
  ===================================================== */

  if (
    action ===
    'pickup'
  ) {

    const quantity =
      Math.min(

        int(
          account.prepaidQty
        ),

        int(
          $('paymentPickupQty').value
        )

      );


    const inventory =
      currentInventory();


    if (
      quantity <= 0
    ) {

      toast(
        'Cantidad inválida.'
      );

      return;

    }


    /*
      EL TANQUE YA ESTÁ RESERVADO.
    */

    if (
      inventory[
        account.gasType
      ].reserved <
      quantity
    ) {

      toast(
        `Solo hay ${inventory[account.gasType].reserved} tanque(s) reservados de ${gasLabel(account.gasType)}.`
      );

      return;

    }


    account.prepaidQty -=
      quantity;


    account.history.push({

      dateTime,

      action:
        'pickup',

      qty:
        quantity,

      note

    });


    /*
      AL RETIRAR:

      sale del inventario
      reservado.

      NO se vuelve a cobrar
      ni se vuelve a contar
      como una venta.
    */

    state.activeDay
      .movements
      .push({

        id:
          uid(),

        kind:
          'prepaid_pickup',

        dateTime,

        customer:
          account.customer,

        gasType:
          account.gasType,

        qty:
          quantity,

        amount:
          0,

        detail:
          `Retiró ${quantity} tanque(s) pagados - ${gasLabel(account.gasType)}`

      });

  }


  /*
    CERRAR AUTOMÁTICAMENTE
    CUANDO YA NO DEBE NADA.
  */

  account.closed =

    num(
      account.moneyDue
    ) <= .009 &&

    int(
      account.tanksDue
    ) <= 0 &&

    int(
      account.prepaidQty
    ) <= 0;


  saveState();


  $('paymentDialog')
    .close();


  $('paymentNote')
    .value =
    '';


  renderAll();


  toast(
    'Movimiento registrado.'
  );

}


/* =========================================================
   AJUSTE INVENTARIO
========================================================= */

function handleAdjustment(event) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  const gasType =
    $('adjustmentGasType')
      .value;


  const bucket =
    $('adjustmentBucket')
      .value;


  const quantity =
    Math.trunc(

      num(
        $('adjustmentQty').value
      )

    );


  if (!quantity) {

    toast(
      'El cambio no puede ser 0.'
    );

    return;

  }


  const inventory =
    currentInventory();


  if (

    inventory[
      gasType
    ][bucket] +

    quantity < 0

  ) {

    toast(
      'El ajuste dejaría el inventario negativo.'
    );

    return;

  }


  const note =
    $('adjustmentNote')
      .value
      .trim();


  if (!note) {

    toast(
      'Indica el motivo.'
    );

    return;

  }


  const adjustment = {

    id:
      uid(),

    dateTime:
      nowParts()
        .dateTime,

    gasType,

    bucket,

    qty:
      quantity,

    note

  };


  state.activeDay
    .adjustments
    .push(
      adjustment
    );


  state.activeDay
    .movements
    .push({

      id:
        uid(),

      kind:
        'adjustment',

      dateTime:
        adjustment.dateTime,

      customer:
        '—',

      amount:
        0,

      detail:
        `Ajuste ${quantity > 0 ? '+' : ''}${quantity} ${bucket} - ${gasLabel(gasType)}: ${note}`

    });


  saveState();


  $('adjustmentForm')
    .reset();


  renderAll();


  toast(
    'Inventario ajustado.'
  );

}


/* =========================================================
   CIERRE - VALORES ESPERADOS
========================================================= */

function fillClosingExpected() {

  if (
    !state.activeDay
  ) {

    return;

  }


  const inventory =
    currentInventory();


  $('closingDuragasFull')
    .value =
    Math.max(
      0,
      inventory.duragas.full
    );


  $('closingDuragasEmpty')
    .value =
    Math.max(
      0,
      inventory.duragas.empty
    );


  $('closingDuragasReserved')
    .value =
    Math.max(
      0,
      inventory.duragas.reserved
    );


  $('closingKinggasFull')
    .value =
    Math.max(
      0,
      inventory.kinggas.full
    );


  $('closingKinggasEmpty')
    .value =
    Math.max(
      0,
      inventory.kinggas.empty
    );


  $('closingKinggasReserved')
    .value =
    Math.max(
      0,
      inventory.kinggas.reserved
    );

}


/* =========================================================
   DIFERENCIA INVENTARIO
========================================================= */

function inventoryDifference(
  expected,
  actual
) {

  let total =
    0;


  const detail =
    {};


  for (
    const gasType
    of Object.keys(GAS)
  ) {

    detail[
      gasType
    ] = {};


    for (
      const bucket
      of [
        'full',
        'empty',
        'reserved'
      ]
    ) {

      const difference =

        int(
          actual[
            gasType
          ][bucket]
        ) -

        int(
          expected[
            gasType
          ][bucket]
        );


      detail[
        gasType
      ][bucket] =
        difference;


      total +=
        Math.abs(
          difference
        );

    }

  }


  return {

    total,

    detail

  };

}


/* =========================================================
   CERRAR DÍA
========================================================= */

function handleClosing(event) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  const expected =
    currentInventory();


  const actual = {

    duragas: {

      full:
        int(
          $('closingDuragasFull').value
        ),

      empty:
        int(
          $('closingDuragasEmpty').value
        ),

      reserved:
        int(
          $('closingDuragasReserved').value
        )

    },


    kinggas: {

      full:
        int(
          $('closingKinggasFull').value
        ),

      empty:
        int(
          $('closingKinggasEmpty').value
        ),

      reserved:
        int(
          $('closingKinggasReserved').value
        )

    }

  };


  const totals =
    dayTotals();


  state.activeDay.closing = {

    dateTime:
      nowParts()
        .dateTime,

    cash:
      Math.max(

        0,

        num(
          $('closingCash').value
        )

      ),

    otherExpenses:
      Math.max(

        0,

        num(
          $('closingOtherExpenses').value
        )

      ),

    note:
      $('closingNote')
        .value
        .trim(),

    expected,

    actual,

    totals

  };


  state.activeDay.closed =
    true;


  state.days.push(
    state.activeDay
  );


  const closedDay =
    state.activeDay;


  state.activeDay =
    null;


  saveState();

  renderAll();

  renderClosingSummary(
    closedDay
  );


  toast(
    'Día cerrado.'
  );

}


/* =========================================================
   RESUMEN CIERRE
========================================================= */

function renderClosingSummary(day) {

  const box =
    $('closingSummary');


  if (
    !day?.closing
  ) {

    box.hidden =
      true;

    return;

  }


  const closing =
    day.closing;


  const difference =
    inventoryDifference(

      closing.expected,

      closing.actual

    );


  box.hidden =
    false;


  box.innerHTML = `

    <div class="card-header">

      <div>

        <h3>
          Resumen
          ${escapeHtml(day.date)}
        </h3>

        <p>
          ${shortDateTime(closing.dateTime)}
        </p>

      </div>


      <span
        class="badge ${
          difference.total === 0
            ? 'good'
            : 'warn'
        }"
      >
        Diferencia:
        ${difference.total}
      </span>

    </div>


    <div class="metric-grid">

      ${metric(
        'Ventas',
        money(
          closing.totals.revenue
        ),
        `${closing.totals.units} unidades`
      )}

      ${metric(
        'Cobrado',
        money(
          closing.totals.collected
        ),
        '',
        'good'
      )}

      ${metric(
        'Reposición',
        money(
          closing.totals.replacement
        ),
        '',
        'warn'
      )}

      ${metric(
        'Margen teórico',
        money(
          closing.totals.margin
        ),
        '',
        closing.totals.margin >= 0
          ? 'good'
          : 'bad'
      )}

      ${metric(
        'Caja tras reserva',
        money(
          closing.totals.cashAfterReserve
        )
      )}

      ${metric(
        'Otros gastos',
        money(
          closing.otherExpenses
        )
      )}

    </div>


    <div class="info-box">

      <strong>
        Margen después de otros gastos:
      </strong>

      ${money(
        closing.totals.margin -
        closing.otherExpenses
      )}

    </div>

  `;

}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {

  const day =
    state.activeDay;


  const totals =
    dayTotals();


  const pending =
    pendingTotals();


  $('activeDayText')
    .textContent =

    day

      ? `Día abierto: ${day.date} • ${timeOnly(day.openedAt)}`

      : 'No hay un día abierto';


  $('metricGrid')
    .innerHTML = [

      metric(
        'Ventas',
        money(
          totals.revenue
        ),
        `${totals.units} unidades`
      ),

      metric(
        'Cobrado hoy',
        money(
          totals.collected
        ),
        'dinero recibido',
        'good'
      ),

      metric(
        'Por cobrar',
        money(
          pending.money
        ),
        `${pending.count} pendiente(s)`,
        pending.money
          ? 'warn'
          : ''
      ),

      metric(
        'Reposición',
        money(
          totals.replacement
        ),
        `${money(state.settings.replacementCost)}/unidad`,
        'warn'
      ),

      metric(
        'Margen teórico',
        money(
          totals.margin
        ),
        'venta − reposición',
        totals.margin >= 0
          ? 'good'
          : 'bad'
      ),

      metric(
        'Tanques pendientes',
        String(
          pending.tanks
        ),
        `${pending.pickup} pagado(s) por retirar`,
        pending.tanks ||
        pending.pickup
          ? 'warn'
          : ''
      )

    ].join('');


  const inventory =
    currentInventory();


  $('inventorySnapshot')
    .innerHTML =

    !day

      ? emptyMsg(
          'Abre el día para comenzar.'
        )

      : `

        <div class="stat-list">

          ${
            Object.keys(GAS)

              .map(
                gasType => `

                  <div class="stat-row">

                    <span>

                      ${gasLabel(gasType)}
                      —
                      llenos / vacíos / reservados

                    </span>

                    <strong>

                      ${inventory[gasType].full}
                      /
                      ${inventory[gasType].empty}
                      /
                      ${inventory[gasType].reserved}

                    </strong>

                  </div>

                `
              )

              .join('')
          }


          <div class="stat-row">

            <span>
              Valor ref. tanques vacíos
            </span>

            <strong>

              ${money(

                (
                  inventory.duragas.empty +
                  inventory.kinggas.empty
                ) *

                state.settings.emptyValue

              )}

            </strong>

          </div>

        </div>

      `;


  $('pendingSnapshot')
    .innerHTML =

    pending.count

      ? `

        <div class="stat-list">

          <div class="stat-row">

            <span>
              Cuentas abiertas
            </span>

            <strong>
              ${pending.count}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Dinero pendiente
            </span>

            <strong>
              ${money(pending.money)}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Tanques por devolver
            </span>

            <strong>
              ${pending.tanks}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Pagados por retirar
            </span>

            <strong>
              ${pending.pickup}
            </strong>

          </div>

        </div>

      `

      : emptyMsg(
          'No existen pendientes.'
        );


  const movements =

    day

      ? [
          ...day.movements
        ]

          .sort(
            (a, b) =>
              new Date(
                b.dateTime
              ) -
              new Date(
                a.dateTime
              )
          )

          .slice(
            0,
            10
          )

      : [];


  $('recentMovementsBody')
    .innerHTML =

    movements.length

      ? movements

          .map(
            movement => `

              <tr>

                <td>
                  ${timeOnly(movement.dateTime)}
                </td>

                <td>
                  ${movementLabel(movement.kind)}
                </td>

                <td>
                  ${escapeHtml(movement.customer || '—')}
                </td>

                <td>
                  ${escapeHtml(movement.detail || '—')}
                </td>

                <td>
                  ${money(movement.amount || 0)}
                </td>

              </tr>

            `
          )

          .join('')

      : `

        <tr>

          <td colspan="5">
            Sin movimientos.
          </td>

        </tr>

      `;

}


/* =========================================================
   VENTAS DEL DÍA
========================================================= */

function renderSales() {

  const sales =
    state.activeDay
      ?.sales || [];


  $('salesBody')
    .innerHTML =

    sales.length

      ? [
          ...sales
        ]

          .reverse()

          .map(
            sale => {

              let status =
                'Completa';


              if (
                sale.deliveryMode ===
                'later'
              ) {

                status =
                  `Reservado: retira ${sale.qty}`;

              }

              else if (

                sale.moneyDue > 0 &&

                sale.tanksDue > 0

              ) {

                status =
                  'Debe dinero y tanque';

              }

              else if (
                sale.moneyDue > 0
              ) {

                status =
                  'Debe dinero';

              }

              else if (
                sale.tanksDue > 0
              ) {

                status =
                  'Debe tanque';

              }


              return `

                <tr>

                  <td>
                    ${timeOnly(sale.dateTime)}
                  </td>

                  <td>
                    ${escapeHtml(sale.customer)}
                  </td>

                  <td>
                    ${gasLabel(sale.gasType)}
                  </td>

                  <td>
                    ${sale.qty}
                  </td>

                  <td>
                    ${money(sale.price)}
                  </td>

                  <td>
                    ${money(sale.total)}
                  </td>

                  <td>
                    ${money(sale.paidNow)}
                  </td>

                  <td>
                    ${status}
                  </td>

                </tr>

              `;

            }
          )

          .join('')

      : `

        <tr>

          <td colspan="8">
            No hay operaciones hoy.
          </td>

        </tr>

      `;

}


/* =========================================================
   INVENTARIO
========================================================= */

function renderInventory() {

  const inventory =
    currentInventory();


  $('inventoryDetails')
    .innerHTML =

    Object.keys(GAS)

      .map(
        gasType => {

          const total =

            inventory[
              gasType
            ].full +

            inventory[
              gasType
            ].empty +

            inventory[
              gasType
            ].reserved;


          return `

            <article
              class="card inventory-card gas-card ${gasType}"
            >

              <h3>
                ${gasLabel(gasType)}
              </h3>


              <div class="inventory-bars">


                <div class="inventory-line">

                  <span>
                    Llenos disponibles
                  </span>

                  <strong>
                    ${inventory[gasType].full}
                  </strong>

                </div>


                <div class="inventory-line">

                  <span>
                    Vacíos
                  </span>

                  <strong>
                    ${inventory[gasType].empty}
                  </strong>

                </div>


                <div class="inventory-line">

                  <span>
                    Llenos reservados
                  </span>

                  <strong>
                    ${inventory[gasType].reserved}
                  </strong>

                </div>


                <div class="inventory-line">

                  <span>
                    Total físico estimado
                  </span>

                  <strong>
                    ${total}
                  </strong>

                </div>

              </div>

            </article>

          `;

        }
      )

      .join('');

}


/* =========================================================
   HISTORIAL
========================================================= */

function renderHistory() {

  const days =
    [
      ...state.days
    ]

      .sort(
        (a, b) =>
          new Date(
            b.openedAt
          ) -
          new Date(
            a.openedAt
          )
      );


  $('historyCards')
    .innerHTML =

    days.length

      ? days

          .map(
            day => {

              const closing =
                day.closing;


              const totals =

                closing
                  ?.totals ||

                dayTotals(
                  day
                );


              const difference =

                closing

                  ? inventoryDifference(
                      closing.expected,
                      closing.actual
                    )

                  : null;


              return `

                <article class="history-card">

                  <div class="history-head">

                    <div>

                      <h3>
                        ${escapeHtml(day.date)}
                      </h3>

                      <p class="subtle">

                        Apertura
                        ${timeOnly(day.openedAt)}

                        ${
                          closing

                            ? `• Cierre ${timeOnly(closing.dateTime)}`

                            : ''
                        }

                      </p>

                    </div>


                    <span
                      class="badge ${
                        closing
                          ? 'good'
                          : 'warn'
                      }"
                    >

                      ${
                        closing
                          ? 'Cerrado'
                          : 'Sin cierre'
                      }

                    </span>

                  </div>


                  <div class="metric-grid">

                    ${metric(
                      'Ventas',
                      money(totals.revenue),
                      `${totals.units} unidades`
                    )}

                    ${metric(
                      'Cobrado',
                      money(totals.collected)
                    )}

                    ${metric(
                      'Reposición',
                      money(totals.replacement),
                      '',
                      'warn'
                    )}

                    ${metric(
                      'Margen',
                      money(totals.margin),
                      '',
                      totals.margin >= 0
                        ? 'good'
                        : 'bad'
                    )}

                    ${metric(
                      'Caja tras reserva',
                      money(
                        totals.cashAfterReserve
                      )
                    )}

                    ${metric(
                      'Diferencia stock',
                      difference
                        ? String(
                            difference.total
                          )
                        : '—'
                    )}

                  </div>

                </article>

              `;

            }
          )

          .join('')

      : emptyMsg(
          'Todavía no hay días cerrados.'
        );

}


/* =========================================================
   CLIENTES FRECUENTES
========================================================= */

function renderCustomerSuggestions() {

  const names =
    new Set();


  state.accounts.forEach(
    account => {

      if (
        account.customer
      ) {

        names.add(
          account.customer
        );

      }

    }
  );


  [
    ...state.days,

    ...(state.activeDay
      ? [state.activeDay]
      : [])
  ]
    .forEach(
      day => {

        (
          day.sales || []
        )
          .forEach(
            sale => {

              if (

                sale.customer &&

                sale.customer !==
                'Consumidor final'

              ) {

                names.add(
                  sale.customer
                );

              }

            }
          );

      }
    );


  $('customerSuggestions')
    .innerHTML =

    [
      ...names
    ]

      .filter(Boolean)

      .sort(
        (a, b) =>
          a.localeCompare(
            b,
            'es'
          )
      )

      .map(
        name => `

          <option
            value="${escapeHtml(name)}"
          ></option>

        `
      )

      .join('');

}


/* =========================================================
   CONFIGURACIÓN
========================================================= */

function renderSettings() {

  $('settingReplacementCost')
    .value =
    state.settings
      .replacementCost;


  $('settingEmptyValue')
    .value =
    state.settings
      .emptyValue;

}


function handleSettings(event) {

  event.preventDefault();


  state.settings
    .replacementCost =
    Math.max(

      0,

      num(
        $('settingReplacementCost')
          .value
      )

    );


  state.settings
    .emptyValue =
    Math.max(

      0,

      num(
        $('settingEmptyValue')
          .value
      )

    );


  saveState();

  renderAll();


  toast(
    'Configuración guardada.'
  );

}


/* =========================================================
   TIPO DE MOVIMIENTO
========================================================= */

function movementLabel(kind) {

  return ({

    sale:
      'Venta',

    money_payment:
      'Pago pendiente',

    tank_return:
      'Devolución tanque',

    prepaid_pickup:
      'Retiro reservado',

    adjustment:
      'Ajuste'

  })[kind] || kind;

}


/* =========================================================
   EXPORTAR
========================================================= */

function exportData() {

  const blob =
    new Blob(

      [
        JSON.stringify(
          state,
          null,
          2
        )
      ],

      {
        type:
          'application/json'
      }

    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    `respaldo-gas-${nowParts().date}.json`;


  link.click();


  URL.revokeObjectURL(
    url
  );

}


/* =========================================================
   IMPORTAR
========================================================= */

function importData(file) {

  const reader =
    new FileReader();


  reader.onload =
    () => {

      try {

        const parsed =
          JSON.parse(
            reader.result
          );


        if (

          !parsed.settings ||

          !Array.isArray(
            parsed.days
          ) ||

          !Array.isArray(
            parsed.accounts
          )

        ) {

          throw new Error();

        }


        state = {

          ...clone(
            defaultState
          ),

          ...parsed,


          settings: {

            ...defaultState
              .settings,

            ...parsed.settings

          }

        };


        saveState();

        renderAll();


        toast(
          'Respaldo importado.'
        );

      }

      catch {

        toast(
          'Respaldo inválido.'
        );

      }

    };


  reader.readAsText(
    file
  );

}


/* =========================================================
   RENDERIZAR TODO
========================================================= */

function renderAll() {

  $('openingWarning')
    .hidden =

    !(
      state.activeDay &&
      !state.activeDay.closed
    );


  renderQuickButtons();

  renderCustomerSuggestions();

  renderDashboard();

  renderSales();

  renderAccounts();

  renderInventory();

  renderHistory();

  renderSettings();

  syncClock();

  calculateSale();

}


/* =========================================================
   INICIALIZAR
========================================================= */

function init() {

  setupTabs();


  syncClock();


  clockTimer =
    setInterval(
      syncClock,
      1000
    );


  /*
    APERTURA
  */

  [

    'duragasFull',

    'duragasEmpty',

    'duragasReserved',

    'kinggasFull',

    'kinggasEmpty',

    'kinggasReserved'

  ]
    .forEach(
      id => {

        $(id)
          .addEventListener(
            'input',
            updateOpeningTotals
          );

      }
    );


  /*
    BOTONES RÁPIDOS
  */

  renderQuickButtons();

  setupSaleControls();


  /*
    CAMPOS QUE RECALCULAN
    AUTOMÁTICAMENTE
  */

  [

    'saleQty',

    'salePrice',

    'saleReceived',

    'saleEmptyReceived'

  ]
    .forEach(
      id => {

        $(id)
          .addEventListener(
            'input',
            () => {

              if (
                id ===
                'saleQty'
              ) {

                syncTankDefaults();

              }


              calculateSale();

            }
          );


        $(id)
          .addEventListener(
            'change',
            calculateSale
          );

      }
    );


  $('salePaymentMethod')
    .addEventListener(
      'change',
      handlePaymentMethodChange
    );


  /*
    FORMULARIOS
  */

  $('openingForm')
    .addEventListener(
      'submit',
      handleOpening
    );


  $('saleForm')
    .addEventListener(
      'submit',
      handleSale
    );


  $('paymentForm')
    .addEventListener(
      'submit',
      handlePayment
    );


  $('adjustmentForm')
    .addEventListener(
      'submit',
      handleAdjustment
    );


  $('closingForm')
    .addEventListener(
      'submit',
      handleClosing
    );


  $('settingsForm')
    .addEventListener(
      'submit',
      handleSettings
    );


  /*
    CERRAR MODAL
  */

  $('closeDialogBtn')
    .addEventListener(
      'click',
      () =>
        $('paymentDialog')
          .close()
    );


  /*
    RESPALDOS
  */

  $('exportBtn')
    .addEventListener(
      'click',
      exportData
    );


  $('importInput')
    .addEventListener(
      'change',
      event => {

        if (
          event.target.files[0]
        ) {

          importData(
            event.target.files[0]
          );

        }


        event.target.value =
          '';

      }
    );


  /*
    BORRAR TODO
  */

  $('resetBtn')
    .addEventListener(
      'click',
      () => {

        if (

          !confirm(
            '¿Borrar aperturas, ventas, pendientes e historial?'
          )

        ) {

          return;

        }


        state =
          clone(
            defaultState
          );


        saveState();

        renderAll();


        toast(
          'Datos eliminados.'
        );

      }
    );


  /*
    VALORES INICIALES
  */

  updateOpeningTotals();


  setSaleMode(
    'now'
  );


  setTankMode(
    'all'
  );


  handlePaymentMethodChange();


  renderAll();


  window.addEventListener(
    'beforeunload',
    () =>
      clearInterval(
        clockTimer
      )
  );

}


/* =========================================================
   FUNCIÓN PARA BOTONES GENERADOS DINÁMICAMENTE
========================================================= */

window.openAccountAction =
  openAccountAction;


/* =========================================================
   INICIO
========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  init
);