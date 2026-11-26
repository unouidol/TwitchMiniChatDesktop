import { defineConfig } from 'vite';
import { appVersionPlugin } from './build/appVersion.mjs';

// https://vitejs.dev/config
export default defineConfig(({ command }) => ({
  plugins: [appVersionPlugin(command === 'serve' ? 'dev' : 'build')],
}));
