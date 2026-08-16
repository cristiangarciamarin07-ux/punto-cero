import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        blanco: 'rgb(var(--blanco) / <alpha-value>)',
        nieve: 'rgb(var(--nieve) / <alpha-value>)',
        borde: 'rgb(var(--borde) / <alpha-value>)',
        gris: 'rgb(var(--gris) / <alpha-value>)',
        azul: 'rgb(var(--azul) / <alpha-value>)',
        'azul-tinta': 'rgb(var(--azul-tinta) / <alpha-value>)',
        'azul-suave': 'rgb(var(--azul-suave) / <alpha-value>)',
        rojo: 'rgb(var(--rojo) / <alpha-value>)',
        'rojo-oscuro': 'rgb(var(--rojo-oscuro) / <alpha-value>)',
        verde: 'rgb(var(--verde) / <alpha-value>)',
      },
      fontFamily: {
        // Archivo: grotesca sólida, del registro visual de las organizaciones
        // humanitarias. IBM Plex Sans: legible a 12px y con buena acentuación
        // en español. Plex Mono para folios y coordenadas.
        display: ['var(--fuente-display)', 'ui-sans-serif', 'sans-serif'],
        body: ['var(--fuente-body)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--fuente-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
