import api from './api';

const qpv = (vc) => (vc ? `?parentVerticalCode=${encodeURIComponent(vc)}` : '');

export function adminAdapter(customerId) {
  return {
    loadMatrix: () => api.request(`/customers/${customerId}/module-matrix`).then(r => r.data),
    suspend: (mc, vc, reason) => api.request(
      `/customers/${customerId}/modules/${mc}/suspend${qpv(vc)}`,
      { method: 'PATCH', body: JSON.stringify({ reason: reason || null }) },
    ),
    unsuspend: (mc, vc) => api.request(
      `/customers/${customerId}/modules/${mc}/unsuspend${qpv(vc)}`,
      { method: 'PATCH' },
    ),
    extend: (mc, vc, days) => api.request(
      `/customers/${customerId}/modules/${mc}/extend${qpv(vc)}`,
      { method: 'PATCH', body: JSON.stringify({ days }) },
    ),
    changeTier: (mc, vc, tier, priceMXN) => api.request(
      `/customers/${customerId}/modules/${mc}/change-tier${qpv(vc)}`,
      { method: 'PATCH', body: JSON.stringify({ tier, priceMXN }) },
    ),
    // N°60 · C-arch · activate/deactivate per (module × vertical) con auto-provision
    activate: (mc, vc, opts = {}) => api.request(
      `/customers/${customerId}/modules`,
      {
        method: 'POST',
        body: JSON.stringify({
          moduleCode: mc,
          parentVerticalCode: vc || null,
          autoProvision: opts.autoProvision !== false, // default true · HR/CRM auto-create tenant
          tier: opts.tier || 'trial',
          priceMXN: opts.priceMXN ?? 0,
          licenseDays: opts.licenseDays ?? 30,
        }),
      },
    ),
    deactivate: (mc, vc) => api.request(
      `/customers/${customerId}/modules/${mc}${qpv(vc)}`,
      { method: 'DELETE' },
    ),
  };
}
