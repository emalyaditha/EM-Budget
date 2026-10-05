import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { CardFace } from './CardFace';

afterEach(cleanup);

describe('CardFace money', () => {
  it('renders a liability as an amount owed, without a sign', () => {
    const { container } = render(
      <CardFace
        bankName="Commercial Bank"
        balance={Math.abs(-38420)}
        owed
        currency="Rs."
        cardNumber="4111 1111 1111 2222"
      />,
    );
    expect(container.textContent).toContain('Owed');
    expect(container.textContent).toContain('Rs.38,420');
    expect(container.textContent).not.toContain('-');
    expect(container.textContent).toContain('2222');
  });

  it('rounds the balance for display but keeps the currency prefix', () => {
    const { container } = render(<CardFace bankName="NDB" balance={1234.56} currency="Rs." />);
    expect(container.textContent).toContain('Rs.1,235');
  });
});

describe('CardFace sizing', () => {
  it('keeps the 250px floor by default', () => {
    const { container } = render(<CardFace bankName="NDB" balance={1} currency="Rs." />);
    expect((container.firstElementChild as HTMLElement).style.minWidth).toBe('250px');
  });

  it('drops the floor when fluid so a face fits a 320px hero', () => {
    const { container } = render(<CardFace fluid bankName="NDB" balance={1} currency="Rs." />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.style.minWidth).toBe('0px');
    expect(el.style.width).toBe('100%');
  });
});
