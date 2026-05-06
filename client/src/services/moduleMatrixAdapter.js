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
  };
}
