type AppLauncherLinkProps = { href?: string; locale?: 'nl' | 'en' };

export function AppLauncherLink({ href, locale = 'nl' }: AppLauncherLinkProps) {
  if (!href) return null;
  let destination: URL;
  try {
    destination = new URL(href);
  } catch {
    return null;
  }

  if ((destination.protocol !== 'http:' && destination.protocol !== 'https:')
    || destination.username || destination.password) return null;

  return (
    <a
      className="dr-app-launcher"
      href={destination.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={locale === 'nl' ? 'Apps (nieuw tabblad)' : 'Apps (new tab)'}
    >
      Apps <span aria-hidden="true">↗</span>
    </a>
  );
}
