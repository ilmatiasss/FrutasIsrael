/**
 * Datos de ejemplo realistas: ~13 semanas de historia de una bodega de La Vega,
 * anclados al día en que se abre la app por primera vez. Determinístico (misma
 * semilla → mismos datos) para que las demos se puedan repetir.
 */
import type { Cliente, Db, FormaPago, LineaVale, Movimiento, Producto, Unidad } from "./types";
import { fromFecha, hoy, sumarDias, uid } from "./format";

const TENANT = "00000000-0000-4000-8000-000000000001";
const ULTIMO_VALE = 20307;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProdSeed {
  nombre: string;
  codigo: string;
  unidad: Unidad;
  color: string;
  base: number; // precio base por unidad default
}

const PRODUCTOS: ProdSeed[] = [
  { nombre: "FUJI", codigo: "FU", unidad: "CAJA", color: "#C4262E", base: 15000 },
  { nombre: "PINK LADY", codigo: "PL", unidad: "CAJA", color: "#D9497A", base: 19000 },
  { nombre: "ROYAL GALA", codigo: "RG", unidad: "CAJA", color: "#B8452B", base: 14000 },
  { nombre: "VERDE", codigo: "VE", unidad: "CAJA", color: "#5E8C31", base: 13000 },
  { nombre: "ROJA", codigo: "RO", unidad: "CAJA", color: "#8E1B22", base: 12000 },
  { nombre: "PERA", codigo: "PE", unidad: "CAJA", color: "#9DA83A", base: 15500 },
  { nombre: "KIWI", codigo: "KI", unidad: "CAJA", color: "#7A6A2E", base: 9500 },
  { nombre: "NARANJA", codigo: "NA", unidad: "KG", color: "#E07B24", base: 750 },
  { nombre: "MANCAQUI", codigo: "MQ", unidad: "CAJA", color: "#E39B2D", base: 11000 },
  { nombre: "LIMÓN", codigo: "LI", unidad: "KG", color: "#D9B638", base: 1100 },
  { nombre: "CAJONES 3/4", codigo: "C34", unidad: "CAJA", color: "#A27B4B", base: 8000 },
];

type Pago = "semanal" | "quincenal" | "lento" | "moroso" | "perdido" | "contado";

interface ClienteSeed {
  nombre: string;
  alias: string;
  freq: number; // prob. de comprar un día hábil
  credito: number; // prob. de que la compra sea fiada
  pago: Pago;
  tam: [number, number]; // cajas por línea
  prods: string[]; // códigos preferidos
  transf: number; // prob. de pagar por transferencia
  saldoInicial?: number;
  limite?: number;
}

