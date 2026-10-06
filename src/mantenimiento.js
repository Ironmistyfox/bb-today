// Política de esta versión: organización y entrega de archivos propios.
// No depende de preferencias ni de una variable que pueda activar IA.
export const MODO_LIMITADO = true;
// Nombres internos conservados por compatibilidad; el hub no muestra avisos
// de mantenimiento y quitar esos avisos no reactiva la generación de IA.
export const AVISO_MANTENIMIENTO = 'BB Today organiza tareas, mensajes y archivos propios. La IA no está disponible en esta versión.';
export const IA_PAUSADA = { error: AVISO_MANTENIMIENTO, mantenimiento: true };
