// Ambient declarations that let `tsc` check the Deno-targeted Edge Functions
// from Node, on a machine that has neither Deno nor the runtime URL imports.
//
// `deno check` is the canonical check and needs none of this. This exists so a
// real type checker can still run in CI or on a workstation, and it is what
// caught the empty `{"error": undefined}` responses in the MFA functions.
//
// The limitation is deliberate and worth understanding: the Edge Functions
// import `serve`, the Supabase client, `otpauth`, `qrcode` and the transformer
// pipeline over https, which tsc cannot follow. Everything reached through
// those imports is typed `any` here, so this check covers the functions' own
// logic, signatures and error handling, and does not cover the shape of the
// third-party APIs they call.

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module 'https://*' {
  export const serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  export const createClient: any;
  export const pipeline: any;
  export const env: any;
  export const Secret: any;
  export const TOTP: any;
  const mod: any;
  export default mod;
}
