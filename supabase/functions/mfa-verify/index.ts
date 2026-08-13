import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as OTPAuth from 'https://esm.sh/otpauth@9.1.4';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id, secret, code } = await req.json();

        if (!secret || !code) {
            return new Response(
                JSON.stringify({ error: 'secret and code are required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const totp = new OTPAuth.TOTP({
            issuer: 'MyIMCC Portal',
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: OTPAuth.Secret.fromBase32(secret),
        });

        // Validate code with 1-step tolerance window
        const delta = totp.validate({ token: String(code).trim(), window: 1 });

        if (delta === null) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid verification code' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'TOTP verified successfully' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});