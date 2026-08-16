import type { Metadata } from 'next';
import PanelModeracion from '@/components/PanelModeracion';

// El panel nunca debe aparecer en buscadores. La seguridad no depende de esto
// (sin correo autorizado no se ve nada), pero no hay razón para publicarlo.
export const metadata: Metadata = {
  title: 'Panel de moderación · Punto Cero',
  robots: { index: false, follow: false, nocache: true },
};

export default function Pagina() {
  return <PanelModeracion />;
}
