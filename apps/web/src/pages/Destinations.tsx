import { useState, useEffect } from 'react';
import { RefreshCw, Check, Plus, Trash2, MapPin, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { destinationsApi, type Destination } from '@/lib/api';

type CommissionType = 'PERCENTAGE' | 'FIXED';
type FixedUnit = 'RAW';

interface DestinationForm {
  name: string;
  commission: string;
  commissionType: CommissionType;
  fixedUnit: FixedUnit;
}

const emptyForm: DestinationForm = { name: '', commission: '', commissionType: 'PERCENTAGE', fixedUnit: 'RAW' };

export function DestinationsPage() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [form, setForm] = useState<DestinationForm>({ ...emptyForm });
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DestinationForm>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await destinationsApi.list();
      setDestinations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load destinations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    setAdding(true);
    try {
      const created = await destinationsApi.create({
        name: form.name.trim(),
        commission: parseFloat(form.commission) || 0,
        commissionType: form.commissionType,
        fixedUnit: form.fixedUnit,
      });
      setDestinations((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ ...emptyForm });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create destination');
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (dest: Destination) => {
    setEditingId(dest.id);
    setEditForm({
      name: dest.name,
      commission: String(dest.commission || ''),
      commissionType: dest.commissionType,
      fixedUnit: dest.fixedUnit,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ ...emptyForm });
  };

  const handleUpdate = async () => {
    if (!editingId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const updated = await destinationsApi.update(editingId, {
        name: editForm.name.trim(),
        commission: parseFloat(editForm.commission) || 0,
        commissionType: editForm.commissionType,
        fixedUnit: editForm.fixedUnit,
      });
      setDestinations((prev) =>
        prev.map((d) => (d.id === editingId ? updated : d)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update destination');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await destinationsApi.delete(id);
      setDestinations((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete destination');
    } finally {
      setDeletingId(null);
    }
  };

  const commLabel = (d: { commissionType: CommissionType; fixedUnit: FixedUnit; commission: number | string }) => {
    const val = typeof d.commission === 'string' ? parseFloat(d.commission) || 0 : d.commission;
    if (d.commissionType === 'PERCENTAGE') return `${val}%`;
    return `${val} raw`;
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold text-text-primary">Receiving Destinations</h1>
        <div className="card p-8 text-center">
          <RefreshCw className="w-5 h-5 text-primary animate-spin mx-auto mb-3" />
          <p className="text-text-muted text-sm">Loading destinations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Receiving Destinations</h1>
          <p className="text-text-muted text-sm mt-0.5">Configure destinations and their commission fees</p>
        </div>
        <button onClick={fetchAll} className="btn-outline text-xs py-1.5 px-3 flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="card px-4 py-3 border-status-red/40 bg-status-red/5">
          <p className="text-status-red text-sm">{error}</p>
        </div>
      )}

      {/* Add new destination */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon"><Plus className="w-4 h-4" /></div>
            <h2 className="font-semibold text-[15px]">Add Destination</h2>
          </div>
        </div>
        <div className="px-5 py-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="text-xxs text-text-muted uppercase tracking-wider mb-1 block">Name</label>
            <input
              type="text"
              placeholder="e.g. Location X"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              className="w-full bg-terminal-surface-2 border border-terminal-border rounded-lg px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
            />
          </div>
          <div className="w-24">
            <label className="text-xxs text-text-muted uppercase tracking-wider mb-1 block">Commission</label>
            <input
              type="number"
              step="any"
              min="0"
              placeholder="0"
              value={form.commission}
              onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              className="w-full bg-terminal-surface-2 border border-terminal-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary text-right outline-none focus:border-primary"
            />
          </div>
          <div className="w-24">
            <label className="text-xxs text-text-muted uppercase tracking-wider mb-1 block">Type</label>
            <select
              value={form.commissionType}
              onChange={(e) => setForm((f) => ({ ...f, commissionType: e.target.value as CommissionType }))}
              className="w-full bg-terminal-surface-2 border border-terminal-border rounded-lg px-2 py-2 text-sm text-text-primary outline-none focus:border-primary"
            >
              <option value="PERCENTAGE">%</option>
              <option value="FIXED">Fixed</option>
            </select>
          </div>
          <button
            onClick={handleAdd}
            disabled={!form.name.trim() || adding}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
              form.name.trim()
                ? 'bg-primary text-white hover:bg-primary-hover'
                : 'bg-terminal-surface text-text-muted cursor-not-allowed',
              adding && 'opacity-60',
            )}
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>
      </div>

      {/* Destinations table */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center gap-2.5">
            <div className="card-icon"><MapPin className="w-4 h-4" /></div>
            <h2 className="font-semibold text-[15px]">Destinations</h2>
          </div>
          <span className="text-xs text-text-muted">{destinations.length} destinations</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-terminal-border">
                <th className="table-header text-left px-5 py-3">Name</th>
                <th className="table-header text-center px-4 py-3">Commission</th>
                <th className="table-header text-center px-4 py-3">Type</th>
                <th className="table-header text-center px-4 py-3 w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {destinations.map((dest) => (
                <tr key={dest.id} className="border-b border-terminal-border/40 hover:bg-terminal-surface/40 transition-colors">
                  {editingId === dest.id ? (
                    <>
                      <td className="px-5 py-3">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-full bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                          autoFocus
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editForm.commission}
                          onChange={(e) => setEditForm((f) => ({ ...f, commission: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') cancelEdit(); }}
                          className="w-20 bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-sm font-mono text-text-primary text-right outline-none focus:border-primary mx-auto"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <select
                            value={editForm.commissionType}
                            onChange={(e) => setEditForm((f) => ({ ...f, commissionType: e.target.value as CommissionType }))}
                            className="bg-terminal-surface-2 border border-terminal-border rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-primary"
                          >
                            <option value="PERCENTAGE">%</option>
                            <option value="FIXED">Fixed</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={handleUpdate}
                            disabled={saving || !editForm.name.trim()}
                            className="p-1.5 rounded bg-status-green/20 text-status-green hover:bg-status-green/30 transition-colors"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded bg-terminal-surface text-text-muted hover:text-text-primary transition-colors"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-text-primary text-[13px]">{dest.name}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-mono text-sm text-text-primary">{commLabel(dest)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs text-text-muted">
                          {dest.commissionType === 'PERCENTAGE' ? 'Percentage' : `Fixed (${dest.fixedUnit.toLowerCase()})`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => startEdit(dest)}
                            className="p-1.5 rounded text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(dest.id)}
                            disabled={deletingId === dest.id}
                            className="p-1.5 rounded text-text-muted hover:text-status-red hover:bg-status-red/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {destinations.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-text-muted text-sm">
                    No destinations configured yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
