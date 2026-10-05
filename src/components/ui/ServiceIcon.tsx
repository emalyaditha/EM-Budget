import { useState } from 'react';
import { HelpCircle, Train, type LucideIcon } from 'lucide-react';

/**
 * Only names we can resolve to a domain with certainty get a logo; anything
 * else renders the "?" mark rather than guessing a brand from free-text input.
 */
const SERVICE_DOMAINS: Record<string, string> = {
  netflix: 'netflix.com',
  spotify: 'spotify.com',
  'spotify premium': 'spotify.com',
  youtube: 'youtube.com',
  'youtube premium': 'youtube.com',
  'youtube music': 'music.youtube.com',
  'disney+': 'disneyplus.com',
  'disney plus': 'disneyplus.com',
  hulu: 'hulu.com',
  'hbo max': 'max.com',
  max: 'max.com',
  'prime video': 'primevideo.com',
  'amazon prime': 'amazon.com',
  'apple music': 'apple.com',
  icloud: 'icloud.com',
  'apple one': 'apple.com',
  chatgpt: 'openai.com',
  openai: 'openai.com',
  claude: 'claude.ai',
  anthropic: 'anthropic.com',
  gemini: 'gemini.google.com',
  copilot: 'github.com',
  adobe: 'adobe.com',
  'adobe cc': 'adobe.com',
  'creative cloud': 'adobe.com',
  canva: 'canva.com',
  figma: 'figma.com',
  notion: 'notion.so',
  slack: 'slack.com',
  discord: 'discord.com',
  'discord nitro': 'discord.com',
  zoom: 'zoom.us',
  teams: 'microsoft.com',
  'microsoft 365': 'microsoft.com',
  'office 365': 'microsoft.com',
  onedrive: 'onedrive.com',
  'google one': 'one.google.com',
  'google storage': 'one.google.com',
  workspace: 'workspace.google.com',
  'google workspace': 'workspace.google.com',
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  dropbox: 'dropbox.com',
  drive: 'drive.google.com',
  linkedin: 'linkedin.com',
  'linkedin premium': 'linkedin.com',
  'x premium': 'x.com',
  'twitter blue': 'x.com',
  'reddit premium': 'reddit.com',
  twitch: 'twitch.tv',
  'twitch turbo': 'twitch.tv',
  steam: 'steampowered.com',
  'epic games': 'epicgames.com',
  'playstation plus': 'playstation.com',
  'xbox game pass': 'xbox.com',
  'nintendo switch online': 'nintendo.com',
  audible: 'audible.com',
  kindle: 'amazon.com',
  audiobooks: 'audible.com',
  nytimes: 'nytimes.com',
  'new york times': 'nytimes.com',
  'the economist': 'economist.com',
  medium: 'medium.com',
  substack: 'substack.com',
  patreon: 'patreon.com',
  skillshare: 'skillshare.com',
  masterclass: 'masterclass.com',
  coursera: 'coursera.org',
  udemy: 'udemy.com',
  duolingo: 'duolingo.com',
  aws: 'aws.amazon.com',
  'amazon web services': 'aws.amazon.com',
  'google cloud': 'cloud.google.com',
  azure: 'azure.com',
  vercel: 'vercel.com',
  netlify: 'netlify.com',
  heroku: 'heroku.com',
  railway: 'railway.app',
  render: 'render.com',
  'fly.io': 'fly.io',
  supabase: 'supabase.com',
  firebase: 'firebase.google.com',
  digitalocean: 'digitalocean.com',
  vultr: 'vultr.com',
  linode: 'linode.com',
  hostinger: 'hostinger.com',
  namecheap: 'namecheap.com',
  godaddy: 'godaddy.com',
  spaceship: 'spaceship.com',
  'domain payment': 'spaceship.com',
  'domain renewal': 'spaceship.com',
  cloudflare: 'cloudflare.com',
  sentry: 'sentry.io',
  datadog: 'datadoghq.com',
  jira: 'atlassian.com',
  trello: 'trello.com',
  asana: 'asana.com',
  linear: 'linear.app',
  airtable: 'airtable.com',
  stripe: 'stripe.com',
  paypal: 'paypal.com',
  wise: 'wise.com',
  revolut: 'revolut.com',
  daraz: 'daraz.lk',
  'daraz lk': 'daraz.lk',
  pickme: 'pickme.lk',
  hireup: 'hireup.lk',
  aia: 'www.aialife.com.lk',
  'aia life': 'www.aialife.com.lk',
  'aia insurance': 'www.aialife.com.lk',
  'aia life insurance': 'www.aialife.com.lk',
  'uber one': 'uber.com',
  uber: 'uber.com',
  bolt: 'bolt.eu',
  grab: 'grab.com',
  zomato: 'zomato.com',
  swiggy: 'swiggy.com',
  blinkit: 'blinkit.com',
  tiktok: 'tiktok.com',
  pinterest: 'pinterest.com',
  'snapchat+': 'snapchat.com',
  messenger: 'facebook.com',
  'meta verified': 'facebook.com',
};

