import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The guard is a standalone library: no framework imports allowed inside it.
    files: ['lib/guard/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['next', 'next/*', 'react', 'react-dom', '@/app/*', '@/components/*'], message: 'lib/guard must stay framework-free.' },
            { group: ['openai', '@paypal/*'], message: 'The guard never calls an LLM or PayPal; it only evaluates.' },
          ],
        },
      ],
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'data/**', 'lib/studio/openai-adapter.ts']),
]);
