import { supabase } from '@/shared/lib/supabase';

export type SnapshotItemType =
  | 'bank_account'
  | 'broker'
  | 'cash'
  | 'fund'
  | 'etf'
  | 'stock'
  | 'crypto'
  | 'real_estate'
  | 'vehicle'
  | 'other_asset'
  | 'liability';

export type PatrimonialSnapshotItem = {
  id: string;
  name: string;
  type: SnapshotItemType;
  value: number;
  currency: string;
  notes: string | null;
};

export type PatrimonialSnapshot = {
  id: string;
  workspaceId: string;
  snapshotDate: string;
  name: string;
  notes: string | null;
  items: PatrimonialSnapshotItem[];
  initialNetWorth: number;
};

export type CreateSnapshotItemInput = {
  name: string;
  type: SnapshotItemType;
  value: number;
  currency: string;
  notes?: string | null;
};

type SnapshotRecord = {
  id: string;
  workspace_id: string;
  snapshot_date: string;
  name: string;
  notes: string | null;
};

type SnapshotItemRecord = {
  id: string;
  name: string;
  type: SnapshotItemType;
  value: number | string;
  currency: string;
  notes: string | null;
};

export async function getLatestPatrimonialSnapshot(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from('patrimonial_snapshots')
    .select('id, workspace_id, snapshot_date, name, notes')
    .eq('workspace_id', workspaceId)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle<SnapshotRecord>();

  if (snapshotError) {
    throw snapshotError;
  }

  if (!snapshot) {
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('patrimonial_snapshot_items')
    .select('id, name, type, value, currency, notes')
    .eq('snapshot_id', snapshot.id)
    .order('created_at', { ascending: true })
    .returns<SnapshotItemRecord[]>();

  if (itemsError) {
    throw itemsError;
  }

  return mapSnapshot(snapshot, items);
}

export async function createPatrimonialSnapshot(input: {
  workspaceId: string;
  snapshotDate: string;
  name: string;
  notes?: string | null;
  items: CreateSnapshotItemInput[];
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from('patrimonial_snapshots')
    .insert({
      name: input.name,
      notes: input.notes ?? null,
      snapshot_date: input.snapshotDate,
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

  if (snapshotError) {
    throw snapshotError;
  }

  const { error: itemsError } = await supabase.from('patrimonial_snapshot_items').insert(
    input.items.map((item) => ({
      currency: item.currency.toUpperCase(),
      name: item.name,
      notes: item.notes ?? null,
      snapshot_id: snapshot.id,
      type: item.type,
      value: item.value,
      workspace_id: input.workspaceId
    }))
  );

  if (itemsError) {
    throw itemsError;
  }
}

export async function resetWorkspaceFinancialData(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { error } = await supabase.rpc('reset_workspace_financial_data', {
    target_workspace_id: workspaceId
  });

  if (error) {
    throw error;
  }
}

function mapSnapshot(snapshot: SnapshotRecord, itemRecords: SnapshotItemRecord[]) {
  const items = itemRecords.map((item) => ({
    currency: item.currency,
    id: item.id,
    name: item.name,
    notes: item.notes,
    type: item.type,
    value: Number(item.value)
  }));

  return {
    id: snapshot.id,
    initialNetWorth: items.reduce((total, item) => total + item.value, 0),
    items,
    name: snapshot.name,
    notes: snapshot.notes,
    snapshotDate: snapshot.snapshot_date,
    workspaceId: snapshot.workspace_id
  } satisfies PatrimonialSnapshot;
}