/**
 * Brands whose real logo is unreachable — Sri Lanka Railways publishes no
 * favicon and neither Google nor DuckDuckGo has one for it. A neutral category
 * glyph beats both a guessed logo and the "?" mark, because the service itself
 * is known even though its artwork is not.
 */
const SERVICE_GLYPHS: Record<string, LucideIcon> = {
  'train season': Train,
  'srilankan railways': Train,
};

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Drop spacing and punctuation so "You tube", "YouTube" and "you-tube" all agree. */
const squash = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Exact name, then the longest known brand appearing as whole words, then the
 * squashed whole name, then a squashed prefix — so "Spotify Family", "You tube"
 * and "AIA Policy" all resolve. Unknown names match nothing and cost no request.
 */
function buildResolver<V>(table: Record<string, V>) {
  const keysByLength = Object.keys(table).sort((a, b) => b.length - a.length);
  const squashed = new Map<string, V>();
  for (const [brand, value] of Object.entries(table)) {
    const key = squash(brand);
    if (key && !squashed.has(key)) squashed.set(key, value);
  }
  const squashedByLength = [...squashed.keys()].sort((a, b) => b.length - a.length);

  return (name: string): V | null => {
    const key = normalize(name);
    if (table[key] !== undefined) return table[key];

    const padded = ` ${key} `;
    const phrase = keysByLength.find((brand) => padded.includes(` ${brand} `));
    if (phrase !== undefined) return table[phrase];

    const flat = squash(key);
    if (squashed.has(flat)) return squashed.get(flat) ?? null;

    // Length floor keeps short brands like "max" or "aia" from swallowing
    // unrelated names that merely start with the same letters.
    const prefix = squashedByLength.find((brand) => brand.length >= 4 && flat.startsWith(brand));
    if (prefix !== undefined) return squashed.get(prefix) ?? null;

    const token = key
      .split(' ')
      .map(squash)
      .filter((part) => part.length >= 4 && squashed.has(part))
      .sort((a, b) => b.length - a.length)[0];
    return token === undefined ? null : (squashed.get(token) ?? null);
  };
}

export const serviceDomain = buildResolver(SERVICE_DOMAINS);
export const serviceGlyph = buildResolver(SERVICE_GLYPHS);

/**
 * Google's index is the fastest source but only carries high-traffic sites, so
 * regional brands (AIA Life Insurance Lanka) fall through to their own favicon.
 */
function iconSources(domain: string): string[] {
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    `https://${domain}/favicon.ico`,
  ];
}

export function ServiceIcon({ name, size = 22 }: { name: string; size?: number }) {
  const domain = serviceDomain(name);
  const Glyph = serviceGlyph(name);
  const [broken, setBroken] = useState<{ name: string; tier: number }>({ name, tier: 0 });
  const tier = broken.name === name ? broken.tier : 0;
  const src = domain ? iconSources(domain)[tier] : undefined;

  if (!src) {
    if (Glyph) {
      return <Glyph size={size - 4} role="img" aria-label={name} style={{ color: 'var(--ink-2)' }} />;
    }
    return (
      <HelpCircle
        size={size - 4}
        role="img"
        aria-label={`No logo found for ${name}`}
        style={{ color: 'var(--ink-3)' }}
      />
    );
  }

  return (
    <img
      key={src}
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setBroken({ name, tier: tier + 1 })}
      className="object-contain"
      style={{ width: size - 6, height: size - 6 }}
    />
  );
}
