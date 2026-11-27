import {defineConfig} from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://bigwindaily.onrender.com',
  trailingSlash: 'always',
  // CSS dans la page : une seule feuille, légère, qui bloquait le premier affichage sur mobile.
  build: {format: 'directory', inlineStylesheets: 'always'},
});
