// =============================================================================
// Caminare — CORS para as funções serverless (/api)
// -----------------------------------------------------------------------------
// No web (Vercel) o app e as rotas /api vivem na MESMA origem → o navegador
// nem dispara CORS. No app NATIVO (Capacitor) a origem é `capacitor://localhost`
// (Android) / `https://localhost` (iOS) e a chamada vai pro deploy de produção
// (caminare-v2.vercel.app) — ou seja, é CROSS-ORIGIN. Sem estes cabeçalhos o
// navegador embutido bloqueia:
//   1) o preflight OPTIONS (que precede todo POST com Authorization/JSON), e
//   2) a leitura da resposta do POST.
//
// Por isso CADA função em api/ deve, logo no início do handler:
//   if (applyCors(req, res)) return;   // responde o preflight e encerra
// Em requisições normais (POST), applyCors só seta o Access-Control-Allow-Origin
// e segue o fluxo — o cabeçalho persiste até a resposta ser enviada.
//
// Allow-Origin = '*' por enquanto (autenticação é via Bearer no header, não por
// cookie; com '*' não usamos credenciais, então é seguro). Se um dia precisarmos
// restringir, basta refletir a origem permitida aqui.
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const ALLOW_ORIGIN = '*';
const ALLOW_METHODS = 'GET, POST, OPTIONS';
const ALLOW_HEADERS = 'authorization, content-type, apikey';

/** Seta os cabeçalhos CORS na resposta (vale para preflight e respostas normais). */
export function setCorsHeaders(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Max-Age', '86400');
  // Como a origem varia (web mesma-origem vs. nativo), sinaliza ao cache.
  res.setHeader('Vary', 'Origin');
}

/**
 * Aplica CORS e trata o preflight.
 * @returns `true` se a requisição era um preflight OPTIONS já respondido (204) —
 *          nesse caso o handler deve `return` imediatamente. `false` segue o fluxo.
 */
export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    // 204 No Content: preflight aprovado, sem corpo.
    res.status(204).end();
    return true;
  }
  return false;
}
