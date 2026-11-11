import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

/** Errores y rendimiento en producción. Sin EXPO_PUBLIC_SENTRY_DSN no se envía nada (desarrollo y pruebas). */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export const monitoringEnabled = Boolean(dsn);

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'production',
    release: Constants.expoConfig?.version,
    tracesSampleRate: 0.2,
    // Nunca datos personales: sin IP, sin cuerpo de solicitudes.
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user?.ip_address;
      return event;
    },
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (dsn) Sentry.captureException(error, { extra: context });
}

/** Envuelve el layout raíz para capturar errores de render. */
export const withMonitoring = <P extends object>(component: React.ComponentType<P>) =>
  dsn
    ? (Sentry.wrap(
        component as React.ComponentType<Record<string, unknown>>,
      ) as unknown as React.ComponentType<P>)
    : component;