const CLIENTES: ClienteSeed[] = [
  { nombre: "Raúl Contreras Soto", alias: "DON RAÚL", freq: 0.8, credito: 0.85, pago: "semanal", tam: [6, 18], prods: ["FU", "PL", "VE", "PE"], transf: 0.2, saldoInicial: 380000, limite: 1500000 },
  { nombre: "Marta Fuentealba", alias: "SEÑORA MARTA", freq: 0.55, credito: 0.7, pago: "semanal", tam: [2, 6], prods: ["FU", "NA", "LI", "PE"], transf: 0.1 },
  { nombre: "Jonathan Muñoz Pérez", alias: "EL JONA", freq: 0.5, credito: 0.9, pago: "lento", tam: [2, 5], prods: ["FU", "RO", "MQ"], transf: 0.05, saldoInicial: 210000 },
  { nombre: "Carmen Gálvez", alias: "LA CARMENCITA", freq: 0.45, credito: 0.8, pago: "quincenal", tam: [3, 8], prods: ["FU", "VE", "KI", "NA"], transf: 0.6 },
  { nombre: "Hermanos Saavedra Ltda.", alias: "LOS SAAVEDRA", freq: 0.75, credito: 0.9, pago: "semanal", tam: [10, 25], prods: ["FU", "PL", "RG", "VE", "PE"], transf: 0.9, saldoInicial: 920000, limite: 3000000 },
  { nombre: "Patricio Rojas Vidal", alias: "EL PATO", freq: 0.35, credito: 0.95, pago: "moroso", tam: [4, 10], prods: ["FU", "RO", "VE"], transf: 0.1, saldoInicial: 640000, limite: 800000 },
  { nombre: "Minimarket Doña Inés", alias: "DOÑA INÉS", freq: 0.4, credito: 0.1, pago: "contado", tam: [1, 4], prods: ["FU", "NA", "LI", "KI"], transf: 0.5 },
  { nombre: "Luis Alberto Henríquez", alias: "EL FLACO", freq: 0.5, credito: 0.85, pago: "lento", tam: [3, 9], prods: ["FU", "VE", "MQ", "C34"], transf: 0.2, saldoInicial: 330000 },
  { nombre: "Elena Castillo", alias: "LA TÍA NENA", freq: 0.45, credito: 0.75, pago: "quincenal", tam: [2, 5], prods: ["NA", "KI", "PE", "LI"], transf: 0.7 },
  { nombre: "Cristián Vergara", alias: "EL CRISTIAN", freq: 0.5, credito: 0.6, pago: "semanal", tam: [3, 8], prods: ["PL", "RG", "KI", "PE"], transf: 0.8 },
  { nombre: "Juan Carlos Pizarro", alias: "EL CHINO PIZARRO", freq: 0.5, credito: 0.95, pago: "perdido", tam: [8, 16], prods: ["FU", "VE", "RO", "PE"], transf: 0.1, saldoInicial: 1150000, limite: 1200000 },
  { nombre: "Sandra Molina", alias: "SANDRA", freq: 0.3, credito: 0.05, pago: "contado", tam: [1, 3], prods: ["FU", "NA"], transf: 0.3 },
  { nombre: "Rodrigo Tapia", alias: "RORRO", freq: 0.45, credito: 0.8, pago: "quincenal", tam: [4, 12], prods: ["FU", "VE", "PE", "C34"], transf: 0.4 },
  { nombre: "Alberto Núñez", alias: "DON BETO", freq: 0.6, credito: 0.8, pago: "semanal", tam: [4, 10], prods: ["FU", "PL", "RG", "KI"], transf: 0.5 },
  { nombre: "Gloria Espinoza", alias: "LA GLORIA", freq: 0.4, credito: 0.85, pago: "lento", tam: [2, 6], prods: ["FU", "NA", "MQ"], transf: 0.2 },
  { nombre: "Héctor Yáñez", alias: "EL GUATÓN HÉCTOR", freq: 0.4, credito: 0.9, pago: "moroso", tam: [5, 12], prods: ["FU", "RO", "VE", "MQ"], transf: 0.1, saldoInicial: 280000 },
  { nombre: "Restaurante El Rincón Chilote", alias: "RINCÓN CHILOTE", freq: 0.25, credito: 0.15, pago: "contado", tam: [1, 3], prods: ["LI", "NA", "PE"], transf: 1 },
  { nombre: "Claudia Sepúlveda", alias: "CLAUDITA", freq: 0.55, credito: 0.75, pago: "semanal", tam: [3, 8], prods: ["FU", "PL", "PE", "KI"], transf: 0.6 },
  { nombre: "Iván Riquelme", alias: "EL IVÁN", freq: 0.45, credito: 0.9, pago: "perdido", tam: [2, 5], prods: ["FU", "RO", "MQ"], transf: 0, saldoInicial: 95000 },
  { nombre: "Sociedad Frutícola Aravena", alias: "ARAVENA", freq: 0.3, credito: 0.9, pago: "quincenal", tam: [15, 30], prods: ["FU", "PL", "RG", "PE"], transf: 1, limite: 5000000 },
  { nombre: "Manuel Cárcamo", alias: "DON MANUEL", freq: 0.55, credito: 0.8, pago: "semanal", tam: [4, 10], prods: ["FU", "VE", "NA", "C34"], transf: 0.2 },
  { nombre: "Yesenia Bravo", alias: "LA YESSI", freq: 0.4, credito: 0.85, pago: "lento", tam: [2, 6], prods: ["FU", "KI", "MQ", "LI"], transf: 0.5, saldoInicial: 120000 },
  { nombre: "Óscar Navarrete", alias: "DON ÓSCAR", freq: 0.55, credito: 0.7, pago: "semanal", tam: [4, 10], prods: ["FU", "PL", "VE", "PE"], transf: 0.3 },
  { nombre: "Kiosco Las Hermanitas", alias: "LAS HERMANITAS", freq: 0.35, credito: 0.2, pago: "contado", tam: [1, 2], prods: ["FU", "NA", "KI"], transf: 0.2 },
  { nombre: "Francisco Díaz", alias: "PANCHO", freq: 0.45, credito: 0.8, pago: "quincenal", tam: [4, 10], prods: ["FU", "RG", "VE", "MQ"], transf: 0.4 },
  { nombre: "Mauricio Leiva", alias: "EL MAURO", freq: 0.4, credito: 0.9, pago: "moroso", tam: [3, 8], prods: ["FU", "RO", "C34"], transf: 0.1, saldoInicial: 190000 },
  { nombre: "Casino Constructora Ríos", alias: "CASINO RÍOS", freq: 0.2, credito: 0.9, pago: "quincenal", tam: [3, 8], prods: ["FU", "NA", "PE", "KI"], transf: 1 },
  { nombre: "Bernarda Ulloa", alias: "DOÑA BERNA", freq: 0.35, credito: 0.5, pago: "perdido", tam: [2, 6], prods: ["FU", "PE", "NA"], transf: 0.1 },
];

