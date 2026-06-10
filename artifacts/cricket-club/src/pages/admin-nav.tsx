import { useMemo, useState } from "react";
import {
  useListNavItems,
  useGetNavOptions,
  useCreateNavItem,
  useUpdateNavItem,
  useDeleteNavItem,
  useReorderNavItems,
  getListNavItemsQueryKey,
  type NavItem,
  type NavSurface,
  type NavOptions,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  GripVertical,
} from "lucide-react";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { navIcon, NAV_ICON_MAP } from "@/lib/nav-icons";
import {
  ListSkeleton,
  LoadingState,
  QueryError,
  EmptyState,
} from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const SURFACES: { surface: NavSurface; title: string; blurb: string; hasDescription: boolean; section: "senior" | "junior" | "admin" }[] = [
  {
    surface: "senior_menu",
    title: "Senior top menu",
    blurb: 'Links in the main (senior) navigation bar. The "Admin" link is added automatically for signed-in admins and is not listed here.',
    hasDescription: false,
    section: "senior",
  },
  {
    surface: "junior_menu",
    title: "Junior top menu",
    blurb: "Links shown in the navigation bar while browsing the Juniors section.",
    hasDescription: false,
    section: "junior",
  },
  {
    surface: "junior_quick_links",
    title: "Junior dashboard cards",
    blurb: "The quick-link cards on the Juniors landing page. These show an icon, a title and a short description.",
    hasDescription: true,
    section: "junior",
  },
  {
    surface: "admin_tiles",
    title: "Admin hub tiles",
    blurb: "The shortcut cards on this Admin hub. These show an icon, a title and a short description.",
    hasDescription: true,
    section: "admin",
  },
];

