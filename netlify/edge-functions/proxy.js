import crypto from 'node:crypto';

export default async (request, context) => {
  const url = new URL(request.url);
  const endpoint = url.pathname.slice(5);
  const apiKey = Netlify.env.get('RTS_API_KEY');
  const requestKey = Netlify.env.get('RTS_REQUEST_KEY');

  let path = `/api/v3/${endpoint}?key=${apiKey}&format=json`;
  for (const [name, value] of url.searchParams)
    path += `&${name}=${encodeURIComponent(value)}`;

  // this comes from a little bit of trial and error
  const dateString = new Date().toUTCString();
  const hmac = crypto.createHmac('sha256', requestKey);
  hmac.update(path + dateString);
  const requestId = hmac.digest('hex');

  const response = await fetch(`https://riderts.app/bustime${path}`, {
    headers: {
      'accept': 'application/json',
      'user-agent': 'Archer <https://archer.inflmts.com>',
      'x-date': dateString,
      'x-request-id': requestId
    }
  });

  return new Response(response.body, {
    headers: {
      'access-control-allow-origin': '*',
      'content-type': 'application/json'
    }
  });
};

export const config = {
  path: [
    '/api/getdirections',
    '/api/getpatterns',
    '/api/getpredictions',
    '/api/getroutes',
    '/api/getstops',
    '/api/getvehicles',
  ]
};
