'use strict';


/* =========================================================
   CONSTANTES DE NEGOCIO
========================================================= */

const STORAGE_KEY =
  'controlGasBodegaV4';


const LEGACY_STORAGE_KEY =
  'controlGasBodegaV3';


const SCHEMA_VERSION =
  4;


/*
  REGLA FIJA DEL NEGOCIO:
  costo de reposición por unidad.
*/
const REPLACEMENT_COST =
  1.70;


/*
  ÚNICOS PRECIOS PERMITIDOS.
*/
const PRICES = [
  2.00,
  2.25,
  2.50
];


/*
  ÚNICAS MARCAS PERMITIDAS.
*/
const GAS_TYPES = [
  'duragas',
  'kinggas'
];


const GAS = {

  duragas: {

    label:
      'Duragas',

    fullLabel:
      'Duragas amarillo'

  },


  kinggas: {

    label:
      'King Gas',

    fullLabel:
      'King Gas rosado'

  }

};


/* =========================================================
   ESTADO NORMALIZADO
========================================================= */

/*
  ESTRUCTURA V4

  days
    Cabecera de cada jornada.

  sales
    Cabecera de cada operación comercial.

  saleLines
    Detalle de marcas/cantidades de una venta.

  accounts
    Cabecera de una cuenta pendiente.

  accountBalances
    Saldos de tanques/reservas por marca.

  movements
    Trazabilidad de dinero, devoluciones y retiros.

  adjustments
    Correcciones de inventario.

  Esto evita repetir datos dentro
  de grandes objetos anidados.
*/

const defaultState = {

  schemaVersion:
    SCHEMA_VERSION,


  activeDayId:
    null,


  days: [],


  sales: [],


  saleLines: [],


  accounts: [],


  accountBalances: [],


  movements: [],


  adjustments: [],


  /*
    Preferencias pequeñas de interfaz.
    No son datos contables.
  */
  ui: {

    lastPrice:
      2.25

  }

};


/* =========================================================
   UTILIDADES BÁSICAS
========================================================= */

const $ =
  id =>
    document.getElementById(
      id
    );


const num =
  value =>
    Number(
      value || 0
    );


const int =
  value =>
    Math.max(

      0,

      Math.trunc(
        Number(
          value || 0
        )
      )

    );


const roundMoney =
  value =>
    Math.round(

      (
        num(value) +
        Number.EPSILON
      ) * 100

    ) / 100;


const clone =
  value =>

    typeof structuredClone ===
    'function'

      ? structuredClone(
          value
        )

      : JSON.parse(
          JSON.stringify(
            value
          )
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


const gasFullLabel =
  type =>
    GAS[type]?.fullLabel ||
    type;


const money =
  value =>
    new Intl.NumberFormat(

      'es-EC',

      {

        style:
          'currency',

        currency:
          'USD'

      }

    ).format(
      num(value)
    );


let state =
  loadState();


let clockTimer =
  null;


/* =========================================================
   FECHA / HORA
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

      `${d.getFullYear()}-${pad(
        d.getMonth() + 1
      )}-${pad(
        d.getDate()
      )}`,


    time:

      `${pad(
        d.getHours()
      )}:${pad(
        d.getMinutes()
      )}`,


    dateTime:

      `${d.getFullYear()}-${pad(
        d.getMonth() + 1
      )}-${pad(
        d.getDate()
      )}T${pad(
        d.getHours()
      )}:${pad(
        d.getMinutes()
      )}:${pad(
        d.getSeconds()
      )}`

  };

}


function shortDateTime(
  iso
) {

  if (!iso) {

    return '—';

  }


  const d =
    new Date(
      iso
    );


  if (
    Number.isNaN(
      d.getTime()
    )
  ) {

    return '—';

  }


  return d.toLocaleString(

    'es-EC',

    {

      dateStyle:
        'short',

      timeStyle:
        'short'

    }

  );

}


function timeOnly(
  iso
) {

  if (!iso) {

    return '—';

  }


  const d =
    new Date(
      iso
    );


  if (
    Number.isNaN(
      d.getTime()
    )
  ) {

    return '—';

  }


  return d.toLocaleTimeString(

    'es-EC',

    {

      hour:
        '2-digit',

      minute:
        '2-digit'

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

        '&':
          '&amp;',

        '<':
          '&lt;',

        '>':
          '&gt;',

        "'":
          '&#039;',

        '"':
          '&quot;'

      }[char])

    );

}


function emptyMsg(
  text
) {

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

          ? `
            <small>
              ${escapeHtml(small)}
            </small>
          `

          : ''
      }

    </div>

  `;

}


/* =========================================================
   ESTRUCTURAS DE GAS
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


function emptyGasCounts() {

  return {

    duragas: 0,

    kinggas: 0

  };

}


function sumGasCounts(
  counts
) {

  return GAS_TYPES.reduce(

    (
      sum,
      type
    ) =>

      sum +
      int(
        counts[type]
      ),

    0

  );

}


function gasCountText(
  counts,
  emptyText = '0'
) {

  const parts =
    GAS_TYPES

      .filter(
        type =>
          int(
            counts[type]
          ) > 0
      )

      .map(
        type =>
          `${gasLabel(type)} ${int(counts[type])}`
      );


  return parts.length

    ? parts.join(
        ' · '
      )

    : emptyText;

}


/* =========================================================
   MENSAJES
========================================================= */

function toast(
  message
) {

  const element =
    $('toast');


  if (!element) {

    return;

  }


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

      2600

    );

}


/* =========================================================
   NORMALIZACIÓN Y MIGRACIÓN
========================================================= */

function freshState() {

  return clone(
    defaultState
  );

}


/*
  Limpia relaciones inválidas
  y garantiza la estructura V4.
*/
function normalizeState(
  raw
) {

  const next = {

    ...freshState(),

    ...raw,


    schemaVersion:
      SCHEMA_VERSION,


    days:

      Array.isArray(
        raw?.days
      )

        ? raw.days

        : [],


    sales:

      Array.isArray(
        raw?.sales
      )

        ? raw.sales

        : [],


    saleLines:

      Array.isArray(
        raw?.saleLines
      )

        ? raw.saleLines

        : [],


    accounts:

      Array.isArray(
        raw?.accounts
      )

        ? raw.accounts

        : [],


    accountBalances:

      Array.isArray(
        raw?.accountBalances
      )

        ? raw.accountBalances

        : [],


    movements:

      Array.isArray(
        raw?.movements
      )

        ? raw.movements

        : [],


    adjustments:

      Array.isArray(
        raw?.adjustments
      )

        ? raw.adjustments

        : [],


    ui: {

      ...defaultState.ui,

      ...(raw?.ui || {})

    }

  };


  /*
    RELACIONES VÁLIDAS
  */

  const validDayIds =
    new Set(

      next.days.map(
        day =>
          day.id
      )

    );


  const validSaleIds =
    new Set(

      next.sales.map(
        sale =>
          sale.id
      )

    );


  const validAccountIds =
    new Set(

      next.accounts.map(
        account =>
          account.id
      )

    );


  /*
    Evitar líneas huérfanas.
  */

  next.saleLines =
    next.saleLines.filter(
      line =>
        validSaleIds.has(
          line.saleId
        )
    );


  /*
    Evitar movimientos
    asociados a jornadas inexistentes.
  */

  next.movements =
    next.movements.filter(
      movement =>
        validDayIds.has(
          movement.dayId
        )
    );


  next.adjustments =
    next.adjustments.filter(
      adjustment =>
        validDayIds.has(
          adjustment.dayId
        )
    );


  /*
    Evitar saldos huérfanos.
  */

  next.accountBalances =
    next.accountBalances.filter(
      balance =>
        validAccountIds.has(
          balance.accountId
        )
    );


  /*
    Si el día activo ya no existe,
    se elimina la referencia.
  */

  if (
    !validDayIds.has(
      next.activeDayId
    )
  ) {

    next.activeDayId =
      null;

  }


  /*
    Recalcular estado de cuentas.
  */

  next.accounts.forEach(
    account =>
      syncAccountClosed(
        account,
        next
      )
  );


  return next;

}


/* =========================================================
   MIGRACIÓN DE V3 A V4
========================================================= */

function migrateV3(
  oldState
) {

  const next =
    freshState();


  const dayObjects =
    [];


  const seenDayIds =
    new Set();


  /*
    DÍAS ARCHIVADOS
  */

  for (
    const day
    of oldState?.days || []
  ) {

    if (
      day?.id &&
      !seenDayIds.has(
        day.id
      )
    ) {

      seenDayIds.add(
        day.id
      );


      dayObjects.push(
        day
      );

    }

  }


  /*
    DÍA ACTIVO DE V3
  */

  if (

    oldState?.activeDay?.id &&

    !seenDayIds.has(
      oldState.activeDay.id
    )

  ) {

    seenDayIds.add(
      oldState.activeDay.id
    );


    dayObjects.push(
      oldState.activeDay
    );


    next.activeDayId =
      oldState.activeDay.id;

  }


  /*
    MIGRAR JORNADAS
  */

  for (
    const oldDay
    of dayObjects
  ) {

    next.days.push({

      id:
        oldDay.id,


      date:
        oldDay.date,


      openedAt:
        oldDay.openedAt,


      note:
        oldDay.note || '',


      opening:
        clone(
          oldDay.opening ||
          emptyInventory()
        ),


      closed:
        Boolean(
          oldDay.closed
        ),


      closing:

        oldDay.closing

          ? clone(
              oldDay.closing
            )

          : null

    });


    /*
      MIGRAR VENTAS
    */

    for (
      const sale
      of oldDay.sales || []
    ) {

      next.sales.push({

        id:
          sale.id,


        dayId:
          oldDay.id,


        dateTime:
          sale.dateTime,


        customer:
          sale.customer ||
          'Consumidor final',


        deliveryMode:
          sale.deliveryMode ||
          'now',


        unitPrice:
          num(
            sale.price
          ),


        total:
          num(
            sale.total
          ),


        received:
          num(
            sale.received
          ),


        paidNow:
          num(
            sale.paidNow
          ),


        change:
          num(
            sale.change
          ),


        paymentMethod:
          sale.paymentMethod ||
          'Efectivo',


        moneyDue:
          num(
            sale.moneyDue
          ),


        note:
          sale.note || ''

      });


      /*
        La venta V3 tenía
        una sola marca.

        En V4 pasa a una
        línea de venta.
      */

      if (

        sale.gasType &&

        int(
          sale.qty
        ) > 0

      ) {

        next.saleLines.push({

          id:
            uid(),


          saleId:
            sale.id,


          gasType:
            sale.gasType,


          qty:
            int(
              sale.qty
            ),


          emptyReceived:
            int(
              sale.emptyReceived
            )

        });

      }

    }


    /*
      MIGRAR MOVIMIENTOS
    */

    for (
      const movement
      of oldDay.movements || []
    ) {

      next.movements.push({

        ...clone(
          movement
        ),


        id:
          movement.id ||
          uid(),


        dayId:
          oldDay.id

      });

    }


    /*
      MIGRAR AJUSTES
    */

    for (
      const adjustment
      of oldDay.adjustments || []
    ) {

      next.adjustments.push({

        ...clone(
          adjustment
        ),


        id:
          adjustment.id ||
          uid(),


        dayId:
          oldDay.id

      });

    }

  }


  /*
    MIGRAR CUENTAS PENDIENTES
  */

  for (
    const oldAccount
    of oldState?.accounts || []
  ) {

    const accountId =
      oldAccount.id ||
      uid();


    next.accounts.push({

      id:
        accountId,


      saleId:
        oldAccount.saleId ||
        null,


      createdAt:
        oldAccount.createdAt,


      customer:
        oldAccount.customer ||
        'Cliente',


      totalAmount:
        num(
          oldAccount.totalAmount
        ),


      moneyDue:
        num(
          oldAccount.moneyDue
        ),


      note:
        oldAccount.note || '',


      closed:
        Boolean(
          oldAccount.closed
        )

    });


    /*
      V3 tenía un solo saldo
      de tanque asociado
      a una marca.

      En V4 se normaliza
      por marca.
    */

    if (

      oldAccount.gasType &&

      (
        int(
          oldAccount.tanksDue
        ) > 0 ||

        int(
          oldAccount.prepaidQty
        ) > 0
      )

    ) {

      next.accountBalances.push({

        id:
          uid(),


        accountId,


        gasType:
          oldAccount.gasType,


        tanksDue:
          int(
            oldAccount.tanksDue
          ),


        pickupDue:
          int(
            oldAccount.prepaidQty
          )

      });

    }

  }


  return normalizeState(
    next
  );

}


/* =========================================================
   CARGAR DATOS
========================================================= */

function loadState() {

  /*
    PRIMERO INTENTA V4.
  */

  try {

    const current =
      JSON.parse(

        localStorage.getItem(
          STORAGE_KEY
        )

      );


    if (
      current?.schemaVersion ===
      SCHEMA_VERSION
    ) {

      return normalizeState(
        current
      );

    }

  }

  catch {

    /*
      Si V4 está corrupto
      se intenta recuperar V3.
    */

  }


  /*
    MIGRACIÓN AUTOMÁTICA DESDE V3.
  */

  try {

    const legacy =
      JSON.parse(

        localStorage.getItem(
          LEGACY_STORAGE_KEY
        )

      );


    if (legacy) {

      const migrated =
        migrateV3(
          legacy
        );


      localStorage.setItem(

        STORAGE_KEY,

        JSON.stringify(
          migrated
        )

      );


      return migrated;

    }

  }

  catch {

    /*
      Si tampoco se puede migrar,
      inicia vacío.
    */

  }


  return freshState();

}


/* =========================================================
   GUARDAR ESTADO
========================================================= */

function saveState() {

  localStorage.setItem(

    STORAGE_KEY,

    JSON.stringify(
      state
    )

  );

}


/* =========================================================
   SELECTORES DE DATOS NORMALIZADOS
========================================================= */

function getActiveDay() {

  return state.days.find(

    day =>
      day.id ===
      state.activeDayId

  ) || null;

}


function salesForDay(
  dayId
) {

  return state.sales.filter(

    sale =>
      sale.dayId ===
      dayId

  );

}


function saleLinesForSale(
  saleId
) {

  return state.saleLines.filter(

    line =>
      line.saleId ===
      saleId

  );

}


function movementsForDay(
  dayId
) {

  return state.movements.filter(

    movement =>
      movement.dayId ===
      dayId

  );

}


function adjustmentsForDay(
  dayId
) {

  return state.adjustments.filter(

    adjustment =>
      adjustment.dayId ===
      dayId

  );

}


function balancesForAccount(
  accountId
) {

  return state.accountBalances.filter(

    balance =>
      balance.accountId ===
      accountId

  );

}


function balanceForAccountGas(
  accountId,
  gasType
) {

  return state.accountBalances.find(

    balance =>

      balance.accountId ===
      accountId &&

      balance.gasType ===
      gasType

  ) || null;

}


/* =========================================================
   VALIDAR DÍA ACTIVO
========================================================= */

