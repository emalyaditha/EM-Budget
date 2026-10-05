import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { Train } from 'lucide-react';
import { ServiceIcon, serviceDomain, serviceGlyph } from './ServiceIcon';

describe('serviceDomain', () => {
  it('resolves a brand regardless of case, spacing or punctuation', () => {
    for (const name of ['YouTube', 'youtube', 'You tube', 'You Tube', 'you-tube', '  YOUTUBE  ']) {
      expect(serviceDomain(name), name).toBe('youtube.com');
    }
  });

  it('resolves a known brand inside a longer label', () => {
    expect(serviceDomain('Spotify Family')).toBe('spotify.com');
    expect(serviceDomain('You tube premium')).toBe('youtube.com');
    expect(serviceDomain('Adobe CC')).toBe('adobe.com');
  });

  it('resolves the local brands the ledger actually holds', () => {
    expect(serviceDomain('AIA Insurance')).toBe('www.aialife.com.lk');
    expect(serviceDomain('aia insurance policy')).toBe('www.aialife.com.lk');
    expect(serviceDomain('AIA')).toBe('www.aialife.com.lk');
    expect(serviceDomain('Domain Payment')).toBe('spaceship.com');
    expect(serviceDomain('domain payment - spaceship')).toBe('spaceship.com');
  });

  it('returns null when no brand is known, so no lookup is attempted', () => {
    expect(serviceDomain('Landlord rent')).toBeNull();
    expect(serviceDomain('')).toBeNull();
    expect(serviceDomain('කුලික ගෙවීම')).toBeNull();
  });

  it('does not let a short brand swallow an unrelated name', () => {
    expect(serviceDomain('Maxi Cab monthly')).toBeNull();
    expect(serviceDomain('Awesome studio')).toBeNull();
  });
});

describe('serviceGlyph', () => {
  it('falls back to a neutral glyph when the real logo is unreachable', () => {
    expect(serviceDomain('Train Season')).toBeNull();
    expect(serviceGlyph('Train Season')).toBe(Train);
    expect(serviceGlyph('Sri Lankan Railways')).toBe(Train);
  });

  it('leaves genuinely unknown names to the ? mark', () => {
    expect(serviceGlyph('Landlord rent')).toBeNull();
    expect(serviceGlyph('Netflix')).toBeNull();
  });
});

describe('ServiceIcon', () => {
  it('renders the fetched logo for a known brand', () => {
    const { container } = render(<ServiceIcon name="You tube" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('domain=youtube.com');
  });

  it('walks to the site favicon, then to the ? mark, when the icon service fails', () => {
    const { container } = render(<ServiceIcon name="AIA Insurance" />);
    expect(container.querySelector('img')?.getAttribute('src')).toContain('domain=www.aialife.com.lk');
    // Each source is a new key, so the node is replaced rather than mutated.
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://www.aialife.com.lk/favicon.ico');
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('svg[aria-label="No logo found for AIA Insurance"]')).toBeTruthy();
  });

  it('renders a neutral glyph where no logo is published', () => {
    const { container } = render(<ServiceIcon name="Train Season" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg[aria-label="Train Season"]')).toBeTruthy();
  });

  it('renders the ? mark for a name it cannot understand', () => {
    const { container } = render(<ServiceIcon name="Landlord rent" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg[aria-label="No logo found for Landlord rent"]')).toBeTruthy();
  });
});
