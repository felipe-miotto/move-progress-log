/**
 * Hook: assina, sob demanda, uma URL de leitura curta (TTL curto) para o PDF
 * de laudo DEXA armazenado no bucket privado `dexa-pdfs`.
 *
 * Padrão de uso:
 *
 *   const { sign, isLoading, error, reset } = useDexaPdfSignedUrl();
 *   const handleClick = async () => {
 *     const url = await sign(storagePath);
 *     if (url) window.open(url, "_blank", "noopener,noreferrer");
 *   };
 *
 * Garantias de segurança:
 *   - bucket `dexa-pdfs` é privado (RLS por trainer dono + admin via
 *     user_roles — ver migration `…_precision12_assessment_foundation.sql`
 *     section 16 e o hardening em `…_precision12_hardening_pre_e2.sql`);
 *   - `createSignedUrl` só emite o token se `auth.uid()` tem direito de
 *     SELECT pelo path (`{studentId}/...`), então não há bypass de RLS;
 *   - TTL curto (60 segundos por padrão) — janela mínima viável pro coach
 *     abrir o PDF; não é guardada em cache nem persistida;
 *   - **NÃO** persiste a URL/token em React Query cache, localStorage,
 *     sessionStorage, IndexedDB ou qualquer outro storage do cliente;
 *   - **NÃO** loga URL/token em `console.*` ou telemetria (apenas a
 *     mensagem de erro genérica do Supabase, sem o path do objeto);
 *   - **NÃO** modifica nenhum registro: zero `insert/update/delete/upsert`
 *     / `rpc` / `functions.invoke` / `useMutation` aqui.
 */

import { useCallback, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

/**
 * TTL da URL assinada. Curto e fixo: tempo suficiente pro browser abrir o
 * arquivo numa nova aba, e nada além disso.
 */
export const DEXA_PDF_SIGNED_URL_TTL_SECONDS = 60;

/**
 * Bucket privado dos laudos DEXA. Centralizado pra evitar string-magia.
 */
export const DEXA_PDFS_BUCKET = "dexa-pdfs";

/**
 * Mensagem genérica fixa exposta pra UI quando a assinatura falha.
 * Deliberadamente NÃO inclui `signError.message`, `err.message`, path do
 * objeto, bucket name ou qualquer detalhe interno do storage — esses
 * dados poderiam vazar pro DOM via toast/alert ou pra telemetria via
 * captura de erro automática.
 *
 * Diagnóstico server-side continua disponível no Supabase Dashboard
 * (logs do Storage API), que é onde esse tipo de detalhe pertence.
 */
export const DEXA_PDF_SIGNED_URL_GENERIC_ERROR =
  "Não foi possível gerar o link do laudo.";

export interface UseDexaPdfSignedUrlResult {
  /**
   * Assina o `storagePath` e devolve a URL. Devolve `null` se `storagePath`
   * for vazio/null ou se a API recusar (erro de auth/path inválido).
   * Em caso de erro, `error` recebe uma mensagem genérica fixa
   * (`DEXA_PDF_SIGNED_URL_GENERIC_ERROR`), sem detalhes do Supabase nem
   * do path do objeto. Diagnóstico interno fica server-side.
   */
  sign: (storagePath: string | null | undefined) => Promise<string | null>;
  isLoading: boolean;
  error: string | null;
  /** Limpa o estado de erro/loading. */
  reset: () => void;
}

export function useDexaPdfSignedUrl(): UseDexaPdfSignedUrlResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const sign = useCallback(
    async (storagePath: string | null | undefined): Promise<string | null> => {
      // Defensivo: input vazio é estado válido ("ainda sem PDF"), não erro.
      if (!storagePath || storagePath.trim().length === 0) {
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signError } = await supabase.storage
          .from(DEXA_PDFS_BUCKET)
          .createSignedUrl(storagePath, DEXA_PDF_SIGNED_URL_TTL_SECONDS);

        if (signError || !data?.signedUrl) {
          // PR-A hardening: NÃO armazenamos `signError.message` no estado
          // exportado. A mensagem do Supabase pode incluir o path do objeto
          // ou o bucket name, e qualquer captura automática de erro
          // (toast/telemetria) re-exibiria isso. Sempre genérica.
          setError(DEXA_PDF_SIGNED_URL_GENERIC_ERROR);
          return null;
        }

        return data.signedUrl;
      } catch {
        // PR-A hardening: idem catch — `err.message` pode conter path,
        // URL, stack trace ou querystring de token. Mensagem fixa.
        setError(DEXA_PDF_SIGNED_URL_GENERIC_ERROR);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { sign, isLoading, error, reset };
}