function requireActiveDay() {

  const day =
    getActiveDay();


  if (
    !day ||
    day.closed
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
   INVENTARIO ACTUAL
========================================================= */

function currentInventory() {

  const day =
    getActiveDay();


  if (!day) {

    return emptyInventory();

  }


  /*
    Partimos exclusivamente
    del conteo de apertura.
  */

  const inventory =
    clone(

      day.opening ||
      emptyInventory()

    );


  /* =====================================================
     VENTAS DEL DÍA
  ===================================================== */

  for (
    const sale
    of salesForDay(
      day.id
    )
  ) {

    /*
      Una venta puede contener
      DURAGAS + KING GAS.
    */

    for (
      const line
      of saleLinesForSale(
        sale.id
      )
    ) {

      const gas =
        inventory[
          line.gasType
        ];


      if (!gas) {

        continue;

      }


      /*
        Sale del stock disponible
        la cantidad comprometida.
      */

      gas.full -=
        int(
          line.qty
        );


      /*
        Entran solamente los
        vacíos recibidos realmente.
      */

      gas.empty +=
        int(
          line.emptyReceived
        );


      /*
        SI PAGA Y RETIRA DESPUÉS:

        El lleno todavía permanece
        físicamente en la bodega,
        pero ya no puede venderse.

        Por eso pasa a RESERVADO.
      */

      if (
        sale.deliveryMode ===
        'later'
      ) {

        gas.reserved +=
          int(
            line.qty
          );

      }

    }

  }


  /* =====================================================
     MOVIMIENTOS POSTERIORES
  ===================================================== */

  for (
    const movement
    of movementsForDay(
      day.id
    )
  ) {

    const gas =
      inventory[
        movement.gasType
      ];


    if (!gas) {

      continue;

    }


    /*
      CLIENTE DEVUELVE
      UN TANQUE QUE DEBÍA.
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
      CLIENTE RETIRA
      UN GAS QUE YA PAGÓ.

      Solo sale de RESERVADOS.
      No se descuenta otra vez
      de disponibles.
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


  /* =====================================================
     AJUSTES MANUALES
  ===================================================== */

  for (
    const adjustment
    of adjustmentsForDay(
      day.id
    )
  ) {

    const gas =
      inventory[
        adjustment.gasType
      ];


    if (

      !gas ||

      !Object.hasOwn(
        gas,
        adjustment.bucket
      )

    ) {

      continue;

    }


    gas[
      adjustment.bucket
    ] +=
      Math.trunc(
        num(
          adjustment.qty
        )
      );

  }


  return inventory;

}
/* =========================================================
   UTILIDADES DE LÍNEAS DE VENTA
========================================================= */

/*
  Devuelve las cantidades vendidas
  de cada marca dentro de una venta.
*/
function saleGasCounts(
  saleId
) {

  const counts =
    emptyGasCounts();


  for (
    const line
    of saleLinesForSale(
      saleId
    )
  ) {

    if (
      GAS_TYPES.includes(
        line.gasType
      )
    ) {

      counts[
        line.gasType
      ] +=
        int(
          line.qty
        );

    }

  }


  return counts;

}


/*
  Total de unidades de una venta,
  sin importar si lleva una
  o ambas marcas.
*/
function saleUnitCount(
  saleId
) {

  return saleLinesForSale(
    saleId
  ).reduce(

    (
      total,
      line
    ) =>

      total +
      int(
        line.qty
      ),

    0

  );

}


/*
  Texto corto para tablas.

  Ejemplo:
  Duragas 2 · King Gas 1
*/
function saleGasText(
  saleId
) {

  return gasCountText(
    saleGasCounts(
      saleId
    ),
    'Sin unidades'
  );

}


/* =========================================================
   SALDOS DE CUENTAS POR MARCA
========================================================= */

/*
  Esta función acepta un estado
  como parámetro porque también
  se utiliza durante la migración
  y normalización antes de que
  "state" quede inicializado.
*/
function balancesForAccountInState(
  source,
  accountId
) {

  return (
    source.accountBalances || []
  ).filter(

    balance =>
      balance.accountId ===
      accountId

  );

}


/*
  Tanques VACÍOS que todavía
  debe devolver el cliente,
  separados por marca.
*/
function tankDebtCounts(
  accountId,
  source = state
) {

  const counts =
    emptyGasCounts();


  for (
    const balance
    of balancesForAccountInState(
      source,
      accountId
    )
  ) {

    if (
      GAS_TYPES.includes(
        balance.gasType
      )
    ) {

      counts[
        balance.gasType
      ] +=
        int(
          balance.tanksDue
        );

    }

  }


  return counts;

}


/*
  Gases LLENOS ya pagados que
  el cliente todavía debe retirar.
*/
function pickupDebtCounts(
  accountId,
  source = state
) {

  const counts =
    emptyGasCounts();


  for (
    const balance
    of balancesForAccountInState(
      source,
      accountId
    )
  ) {

    if (
      GAS_TYPES.includes(
        balance.gasType
      )
    ) {

      counts[
        balance.gasType
      ] +=
        int(
          balance.pickupDue
        );

    }

  }


  return counts;

}


function totalTankDebt(
  accountId,
  source = state
) {

  return sumGasCounts(
    tankDebtCounts(
      accountId,
      source
    )
  );

}


function totalPickupDebt(
  accountId,
  source = state
) {

  return sumGasCounts(
    pickupDebtCounts(
      accountId,
      source
    )
  );

}


/* =========================================================
   ESTADO DE CUENTA
========================================================= */

/*
  Una cuenta queda CERRADA
  únicamente cuando:

  - no debe dinero;
  - no debe Duragas;
  - no debe King Gas;
  - no tiene Duragas por retirar;
  - no tiene King Gas por retirar.
*/
function syncAccountClosed(
  account,
  source = state
) {

  if (!account) {

    return;

  }


  const moneyPending =
    roundMoney(
      Math.max(
        0,
        num(
          account.moneyDue
        )
      )
    );


  const tanksPending =
    totalTankDebt(
      account.id,
      source
    );


  const pickupPending =
    totalPickupDebt(
      account.id,
      source
    );


  account.moneyDue =
    moneyPending;


  account.closed =

    moneyPending <=
      0.009 &&

    tanksPending ===
      0 &&

    pickupPending ===
      0;


  if (
    account.closed &&
    !account.closedAt
  ) {

    account.closedAt =
      nowParts()
        .dateTime;

  }


  if (
    !account.closed
  ) {

    account.closedAt =
      null;

  }

}


/*
  Sincronizar todas las cuentas.
*/
function syncAllAccounts() {

  state.accounts.forEach(
    account =>
      syncAccountClosed(
        account,
        state
      )
  );

}


/* =========================================================
   TIPO DE PENDIENTE
========================================================= */

/*
  El usuario NO selecciona
  el tipo de deuda.

  El sistema lo infiere.
*/
function accountType(
  account
) {

  if (!account) {

    return 'none';

  }


  const moneyDue =
    roundMoney(
      Math.max(
        0,
        num(
          account.moneyDue
        )
      )
    );


  const tanksDue =
    totalTankDebt(
      account.id
    );


  const pickupDue =
    totalPickupDebt(
      account.id
    );


  /*
    PAGA Y RETIRA DESPUÉS.

    Esta categoría no debe
    mezclarse con una deuda.
  */
  if (
    pickupDue > 0
  ) {

    return 'pickup';

  }


  /*
    DEBE DINERO + TANQUES
  */
  if (
    moneyDue >
      0.009 &&
    tanksDue >
      0
  ) {

    return 'both';

  }


  /*
    SOLO DINERO
  */
  if (
    moneyDue >
      0.009
  ) {

    return 'money';

  }


  /*
    SOLO TANQUES
  */
  if (
    tanksDue >
      0
  ) {

    return 'tanks';

  }


  return 'none';

}


/* =========================================================
   CREAR / OBTENER SALDO POR MARCA
========================================================= */

function ensureAccountBalance(
  accountId,
  gasType
) {

  let balance =
    balanceForAccountGas(
      accountId,
      gasType
    );


  if (balance) {

    return balance;

  }


  balance = {

    id:
      uid(),


    accountId,


    gasType,


    tanksDue:
      0,


    pickupDue:
      0

  };


  state.accountBalances.push(
    balance
  );


  return balance;

}


/* =========================================================
   MOVIMIENTOS MONETARIOS
========================================================= */

/*
  Solo estos movimientos representan
  dinero cobrado posteriormente.

  Retorno de tanque y retiro de reserva
  NO generan ingreso.
*/
function moneyMovementsForDay(
  dayId
) {

  return movementsForDay(
    dayId
  ).filter(

    movement =>
      movement.kind ===
      'money_payment'

  );

}


/* =========================================================
   TOTALES FINANCIEROS DEL DÍA
========================================================= */

function dayTotals(
  dayOrId = getActiveDay()
) {

  const day =

    typeof dayOrId ===
    'string'

      ? state.days.find(
          item =>
            item.id ===
            dayOrId
        )

      : dayOrId;


  if (!day) {

    return {

      salesCount: 0,

      units: 0,

      duragasUnits: 0,

      kinggasUnits: 0,

      revenue: 0,

      initialCollected: 0,

      laterCollected: 0,

      collected: 0,

      cash: 0,

      transfers: 0,

      creditCreated: 0,

      replacement: 0,

      margin: 0,

      uncollectedRevenue: 0

    };

  }


  const sales =
    salesForDay(
      day.id
    );


  const moneyMovements =
    moneyMovementsForDay(
      day.id
    );


  /* =====================================================
     UNIDADES VENDIDAS
  ===================================================== */

  const soldByGas =
    emptyGasCounts();


  for (
    const sale
    of sales
  ) {

    for (
      const line
      of saleLinesForSale(
        sale.id
      )
    ) {

      if (
        GAS_TYPES.includes(
          line.gasType
        )
      ) {

        soldByGas[
          line.gasType
        ] +=
          int(
            line.qty
          );

      }

    }

  }


  const units =
    sumGasCounts(
      soldByGas
    );


  /* =====================================================
     VENTAS DEVENGADAS

     Se reconoce la venta aunque
     el cliente quede debiendo.
  ===================================================== */

  const revenue =
    roundMoney(

      sales.reduce(

        (
          total,
          sale
        ) =>

          total +
          num(
            sale.total
          ),

        0

      )

    );


  /* =====================================================
     COBRADO EN EL MOMENTO DE LA VENTA

     paidNow ya excluye el vuelto.
  ===================================================== */

  const initialCollected =
    roundMoney(

      sales.reduce(

        (
          total,
          sale
        ) =>

          total +
          num(
            sale.paidNow
          ),

        0

      )

    );


  /* =====================================================
     COBRADO DESPUÉS
     POR CUENTAS PENDIENTES
  ===================================================== */

  const laterCollected =
    roundMoney(

      moneyMovements.reduce(

        (
          total,
          movement
        ) =>

          total +
          num(
            movement.amount
          ),

        0

      )

    );


  /*
    COBRADO TOTAL DEL DÍA
  */
  const collected =
    roundMoney(

      initialCollected +
      laterCollected

    );


  /* =====================================================
     EFECTIVO

     IMPORTANTE:
     NO usamos "received".

     Si el cliente entrega $20
     por una venta de $18,
     el flujo neto de caja es $18.
  ===================================================== */

  const cashFromSales =
    sales

      .filter(
        sale =>
          sale.paymentMethod ===
          'Efectivo'
      )

      .reduce(

        (
          total,
          sale
        ) =>

          total +
          num(
            sale.paidNow
          ),

        0

      );


  const cashFromPending =
    moneyMovements

      .filter(
        movement =>
          movement.paymentMethod ===
          'Efectivo'
      )

      .reduce(

        (
          total,
          movement
        ) =>

          total +
          num(
            movement.amount
          ),

        0

      );


  const cash =
    roundMoney(

      cashFromSales +
      cashFromPending

    );


  /* =====================================================
     TRANSFERENCIAS
  ===================================================== */

  const transfersFromSales =
    sales

      .filter(
        sale =>
          sale.paymentMethod ===
          'Transferencia'
      )

      .reduce(

        (
          total,
          sale
        ) =>

          total +
          num(
            sale.paidNow
          ),

        0

      );


  const transfersFromPending =
    moneyMovements

      .filter(
        movement =>
          movement.paymentMethod ===
          'Transferencia'
      )

      .reduce(

        (
          total,
          movement
        ) =>

          total +
          num(
            movement.amount
          ),

        0

      );


  const transfers =
    roundMoney(

      transfersFromSales +
      transfersFromPending

    );


  /* =====================================================
     CRÉDITO GENERADO

     Es lo que quedó debiendo
     al momento de crear la venta.

     Si luego paga el mismo día,
     sigue siendo crédito que se
     originó y luego fue recuperado.
  ===================================================== */

  const creditCreated =
    roundMoney(

      sales.reduce(

        (
          total,
          sale
        ) =>

          total +
          Math.max(
            0,
            num(
              sale.moneyDue
            )
          ),

        0

      )

    );


  /* =====================================================
     COSTO / RESERVA DE REPOSICIÓN
  ===================================================== */

  const replacement =
    roundMoney(

      units *
      REPLACEMENT_COST

    );


  /* =====================================================
     MARGEN TEÓRICO

     Ventas devengadas
     menos costo de reposición.
  ===================================================== */

  const margin =
    roundMoney(

      revenue -
      replacement

    );


  /*
    Parte de las ventas del día
    que todavía no se ha cobrado.

    No significa necesariamente
    saldo pendiente actual porque
    puede haberse recuperado parte
    mediante movimientos posteriores.
  */
  const uncollectedRevenue =
    roundMoney(

      Math.max(
        0,
        revenue -
        collected
      )

    );


  return {

    salesCount:
      sales.length,


    units,


    duragasUnits:
      soldByGas.duragas,


    kinggasUnits:
      soldByGas.kinggas,


    revenue,


    initialCollected,


    laterCollected,


    collected,


    cash,


    transfers,


    creditCreated,


    replacement,


    margin,


    uncollectedRevenue

  };

}


/* =========================================================
   DINERO PENDIENTE GLOBAL
========================================================= */

function openMoneyDue() {

  return roundMoney(

    state.accounts

      .filter(
        account =>
          !account.closed
      )

      .reduce(

        (
          total,
          account
        ) =>

          total +
          Math.max(
            0,
            num(
              account.moneyDue
            )
          ),

        0

      )

  );

}


/* =========================================================
   RESUMEN GLOBAL DE PENDIENTES
========================================================= */

function pendingTotals() {

  syncAllAccounts();


  const open =
    state.accounts.filter(

      account =>
        !account.closed &&
        accountType(
          account
        ) !==
        'none'

    );


  const tanks =
    emptyGasCounts();


  const pickup =
    emptyGasCounts();


  let moneyDue =
    0;


  for (
    const account
    of open
  ) {

    moneyDue +=
      Math.max(
        0,
        num(
          account.moneyDue
        )
      );


    const accountTanks =
      tankDebtCounts(
        account.id
      );


    const accountPickup =
      pickupDebtCounts(
        account.id
      );


    for (
      const type
      of GAS_TYPES
    ) {

      tanks[type] +=
        int(
          accountTanks[type]
        );


      pickup[type] +=
        int(
          accountPickup[type]
        );

    }

  }


  return {

    count:
      open.length,


    money:
      roundMoney(
        moneyDue
      ),


    tanks,


    tanksTotal:
      sumGasCounts(
        tanks
      ),


    pickup,


    pickupTotal:
      sumGasCounts(
        pickup
      ),


    bothCount:
      open.filter(
        account =>
          accountType(
            account
          ) ===
          'both'
      ).length,


    moneyCount:
      open.filter(
        account =>
          accountType(
            account
          ) ===
          'money'
      ).length,


    tankCount:
      open.filter(
        account =>
          accountType(
            account
          ) ===
          'tanks'
      ).length,


    pickupCount:
      open.filter(
        account =>
          accountType(
            account
          ) ===
          'pickup'
      ).length

  };

}


/* =========================================================
   TOTAL PAGADO DE UNA CUENTA
========================================================= */

function accountPaidAmount(
  account
) {

  if (!account) {

    return 0;

  }


  return roundMoney(

    Math.max(

      0,

      num(
        account.totalAmount
      ) -

      num(
        account.moneyDue
      )

    )

  );

}


/* =========================================================
   DATOS DEL CLIENTE
========================================================= */

function customerNames() {

  const names =
    new Set();


  /*
    CLIENTES DE VENTAS
  */
  for (
    const sale
    of state.sales
  ) {

    const name =
      String(
        sale.customer || ''
      ).trim();


    if (
      name &&
      name !==
      'Consumidor final'
    ) {

      names.add(
        name
      );

    }

  }


  /*
    CLIENTES DE PENDIENTES
  */
  for (
    const account
    of state.accounts
  ) {

    const name =
      String(
        account.customer || ''
      ).trim();


    if (
      name &&
      name !==
      'Consumidor final'
    ) {

      names.add(
        name
      );

    }

  }


  return Array.from(
    names
  ).sort(

    (
      a,
      b
    ) =>
      a.localeCompare(
        b,
        'es'
      )

  );

}


/* =========================================================
   RENDER DE SUGERENCIAS DE CLIENTES
========================================================= */

function renderCustomerSuggestions() {

  const datalist =
    $('customerSuggestions');


  if (!datalist) {

    return;

  }


  datalist.innerHTML =
    customerNames()

      .map(
        name =>

          `
            <option
              value="${escapeHtml(name)}"
            ></option>
          `

      )

      .join('');

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


function goTo(
  name
) {

  /*
    MARCAR PESTAÑA ACTIVA
  */

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


  /*
    MOSTRAR VISTA
  */

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


  /*
    ACCIONES ESPECÍFICAS
    AL ENTRAR A UNA SECCIÓN
  */

  if (
    name ===
    'opening'
  ) {

    renderOpeningState();

  }


  if (
    name ===
    'sales'
  ) {

    renderSaleAvailability();

    calculateSale();

  }


  if (
    name ===
    'accounts'
  ) {

    renderAccounts();

  }


  if (
    name ===
    'inventory'
  ) {

    renderInventory();

  }


  if (
    name ===
    'closing'
  ) {

    fillClosingExpected();

  }


  if (
    name ===
    'history'
  ) {

    renderHistory();

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

        const element =
          $(id);


        if (element) {

          element.textContent =
            readable;

        }

      }
    );

}


/* =========================================================
   INFORMACIÓN DEL DÍA ACTIVO
========================================================= */

function renderActiveDayText() {

  const element =
    $('activeDayText');


  if (!element) {

    return;

  }


  const day =
    getActiveDay();


  if (
    !day ||
    day.closed
  ) {

    element.textContent =
      'Día sin iniciar';

    return;

  }


  element.textContent =
    `Día activo: ${day.date}`;

}


/* =========================================================
   SABER SI EL DÍA YA TIENE ACTIVIDAD
========================================================= */

function dayHasActivity(
  day
) {

  if (!day) {

    return false;

  }


  return (

    salesForDay(
      day.id
    ).length >

      0 ||

    movementsForDay(
      day.id
    ).length >

      0 ||

    adjustmentsForDay(
      day.id
    ).length >

      0

  );

}


/* =========================================================
   APERTURA - TOTALES
========================================================= */

function updateOpeningTotals() {

  const duragasTotal =

    int(
      $('duragasFull')?.value
    ) +

    int(
      $('duragasEmpty')?.value
    ) +

    int(
      $('duragasReserved')?.value
    );


  const kinggasTotal =

    int(
      $('kinggasFull')?.value
    ) +

    int(
      $('kinggasEmpty')?.value
    ) +

    int(
      $('kinggasReserved')?.value
    );


  if (
    $('duragasOpeningTotal')
  ) {

    $('duragasOpeningTotal')
      .textContent =
      duragasTotal;

  }


  if (
    $('kinggasOpeningTotal')
  ) {

    $('kinggasOpeningTotal')
      .textContent =
      kinggasTotal;

  }

}


/* =========================================================
   APERTURA - MOSTRAR ESTADO ACTUAL
========================================================= */

function renderOpeningState() {

  const day =
    getActiveDay();


  const warning =
    $('openingWarning');


  if (!day) {

    if (warning) {

      warning.hidden =
        true;

    }


    updateOpeningTotals();

    return;

  }


  /*
    CARGAR APERTURA ACTUAL
    EN LOS CAMPOS.
  */

  const opening =
    day.opening ||
    emptyInventory();


  $('duragasFull').value =
    int(
      opening.duragas?.full
    );


  $('duragasEmpty').value =
    int(
      opening.duragas?.empty
    );


  $('duragasReserved').value =
    int(
      opening.duragas?.reserved
    );


  $('kinggasFull').value =
    int(
      opening.kinggas?.full
    );


  $('kinggasEmpty').value =
    int(
      opening.kinggas?.empty
    );


  $('kinggasReserved').value =
    int(
      opening.kinggas?.reserved
    );


  $('openingNote').value =
    day.note || '';


  /*
    SI YA HUBO MOVIMIENTOS,
    NO DEBE MODIFICARSE
    LA APERTURA.
  */

  if (warning) {

    warning.hidden =
      !dayHasActivity(
        day
      );

  }


  updateOpeningTotals();

}


/* =========================================================
   GUARDAR APERTURA
========================================================= */

function handleOpening(
  event
) {

  event.preventDefault();


  const current =
    getActiveDay();


  /*
    POKA-YOKE:

    Si ya hubo ventas,
    pagos o ajustes,
    no permitimos alterar
    el inventario inicial.
  */

  if (
    current &&
    !current.closed &&
    dayHasActivity(
      current
    )
  ) {

    toast(
      'El día ya tiene movimientos. Debes cerrarlo antes de iniciar otro.'
    );

    return;

  }


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
    EDITAR APERTURA SI EL DÍA
    TODAVÍA ESTÁ VACÍO.
  */

  if (
    current &&
    !current.closed
  ) {

    current.opening =
      opening;


    current.note =
      $('openingNote')
        .value
        .trim();

  }


  /*
    CREAR NUEVO DÍA
  */

  else {

    const now =
      nowParts();


    const day = {

      id:
        uid(),


      date:
        now.date,


      openedAt:
        now.dateTime,


      note:
        $('openingNote')
          .value
          .trim(),


      opening,


      closed:
        false,


      closing:
        null

    };


    state.days.push(
      day
    );


    state.activeDayId =
      day.id;

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
   CANTIDADES DEL FORMULARIO DE VENTA
========================================================= */

function saleFormQuantities() {

  return {

    duragas:
      int(
        $('qtyDuragas')
          ?.value
      ),


    kinggas:
      int(
        $('qtyKinggas')
          ?.value
      )

  };

}


function saleFormUnitCount() {

  return sumGasCounts(
    saleFormQuantities()
  );

}


/* =========================================================
   PRECIO SELECCIONADO
========================================================= */

function selectedSalePrice() {

  const price =
    roundMoney(
      $('salePrice')
        ?.value
    );


  /*
    PRECIO NO AUTORIZADO:
    VOLVER AL PRECIO POR DEFECTO.
  */

  if (
    !PRICES.includes(
      price
    )
  ) {

    return 2.25;

  }


  return price;

}


/* =========================================================
   RENDER DE BOTONES DE PRECIO
========================================================= */

function renderPriceButtons() {

  const container =
    $('quickPriceButtons');


  if (!container) {

    return;

  }


  let selected =
    roundMoney(
      state.ui.lastPrice
    );


  if (
    !PRICES.includes(
      selected
    )
  ) {

    selected =
      2.25;

  }


  $('salePrice').value =
    selected.toFixed(
      2
    );


  container.innerHTML =
    PRICES

      .map(
        price => `

          <button
            type="button"
            class="price-btn ${
              price === selected
                ? 'active'
                : ''
            }"
            data-price="${price.toFixed(2)}"
          >
            ${money(price)}
          </button>

        `
      )

      .join('');


  container
    .querySelectorAll(
      '[data-price]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () => {

            setSalePrice(
              num(
                button.dataset.price
              )
            );

          }

        );

      }
    );

}


/* =========================================================
   CAMBIAR PRECIO
========================================================= */

function setSalePrice(
  price
) {

  const safePrice =
    roundMoney(
      price
    );


  if (
    !PRICES.includes(
      safePrice
    )
  ) {

    toast(
      'Ese precio no está permitido.'
    );

    return;

  }


  $('salePrice').value =
    safePrice.toFixed(
      2
    );


  state.ui.lastPrice =
    safePrice;


  saveState();


  document
    .querySelectorAll(
      '[data-price]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          roundMoney(
            button.dataset.price
          ) ===
            safePrice

        );

      }
    );


  /*
    TRANSFERENCIA SIEMPRE
    SE AJUSTA AL NUEVO TOTAL.
  */

  if (
    $('salePaymentMethod')
      .value ===
    'Transferencia'
  ) {

    $('saleReceived').value =
      saleFormTotal()
        .toFixed(
          2
        );

  }


  calculateSale();

}


