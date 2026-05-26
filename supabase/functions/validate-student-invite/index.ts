import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

const inviteTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders, status });
}

function extractTrainerName(trainerProfiles: unknown): string {
  if (!trainerProfiles) return 'Seu treinador';
  if (Array.isArray(trainerProfiles)) {
    const first = trainerProfiles[0] as Record<string, unknown> | undefined;
    return (first?.full_name as string) || 'Seu treinador';
  }
  return ((trainerProfiles as Record<string, unknown>).full_name as string) || 'Seu treinador';
}

function isValidInviteToken(value: string | null): value is string {
  return Boolean(value && inviteTokenPattern.test(value));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const type = url.searchParams.get('type');

    if (!token) {
      return jsonResponse({ valid: false, error: 'Token não fornecido' }, 400);
    }

    if (!isValidInviteToken(token)) {
      return jsonResponse({ valid: false, error: 'Token inválido' }, 400);
    }

    console.log('Validating invite token: [redacted]');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: invite, error: inviteError } = await supabaseClient
      .from('student_invites')
      .select('id, email, expires_at, is_used, created_student_id, trainer_profiles(full_name)')
      .eq('invite_token', token)
      .single();

    if (inviteError || !invite) {
      console.log('Invite not found:', inviteError);
      return jsonResponse({ valid: false, error: 'Convite não encontrado' }, 404);
    }

    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    if (now > expiresAt) {
      console.log('Invite expired');
      return jsonResponse({ valid: false, error: 'Convite expirado' }, 410);
    }

    if (type === 'oura_connect' || invite.email === '__oura_connect__') {
      const ouraClientId = Deno.env.get('OURA_CLIENT_ID');
      const trainerName = extractTrainerName(invite.trainer_profiles);

      let studentName = 'Aluno';
      if (invite.created_student_id) {
        const { data: student, error: studentError } = await supabaseClient
          .from('students')
          .select('name')
          .eq('id', invite.created_student_id)
          .single();
        if (studentError) {
          console.error('Failed to load student name for invite:', studentError);
        }
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
          return jsonResponse({
            valid: false,
            already_connected: true,
            trainer_name: trainerName,
            student_name: studentName,
            student_id: invite.created_student_id,
            invite_id: invite.id,
          });
        }
      }

      if (invite.is_used) {
        console.log('Invite already used');
        return jsonResponse({ valid: false, error: 'Convite já foi utilizado' }, 409);
      }

      console.log('Invite is valid');
      return jsonResponse({
        valid: true,
        trainer_name: trainerName,
        student_name: studentName,
        student_id: invite.created_student_id,
        invite_id: invite.id,
        oura_client_id: ouraClientId || null,
        expires_at: invite.expires_at,
      });
    }

    if (invite.is_used) {
      console.log('Invite already used');
      return jsonResponse({ valid: false, error: 'Convite já foi utilizado' }, 409);
    }

    console.log('Invite is valid');
    return jsonResponse({
      valid: true,
      trainer_name: extractTrainerName(invite.trainer_profiles),
      expires_at: invite.expires_at,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in validate-student-invite:', error);
    return jsonResponse({ valid: false, error: message }, 500);
  }
});
