import { defineConfig } from 'vitest/config';

// Les tests font tourner le moteur CPU : quelques secondes par test.
export default defineConfig({ test: { testTimeout: 30000 } });
