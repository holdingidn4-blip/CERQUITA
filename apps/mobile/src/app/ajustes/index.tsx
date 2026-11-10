import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function Ajustes() {
  return (
    <PlaceholderScreen
      screenNumber={19}
      title="Cuenta y privacidad"
      phase={3}
      links={[{ href: '/ajustes/contactos', label: 'Contactos de confianza' }]}
    />
  );
}
