import { describe, expect, it } from 'vitest';
import {
  homeRouteFor,
  initials,
  isValidOtp,
  maskPhone,
  normalizePeruMobile,
  staffRoleFrom,
} from './auth';

describe('normalizePeruMobile', () => {
  it.each([
    ['987654321', '+51987654321'],
    ['987 654 321', '+51987654321'],
    ['987-654-321', '+51987654321'],
    ['51987654321', '+51987654321'],
    ['+51 987 654 321', '+51987654321'],
    ['(+51) 987654321', '+51987654321'],
  ])('%s → %s', (input, expected) => expect(normalizePeruMobile(input)).toBe(expected));

  it.each(['', '12345678', '887654321', '98765432', '9876543210', '+52987654321', 'abc'])(
    '%s no es un celular peruano',
    (input) => expect(normalizePeruMobile(input)).toBeNull(),
  );
});

describe('maskPhone', () => {
  it('oculta los dígitos del medio', () => {
    expect(maskPhone('+51987654452')).toBe('+51 9** *** 452');
    expect(maskPhone('51987654452')).toBe('+51 9** *** 452');
  });
  it('devuelve vacío si no hay teléfono válido', () => {
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('123')).toBe('');
  });
});

describe('isValidOtp', () => {
  it('exige 6 dígitos', () => {
    expect(isValidOtp('123456')).toBe(true);
    expect(isValidOtp('12345')).toBe(false);
    expect(isValidOtp('1234567')).toBe(false);
    expect(isValidOtp('12a456')).toBe(false);
  });
});

describe('staffRoleFrom', () => {
  it('lee roles válidos', () => {
    expect(staffRoleFrom({ staff_role: 'reviewer' })).toBe('reviewer');
    expect(staffRoleFrom({ staff_role: 'admin', provider: 'phone' })).toBe('admin');
  });
  it('ignora valores desconocidos', () => {
    expect(staffRoleFrom({ staff_role: 'superuser' })).toBeNull();
    expect(staffRoleFrom({})).toBeNull();
    expect(staffRoleFrom(null)).toBeNull();
    expect(staffRoleFrom('admin')).toBeNull();
  });
});

describe('homeRouteFor', () => {
  it('cliente va al inicio', () => expect(homeRouteFor('client', false)).toBe('/inicio'));
  it('pro sin oficios va al registro', () => expect(homeRouteFor('pro', false)).toBe('/registro'));
  it('pro con oficios va a solicitudes', () =>
    expect(homeRouteFor('pro', true)).toBe('/solicitudes'));
});

describe('initials', () => {
  it.each([
    ['Rosa Vargas', 'RV'],
    ['rosa maría vargas', 'RV'],
    ['Pedro', 'P'],
    ['  ', ''],
    [null, ''],
  ])('%s → %s', (input, expected) => expect(initials(input)).toBe(expected));
});
