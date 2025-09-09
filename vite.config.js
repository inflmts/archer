/** @type {import('vite').UserConfig} */
export default {
  appType: 'mpa',
  server: {
    proxy: {
      '/api': {
        target: 'https://riderts.app/bustime/api/v3',
        changeOrigin: true,
        rewrite: path => path.slice(4)
      }
    }
  }
};
