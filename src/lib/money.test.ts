import { describe, it, expect } from 'vitest';
import {
  toMinorUnits,
  toMajorUnits,
  addMoney,
  subtractMoney,
  sumMoney,
  compareMoney,
  multiplyMoney,
} from './money';

describe('money helpers (B6)', () => {
  describe('toMinorUnits', () => {
    it('converts major units to integer cents without float error', () => {
      expect(toMinorUnits(19.99)).toBe(1999);
      expect(toMinorUnits(0.1 + 0.2)).toBe(30);
      expect(toMinorUnits('12.345')).toBe(1235); // rounds halfway
      expect(toMinorUnits(0)).toBe(0);
    });

    it('handles null/undefined/NaN as zero', () => {
      expect(toMinorUnits(null)).toBe(0);
      expect(toMinorUnits(undefined)).toBe(0);
      expect(toMinorUnits('abc')).toBe(0);
      expect(toMinorUnits(Number.NaN)).toBe(0);
    });
  });

  describe('toMajorUnits', () => {
    it('formats cents as a 2-decimal string', () => {
      expect(toMajorUnits(1999)).toBe('19.99');
      expect(toMajorUnits(0)).toBe('0.00');
      expect(toMajorUnits(-50)).toBe('-0.50');
    });

    it('handles null/undefined/NaN as 0.00', () => {
      expect(toMajorUnits(null)).toBe('0.00');
      expect(toMajorUnits(undefined)).toBe('0.00');
      expect(toMajorUnits(Number.NaN)).toBe('0.00');
    });
  });

  describe('addMoney / subtractMoney', () => {
    it('adds without floating point drift', () => {
      expect(addMoney(0.1, 0.2)).toBe(0.3);
      expect(addMoney(10.99, 0.01)).toBe(11.0);
      expect(addMoney(5, -2.5)).toBe(2.5);
    });

    it('subtracts without floating point drift', () => {
      expect(subtractMoney(0.3, 0.1)).toBe(0.2);
      expect(subtractMoney(10, 0.1 + 0.2)).toBe(9.7);
      expect(subtractMoney(5, 7)).toBe(-2);
    });
  });

  describe('sumMoney', () => {
    it('sums an array without drift', () => {
      expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
      expect(sumMoney([])).toBe(0);
      expect(sumMoney([1.99, 2.01])).toBe(4);
    });
  });

  describe('compareMoney', () => {
    it('returns a signed cent delta', () => {
      expect(compareMoney(1.0, 1.0)).toBe(0);
      expect(compareMoney(2.0, 1.0)).toBe(100);
      expect(compareMoney(1.0, 2.0)).toBe(-100);
      expect(compareMoney(0.3, 0.1 + 0.2)).toBe(0);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies in minor units and rounds to cent', () => {
      expect(multiplyMoney(1.5, 2)).toBe(3);
      expect(multiplyMoney(0.1, 3)).toBe(0.3);
      expect(multiplyMoney(2.005, 1)).toBe(2.01);
    });
  });
});
