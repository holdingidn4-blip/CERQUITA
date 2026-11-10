import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function Solicitudes() {
  return (
    <PlaceholderScreen
      screenNumber={7}
      title="Solicitudes cercanas"
      phase={5}
      links={[
        { href: '/oficios', label: 'Mis oficios y verificación' },
        { href: '/ajustes', label: 'Cuenta y privacidad' },
      ]}
    />
  );
}
