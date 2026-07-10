import { describe, expect, it } from 'vitest';

import {
  getSupabasePageRange,
  hasMoreSupabasePages,
  supabasePageSize
} from '@/shared/lib/supabasePagination';

describe('supabase pagination', () => {
  it('builds inclusive page ranges for Supabase range()', () => {
    expect(getSupabasePageRange(0)).toEqual({ from: 0, to: 999 });
    expect(getSupabasePageRange(1)).toEqual({ from: 1000, to: 1999 });
  });

  it('continues fetching only when a full page is returned', () => {
    expect(hasMoreSupabasePages(supabasePageSize)).toBe(true);
    expect(hasMoreSupabasePages(supabasePageSize - 1)).toBe(false);
    expect(hasMoreSupabasePages(0)).toBe(false);
  });
});