/* =========================================================
   TOTAL ACTUAL DEL FORMULARIO
========================================================= */

function saleFormTotal() {

  return roundMoney(

    saleFormUnitCount() *
    selectedSalePrice()

  );

}


/* =========================================================
   ACTUALIZAR CONTADOR DE UNIDADES
========================================================= */

function renderSaleUnitCount() {

  const units =
    saleFormUnitCount();


  const element =
    $('saleUnitsTotal');


  if (!element) {

    return;

  }


  element.textContent =

    `${units} ${
      units === 1
        ? 'unidad'
        : 'unidades'
    }`;

}


/* =========================================================
   SINCRONIZAR VACÍOS
========================================================= */

function syncEmptyDefaults() {

  const quantities =
    saleFormQuantities();


  const mode =
    $('saleMode')
      .value;


  const tankMode =
    $('saleTankMode')
      .value;


  /*
    EN RESERVA:

    El cliente deja todos
    sus vacíos.
  */

  if (
    mode ===
    'later'
  ) {

    $('emptyDuragas').value =
      quantities.duragas;


    $('emptyKinggas').value =
      quantities.kinggas;


    return;

  }


  /*
    INTERCAMBIO NORMAL:
    TODOS LOS VACÍOS.
  */

  if (
    tankMode ===
    'all'
  ) {

    $('emptyDuragas').value =
      quantities.duragas;


    $('emptyKinggas').value =
      quantities.kinggas;


    return;

  }


  /*
    SI FALTAN TANQUES,
    SOLO LIMITAMOS LOS VALORES
    PARA QUE NO SUPERE LO VENDIDO.
  */

  $('emptyDuragas').value =
    Math.min(

      quantities.duragas,

      int(
        $('emptyDuragas')
          .value
      )

    );


  $('emptyKinggas').value =
    Math.min(

      quantities.kinggas,

      int(
        $('emptyKinggas')
          .value
      )

    );

}


/* =========================================================
   CAMBIAR MODO DE ENTREGA
========================================================= */

function setSaleMode(
  mode
) {

  if (
    ![
      'now',
      'later'
    ].includes(
      mode
    )
  ) {

    return;

  }


  $('saleMode').value =
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
    PAGA Y RETIRA DESPUÉS
  */

  if (
    mode ===
    'later'
  ) {

    /*
      NO PUEDE SER FIADO.
    */

    if (
      $('salePaymentMethod')
        .value ===
      'Fiado'
    ) {

      setPaymentMethod(
        'Efectivo',
        false
      );

    }


    /*
      OBLIGATORIAMENTE DEJA
      TODOS LOS VACÍOS.
    */

    $('saleTankMode').value =
      'all';


    $('tankExchangeBlock').hidden =
      true;


    $('emptyReceivedWrap').hidden =
      true;


    syncEmptyDefaults();


    /*
      PARA REDUCIR CLICS,
      SI ESTÁ EN EFECTIVO Y
      NO HAY MONTO, COLOCAMOS EXACTO.
    */

    if (

      $('salePaymentMethod')
        .value ===
        'Efectivo' &&

      num(
        $('saleReceived')
          .value
      ) ===
        0

    ) {

      $('saleReceived').value =
        saleFormTotal()
          .toFixed(
            2
          );

    }

  }


  /*
    ENTREGA INMEDIATA
  */

  else {

    $('tankExchangeBlock').hidden =
      false;


    setTankMode(
      $('saleTankMode').value ||
      'all',
      false
    );

  }


  calculateSale();

}


/* =========================================================
   FORMA DE PAGO
========================================================= */

function setPaymentMethod(
  method,
  recalculate = true
) {

  if (
    ![
      'Efectivo',
      'Transferencia',
      'Fiado'
    ].includes(
      method
    )
  ) {

    return;

  }


  /*
    UNA RESERVA NO PUEDE SER FIADA.
  */

  if (

    $('saleMode').value ===
      'later' &&

    method ===
      'Fiado'

  ) {

    toast(
      'Una reserva debe quedar pagada.'
    );

    return;

  }


  $('salePaymentMethod').value =
    method;


  document
    .querySelectorAll(
      '[data-payment-method]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          button.dataset.paymentMethod ===
            method

        );

      }
    );


  const received =
    $('saleReceived');


  const quickCash =
    $('quickCashButtons');


  /*
    TRANSFERENCIA:
    SIEMPRE EXACTA.
  */

  if (
    method ===
    'Transferencia'
  ) {

    received.value =
      saleFormTotal()
        .toFixed(
          2
        );


    received.readOnly =
      true;


    if (quickCash) {

      quickCash.hidden =
        true;

    }

  }


  /*
    FIADO:
    $0 COBRADO.
  */

  else if (
    method ===
    'Fiado'
  ) {

    received.value =
      '0.00';


    received.readOnly =
      true;


    if (quickCash) {

      quickCash.hidden =
        true;

    }

  }


  /*
    EFECTIVO
  */

  else {

    received.readOnly =
      false;


    if (quickCash) {

      quickCash.hidden =
        false;

    }

  }


  if (recalculate) {

    calculateSale();

  }

}


/* =========================================================
   MODO DE TANQUES VACÍOS
========================================================= */

function setTankMode(
  mode,
  recalculate = true
) {

  if (
    ![
      'all',
      'missing'
    ].includes(
      mode
    )
  ) {

    return;

  }


  /*
    RESERVA SIEMPRE USA
    INTERCAMBIO COMPLETO.
  */

  if (
    $('saleMode').value ===
    'later'
  ) {

    mode =
      'all';

  }


  $('saleTankMode').value =
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


  if (
    mode ===
    'all'
  ) {

    $('emptyReceivedWrap').hidden =
      true;


    syncEmptyDefaults();

  }


  else {

    /*
      AL ENTRAR A "FALTAN TANQUES"
      INICIAMOS CON TODOS RECIBIDOS.

      El usuario solo baja
      la marca que realmente falta.
    */

    const quantities =
      saleFormQuantities();


    $('emptyDuragas').value =
      quantities.duragas;


    $('emptyKinggas').value =
      quantities.kinggas;


    $('emptyReceivedWrap').hidden =
      false;

  }


  if (recalculate) {

    calculateSale();

  }

}


/* =========================================================
   CAMBIAR CANTIDAD DE UNA MARCA
========================================================= */

function changeSaleQuantity(
  gasType,
  delta
) {

  if (
    !GAS_TYPES.includes(
      gasType
    )
  ) {

    return;

  }


  const input =

    gasType ===
    'duragas'

      ? $('qtyDuragas')

      : $('qtyKinggas');


  input.value =
    Math.max(

      0,

      int(
        input.value
      ) +

      Math.trunc(
        num(
          delta
        )
      )

    );


  afterSaleQuantityChange();

}


/* =========================================================
   FIJAR CANTIDAD RÁPIDA
========================================================= */

function setSaleQuantity(
  gasType,
  qty
) {

  if (
    !GAS_TYPES.includes(
      gasType
    )
  ) {

    return;

  }


  const input =

    gasType ===
    'duragas'

      ? $('qtyDuragas')

      : $('qtyKinggas');


  input.value =
    int(
      qty
    );


  afterSaleQuantityChange();

}


/* =========================================================
   DESPUÉS DE CAMBIAR CANTIDADES
========================================================= */

function afterSaleQuantityChange() {

  renderSaleUnitCount();


  syncEmptyDefaults();


  /*
    TRANSFERENCIA DEBE
    SEGUIR SIENDO EXACTA.
  */

  if (
    $('salePaymentMethod')
      .value ===
    'Transferencia'
  ) {

    $('saleReceived').value =
      saleFormTotal()
        .toFixed(
          2
        );

  }


  calculateSale();

}


/* =========================================================
   BOTONES DE EFECTIVO
========================================================= */

function setQuickCash(
  value
) {

  /*
    SOLO FUNCIONA EN EFECTIVO.
  */

  if (
    $('salePaymentMethod')
      .value !==
    'Efectivo'
  ) {

    return;

  }


  const received =
    $('saleReceived');


  if (
    value ===
    'exact'
  ) {

    received.value =
      saleFormTotal()
        .toFixed(
          2
        );

  }


  else {

    received.value =
      roundMoney(
        value
      )
        .toFixed(
          2
        );

  }


  calculateSale();

}


/* =========================================================
   RESALTAR BOTONES DE EFECTIVO
========================================================= */

function highlightCashButtons() {

  const current =
    roundMoney(
      $('saleReceived')
        ?.value
    );


  const total =
    saleFormTotal();


  document
    .querySelectorAll(
      '[data-cash]'
    )
    .forEach(
      button => {

        const value =
          button.dataset.cash;


        const selected =

          value ===
          'exact'

            ? current ===
              total

            : current ===
              roundMoney(
                value
              );


        button.classList.toggle(

          'selected',

          selected

        );

      }
    );

}


/* =========================================================
   DISPONIBILIDAD DE GAS EN VENTAS
========================================================= */

function renderSaleAvailability() {

  const day =
    getActiveDay();


  /*
    Si no existe día,
    no bloqueamos toda la interfaz;
    handleSale hará la validación.
  */

  if (!day) {

    return;

  }


  const inventory =
    currentInventory();


  /*
    TOOLTIP SIMPLE EN LOS CAMPOS.
  */

  $('qtyDuragas').title =
    `Disponibles: ${inventory.duragas.full}`;


  $('qtyKinggas').title =
    `Disponibles: ${inventory.kinggas.full}`;

}


/* =========================================================
   CONFIGURAR CONTROLES DE VENTA
========================================================= */

function setupSaleControls() {

  /*
    ENTREGA AHORA / DESPUÉS
  */

  document
    .querySelectorAll(
      '[data-sale-mode]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setSaleMode(
              button.dataset.saleMode
            )

        );

      }
    );


  /*
    FORMA DE PAGO
  */

  document
    .querySelectorAll(
      '[data-payment-method]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setPaymentMethod(
              button.dataset.paymentMethod
            )

        );

      }
    );


  /*
    INTERCAMBIO COMPLETO /
    FALTAN TANQUES
  */

  document
    .querySelectorAll(
      '[data-tank-mode]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setTankMode(
              button.dataset.tankMode
            )

        );

      }
    );


  /*
    BOTONES + / -
  */

  document
    .querySelectorAll(
      '[data-qty-step]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            changeSaleQuantity(

              button.dataset.gas,

              button.dataset.qtyStep

            )

        );

      }
    );


  /*
    CANTIDADES RÁPIDAS
  */

  document
    .querySelectorAll(
      '[data-qty-set]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setSaleQuantity(

              button.dataset.gas,

              button.dataset.qtySet

            )

        );

      }
    );


  /*
    EFECTIVO RÁPIDO
  */

  document
    .querySelectorAll(
      '[data-cash]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setQuickCash(
              button.dataset.cash
            )

        );

      }
    );


  /*
    CAMBIOS MANUALES
    EN CANTIDADES
  */

  [
    'qtyDuragas',
    'qtyKinggas'
  ]
    .forEach(
      id => {

        $(id)
          .addEventListener(

            'input',

            afterSaleQuantityChange

          );

      }
    );


  /*
    VACÍOS RECIBIDOS
  */

  [
    'emptyDuragas',
    'emptyKinggas'
  ]
    .forEach(
      id => {

        $(id)
          .addEventListener(

            'input',

            () => {

              syncEmptyDefaults();

              calculateSale();

            }

          );

      }
    );


  /*
    DINERO ESCRITO MANUALMENTE
  */

  $('saleReceived')
    .addEventListener(

      'input',

      calculateSale

    );


  /*
    RENDER INICIAL
  */

  renderPriceButtons();

  renderSaleUnitCount();

  syncEmptyDefaults();

  setPaymentMethod(
    'Efectivo',
    false
  );

  setSaleMode(
    'now'
  );

}
/* =========================================================
   DATOS DE VACÍOS RECIBIDOS
========================================================= */

function saleEmptyReceivedCounts() {

  const quantities =
    saleFormQuantities();


  const mode =
    $('saleMode')
      .value;


  const tankMode =
    $('saleTankMode')
      .value;


  /*
    PAGA Y RETIRA DESPUÉS:
    por regla de negocio deja
    todos los vacíos.
  */

  if (
    mode ===
    'later'
  ) {

    return {

      duragas:
        quantities.duragas,

      kinggas:
        quantities.kinggas

    };

  }


  /*
    INTERCAMBIO NORMAL COMPLETO.
  */

  if (
    tankMode ===
    'all'
  ) {

    return {

      duragas:
        quantities.duragas,

      kinggas:
        quantities.kinggas

    };

  }


  /*
    FALTAN TANQUES:

    Se toma únicamente lo
    realmente indicado,
    sin permitir exceder
    lo vendido.
  */

  return {

    duragas:
      Math.min(

        quantities.duragas,

        int(
          $('emptyDuragas')
            .value
        )

      ),


    kinggas:
      Math.min(

        quantities.kinggas,

        int(
          $('emptyKinggas')
            .value
        )

      )

  };

}


/* =========================================================
   TANQUES DEBIDOS POR MARCA
========================================================= */

function saleTankDebtCounts() {

  const quantities =
    saleFormQuantities();


  const received =
    saleEmptyReceivedCounts();


  /*
    EN RESERVA NO EXISTE
    DEUDA DE TANQUES.

    El cliente deja todos.
  */

  if (
    $('saleMode').value ===
    'later'
  ) {

    return emptyGasCounts();

  }


  return {

    duragas:
      Math.max(

        0,

        quantities.duragas -
        received.duragas

      ),


    kinggas:
      Math.max(

        0,

        quantities.kinggas -
        received.kinggas

      )

  };

}


/* =========================================================
   GAS PAGADO PENDIENTE DE RETIRAR
========================================================= */

function salePickupCounts() {

  if (
    $('saleMode').value !==
    'later'
  ) {

    return emptyGasCounts();

  }


  return saleFormQuantities();

}


/* =========================================================
   CÁLCULO COMPLETO DE VENTA
========================================================= */

function calculateSale() {

  const quantities =
    saleFormQuantities();


  const units =
    sumGasCounts(
      quantities
    );


  const price =
    selectedSalePrice();


  const total =
    roundMoney(

      units *
      price

    );


  const mode =
    $('saleMode')
      .value;


  const method =
    $('salePaymentMethod')
      .value;


  /*
    TRANSFERENCIA:
    SIEMPRE MONTO EXACTO.
  */

  if (
    method ===
    'Transferencia'
  ) {

    $('saleReceived').value =
      total.toFixed(
        2
      );

  }


  /*
    FIADO:
    COBRO INICIAL = 0.
  */

  if (
    method ===
    'Fiado'
  ) {

    $('saleReceived').value =
      '0.00';

  }


  /*
    EN RESERVA TODOS LOS
    VACÍOS SON ENTREGADOS.
  */

  syncEmptyDefaults();


  const received =
    Math.max(

      0,

      roundMoney(
        $('saleReceived')
          .value
      )

    );


  /*
    DINERO REALMENTE APLICADO
    A LA VENTA.

    Ejemplo:

    Total = $18
    Entrega = $20

    paidNow = $18
    change  = $2

    Los $2 NO son ingreso.
  */

  const paidNow =

    method ===
    'Fiado'

      ? 0

      : Math.min(
          total,
          received
        );


  /*
    VUELTO SOLO APLICA
    A EFECTIVO.
  */

  const change =

    method ===
    'Efectivo'

      ? Math.max(

          0,

          roundMoney(
            received -
            total
          )

        )

      : 0;


  /*
    DINERO PENDIENTE.
  */

  const moneyDue =
    roundMoney(

      Math.max(

        0,

        total -
        paidNow

      )

    );


  const emptyReceived =
    saleEmptyReceivedCounts();


  const tanksDue =
    saleTankDebtCounts();


  const pickupDue =
    salePickupCounts();


  const tanksDueTotal =
    sumGasCounts(
      tanksDue
    );


  const pickupDueTotal =
    sumGasCounts(
      pickupDue
    );


  /* =====================================================
     ACTUALIZAR INTERFAZ
  ===================================================== */

  renderSaleUnitCount();


  $('saleTotal')
    .textContent =
    money(
      total
    );


  $('salePaidNow')
    .textContent =
    money(
      paidNow
    );


  $('saleChange')
    .textContent =
    money(
      change
    );


  $('saleMoneyDue')
    .textContent =
    money(
      moneyDue
    );


  $('saleTanksDue')
    .textContent =

    tanksDueTotal > 0

      ? gasCountText(
          tanksDue
        )

      : '0';


  $('salePendingPickup')
    .textContent =

    pickupDueTotal > 0

      ? gasCountText(
          pickupDue
        )

      : '0';


  /*
    RESALTAR BOTÓN DE
    EFECTIVO SELECCIONADO.
  */

  highlightCashButtons();


  /*
    MENSAJE AUTOMÁTICO
    DE LA OPERACIÓN.
  */

  renderSaleStatus({

    units,

    quantities,

    price,

    total,

    received,

    paidNow,

    change,

    moneyDue,

    emptyReceived,

    tanksDue,

    tanksDueTotal,

    pickupDue,

    pickupDueTotal,

    mode,

    method

  });


  return {

    units,

    quantities,

    price,

    total,

    received,

    paidNow,

    change,

    moneyDue,

    emptyReceived,

    tanksDue,

    tanksDueTotal,

    pickupDue,

    pickupDueTotal,

    mode,

    method

  };

}


