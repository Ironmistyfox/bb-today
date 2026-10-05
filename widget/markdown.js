// Respuestas de Claude: Markdown mínimo con fórmulas (KaTeX). Lo usan la
// ventana de respuesta y la vista previa; necesita katex y auto-render antes.
(() => {
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Markdown mínimo: títulos, listas, negritas, cursivas, código y citas. Las
// fórmulas ($…$, $$…$$, \(…\), \[…\]) se dejan intactas para KaTeX.
function markdown(texto) {
  const bloques = [];
  // Bloques de código primero, para no tocar lo de dentro.
  let t = texto.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _leng, codigo) => {
    bloques.push(`<pre><code>${esc(codigo.replace(/\n$/, ''))}</code></pre>`);
    return `\u0000${bloques.length - 1}\u0000`;
  });
  const enLinea = (s) =>
    esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  const lineas = t.split('\n');
  let html = '';
  let lista = null;
  let parrafo = [];
  const cerrarParrafo = () => {
    if (parrafo.length) html += `<p>${parrafo.map(enLinea).join('<br>')}</p>`;
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista) html += `</${lista}>`;
    lista = null;
  };
  for (const linea of lineas) {
    const bloque = linea.match(/^\u0000(\d+)\u0000$/);
    const titulo = linea.match(/^(#{1,3})\s+(.*)/);
    const vineta = linea.match(/^\s*[-*•]\s+(.*)/);
    const numero = linea.match(/^\s*\d+[.)]\s+(.*)/);
    if (bloque) { cerrarParrafo(); cerrarLista(); html += bloques[Number(bloque[1])]; continue; }
    if (titulo) { cerrarParrafo(); cerrarLista(); html += `<h${titulo[1].length}>${enLinea(titulo[2])}</h${titulo[1].length}>`; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(linea)) { cerrarParrafo(); cerrarLista(); html += '<hr>'; continue; }
    if (linea.startsWith('>')) { cerrarParrafo(); cerrarLista(); html += `<blockquote>${enLinea(linea.replace(/^>\s?/, ''))}</blockquote>`; continue; }
    if (vineta || numero) {
      cerrarParrafo();
      const tipo = vineta ? 'ul' : 'ol';
      if (lista !== tipo) { cerrarLista(); html += `<${tipo}>`; lista = tipo; }
      html += `<li>${enLinea((vineta || numero)[1])}</li>`;
      continue;
    }
    if (!linea.trim()) { cerrarParrafo(); cerrarLista(); continue; }
    cerrarLista();
    parrafo.push(linea);
  }
  cerrarParrafo();
  cerrarLista();
  return html;
}

function formulas(el) {
  try {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
      ],
      throwOnError: false,
    });
  } catch {}
}

window.formatoRespuesta = { markdown, formulas };
})();
