/** Omark Time's Settings page for the host this app runs on: staging goes to staging, the demo to the demo. */
export function timeSettingsUrl(host: string): string {
  const h = host.toLowerCase();
  if (h.startsWith('staging-tasks.')) return 'https://staging-time.omark.app/#settings';
  if (h.startsWith('demo-tasks.')) return 'https://demo-time.omark.app/#settings';
  return 'https://time.omark.app/#settings';
}
