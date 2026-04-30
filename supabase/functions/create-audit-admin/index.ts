import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // --- Bootstrap guard ---
    const bootstrapEnabled = Deno.env.get('ENABLE_AUDIT_ADMIN_BOOTSTRAP');
    if (bootstrapEnabled !== 'true') {
      return new Response(
        JSON.stringify({ error: 'Bootstrap disabled. Set ENABLE_AUDIT_ADMIN_BOOTSTRAP=true to enable.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Auth: exact match against service role key (no JWT decode) ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: service_role required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (token !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: service_role required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Validate ADMIN_CREATION_KEY ---
    let body: Record<string, unknown> = {};
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return new Response(
          JSON.stringify({ error: 'Invalid payload' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      body = parsed as Record<string, unknown>;
    } catch (_error) {
      return new Response(
        JSON.stringify({ error: 'Malformed JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminKey = typeof body.adminKey === 'string' ? body.adminKey : '';
    const expectedKey = Deno.env.get('ADMIN_CREATION_KEY');
    if (!expectedKey || adminKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid admin creation key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Create audit user ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const email = 'auditoria@adapta.ai';
    const password = crypto.randomUUID();

    const { data: user, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Adapta One 26 (Audit AI)', role: 'audit_admin' }
    });

    if (createError) {
      console.error('[create-audit-admin] User creation failed');
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!user.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: profileError } = await supabaseAdmin
      .from('trainer_profiles')
      .insert({ id: user.user.id, full_name: 'Adapta One 26 (Audit AI)' });
    if (profileError) console.error('[create-audit-admin] Profile creation failed');

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: user.user.id, role: 'admin' });

    if (roleError) {
      console.error('[create-audit-admin] Role assignment failed');
      return new Response(
        JSON.stringify({ error: 'Failed to assign admin role' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[create-audit-admin] Audit admin provisioned successfully');

    return new Response(
      JSON.stringify({
        success: true,
        created: true,
        userId: user.user.id,
        email,
        message: 'Conta de auditoria criada. Utilize o painel de administração para gerenciar credenciais.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[create-audit-admin] Unexpected error');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
