import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
 cacheDir:'node_modules/.vite-auth-session-recovery-20261023',
 plugins:[react()],
 optimizeDeps:{entries:['test/auth-session.html'],include:['react','react-dom/client','lucide-react']},
});
