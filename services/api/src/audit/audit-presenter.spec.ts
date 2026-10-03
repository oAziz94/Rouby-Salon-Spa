import {
  KNOWN_ACTIONS,
  buildChanges,
  buildSummary,
  categoryFor,
  deriveSeverity,
  extractReason,
  formatCairoInstant,
  isOverrideAction,
  parseAuditDateBound,
  readableFromCode,
  titleFor,
  type EntryFacts,
} from './audit-presenter';

const base = (over: Partial<EntryFacts> = {}): EntryFacts => ({
  actorName: 'Nadine Samir',
  oldValue: null,
  newValue: null,
  ...over,
});

describe('titleFor / readableFromCode', () => {
  it('gives every known action a short human title', () => {
    for (const action of KNOWN_ACTIONS) {
      const title = titleFor(action);
      expect(title).not.toMatch(/[._]/);
      expect(title.split(' ').length).toBeLessThanOrEqual(6);
    }
    expect(titleFor('payment.voided')).toBe('Payment voided');
  });

  it('makes a readable title from an unknown action code', () => {
    expect(titleFor('booking.status_changed')).toBe('Booking status changed');
    expect(readableFromCode('cashDrawer.opened')).toBe('Cash drawer opened');
    expect(titleFor('legacy_thing.did-it')).toBe('Legacy thing did it');
  });
});

describe('categoryFor / isOverrideAction', () => {
  it.each([
    ['payment.recorded', 'money'],
    ['payment.voided', 'money'],
    ['invoice.generated', 'money'],
    ['cashDrawer.closed', 'money'],
    ['dailyClosing.closed', 'money'],
    ['loyalty.points_adjusted', 'money'],
    ['booking.discount_applied', 'money'],
    ['visit.closed_with_balance', 'money'],
    ['override.slot_full', 'overrides'],
    ['override.staff_start', 'overrides'],
    ['booking.confirmed', 'bookings'],
    ['queue.started', 'bookings'],
    ['slot.deleted', 'bookings'],
    ['booking_change_request.created', 'bookings'],
    ['user.role_changed', 'staff_users'],
    ['user.session_reuse_detected', 'staff_users'],
    ['settings.vat.updated', 'settings'],
    ['payment.policy.updated', 'settings'],
    ['service.price_changed', 'settings'],
    ['whatsappTemplate.updated', 'settings'],
    ['websiteContent.section_updated', 'settings'],
  ])('%s is %s', (action, category) => {
    expect(categoryFor(action)).toBe(category);
  });

  it('falls back to the module for unknown actions', () => {
    expect(categoryFor('something.new', 'bookings')).toBe('bookings');
    expect(categoryFor('something.new')).toBe('settings');
  });

  it('flags overrides on top of the main category', () => {
    expect(isOverrideAction('override.slot_full')).toBe(true);
    expect(isOverrideAction('visit.closed_with_balance')).toBe(true);
    expect(isOverrideAction('booking.confirmed')).toBe(false);
  });
});

describe('deriveSeverity', () => {
  it.each([
    'payment.voided',
    'payment.updated',
    'override.slot_full',
    'override.staff_start',
    'loyalty.points_adjusted',
    'slot.deleted',
    'user.role_changed',
  ])('%s is at least WARNING', (action) => {
    expect(['WARNING', 'CRITICAL']).toContain(deriveSeverity(action));
  });

  it('treats user deactivation as CRITICAL and keeps a higher stored severity', () => {
    expect(deriveSeverity('user.deactivated')).toBe('CRITICAL');
    expect(deriveSeverity('booking.confirmed')).toBe('INFO');
    expect(deriveSeverity('booking.confirmed', 'WARNING')).toBe('WARNING');
    expect(deriveSeverity('payment.voided', 'INFO')).toBe('WARNING');
  });
});

