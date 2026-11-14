import * as esbuild from 'esbuild';

console.log('Bundling frontend SPA with esbuild...');
const result = await esbuild.build({
  entryPoints: ['frontend/src/main.jsx'],
  bundle: true,
  minify: true,
  sourcemap: true,
  format: 'esm',
  outfile: 'public/dist/app.js',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  loader: {
    '.js': 'jsx',
    '.jsx': 'jsx',
  },
});

console.log('Build completed successfully!');
