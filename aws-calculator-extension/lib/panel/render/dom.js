// lib/panel/render/dom.js — Ayudantes de render del panel (BR5.1, NFR5.1).
// Dueño: U6. Zona B (smoke). Solo createElement, textContent, clases fijas y
// atributos con nombre literal: ningún texto variable se interpreta como HTML.

// Elemento con clase fija, texto plano y data-testid opcionales.
export function el(tag, { className, text, testId } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (testId) node.dataset.testid = testId;
  return node;
}

export function setText(node, text) {
  const value = text === undefined || text === null ? "" : String(text);
  if (node.textContent !== value) node.textContent = value;
}

export function show(node, visible) {
  if (node.hidden === visible) node.hidden = !visible;
}

// Reemplaza los hijos de una lista por ítems <li> de texto plano.
export function setListItems(list, texts) {
  list.replaceChildren(...texts.map((text) => el("li", { text })));
}

// Enlace solo para una URL ya validada por el llamador (o un blob: propio).
export function link(href, text, testId) {
  const node = el("a", { className: "result-link", text, testId });
  node.href = href;
  node.target = "_blank";
  node.rel = "noopener noreferrer";
  return node;
}
