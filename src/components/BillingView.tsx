import React, { useCallback, useEffect, useState } from 'react';
import { Check, CreditCard, Loader2, Tag } from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface BillingPlan {
  id: number;
  code: 'free' | 'basic' | 'premium' | 'professional' | 'institutional';
  name: string;
  description: string;
  monthlyPriceUsd: number;
  quarterlyPriceUsd: number;
  annualPriceUsd: number;
  featuresJson: string[];
  limitsJson: { dailyPractice: number; dailyAiScoring: number; fullMocksPerMonth: number; seats: number };
}

interface GatewayStatus {
  code: 'stripe' | 'khalti' | 'esewa';
  name: string;
  currency: string;
  configured: boolean;
  requiredEnvVars: string[];
}

interface PaymentRecord {
  id: number;
  provider: string;
  amountCents: number;
  currency: string;
  status: string;
  invoiceNumber: string;
  couponCode: string | null;
  createdAt: string;
}

export const BillingView: React.FC = () => {
  const { refreshAccount } = useAuth();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [gateways, setGateways] = useState<GatewayStatus[]>([]);
  const [currentSub, setCurrentSub] = useState<{ plan: BillingPlan; sub: { billingCycle: string; status: string } } | null>(null);
  const [history, setHistory] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [cycle, setCycle] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [provider, setProvider] = useState<'stripe' | 'khalti' | 'esewa'>('stripe');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountType: string; discountValue: number } | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);

  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [checkoutNotice, setCheckoutNotice] = useState<{ type: 'info' | 'error'; text: string } | null>(null);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{
        plans: BillingPlan[];
        gateways: GatewayStatus[];
        currentSubscription: { plan: BillingPlan; sub: { billingCycle: string; status: string } } | null;
        paymentHistory: PaymentRecord[];
      }>('/api/billing/status', { requireToken: true });
      setPlans(data.plans || []);
      setGateways(data.gateways || []);
      setCurrentSub(data.currentSubscription || null);
      setHistory(data.paymentHistory || []);
    } catch (err) {
      console.error('Failed to load billing:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleValidateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setCouponMsg(null);
    if (!couponInput.trim()) return;
    try {
      const res = await apiFetch<{ coupon: { code: string; discountType: string; discountValue: number } }>(
        '/api/billing/validate-coupon',
        { method: 'POST', body: JSON.stringify({ code: couponInput.trim() }) }
      );
      setAppliedCoupon(res.coupon);
      setCouponMsg(
        `Applied ${res.coupon.code}: ${
          res.coupon.discountType === 'percent' ? `${res.coupon.discountValue}% off` : `$${res.coupon.discountValue} off`
        }`
      );
    } catch (err: unknown) {
      setAppliedCoupon(null);
      setCouponMsg(err instanceof Error ? err.message : 'Invalid coupon code.');
    }
  };

  const computeDisplayPrice = (p: BillingPlan) => {
    let base =
      cycle === 'annual' ? p.annualPriceUsd : cycle === 'quarterly' ? p.quarterlyPriceUsd : p.monthlyPriceUsd;
    if (appliedCoupon && base > 0) {
      base =
        appliedCoupon.discountType === 'percent'
          ? Math.max(0, base * (1 - appliedCoupon.discountValue / 100))
          : Math.max(0, base - appliedCoupon.discountValue);
    }
    return base;
  };

  const handleCheckout = async (planCode: BillingPlan['code']) => {
    setCheckoutBusy(planCode);
    setCheckoutNotice(null);
    try {
      const res = await apiFetch<{ activatedFree?: boolean; message?: string; checkoutUrl?: string; invoiceNumber?: string }>(
        '/api/billing/checkout',
        {
          method: 'POST',
          requireToken: true,
          body: JSON.stringify({
            planCode,
            billingCycle: cycle,
            provider,
            couponCode: appliedCoupon?.code || undefined,
          }),
        }
      );
      if (res.activatedFree) {
        setCheckoutNotice({ type: 'info', text: res.message || 'Plan updated to Free Explorer.' });
        await refreshAccount();
        await loadBilling();
      } else if (res.checkoutUrl) {
        setCheckoutNotice({
          type: 'info',
          text: `Invoice ${res.invoiceNumber} created. Redirect link ready: ${res.checkoutUrl}`,
        });
        await loadBilling();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 503) {
        const missing = Array.isArray(err.data?.missingEnvVars) ? (err.data?.missingEnvVars as string[]).join(', ') : '';
        setCheckoutNotice({
          type: 'error',
          text: `${err.message}${missing ? ` Required environment secrets: ${missing}.` : ''}`,
        });
      } else {
        setCheckoutNotice({
          type: 'error',
          text: err instanceof Error ? err.message : 'Checkout initiation failed.',
        });
      }
    } finally {
      setCheckoutBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading subscription plans &amp; gateway status...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Subscriptions · Multi-Gateway Adapters (Stripe · Khalti · eSewa)
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-white">
            Billing &amp; Plan Management
          </h1>
        </div>

        {/* Billing Cadence Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {(['monthly', 'quarterly', 'annual'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCycle(c)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize ${
                cycle === c
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {c === 'annual' ? 'Annual (-25%)' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Active Subscription + Gateway & Coupon Controls */}
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">Current Active Plan</div>
          <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {currentSub?.plan?.name || 'Free Explorer'}
          </div>
          <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 capitalize">
            Cycle: {currentSub?.sub?.billingCycle || 'monthly'} · Status: {currentSub?.sub?.status || 'active'}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            <CreditCard className="w-3.5 h-3.5 text-indigo-600" /> Payment Gateway Adapter
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {gateways.map((g) => (
              <button
                key={g.code}
                type="button"
                onClick={() => setProvider(g.code)}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                  provider === g.code
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="font-semibold">{g.name.split(' ')[0]}</div>
                <div className="text-[10px] text-slate-500">
                  {g.configured ? `Live (${g.currency})` : 'Needs Env Key'}
                </div>
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleValidateCoupon}
          className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            <Tag className="w-3.5 h-3.5 text-indigo-600" /> Promo / Institute Coupon
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="LAUNCH25 or ACADEMY40"
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs font-mono uppercase text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 dark:bg-indigo-600 text-white px-3.5 py-1.5 text-xs font-semibold"
            >
              Apply
            </button>
          </div>
          {couponMsg && (
            <p className={`mt-1.5 text-[11px] ${appliedCoupon ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {couponMsg}
            </p>
          )}
        </form>
      </div>

      {checkoutNotice && (
        <div
          className={`rounded-xl border p-4 text-xs leading-relaxed ${
            checkoutNotice.type === 'error'
              ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200'
              : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          {checkoutNotice.text}
        </div>
      )}

      {/* 5-Tier Plan Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        {plans.map((p) => {
          const isCurrent = currentSub?.plan?.code === p.code;
          const displayUsd = computeDisplayPrice(p);
          const displayPrice =
            provider === 'stripe'
              ? `$${displayUsd.toFixed(0)}`
              : `NPR ${Math.round(displayUsd * 135).toLocaleString()}`;
          return (
            <div
              key={p.id}
              className={`rounded-xl border p-5 flex flex-col justify-between ${
                p.code === 'premium'
                  ? 'border-indigo-600 bg-indigo-50/30 dark:bg-indigo-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              }`}
            >
              <div>
                <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
                  {isCurrent ? 'Active Tier' : p.code.toUpperCase()}
                </div>
                <h2 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{p.name}</h2>
                <div className="mt-3 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {displayPrice}
                  <span className="text-[11px] font-sans font-normal text-slate-500"> / {cycle}</span>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{p.description}</p>
                <ul className="mt-4 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {(p.featuresJson || []).map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                disabled={checkoutBusy === p.code || isCurrent}
                onClick={() => handleCheckout(p.code)}
                className={`mt-6 w-full rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  p.code === 'premium'
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {checkoutBusy === p.code
                  ? 'Connecting Gateway...'
                  : isCurrent
                  ? 'Current Plan'
                  : p.code === 'free'
                  ? 'Switch to Free'
                  : `Checkout via ${provider.toUpperCase()}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Payment & Invoice History */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Payment &amp; Invoice History</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th className="pb-2.5 font-medium">Invoice</th>
                <th className="pb-2.5 font-medium">Gateway</th>
                <th className="pb-2.5 font-medium">Amount</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {history.map((h) => (
                <tr key={h.id} className="text-slate-700 dark:text-slate-300">
                  <td className="py-2.5 font-mono font-semibold">{h.invoiceNumber}</td>
                  <td className="py-2.5 uppercase">{h.provider}</td>
                  <td className="py-2.5 font-mono tabular-nums">
                    {h.currency} {(h.amountCents / 100).toFixed(2)}
                  </td>
                  <td className="py-2.5 capitalize">{h.status}</td>
                  <td className="py-2.5 text-right font-mono">{new Date(h.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 dark:text-slate-400">
                    No billing transactions yet. Configure Stripe, Khalti, or eSewa secrets in environment settings to process live payments.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
