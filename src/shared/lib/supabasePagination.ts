export const supabasePageSize = 1000;

export function getSupabasePageRange(pageIndex: number, pageSize = supabasePageSize) {
  const from = pageIndex * pageSize;

  return {
    from,
    to: from + pageSize - 1
  };
}

export function hasMoreSupabasePages(pageLength: number, pageSize = supabasePageSize) {
  return pageLength === pageSize;
}
