import crypto from 'crypto';

export type PaymentGatewayCode = 'stripe' | 'khalti' | 'esewa';

export interface GatewayStatus {
  code: PaymentGatewayCode;
  name: string;
  region: string;
  currencies: string[];
  configured: boolean;
  missingEnvVars: string[];
}

export function getPaymentGatewayStatuses(): GatewayStatus[] {
  const stripeMissing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) stripeMissing.push('STRIPE_SECRET_KEY');
  if (!process.env.STRIPE_WEBHOOK_SECRET) stripeMissing.push('STRIPE_WEBHOOK_SECRET');

  const khaltiMissing: string[] = [];
  if (!process.env.KHALTI_SECRET_KEY) khaltiMissing.push('KHALTI_SECRET_KEY');

  const esewaMissing: string[] = [];
  if (!process.env.ESEWA_SECRET_KEY) esewaMissing.push('ESEWA_SECRET_KEY');
  if (!process.env.ESEWA_PRODUCT_CODE) esewaMissing.push('ESEWA_PRODUCT_CODE');

  return [
    {
      code: 'stripe',
      name: 'Stripe',
      region: 'Global Cards, Apple Pay & SEPA',
      currencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD'],
      configured: stripeMissing.length === 0,
      missingEnvVars: stripeMissing,
    },
    {
      code: 'khalti',
      name: 'Khalti',
      region: 'Nepal Digital Wallet & Banking',
      currencies: ['NPR'],
      configured: khaltiMissing.length === 0,
      missingEnvVars: khaltiMissing,
    },
    {
      code: 'esewa',
      name: 'eSewa',
      region: 'Nepal Instant Payment Gateway',
      currencies: ['NPR'],
      configured: esewaMissing.length === 0,
      missingEnvVars: esewaMissing,
    },
  ];
}

export async function initiateProviderCheckout(params: {
  provider: PaymentGatewayCode;
  amountCents: number;
  currency: string;
  planName: string;
  invoiceNumber: string;
  userEmail: string;
  returnUrl: string;
}): Promise<
  | { configured: false; message: string; missingEnvVars: string[] }
  | { configured: true; checkoutUrl: string; providerRef: string }
> {
  const statuses = getPaymentGatewayStatuses();
  const gw = statuses.find((s) => s.code === params.provider);
  if (!gw || !gw.configured) {
    return {
      configured: false,
      missingEnvVars: gw?.missingEnvVars || [],
      message: `${gw?.name || params.provider} is not configured on this server yet. Add ${gw?.missingEnvVars.join(', ')} in Settings > Secrets to enable live server-verified checkout. LexiScore never simulates fake payment confirmations.`,
    };
  }

  if (params.provider === 'stripe') {
    const body = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price_data][currency]': params.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(params.amountCents),
      'line_items[0][price_data][product_data][name]': `LexiScore ${params.planName}`,
      'line_items[0][quantity]': '1',
      customer_email: params.userEmail,
      client_reference_id: params.invoiceNumber,
      success_url: `${params.returnUrl}?payment=success&inv=${params.invoiceNumber}`,
      cancel_url: `${params.returnUrl}?payment=cancelled`,
    });

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = (await resp.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!resp.ok || !data.url || !data.id) {
      throw new Error(data.error?.message || 'Stripe checkout initialization failed.');
    }
    return { configured: true, checkoutUrl: data.url, providerRef: data.id };
  }

  if (params.provider === 'khalti') {
    const resp = await fetch('https://a.khalti.com/api/v2/epayment/initiate/', {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        return_url: `${params.returnUrl}?provider=khalti&inv=${params.invoiceNumber}`,
        website_url: params.returnUrl,
        amount: params.amountCents,
        purchase_order_id: params.invoiceNumber,
        purchase_order_name: `LexiScore ${params.planName}`,
      }),
    });
    const data = (await resp.json()) as { pidx?: string; payment_url?: string; detail?: string };
    if (!resp.ok || !data.payment_url || !data.pidx) {
      throw new Error(data.detail || 'Khalti payment initiation failed.');
    }
    return { configured: true, checkoutUrl: data.payment_url, providerRef: data.pidx };
  }

  // eSewa HMAC-SHA256 signed payload
  const totalAmount = (params.amountCents / 100).toFixed(2);
  const productCode = process.env.ESEWA_PRODUCT_CODE || '';
  const message = `total_amount=${totalAmount},transaction_uuid=${params.invoiceNumber},product_code=${productCode}`;
  const signature = crypto
    .createHmac('sha256', process.env.ESEWA_SECRET_KEY || '')
    .update(message)
    .digest('base64');

  return {
    configured: true,
    providerRef: signature,
    checkoutUrl: `https://epay.esewa.com.np/api/epay/main/v2/form?transaction_uuid=${encodeURIComponent(params.invoiceNumber)}&signature=${encodeURIComponent(signature)}`,
  };
}

export function verifyStripeWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