describe('buildSummary', () => {
  it('describes an override with who, what, on whom and the reason', () => {
    const text = buildSummary(
      'override.staff_start',
      base({
        client: 'Mona Ali',
        serviceName: 'Hair Cut',
        staffName: 'Reema',
        newValue: {
          reason: 'covering for a colleague',
          issues: [{ code: 'STAFF_NOT_QUALIFIED', message: 'x' }],
        },
      }),
    );
    expect(text).toBe(
      'Nadine started Hair Cut for Mona Ali with Reema, who is not linked to this service. Reason: covering for a colleague.',
    );
  });

  it('shows a payment change with amounts and the invoice number', () => {
    const text = buildSummary(
      'payment.updated',
      base({
        actorName: 'Ghada Hassan',
        invoiceNumber: 'INV-2026-000012',
        oldValue: { amount: 300 },
        newValue: { amount: 1 },
      }),
    );
    expect(text).toBe(
      'Ghada changed a payment on invoice INV-2026-000012 from EGP 300 to EGP 1.',
    );
  });

  it('names the client and the slot time on a confirmation', () => {
    expect(
      buildSummary(
        'booking.confirmed',
        base({ client: 'Mona Ali', bookingWhen: 'Fri 9 Oct, 1:00 PM' }),
      ),
    ).toBe('Nadine confirmed the booking of Mona Ali for Fri 9 Oct, 1:00 PM.');
  });

  it('falls back to the booking reference when the client is unknown', () => {
    expect(
      buildSummary('booking.cancelled', base({ bookingRef: 'RB-1A2B3C4D' })),
    ).toBe('Nadine cancelled booking RB-1A2B3C4D.');
  });

  it('writes a website booking without an actor as the client', () => {
    expect(
      buildSummary(
        'booking.created',
        base({
          actorName: null,
          client: 'Mona Ali',
          bookingWhen: 'Sat 10 Oct, 2:00 PM',
        }),
      ),
    ).toBe('Mona Ali requested a booking for Sat 10 Oct, 2:00 PM.');
  });

  it('adds the reason to money overrides and discounts', () => {
    const text = buildSummary(
      'booking.discount_applied',
      base({
        client: 'Mona Ali',
        oldValue: { discountAmount: 0 },
        newValue: { discountAmount: 50, reason: 'loyal client' },
      }),
    );
    expect(text).toContain('from EGP 0 to EGP 50');
    expect(text).toMatch(/Reason: loyal client\.$/);
  });

  it('turns loyalty adjustments and role changes into sentences', () => {
    expect(
      buildSummary(
        'loyalty.points_adjusted',
        base({
          client: 'Mona Ali',
          newValue: { points: -20, note: 'mistake' },
        }),
      ),
    ).toBe('Nadine removed 20 loyalty points from Mona Ali. Reason: mistake.');
    expect(
      buildSummary(
        'user.role_changed',
        base({
          targetUser: 'Reema Adel',
          roleBefore: 'Receptionist',
          roleAfter: 'Manager',
        }),
      ),
    ).toBe("Nadine changed Reema Adel's role from Receptionist to Manager.");
  });

  it('never shows a raw code for an unknown action', () => {
    const text = buildSummary('booking.status_changed', base());
    expect(text).toBe('Nadine: booking status changed.');
    expect(text).not.toContain('booking.status_changed');
  });

  it('has a sentence for every known action', () => {
    for (const action of KNOWN_ACTIONS) {
      const text = buildSummary(action, base());
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toContain(action);
      expect(text).not.toContain('undefined');
      expect(text).not.toContain('null');
    }
  });
});

describe('extractReason', () => {
  it('finds the reason under the usual keys', () => {
    expect(extractReason({ reason: 'a' })).toBe('a');
    expect(extractReason({ note: 'b' })).toBe('b');
    expect(extractReason({ metadata: { reason: 'c' } })).toBe('c');
    expect(extractReason({ amount: 1 })).toBeNull();
  });
});

describe('buildChanges', () => {
  it('uses human names and formats money, booleans and ids', () => {
    const rows = buildChanges(
      { amount: 300, isActive: true, entityType: 'Payment', branchId: 'x' },
      {
        amount: 1,
        isActive: false,
        entityType: 'Payment',
        branchId: 'x',
        severity: 'WARNING',
        reason: 'typo',
        bookingId: '11111111-1111-4111-8111-111111111111',
        clientId: '22222222-2222-4222-8222-222222222222',
      },
      {
        booking: () => 'RB-11111111',
        invoice: () => null,
        client: () => 'Mona Ali',
        staff: () => null,
        user: () => null,
        role: () => null,
        branch: () => null,
        queue: () => null,
      },
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { field: 'Amount', before: 'EGP 300.00', after: 'EGP 1.00' },
        { field: 'Active', before: 'Yes', after: 'No' },
        { field: 'Booking', before: '', after: 'RB-11111111' },
        { field: 'Client', before: '', after: 'Mona Ali' },
      ]),
    );
    const fields = rows.map((r) => r.field);
    expect(fields).not.toContain('Entity type');
    expect(fields).not.toContain('Severity');
    expect(fields).not.toContain('Reason');
  });

  it('drops unresolved internal ids', () => {
    const rows = buildChanges(null, {
      staffProfileId: '33333333-3333-4333-8333-333333333333',
      points: 5,
    });
    expect(rows).toEqual([{ field: 'Points', before: '', after: '5' }]);
  });
});

describe('dates', () => {
  it('reads a calendar day as a Cairo day (winter UTC+2, summer UTC+3)', () => {
    expect(parseAuditDateBound('2026-01-15', 'from')?.toISOString()).toBe(
      '2026-01-14T22:00:00.000Z',
    );
    expect(parseAuditDateBound('2026-07-15', 'from')?.toISOString()).toBe(
      '2026-07-14T21:00:00.000Z',
    );
    expect(parseAuditDateBound('2026-01-15', 'to')?.toISOString()).toBe(
      '2026-01-15T21:59:59.999Z',
    );
  });

  it('passes full ISO instants through', () => {
    expect(
      parseAuditDateBound('2026-03-01T10:00:00.000Z', 'from')?.toISOString(),
    ).toBe('2026-03-01T10:00:00.000Z');
  });

  it('formats instants in Cairo time', () => {
    expect(formatCairoInstant('2026-10-09T10:00:00.000Z')).toBe(
      '9 Oct 2026, 1:00 PM',
    );
  });
});