/* =========================================================
   MENSAJE / ESTADO DE LA VENTA
========================================================= */

function renderSaleStatus(
  calc
) {

  const element =
    $('saleStatus');


  if (!element) {

    return;

  }


  let text =
    'Venta normal: sin pendientes.';


  let tone =
    'good';


  /*
    SIN PRODUCTOS
  */

  if (
    calc.units ===
    0
  ) {

    text =
      'Selecciona al menos un tanque para registrar la operación.';


    tone =
      'warn';

  }


  /*
    PAGA Y RETIRA DESPUÉS
  */

  else if (
    calc.mode ===
    'later'
  ) {

    if (
      calc.moneyDue >
      0.009
    ) {

      text =
        `Faltan ${money(calc.moneyDue)} para poder reservar el pedido.`;


      tone =
        'bad';

    }


    else {

      text =
        `Pedido pagado. Quedarán reservados: ${gasCountText(calc.pickupDue)}.`;


      tone =
        'warn';

    }

  }


  /*
    DEBE DINERO Y TANQUES
  */

  else if (

    calc.moneyDue >
      0.009 &&

    calc.tanksDueTotal >
      0

  ) {

    text =
      `Se generará pendiente: debe ${money(calc.moneyDue)} y ${gasCountText(calc.tanksDue)}.`;


    tone =
      'bad';

  }


  /*
    SOLO DINERO
  */

  else if (
    calc.moneyDue >
    0.009
  ) {

    text =
      `Se generará pendiente de dinero por ${money(calc.moneyDue)}.`;


    tone =
      'warn';

  }


  /*
    SOLO TANQUES
  */

  else if (
    calc.tanksDueTotal >
    0
  ) {

    text =
      `Se generará pendiente de tanques: ${gasCountText(calc.tanksDue)}.`;


    tone =
      'warn';

  }


  /*
    VENTA COMPLETA
  */

  else if (
    calc.units >
    0
  ) {

    text =
      `Operación completa: ${gasCountText(calc.quantities)}.`;


    tone =
      'good';

  }


  element.className =
    `operation-status ${tone}`;


  element.textContent =
    text;

}


/* =========================================================
   VALIDAR INVENTARIO ANTES DE VENDER
========================================================= */

function validateSaleInventory(
  calc
) {

  const inventory =
    currentInventory();


  for (
    const gasType
    of GAS_TYPES
  ) {

    const requested =
      int(
        calc.quantities[
          gasType
        ]
      );


    const available =
      int(
        inventory[
          gasType
        ]?.full
      );


    /*
      SI NO COMPRA ESTA MARCA,
      NO HAY NADA QUE VALIDAR.
    */

    if (
      requested ===
      0
    ) {

      continue;

    }


    /*
      NO SE PUEDE VENDER NI
      RESERVAR MÁS DE LO DISPONIBLE.
    */

    if (
      requested >
      available
    ) {

      return {

        valid:
          false,


        message:

          `Solo hay ${available} ${gasFullLabel(gasType)} llenos disponibles y estás intentando registrar ${requested}.`

      };

    }

  }


  return {

    valid:
      true,

    message:
      ''

  };

}


/* =========================================================
   VALIDAR OPERACIÓN COMPLETA
========================================================= */

function validateSale(
  calc
) {

  /*
    DEBE EXISTIR DÍA ACTIVO.
  */

  if (
    !requireActiveDay()
  ) {

    return false;

  }


  /*
    DEBE HABER AL MENOS
    UNA UNIDAD.
  */

  if (
    calc.units <
    1
  ) {

    toast(
      'Selecciona al menos un tanque.'
    );


    return false;

  }


  /*
    PRECIO RÍGIDO.
  */

  if (
    !PRICES.includes(
      calc.price
    )
  ) {

    toast(
      'El precio seleccionado no está permitido.'
    );


    return false;

  }


  /*
    VALIDACIÓN DE STOCK.
  */

  const stockCheck =
    validateSaleInventory(
      calc
    );


  if (
    !stockCheck.valid
  ) {

    toast(
      stockCheck.message
    );


    return false;

  }


  /*
    UNA RESERVA DEBE
    QUEDAR 100% PAGADA.
  */

  if (

    calc.mode ===
      'later' &&

    calc.moneyDue >
      0.009

  ) {

    toast(
      'Para reservar y retirar después debe quedar pagado el total.'
    );


    return false;

  }


  /*
    UNA RESERVA NO
    PUEDE SER FIADA.
  */

  if (

    calc.mode ===
      'later' &&

    calc.method ===
      'Fiado'

  ) {

    toast(
      'Una reserva no puede quedar fiada.'
    );


    return false;

  }


  /*
    IDENTIFICACIÓN DEL CLIENTE.

    Solo es obligatoria si queda
    una obligación pendiente.
  */

  const needsCustomer =

    calc.moneyDue >
      0.009 ||

    calc.tanksDueTotal >
      0 ||

    calc.pickupDueTotal >
      0;


  const customer =
    $('saleCustomer')
      .value
      .trim();


  if (
    needsCustomer &&
    !customer
  ) {

    toast(
      'Escribe el nombre o referencia del cliente porque esta operación dejará un pendiente.'
    );


    $('saleCustomer')
      .focus();


    return false;

  }


  return true;

}


/* =========================================================
   CREAR CUENTA PENDIENTE DESDE VENTA
========================================================= */

function createAccountFromSale(
  sale,
  calc
) {

  const hasPending =

    calc.moneyDue >
      0.009 ||

    calc.tanksDueTotal >
      0 ||

    calc.pickupDueTotal >
      0;


  /*
    VENTA COMPLETAMENTE SALDADA:
    NO GENERA CUENTA.
  */

  if (
    !hasPending
  ) {

    return null;

  }


  const account = {

    id:
      uid(),


    saleId:
      sale.id,


    createdAt:
      sale.dateTime,


    customer:
      sale.customer,


    totalAmount:
      sale.total,


    moneyDue:
      calc.moneyDue,


    note:
      sale.note || '',


    closed:
      false,


    closedAt:
      null

  };


  state.accounts.push(
    account
  );


  /*
    CREAR SALDOS POR MARCA.

    Solo se crea una fila cuando
    existe deuda de tanque o
    producto por retirar.
  */

  for (
    const gasType
    of GAS_TYPES
  ) {

    const tanksDue =
      int(
        calc.tanksDue[
          gasType
        ]
      );


    const pickupDue =
      int(
        calc.pickupDue[
          gasType
        ]
      );


    if (

      tanksDue ===
        0 &&

      pickupDue ===
        0

    ) {

      continue;

    }


    state.accountBalances.push({

      id:
        uid(),


      accountId:
        account.id,


      gasType,


      tanksDue,


      pickupDue

    });

  }


  syncAccountClosed(
    account
  );


  return account;

}


/* =========================================================
   GUARDAR VENTA
========================================================= */

function handleSale(
  event
) {

  event.preventDefault();


  /*
    RECALCULAR EN EL MOMENTO
    EXACTO DEL GUARDADO.
  */

  const calc =
    calculateSale();


  if (
    !validateSale(
      calc
    )
  ) {

    return;

  }


  const day =
    getActiveDay();


  const customerRaw =
    $('saleCustomer')
      .value
      .trim();


  const customer =

    customerRaw ||

    'Consumidor final';


  const dateTime =
    nowParts()
      .dateTime;


  /*
    CABECERA FINANCIERA
    DE UNA ÚNICA VENTA.
  */

  const sale = {

    id:
      uid(),


    dayId:
      day.id,


    dateTime,


    customer,


    deliveryMode:
      calc.mode,


    unitPrice:
      calc.price,


    total:
      calc.total,


    received:
      calc.received,


    /*
      SOLO DINERO APLICADO
      A LA VENTA.
    */
    paidNow:
      calc.paidNow,


    change:
      calc.change,


    paymentMethod:
      calc.method,


    /*
      Se conserva el saldo
      inicial generado para
      trazabilidad histórica.
    */
    moneyDue:
      calc.moneyDue,


    note:
      $('saleNote')
        .value
        .trim()

  };


  state.sales.push(
    sale
  );


  /* =====================================================
     LÍNEAS DE VENTA POR MARCA
  ===================================================== */

  for (
    const gasType
    of GAS_TYPES
  ) {

    const qty =
      int(
        calc.quantities[
          gasType
        ]
      );


    /*
      NO CREAMOS LÍNEAS
      DE CANTIDAD CERO.
    */

    if (
      qty ===
      0
    ) {

      continue;

    }


    state.saleLines.push({

      id:
        uid(),


      saleId:
        sale.id,


      gasType,


      qty,


      /*
        Guarda lo realmente
        recibido en vacíos.
      */
      emptyReceived:
        int(
          calc.emptyReceived[
            gasType
          ]
        )

    });

  }


  /*
    PENDIENTE AUTOMÁTICO.
  */

  createAccountFromSale(
    sale,
    calc
  );


  saveState();


  /*
    GUARDAR MENSAJE ANTES
    DE LIMPIAR FORMULARIO.
  */

  let message =
    'Venta registrada correctamente.';


  if (
    calc.pickupDueTotal >
    0
  ) {

    message =
      'Venta pagada y gas reservado correctamente.';

  }


  else if (

    calc.moneyDue >
      0.009 ||

    calc.tanksDueTotal >
      0

  ) {

    message =
      'Venta registrada y pendiente creado automáticamente.';

  }


  /*
    LIMPIAR PARA LA SIGUIENTE
    ATENCIÓN.
  */

  resetSaleForm();


  renderAll();


  goTo(
    'sales'
  );


  toast(
    message
  );

}


/* =========================================================
   REINICIAR FORMULARIO DE VENTA
========================================================= */

function resetSaleForm() {

  /*
    CLIENTE Y NOTA
  */

  $('saleCustomer').value =
    '';


  $('saleNote').value =
    '';


  /*
    CANTIDADES
  */

  $('qtyDuragas').value =
    0;


  $('qtyKinggas').value =
    0;


  /*
    INTERCAMBIO NORMAL
  */

  $('saleMode').value =
    'now';


  $('saleTankMode').value =
    'all';


  $('emptyDuragas').value =
    0;


  $('emptyKinggas').value =
    0;


  /*
    FORMA DE PAGO
  */

  $('saleReceived').value =
    '0.00';


  setPaymentMethod(
    'Efectivo',
    false
  );


  setTankMode(
    'all',
    false
  );


  setSaleMode(
    'now'
  );


  /*
    CONSERVAMOS EL ÚLTIMO PRECIO
    UTILIZADO PARA AHORRAR CLICS.
  */

  const savedPrice =
    PRICES.includes(
      roundMoney(
        state.ui.lastPrice
      )
    )

      ? roundMoney(
          state.ui.lastPrice
        )

      : 2.25;


  $('salePrice').value =
    savedPrice.toFixed(
      2
    );


  document
    .querySelectorAll(
      '[data-price]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          roundMoney(
            button.dataset.price
          ) ===
            savedPrice

        );

      }
    );


  renderSaleUnitCount();


  syncEmptyDefaults();


  calculateSale();

}


/* =========================================================
   OBTENER CUENTA DE UNA VENTA
========================================================= */

function accountForSale(
  saleId
) {

  return state.accounts.find(

    account =>
      account.saleId ===
      saleId

  ) || null;

}


/* =========================================================
   ESTADO PARA TABLA DE VENTAS
========================================================= */

function saleStatusInfo(
  sale
) {

  const account =
    accountForSale(
      sale.id
    );


  /*
    NUNCA GENERÓ PENDIENTE.
  */

  if (!account) {

    return {

      label:
        'Completada',

      tone:
        'good'

    };

  }


  syncAccountClosed(
    account
  );


  /*
    YA FUE SALDADA
    POSTERIORMENTE.
  */

  if (
    account.closed
  ) {

    return {

      label:
        'Saldada',

      tone:
        'good'

    };

  }


  const type =
    accountType(
      account
    );


  if (
    type ===
    'pickup'
  ) {

    return {

      label:
        'Por retirar',

      tone:
        'warn'

    };

  }


  if (
    type ===
    'both'
  ) {

    return {

      label:
        'Debe dinero + tanques',

      tone:
        'bad'

    };

  }


  if (
    type ===
    'money'
  ) {

    return {

      label:
        'Debe dinero',

      tone:
        'warn'

    };

  }


  if (
    type ===
    'tanks'
  ) {

    return {

      label:
        'Debe tanques',

      tone:
        'warn'

    };

  }


  return {

    label:
      'Completada',

    tone:
      'good'

  };

}


/* =========================================================
   MOSTRAR VENTAS DEL DÍA
========================================================= */

function renderSales() {

  const body =
    $('salesBody');


  if (!body) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    body.innerHTML = `

      <tr>

        <td colspan="7">

          ${emptyMsg(
            'Primero debes abrir el día.'
          )}

        </td>

      </tr>

    `;


    return;

  }


  const sales =
    salesForDay(
      day.id
    )
      .slice()
      .sort(

        (
          a,
          b
        ) =>

          new Date(
            b.dateTime
          ) -

          new Date(
            a.dateTime
          )

      );


  if (
    !sales.length
  ) {

    body.innerHTML = `

      <tr>

        <td colspan="7">

          ${emptyMsg(
            'Todavía no hay ventas registradas.'
          )}

        </td>

      </tr>

    `;


    return;

  }


  body.innerHTML =
    sales

      .map(
        sale => {

          const status =
            saleStatusInfo(
              sale
            );


          return `

            <tr>

              <td>
                ${timeOnly(sale.dateTime)}
              </td>


              <td>
                ${escapeHtml(sale.customer)}
              </td>


              <td>
                <strong>
                  ${escapeHtml(
                    saleGasText(
                      sale.id
                    )
                  )}
                </strong>
              </td>


              <td>
                ${money(sale.unitPrice)}
              </td>


              <td>
                <strong>
                  ${money(sale.total)}
                </strong>
              </td>


              <td>
                ${money(sale.paidNow)}
              </td>


              <td>

                <span class="badge ${status.tone}">
                  ${escapeHtml(status.label)}
                </span>

              </td>

            </tr>

          `;

        }
      )

      .join('');

}
/* =========================================================
   LIMPIAR SALDOS EN CERO
========================================================= */

/*
  Cuando una marca ya no tiene
  ni tanques por devolver ni
  gas por retirar, eliminamos
  esa fila de accountBalances.

  Evita datos muertos.
*/
function pruneZeroBalances(
  accountId
) {

  state.accountBalances =
    state.accountBalances.filter(
      balance => {

        if (
          balance.accountId !==
          accountId
        ) {

          return true;

        }


        return (

          int(
            balance.tanksDue
          ) > 0 ||

          int(
            balance.pickupDue
          ) > 0

        );

      }
    );

}


/* =========================================================
   TEXTO DEL PEDIDO ORIGINAL
========================================================= */

function accountOrderText(
  account
) {

  if (
    !account?.saleId
  ) {

    return 'Sin detalle de venta';

  }


  return saleGasText(
    account.saleId
  );

}


/* =========================================================
   MOSTRAR PENDIENTES
========================================================= */

