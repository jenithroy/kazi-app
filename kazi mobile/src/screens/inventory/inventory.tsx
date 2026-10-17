import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { useToast } from '@/components/toast/toast-provider';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { Icon } from '@/components/ui/icon';
import { PermissionNotice } from '@/components/ui/permission-notice';
import { isBlocked, ScreenGate } from '@/components/ui/screen-gate';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SearchField } from '@/components/ui/search-field';
import { TabStrip, type TabDef } from '@/components/ui/tab-strip';
import { useModulePresentation } from '@/components/tab-bar/use-own-tab';
import { useBackHandler } from '@/lib/use-back-handler';
import { useScrollTop } from '@/lib/use-scroll-top';
import { useTheme } from '@/theme/theme-provider';
import { fontFamily } from '@/theme';
import {
  useAddStockItem,
  useDeleteFabric,
  useDeleteProcess,
  useDeleteTechPack,
  useFabrics,
  useItemCosts,
  usePostStockMovement,
  useProcesses,
  useRestoreInventory,
  useSaveFabric,
  useSaveProcess,
  useSaveTechPack,
  useStock,
  useStockMovements,
  useTechPacks,
  useUpdateStockItem,
} from '@/data/inventory/hooks';
import { fabricDraft, processDraft, techPackDraft } from '@/data/inventory/library';
import { AttachmentError, pickLibraryImage, type LibraryPickSource } from '@/data/inventory/media';
import { costFor, costTotal, stockLevel } from '@/data/inventory/utils';
import type {
  Fabric,
  FabricDraft,
  ItemCost,
  Process,
  ProcessDraft,
  StockDetailsDraft,
  StockItem,
  StockMovementDraft,
  TechPack,
  TechPackDraft,
} from '@/data/inventory/types';
import { MediaViewer } from '@/screens/chat/media-viewer';
import type { Attachment } from '@/data/chat/types';

import { AddSheet, type AddDraft, type UploadEntry } from './add-sheet';
import { AdjustSheet } from './adjust-sheet';
import { DetailView } from './detail-view';
import { EditSheet } from './edit-sheet';
import { FabricEditor } from './fabric-editor';
import { FabricsView } from './fabrics-view';
import { ItemCostsView, type CostRow } from './item-costs-view';
import { PhotoSourceSheet } from './photo-source-sheet';
import { ProcessEditor } from './process-editor';
import { ProcessesView } from './processes-view';
import { StockView, matchesStockFilter, stockFilterOf, type StockFilter } from './stock-view';
import { TechPackEditor } from './tech-pack-editor';
import { TechPacksView, techPackSizes } from './tech-packs-view';

/**
 * The reference `Inventory.jsx` is one page over eight tabs. Mobile carries
 * five of them, and shows them library-first:
 *   - `fabrics` / `processes` / `tech-packs` are the product library, one tab
 *     each. They lead because they are what this screen is opened for — a
 *     fabric spec, a process rate, a tech pack measurement — and because they
 *     are the three that can be edited here.
 *   - `stock` merges upstream's "Stock Levels" and "Item Details" — a phone has
 *     no room for two tables over the same rows, so the detail columns live in
 *     the per-item view mobile already had.
 *   - `costs` is upstream's "Items Cost", read from `product_costs` rather than
 *     the orphaned `unit_economics` rows (see `ItemCost`). It and Stock sit
 *     last: they are the money end of the page, and both are read far less
 *     often than the library in front of them.
 *
 * Dropped on purpose: "Stock Ledger" (`stock_movements` has never been written
 * to) and "Samples" (0 rows since the table was created).
 */
type InventoryTabId = 'fabrics' | 'processes' | 'tech-packs' | 'stock' | 'costs';

const HOME_TAB: InventoryTabId = 'fabrics';

const SEARCH_PLACEHOLDER: Record<InventoryTabId, string> = {
  fabrics: 'Search fabric, trim or composition…',
  processes: 'Search process or category…',
  'tech-packs': 'Search style, product or designer…',
  stock: 'Search item, code or supplier…',
  costs: 'Search item or code…',
};

/**
 * An open library record. `id` is null while adding; `original` is what the
 * draft is measured against to know whether there is anything to save.
 */
