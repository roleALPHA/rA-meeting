import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({command,mode}) => ({
 plugins: [react(),{name:'browser-only-preview',transformIndexHtml(html:string){return command==='serve'&&mode!=='legacy'?html.replace('/client/main.tsx','/client/preview.tsx'):html;}}],
 build:{outDir:'dist/client'},
}));
