/**
 * Whether the visitor is on a phone or a tablet: the AI is slower there and may run out of
 * memory. iPads say they are Macs, but have a touch screen.
 */
export function isPhone(): boolean {
  if (typeof navigator === 'undefined') return false;
  const agent = navigator.userAgent;
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  return !!hints?.mobile || /Android|iPhone|iPad|iPod|Mobi/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}
