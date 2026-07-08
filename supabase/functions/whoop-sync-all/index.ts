import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateServiceRoleOrUserRole } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

interface SyncResult {
  student_id: string;
  student_name: string;
  status: 'success' | 'failed';
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateServiceRoleOrUserRole(req, {
      corsHeaders,
      allowedRoles: ['admin'],
      missingAuthMessage: 'Missing or invalid authorization header',
      invalidTokenMessage: 'Invalid or expired token',
      forbiddenMessage: 'Admin privileges required for this operation',
    });
    if (authResult instanceof Response) return authResult;
    const { supabaseUrl, supabaseServiceKey } = authResult;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: connections, error } = await supabase
      .from('whoop_connections')
      .select('student_id, students ( name )')
      .eq('is_active', true);
    if (error) throw error;
    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({ message: 'No active Whoop connections found', results: [] }), { headers: jsonHeaders, status: 200 });
    }

    const results: SyncResult[] = [];
    const BATCH_SIZE = 5;
    for (let i = 0; i < connections.length; i += BATCH_SIZE) {
      const batch = connections.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (c) => {
          const studentId = (c as Record<string, unknown>).student_id as string;
          const studentName = ((c as Record<string, unknown>).students as Record<string, unknown>)?.name as string || 'Unknown';
          const { error: syncErr } = await supabase.functions.invoke('whoop-sync', {
            body: { student_id: studentId },
            headers: { Authorization: `Bearer ${supabaseServiceKey}` },
          });
          if (syncErr) return { student_id: studentId, student_name: studentName, status: 'failed' as const, error: syncErr.message };
          return { student_id: studentId, student_name: studentName, status: 'success' as const };
        }),
      );
      for (const r of batchResults) if (r.status === 'fulfilled') results.push(r.value as SyncResult);
    }

    const successCount = results.filter((r) => r.status === 'success').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;
    return new Response(
      JSON.stringify({ message: `Sync completed: ${successCount} success, ${failedCount} failed`, total: results.length, success: successCount, failed: failedCount, results }),
      { headers: jsonHeaders, status: 200 },
    );
  } catch (error) {
    console.error('Error in whoop-sync-all:', error);
    return new Response(JSON.stringify({ error: (error as Error).message || 'Unknown error' }), { headers: jsonHeaders, status: 500 });
  }
});
