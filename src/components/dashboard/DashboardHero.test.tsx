import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DashboardHero } from './DashboardHero';

afterEach(cleanup);

function renderHero(todayOutflow: number) {
  return render(
    <DashboardHero currency="Rs." aggregateActiveWealth={1000} userName="Test User" todayOutflow={todayOutflow} />,
  );
}

describe('DashboardHero "Spent · today" pill', () => {
  it('shows the day total when expenses exist', () => {
    const { container } = renderHero(530);
    expect(container.textContent).toContain('Spent · today');
    expect(container.textContent).toContain('530');
    expect(container.textContent).not.toContain('No spend yet');
  });

  it('shows a placeholder when nothing was spent today', () => {
    const { container } = renderHero(0);
    expect(container.textContent).toContain('No spend yet');
  });

  it('keeps the month tiles intact', () => {
    const { container } = renderHero(120);
    expect(container.textContent).toContain('Income · month');
    expect(container.textContent).toContain('Spent · month');
  });
});
