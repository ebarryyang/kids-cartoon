export interface ActivationCodeCatalog {
  version: 1;
  codes: ActivationCode[];
}

export interface ActivationCode {
  id: string;
  code: string;
  seriesId: string;
  seriesName: string;
  status: 'active' | 'used' | 'expired';
  usedBy?: string;
  createdAt: string;
  expiresAt: string;
}

const CATALOG_URL = '/data/activation-codes.json';
const REDEEMED_KEY = 'client-redeemed-codes:v1';
const FALLBACK_KEY = 'demo-activation-codes:v1';

function normalizeCode(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
}

function isExpired(expiresAt: string): boolean {
  if (!expiresAt) return false;
  const d = new Date(`${expiresAt}T23:59:59`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function getRedeemed(): Set<string> {
  try {
    const s = localStorage.getItem(REDEEMED_KEY);
    if (!s) return new Set();
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

function markRedeemed(code: string): void {
  const set = getRedeemed();
  set.add(normalizeCode(code));
  localStorage.setItem(REDEEMED_KEY, JSON.stringify(Array.from(set)));
}

async function fetchCatalog(): Promise<ActivationCode[]> {
  try {
    const resp = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (resp.ok) {
      const data = await resp.json();
      if (data && Array.isArray(data.codes)) {
        return data.codes.map((c: any) => ({ ...c, code: normalizeCode(c.code) }));
      }
    }
  } catch {
    // fall through to fallback
  }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map((c: any) => ({ ...c, code: normalizeCode(c.code) }));
    }
    if (data && Array.isArray(data.codes)) {
      return data.codes.map((c: any) => ({ ...c, code: normalizeCode(c.code) }));
    }
  } catch {
    // ignore
  }
  return [];
}

export interface RedeemResult {
  ok: boolean;
  reason?: string;
  seriesId?: string;
  seriesName?: string;
}

export async function redeemActivationCode(raw: string): Promise<RedeemResult> {
  const key = normalizeCode(raw);
  if (!key) return { ok: false, reason: '请输入激活码' };
  const catalog = await fetchCatalog();
  const match = catalog.find((c) => c.code === key);
  if (!match) return { ok: false, reason: '激活码不存在或格式不正确（请检查是否粘贴完整）' };
  if (isExpired(match.expiresAt)) return { ok: false, reason: '该激活码已过期，请联系管理员换新' };
  if (match.status === 'expired') return { ok: false, reason: '该激活码已过期' };
  if (match.status === 'used') return { ok: false, reason: '该激活码已被使用，无法再次兑换' };
  const redeemed = getRedeemed();
  if (redeemed.has(key)) return { ok: false, reason: '你已经兑换过该激活码，直接去首页观看吧～' };
  markRedeemed(key);
  return { ok: true, seriesId: match.seriesId, seriesName: match.seriesName };
}
