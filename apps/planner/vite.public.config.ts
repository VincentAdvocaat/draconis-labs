import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:fileURLToPath(new URL('./public-site',import.meta.url)),base:'./',plugins:[react()],build:{outDir:'../dist/public',emptyOutDir:true},server:{host:'127.0.0.1',port:3044,strictPort:true,proxy:{'/api':'http://127.0.0.1:3043'}}});
