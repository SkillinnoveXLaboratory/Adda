import { api } from '../lib/api.js';
import { useQuery } from '../lib/hooks.js';
import { providerName } from '../lib/finance.js';
import { Badge, Icon } from './ui.jsx';

let configPromise = null;
/** `payments` from GET /public/config ({ gatewayConfigured, provider, mode }), fetched once per page load. */
export function usePaymentGateway() {
  const q = useQuery(() => {
    configPromise ||= api.get('/public/config', undefined, { auth: false }).catch((err) => {
      configPromise = null;
      throw err;
    });
    return configPromise;
  }, []);
  return q.data?.payments || null;
}

/** "Test mode" when the gateway runs in Cashfree sandbox (no real money moves). */
export function TestModeBadge({ mode, className = '' }) {
  if (mode !== 'sandbox') return null;
  return (
    <Badge tone="warning" className={className}>
      <Icon name="fa-solid fa-flask" className="mr-1 text-[9px]" />
      Test mode
    </Badge>
  );
}

/** "Cashfree" + Test mode badge, for headers and notices. */
export function GatewayLabel({ gateway, className = '' }) {
  if (!gateway?.gatewayConfigured) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-testid="gateway-label">
      <Badge tone="purple">{providerName(gateway.provider) || 'Payment gateway'}</Badge>
      <TestModeBadge mode={gateway.mode} />
    </span>
  );
}