type Editing =
  | { kind: 'fabric'; id: string | null; draft: FabricDraft; original: FabricDraft }
  | { kind: 'process'; id: string | null; draft: ProcessDraft; original: ProcessDraft }
  | { kind: 'tech-pack'; id: string | null; draft: TechPackDraft; original: TechPackDraft };

/** Which image slot a picked photo belongs in. */
type PickSlot = 'swatch' | 'front' | 'back' | 'page';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err ?? 'Something went wrong'));

function emptyDraft(): AddDraft {
  return { name: '', sku: '', qty: '', threshold: '', unit: 'm', kind: 'Sketch', note: '' };
}

function emptyMovementDraft(): StockMovementDraft {
  return { kind: 'out', qty: '', reason: '', ref: '' };
}

/** A remote library image, dressed as the attachment the shared viewer expects. */
function imageAttachment(url: string, name: string): Attachment {
  return { kind: 'image', path: url, name, mime: 'image/*', size: 0, url };
}

export function Inventory() {
  const theme = useTheme();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('inventory');
  // The three library tables are gated on their own Postgres section, and two
  // positions read them without being allowed to touch them. Editing them off
  // the stock grant would put a Save button in front of someone the database
  // will refuse.
  const canEditLibrary = can('library');

  const stockQuery = useStock();
  const { data: stock } = stockQuery;
  const fabricsQuery = useFabrics();
  const { data: fabrics } = fabricsQuery;
  const processesQuery = useProcesses();
  const { data: processes } = processesQuery;
  const techPacksQuery = useTechPacks();
  const { data: techPacks } = techPacksQuery;
  const costsQuery = useItemCosts();
  const { data: itemCosts } = costsQuery;
  const movementsQuery = useStockMovements();
  const { data: movements } = movementsQuery;

  const addStockItem = useAddStockItem();
  const postMovement = usePostStockMovement();
  const updateStockItem = useUpdateStockItem();
  const restoreInventory = useRestoreInventory();

  const saveFabric = useSaveFabric();
  const deleteFabric = useDeleteFabric();
  const saveProcess = useSaveProcess();
  const deleteProcess = useDeleteProcess();
  const saveTechPack = useSaveTechPack();
  const deleteTechPack = useDeleteTechPack();

  const { showBack, bottomInset } = useModulePresentation('inventory');

  const [tab, setTab] = useState<InventoryTabId>(HOME_TAB);
  const scrollRef = useScrollTop(tab);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<AddDraft>(emptyDraft());
  const [uploads, setUploads] = useState<UploadEntry[]>([]);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moveDraft, setMoveDraft] = useState<StockMovementDraft>(emptyMovementDraft());
  const [editOpen, setEditOpen] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<StockDetailsDraft>({ threshold: '', location: '', cost: '', supplier: '' });

  // `editing` is the record the sheet holds and `editorOpen` is whether it is
  // up. They are separate so the sheet still has something to render while it
  // animates out — clearing the record on close would blank it mid-slide.
  const [editing, setEditing] = useState<Editing | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pickSlot, setPickSlot] = useState<PickSlot | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<PickSlot | null>(null);
  // The add sheet's photo picker, kept apart from the library editors' slots so
  // the two flows can't inherit each other's open sheet.
  const [stockPickOpen, setStockPickOpen] = useState(false);
  const [stockUploading, setStockUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState<Attachment | null>(null);

  // Gated on the sheet being up: a draft left behind a closed sheet must not
  // read as dirty, or the next record to open inherits its unsaved state.
  const editorDirty = editorOpen && editing ? JSON.stringify(editing.draft) !== JSON.stringify(editing.original) : false;
  const editorSaving = saveFabric.isPending || saveProcess.isPending || saveTechPack.isPending;
  const editorDeleting = deleteFabric.isPending || deleteProcess.isPending || deleteTechPack.isPending;

  // Everything below the tab strip is a view inside this route, so back unwinds
  // them in the order they were opened before it gives up the screen. The
  // editors are not in the list: they are sheets, and a sheet is a Modal that
  // takes Android back through its own `blockClose` guard.
  useBackHandler(() => {
    if (viewerImage) {
      setViewerImage(null);
      return true;
    }
    if (selectedId) {
      setSelectedId(null);
      return true;
    }
    if (tab !== HOME_TAB) {
      setTab(HOME_TAB);
      setQuery('');
      return true;
    }
    return false;
  });

  const q = query.trim().toLowerCase();

  const lowItems = useMemo(() => (stock ?? []).filter((s) => stockLevel(s) === 'low'), [stock]);

  const stockFilterCounts = useMemo(
    () =>
      ({
        all: (stock ?? []).length,
        low: (stock ?? []).filter((s) => stockLevel(s) === 'low').length,
        raw: (stock ?? []).filter((s) => stockFilterOf(s) === 'raw').length,
        finished: (stock ?? []).filter((s) => stockFilterOf(s) === 'finished').length,
        trims: (stock ?? []).filter((s) => stockFilterOf(s) === 'trims').length,
      }) satisfies Record<StockFilter, number>,
    [stock],
  );

  const stockRows = useMemo(
    () =>
      (stock ?? [])
        .filter((s) => matchesStockFilter(s, filter))
        .filter((s) => !q || `${s.name} ${s.sku} ${s.supplier} ${s.category}`.toLowerCase().includes(q)),
    [stock, filter, q],
  );

  const costRows = useMemo<CostRow[]>(
    () =>
      (itemCosts ?? [])
        .map((cost: ItemCost) => ({ cost, item: (stock ?? []).find((s) => costFor(s, [cost])) ?? null }))
        .filter(({ cost, item }) => !q || `${cost.code} ${cost.name} ${item?.name ?? ''}`.toLowerCase().includes(q)),
    [itemCosts, stock, q],
  );

  const fabricRows = useMemo(
    () =>
      (fabrics ?? []).filter(
        (f) =>
          !q || `${f.name} ${f.type} ${f.composition} ${f.supplier} ${f.status} ${f.colors.join(' ')}`.toLowerCase().includes(q),
      ),
    [fabrics, q],
  );

  const processRows = useMemo(
    () => (processes ?? []).filter((p) => !q || `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q)),
    [processes, q],
  );

  const techPackRows = useMemo(
    () =>
      (techPacks ?? []).filter(
        (p) =>
          !q ||
          `${p.name} ${p.styleNo} ${p.productType} ${p.category} ${p.season} ${p.market} ${p.designer} ${techPackSizes(p)}`
            .toLowerCase()
            .includes(q),
      ),
    [techPacks, q],
  );

  const stockValueNPR = useMemo(
    () =>
      (stock ?? []).reduce((n, s) => {
        // Prefer the item's own unit cost and fall back to the costed
        // breakdown for its product code — the only figure some rows have.
        const linked = costFor(s, itemCosts ?? []);
        const unit = s.unitCostNPR || (linked ? costTotal(linked) : 0);
        return n + s.qty * unit;
      }, 0),
    [stock, itemCosts],
  );

  if (
    isBlocked(stockQuery, fabricsQuery, processesQuery, techPacksQuery, costsQuery, movementsQuery) ||
    !stock ||
    !fabrics ||
    !processes ||
    !techPacks ||
    !itemCosts ||
    !movements
  ) {
    return (
      <ScreenGate
        queries={[stockQuery, fabricsQuery, processesQuery, techPacksQuery, costsQuery, movementsQuery]}
        // No subtitle: every count in it is read off the data being waited for.
        header={<ScreenHeader showBack={showBack} title="Inventory" />}
      />
    );
  }

  const selectedItem = stock.find((s) => s.id === selectedId) ?? null;
  // The stock item's costed material, looked up in the library by name the way
  // the reference's `findFabricInLibrary` does. Undefined on a row that names no
  // material, or names one the library has never had — the detail view then
  // leaves the card out rather than showing a link that goes nowhere.
  const linkedFabricName = selectedItem?.fabricName.trim().toLowerCase();
  const linkedFabric = linkedFabricName
    ? fabrics.find((f) => f.name.trim().toLowerCase() === linkedFabricName)
    : undefined;
  const flash = (message: string) => toast.show({ message, tone: 'ok' });
  const complain = (err: unknown) => toast.show({ message: messageOf(err), tone: 'bad' });

  const tabs: TabDef<InventoryTabId>[] = [
    { id: 'fabrics', label: 'Fabrics & trims', count: fabrics.length },
    { id: 'processes', label: 'Processes', count: processes.length },
    { id: 'tech-packs', label: 'Tech packs', count: techPacks.length },
    { id: 'stock', label: 'Stock', count: stock.length },
    { id: 'costs', label: 'Items cost', count: itemCosts.length },
  ];

  const goTab = (id: InventoryTabId) => {
    setTab(id);
    setQuery('');
  };

  // ---- The product library -------------------------------------------------

  const openFabric = (fabric: Fabric | null) => {
    const next = fabricDraft(fabric);
    setEditing({ kind: 'fabric', id: fabric?.id ?? null, draft: next, original: next });
    setEditorOpen(true);
  };
  const openProcess = (process: Process | null) => {
    const next = processDraft(process);
    setEditing({ kind: 'process', id: process?.id ?? null, draft: next, original: next });
    setEditorOpen(true);
  };
  const openTechPack = (pack: TechPack | null) => {
    const next = techPackDraft(pack, techPacks);
    setEditing({ kind: 'tech-pack', id: pack?.id ?? null, draft: next, original: next });
    setEditorOpen(true);
  };

  /** Add a record of whatever the current library tab holds. */
  const openLibraryAdd = () => {
    if (!canEditLibrary) return;
    if (tab === 'fabrics') openFabric(null);
    else if (tab === 'processes') openProcess(null);
    else if (tab === 'tech-packs') openTechPack(null);
  };

  const patchEditing = (patch: Partial<FabricDraft & ProcessDraft & TechPackDraft>) =>
    setEditing((current) => (current ? ({ ...current, draft: { ...current.draft, ...patch } } as Editing) : current));

  /**
   * Put the sheet down. The record itself is left alone — it has to stay
   * mounted through the exit animation, and rewinding the draft here would
   * show the pre-edit values sliding away after a successful save.
   */
  const closeEditor = () => {
    setEditorOpen(false);
    setPickSlot(null);
    setUploadingSlot(null);
  };

  const discardEditor = () => {
    if (editorDirty) toast.show({ message: 'Changes discarded', tone: 'bad' });
    closeEditor();
  };

  const handleSaveEditor = () => {
    if (!editing) return;
    const done = (label: string) => {
      closeEditor();
      flash(`${label || 'Record'} saved`);
    };
    if (editing.kind === 'fabric') {
      const { id, draft: d } = editing;
      saveFabric.mutate({ id, draft: d }, { onSuccess: () => done(d.name.trim()), onError: complain });
    } else if (editing.kind === 'process') {
      const { id, draft: d } = editing;
      saveProcess.mutate({ id, draft: d }, { onSuccess: () => done(d.name.trim()), onError: complain });
    } else {
      const { id, draft: d } = editing;
      saveTechPack.mutate({ id, draft: d }, { onSuccess: () => done(d.name.trim()), onError: complain });
    }
  };

  const handleDeleteEditor = () => {
    if (!editing?.id) return;
    const { kind, id } = editing;
    const label = editing.draft.name.trim() || 'Record';
    const options = {
      onSuccess: () => {
        setDeleteOpen(false);
        closeEditor();
        flash(`${label} deleted`);
      },
      onError: (err: unknown) => {
        setDeleteOpen(false);
        complain(err);
      },
    };
    if (kind === 'fabric') deleteFabric.mutate(id, options);
    else if (kind === 'process') deleteProcess.mutate(id, options);
    else deleteTechPack.mutate(id, options);
  };

  /** Pick a photo for `pickSlot` and drop the resulting URL into the draft. */
  const handlePickPhoto = async (source: LibraryPickSource) => {
    const slot = pickSlot;
    setPickSlot(null);
    if (!slot || !editing) return;
    setUploadingSlot(slot);
    try {
      const folder = slot === 'swatch' ? 'fabrics' : 'patterns';
      const tag = slot === 'swatch' ? 'swatch' : slot === 'page' ? 'page' : slot;
      const url = await pickLibraryImage(source, folder, tag);
      if (!url) return;
      if (slot === 'swatch') patchEditing({ swatchUrl: url });
      else if (slot === 'front') patchEditing({ frontSketchUrl: url });
      else if (slot === 'back') patchEditing({ backSketchUrl: url });
      // A page appends, so it has to read the draft as it is *now* — the upload
      // took seconds and the form was editable throughout.
      else {
        setEditing((current) =>
          current?.kind === 'tech-pack'
            ? { ...current, draft: { ...current.draft, images: [...current.draft.images, url] } }
            : current,
        );
      }
    } catch (err) {
      toast.show({ message: err instanceof AttachmentError ? err.message : messageOf(err), tone: 'bad' });
    } finally {
      setUploadingSlot(null);
    }
  };

  // ---- Stock ---------------------------------------------------------------

  const openAdd = () => {
    if (!canEdit) return;
    setDraft(emptyDraft());
    setUploads([]);
    setStep(1);
    setAddOpen(true);
  };
  const patchDraft = (patch: Partial<AddDraft>) => setDraft((d) => ({ ...d, ...patch }));

  /** The real picker and the real bucket — the same path the library editors use. */
  const handlePickStockPhoto = async (source: LibraryPickSource) => {
    setStockPickOpen(false);
    setStockUploading(true);
    try {
      const url = await pickLibraryImage(source, 'fabrics', 'stock');
      if (!url) return;
      setUploads((u) => [...u, { name: url.split('/').pop() ?? 'photo.jpg', meta: 'Uploaded just now', url }]);
    } catch (err) {
      toast.show({ message: err instanceof AttachmentError ? err.message : messageOf(err), tone: 'bad' });
    } finally {
      setStockUploading(false);
    }
  };
  const handleRemoveUpload = (index: number) => setUploads((u) => u.filter((_, i) => i !== index));

  const handleAddNext = () => {
    if (step < 3) {
      setStep((s) => (s + 1) as 1 | 2 | 3);
      return;
    }
    const name = draft.name.trim() || 'Untitled item';
    const qty = parseInt(draft.qty, 10) || 0;
    const threshold = parseInt(draft.threshold, 10) || 0;
    // Everything the sheet does not ask for stays empty, and the writer turns
    // that into a null column rather than inventing a supplier or a category.
    const newItem: StockItem = {
      id: `new${Date.now()}`,
      name,
      sku: draft.sku.trim(),
      supplier: '',
      category: '',
      qty,
      opening: qty,
      stockIn: 0,
      stockUsed: 0,
      threshold,
      unit: draft.unit,
      swatch: '#E7E9E2',
      swatchFg: '#3B4F47',
      swatchLabel: (draft.sku.trim() || name).replace(/^#/, '').slice(0, 3).toUpperCase(),
      lead: '',
      location: '',
      cost: '',
      unitCostNPR: 0,
      owner: '',
      condition: '',
      lastUpdated: new Date().toISOString().slice(0, 10),
      batches: '',
      fabricName: '',
    };
    addStockItem.mutate(newItem, { onSuccess: () => flash(`${name} added`), onError: complain });
    setAddOpen(false);
  };

  const openAdjust = () => {
    if (!canEdit) return;
    setMoveDraft(emptyMovementDraft());
    setAdjustOpen(true);
  };

  const handlePostMovement = () => {
    if (!selectedItem) return;
    const qty = parseInt(moveDraft.qty.replace(/[^0-9]/g, ''), 10) || 0;
    if (qty <= 0 && !(moveDraft.kind === 'adjust' && moveDraft.qty.trim() !== '')) {
      toast.show({ message: 'Enter a quantity', tone: 'bad' });
      return;
    }
    const beforeStock = stock;
    const beforeMoves = movements;
    const item = selectedItem;
    const verb = moveDraft.kind === 'in' ? 'stocked in' : moveDraft.kind === 'out' ? 'issued' : 'adjusted';
    postMovement.mutate(
      {
        itemId: item.id,
        kind: moveDraft.kind,
        qty,
        reason: moveDraft.reason.trim(),
        ref: moveDraft.ref.trim(),
      },
      {
        onSuccess: () =>
          toast.show({
            message: `${item.name} · ${qty.toLocaleString()} ${item.unit} ${verb}`,
            tone: 'ok',
            // Undo deletes the ledger row that was just posted, so the on-hand
            // figure goes back for real and not only on screen.
            action: { label: 'Undo', onPress: () => restoreInventory.mutate({ stock: beforeStock, movements: beforeMoves }) },
          }),
      },
    );
    setAdjustOpen(false);
  };

  const openEdit = () => {
    if (!selectedItem || !canEdit) return;
    setDetailsDraft({
      threshold: String(selectedItem.threshold),
      location: selectedItem.location,
      cost: selectedItem.cost,
      supplier: selectedItem.supplier,
    });
    setEditOpen(true);
  };

  const handleSaveDetails = () => {
    if (!selectedItem) return;
    const item = selectedItem;
    const threshold = parseInt(detailsDraft.threshold.replace(/[^0-9]/g, ''), 10);
    updateStockItem.mutate(
      {
        id: item.id,
        updates: {
          threshold: Number.isFinite(threshold) ? threshold : item.threshold,
          location: detailsDraft.location.trim() || item.location,
          cost: detailsDraft.cost.trim() || item.cost,
          supplier: detailsDraft.supplier.trim() || item.supplier,
        },
      },
      { onSuccess: () => flash(`${item.name} updated`), onError: complain },
    );
    setEditOpen(false);
  };

  const openDocument = async (url: string) => {
    const ok = await Linking.canOpenURL(url);
    if (!ok) {
      toast.show({ message: 'That document could not be opened', tone: 'bad' });
      return;
    }
    await Linking.openURL(url);
  };

  if (selectedItem) {
    return (
      <>
        <DetailView
          item={selectedItem}
          movements={movements.filter((m) => m.itemId === selectedItem.id)}
          linkedFabric={linkedFabric}
          onBack={() => setSelectedId(null)}
          onRaisePO={() => flash(`PO draft started for ${selectedItem.sku}`)}
          onAdjust={canEdit ? openAdjust : undefined}
          onEditDetails={canEdit ? openEdit : undefined}
        />
        <AdjustSheet
          visible={adjustOpen}
          item={selectedItem}
          draft={moveDraft}
          onClose={() => setAdjustOpen(false)}
          onChange={(p) => setMoveDraft((d) => ({ ...d, ...p }))}
          onSubmit={handlePostMovement}
        />
        <EditSheet
          visible={editOpen}
          item={selectedItem}
          draft={detailsDraft}
          onClose={() => setEditOpen(false)}
          onChange={(p) => setDetailsDraft((d) => ({ ...d, ...p }))}
          onSubmit={handleSaveDetails}
        />
      </>
    );
  }

  const libraryTab = tab === 'fabrics' || tab === 'processes' || tab === 'tech-packs';
  const addLabel = tab === 'fabrics' ? 'Add fabric' : tab === 'processes' ? 'Add process' : 'Add tech pack';
  const showAddButton = libraryTab ? canEditLibrary : tab === 'stock' && canEdit;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScreenHeader
        showBack={showBack}
        title="Inventory"
        subtitle={`${fabrics.length} fabrics · ${techPacks.length} tech packs · ${stock.length} items`}
      />

      {/* Air between the header and the pills. Finance has its KPI strip in
          this gap; Inventory has nothing, and without it the first pill reads
          as part of the title block. */}
      <View style={styles.tabSpacer}>
        <TabStrip tabs={tabs} active={tab} onChange={goTab} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: 110 + bottomInset }]}
        keyboardShouldPersistTaps="handled"
      >
        <PermissionNotice section="inventory" />

        <SearchField value={query} onChange={setQuery} placeholder={SEARCH_PLACEHOLDER[tab]} />

        {tab === 'fabrics' ? (
          <FabricsView fabrics={fabricRows} query={query} onOpen={openFabric} />
        ) : tab === 'processes' ? (
          <ProcessesView processes={processRows} query={query} onOpen={openProcess} />
        ) : tab === 'tech-packs' ? (
          <TechPacksView techPacks={techPackRows} query={query} onOpen={openTechPack} />
        ) : tab === 'stock' ? (
          <StockView
            items={stockRows}
            totalCount={stock.length}
            filter={filter}
            filterCounts={stockFilterCounts}
            onFilterChange={setFilter}
            lowCount={lowItems.length}
            stockValueNPR={stockValueNPR}
            onOpen={(item) => setSelectedId(item.id)}
          />
        ) : (
          <ItemCostsView rows={costRows} query={query} />
        )}
      </ScrollView>

      {showAddButton ? (
        <Pressable
          onPress={libraryTab ? openLibraryAdd : openAdd}
          style={[
            styles.fab,
            {
              bottom: 24 + bottomInset,
              backgroundColor: theme.accent,
              boxShadow: theme.scheme === 'light' ? '0 12px 26px -12px rgba(20,122,87,0.95)' : undefined,
            },
          ]}
        >
          <Icon name="plus" size={18} color={theme.accentText} />
          <Text style={[styles.fabLabel, { color: theme.accentText }]}>{libraryTab ? addLabel : 'Add item'}</Text>
        </Pressable>
      ) : null}

      <AddSheet
        visible={addOpen}
        isFabric
        step={step}
        draft={draft}
        uploads={uploads}
        uploading={stockUploading}
        onClose={() => setAddOpen(false)}
        onChange={patchDraft}
        onUpload={() => setStockPickOpen(true)}
        onRemoveUpload={handleRemoveUpload}
        onBack={() => setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3)}
        onNext={handleAddNext}
      />

      <PhotoSourceSheet
        visible={stockPickOpen}
        title="Item photo"
        onClose={() => setStockPickOpen(false)}
        onPick={handlePickStockPhoto}
      />

      {/* One sheet per kind, each holding the record only while it is the open
          one. They mount beside the list rather than replacing it, so closing
          returns you to exactly the scroll position you left. */}
      {editing?.kind === 'fabric' ? (
        <FabricEditor
          visible={editorOpen}
          isNew={editing.id === null}
          draft={editing.draft}
          dirty={editorDirty}
          saving={editorSaving}
          uploading={uploadingSlot === 'swatch'}
          editable={canEditLibrary}
          onChange={patchEditing}
          onPickSwatch={() => setPickSlot('swatch')}
          onOpenSwatch={() => setViewerImage(imageAttachment(editing.draft.swatchUrl, editing.draft.name))}
          onClose={closeEditor}
          onDiscard={discardEditor}
          onSave={handleSaveEditor}
          onDelete={canEditLibrary ? () => setDeleteOpen(true) : undefined}
        />
      ) : editing?.kind === 'process' ? (
        <ProcessEditor
          visible={editorOpen}
          isNew={editing.id === null}
          draft={editing.draft}
          dirty={editorDirty}
          saving={editorSaving}
          editable={canEditLibrary}
          onChange={patchEditing}
          onClose={closeEditor}
          onDiscard={discardEditor}
          onSave={handleSaveEditor}
          onDelete={canEditLibrary ? () => setDeleteOpen(true) : undefined}
        />
      ) : editing?.kind === 'tech-pack' ? (
        <TechPackEditor
          visible={editorOpen}
          isNew={editing.id === null}
          draft={editing.draft}
          fabrics={fabrics}
          dirty={editorDirty}
          saving={editorSaving}
          uploading={uploadingSlot === 'swatch' ? null : uploadingSlot}
          editable={canEditLibrary}
          onChange={patchEditing}
          onPickImage={setPickSlot}
          onOpenImage={(url, title) => setViewerImage(imageAttachment(url, title))}
          onOpenDocument={openDocument}
          onClose={closeEditor}
          onDiscard={discardEditor}
          onSave={handleSaveEditor}
          onDelete={canEditLibrary ? () => setDeleteOpen(true) : undefined}
        />
      ) : null}

      <PhotoSourceSheet
        visible={pickSlot !== null}
        title={pickSlot === 'swatch' ? 'Swatch photo' : pickSlot === 'page' ? 'Tech pack page' : 'Sketch'}
        onClose={() => setPickSlot(null)}
        onPick={handlePickPhoto}
      />

      <ConfirmSheet
        visible={deleteOpen}
        title={`Delete ${editing?.draft.name.trim() || 'this record'}?`}
        body="It goes from the web app too — this is the same row the ERP reads. Nothing else on this screen links to it, so nothing else breaks."
        confirmLabel="Delete"
        busy={editorDeleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={handleDeleteEditor}
      />

      <MediaViewer attachment={viewerImage} onClose={() => setViewerImage(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabSpacer: { paddingTop: 14 },
  content: { padding: 20, paddingTop: 4, paddingBottom: 110, gap: 12 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 52,
    paddingLeft: 17,
    paddingRight: 20,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  fabLabel: { fontFamily: fontFamily.semibold, fontSize: 14.5 },
});
