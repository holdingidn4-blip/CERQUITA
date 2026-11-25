import { describe, expect, it } from 'vitest';

import { customSpecialtyError, filterCatalog, normalizeSearch } from './catalog';

const items = [
  { name: 'Fugas de agua', searchTerms: 'caño gotea goteo filtración' },
  { name: 'Tuberías empotradas', searchTerms: 'tubería pared rotura picado' },
  { name: 'Instalación de gas', searchTerms: 'balón glp cocina gas natural' },
  { name: 'Desatoro de desagües' },
];

describe('búsqueda en el catálogo', () => {
  it('ignora tildes, mayúsculas y signos', () => {
    expect(normalizeSearch('  Tuberías, EMPOTRADAS! ')).toBe('tuberias empotradas');
  });
  it('sin texto devuelve todo', () => {
    expect(filterCatalog(items, '   ')).toHaveLength(4);
  });
  it('busca por nombre sin tildes', () => {
    expect(filterCatalog(items, 'tuberias').map((i) => i.name)).toEqual(['Tuberías empotradas']);
  });
  it('busca por palabras de búsqueda', () => {
    expect(filterCatalog(items, 'balon').map((i) => i.name)).toEqual(['Instalación de gas']);
  });
  it('todas las palabras deben aparecer, en cualquier orden', () => {
    expect(filterCatalog(items, 'caño fuga').map((i) => i.name)).toEqual(['Fugas de agua']);
    expect(filterCatalog(items, 'caño gas')).toEqual([]);
  });
  it('acepta la ñ', () => {
    expect(filterCatalog(items, 'caño')).toHaveLength(1);
  });
  it('sin palabras de búsqueda usa solo el nombre', () => {
    expect(filterCatalog(items, 'desague').map((i) => i.name)).toEqual(['Desatoro de desagües']);
  });
});

describe('otro trabajo', () => {
  it('pide de 3 a 60 letras', () => {
    expect(customSpecialtyError(' ab ')).toMatch(/3 letras/);
    expect(customSpecialtyError('x'.repeat(61))).toMatch(/60/);
    expect(customSpecialtyError('Paneles solares')).toBeNull();
  });
});
