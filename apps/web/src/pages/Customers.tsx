import { useState, useCallback, useEffect, memo, useRef } from 'react';
import {
  Search,
  Download,
  UserPlus,
  X,
  Users,
  Star,
  Phone,
  Mail,
  AlertCircle,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn, getInitials } from '@/lib/utils';
import { TableRowSkeleton } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { customersApi } from '@/lib/api';
import type { Customer } from '@exchange/shared';

// ─── Constants ──────────────────────────────────────────────
const AVATAR_COLORS = [
  'bg-teal-700', 'bg-slate-600', 'bg-blue-700', 'bg-rose-700',
  'bg-indigo-600', 'bg-amber-700', 'bg-emerald-700', 'bg-purple-700',
  'bg-cyan-700', 'bg-pink-700',
];

// ─── Helpers ────────────────────────────────────────────────
function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function StarRating({ level, size = 'sm' }: { level: number; size?: 'sm' | 'lg' }) {
  const px = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(px, i <= level ? 'text-amber-400 fill-amber-400' : 'text-terminal-border')}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════
export function CustomersPage() {
  const toast = useToast();

  // ─── Data state ────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // ─── Filter state ──────────────────────────────────────
  const [search, setSearch] = useState('');

  // ─── Drawer state ─────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ─── Stats from API ──────────────────────────────────
  const [stats, setStats] = useState({ total: 0, avgLevel: 3 });

  // ─── Add Customer modal state ─────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '', email: '', level: 3 });
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [addSubmitting, setAddSubmitting] = useState(false);

  // ─── Edit Customer modal state ───────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', level: 3 });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // ─── Delete confirm state ───────────────────────────
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // ─── Upload Excel state ─────────────────────────────
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // ─── Fetch customers ─────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();

      const res = await customersApi.list(params);
      const items = (res.items as Record<string, unknown>[]).map((c) => ({
        ...c,
        createdAt: String(c.createdAt),
        updatedAt: String(c.updatedAt),
      })) as Customer[];
      setCustomers(items);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const refreshStats = useCallback(() => {
    customersApi.getStats().then(setStats).catch(console.error);
  }, []);

  useEffect(() => { refreshStats(); }, [refreshStats]);

  // ─── Add customer handler ──────────────────────────────
  const handleAddCustomer = useCallback(async () => {
    const errs: Record<string, string> = {};
    if (!addForm.name.trim()) errs.name = 'Name is required';
    if (addForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addForm.email)) errs.email = 'Invalid email';
    setAddErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setAddSubmitting(true);
    try {
      await customersApi.create({
        name: addForm.name.trim(),
        phone: addForm.phone.trim() || undefined,
        email: addForm.email.trim() || undefined,
        level: addForm.level,
      });
      toast('success', `Customer "${addForm.name.trim()}" added successfully`);
      setShowAddModal(false);
      setAddForm({ name: '', phone: '', email: '', level: 3 });
      setAddErrors({});
      fetchCustomers();
      refreshStats();
    } catch (err) {
      console.error('Failed to create customer:', err);
      toast('error', 'Failed to create customer');
    } finally {
      setAddSubmitting(false);
    }
  }, [addForm, toast, fetchCustomers, refreshStats]);

  // ─── Edit customer ────────────────────────────────────
  const openEditModal = useCallback((customer: Customer) => {
    setEditForm({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      level: customer.level,
    });
    setEditErrors({});
    setShowEditModal(true);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedId) return;
    const errs: Record<string, string> = {};
    if (!editForm.name.trim()) errs.name = 'Name is required';
    if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email)) errs.email = 'Invalid email';
    setEditErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setEditSubmitting(true);
    try {
      await customersApi.update(selectedId, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        level: editForm.level,
      });
      toast('success', `Customer "${editForm.name.trim()}" updated`);
      setShowEditModal(false);
      fetchCustomers();
      refreshStats();
    } catch (err) {
      console.error('Failed to update customer:', err);
      toast('error', 'Failed to update customer');
    } finally {
      setEditSubmitting(false);
    }
  }, [selectedId, editForm, toast, fetchCustomers, refreshStats]);

  // ─── Delete customer ──────────────────────────────────
  const handleDeleteCustomer = useCallback(async (id: string) => {
    setDeleteSubmitting(true);
    try {
      await customersApi.delete(id);
      toast('success', 'Customer deleted');
      setDeleteConfirmId(null);
      if (selectedId === id) setSelectedId(null);
      fetchCustomers();
      refreshStats();
    } catch (err) {
      console.error('Failed to delete customer:', err);
      toast('error', 'Failed to delete customer');
    } finally {
      setDeleteSubmitting(false);
    }
  }, [selectedId, toast, fetchCustomers, refreshStats]);

  // ─── Upload Excel ─────────────────────────────────────
  const handleUploadExcel = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const valid = /\.(xlsx|xls)$/i.test(file.name);
    if (!valid) {
      toast('error', 'Please select an Excel file (.xlsx or .xls)');
      return;
    }
    setUploadSubmitting(true);
    try {
      const result = await customersApi.uploadExcel(file);
      const msg = result.errors?.length
        ? `Uploaded ${result.created} customer(s). ${result.errors.length} row(s) had errors.`
        : `${result.created} customer(s) uploaded successfully.`;
      toast(result.created > 0 ? 'success' : 'error', msg);
      if (result.created > 0) {
        fetchCustomers();
        refreshStats();
      }
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadSubmitting(false);
    }
  }, [toast, fetchCustomers, refreshStats]);

  // ─── Derived data ──────────────────────────────────────
  const selected = customers.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex gap-0 h-full -m-6">
      {/* ═══ Main list panel ══════════════════════════════ */}
      <div className={cn('flex-1 flex flex-col p-6 transition-all min-w-0', selected ? 'pr-0' : '')}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">Customer Directory</h1>
              <span className="flex items-center gap-1.5 text-xs text-text-muted">
                <span className="w-2 h-2 rounded-full bg-status-green animate-pulse-slow" /> Live Database
              </span>
            </div>
            <p className="text-text-muted text-sm mt-0.5">{customers.length} customer{customers.length !== 1 ? 's' : ''} found</p>
          </div>
          <button
            onClick={() => { setShowAddModal(true); setAddForm({ name: '', phone: '', email: '', level: 3 }); setAddErrors({}); }}
            className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5" /> Add New Customer
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <KpiCard
            icon={<Users className="w-4 h-4" />}
            label="Total Customers"
            value={stats.total.toLocaleString()}
            sub={<span className="text-text-muted">Active in system</span>}
          />
          <KpiCard
            icon={<Star className="w-4 h-4" />}
            label="Average Level"
            value={stats.avgLevel.toFixed(1)}
            sub={<StarRating level={Math.round(stats.avgLevel)} />}
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-terminal-card border border-terminal-border rounded-lg px-3 py-2 flex-1 focus-within:border-primary transition-colors">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, phone, or email..."
              aria-label="Search customers"
              className="bg-transparent text-sm text-text-primary outline-none flex-1 placeholder-text-muted"
            />
          </div>

          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleUploadExcel}
            aria-label="Upload Excel file"
          />
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploadSubmitting}
            className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadSubmitting ? 'Uploading...' : 'Upload by Excel'}
          </button>
          <button
            type="button"
            onClick={() => customersApi.downloadTemplate().catch((err) => toast('error', err instanceof Error ? err.message : 'Download failed'))}
            className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5"
            title="Download Excel template with required columns"
          >
            <Download className="w-3.5 h-3.5" /> Download template
          </button>
          <button className="btn-outline text-xs py-2 px-3 flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        {/* Table */}
        <div className="card flex-1 flex flex-col min-h-0">
          <div className="overflow-x-auto flex-1">
            <table className="w-full">
              <thead>
                <tr className="border-b border-terminal-border">
                  <th className="table-header text-left px-5 py-2.5">Customer</th>
                  <th className="table-header text-left px-4 py-2.5">Phone</th>
                  <th className="table-header text-left px-4 py-2.5">Email</th>
                  <th className="table-header text-center px-4 py-2.5">Level</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRowSkeleton key={i} cols={4} />
                  ))
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-text-muted">
                      No customers match your search.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(c.id); } }}
                      tabIndex={0}
                      role="button"
                      aria-label={`View ${c.name}`}
                      className={cn(
                        'border-b border-terminal-border/40 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary/50',
                        selectedId === c.id
                          ? 'bg-primary/10 border-l-2 border-l-primary'
                          : 'hover:bg-terminal-surface/40',
                      )}
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0',
                            hashColor(c.name),
                          )}>
                            {getInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-text-primary truncate">{c.name}</div>
                            <div className="text-xxs text-text-muted">#{c.customerId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {c.phone ?? <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {c.email ?? <span className="text-text-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <StarRating level={c.level} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-terminal-border">
            <span className="text-xs text-text-muted">
              Showing <strong className="text-text-primary">{customers.length}</strong> customer{customers.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ Add Customer Modal ═══════════════════════════ */}
      {showAddModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowAddModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-terminal-card border border-terminal-border rounded-xl shadow-terminal-lg w-full max-w-md pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-terminal-border">
                <h2 className="font-semibold text-[15px]">Add New Customer</h2>
                <button onClick={() => setShowAddModal(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Name */}
                <div>
                  <label className="table-header block mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={(e) => { setAddForm((f) => ({ ...f, name: e.target.value })); setAddErrors((er) => ({ ...er, name: '' })); }}
                    placeholder="e.g. John Doe"
                    className={cn(
                      'w-full bg-terminal-bg border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted',
                      addErrors.name ? 'border-status-red' : 'border-terminal-border focus:border-primary',
                    )}
                  />
                  {addErrors.name && (
                    <p className="text-status-red text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {addErrors.name}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label className="table-header block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="tel"
                      value={addForm.phone}
                      onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+1 555 123 4567"
                      className="w-full bg-terminal-bg border border-terminal-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary transition-colors placeholder:text-text-muted"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="table-header block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="email"
                      value={addForm.email}
                      onChange={(e) => { setAddForm((f) => ({ ...f, email: e.target.value })); setAddErrors((er) => ({ ...er, email: '' })); }}
                      placeholder="john@example.com"
                      className={cn(
                        'w-full bg-terminal-bg border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted',
                        addErrors.email ? 'border-status-red' : 'border-terminal-border focus:border-primary',
                      )}
                    />
                  </div>
                  {addErrors.email && (
                    <p className="text-status-red text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {addErrors.email}
                    </p>
                  )}
                </div>

                {/* Level */}
                <div>
                  <label className="table-header block mb-1.5">Level</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setAddForm((f) => ({ ...f, level: i }))}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star className={cn('w-6 h-6', i <= addForm.level ? 'text-amber-400 fill-amber-400' : 'text-terminal-border')} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-5 border-t border-terminal-border">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="btn-outline text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddCustomer}
                  disabled={addSubmitting}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {addSubmitting ? 'Adding...' : 'Add Customer'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Edit Customer Modal ═══════════════════════════ */}
      {showEditModal && selected && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowEditModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-terminal-card border border-terminal-border rounded-xl shadow-terminal-lg w-full max-w-md pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-terminal-border">
                <h2 className="font-semibold text-[15px]">Edit Customer</h2>
                <button onClick={() => setShowEditModal(false)} className="text-text-muted hover:text-text-primary transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="table-header block mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => { setEditForm((f) => ({ ...f, name: e.target.value })); setEditErrors((er) => ({ ...er, name: '' })); }}
                    placeholder="e.g. John Doe"
                    className={cn(
                      'w-full bg-terminal-bg border rounded-lg px-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted',
                      editErrors.name ? 'border-status-red' : 'border-terminal-border focus:border-primary',
                    )}
                  />
                  {editErrors.name && (
                    <p className="text-status-red text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {editErrors.name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="table-header block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="+1 555 123 4567"
                      className="w-full bg-terminal-bg border border-terminal-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary transition-colors placeholder:text-text-muted"
                    />
                  </div>
                </div>
                <div>
                  <label className="table-header block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => { setEditForm((f) => ({ ...f, email: e.target.value })); setEditErrors((er) => ({ ...er, email: '' })); }}
                      placeholder="john@example.com"
                      className={cn(
                        'w-full bg-terminal-bg border rounded-lg pl-9 pr-3 py-2.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted',
                        editErrors.email ? 'border-status-red' : 'border-terminal-border focus:border-primary',
                      )}
                    />
                  </div>
                  {editErrors.email && (
                    <p className="text-status-red text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {editErrors.email}
                    </p>
                  )}
                </div>
                <div>
                  <label className="table-header block mb-1.5">Level</label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setEditForm((f) => ({ ...f, level: i }))}
                        className="p-0.5 transition-transform hover:scale-110"
                      >
                        <Star className={cn('w-6 h-6', i <= editForm.level ? 'text-amber-400 fill-amber-400' : 'text-terminal-border')} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 p-5 border-t border-terminal-border">
                <button onClick={() => setShowEditModal(false)} className="btn-outline text-xs py-2 px-4">Cancel</button>
                <button onClick={handleSaveEdit} disabled={editSubmitting} className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> {editSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Detail drawer ═══════════════════════════════ */}
      {selected && (
        <div className="w-[380px] min-w-[380px] bg-terminal-card border-l border-terminal-border h-full overflow-y-auto animate-slide-in-right" role="complementary" aria-label="Customer details">
          <div className="p-6 space-y-6">
            {/* Close */}
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-[15px]">Customer Details</h2>
              <button
                onClick={() => setSelectedId(null)}
                className="text-text-muted hover:text-text-primary transition-colors"
                aria-label="Close customer details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Avatar + Identity */}
            <div className="flex flex-col items-center text-center">
              <div className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3',
                hashColor(selected.name),
              )}>
                {getInitials(selected.name)}
              </div>
              <h3 className="text-lg font-bold">{selected.name}</h3>
              <div className="text-xs text-text-muted mt-0.5">
                #{selected.customerId}
              </div>
              <div className="mt-2">
                <StarRating level={selected.level} size="lg" />
              </div>
            </div>

            {/* Contact Info */}
            <div>
              <span className="table-header block mb-3">Contact Information</span>
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-terminal-surface rounded-lg px-4 py-3">
                  <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xxs text-text-muted">Phone</div>
                    <div className="text-sm text-text-primary font-mono">
                      {selected.phone ?? <span className="text-text-muted italic">Not provided</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-terminal-surface rounded-lg px-4 py-3">
                  <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xxs text-text-muted">Email</div>
                    <div className="text-sm text-text-primary">
                      {selected.email ?? <span className="text-text-muted italic">Not provided</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Member Since */}
            <div className="bg-terminal-surface rounded-lg px-4 py-3">
              <div className="text-xxs text-text-muted mb-0.5">Member Since</div>
              <div className="text-sm text-text-primary">
                {new Date(selected.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-2">
              {deleteConfirmId === selected.id ? (
                <div className="flex items-center justify-between gap-3 p-3 bg-terminal-surface rounded-lg border border-terminal-border">
                  <span className="text-sm text-text-secondary">Delete this customer?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="btn-outline text-xs py-1.5 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteCustomer(selected.id)}
                      disabled={deleteSubmitting}
                      className="text-xs py-1.5 px-3 rounded bg-status-red/20 text-status-red hover:bg-status-red/30 border border-status-red/50"
                    >
                      {deleteSubmitting ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => openEditModal(selected)}
                    className="btn-outline w-full text-xs py-2 px-4 flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit Customer
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(selected.id)}
                    className="w-full text-xs py-2 px-4 flex items-center justify-center gap-1.5 rounded-lg border border-terminal-border bg-transparent text-status-red hover:bg-status-red/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Customer
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────

const KpiCard = memo(function KpiCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          {icon}
        </div>
        <span className="table-header">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{sub}</div>
    </div>
  );
});
