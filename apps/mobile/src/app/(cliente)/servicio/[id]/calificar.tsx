import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function Calificar() {
  return (
    <PlaceholderScreen
      screenNumber={6}
      title="Calificar servicio"
      phase={7}
      links={[{ href: '/inicio', label: 'Volver al inicio' }]}
    />
  );
}