const EGRESOS: [string, number, number][] = [
  ["Pago carretillero", 8000, 15000],
  ["Colación equipo", 12000, 22000],
  ["Bolsas y cinta embalaje", 5000, 12000],
  ["Flete camión a Lo Valledor", 35000, 60000],
  ["Café y pan mañana", 3000, 6000],
  ["Cuidador estacionamiento", 2000, 4000],
];

const MOTIVOS = [
  "Error de digitación, se rehízo en otro vale",
  "Cliente devolvió la mercadería",
  "Vale duplicado",
  "Precio mal cobrado, se emitió de nuevo",
];

function round(n: number, step: number) {
  return Math.max(step, Math.round(n / step) * step);
}

export function crearSeed(anclaje: string = hoy()): Db {
  const rnd = mulberry32(20307);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const entre = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  const now = new Date().toISOString();
  const ahora = Date.now();
  const productos: Producto[] = PRODUCTOS.map((p) => ({
    id: uid(),
    tenant_id: TENANT,
    nombre: p.nombre,
    codigo: p.codigo,
    unidad_default: p.unidad,
    color: p.color,
    activo: true,
  }));
  const prodPorCodigo = new Map(productos.map((p, i) => [p.codigo, { p, s: PRODUCTOS[i] }]));

  const clientes: Cliente[] = CLIENTES.map((c, i) => ({
    id: uid(),
    tenant_id: TENANT,
    nombre: c.nombre,
    alias: c.alias,
    telefono: `+56 9 ${entre(4000, 9999)} ${String(entre(0, 9999)).padStart(4, "0")}`,
    limite_credito: c.limite ?? null,
    semaforo_manual: null,
    compra_manual: null,
    notas: i === 5 ? "Prometió ponerse al día después del 18. Solo contado hasta que abone." : null,
    created_at: now,
  }));

  type Borrador = Omit<Movimiento, "numero"> & { _lineas?: Omit<LineaVale, "movimiento_id">[] };
  const borradores: Borrador[] = [];

  const DIAS_HISTORIA = 95;
  const inicio = sumarDias(anclaje, -DIAS_HISTORIA);
  const saldo = new Map<string, number>();
  const ultimoPago = new Map<string, number>();

  const base = (id: string, fecha: string, h: number, m: number): Omit<Borrador, "tipo" | "forma_pago" | "total"> => {
    const d = fromFecha(fecha);
    d.setHours(h, m, entre(0, 59), 0);
    // lo de hoy no puede quedar "en el futuro" respecto de la hora real
    if (fecha === anclaje && d.getTime() > ahora) d.setTime(ahora - (((h * 60 + m) % 240) + 1) * 60000);
    return {
      id,
      tenant_id: TENANT,
      fecha,
      cliente_id: null,
      glosa: null,
      origen_id: null,
      creado_por: rnd() < 0.7 ? "Caja" : "Israel",
      created_at: d.toISOString(),
      anulado_at: null,
      anulado_por: null,
      motivo_anulacion: null,
      importado: false,
    };
  };

  // Saldos arrastrados de la planilla antigua
  CLIENTES.forEach((c, i) => {
    if (!c.saldoInicial) return;
    const cli = clientes[i];
    saldo.set(cli.id, c.saldoInicial);
    borradores.push({
      ...base(uid(), sumarDias(inicio, -1), 8, 0),
      tipo: "VALE_CREDITO",
      cliente_id: cli.id,
      forma_pago: "CREDITO",
      total: c.saldoInicial,
      glosa: "Saldo arrastrado desde planilla Google Sheets",
      importado: true,
      creado_por: "Importador",
    });
  });

  for (let d = 0; d <= DIAS_HISTORIA; d++) {
    const fecha = sumarDias(inicio, d);
    const diaSemana = fromFecha(fecha).getDay();
    const esHoy = fecha === anclaje;
    if (diaSemana === 0 && !esHoy) continue; // domingo cerrado
    const faltan = DIAS_HISTORIA - d; // días hasta hoy

    // fondo de caja
    borradores.push({
      ...base(uid(), fecha, 5, 10),
      tipo: "INGRESO",
      forma_pago: "EFECTIVO",
      total: 100000,
      glosa: "Fondo de caja",
    });

    CLIENTES.forEach((c, i) => {
      const cli = clientes[i];
      let freq = c.freq;
      if (c.pago === "perdido" && faltan < 48) freq = 0; // dejó de venir
      if (c.pago === "moroso" && faltan < 40) freq *= 0.35;
      if (diaSemana === 6) freq *= 0.7;
      if (esHoy) freq *= 1.2;

      // ---- compra ----
      if (rnd() < freq) {
        const nLineas = rnd() < 0.5 ? 1 : rnd() < 0.7 ? 2 : 3;
        const usados = new Set<string>();
        const lineas: Omit<LineaVale, "movimiento_id">[] = [];
        const movId = uid();
        for (let l = 0; l < nLineas; l++) {
          const cod = pick(c.prods);
          if (usados.has(cod)) continue;
          usados.add(cod);
          const { p, s } = prodPorCodigo.get(cod)!;
          const ola = 1 + 0.1 * Math.sin((d + i) / 8 + s.base / 1000);
          const kg = p.unidad_default === "KG";
          const env = !kg && rnd() < 0.08;
          const unidad: Unidad = kg ? "KG" : env ? "ENVASE" : "CAJA";
          const cantidad = kg ? entre(2, 12) * 5 : env ? entre(1, 3) : entre(c.tam[0], c.tam[1]);
          const precio = kg ? round(s.base * ola, 50) : round(s.base * ola * (env ? 1.8 : 1), 500);
          lineas.push({
            id: uid(),
            tenant_id: TENANT,
            orden: lineas.length + 1,
            cantidad,
            unidad,
            producto_id: p.id,
            precio_unitario: precio,
            subtotal: Math.round(cantidad * precio),
          });
        }
        const total = lineas.reduce((a, l) => a + l.subtotal, 0);
        const fiado = rnd() < c.credito && !(c.pago === "moroso" && faltan < 20 && rnd() < 0.5);
        const forma: FormaPago = fiado ? "CREDITO" : rnd() < c.transf ? "TRANSFERENCIA" : "EFECTIVO";
        const h = entre(5, 12);
        borradores.push({
          ...base(movId, fecha, h, entre(0, 59)),
          tipo: fiado ? "VALE_CREDITO" : "VALE_VENTA",
          cliente_id: cli.id,
          forma_pago: forma,
          total,
          _lineas: lineas,
        });
        if (fiado) saldo.set(cli.id, (saldo.get(cli.id) ?? 0) + total);

        // abono al tiro en el mismo vale (pasa harto)
        if (fiado && rnd() < 0.08) {
          const ab = round(total * (0.3 + rnd() * 0.4), 5000);
          borradores.push({
            ...base(uid(), fecha, h, 59),
            tipo: "ABONO",
            cliente_id: cli.id,
            forma_pago: "EFECTIVO",
            total: ab,
            glosa: "Abono en el mismo vale",
            origen_id: movId,
          });
          saldo.set(cli.id, (saldo.get(cli.id) ?? 0) - ab);
        }
      }

      // ---- pagos ----
      const s = saldo.get(cli.id) ?? 0;
      if (s <= 0) return;
      const ult = ultimoPago.get(cli.id) ?? -entre(0, 6);
      let monto = 0;
      switch (c.pago) {
        case "semanal":
          if (diaSemana === 6 || (diaSemana === 5 && rnd() < 0.3)) monto = rnd() < 0.8 ? s : s * (0.6 + rnd() * 0.3);
          break;
        case "quincenal":
          if (d - ult >= 13 && rnd() < 0.5) monto = s * (0.7 + rnd() * 0.3);
          break;
        case "lento":
          if (d - ult >= 9 && rnd() < 0.25) monto = s * (0.25 + rnd() * 0.25);
          break;
        case "moroso":
          if (faltan > 40 && d - ult >= 10 && rnd() < 0.3) monto = s * 0.3;
          else if (faltan <= 40 && faltan > 18 && rnd() < 0.03) monto = 20000;
          break;
        case "perdido":
          if (faltan > 55 && d - ult >= 7 && rnd() < 0.35) monto = s * 0.5;
          break;
        case "contado":
          if (rnd() < 0.5) monto = s;
          break;
      }
      if (monto > 0) {
        const total = monto >= s ? s : round(monto, 5000);
        const transf = rnd() < c.transf;
        borradores.push({
          ...base(uid(), fecha, entre(6, 13), entre(0, 59)),
          tipo: "ABONO",
          cliente_id: cli.id,
          forma_pago: transf ? "TRANSFERENCIA" : "EFECTIVO",
          total,
          glosa: transf ? pick(["Transf. BancoEstado", "Transf. Santander", "Transf. Cuenta RUT", "Transf. Banco de Chile"]) : null,
        });
        saldo.set(cli.id, s - total);
        ultimoPago.set(cli.id, d);
      }
    });

    // egresos del día
    const nEg = entre(1, 3);
    for (let e = 0; e < nEg; e++) {
      const [glosa, a, b] = pick(EGRESOS);
      borradores.push({
        ...base(uid(), fecha, entre(7, 13), entre(0, 59)),
        tipo: "EGRESO",
        forma_pago: "EFECTIVO",
        total: round(entre(a, b), 500),
        glosa,
      });
    }
  }

  // Orden cronológico y correlativo terminando en 20307
  borradores.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const primero = ULTIMO_VALE - borradores.length + 1;
  const movimientos: Movimiento[] = [];
  const lineas: LineaVale[] = [];
  borradores.forEach((b, i) => {
    const { _lineas, ...mov } = b;
    movimientos.push({ ...mov, numero: primero + i });
    _lineas?.forEach((l) => lineas.push({ ...l, movimiento_id: mov.id }));
  });

  // Algunas anulaciones (auditables) — solo vales sin abono asociado
  const conAbono = new Set(movimientos.map((m) => m.origen_id).filter(Boolean));
  const vales = movimientos.filter((m) => (m.tipo === "VALE_CREDITO" || m.tipo === "VALE_VENTA") && !m.importado && !conAbono.has(m.id));
  for (let k = 0; k < 7; k++) {
    const m = vales[Math.floor(rnd() * vales.length)];
    if (m.anulado_at) continue;
    const at = new Date(m.created_at);
    at.setMinutes(at.getMinutes() + entre(3, 40));
    m.anulado_at = at.toISOString();
    m.anulado_por = "Israel";
    m.motivo_anulacion = pick(MOTIVOS);
  }

  return {
    version: 1,
    tenant: {
      id: TENANT,
      nombre: "Frutas Israel",
      ubicacion: "La Vega Central · Santiago",
      ultimo_numero: ULTIMO_VALE,
      created_at: now,
    },
    usuarios: [
      { id: uid(), tenant_id: TENANT, nombre: "Israel", rol: "DUENO" },
      { id: uid(), tenant_id: TENANT, nombre: "Caja", rol: "CAJA" },
    ],
    clientes,
    productos,
    movimientos,
    lineas,
    cierres: [],
    cierres_semana: [],
    eventos: [
      {
        id: uid(),
        tenant_id: TENANT,
        at: now,
        usuario: "Sistema",
        accion: "IMPORTAR_CSV",
        entidad_id: null,
        detalle: `Historial de ejemplo cargado: ${movimientos.length} movimientos, ${clientes.length} clientes`,
      },
    ],
    config: { dias_amarillo: 15, dias_rojo: 30, dias_sin_compra: 21, usuario_actual: "Caja" },
  };
}
