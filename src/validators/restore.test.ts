import { describe, it, expect } from 'vitest';
import {
  BareRestoreStateSchema,
  LedgerExportV1Schema,
  LedgerRestorePayloadSchema
} from './index';

const validEnvelope = {
  version: 'EM_BUDGET_SECURE_EX_V1',
  exportedBy: 'someone@example.com',
  exportedAt: '2026-01-01T00:00:00.000Z',
  data: { transactions: [{ id: 't1' }], cashAccounts: [] }
};

describe('LedgerExportV1Schema', () => {
  it('accepts a well-formed v1 envelope', () => {
    expect(LedgerExportV1Schema.safeParse(validEnvelope).success).toBe(true);
  });

  it('rejects a wrong version literal', () => {
    const mismatched = { ...validEnvelope, version: 'EM_BUDGET_SECURE_EX_V0' };
    expect(LedgerExportV1Schema.safeParse(mismatched).success).toBe(false);
  });

  it('rejects an envelope whose data is not an object', () => {
    expect(LedgerExportV1Schema.safeParse({ ...validEnvelope, data: 42 }).success).toBe(false);
  });

  it('rejects an envelope with a non-array collection', () => {
    expect(
      LedgerExportV1Schema.safeParse({ ...validEnvelope, data: { transactions: {} } }).success
    ).toBe(false);
  });
});

describe('BareRestoreStateSchema', () => {
  it('accepts a bare object with the three critical collections as arrays', () => {
    const bare = { cashAccounts: [], cards: [], transactions: [] };
    expect(BareRestoreStateSchema.safeParse(bare).success).toBe(true);
  });

  it('rejects a bare object missing the critical collections', () => {
    expect(BareRestoreStateSchema.safeParse({ budgets: [] }).success).toBe(false);
  });

  it('rejects a bare object whose collections are not arrays', () => {
    expect(
      BareRestoreStateSchema.safeParse({ cashAccounts: {}, cards: [], transactions: [] }).success
    ).toBe(false);
  });
});

describe('LedgerRestorePayloadSchema (mismatched-version import)', () => {
  it('accepts the valid v1 envelope', () => {
    expect(LedgerRestorePayloadSchema.safeParse(validEnvelope).success).toBe(true);
  });

  it('rejects an envelope with an old version and no bare collections', () => {
    const oldEnvelope = { version: 'EM_BUDGET_SECURE_EX_V0', data: { transactions: [] } };
    expect(LedgerRestorePayloadSchema.safeParse(oldEnvelope).success).toBe(false);
  });

  it('rejects a bare object missing the critical collections', () => {
    expect(LedgerRestorePayloadSchema.safeParse({ budgets: [] }).success).toBe(false);
  });

  it('rejects an empty object (anti-wipe guard)', () => {
    expect(LedgerRestorePayloadSchema.safeParse({}).success).toBe(false);
  });

  it('rejects non-object payloads', () => {
    expect(LedgerRestorePayloadSchema.safeParse(null).success).toBe(false);
    expect(LedgerRestorePayloadSchema.safeParse(undefined).success).toBe(false);
    expect(LedgerRestorePayloadSchema.safeParse(42).success).toBe(false);
    expect(LedgerRestorePayloadSchema.safeParse('export').success).toBe(false);
    expect(LedgerRestorePayloadSchema.safeParse([]).success).toBe(false);
  });

  it('reports a parse error message instead of throwing', () => {
    const result = LedgerRestorePayloadSchema.safeParse({ version: 'nope' });
    expect(result.success).toBe(false);
  });
});