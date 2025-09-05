import { HMAC } from './crypto.js';

function encode(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++)
    bytes[i] = str.charCodeAt(i);
  return bytes;
}

function toHex(bytes) {
  return Array.prototype.map.call(
    bytes, byte => byte.toString(16).padStart(2, '0')
  ).join('');
}

const hmac = new HMAC(encode(import.meta.env.VITE_RTS_REQUEST_KEY));

export async function api(endpoint, params) {
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
  const requestId = toHex(hmac.reset().update(encode(`/api/v3/${path}${dateString}`)).digest());

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