export default function AdminNav() {
  const optionsQ = useGetNavOptions();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Add, rename, reorder, hide or remove items across the site's menus and card grids.
          Each item can link to an internal page or an external website (external links open in a
          new tab). Changes take effect immediately on the public site.
        </p>
      </div>

      {optionsQ.isError ? (
        <QueryError onRetry={() => optionsQ.refetch()} />
      ) : optionsQ.isLoading ? (
        <ListSkeleton />
      ) : optionsQ.data ? (
        <div className="space-y-8">
          {SURFACES.map((s) => (
            <SurfaceSection key={s.surface} config={s} options={optionsQ.data} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-destructive">Failed to load navigation options.</div>
      )}
    </div>
  );
}

type SurfaceConfig = (typeof SURFACES)[number];

function SurfaceSection({ config, options }: { config: SurfaceConfig; options: NavOptions }) {
  const qc = useQueryClient();
  const { surface, title, blurb, hasDescription } = config;
  const listQ = useListNavItems({ surface, includeHidden: true });
  const items = useMemo(() => listQ.data ?? [], [listQ.data]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListNavItemsQueryKey({ surface, includeHidden: true }) });
  // Also refresh the public (visible-only) lists this surface feeds.
  const invalidateAll = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: getListNavItemsQueryKey({ surface }) });
  };

  const reorder = useReorderNavItems();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const commitOrder = (ordered: NavItem[]) => {
    setError(null);
    reorder.mutate(
      { data: { surface, ids: ordered.map((i) => i.id) } },
      { onSuccess: invalidateAll, onError: (e) => setError(handleAdminMutationError(e)) },
    );
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    commitOrder(next);
  };

  const reorderByDrag = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commitOrder(next);
  };

  const handleDragStart = (idx: number) => {
    setDragIndex(idx);
    setOverIndex(idx);
  };
  const handleDragOver = (idx: number) => {
    if (dragIndex === null) return;
    if (idx !== overIndex) setOverIndex(idx);
  };
  const handleDrop = () => {
    if (dragIndex !== null && overIndex !== null) reorderByDrag(dragIndex, overIndex);
    setDragIndex(null);
    setOverIndex(null);
  };
  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{blurb}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <div className="text-sm text-destructive">{error}</div>}
        {listQ.isError ? (
          <QueryError onRetry={() => listQ.refetch()} />
        ) : listQ.isLoading ? (
          <LoadingState label="Loading items…" />
        ) : items.length === 0 ? (
          <EmptyState title="No items yet" message="Add an item to this menu." />
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <NavItemRow
                key={item.id}
                item={item}
                index={idx}
                total={items.length}
                hasDescription={hasDescription}
                options={options}
                onMove={move}
                onChanged={invalidateAll}
                isDragging={dragIndex === idx}
                isDropTarget={dragIndex !== null && overIndex === idx && dragIndex !== idx}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}

        {adding ? (
          <NavItemEditor
            surface={surface}
            hasDescription={hasDescription}
            options={options}
            onCancel={() => setAdding(false)}
            onSaved={() => {
              setAdding(false);
              invalidateAll();
            }}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add item
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function NavItemRow({
  item,
  index,
  total,
  hasDescription,
  options,
  onMove,
  onChanged,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  item: NavItem;
  index: number;
  total: number;
  hasDescription: boolean;
  options: NavOptions;
  onMove: (idx: number, dir: -1 | 1) => void;
  onChanged: () => void;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateNavItem();
  const del = useDeleteNavItem();
  const Icon = navIcon(item.iconKey);

  const toggleVisible = () => {
    setError(null);
    update.mutate(
      { id: item.id, data: { visible: !item.visible } },
      { onSuccess: onChanged, onError: (e) => setError(handleAdminMutationError(e)) },
    );
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: "Delete item",
        description: `Delete "${item.label}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    del.mutate(
      { id: item.id },
      { onSuccess: onChanged, onError: (e) => setError(handleAdminMutationError(e)) },
    );
  };

  if (editing) {
    return (
      <NavItemEditor
        surface={item.surface}
        hasDescription={hasDescription}
        options={options}
        existing={item}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className={`flex items-center gap-3 border rounded-md p-3 transition-colors ${
        item.visible ? "" : "opacity-60"
      } ${isDragging ? "opacity-40 border-primary" : "border-border"} ${
        isDropTarget ? "border-primary border-dashed bg-primary/5" : ""
      }`}
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart(index);
        }}
        onDragEnd={onDragEnd}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none shrink-0"
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex flex-col">
        <button
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label="Move up"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
        <button
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          aria-label="Move down"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      </div>
      {Icon && <Icon className="h-5 w-5 text-primary shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="font-medium flex items-center gap-1.5">
          {item.label}
          {item.isExternal && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
        <div className="text-xs text-muted-foreground truncate">{item.target}</div>
        {hasDescription && item.description && (
          <div className="text-xs text-muted-foreground truncate">{item.description}</div>
        )}
        {error && <div className="text-xs text-destructive mt-1">{error}</div>}
      </div>
      <button
        className="text-muted-foreground hover:text-foreground"
        onClick={toggleVisible}
        disabled={update.isPending}
        aria-label={item.visible ? "Hide" : "Show"}
        title={item.visible ? "Visible — click to hide" : "Hidden — click to show"}
      >
        {item.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <button
        className="text-destructive hover:text-destructive/80 disabled:opacity-30"
        onClick={remove}
        disabled={del.isPending}
        aria-label="Delete"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function NavItemEditor({
  surface,
  hasDescription,
  options,
  existing,
  onCancel,
  onSaved,
}: {
  surface: NavSurface;
  hasDescription: boolean;
  options: NavOptions;
  existing?: NavItem;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [iconKey, setIconKey] = useState(existing?.iconKey ?? "");
  const [isExternal, setIsExternal] = useState(existing?.isExternal ?? false);
  const [target, setTarget] = useState(existing?.target ?? "");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateNavItem();
  const update = useUpdateNavItem();
  const pending = create.isPending || update.isPending;

  const iconKeys = options.icons;

  const save = () => {
    setError(null);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!target.trim()) {
      setError("Please choose a page or enter a URL.");
      return;
    }
    const common = {
      label: label.trim(),
      description: hasDescription ? description.trim() : "",
      iconKey,
      target: target.trim(),
      isExternal,
    };
    if (existing) {
      update.mutate(
        { id: existing.id, data: common },
        { onSuccess: onSaved, onError: (e) => setError(handleAdminMutationError(e)) },
      );
    } else {
      create.mutate(
        { data: { surface, ...common } },
        { onSuccess: onSaved, onError: (e) => setError(handleAdminMutationError(e)) },
      );
    }
  };

  return (
    <div className="border border-primary/40 rounded-md p-4 space-y-3 bg-muted/30">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label className="text-xs">Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Sponsors" />
        </div>
        <div>
          <Label className="text-xs">Icon</Label>
          <Select value={iconKey || "__none__"} onValueChange={(v) => setIconKey(v === "__none__" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {iconKeys.map((k) => {
                const Ic = NAV_ICON_MAP[k];
                return (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      {Ic && <Ic className="h-4 w-4" />} {k}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch checked={isExternal} onCheckedChange={(v) => { setIsExternal(v); setTarget(""); }} id={`ext-${existing?.id ?? "new"}`} />
        <Label htmlFor={`ext-${existing?.id ?? "new"}`} className="text-xs">
          External link (opens in a new tab)
        </Label>
      </div>

      {isExternal ? (
        <div>
          <Label className="text-xs">URL</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://example.com" />
        </div>
      ) : (
        <div>
          <Label className="text-xs">Page</Label>
          <Select value={target || undefined} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a page" />
            </SelectTrigger>
            <SelectContent>
              {options.internalTargets.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label} <span className="text-muted-foreground">({t.section})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasDescription && (
        <div>
          <Label className="text-xs">Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short text shown on the card"
          />
        </div>
      )}

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          {existing ? "Save" : "Add"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
