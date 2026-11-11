import { timeAgo } from '@cerquita/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/server';

import styles from '../panel.module.css';

export const metadata: Metadata = { title: 'Buscar · Cerquita Panel' };

export default async function Buscar({ searchParams }: PageProps<'/buscar'>) {
  const { q } = await searchParams;
  const query = typeof q === 'string' ? q : '';
  const supabase = await createClient();
  const { data } =
    query.length >= 2 ? await supabase.rpc('admin_search', { p_query: query }) : { data: [] };
  return (
    <>
      <h1 className={styles.h1}>Buscar usuarios y pedidos</h1>
      <form className={styles.inlineForm}>
        <input
          name="q"
          defaultValue={query}
          placeholder="Nombre, celular, descripción o ID"
          aria-label="Buscar"
          className={styles.smallInput}
          autoFocus
        />
        <button className={styles.primary}>Buscar</button>
      </form>
      {query.length >= 2 && (data ?? []).length === 0 && (
        <p className={styles.muted}>Sin resultados.</p>
      )}
      <ul className={styles.queue}>
        {(data ?? []).map((r) => (
          <li key={`${r.kind}-${r.id}`}>
            <Link
              href={r.kind === 'user' ? `/usuarios/${r.id}` : `/pedidos/${r.id}`}
              className={styles.queueItem}
              data-testid="resultado"
            >
              <span className={styles.queueTitle}>
                {r.kind === 'user' ? '👤' : '🧰'} {r.title}
              </span>
              <span className={styles.muted}>
                {r.subtitle} · {timeAgo(r.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