function renderAccounts() {

  syncAllAccounts();


  const container =
    $('accountsCards');


  if (!container) {

    return;

  }


  const open =
    state.accounts

      .filter(
        account =>

          !account.closed &&

          accountType(
            account
          ) !==
          'none'
      )

      .sort(
        (
          a,
          b
        ) =>

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

    container.innerHTML =
      emptyMsg(
        'No hay pendientes. Todas las cuentas están al día.'
      );


    return;

  }


  /*
    ORDEN DE PRIORIDAD:

    1. Debe dinero y tanques
    2. Debe dinero
    3. Debe tanques
    4. Pagado por retirar
  */

  const groups = [

    {

      key:
        'both',

      title:
        'Debe dinero y tanques',

      description:
        'Falta parte del pago y también uno o más tanques.',

      tone:
        'bad'

    },


    {

      key:
        'money',

      title:
        'Debe solo dinero',

      description:
        'Los tanques están completos, pero todavía falta dinero.',

      tone:
        'warn'

    },


    {

      key:
        'tanks',

      title:
        'Debe solo tanques',

      description:
        'El dinero está completo, pero faltan tanques vacíos.',

      tone:
        'warn'

    },


    {

      key:
        'pickup',

      title:
        'Pagado y pendiente de retirar',

      description:
        'El cliente ya pagó y tiene gas lleno reservado.',

      tone:
        'good'

    }

  ];


  container.innerHTML =
    groups

      .map(
        group => {

          const list =
            open.filter(
              account =>
                accountType(
                  account
                ) ===
                group.key
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
                    ${escapeHtml(group.title)}
                  </h3>

                  <p>
                    ${escapeHtml(group.description)}
                  </p>

                </div>


                <span class="badge ${group.tone}">
                  ${list.length}
                </span>

              </div>


              <div class="account-list">

                ${
                  list

                    .map(
                      account =>
                        accountCard(
                          account
                        )
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

function accountCard(
  account
) {

  const type =
    accountType(
      account
    );


  const tanks =
    tankDebtCounts(
      account.id
    );


  const pickup =
    pickupDebtCounts(
      account.id
    );


  const tanksTotal =
    sumGasCounts(
      tanks
    );


  const pickupTotal =
    sumGasCounts(
      pickup
    );


  const paid =
    accountPaidAmount(
      account
    );


  const cardClass = {

    both:
      'debt-both',

    money:
      'debt-money',

    tanks:
      'debt-tanks',

    pickup:
      'debt-pickup'

  }[type] || '';


  const statusLabel = {

    both:
      'Dinero + tanques',

    money:
      'Debe dinero',

    tanks:
      'Debe tanques',

    pickup:
      'Por retirar'

  }[type] || 'Pendiente';


  const statusTone =

    type ===
    'both'

      ? 'bad'

      : type ===
        'pickup'

        ? 'good'

        : 'warn';


  return `

    <article
      class="account-card ${cardClass}"
    >

      <!-- CLIENTE -->

      <div class="account-head">

        <div>

          <h4>
            ${escapeHtml(account.customer)}
          </h4>

          <p class="subtle">
            ${shortDateTime(account.createdAt)}
          </p>

        </div>


        <span class="badge ${statusTone}">
          ${escapeHtml(statusLabel)}
        </span>

      </div>



      <!-- PEDIDO ORIGINAL -->

      <div class="account-detail-grid">

        <div class="account-detail">

          <span>
            Pedido
          </span>

          <strong>
            ${escapeHtml(
              accountOrderText(
                account
              )
            )}
          </strong>

        </div>


        <div class="account-detail">

          <span>
            Total venta
          </span>

          <strong>
            ${money(account.totalAmount)}
          </strong>

        </div>


        <div class="account-detail">

          <span>
            Ya pagado
          </span>

          <strong>
            ${money(paid)}
          </strong>

        </div>


        <div class="account-detail">

          <span>
            Dinero pendiente
          </span>

          <strong>
            ${money(account.moneyDue)}
          </strong>

        </div>

      </div>



      <!-- SALDOS ESPECÍFICOS -->

      <div class="account-meta">

        ${
          tanks.duragas > 0

            ? `
              <span class="badge duragas">
                Debe ${tanks.duragas}
                Duragas
              </span>
            `

            : ''
        }


        ${
          tanks.kinggas > 0

            ? `
              <span class="badge kinggas">
                Debe ${tanks.kinggas}
                King Gas
              </span>
            `

            : ''
        }


        ${
          pickup.duragas > 0

            ? `
              <span class="badge duragas">
                Retira ${pickup.duragas}
                Duragas
              </span>
            `

            : ''
        }


        ${
          pickup.kinggas > 0

            ? `
              <span class="badge kinggas">
                Retira ${pickup.kinggas}
                King Gas
              </span>
            `

            : ''
        }

      </div>



      ${
        account.note

          ? `
            <p class="subtle">
              ${escapeHtml(account.note)}
            </p>
          `

          : ''
      }



      <!-- ACCIONES -->

      <div class="account-actions">


        ${
          num(
            account.moneyDue
          ) >
          0.009

            ? `
              <button
                class="btn small primary"
                type="button"
                data-account-id="${account.id}"
                data-account-action="money"
              >
                Registrar pago
              </button>
            `

            : ''
        }


        ${
          tanksTotal > 0

            ? `
              <button
                class="btn small ghost"
                type="button"
                data-account-id="${account.id}"
                data-account-action="tank"
              >
                Devolvió tanques
              </button>
            `

            : ''
        }


        ${
          pickupTotal > 0

            ? `
              <button
                class="btn small primary"
                type="button"
                data-account-id="${account.id}"
                data-account-action="pickup"
              >
                Entregar reserva
              </button>
            `

            : ''
        }

      </div>

    </article>

  `;

}


/* =========================================================
   FORMA DE PAGO DE UN ABONO
========================================================= */

function setPendingPaymentMethod(
  method
) {

  if (
    ![
      'Efectivo',
      'Transferencia'
    ].includes(
      method
    )
  ) {

    return;

  }


  $('pendingPaymentMethod').value =
    method;


  document
    .querySelectorAll(
      '[data-pending-payment-method]'
    )
    .forEach(
      button => {

        button.classList.toggle(

          'active',

          button.dataset.pendingPaymentMethod ===
            method

        );

      }
    );

}


/* =========================================================
   ABRIR ACCIÓN DE PENDIENTE
========================================================= */

function openAccountAction(
  accountId,
  action
) {

  const account =
    state.accounts.find(
      item =>
        item.id ===
        accountId
    );


  if (
    !account ||
    account.closed
  ) {

    toast(
      'La cuenta ya no está pendiente.'
    );


    renderAccounts();

    return;

  }


  if (
    ![
      'money',
      'tank',
      'pickup'
    ].includes(
      action
    )
  ) {

    return;

  }


  $('paymentAccountId').value =
    account.id;


  $('paymentAction').value =
    action;


  /*
    SOLO MOSTRAR
    LA PARTE NECESARIA.
  */

  $('paymentAmountWrap').hidden =
    action !==
    'money';


  $('paymentTanksWrap').hidden =
    action !==
    'tank';


  $('paymentPickupWrap').hidden =
    action !==
    'pickup';


  /* =====================================================
     PAGO DE DINERO
  ===================================================== */

  if (
    action ===
    'money'
  ) {

    $('paymentAmount').value =
      num(
        account.moneyDue
      )
        .toFixed(
          2
        );


    $('paymentAmount').max =
      num(
        account.moneyDue
      )
        .toFixed(
          2
        );


    setPendingPaymentMethod(
      'Efectivo'
    );

  }


  /* =====================================================
     DEVOLUCIÓN DE TANQUES
  ===================================================== */

  const tanks =
    tankDebtCounts(
      account.id
    );


  $('paymentTankDuragas').value =
    tanks.duragas;


  $('paymentTankKinggas').value =
    tanks.kinggas;


  $('paymentTankDuragas').max =
    tanks.duragas;


  $('paymentTankKinggas').max =
    tanks.kinggas;


  $('paymentTankHint')
    .textContent =

    tanks.duragas +
    tanks.kinggas >
      0

      ? `Actualmente debe: ${gasCountText(tanks)}.`

      : 'No tiene tanques pendientes.';


  /* =====================================================
     RETIRO DE RESERVAS
  ===================================================== */

  const pickup =
    pickupDebtCounts(
      account.id
    );


  $('paymentPickupDuragas').value =
    pickup.duragas;


  $('paymentPickupKinggas').value =
    pickup.kinggas;


  $('paymentPickupDuragas').max =
    pickup.duragas;


  $('paymentPickupKinggas').max =
    pickup.kinggas;


  $('paymentPickupHint')
    .textContent =

    pickup.duragas +
    pickup.kinggas >
      0

      ? `Pendiente de retirar: ${gasCountText(pickup)}.`

      : 'No tiene gas reservado pendiente.';


  /*
    LIMPIAR NOTA ANTERIOR.
  */

  $('paymentNote').value =
    '';


  /*
    TÍTULO DEL MODAL.
  */

  $('paymentDialogTitle')
    .textContent =

    action ===
    'money'

      ? 'Registrar pago'

      : action ===
        'tank'

        ? 'Registrar devolución de tanques'

        : 'Entregar gas reservado';


  $('paymentDialog')
    .showModal();

}


/* =========================================================
   VALIDAR PAGO DE DINERO
========================================================= */

function validateMoneyPayment(
  account
) {

  const amount =
    roundMoney(
      Math.max(
        0,
        num(
          $('paymentAmount')
            .value
        )
      )
    );


  const due =
    roundMoney(
      Math.max(
        0,
        num(
          account.moneyDue
        )
      )
    );


  if (
    amount <=
    0
  ) {

    toast(
      'El monto debe ser mayor a $0.'
    );


    return null;

  }


  /*
    NO ACEPTAR SOBREABONO.

    Preferimos avisar al usuario
    en vez de modificar silenciosamente
    el valor introducido.
  */

  if (
    amount >
    due
  ) {

    toast(
      `El cliente solo debe ${money(due)}.`
    );


    return null;

  }


  const paymentMethod =
    $('pendingPaymentMethod')
      .value;


  if (
    ![
      'Efectivo',
      'Transferencia'
    ].includes(
      paymentMethod
    )
  ) {

    toast(
      'Selecciona una forma de pago válida.'
    );


    return null;

  }


  return {

    amount,

    paymentMethod

  };

}


/* =========================================================
   REGISTRAR ABONO DE DINERO
========================================================= */

function registerMoneyPayment(
  account,
  day,
  dateTime,
  note
) {

  const payment =
    validateMoneyPayment(
      account
    );


  if (!payment) {

    return false;

  }


  /*
    DISMINUIR SALDO.
  */

  account.moneyDue =
    roundMoney(

      Math.max(

        0,

        num(
          account.moneyDue
        ) -

        payment.amount

      )

    );


  /*
    MOVIMIENTO FINANCIERO.

    Este sí entra en:
    - cobrado;
    - efectivo o transferencia;
    - flujo del día.

    NO genera una venta nueva.
  */

  state.movements.push({

    id:
      uid(),


    dayId:
      day.id,


    accountId:
      account.id,


    kind:
      'money_payment',


    dateTime,


    customer:
      account.customer,


    amount:
      payment.amount,


    paymentMethod:
      payment.paymentMethod,


    detail:

      `Abono de cuenta pendiente${
        note
          ? ` - ${note}`
          : ''
      }`

  });


  return true;

}


/* =========================================================
   VALIDAR DEVOLUCIÓN DE TANQUES
========================================================= */

function requestedTankReturns() {

  return {

    duragas:
      int(
        $('paymentTankDuragas')
          .value
      ),


    kinggas:
      int(
        $('paymentTankKinggas')
          .value
      )

  };

}


function validateTankReturn(
  account
) {

  const requested =
    requestedTankReturns();


  if (
    sumGasCounts(
      requested
    ) <=
    0
  ) {

    toast(
      'Indica al menos un tanque devuelto.'
    );


    return null;

  }


  const due =
    tankDebtCounts(
      account.id
    );


  for (
    const gasType
    of GAS_TYPES
  ) {

    if (
      requested[
        gasType
      ] >
      due[
        gasType
      ]
    ) {

      toast(

        `El cliente solo debe ${due[gasType]} ${gasLabel(gasType)}.`

      );


      return null;

    }

  }


  return requested;

}


/* =========================================================
   REGISTRAR DEVOLUCIÓN DE TANQUES
========================================================= */

function registerTankReturn(
  account,
  day,
  dateTime,
  note
) {

  const requested =
    validateTankReturn(
      account
    );


  if (!requested) {

    return false;

  }


  for (
    const gasType
    of GAS_TYPES
  ) {

    const qty =
      requested[
        gasType
      ];


    if (
      qty <=
      0
    ) {

      continue;

    }


    const balance =
      balanceForAccountGas(
        account.id,
        gasType
      );


    /*
      Esta condición debería
      haber sido garantizada
      por validateTankReturn.
    */

    if (!balance) {

      toast(
        'No se encontró el saldo del tanque.'
      );


      return false;

    }


    balance.tanksDue =
      Math.max(

        0,

        int(
          balance.tanksDue
        ) -
        qty

      );


    /*
      AHORA SÍ ENTRA EL VACÍO
      AL INVENTARIO FÍSICO.
    */

    state.movements.push({

      id:
        uid(),


      dayId:
        day.id,


      accountId:
        account.id,


      kind:
        'tank_return',


      dateTime,


      customer:
        account.customer,


      gasType,


      qty,


      amount:
        0,


      detail:

        `Devolvió ${qty} ${
          qty === 1
            ? 'tanque vacío'
            : 'tanques vacíos'
        } de ${gasLabel(gasType)}${
          note
            ? ` - ${note}`
            : ''
        }`

    });

  }


  return true;

}


/* =========================================================
   CANTIDADES SOLICITADAS DE RESERVA
========================================================= */

function requestedPickupCounts() {

  return {

    duragas:
      int(
        $('paymentPickupDuragas')
          .value
      ),


    kinggas:
      int(
        $('paymentPickupKinggas')
          .value
      )

  };

}


/* =========================================================
   VALIDAR RETIRO DE RESERVA
========================================================= */

function validatePickup(
  account
) {

  const requested =
    requestedPickupCounts();


  if (
    sumGasCounts(
      requested
    ) <=
    0
  ) {

    toast(
      'Indica al menos un gas a retirar.'
    );


    return null;

  }


  const due =
    pickupDebtCounts(
      account.id
    );


  const inventory =
    currentInventory();


  for (
    const gasType
    of GAS_TYPES
  ) {

    /*
      NO PUEDE RETIRAR MÁS
      DE LO QUE TIENE PAGADO.
    */

    if (
      requested[
        gasType
      ] >
      due[
        gasType
      ]
    ) {

      toast(

        `Solo tiene ${due[gasType]} ${gasLabel(gasType)} pendiente(s) de retirar.`

      );


      return null;

    }


    /*
      SEGUNDA PROTECCIÓN:

      El inventario reservado físico
      también debe ser suficiente.
    */

    if (
      requested[
        gasType
      ] >
      int(
        inventory[
          gasType
        ].reserved
      )
    ) {

      toast(

        `Inconsistencia de inventario: solo existen ${inventory[gasType].reserved} ${gasLabel(gasType)} reservado(s).`

      );


      return null;

    }

  }


  return requested;

}


/* =========================================================
   REGISTRAR RETIRO DE GAS RESERVADO
========================================================= */

function registerPickup(
  account,
  day,
  dateTime,
  note
) {

  const requested =
    validatePickup(
      account
    );


  if (!requested) {

    return false;

  }


  for (
    const gasType
    of GAS_TYPES
  ) {

    const qty =
      requested[
        gasType
      ];


    if (
      qty <=
      0
    ) {

      continue;

    }


    const balance =
      balanceForAccountGas(
        account.id,
        gasType
      );


    if (!balance) {

      toast(
        'No se encontró la reserva correspondiente.'
      );


      return false;

    }


    balance.pickupDue =
      Math.max(

        0,

        int(
          balance.pickupDue
        ) -
        qty

      );


    /*
      MUY IMPORTANTE:

      amount = 0

      El cliente ya pagó antes.
      Aquí NO existe nueva venta,
      NO existe nuevo ingreso,
      NO existe nuevo cobro.
    */

    state.movements.push({

      id:
        uid(),


      dayId:
        day.id,


      accountId:
        account.id,


      kind:
        'prepaid_pickup',


      dateTime,


      customer:
        account.customer,


      gasType,


      qty,


      amount:
        0,


      detail:

        `Retiró ${qty} ${gasLabel(gasType)} ya pagado(s)${
          note
            ? ` - ${note}`
            : ''
        }`

    });

  }


  return true;

}


/* =========================================================
   GUARDAR MOVIMIENTO DE PENDIENTE
========================================================= */

function handlePayment(
  event
) {

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
        $('paymentAccountId')
          .value
    );


  if (!account) {

    toast(
      'No se encontró la cuenta pendiente.'
    );


    return;

  }


  syncAccountClosed(
    account
  );


  if (
    account.closed
  ) {

    toast(
      'Esta cuenta ya está saldada.'
    );


    $('paymentDialog')
      .close();


    renderAll();

    return;

  }


  const action =
    $('paymentAction')
      .value;


  const day =
    getActiveDay();


  const dateTime =
    nowParts()
      .dateTime;


  const note =
    $('paymentNote')
      .value
      .trim();


  let success =
    false;


  /*
    ABONO DE DINERO
  */

  if (
    action ===
    'money'
  ) {

    success =
      registerMoneyPayment(

        account,

        day,

        dateTime,

        note

      );

  }


  /*
    DEVOLUCIÓN DE TANQUES
  */

  else if (
    action ===
    'tank'
  ) {

    success =
      registerTankReturn(

        account,

        day,

        dateTime,

        note

      );

  }


  /*
    RETIRO DE RESERVA
  */

  else if (
    action ===
    'pickup'
  ) {

    success =
      registerPickup(

        account,

        day,

        dateTime,

        note

      );

  }


  if (!success) {

    return;

  }


  /*
    ELIMINAR SALDOS
    COMPLETAMENTE EN CERO.
  */

  pruneZeroBalances(
    account.id
  );


  /*
    SI TODOS LOS SALDOS
    LLEGARON A CERO,
    CERRAR AUTOMÁTICAMENTE.
  */

  syncAccountClosed(
    account
  );


  saveState();


  $('paymentDialog')
    .close();


  $('paymentNote').value =
    '';


  renderAll();


  if (
    account.closed
  ) {

    toast(
      'Movimiento registrado. La cuenta quedó saldada.'
    );

  }


  else {

    toast(
      'Movimiento registrado. El pendiente fue actualizado.'
    );

  }

}


/* =========================================================
   EVENTOS DE PENDIENTES
========================================================= */

function setupAccountControls() {

  const container =
    $('accountsCards');


  /*
    DELEGACIÓN DE EVENTOS.

    Las tarjetas cambian cada vez
    que se renderiza Pendientes,
    pero este listener se crea
    una sola vez.
  */

  if (container) {

    container.addEventListener(

      'click',

      event => {

        const button =
          event.target.closest(
            '[data-account-action]'
          );


        if (!button) {

          return;

        }


        openAccountAction(

          button.dataset.accountId,

          button.dataset.accountAction

        );

      }

    );

  }


  /*
    EFECTIVO / TRANSFERENCIA
    EN PAGOS DE PENDIENTES.
  */

  document
    .querySelectorAll(
      '[data-pending-payment-method]'
    )
    .forEach(
      button => {

        button.addEventListener(

          'click',

          () =>
            setPendingPaymentMethod(
              button.dataset.pendingPaymentMethod
            )

        );

      }
    );


  /*
    CERRAR MODAL.
  */

  $('closeDialogBtn')
    ?.addEventListener(

      'click',

      () => {

        $('paymentDialog')
          .close();

      }

    );


  /*
    GUARDAR MOVIMIENTO.
  */

  $('paymentForm')
    ?.addEventListener(

      'submit',

      handlePayment

    );

}
/* =========================================================
   ENTERO CON SIGNO PARA AJUSTES
========================================================= */

function signedInt(
  value
) {

  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    )
  ) {

    return 0;

  }


  return Math.trunc(
    parsed
  );

}


/* =========================================================
   TOTAL FÍSICO DE UNA MARCA
========================================================= */

function physicalGasTotal(
  gas
) {

  if (!gas) {

    return 0;

  }


  return (

    int(
      gas.full
    ) +

    int(
      gas.empty
    ) +

    int(
      gas.reserved
    )

  );

}


/* =========================================================
   TARJETA DE INVENTARIO
========================================================= */

function inventoryCard(
  gasType,
  inventory
) {

  const gas =
    inventory[
      gasType
    ];


  if (!gas) {

    return '';

  }


  const total =
    physicalGasTotal(
      gas
    );


  return `

    <article
      class="card inventory-card ${gasType}"
    >

      <h3>
        ${escapeHtml(
          gasFullLabel(
            gasType
          )
        )}
      </h3>


      <div class="inventory-bars">

        <div class="inventory-line">

          <span>
            Llenos disponibles
          </span>

          <strong>
            ${int(gas.full)}
          </strong>

        </div>


        <div class="inventory-line">

          <span>
            Vacíos
          </span>

          <strong>
            ${int(gas.empty)}
          </strong>

        </div>


        <div class="inventory-line">

          <span>
            Llenos reservados
          </span>

          <strong>
            ${int(gas.reserved)}
          </strong>

        </div>


        <div class="inventory-line total">

          <span>
            Total físico
          </span>

          <strong>
            ${total}
          </strong>

        </div>

      </div>

    </article>

  `;

}


/* =========================================================
   INVENTARIO COMPLETO
========================================================= */

function renderInventory() {

  const container =
    $('inventoryDetails');


  if (!container) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    container.innerHTML =
      emptyMsg(
        'Primero debes abrir el día.'
      );


    return;

  }


  const inventory =
    currentInventory();


  container.innerHTML =

    inventoryCard(
      'duragas',
      inventory
    ) +

    inventoryCard(
      'kinggas',
      inventory
    );

}


/* =========================================================
   INVENTARIO RESUMIDO DEL DASHBOARD
========================================================= */

function renderInventorySnapshot() {

  const container =
    $('inventorySnapshot');


  if (!container) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    container.innerHTML =
      emptyMsg(
        'Abre el día para visualizar el inventario.'
      );


    return;

  }


  const inventory =
    currentInventory();


  container.innerHTML = `

    <div class="stat-list">


      <div class="stat-row">

        <span>
          Duragas disponibles
        </span>

        <strong>
          ${int(
            inventory.duragas.full
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          Duragas vacíos
        </span>

        <strong>
          ${int(
            inventory.duragas.empty
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          Duragas reservados
        </span>

        <strong>
          ${int(
            inventory.duragas.reserved
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          King Gas disponibles
        </span>

        <strong>
          ${int(
            inventory.kinggas.full
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          King Gas vacíos
        </span>

        <strong>
          ${int(
            inventory.kinggas.empty
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          King Gas reservados
        </span>

        <strong>
          ${int(
            inventory.kinggas.reserved
          )}
        </strong>

      </div>

    </div>

  `;

}


/* =========================================================
   RESUMEN DE PENDIENTES
========================================================= */

function renderPendingSnapshot() {

  const container =
    $('pendingSnapshot');


  if (!container) {

    return;

  }


  const pending =
    pendingTotals();


  if (
    pending.count ===
    0
  ) {

    container.innerHTML = `

      <div class="success-box">

        No hay cuentas pendientes.

      </div>

    `;


    return;

  }


  container.innerHTML = `

    <div class="stat-list">


      <div class="stat-row">

        <span>
          Clientes con pendientes
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
          ${money(
            pending.money
          )}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          Tanques Duragas por devolver
        </span>

        <strong>
          ${pending.tanks.duragas}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          Tanques King Gas por devolver
        </span>

        <strong>
          ${pending.tanks.kinggas}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          Duragas pagados por retirar
        </span>

        <strong>
          ${pending.pickup.duragas}
        </strong>

      </div>


      <div class="stat-row">

        <span>
          King Gas pagados por retirar
        </span>

        <strong>
          ${pending.pickup.kinggas}
        </strong>

      </div>

    </div>

  `;

}


/* =========================================================
   AJUSTAR INVENTARIO
========================================================= */

function handleAdjustment(
  event
) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  const day =
    getActiveDay();


  const gasType =
    $('adjustmentGasType')
      .value;


  const bucket =
    $('adjustmentBucket')
      .value;


  const qty =
    signedInt(
      $('adjustmentQty')
        .value
    );


  const note =
    $('adjustmentNote')
      .value
      .trim();


  /*
    VALIDAR MARCA.
  */

  if (
    !GAS_TYPES.includes(
      gasType
    )
  ) {

    toast(
      'Tipo de gas inválido.'
    );


    return;

  }


  /*
    SOLO ESTAS EXISTENCIAS
    PUEDEN AJUSTARSE.
  */

  if (
    ![
      'full',
      'empty',
      'reserved'
    ].includes(
      bucket
    )
  ) {

    toast(
      'Tipo de existencia inválido.'
    );


    return;

  }


  /*
    AJUSTE CERO NO TIENE
    EFECTO Y ENSUCIA EL HISTORIAL.
  */

  if (
    qty ===
    0
  ) {

    toast(
      'El ajuste no puede ser 0.'
    );


    return;

  }


  if (!note) {

    toast(
      'Debes indicar el motivo del ajuste.'
    );


    $('adjustmentNote')
      .focus();


    return;

  }


  const inventory =
    currentInventory();


  const currentQty =
    int(
      inventory[
        gasType
      ][
        bucket
      ]
    );


  const result =
    currentQty +
    qty;


  /*
    POKA-YOKE:
    INVENTARIO NEGATIVO PROHIBIDO.
  */

  if (
    result <
    0
  ) {

    toast(

      `El ajuste dejaría la existencia en ${result}. Actualmente hay ${currentQty}.`

    );


    return;

  }


  /*
    PROTECCIÓN ADICIONAL:
    reducir RESERVADOS implica
    alterar gas comprometido
    con clientes.

    Se permite porque puede existir
    una corrección física, pero
    avisamos si el resultado queda
    por debajo de las reservas
    pendientes registradas.
  */

  if (
    bucket ===
    'reserved'
  ) {

    const pending =
      pendingTotals();


    const requiredReserved =
      int(
        pending.pickup[
          gasType
        ]
      );


    if (
      result <
      requiredReserved
    ) {

      toast(

        `No puedes dejar solo ${result} reservado(s). Existen ${requiredReserved} ${gasLabel(gasType)} pagado(s) todavía pendientes de retirar.`

      );


      return;

    }

  }


  state.adjustments.push({

    id:
      uid(),


    dayId:
      day.id,


    dateTime:
      nowParts()
        .dateTime,


    gasType,


    bucket,


    qty,


    note

  });


  saveState();


  /*
    LIMPIAR CAMPOS.
  */

  $('adjustmentQty').value =
    '';


  $('adjustmentNote').value =
    '';


  renderAll();


  goTo(
    'inventory'
  );


  toast(
    'Ajuste de inventario registrado.'
  );

}


