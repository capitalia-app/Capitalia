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
  platform: string | null;
  name: string;
  type: SnapshotItemType;
  value: number;
  currency: string;
  linkedAccountId: string | null;
  linkedAssetId: string | null;
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
  initialGrossWorth: number;
  initialDebt: number;
  groupedByType: SnapshotGroup[];
  groupedByPlatform: SnapshotGroup[];
};

export type SnapshotGroup = {
  key: string;
  label: string;
  total: number;
  itemCount: number;
};

export type CreateSnapshotItemInput = {
  platform?: string | null;
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
  platform: string | null;
  name: string;
  type: SnapshotItemType;
  value: number | string;
  currency: string;
  linked_account_id: string | null;
  linked_asset_id: string | null;
  notes: string | null;
};

type ExistingNamedRecord = {
  id: string;
  name: string;
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
    .select(
      'id, platform, name, type, value, currency, linked_account_id, linked_asset_id, notes'
    )
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

  const preparedItems = await prepareSnapshotItems({
    items: input.items,
    snapshotDate: input.snapshotDate,
    workspaceId: input.workspaceId
  });

  const { error: itemsError } = await supabase.from('patrimonial_snapshot_items').insert(
    preparedItems.map((item) => ({
      currency: item.currency.toUpperCase(),
      name: item.name,
      notes: item.notes ?? null,
      platform: normalizeOptionalText(item.platform),
      linked_account_id: item.linkedAccountId,
      linked_asset_id: item.linkedAssetId,
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

export async function resetPatrimonialStartingPoint(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { error } = await supabase.rpc('reset_patrimonial_starting_point', {
    target_workspace_id: workspaceId
  });

  if (error) {
    throw error;
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
    linkedAccountId: item.linked_account_id,
    linkedAssetId: item.linked_asset_id,
    name: item.name,
    notes: item.notes,
    platform: item.platform,
    type: item.type,
    value: Number(item.value)
  }));
  const initialGrossWorth = items
    .filter((item) => item.type !== 'liability')
    .reduce((total, item) => total + Math.max(item.value, 0), 0);
  const initialDebt = items
    .filter((item) => item.type === 'liability')
    .reduce((total, item) => total + Math.abs(item.value), 0);

  return {
    id: snapshot.id,
    groupedByPlatform: groupSnapshotItems(items, (item) => item.platform ?? 'Manual'),
    groupedByType: groupSnapshotItems(items, (item) => item.type),
    initialDebt,
    initialGrossWorth,
    initialNetWorth: initialGrossWorth - initialDebt,
    items,
    name: snapshot.name,
    notes: snapshot.notes,
    snapshotDate: snapshot.snapshot_date,
    workspaceId: snapshot.workspace_id
  } satisfies PatrimonialSnapshot;
}

async function prepareSnapshotItems(input: {
  workspaceId: string;
  snapshotDate: string;
  items: CreateSnapshotItemInput[];
}) {
  return Promise.all(
    input.items.map(async (item) => {
      const linkedAccountId = isAccountSnapshotItem(item.type)
        ? await ensureFinancialAccount({
            currency: item.currency,
            name: item.name,
            platform: item.platform,
            snapshotDate: input.snapshotDate,
            type: mapSnapshotItemToAccountType(item.type),
            value: item.value,
            workspaceId: input.workspaceId
          })
        : null;
      const linkedAssetId = isAssetSnapshotItem(item.type)
        ? await ensureAsset({
            currency: item.currency,
            name: item.name,
            platform: item.platform,
            type: mapSnapshotItemToAssetType(item.type),
            value: item.value,
            workspaceId: input.workspaceId
          })
        : null;

      return {
        ...item,
        linkedAccountId,
        linkedAssetId,
        value: item.type === 'liability' ? -Math.abs(item.value) : Math.abs(item.value)
      };
    })
  );
}

async function ensureFinancialAccount(input: {
  workspaceId: string;
  platform?: string | null;
  name: string;
  type: 'checking' | 'brokerage' | 'cash';
  currency: string;
  value: number;
  snapshotDate: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const existing = await findExistingNamedRecord('financial_accounts', {
    name: getEntityName(input.platform, input.name),
    workspaceId: input.workspaceId
  });

  if (existing) {
    return existing.id;
  }

  const currency = input.currency.toUpperCase();
  const { data: account, error: accountError } = await supabase
    .from('financial_accounts')
    .insert({
      currency,
      name: getEntityName(input.platform, input.name),
      status: 'active',
      type: input.type,
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

  if (accountError) {
    throw accountError;
  }

  const { error: balanceError } = await supabase.from('account_balances').insert({
    account_id: account.id,
    available_balance: Math.abs(input.value),
    balance: Math.abs(input.value),
    captured_at: `${input.snapshotDate}T12:00:00.000Z`,
    currency,
    source: 'manual',
    workspace_id: input.workspaceId
  });

  if (balanceError) {
    throw balanceError;
  }

  return account.id;
}

async function ensureAsset(input: {
  workspaceId: string;
  platform?: string | null;
  name: string;
  type: 'security' | 'crypto' | 'real_estate' | 'vehicle' | 'other';
  currency: string;
  value: number;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const existing = await findExistingNamedRecord('assets', {
    name: getEntityName(input.platform, input.name),
    workspaceId: input.workspaceId
  });

  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from('assets')
    .insert({
      currency: input.currency.toUpperCase(),
      manual_value: Math.abs(input.value),
      metadata: {
        platform: normalizeOptionalText(input.platform)
      },
      name: getEntityName(input.platform, input.name),
      provider: normalizeOptionalText(input.platform),
      status: 'active',
      type: input.type,
      workspace_id: input.workspaceId
    })
    .select('id')
    .single<{ id: string }>();

  if (error) {
    throw error;
  }

  return data.id;
}

function groupSnapshotItems(
  items: PatrimonialSnapshotItem[],
  getKey: (item: PatrimonialSnapshotItem) => string
) {
  const groups = new Map<string, SnapshotGroup>();

  items.forEach((item) => {
    const key = getKey(item) || 'Manual';
    const current = groups.get(key) ?? {
      itemCount: 0,
      key,
      label: key,
      total: 0
    };

    groups.set(key, {
      ...current,
      itemCount: current.itemCount + 1,
      total: current.total + item.value
    });
  });

  return [...groups.values()].sort(
    (left, right) => Math.abs(right.total) - Math.abs(left.total)
  );
}

function getEntityName(platform: string | null | undefined, name: string) {
  const normalizedPlatform = normalizeOptionalText(platform);

  if (
    !normalizedPlatform ||
    normalizedPlatform.toLowerCase() === name.trim().toLowerCase()
  ) {
    return name.trim();
  }

  return `${normalizedPlatform} - ${name.trim()}`;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}

async function findExistingNamedRecord(
  table: 'financial_accounts' | 'assets',
  input: { workspaceId: string; name: string }
) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data, error } = await supabase
    .from(table)
    .select('id, name')
    .eq('workspace_id', input.workspaceId)
    .ilike('name', input.name)
    .limit(1)
    .maybeSingle<ExistingNamedRecord>();

  if (error) {
    throw error;
  }

  return data;
}

function isAccountSnapshotItem(type: SnapshotItemType) {
  return type === 'bank_account' || type === 'broker' || type === 'cash';
}

function isAssetSnapshotItem(type: SnapshotItemType) {
  return (
    type === 'fund' ||
    type === 'etf' ||
    type === 'stock' ||
    type === 'crypto' ||
    type === 'real_estate' ||
    type === 'vehicle' ||
    type === 'other_asset'
  );
}

function mapSnapshotItemToAccountType(type: SnapshotItemType) {
  if (type === 'broker') {
    return 'brokerage';
  }

  if (type === 'cash') {
    return 'cash';
  }

  return 'checking';
}

function mapSnapshotItemToAssetType(type: SnapshotItemType) {
  if (type === 'crypto') {
    return 'crypto';
  }

  if (type === 'real_estate') {
    return 'real_estate';
  }

  if (type === 'vehicle') {
    return 'vehicle';
  }

  if (type === 'other_asset') {
    return 'other';
  }

  return 'security';
}
