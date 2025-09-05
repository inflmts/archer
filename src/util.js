export const biasLon = -82.34834;
export const biasLat = 29.64724;
export const biasXScale = Math.cos(biasLat * Math.PI / 180);

export function $(selector) {
  const element = document.getElementById(selector);
  if (!element)
    throw selector;
  return element;
}

export const map = $('map');

export function html(tag, attrs, text) {
  const element = document.createElement(tag);
  if (attrs)
    for (const [name, value] of Object.entries(attrs))
      element.setAttribute(name, value);
  if (text !== undefined)
    element.textContent = text;
  return element;
}

export function svg(tag, attrs) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (attrs)
    for (const [name, value] of Object.entries(attrs))
      element.setAttribute(name, value);
  return element;
}

export { api } from './api.js';