/* =========================================================
   NOMBRE DE EXISTENCIA
========================================================= */

function inventoryBucketLabel(
  bucket
) {

  const labels = {

    full:
      'llenos disponibles',

    empty:
      'vacíos',

    reserved:
      'llenos reservados'

  };


  return labels[
    bucket
  ] || bucket;

}


/* =========================================================
   DESCRIPCIÓN DE MOVIMIENTO
========================================================= */

function movementDescription(
  movement
) {

  if (!movement) {

    return '';

  }


  /*
    PAGO DE DEUDA
  */

  if (
    movement.kind ===
    'money_payment'
  ) {

    return `Pago pendiente · ${movement.paymentMethod || 'Pago'}`;

  }


  /*
    DEVOLUCIÓN DE TANQUE
  */

  if (
    movement.kind ===
    'tank_return'
  ) {

    return `Devolvió ${int(movement.qty)} ${gasLabel(movement.gasType)} vacío(s)`;

  }


  /*
    RETIRO DE RESERVA
  */

  if (
    movement.kind ===
    'prepaid_pickup'
  ) {

    return `Retiró ${int(movement.qty)} ${gasLabel(movement.gasType)} reservado(s)`;

  }


  return (
    movement.detail ||
    'Movimiento'
  );

}


/* =========================================================
   ÚLTIMOS MOVIMIENTOS DEL DÍA
========================================================= */

function renderRecentMovements() {

  const body =
    $('recentMovementsBody');


  if (!body) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    body.innerHTML = `

      <tr>

        <td colspan="5">

          ${emptyMsg(
            'No hay un día activo.'
          )}

        </td>

      </tr>

    `;


    return;

  }


  const rows =
    [];


  /* =====================================================
     VENTAS
  ===================================================== */

  for (
    const sale
    of salesForDay(
      day.id
    )
  ) {

    rows.push({

      dateTime:
        sale.dateTime,


      type:
        sale.deliveryMode ===
        'later'

          ? 'Reserva'

          : 'Venta',


      customer:
        sale.customer,


      detail:
        `${saleGasText(sale.id)} · ${sale.paymentMethod}`,


      amount:
        sale.total,


      tone:
        sale.deliveryMode ===
        'later'

          ? 'warn'

          : 'good'

    });

  }


  /* =====================================================
     PAGOS / DEVOLUCIONES / RETIROS
  ===================================================== */

  for (
    const movement
    of movementsForDay(
      day.id
    )
  ) {

    let type =
      'Movimiento';


    let tone =
      '';


    if (
      movement.kind ===
      'money_payment'
    ) {

      type =
        'Pago';

      tone =
        'good';

    }


    else if (
      movement.kind ===
      'tank_return'
    ) {

      type =
        'Devolución';

      tone =
        'warn';

    }


    else if (
      movement.kind ===
      'prepaid_pickup'
    ) {

      type =
        'Retiro';

      tone =
        'warn';

    }


    rows.push({

      dateTime:
        movement.dateTime,


      type,


      customer:
        movement.customer ||
        '—',


      detail:
        movementDescription(
          movement
        ),


      amount:
        num(
          movement.amount
        ),


      tone

    });

  }


  /* =====================================================
     AJUSTES
  ===================================================== */

  for (
    const adjustment
    of adjustmentsForDay(
      day.id
    )
  ) {

    rows.push({

      dateTime:
        adjustment.dateTime,


      type:
        'Ajuste',


      customer:
        'Inventario',


      detail:

        `${gasLabel(adjustment.gasType)} · ${inventoryBucketLabel(adjustment.bucket)} · ${adjustment.qty > 0 ? '+' : ''}${adjustment.qty} · ${adjustment.note}`,


      amount:
        0,


      tone:
        'warn'

    });

  }


  /*
    MÁS RECIENTE PRIMERO.
  */

  rows.sort(

    (
      a,
      b
    ) =>

      new Date(
        b.dateTime
      ) -

      new Date(
        a.dateTime
      )

  );


  /*
    SOLO LOS ÚLTIMOS 10
    PARA NO CARGAR EL DASHBOARD.
  */

  const recent =
    rows.slice(
      0,
      10
    );


  if (
    !recent.length
  ) {

    body.innerHTML = `

      <tr>

        <td colspan="5">

          ${emptyMsg(
            'Todavía no hay movimientos.'
          )}

        </td>

      </tr>

    `;


    return;

  }


  body.innerHTML =
    recent

      .map(
        row => `

          <tr>

            <td>
              ${timeOnly(row.dateTime)}
            </td>


            <td>

              <span
                class="badge ${row.tone}"
              >
                ${escapeHtml(row.type)}
              </span>

            </td>


            <td>
              ${escapeHtml(row.customer)}
            </td>


            <td>
              ${escapeHtml(row.detail)}
            </td>


            <td>

              ${
                row.amount >
                0

                  ? money(
                      row.amount
                    )

                  : '—'
              }

            </td>

          </tr>

        `
      )

      .join('');

}


/* =========================================================
   MÉTRICAS PRINCIPALES
========================================================= */

function renderMetrics() {

  const container =
    $('metricGrid');


  if (!container) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    container.innerHTML =

      metric(
        'Ventas',
        money(0)
      ) +

      metric(
        'Cobrado',
        money(0)
      ) +

      metric(
        'Efectivo',
        money(0)
      ) +

      metric(
        'Transferencias',
        money(0)
      ) +

      metric(
        'Reposición',
        money(0)
      ) +

      metric(
        'Margen teórico',
        money(0)
      );


    return;

  }


  const totals =
    dayTotals(
      day
    );


  container.innerHTML =

    /*
      1. VENTA DEVENGADA
    */
    metric(

      'Ventas del día',

      money(
        totals.revenue
      ),

      `${totals.units} unidad(es)`

    ) +


    /*
      2. DINERO COBRADO TOTAL
    */
    metric(

      'Cobrado',

      money(
        totals.collected
      ),

      totals.laterCollected >
        0

        ? `${money(totals.laterCollected)} recuperado de pendientes`

        : 'Pagos recibidos',

      'good'

    ) +


    /*
      3. EFECTIVO FÍSICO
    */
    metric(

      'Efectivo',

      money(
        totals.cash
      ),

      'Debe reflejarse en caja',

      'good'

    ) +


    /*
      4. TRANSFERENCIAS
    */
    metric(

      'Transferencias',

      money(
        totals.transfers
      ),

      'No forman parte del efectivo'

    ) +


    /*
      5. COSTO DE REPOSICIÓN
    */
    metric(

      'Reposición',

      money(
        totals.replacement
      ),

      `${totals.units} × ${money(REPLACEMENT_COST)}`,

      'warn'

    ) +


    /*
      6. MARGEN TEÓRICO
    */
    metric(

      'Margen teórico',

      money(
        totals.margin
      ),

      'Ventas − reposición',

      totals.margin >=
        0

        ? 'good'

        : 'bad'

    );

}


/* =========================================================
   RESUMEN PRINCIPAL
========================================================= */

function renderDashboard() {

  renderActiveDayText();

  renderMetrics();

  renderInventorySnapshot();

  renderPendingSnapshot();

  renderRecentMovements();

}


/* =========================================================
   ACTUALIZAR TODA LA INFORMACIÓN VISIBLE
   RELACIONADA CON INVENTARIO / RESUMEN
========================================================= */

function renderOperationalViews() {

  renderDashboard();

  renderInventory();

  renderSales();

  renderAccounts();

  renderCustomerSuggestions();

  renderSaleAvailability();

}


/* =========================================================
   EVENTOS DE INVENTARIO
========================================================= */

function setupInventoryControls() {

  $('adjustmentForm')
    ?.addEventListener(

      'submit',

      handleAdjustment

    );

}
/* =========================================================
   LEER CONTEO FÍSICO DEL CIERRE
========================================================= */

function readClosingInventory() {

  return {

    duragas: {

      full:
        int(
          $('closingDuragasFull')
            .value
        ),

      empty:
        int(
          $('closingDuragasEmpty')
            .value
        ),

      reserved:
        int(
          $('closingDuragasReserved')
            .value
        )

    },


    kinggas: {

      full:
        int(
          $('closingKinggasFull')
            .value
        ),

      empty:
        int(
          $('closingKinggasEmpty')
            .value
        ),

      reserved:
        int(
          $('closingKinggasReserved')
            .value
        )

    }

  };

}


/* =========================================================
   DIFERENCIAS DE INVENTARIO
========================================================= */

/*
  Diferencia = FÍSICO - ESPERADO

  Ejemplo:

  esperado = 20
  físico   = 19

  diferencia = -1
  significa FALTANTE.
*/

function inventoryDifference(
  expected,
  physical
) {

  const difference =
    emptyInventory();


  for (
    const gasType
    of GAS_TYPES
  ) {

    for (
      const bucket
      of [
        'full',
        'empty',
        'reserved'
      ]
    ) {

      difference[
        gasType
      ][
        bucket
      ] =

        int(
          physical[
            gasType
          ][
            bucket
          ]
        ) -

        int(
          expected[
            gasType
          ][
            bucket
          ]
        );

    }

  }


  return difference;

}


/* =========================================================
   SABER SI HAY DIFERENCIA DE INVENTARIO
========================================================= */

function hasInventoryDifference(
  difference
) {

  return GAS_TYPES.some(

    gasType =>

      [
        'full',
        'empty',
        'reserved'
      ].some(

        bucket =>

          num(
            difference[
              gasType
            ][
              bucket
            ]
          ) !==
          0

      )

  );

}


/* =========================================================
   CLASE VISUAL DE UNA DIFERENCIA
========================================================= */

function differenceClass(
  value
) {

  const qty =
    num(
      value
    );


  if (
    qty ===
    0
  ) {

    return 'diff-ok';

  }


  if (
    qty >
    0
  ) {

    return 'diff-warning';

  }


  return 'diff-bad';

}


/* =========================================================
   TEXTO DE DIFERENCIA
========================================================= */

function differenceText(
  value
) {

  const qty =
    signedInt(
      value
    );


  if (
    qty ===
    0
  ) {

    return 'Sin diferencia';

  }


  if (
    qty >
    0
  ) {

    return `+${qty} sobrante`;

  }


  return `${qty} faltante`;

}


/* =========================================================
   TOTAL DE DIFERENCIAS FÍSICAS
========================================================= */

function totalInventoryDifference(
  difference
) {

  let total =
    0;


  for (
    const gasType
    of GAS_TYPES
  ) {

    for (
      const bucket
      of [
        'full',
        'empty',
        'reserved'
      ]
    ) {

      total +=
        signedInt(

          difference[
            gasType
          ][
            bucket
          ]

        );

    }

  }


  return total;

}


/* =========================================================
   LLENAR CIERRE CON LO ESPERADO
========================================================= */

function fillClosingExpected() {

  const day =
    getActiveDay();


  if (!day) {

    return;

  }


  const inventory =
    currentInventory();


  /*
    Se cargan los valores lógicos
    como referencia.

    El usuario cambia únicamente
    aquello que físicamente encontró
    diferente.
  */

  $('closingDuragasFull').value =
    int(
      inventory.duragas.full
    );


  $('closingDuragasEmpty').value =
    int(
      inventory.duragas.empty
    );


  $('closingDuragasReserved').value =
    int(
      inventory.duragas.reserved
    );


  $('closingKinggasFull').value =
    int(
      inventory.kinggas.full
    );


  $('closingKinggasEmpty').value =
    int(
      inventory.kinggas.empty
    );


  $('closingKinggasReserved').value =
    int(
      inventory.kinggas.reserved
    );


  /*
    EFECTIVO ESPERADO INICIAL.

    Si todavía no se registraron
    gastos, será exactamente el
    efectivo generado por ventas
    y cobros pendientes.
  */

  const totals =
    dayTotals(
      day
    );


  const expenses =
    Math.max(

      0,

      roundMoney(
        $('closingOtherExpenses')
          ?.value
      )

    );


  const expectedCash =
    roundMoney(

      totals.cash -
      expenses

    );


  if (
    expectedCash >=
    0
  ) {

    $('closingCash').value =
      expectedCash.toFixed(
        2
      );

  }

}


/* =========================================================
   EFECTIVO ESPERADO DE CIERRE
========================================================= */

function closingExpectedCash(
  totals,
  expenses
) {

  /*
    "Otros gastos" se interpretan
    actualmente como pagos hechos
    desde la caja.

    NO modifican:
    - ventas devengadas;
    - costo de reposición;
    - margen teórico.
  */

  return roundMoney(

    totals.cash -
    Math.max(
      0,
      num(
        expenses
      )
    )

  );

}


/* =========================================================
   TABLA DE COMPARACIÓN DE INVENTARIO
========================================================= */

