import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function Inicio() {
  return (
    <PlaceholderScreen
      screenNumber={1}
      title="Inicio con mapa"
      phase={5}
      links={[{ href: '/ajustes', label: 'Cuenta y privacidad' }]}
    />
  );
}
