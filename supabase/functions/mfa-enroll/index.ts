import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import * as OTPAuth from 'https://esm.sh/otpauth@9.1.4';
import QRCode from 'https://esm.sh/qrcode@1.5.3';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { user_id } = await req.json();

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: 'user_id is required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Generate secret for student
        const secret = new OTPAuth.Secret({ size: 20 });
        const totp = new OTPAuth.TOTP({
            issuer: 'MyIMCC Portal',
            label: `Student:${user_id.slice(0, 8)}`,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: secret,
        });

        const uri = totp.toString();
        const qrUrl = await QRCode.toDataURL(uri);

        return new Response(
            JSON.stringify({
                success: true,
                needsEnrollment: true,
                secret: secret.base32,
                qrUrl,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});