function closingInventoryTable(
  expected,
  physical,
  difference
) {

  const rows =
    [];


  const buckets = [

    [
      'full',
      'Llenos disponibles'
    ],

    [
      'empty',
      'Vacíos'
    ],

    [
      'reserved',
      'Reservados'
    ]

  ];


  for (
    const gasType
    of GAS_TYPES
  ) {

    for (
      const [
        bucket,
        label
      ]
      of buckets
    ) {

      const diff =
        difference[
          gasType
        ][
          bucket
        ];


      rows.push(`

        <tr>

          <td>
            ${escapeHtml(
              gasLabel(
                gasType
              )
            )}
          </td>


          <td>
            ${escapeHtml(label)}
          </td>


          <td>
            ${
              int(
                expected[
                  gasType
                ][
                  bucket
                ]
              )
            }
          </td>


          <td>
            ${
              int(
                physical[
                  gasType
                ][
                  bucket
                ]
              )
            }
          </td>


          <td>

            <strong
              class="${differenceClass(diff)}"
            >
              ${escapeHtml(
                differenceText(
                  diff
                )
              )}
            </strong>

          </td>

        </tr>

      `);

    }

  }


  return `

    <div class="table-wrap">

      <table>

        <thead>

          <tr>

            <th>
              Gas
            </th>

            <th>
              Existencia
            </th>

            <th>
              Esperado
            </th>

            <th>
              Físico
            </th>

            <th>
              Diferencia
            </th>

          </tr>

        </thead>


        <tbody>

          ${rows.join('')}

        </tbody>

      </table>

    </div>

  `;

}


/* =========================================================
   RESUMEN DEL CIERRE
========================================================= */

function renderClosingSummary(
  day
) {

  const container =
    $('closingSummary');


  if (
    !container ||
    !day?.closing
  ) {

    return;

  }


  const closing =
    day.closing;


  const totals =
    closing.totals;


  const inventoryDiffExists =
    hasInventoryDifference(
      closing.inventoryDifference
    );


  const cashDiff =
    roundMoney(
      closing.cashDifference
    );


  container.hidden =
    false;


  container.innerHTML = `

    <div class="card-header">

      <div>

        <p class="eyebrow">
          CIERRE GUARDADO
        </p>

        <h3>
          Resultado del ${escapeHtml(day.date)}
        </h3>

        <p>
          Cerrado:
          ${escapeHtml(
            shortDateTime(
              closing.closedAt
            )
          )}
        </p>

      </div>


      <span
        class="badge ${
          !inventoryDiffExists &&
          Math.abs(cashDiff) <=
            0.009

            ? 'good'

            : 'warn'
        }"
      >

        ${
          !inventoryDiffExists &&
          Math.abs(cashDiff) <=
            0.009

            ? 'Cierre cuadrado'

            : 'Revisar diferencias'
        }

      </span>

    </div>



    <!-- FINANZAS -->

    <div class="metric-grid">

      ${metric(

        'Ventas',

        money(
          totals.revenue
        ),

        `${totals.units} unidad(es)`

      )}


      ${metric(

        'Cobrado',

        money(
          totals.collected
        ),

        'Efectivo + transferencias',

        'good'

      )}


      ${metric(

        'Efectivo generado',

        money(
          totals.cash
        ),

        'Antes de gastos'

      )}


      ${metric(

        'Gastos de caja',

        money(
          closing.otherExpenses
        ),

        'Registrados en cierre',

        closing.otherExpenses >
          0

          ? 'warn'

          : ''

      )}


      ${metric(

        'Efectivo esperado',

        money(
          closing.expectedCash
        ),

        'Después de gastos'

      )}


      ${metric(

        'Efectivo contado',

        money(
          closing.cashCounted
        ),

        cashDiff ===
          0

          ? 'Sin diferencia'

          : `Diferencia ${money(cashDiff)}`,

        Math.abs(cashDiff) <=
          0.009

          ? 'good'

          : 'bad'

      )}

    </div>



    <!-- RENTABILIDAD -->

    <div class="two-col">

      <div class="stat-list">

        <div class="stat-row">

          <span>
            Costo de reposición
          </span>

          <strong>
            ${money(
              totals.replacement
            )}
          </strong>

        </div>


        <div class="stat-row">

          <span>
            Margen teórico
          </span>

          <strong>
            ${money(
              totals.margin
            )}
          </strong>

        </div>


        <div class="stat-row">

          <span>
            Transferencias
          </span>

          <strong>
            ${money(
              totals.transfers
            )}
          </strong>

        </div>

      </div>



      <div class="stat-list">

        <div class="stat-row">

          <span>
            Duragas vendidos
          </span>

          <strong>
            ${totals.duragasUnits}
          </strong>

        </div>


        <div class="stat-row">

          <span>
            King Gas vendidos
          </span>

          <strong>
            ${totals.kinggasUnits}
          </strong>

        </div>


        <div class="stat-row">

          <span>
            Diferencia física total
          </span>

          <strong
            class="${differenceClass(
              totalInventoryDifference(
                closing.inventoryDifference
              )
            )}"
          >

            ${
              totalInventoryDifference(
                closing.inventoryDifference
              ) > 0

                ? '+'

                : ''
            }${
              totalInventoryDifference(
                closing.inventoryDifference
              )
            }

          </strong>

        </div>

      </div>

    </div>



    <h4>
      Inventario esperado vs. físico
    </h4>


    ${closingInventoryTable(

      closing.expectedInventory,

      closing.physicalInventory,

      closing.inventoryDifference

    )}



    ${
      closing.note

        ? `

          <div class="info-box">

            <strong>
              Observación del cierre:
            </strong>

            ${escapeHtml(
              closing.note
            )}

          </div>

        `

        : ''
    }

  `;

}


/* =========================================================
   GUARDAR CIERRE DEL DÍA
========================================================= */

function handleClosing(
  event
) {

  event.preventDefault();


  if (
    !requireActiveDay()
  ) {

    return;

  }


  const day =
    getActiveDay();


  if (!day) {

    return;

  }


  /*
    INVENTARIO ESPERADO
    JUSTO ANTES DE CERRAR.
  */

  const expectedInventory =
    currentInventory();


  /*
    INVENTARIO FÍSICO
    CONTADO POR EL USUARIO.
  */

  const physicalInventory =
    readClosingInventory();


  const inventoryDiff =
    inventoryDifference(

      expectedInventory,

      physicalInventory

    );


  /*
    FINANZAS DEL DÍA
  */

  const totals =
    dayTotals(
      day
    );


  const otherExpenses =
    roundMoney(

      Math.max(

        0,

        num(
          $('closingOtherExpenses')
            .value
        )

      )

    );


  const cashCounted =
    roundMoney(

      Math.max(

        0,

        num(
          $('closingCash')
            .value
        )

      )

    );


  const expectedCash =
    closingExpectedCash(

      totals,

      otherExpenses

    );


  const cashDifference =
    roundMoney(

      cashCounted -
      expectedCash

    );


  const inventoryMismatch =
    hasInventoryDifference(
      inventoryDiff
    );


  const cashMismatch =
    Math.abs(
      cashDifference
    ) >
    0.009;


  const note =
    $('closingNote')
      .value
      .trim();


  /*
    AUDITORÍA:

    SI EXISTE ALGUNA DIFERENCIA,
    LA OBSERVACIÓN ES OBLIGATORIA.

    No escondemos ni corregimos
    silenciosamente la diferencia.
  */

  if (

    (
      inventoryMismatch ||
      cashMismatch
    ) &&

    !note

  ) {

    toast(
      'Hay diferencias de caja o inventario. Escribe una observación antes de cerrar.'
    );


    $('closingNote')
      .focus();


    return;

  }


  /*
    Si los gastos superan el efectivo
    generado, el sistema permite
    documentarlo, pero exige explicación
    porque implica que debió existir
    dinero proveniente de otra fuente.
  */

  if (

    expectedCash <
      0 &&

    !note

  ) {

    toast(
      'Los gastos superan el efectivo generado. Debes explicar la situación en la observación.'
    );


    $('closingNote')
      .focus();


    return;

  }


  /*
    CONFIRMACIÓN ESPECIAL
    SI EL CIERRE NO CUADRA.
  */

  if (
    inventoryMismatch ||
    cashMismatch
  ) {

    const confirmed =
      window.confirm(

        'El cierre presenta diferencias de inventario o efectivo. ¿Deseas guardarlo así para conservar la trazabilidad?'

      );


    if (!confirmed) {

      return;

    }

  }


  const closedAt =
    nowParts()
      .dateTime;


  /*
    SNAPSHOT INMUTABLE DEL CIERRE.

    Aunque posteriormente haya
    otros días o movimientos,
    este resultado histórico
    queda conservado.
  */

  day.closing = {

    closedAt,


    totals:
      clone(
        totals
      ),


    expectedInventory:
      clone(
        expectedInventory
      ),


    physicalInventory:
      clone(
        physicalInventory
      ),


    inventoryDifference:
      clone(
        inventoryDiff
      ),


    cashGenerated:
      totals.cash,


    otherExpenses,


    expectedCash,


    cashCounted,


    cashDifference,


    note

  };


  day.closed =
    true;


  day.closedAt =
    closedAt;


  /*
    YA NO EXISTE DÍA ACTIVO.
  */

  state.activeDayId =
    null;


  saveState();


  /*
    MOSTRAR RESULTADO DEL CIERRE
    ANTES DE CAMBIAR DE VISTA.
  */

  renderClosingSummary(
    day
  );


  renderAll();


  goTo(
    'history'
  );


  if (

    !inventoryMismatch &&
    !cashMismatch

  ) {

    toast(
      'Día cerrado correctamente. Caja e inventario cuadran.'
    );

  }


  else {

    toast(
      'Día cerrado con diferencias registradas para revisión.'
    );

  }

}


/* =========================================================
   ACTUALIZAR EFECTIVO SUGERIDO AL CAMBIAR GASTOS
========================================================= */

function updateClosingCashSuggestion() {

  const day =
    getActiveDay();


  if (!day) {

    return;

  }


  const totals =
    dayTotals(
      day
    );


  const expenses =
    roundMoney(

      Math.max(

        0,

        num(
          $('closingOtherExpenses')
            .value
        )

      )

    );


  const expectedCash =
    closingExpectedCash(

      totals,

      expenses

    );


  /*
    Solo rellenamos automáticamente
    si el resultado no es negativo.

    Un valor negativo requiere
    revisión humana.
  */

  if (
    expectedCash >=
    0
  ) {

    $('closingCash').value =
      expectedCash.toFixed(
        2
      );

  }

}


/* =========================================================
   EVENTOS DEL CIERRE
========================================================= */

function setupClosingControls() {

  $('closingForm')
    ?.addEventListener(

      'submit',

      handleClosing

    );


  $('closingOtherExpenses')
    ?.addEventListener(

      'input',

      updateClosingCashSuggestion

    );

}
/* =========================================================
   HISTORIAL - ESTADO DEL CIERRE
========================================================= */

function historyClosingStatus(
  day
) {

  const closing =
    day?.closing;


  if (!closing) {

    return {

      label:
        'Sin detalle de cierre',

      tone:
        'warn'

    };

  }


  const inventoryMismatch =
    hasInventoryDifference(
      closing.inventoryDifference ||
      emptyInventory()
    );


  const cashDifference =
    roundMoney(
      closing.cashDifference
    );


  if (

    !inventoryMismatch &&

    Math.abs(
      cashDifference
    ) <=
    0.009

  ) {

    return {

      label:
        'Cierre cuadrado',

      tone:
        'good'

    };

  }


  return {

    label:
      'Con diferencias',

    tone:
      'warn'

  };

}


/* =========================================================
   RESUMEN HISTÓRICO DE INVENTARIO
========================================================= */

function historyInventoryDifferenceSummary(
  difference
) {

  if (!difference) {

    return 'Sin información';

  }


  const parts =
    [];


  for (
    const gasType
    of GAS_TYPES
  ) {

    for (
      const bucket
      of [
        'full',
        'empty',
        'reserved'
      ]
    ) {

      const value =
        signedInt(
          difference[
            gasType
          ]?.[
            bucket
          ]
        );


      if (
        value ===
        0
      ) {

        continue;

      }


      parts.push(

        `${gasLabel(gasType)} ${inventoryBucketLabel(bucket)}: ${
          value > 0
            ? '+'
            : ''
        }${value}`

      );

    }

  }


  return parts.length

    ? parts.join(
        ' · '
      )

    : 'Sin diferencias';

}


/* =========================================================
   TARJETA DE HISTORIAL
========================================================= */

function historyCard(
  day
) {

  const closing =
    day.closing;


  /*
    Preferimos el snapshot guardado
    al cerrar porque representa
    exactamente lo que se auditó
    ese día.

    Si viene de una migración antigua
    sin snapshot completo, calculamos
    con los datos disponibles.
  */

  const totals =

    closing?.totals

      ? closing.totals

      : dayTotals(
          day
        );


  const status =
    historyClosingStatus(
      day
    );


  const cashDifference =
    roundMoney(
      closing?.cashDifference
    );


  const inventoryDiffText =
    historyInventoryDifferenceSummary(
      closing?.inventoryDifference
    );


  return `

    <article class="history-card">

      <!-- ENCABEZADO -->

      <div class="history-head">

        <div>

          <h3>
            ${escapeHtml(
              day.date ||
              'Día'
            )}
          </h3>

          <p class="subtle">

            Apertura:
            ${escapeHtml(
              shortDateTime(
                day.openedAt
              )
            )}

            ·

            Cierre:
            ${escapeHtml(
              shortDateTime(
                closing?.closedAt ||
                day.closedAt
              )
            )}

          </p>

        </div>


        <span
          class="badge ${status.tone}"
        >
          ${escapeHtml(status.label)}
        </span>

      </div>



      <!-- MÉTRICAS PRINCIPALES -->

      <div class="metric-grid">

        ${metric(

          'Ventas',

          money(
            totals.revenue
          ),

          `${int(totals.units)} unidad(es)`

        )}


        ${metric(

          'Cobrado',

          money(
            totals.collected
          ),

          'Pagos recibidos',

          'good'

        )}


        ${metric(

          'Efectivo',

          money(
            totals.cash
          ),

          'Generado en caja'

        )}


        ${metric(

          'Transferencias',

          money(
            totals.transfers
          ),

          'Fuera de caja'

        )}


        ${metric(

          'Reposición',

          money(
            totals.replacement
          ),

          `${int(totals.units)} × ${money(REPLACEMENT_COST)}`,

          'warn'

        )}


        ${metric(

          'Margen teórico',

          money(
            totals.margin
          ),

          'Ventas − reposición',

          num(
            totals.margin
          ) >=
            0

            ? 'good'

            : 'bad'

        )}

      </div>



      <!-- RESUMEN ADICIONAL -->

      <div class="two-col">


        <div class="stat-list">

          <div class="stat-row">

            <span>
              Duragas vendidos
            </span>

            <strong>
              ${int(
                totals.duragasUnits
              )}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              King Gas vendidos
            </span>

            <strong>
              ${int(
                totals.kinggasUnits
              )}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Crédito generado
            </span>

            <strong>
              ${money(
                totals.creditCreated
              )}
            </strong>

          </div>

        </div>



        <div class="stat-list">

          <div class="stat-row">

            <span>
              Gastos de caja
            </span>

            <strong>
              ${money(
                closing?.otherExpenses
              )}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Efectivo contado
            </span>

            <strong>
              ${money(
                closing?.cashCounted
              )}
            </strong>

          </div>


          <div class="stat-row">

            <span>
              Diferencia de caja
            </span>

            <strong
              class="${
                Math.abs(
                  cashDifference
                ) <=
                0.009

                  ? 'diff-ok'

                  : 'diff-bad'
              }"
            >

              ${money(
                cashDifference
              )}

            </strong>

          </div>

        </div>

      </div>



      <!-- DETALLE DESPLEGABLE -->

      <details class="history-detail">

        <summary>
          Ver auditoría del cierre
        </summary>


        <div class="info-box">

          <strong>
            Diferencias de inventario:
          </strong>

          ${escapeHtml(
            inventoryDiffText
          )}

        </div>


        ${
          closing?.expectedInventory &&
          closing?.physicalInventory &&
          closing?.inventoryDifference

            ? closingInventoryTable(

                closing.expectedInventory,

                closing.physicalInventory,

                closing.inventoryDifference

              )

            : `
                <div class="warning-box">

                  Este registro proviene de una versión
                  anterior y no contiene el detalle completo
                  del conteo esperado contra físico.

                </div>
              `
        }


        ${
          closing?.note

            ? `

                <div class="info-box">

                  <strong>
                    Observación:
                  </strong>

                  ${escapeHtml(
                    closing.note
                  )}

                </div>

              `

            : ''
        }

      </details>

    </article>

  `;

}


/* =========================================================
   MOSTRAR HISTORIAL
========================================================= */

function renderHistory() {

  const container =
    $('historyCards');


  if (!container) {

    return;

  }


  /*
    Solo aparecen jornadas
    realmente cerradas.
  */

  const closedDays =
    state.days

      .filter(
        day =>
          day.closed
      )

      .slice()

      .sort(

        (
          a,
          b
        ) =>

          new Date(
            b.closedAt ||
            b.closing?.closedAt ||
            b.openedAt
          ) -

          new Date(
            a.closedAt ||
            a.closing?.closedAt ||
            a.openedAt
          )

      );


  if (
    !closedDays.length
  ) {

    container.innerHTML =
      emptyMsg(
        'Todavía no existen días cerrados.'
      );


    return;

  }


  container.innerHTML =
    closedDays

      .map(
        day =>
          historyCard(
            day
          )
      )

      .join('');

}


/* =========================================================
   CREAR NOMBRE DE RESPALDO
========================================================= */

function backupFileName() {

  const now =
    nowParts();


  return (
    `control-gas-${now.date}-${now.time.replace(':', '-')}.json`
  );

}


/* =========================================================
   EXPORTAR RESPALDO
========================================================= */

