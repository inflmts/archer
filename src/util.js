export const map = document.querySelector('#map');

export const biasX = -94.70059;
export const biasY = -29.64724;

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

export async function api(param) {
  const response = await fetch(`/api/${param}`);
  const data = await response.json();
  return data['bustime-response'];
}
