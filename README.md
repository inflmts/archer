# Archer

**[Archer](https://archer.inflmts.com)**
is a lightweight and performant alternative to the official
[RideRTS](https://riderts.app) app deployed by Gainesville's
[Regional Transit System (RTS)](https://go-rts.com).
The goal of Archer is simplicity, and as such, many features are not implemented.
For example, the map only shows routes and stops on a plain grid;
geographical data like roads and buildings are not loaded or displayed.
Archer is intended for those who are already familiar with the routes,
and only care about bus locations and arrival times.

Archer is heavily inspired by [GNV Transit](https://gnvtransit.app) by
[Sam Claus](https://samcla.us) and [Kaley Ali](https://kaleya.li), although it
shares none of its code. Like GNV Transit, Archer still uses RTS's BusTime API
server in Gainesville.

Development of Archer is still in the early stages, so expect bugs and
inconsistencies between browsers. Archer uses many modern browser features, so
it may not work on older browsers.

## Development

Archer works by pretending to be <https://riderts.app/map>.
Create an `.env` file and add the RTS API and request keys, which can be
obtained by inspecting the website's code:

```
VITE_RTS_API_KEY=<25-character string>
VITE_RTS_REQUEST_KEY=<32-character string>
```

Install and start Vite:

```
pnpm install
pnpm exec vite
```

Alternatively, install Vite globally and run it directly:

```
pnpm add -g vite
vite
```

The site is now live at the usual <http://localhost:5173>.

## License

[MIT License](https://choosealicense.com/licenses/mit/)

Copyright (c) 2025 Daniel Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
