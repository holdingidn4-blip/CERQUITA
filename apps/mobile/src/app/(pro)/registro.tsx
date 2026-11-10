import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function Registro() {
  return (
    <PlaceholderScreen
      screenNumber={9}
      title="Registro del profesional"
      phase={4}
      links={[{ href: '/ajustes', label: 'Cuenta y privacidad' }]}
    />
  );
}
