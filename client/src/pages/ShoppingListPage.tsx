import { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

interface ShoppingItem {
  id: string;
  name: string;
  quantity?: string;
  completed: boolean;
}

interface ShoppingList {
  id: string;
  name: string;
  category?: string;
  items: ShoppingItem[];
}

export default function ShoppingListPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [error, setError] = useState('');

  // Add item form
  const [newItem, setNewItem] = useState('');
  const [newQty, setNewQty] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);

  // New list form (FAMILY only)
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  useEffect(() => {
    fetchLists();
  }, []);

  async function fetchLists() {
    setLoading(true);
    try {
      const { data } = await api.get<ShoppingList[]>('/shopping');
      setLists(data);
      if (data.length > 0) setActiveListId(data[0].id);
      setBackendAvailable(true);
    } catch (err: any) {
      if (err.response?.status === 404 || err.code === 'ERR_NETWORK') {
        // Backend routes not yet implemented
        setBackendAvailable(false);
        // Seed with a local default list so the UI is usable
        const defaultList: ShoppingList = {
          id: 'local-default',
          name: 'Shopping List',
          items: [],
        };
        setLists([defaultList]);
        setActiveListId('local-default');
      } else {
        setError('Failed to load shopping lists.');
      }
    } finally {
      setLoading(false);
    }
  }

  const activeList = lists.find(l => l.id === activeListId) ?? null;

  async function toggleItem(listId: string, itemId: string, completed: boolean) {
    if (!backendAvailable) {
      // Local state toggle
      setLists(prev => prev.map(l =>
        l.id === listId
          ? { ...l, items: l.items.map(i => i.id === itemId ? { ...i, completed: !completed } : i) }
          : l
      ));
      return;
    }
    try {
      const { data } = await api.patch<ShoppingItem>(`/shopping/items/${itemId}`, { completed: !completed });
      setLists(prev => prev.map(l =>
        l.id === listId
          ? { ...l, items: l.items.map(i => i.id === itemId ? data : i) }
          : l
      ));
    } catch {
      setError('Failed to update item.');
    }
  }

  async function addItem(e: React.FormEvent, listId: string) {
    e.preventDefault();
    if (!newItem.trim()) return;
    setAddingItem(true);

    if (!backendAvailable) {
      const fakeItem: ShoppingItem = {
        id: `local-${Date.now()}`,
        name: newItem.trim(),
        quantity: newQty.trim() || undefined,
        completed: false,
      };
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, items: [...l.items, fakeItem] } : l
      ));
      setNewItem('');
      setNewQty('');
      setAddingItem(false);
      return;
    }

    try {
      const { data } = await api.post<ShoppingItem>(`/shopping/${listId}/items`, {
        name: newItem.trim(),
        quantity: newQty.trim() || undefined,
      });
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, items: [...l.items, data] } : l
      ));
      setNewItem('');
      setNewQty('');
    } catch {
      setError('Failed to add item.');
    } finally {
      setAddingItem(false);
    }
  }

  async function deleteItem(listId: string, itemId: string) {
    if (itemId.startsWith('local-')) {
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, items: l.items.filter(i => i.id !== itemId) } : l
      ));
      return;
    }
    try {
      await api.delete(`/shopping/items/${itemId}`);
      setLists(prev => prev.map(l =>
        l.id === listId ? { ...l, items: l.items.filter(i => i.id !== itemId) } : l
      ));
    } catch {
      setError('Failed to delete item.');
    }
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreatingList(true);

    if (!backendAvailable) {
      const fakeList: ShoppingList = {
        id: `local-${Date.now()}`,
        name: newListName.trim(),
        items: [],
      };
      setLists(prev => [...prev, fakeList]);
      setActiveListId(fakeList.id);
      setNewListName('');
      setShowNewList(false);
      setCreatingList(false);
      return;
    }

    try {
      const { data } = await api.post<ShoppingList>('/shopping', { name: newListName.trim() });
      setLists(prev => [...prev, { ...data, items: [] }]);
      setActiveListId(data.id);
      setNewListName('');
      setShowNewList(false);
    } catch {
      setError('Failed to create list.');
    } finally {
      setCreatingList(false);
    }
  }

  const pendingCount = activeList?.items.filter(i => !i.completed).length ?? 0;
  const totalCount = activeList?.items.length ?? 0;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Shopping List</h2>
          <p style={styles.subtitle}>Shared list for the household</p>
        </div>
        {user?.role === 'FAMILY' && (
          <button style={styles.btn} onClick={() => setShowNewList(!showNewList)}>
            {showNewList ? '✕ Cancel' : '+ New List'}
          </button>
        )}
      </div>

      {!backendAvailable && (
        <div style={styles.infoBanner}>
          ℹ️ Shopping list backend routes are coming soon. Items are saved locally for now.
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {/* New list form */}
      {showNewList && (
        <form onSubmit={createList} style={styles.newListForm}>
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="List name (e.g. Weekly Groceries)"
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            required
            autoFocus
          />
          <button type="submit" style={styles.btn} disabled={creatingList}>
            {creatingList ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {/* List tabs */}
      {lists.length > 1 && (
        <div style={styles.tabs}>
          {lists.map(l => (
            <button
              key={l.id}
              style={{ ...styles.tab, ...(l.id === activeListId ? styles.tabActive : {}) }}
              onClick={() => setActiveListId(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={styles.emptyState}>Loading...</div>
      ) : activeList ? (
        <div style={styles.listCard}>
          {/* List header */}
          <div style={styles.listHeader}>
            <span style={styles.listName}>{activeList.name}</span>
            {totalCount > 0 && (
              <span style={styles.countBadge}>
                {pendingCount} remaining
              </span>
            )}
          </div>

          {/* Add item form */}
          <form onSubmit={e => addItem(e, activeList.id)} style={styles.addItemForm}>
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Add item…"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
            />
            <input
              style={{ ...styles.input, width: '80px' }}
              placeholder="Qty"
              value={newQty}
              onChange={e => setNewQty(e.target.value)}
            />
            <button type="submit" style={styles.addItemBtn} disabled={addingItem || !newItem.trim()}>
              Add
            </button>
          </form>

          {/* Items */}
          {activeList.items.length === 0 ? (
            <div style={styles.emptyItems}>
              Nothing on the list yet. Add something above!
            </div>
          ) : (
            <ul style={styles.itemList}>
              {/* Pending items first */}
              {[...activeList.items]
                .sort((a, b) => {
                  if (a.completed !== b.completed) return a.completed ? 1 : -1;
                  return 0;
                })
                .map(item => (
                  <li key={item.id} style={styles.itemRow}>
                    <button
                      style={{
                        ...styles.checkbox,
                        ...(item.completed ? styles.checkboxDone : {}),
                      }}
                      onClick={() => toggleItem(activeList.id, item.id, item.completed)}
                      title={item.completed ? 'Mark as needed' : 'Mark as got it'}
                    >
                      {item.completed && '✓'}
                    </button>
                    <span style={{
                      ...styles.itemName,
                      ...(item.completed ? styles.itemNameDone : {}),
                    }}>
                      {item.name}
                      {item.quantity && (
                        <span style={styles.itemQty}> × {item.quantity}</span>
                      )}
                    </span>
                    <button
                      style={styles.removeBtn}
                      onClick={() => deleteItem(activeList.id, item.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {/* Clear completed */}
          {activeList.items.some(i => i.completed) && (
            <button
              style={styles.clearBtn}
              onClick={() => {
                activeList.items
                  .filter(i => i.completed)
                  .forEach(i => deleteItem(activeList.id, i.id));
              }}
            >
              Clear completed items
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
  },
  pageTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 0.25rem',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: 0,
  },
  btn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  infoBanner: {
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  newListForm: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  input: {
    padding: '0.6rem 0.8rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    flexWrap: 'wrap',
  },
  tab: {
    padding: '0.4rem 0.85rem',
    borderRadius: '99px',
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
  },
  tabActive: {
    background: '#2563eb',
    color: '#fff',
    border: '1px solid #2563eb',
  },
  listCard: {
    background: '#fff',
    borderRadius: '14px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.25rem 0.75rem',
    borderBottom: '1px solid #f3f4f6',
  },
  listName: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#111827',
  },
  countBadge: {
    background: '#f3f4f6',
    color: '#6b7280',
    borderRadius: '99px',
    padding: '2px 10px',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  addItemForm: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem 1.25rem',
    borderBottom: '1px solid #f3f4f6',
    alignItems: 'center',
  },
  addItemBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  emptyItems: {
    textAlign: 'center',
    padding: '2.5rem 1rem',
    color: '#9ca3af',
    fontSize: '0.9rem',
  },
  itemList: {
    listStyle: 'none',
    margin: 0,
    padding: '0.5rem 0',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.65rem 1.25rem',
    borderBottom: '1px solid #f9fafb',
  },
  checkbox: {
    width: '28px',
    height: '28px',
    minWidth: '28px',
    borderRadius: '6px',
    border: '2px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    color: '#fff',
    fontWeight: 700,
  },
  checkboxDone: {
    background: '#16a34a',
    borderColor: '#16a34a',
  },
  itemName: {
    flex: 1,
    fontSize: '0.95rem',
    color: '#111827',
  },
  itemNameDone: {
    textDecoration: 'line-through',
    color: '#9ca3af',
  },
  itemQty: {
    color: '#6b7280',
    fontSize: '0.85rem',
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#d1d5db',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '2px',
    lineHeight: 1,
  },
  clearBtn: {
    display: 'block',
    width: '100%',
    background: 'none',
    border: 'none',
    borderTop: '1px solid #f3f4f6',
    color: '#9ca3af',
    cursor: 'pointer',
    padding: '0.75rem',
    fontSize: '0.85rem',
    textAlign: 'center',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 2rem',
    background: '#fff',
    borderRadius: '12px',
    color: '#6b7280',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
};
