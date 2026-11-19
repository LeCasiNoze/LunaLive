import {defineConfig} from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL || 'https://bigwindaily.onrender.com',
  trailingSlash: 'always',
  build: {format: 'directory'},
});
