import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');

    if (!token) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Token não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Validating invite token: [redacted]');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch invite
    const { data: invite, error: inviteError } = await supabaseClient
      .from('student_invites')
      .select('*, trainer_profiles(full_name)')
      .eq('invite_token', token)
      .single();

    if (inviteError || !invite) {
      console.log('Invite not found:', inviteError);
      return new Response(
        JSON.stringify({ valid: false, error: 'Convite não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    if (now > expiresAt) {
      console.log('Invite expired');
      return new Response(
        JSON.stringify({ valid: false, error: 'Convite expirado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If this is an oura_connect type invite, return additional data
    if (type === 'oura_connect' || invite.email === '__oura_connect__') {
      const ouraClientId = Deno.env.get('OURA_CLIENT_ID');

      // Get student name
      let studentName = 'Aluno';
      if (invite.created_student_id) {
        const { data: student } = await supabaseClient
          .from('students')
          .select('name')
          .eq('id', invite.created_student_id)
          .single();
        if (student) studentName = student.name;
      }

      if (invite.created_student_id) {
        const { data: existingConnection } = await supabaseClient
          .from('oura_connections')
          .select('id')
          .eq('student_id', invite.created_student_id)
          .eq('is_active', true)
          .maybeSingle();

        if (existingConnection) {
          console.log('Oura invite already accepted; active connection exists');
          return new Response(
            JSON.stringify({
              valid: false,
              already_connected: true,
              trainer_name: invite.trainer_profiles?.full_name || 'Seu treinador',
              student_name: studentName,
              student_id: invite.created_student_id,
              invite_id: invite.id,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      if (invite.is_used) {
        console.log('Invite already used');
        return new Response(
          JSON.stringify({ valid: false, error: 'Convite já foi utilizado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Invite is valid');

      return new Response(
        JSON.stringify({
          valid: true,
          trainer_name: invite.trainer_profiles?.full_name || 'Seu treinador',
          student_name: studentName,
          student_id: invite.created_student_id,
          invite_id: invite.id,
          oura_client_id: ouraClientId || null,
          expires_at: invite.expires_at,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already used
    if (invite.is_used) {
      console.log('Invite already used');
      return new Response(
        JSON.stringify({ valid: false, error: 'Convite já foi utilizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Invite is valid');

    return new Response(
      JSON.stringify({
        valid: true,
        trainer_name: invite.trainer_profiles?.full_name || 'Seu treinador',
        expires_at: invite.expires_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in validate-student-invite:', error);
    return new Response(
      JSON.stringify({ valid: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
