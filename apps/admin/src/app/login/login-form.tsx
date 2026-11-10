'use client';

import { isValidOtp, maskPhone, normalizePeruMobile, OTP_LENGTH } from '@cerquita/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { createClient } from '@/lib/supabase/client';

import styles from './login.module.css';

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [rawPhone, setRawPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const phone = normalizePeruMobile(rawPhone);

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    if (!phone) return setError('Escribe un celular de 9 dígitos que empiece con 9.');
    setBusy(true);
    setError(null);
    const { error: otpError } = await createClient().auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (otpError)
      return setError('No pudimos enviar el código. ¿El número tiene cuenta de soporte?');
    setStep('code');
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!phone || !isValidOtp(code))
      return setError(`Escribe los ${OTP_LENGTH} dígitos del código.`);
    setBusy(true);
    setError(null);
    const { error: verifyError } = await createClient().auth.verifyOtp({
      phone,
      token: code,
      type: 'sms',
    });
    setBusy(false);
    if (verifyError) return setError('El código venció o no es correcto.');
    router.replace('/');
    router.refresh();
  }

  return step === 'phone' ? (
    <form onSubmit={sendCode} className={styles.form}>
      <label className={styles.label}>
        Número de celular
        <span className={styles.phoneRow}>
          <span className={styles.prefix}>+51</span>
          <input
            className={styles.input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="9XX XXX XXX"
            value={rawPhone}
            onChange={(e) => setRawPhone(e.target.value)}
            required
          />
        </span>
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.button} disabled={busy}>
        {busy ? 'Enviando…' : 'Recibir código por SMS'}
      </button>
    </form>
  ) : (
    <form onSubmit={verify} className={styles.form}>
      <label className={styles.label}>
        Código enviado al {maskPhone(phone)}
        <input
          className={`${styles.input} ${styles.code}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus
          required
        />
      </label>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button className={styles.button} disabled={busy || code.length < OTP_LENGTH}>
        {busy ? 'Verificando…' : 'Ingresar'}
      </button>
      <button type="button" className={styles.link} onClick={() => setStep('phone')}>
        Cambiar número
      </button>
    </form>
  );
}
