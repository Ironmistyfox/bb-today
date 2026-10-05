// Un límite global, también para carpetas recursivas: evita multiplicar consultas por curso.
export function crearCola(maximo = 4) {
  let activos = 0;
  const pendientes = [];
  const siguiente = () => {
    while (activos < maximo && pendientes.length) {
      const { ejecutar, ok, no } = pendientes.shift();
      activos++;
      Promise.resolve().then(ejecutar).then(ok, no).finally(() => { activos--; siguiente(); });
    }
  };
  return (ejecutar) => new Promise((ok, no) => { pendientes.push({ ejecutar, ok, no }); siguiente(); });
}

export function esperaReintento(cabecera, intento, ahora = Date.now()) {
  const segundos = Number(cabecera);
  const indicado = cabecera && Number.isFinite(segundos) ? segundos * 1000 : Date.parse(cabecera) - ahora;
  return Math.max(0, Number.isFinite(indicado) ? indicado : 1000 * 2 ** intento);
}
