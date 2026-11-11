import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    getSupabaseClientAsync: () => Promise<SupabaseClient>;
    initAuthGuard: (roles: string[]) => Promise<{ profile: { role: string } } | null>;
    imccHidePreloader?: () => void;
    IMCC_DEVELOPER_VIEW?: boolean;
    imccLiveRefresh?: (client: SupabaseClient, tables: { table: string; filter?: string }[], refresh: () => void | Promise<void>) => () => void;
    IMCC: {
      resolveRoute: (profile: { status: string; role: string; is_active: boolean }) => { kind: string; url?: string };
      isCurrentPage: (url: string) => boolean;
      dashboardForRole: (role: string) => string | null;
      termKey: (row: { school_year?: string; semester?: string }) => string;
      termKeys: (rows: { school_year?: string; semester?: string }[]) => string[];
      fetchAll: <T>(query: () => ReturnType<SupabaseClient['rpc']>) => Promise<{ data: T[] | null; error: { message: string } | null }>;
    };
  }
}
