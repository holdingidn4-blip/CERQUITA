import type { Instrumentation } from 'next';

/**
 * Registro de errores del servidor del panel en formato JSON (lo recogen los logs del hosting o un drain).
 * Sin datos personales: solo ruta, método y mensaje.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string };
  console.error(
    JSON.stringify({
      level: 'error',
      app: 'cerquita-admin',
      message: err.message,
      digest: err.digest,
      path: request.path,
      method: request.method,
      routeType: context.routeType,
      at: new Date().toISOString(),
    }),
  );
};
