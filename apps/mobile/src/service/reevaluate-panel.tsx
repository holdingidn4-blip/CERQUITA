import {
  formatMoney,
  materialsTotal,
  MATERIALS_PROVIDER_LABELS,
  parseSolesToCents,
  type MaterialItem,
  type MaterialsProvider,
} from '@cerquita/shared';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { supabase } from '@/lib/supabase';
import { BreakdownCard } from '@/service/breakdown-card';
import type { ServiceJob } from '@/service/use-service';
import { colors, fonts, radii } from '@/theme';

type CatalogItem = {
  id: string;
  name: string;
  brand: string;
  store: string;
  unit: string;
  reference_price_cents: number;
};
const STORE_LABELS: Record<string, string> = {
  promart: 'Promart',
  sodimac: 'Sodimac',
  ferreteria: 'Ferretería',
  otro: 'Otro',
};

/** “Reevaluar en sitio”: mano de obra revisada + materiales (catálogo o manual) + quién los pone. */
export function ReevaluatePanel({ job, onDone }: { job: ServiceJob; onDone: () => void }) {
  const [labor, setLabor] = useState(String((job.labor_cents ?? job.final_price_cents ?? 0) / 100));
  const [provider, setProvider] = useState<MaterialsProvider>('client');
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const laborCents = parseSolesToCents(labor) ?? 0;
  const materials = provider === 'pro' ? materialsTotal(items) : 0;

  async function search(text: string) {
    setQuery(text);
    if (text.trim().length < 2) return setResults([]);
    const q = `%${text.trim()}%`;
    const { data } = await supabase
      .from('materials_catalog')
      .select('id, name, brand, store, unit, reference_price_cents')
      .or(`name.ilike.${q},brand.ilike.${q}`)
      .limit(6);
    setResults(data ?? []);
  }

  function add(item: MaterialItem) {
    setItems((prev) => [...prev, item]);
    setQuery('');
    setResults([]);
  }

  function addManual() {
    const cents = parseSolesToCents(manualPrice);
    if (manualName.trim().length < 2 || !cents)
      return setError('Escribe el material y su precio (según boleta).');
    add({ name: manualName.trim(), qty: 1, unit_cents: cents });
    setManualName('');
    setManualPrice('');
    setError(null);
  }

  async function uploadReceipt() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (r.canceled || !r.assets[0]) return;
    const asset = r.assets[0];
    const ext = (asset.mimeType?.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg');
    const path = `${job.id}/boleta-${Date.now().toString(36)}.${ext}`;
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const { error: e } = await supabase.storage
      .from('material-receipts')
      .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg' });
    if (e) return setError('No pudimos subir la boleta.');
    setReceipt(path);
  }

  async function submit() {
    if (laborCents <= 0) return setError('Escribe la mano de obra revisada.');
    if (provider === 'pro' && materials > 0 && !receipt)
      return setError('Sube la foto de la boleta de los materiales.');
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('propose_reevaluation', {
      p_job: job.id,
      p_labor_cents: laborCents,
      p_materials_by: provider,
      p_items: provider === 'pro' ? items : [],
      p_receipt_path: receipt ?? undefined,
    });
    setBusy(false);
    if (e) return setError(e.message);
    onDone();
  }

  return (
    <View style={styles.wrap} testID="reevaluar">
      <Text style={styles.h2}>Reevaluar en sitio</Text>
      <Text style={styles.secondary}>
        El cliente verá el desglose y decide. La comisión solo se cobra sobre la mano de obra.
      </Text>
      <Text style={styles.label} nativeID="labor-label">
        Mano de obra revisada (S/)
      </Text>
      <TextInput
        accessibilityLabelledBy="labor-label"
        style={styles.input}
        value={labor}
        onChangeText={setLabor}
        keyboardType="decimal-pad"
      />
      <View
        style={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel="Quién pone los materiales"
      >
        {(['client', 'pro'] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="radio"
            accessibilityState={{ selected: provider === p }}
            onPress={() => setProvider(p)}
            style={[styles.chip, provider === p && styles.chipOn]}
          >
            <Text style={[styles.chipText, provider === p && styles.chipTextOn]}>
              {MATERIALS_PROVIDER_LABELS[p]}
            </Text>
          </Pressable>
        ))}
      </View>
      {provider === 'pro' && (
        <>
          <TextInput
            accessibilityLabel="Buscar en el catálogo"
            style={styles.input}
            value={query}
            onChangeText={search}
            placeholder="Buscar material (Promart, Sodimac, ferretería)"
            placeholderTextColor={colors.textSecondary}
          />
          {results.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              style={styles.result}
              onPress={() =>
                add({
                  name: `${r.brand} ${r.name}`,
                  qty: 1,
                  unit_cents: r.reference_price_cents,
                  catalog_id: r.id,
                  store: STORE_LABELS[r.store] ?? r.store,
                })
              }
            >
              <Text style={styles.body}>
                {r.brand} {r.name}
              </Text>
              <Text style={styles.secondary}>
                {STORE_LABELS[r.store]} · {formatMoney(r.reference_price_cents, job.currency_code)}{' '}
                / {r.unit} (referencia)
              </Text>
            </Pressable>
          ))}
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="Material manual"
              style={[styles.input, styles.flex]}
              value={manualName}
              onChangeText={setManualName}
              placeholder="Otro material"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              accessibilityLabel="Precio según boleta"
              style={[styles.input, styles.price]}
              value={manualPrice}
              onChangeText={setManualPrice}
              placeholder="S/"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
            <Button variant="outline" label="Agregar" onPress={addManual} />
          </View>
          {items.map((it, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.body, styles.flex]}>{it.name}</Text>
              <Pressable
                accessibilityLabel={`Menos ${it.name}`}
                onPress={() =>
                  setItems((p) =>
                    p.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)),
                  )
                }
              >
                <Text style={styles.qtyBtn}>−</Text>
              </Pressable>
              <Text style={styles.body}>{it.qty}</Text>
              <Pressable
                accessibilityLabel={`Más ${it.name}`}
                onPress={() =>
                  setItems((p) => p.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))
                }
              >
                <Text style={styles.qtyBtn}>+</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Quitar ${it.name}`}
                onPress={() => setItems((p) => p.filter((_, j) => j !== i))}
              >
                <Text style={styles.remove}>Quitar</Text>
              </Pressable>
            </View>
          ))}
          {materials > 0 && (
            <Button
              variant="outline"
              label={receipt ? 'Boleta subida ✓' : 'Subir foto de la boleta'}
              onPress={uploadReceipt}
            />
          )}
        </>
      )}
      <BreakdownCard
        laborCents={laborCents}
        materialsCents={materials}
        provider={provider}
        items={provider === 'pro' ? items : []}
        currency={job.currency_code}
        rateBps={job.commission_rate_bps}
      />
      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      <Button label="Enviar reevaluación al cliente" loading={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, backgroundColor: '#F1EEE6', borderRadius: radii.lg, padding: 14 },
  h2: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.text },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.text },
  secondary: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  body: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  input: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
    minWidth: 0,
  },
  price: { width: 80 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { gap: 8 },
  chip: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#D5D0C3',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: colors.surface },
  result: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyBtn: { fontFamily: fonts.display, fontSize: 20, color: colors.primary, paddingHorizontal: 6 },
  remove: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.danger },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: 12,
  },
});
