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

export type ContainerType = 'bank' | 'broker' | 'wallet' | 'exchange' | 'cash' | 'other';

export type AssetType =
  | 'cash'
  | 'fund'
  | 'etf'
  | 'stock'
  | 'crypto'
  | 'real_estate'
  | 'vehicle'
  | 'gold'
  | 'other'
  | 'liability';

export type PatrimonyAsset = {
  id: string;
  containerId: string | null;
  name: string;
  assetType: AssetType;
  legacyType: string;
  currency: string;
  quantity: number | null;
  manualValue: number;
  provider: string | null;
  notes: string | null;
};

export type FinancialContainer = {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  containerType: ContainerType;
  currency: string;
  assets: PatrimonyAsset[];
  totalValue: number;
};

export type PatrimonialSnapshotItem = {
  id: string;
  platform: string | null;
  name: string;
  type: SnapshotItemType;
  value: number;
  currency: string;
  linkedContainerId: string | null;
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

export type CreateStartingPointContainerInput = {
  localId: string;
  name: string;
  institution?: string | null;
  containerType: ContainerType;
  currency: string;
};

export type CreateStartingPointAssetInput = {
  containerLocalId?: string | null;
  name: string;
  assetType: AssetType;
  value: number;
  currency: string;
  quantity?: number | null;
  notes?: string | null;
};

export type CreateStartingPointInput = {
  workspaceId: string;
  snapshotDate: string;
  name: string;
  notes?: string | null;
  containers: CreateStartingPointContainerInput[];
  assets: CreateStartingPointAssetInput[];
  debts: CreateStartingPointAssetInput[];
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
  linked_container_id: string | null;
  linked_account_id: string | null;
  linked_asset_id: string | null;
  notes: string | null;
};

type ExistingNamedRecord = {
  id: string;
  name: string;
};

type ContainerRecord = {
  id: string;
  workspace_id: string;
  name: string;
  institution: string | null;
  container_type: ContainerType;
  currency: string;
};

type AssetRecord = {
  id: string;
  container_id: string | null;
  name: string;
  asset_type: AssetType | null;
  type: string;
  currency: string;
  quantity: number | string | null;
  manual_value: number | string | null;
  provider: string | null;
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
    .select(
      'id, platform, name, type, value, currency, linked_container_id, linked_account_id, linked_asset_id, notes'
    )
    .eq('snapshot_id', snapshot.id)
    .order('created_at', { ascending: true })
    .returns<SnapshotItemRecord[]>();

  if (itemsError) {
    throw itemsError;
  }

  return mapSnapshot(snapshot, items);
}

export async function listFinancialContainers(workspaceId: string) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const { data: containers, error: containersError } = await supabase
    .from('financial_containers')
    .select('id, workspace_id, name, institution, container_type, currency')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
    .returns<ContainerRecord[]>();

  if (containersError) {
    throw containersError;
  }

  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select(
      'id, container_id, name, asset_type, type, currency, quantity, manual_value, provider, notes'
    )
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .returns<AssetRecord[]>();

  if (assetsError) {
    throw assetsError;
  }

  const assetsByContainer = new Map<string, PatrimonyAsset[]>();
  const unassignedAssets: PatrimonyAsset[] = [];

  assets.map(mapAssetRecord).forEach((asset) => {
    if (!asset.containerId) {
      unassignedAssets.push(asset);
      return;
    }

    assetsByContainer.set(asset.containerId, [
      ...(assetsByContainer.get(asset.containerId) ?? []),
      asset
    ]);
  });

  const mappedContainers = containers.map((container) => {
    const containerAssets = assetsByContainer.get(container.id) ?? [];

    return {
      assets: containerAssets,
      containerType: container.container_type,
      currency: container.currency,
      id: container.id,
      institution: container.institution,
      name: container.name,
      totalValue: sumAssetValues(containerAssets),
      workspaceId: container.workspace_id
    } satisfies FinancialContainer;
  });

  if (unassignedAssets.length > 0) {
    mappedContainers.push({
      assets: unassignedAssets,
      containerType: 'other',
      currency: unassignedAssets[0]?.currency ?? 'EUR',
      id: 'unassigned',
      institution: 'Manual',
      name: 'Sin cuenta asignada',
      totalValue: sumAssetValues(unassignedAssets),
      workspaceId
    });
  }

  return mappedContainers;
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

export async function createPatrimonialStartingPoint(input: CreateStartingPointInput) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const containerEntries = await Promise.all(
    input.containers.map(async (container) => {
      const id = await ensureFinancialContainer({
        containerType: container.containerType,
        currency: container.currency,
        institution: container.institution,
        name: container.name,
        workspaceId: input.workspaceId
      });

      return [container.localId, id] as const;
    })
  );
  const containersByLocalId = new Map(containerEntries);

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

  const preparedAssets = await Promise.all(
    [...input.assets, ...input.debts].map(async (asset) => {
      const containerId = asset.containerLocalId
        ? (containersByLocalId.get(asset.containerLocalId) ?? null)
        : null;
      const platform = getContainerName(input.containers, asset.containerLocalId);
      const linkedAssetId = await ensureAsset({
        assetType: asset.assetType,
        containerId,
        currency: asset.currency,
        name: asset.name,
        notes: asset.notes,
        platform,
        quantity: asset.quantity,
        type: mapAssetTypeToLegacyType(asset.assetType),
        value: asset.value,
        workspaceId: input.workspaceId
      });

      return {
        asset,
        containerId,
        linkedAssetId,
        platform
      };
    })
  );

  if (preparedAssets.length === 0) {
    return;
  }

  const { error: itemsError } = await supabase.from('patrimonial_snapshot_items').insert(
    preparedAssets.map(({ asset, containerId, linkedAssetId, platform }) => ({
      currency: asset.currency.toUpperCase(),
      linked_asset_id: linkedAssetId,
      linked_container_id: containerId,
      name: asset.name,
      notes: asset.notes ?? null,
      platform,
      snapshot_id: snapshot.id,
      type: mapAssetTypeToSnapshotItemType(asset.assetType),
      value:
        asset.assetType === 'liability' ? -Math.abs(asset.value) : Math.abs(asset.value),
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
    linkedContainerId: item.linked_container_id,
    name: item.name,
    notes: item.notes,
    platform: item.platform,
    type: item.type,
    value: Number(item.value)
  }));
  const patrimonialItems = items.filter((item) => !isEmptyContainerSnapshotItem(item));
  const initialGrossWorth = patrimonialItems
    .filter((item) => item.type !== 'liability')
    .reduce((total, item) => total + Math.max(item.value, 0), 0);
  const initialDebt = patrimonialItems
    .filter((item) => item.type === 'liability')
    .reduce((total, item) => total + Math.abs(item.value), 0);

  return {
    id: snapshot.id,
    groupedByPlatform: groupSnapshotItems(
      patrimonialItems,
      (item) => item.platform ?? 'Manual'
    ),
    groupedByType: groupSnapshotItems(patrimonialItems, (item) => item.type),
    initialDebt,
    initialGrossWorth,
    initialNetWorth: initialGrossWorth - initialDebt,
    items: patrimonialItems,
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
  type: 'cash' | 'security' | 'crypto' | 'real_estate' | 'vehicle' | 'other';
  assetType?: AssetType;
  containerId?: string | null;
  currency: string;
  value: number;
  quantity?: number | null;
  notes?: string | null;
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
      asset_type: input.assetType ?? mapLegacyAssetTypeToAssetType(input.type),
      container_id: input.containerId ?? null,
      currency: input.currency.toUpperCase(),
      manual_value: Math.abs(input.value),
      metadata: {
        platform: normalizeOptionalText(input.platform)
      },
      name: getEntityName(input.platform, input.name),
      notes: normalizeOptionalText(input.notes),
      provider: normalizeOptionalText(input.platform),
      quantity: input.quantity ?? null,
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

async function ensureFinancialContainer(input: {
  workspaceId: string;
  name: string;
  institution?: string | null;
  containerType: ContainerType;
  currency: string;
}) {
  if (!supabase) {
    throw new Error('Supabase no esta configurado.');
  }

  const existing = await findExistingNamedRecord('financial_containers', {
    name: input.name,
    workspaceId: input.workspaceId
  });

  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from('financial_containers')
    .insert({
      container_type: input.containerType,
      currency: input.currency.toUpperCase(),
      institution: normalizeOptionalText(input.institution) ?? input.name.trim(),
      name: input.name.trim(),
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
  table: 'financial_accounts' | 'assets' | 'financial_containers',
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

function isEmptyContainerSnapshotItem(item: PatrimonialSnapshotItem) {
  return isAccountSnapshotItem(item.type) && item.value === 0 && !item.linkedAssetId;
}

function mapAssetRecord(asset: AssetRecord) {
  const assetType = asset.asset_type ?? mapLegacyAssetTypeToAssetType(asset.type);
  const value = Number(asset.manual_value ?? 0);

  return {
    assetType,
    containerId: asset.container_id,
    currency: asset.currency,
    id: asset.id,
    legacyType: asset.type,
    manualValue: assetType === 'liability' ? -Math.abs(value) : Math.abs(value),
    name: asset.name,
    notes: asset.notes,
    provider: asset.provider,
    quantity: asset.quantity === null ? null : Number(asset.quantity)
  } satisfies PatrimonyAsset;
}

function sumAssetValues(assets: PatrimonyAsset[]) {
  return assets.reduce((total, asset) => total + asset.manualValue, 0);
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

function mapLegacyAssetTypeToAssetType(type: string): AssetType {
  if (type === 'cash') {
    return 'cash';
  }

  if (type === 'crypto') {
    return 'crypto';
  }

  if (type === 'real_estate') {
    return 'real_estate';
  }

  if (type === 'vehicle') {
    return 'vehicle';
  }

  return 'other';
}

function mapAssetTypeToLegacyType(
  type: AssetType
): 'cash' | 'security' | 'crypto' | 'real_estate' | 'vehicle' | 'other' {
  if (type === 'cash') {
    return 'cash';
  }

  if (type === 'crypto') {
    return 'crypto';
  }

  if (type === 'real_estate') {
    return 'real_estate';
  }

  if (type === 'vehicle') {
    return 'vehicle';
  }

  return type === 'liability' ? 'other' : 'security';
}

function mapAssetTypeToSnapshotItemType(type: AssetType): SnapshotItemType {
  if (type === 'cash') {
    return 'cash';
  }

  if (type === 'fund') {
    return 'fund';
  }

  if (type === 'etf') {
    return 'etf';
  }

  if (type === 'stock') {
    return 'stock';
  }

  if (type === 'crypto') {
    return 'crypto';
  }

  if (type === 'real_estate') {
    return 'real_estate';
  }

  if (type === 'vehicle') {
    return 'vehicle';
  }

  if (type === 'liability') {
    return 'liability';
  }

  return 'other_asset';
}

function getContainerName(
  containers: CreateStartingPointContainerInput[],
  localId: string | null | undefined
) {
  if (!localId) {
    return null;
  }

  return containers.find((container) => container.localId === localId)?.name ?? null;
}
