import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' sorgt dafür, dass alle Assets auch unter einer
// GitHub-Pages-Unteradresse (https://nutzer.github.io/repo/) geladen werden.
export default defineConfig({
  base: './',
  plugins: [react()],
});
