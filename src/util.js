import { HMAC } from './crypto.js';

export const biasLon = -82.34834;
export const biasLat = 29.64724;
export const biasXScale = Math.cos(biasLat * Math.PI / 180);
export const biasScale = 10000;

export const map = $('map');

export function $(selector) {
  const element = document.getElementById(selector);
  if (!element)
    throw selector;
  return element;
}

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

function encode(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++)
    bytes[i] = str.charCodeAt(i);
  return bytes;
}

const hmac = new HMAC(encode(import.meta.env.VITE_RTS_REQUEST_KEY));
const statusElement = $('status');
let status = 0;

async function _api(endpoint, params) {
  if (window.rfkill)
    throw new Error('Aborted');

  let path = `${endpoint}?key=${import.meta.env.VITE_RTS_API_KEY}&format=json`;
  if (params) {
    const search = new URLSearchParams(params).toString();
    if (search)
      path += `&${search}`;
  }

  // this comes from a little bit of trial and error
  const dateString = new Date().toUTCString();
  let requestId = '';
  for (const byte of hmac.reset().update(encode(`/api/v3/${path}${dateString}`)).digest())
    requestId += byte.toString(16).padStart(2, '0');

  const response = await fetch(`/api/${path}`, {
    headers: {
      'accept': 'application/json',
      'x-date': dateString,
      'x-request-id': requestId
    }
  });

  if (!response.ok)
    throw new Error(`Server returned ${response.status}`);

  const data = await response.json();
  return data['bustime-response'];
}

export async function api(endpoint, params) {
  if (!status++)
    statusElement.style.display = null;
  try {
    return await _api(endpoint, params);
  } finally {
    if (!--status)
      statusElement.style.display = 'none';
  }
}
