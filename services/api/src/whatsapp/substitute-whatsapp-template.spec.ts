import { substituteWhatsappTemplate } from './substitute-whatsapp-template';

describe('substituteWhatsappTemplate', () => {
  it('replaces known placeholders', () => {
    const out = substituteWhatsappTemplate(
      'Hi {clientName}, at {bookingDate}',
      {
        clientName: 'Sara',
        bookingDate: '2026-05-10',
      },
    );
    expect(out).toBe('Hi Sara, at 2026-05-10');
  });

  it('replaces double-brace placeholders', () => {
    const out = substituteWhatsappTemplate(
      'Hi {{clientName}}, at {{bookingDate}}',
      {
        clientName: 'Sara',
        bookingDate: '2026-05-10',
      },
    );
    expect(out).toBe('Hi Sara, at 2026-05-10');
  });

  it('leaves unknown placeholders unchanged', () => {
    const out = substituteWhatsappTemplate('x {unknown} y', {
      clientName: 'A',
    });
    expect(out).toBe('x {unknown} y');
  });
});
