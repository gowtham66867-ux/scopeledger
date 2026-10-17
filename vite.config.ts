import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {fileURLToPath} from 'node:url';
export default defineConfig({root:'client',plugins:[react()],resolve:{alias:{'@/lib':fileURLToPath(new URL('./lib',import.meta.url))}},build:{outDir:'../dist/client',emptyOutDir:true}});