function exportBackup() {

  /*
    Guardamos antes para garantizar
    que la exportación corresponda
    al estado más reciente.
  */

  syncAllAccounts();

  saveState();


  const content =
    JSON.stringify(

      state,

      null,

      2

    );


  const blob =
    new Blob(

      [
        content
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
    backupFileName();


  document.body
    .appendChild(
      link
    );


  link.click();


  link.remove();


  /*
    Liberar memoria del navegador.
  */

  setTimeout(

    () =>
      URL.revokeObjectURL(
        url
      ),

    1000

  );


  toast(
    'Respaldo exportado.'
  );

}


/* =========================================================
   VALIDAR / PREPARAR RESPALDO IMPORTADO
========================================================= */

function prepareImportedState(
  raw
) {

  if (
    !raw ||
    typeof raw !==
    'object'
  ) {

    throw new Error(
      'El archivo no contiene datos válidos.'
    );

  }


  /*
    RESPALDO V4.
  */

  if (
    raw.schemaVersion ===
    SCHEMA_VERSION
  ) {

    return normalizeState(
      raw
    );

  }


  /*
    RESPALDO V3.

    La versión anterior tenía:
    activeDay como objeto
    y ventas dentro de cada día.
  */

  const looksLikeV3 =

    Object.hasOwn(
      raw,
      'activeDay'
    ) ||

    (
      Array.isArray(
        raw.days
      ) &&

      raw.days.some(
        day =>
          Array.isArray(
            day?.sales
          )
      )
    );


  if (
    looksLikeV3
  ) {

    return migrateV3(
      raw
    );

  }


  throw new Error(
    'El respaldo no corresponde a una versión compatible del sistema.'
  );

}


/* =========================================================
   IMPORTAR RESPALDO
========================================================= */

async function importBackup(
  event
) {

  const input =
    event.target;


  const file =
    input.files?.[0];


  if (!file) {

    return;

  }


  try {

    const text =
      await file.text();


    const raw =
      JSON.parse(
        text
      );


    /*
      IMPORTANTE:
      normalizamos PRIMERO.

      El estado actual todavía
      no se modifica.
    */

    const imported =
      prepareImportedState(
        raw
      );


    const confirmed =
      window.confirm(

        'Importar este respaldo reemplazará los datos actuales de esta aplicación en este navegador. ¿Deseas continuar?'

      );


    if (!confirmed) {

      input.value =
        '';

      return;

    }


    state =
      imported;


    saveState();


    /*
      RECONSTRUIR INTERFAZ.
    */

    renderPriceButtons();

    resetSaleForm();

    renderAll();


    const activeDay =
      getActiveDay();


    goTo(

      activeDay

        ? 'dashboard'

        : 'history'

    );


    toast(
      'Respaldo importado correctamente.'
    );

  }


  catch (
    error
  ) {

    console.error(
      error
    );


    toast(
      error?.message ||
      'No fue posible importar el respaldo.'
    );

  }


  finally {

    /*
      Permite volver a seleccionar
      el mismo archivo después.
    */

    input.value =
      '';

  }

}


/* =========================================================
   BORRAR TODOS LOS DATOS
========================================================= */

function resetAllData() {

  const firstConfirm =
    window.confirm(

      'Esto eliminará ventas, pendientes, inventario, cierres e historial guardados en este navegador. ¿Deseas continuar?'

    );


  if (!firstConfirm) {

    return;

  }


  /*
    SEGUNDA CONFIRMACIÓN
    POR SER UNA ACCIÓN DESTRUCTIVA.
  */

  const secondConfirm =
    window.confirm(

      'Esta acción no se puede deshacer salvo que tengas un respaldo JSON. ¿Eliminar definitivamente todos los datos?'

    );


  if (!secondConfirm) {

    return;

  }


  /*
    Borrar V4 Y V3.

    Si V3 permaneciera,
    loadState podría volver
    a migrarlo en el futuro.
  */

  localStorage.removeItem(
    STORAGE_KEY
  );


  localStorage.removeItem(
    LEGACY_STORAGE_KEY
  );


  state =
    freshState();


  saveState();


  /*
    LIMPIAR FORMULARIOS
  */

  $('openingForm')
    ?.reset();


  $('closingForm')
    ?.reset();


  $('adjustmentForm')
    ?.reset();


  /*
    VALORES DE APERTURA
    EN CERO DESPUÉS DEL BORRADO.

    Así evitamos confundir
    los valores demostrativos
    del HTML con inventario real.
  */

  if (
    $('duragasFull')
  ) {

    $('duragasFull').value =
      0;

  }


  if (
    $('duragasEmpty')
  ) {

    $('duragasEmpty').value =
      0;

  }


  if (
    $('duragasReserved')
  ) {

    $('duragasReserved').value =
      0;

  }


  if (
    $('kinggasFull')
  ) {

    $('kinggasFull').value =
      0;

  }


  if (
    $('kinggasEmpty')
  ) {

    $('kinggasEmpty').value =
      0;

  }


  if (
    $('kinggasReserved')
  ) {

    $('kinggasReserved').value =
      0;

  }


  updateOpeningTotals();


  /*
    RESTABLECER VENTA.
  */

  renderPriceButtons();

  resetSaleForm();


  /*
    OCULTAR RESUMEN DE CIERRE.
  */

  if (
    $('closingSummary')
  ) {

    $('closingSummary').hidden =
      true;


    $('closingSummary').innerHTML =
      '';

  }


  renderAll();


  goTo(
    'opening'
  );


  toast(
    'Todos los datos fueron eliminados.'
  );

}


/* =========================================================
   CONTROLES DE RESPALDO
========================================================= */

function setupBackupControls() {

  $('exportBtn')
    ?.addEventListener(

      'click',

      exportBackup

    );


  $('importInput')
    ?.addEventListener(

      'change',

      importBackup

    );


  $('resetBtn')
    ?.addEventListener(

      'click',

      resetAllData

    );

}


/* =========================================================
   RENDER GENERAL
========================================================= */

function renderAll() {

  /*
    Mantener saldos y cierres
    de cuentas consistentes.
  */

  syncAllAccounts();


  renderActiveDayText();


  /*
    DASHBOARD
  */

  renderMetrics();

  renderInventorySnapshot();

  renderPendingSnapshot();

  renderRecentMovements();


  /*
    OPERACIÓN
  */

  renderSales();

  renderAccounts();

  renderInventory();


  /*
    CLIENTES
  */

  renderCustomerSuggestions();


  /*
    VENTA
  */

  renderSaleAvailability();


  /*
    APERTURA
  */

  renderOpeningState();


  /*
    HISTORIAL
  */

  renderHistory();

}
/* =========================================================
   APERTURA - EVENTOS
========================================================= */

function setupOpeningControls() {

  $('openingForm')
    ?.addEventListener(

      'submit',

      handleOpening

    );


  /*
    ACTUALIZAR TOTAL FÍSICO
    MIENTRAS EL USUARIO CUENTA.
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
          ?.addEventListener(

            'input',

            updateOpeningTotals

          );

      }
    );

}


/* =========================================================
   VENTA - EVENTO PRINCIPAL
========================================================= */

function setupSaleForm() {

  $('saleForm')
    ?.addEventListener(

      'submit',

      handleSale

    );

}


/* =========================================================
   EXPERIENCIA DEL MODAL
========================================================= */

function setupDialogUX() {

  const dialog =
    $('paymentDialog');


  if (!dialog) {

    return;

  }


  /*
    CLIC FUERA DE LA TARJETA
    CIERRA EL MODAL.

    No modifica ningún dato.
  */

  dialog.addEventListener(

    'click',

    event => {

      if (
        event.target ===
        dialog
      ) {

        dialog.close();

      }

    }

  );


  /*
    Al cerrarse limpiamos
    identificadores temporales.
  */

  dialog.addEventListener(

    'close',

    () => {

      $('paymentAccountId').value =
        '';


      $('paymentAction').value =
        '';


      $('paymentNote').value =
        '';

    }

  );

}


/* =========================================================
   CONTRATO HTML ↔ JAVASCRIPT
========================================================= */

/*
  Como este proyecto se está
  copiando manualmente por partes,
  revisamos que no falten elementos
  esenciales del HTML.

  Si falta alguno, lo mostramos
  claramente en consola.
*/

function validateDomContract() {

  const requiredIds = [

    /*
      GLOBAL
    */
    'activeDayText',
    'liveClock',
    'toast',


    /*
      DASHBOARD
    */
    'metricGrid',
    'inventorySnapshot',
    'pendingSnapshot',
    'recentMovementsBody',


    /*
      APERTURA
    */
    'openingForm',
    'openingAutoDateTime',

    'duragasFull',
    'duragasEmpty',
    'duragasReserved',
    'duragasOpeningTotal',

    'kinggasFull',
    'kinggasEmpty',
    'kinggasReserved',
    'kinggasOpeningTotal',

    'openingNote',
    'openingWarning',


    /*
      VENTA
    */
    'saleForm',
    'saleMode',
    'saleAutoDateTime',
    'saleCustomer',

    'qtyDuragas',
    'qtyKinggas',
    'saleUnitsTotal',

    'salePrice',
    'quickPriceButtons',

    'salePaymentMethod',
    'saleReceived',
    'quickCashButtons',

    'tankExchangeBlock',
    'saleTankMode',
    'emptyReceivedWrap',
    'emptyDuragas',
    'emptyKinggas',

    'saleTotal',
    'saleChange',
    'salePaidNow',
    'saleMoneyDue',
    'saleTanksDue',
    'salePendingPickup',
    'saleStatus',
    'saleNote',
    'salesBody',


    /*
      PENDIENTES
    */
    'accountsCards',
    'paymentDialog',
    'paymentForm',
    'paymentDialogTitle',
    'paymentAccountId',
    'paymentAction',

    'paymentAmountWrap',
    'paymentAmount',
    'pendingPaymentMethod',

    'paymentTanksWrap',
    'paymentTankDuragas',
    'paymentTankKinggas',
    'paymentTankHint',

    'paymentPickupWrap',
    'paymentPickupDuragas',
    'paymentPickupKinggas',
    'paymentPickupHint',

    'paymentNote',
    'closeDialogBtn',


    /*
      INVENTARIO
    */
    'inventoryDetails',
    'adjustmentForm',
    'adjustmentGasType',
    'adjustmentBucket',
    'adjustmentQty',
    'adjustmentNote',


    /*
      CIERRE
    */
    'closingForm',
    'closingAutoDateTime',
    'closingCash',
    'closingOtherExpenses',

    'closingDuragasFull',
    'closingDuragasEmpty',
    'closingDuragasReserved',

    'closingKinggasFull',
    'closingKinggasEmpty',
    'closingKinggasReserved',

    'closingNote',
    'closingSummary',


    /*
      HISTORIAL
    */
    'historyCards',


    /*
      RESPALDO
    */
    'exportBtn',
    'importInput',
    'resetBtn',
    'customerSuggestions'

  ];


  const missing =
    requiredIds.filter(
      id =>
        !$(id)
    );


  if (
    missing.length ===
    0
  ) {

    return true;

  }


  console.error(

    'CONTROL GAS - FALTAN ELEMENTOS HTML:',

    missing

  );


  /*
    Mensaje visible para que
    no parezca que simplemente
    "la página no funciona".
  */

  window.alert(

    `El sistema detectó que faltan ${missing.length} elemento(s) del HTML.\n\nRevisa la consola del navegador (F12) para ver cuáles faltan.`

  );


  return false;

}


/* =========================================================
   AUDITORÍA DE IDENTIFICADORES
========================================================= */

function duplicateIdsIn(
  collection
) {

  const seen =
    new Set();


  const duplicated =
    new Set();


  for (
    const item
    of collection || []
  ) {

    if (
      !item?.id
    ) {

      continue;

    }


    if (
      seen.has(
        item.id
      )
    ) {

      duplicated.add(
        item.id
      );

    }


    seen.add(
      item.id
    );

  }


  return Array.from(
    duplicated
  );

}


/* =========================================================
   AUDITORÍA BÁSICA DEL ESTADO
========================================================= */

function auditStateIntegrity() {

  const issues =
    [];


  /*
    IDs DUPLICADOS
  */

  const collections = {

    days:
      state.days,

    sales:
      state.sales,

    saleLines:
      state.saleLines,

    accounts:
      state.accounts,

    accountBalances:
      state.accountBalances,

    movements:
      state.movements,

    adjustments:
      state.adjustments

  };


  for (
    const [
      name,
      collection
    ]
    of Object.entries(
      collections
    )
  ) {

    const duplicates =
      duplicateIdsIn(
        collection
      );


    if (
      duplicates.length
    ) {

      issues.push(

        `${name}: existen ${duplicates.length} ID(s) duplicado(s).`

      );

    }

  }


  /*
    VENTAS SIN LÍNEAS
  */

  for (
    const sale
    of state.sales
  ) {

    if (
      saleLinesForSale(
        sale.id
      ).length ===
      0
    ) {

      issues.push(

        `La venta ${sale.id} no contiene líneas de gas.`

      );

    }

  }


  /*
    CUENTAS SIN VENTA
    SOLO SE ADVIERTE.

    Puede existir después de
    migraciones antiguas.
  */

  for (
    const account
    of state.accounts
  ) {

    if (
      account.saleId &&
      !state.sales.some(
        sale =>
          sale.id ===
          account.saleId
      )
    ) {

      issues.push(

        `La cuenta ${account.id} referencia una venta inexistente.`

      );

    }

  }


  /*
    INVENTARIO NEGATIVO
    DEL DÍA ACTIVO.
  */

  const day =
    getActiveDay();


  if (day) {

    const inventory =
      currentInventory();


    for (
      const gasType
      of GAS_TYPES
    ) {

      for (
        const bucket
        of [
          'full',
          'empty',
          'reserved'
        ]
      ) {

        const rawValue =
          Number(
            inventory[
              gasType
            ][
              bucket
            ]
          );


        if (
          rawValue <
          0
        ) {

          issues.push(

            `${gasLabel(gasType)} tiene inventario negativo en ${inventoryBucketLabel(bucket)}: ${rawValue}.`

          );

        }

      }

    }

  }


  /*
    RESERVAS CONTABLES
    CONTRA RESERVAS FÍSICAS.
  */

  if (day) {

    const pending =
      pendingTotals();


    const inventory =
      currentInventory();


    for (
      const gasType
      of GAS_TYPES
    ) {

      if (

        int(
          inventory[
            gasType
          ].reserved
        ) <

        int(
          pending.pickup[
            gasType
          ]
        )

      ) {

        issues.push(

          `${gasLabel(gasType)}: existen ${pending.pickup[gasType]} pendiente(s) de retirar pero solo ${inventory[gasType].reserved} reservado(s) físicamente.`

        );

      }

    }

  }


  if (
    issues.length
  ) {

    console.warn(

      'CONTROL GAS - AUDITORÍA DE INTEGRIDAD',

      issues

    );

  }


  return issues;

}


/* =========================================================
   MOSTRAR ADVERTENCIA DE INTEGRIDAD
========================================================= */

function reportIntegrityIssues() {

  const issues =
    auditStateIntegrity();


  if (
    issues.length ===
    0
  ) {

    return;

  }


  toast(

    `Advertencia: se detectaron ${issues.length} inconsistencia(s). Revisa la consola.`

  );

}


/* =========================================================
   EVITAR VALORES NEGATIVOS EN CAMPOS DE VENTA
========================================================= */

function sanitizeSaleInputs() {

  [
    'qtyDuragas',
    'qtyKinggas',
    'emptyDuragas',
    'emptyKinggas'
  ]
    .forEach(
      id => {

        const input =
          $(id);


        if (!input) {

          return;

        }


        input.addEventListener(

          'change',

          () => {

            input.value =
              int(
                input.value
              );


            afterSaleQuantityChange();

          }

        );

      }
    );


  $('saleReceived')
    ?.addEventListener(

      'change',

      () => {

        $('saleReceived').value =
          Math.max(

            0,

            roundMoney(
              $('saleReceived').value
            )

          )
            .toFixed(
              2
            );


        calculateSale();

      }

    );

}


/* =========================================================
   EVITAR DOBLE SUBMIT POR CLIC MUY RÁPIDO
========================================================= */

/*
  Es una protección adicional
  para un punto de venta.

  Después de pulsar un submit,
  el botón queda deshabilitado
  durante una fracción de segundo.

  No altera la lógica de negocio.
*/

function setupSubmitProtection() {

  document
    .querySelectorAll(
      'form'
    )
    .forEach(
      form => {

        form.addEventListener(

          'submit',

          () => {

            const button =
              form.querySelector(
                'button[type="submit"]'
              );


            if (!button) {

              return;

            }


            button.disabled =
              true;


            setTimeout(

              () => {

                button.disabled =
                  false;

              },

              700

            );

          }

        );

      }
    );

}


/* =========================================================
   VISIBILIDAD DE CIERRE
========================================================= */

function resetClosingSummaryVisibility() {

  const container =
    $('closingSummary');


  if (!container) {

    return;

  }


  /*
    Al iniciar normalmente
    no mostramos un cierre antiguo
    debajo de un día nuevo.
  */

  container.hidden =
    true;


  container.innerHTML =
    '';

}


/* =========================================================
   INICIALIZAR RELOJ
========================================================= */

function startClock() {

  syncClock();


  if (
    clockTimer
  ) {

    clearInterval(
      clockTimer
    );

  }


  clockTimer =
    setInterval(

      syncClock,

      1000

    );

}


/* =========================================================
   REGRESAR AL RELOJ CORRECTO
   CUANDO SE VUELVE A LA PESTAÑA
========================================================= */

function setupVisibilitySync() {

  document.addEventListener(

    'visibilitychange',

    () => {

      if (
        document.visibilityState ===
        'visible'
      ) {

        syncClock();

        renderActiveDayText();

      }

    }

  );

}


/* =========================================================
   INICIALIZACIÓN
========================================================= */

function init() {

  /*
    1. VERIFICAR HTML.
  */

  if (
    !validateDomContract()
  ) {

    return;

  }


  /*
    2. NORMALIZAR ESTADO
    UNA VEZ MÁS AL INICIAR.
  */

  state =
    normalizeState(
      state
    );


  saveState();


  /*
    3. NAVEGACIÓN
  */

  setupTabs();


  /*
    4. APERTURA
  */

  setupOpeningControls();


  /*
    5. VENTAS
  */

  setupSaleForm();

  setupSaleControls();

  sanitizeSaleInputs();


  /*
    6. PENDIENTES
  */

  setupAccountControls();

  setupDialogUX();


  /*
    7. INVENTARIO
  */

  setupInventoryControls();


  /*
    8. CIERRE
  */

  setupClosingControls();


  /*
    9. RESPALDOS
  */

  setupBackupControls();


  /*
    10. PROTECCIÓN CONTRA
    DOBLE CLIC DE GUARDADO
  */

  setupSubmitProtection();


  /*
    11. RELOJ
  */

  startClock();

  setupVisibilitySync();


  /*
    12. LIMPIAR RESULTADO
    DE CIERRE ANTERIOR.
  */

  resetClosingSummaryVisibility();


  /*
    13. PRIMER RENDER
  */

  renderAll();


  /*
    14. RECALCULAR FORMULARIO
    DE VENTA.
  */

  calculateSale();


  /*
    15. AUDITORÍA INTERNA.
  */

  reportIntegrityIssues();


  /*
    16. PANTALLA INICIAL.

    Si existe un día abierto:
      Resumen.

    Si no existe:
      Apertura.
  */

  const day =
    getActiveDay();


  if (
    day &&
    !day.closed
  ) {

    goTo(
      'dashboard'
    );

  }


  else {

    goTo(
      'opening'
    );

  }

}


/* =========================================================
   ARRANQUE DE LA APLICACIÓN
========================================================= */

document.addEventListener(

  'DOMContentLoaded',

  init

);