import { Tabs } from 'expo-router';

import { NavIcon, type NavIconName } from '@/components/nav-icon';
import { colors, fonts } from '@/theme';

const TABS: { name: string; title: string; icon: NavIconName }[] = [
  { name: 'solicitudes', title: 'Inicio', icon: 'inicio' },
  { name: 'trabajos', title: 'Pedidos', icon: 'pedidos' },
  { name: 'comision', title: 'Ganancias', icon: 'ganancias' },
  { name: 'capacitaciones', title: 'Cursos', icon: 'capacitaciones' },
  { name: 'oficios', title: 'Perfil', icon: 'perfil' },
];

/** Barra inferior del profesional: cinco secciones claras con ícono y texto. */
export default function ProTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodySemibold, fontSize: 12 },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarAccessibilityLabel: t.title,
            tabBarIcon: ({ color }) => <NavIcon name={t.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
